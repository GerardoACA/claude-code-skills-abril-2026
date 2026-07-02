# BLUEPRINT addendum — Incremento 15 (Override firmado de alertas — decisión C11)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (sin any; Next 16). **CAMBIA EL SCHEMA** (1 modelo) → migración.
> Fundamento: decisión C11 del cliente (override = e.firma + motivo) y hallazgo crítico del
> panel penalista ("overrides sin motivación firmada regalan el dolo a la Fiscalía"). C9: el
> sistema alerta, el RESPONSABLE decide; el override documenta esa decisión humana.

## Objetivo
Cuando un cliente tiene una verificación adversa (ALERTA / INHABILITADO_*), el responsable puede
registrar un OVERRIDE: "decido continuar operando con este cliente, por este MOTIVO". El acto
queda: motivado (texto obligatorio), atribuido (actor del JWT), sellado (sha256 canónico),
encadenado en bitácora, e idealmente FIRMADO con e.firma (conector FirmadorEfirma enchufable;
hoy NoOp honesto = "pendiente de firma electrónica", la firma real llega con la integración de
APIs del cliente). El override NO borra ni altera la alerta: la acompaña.

## Modelo nuevo (Agente MODELO-15)
```prisma
enum EstadoFirmaOverride { SIN_FIRMA FIRMADO }

model OverrideAlerta {
  id             String   @id @default(cuid())
  tenantId       String   @map("tenant_id")
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  clienteId      String   @map("cliente_id")
  cliente        Cliente  @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  fuente         FuenteVerificacion
  /// Resultado adverso que se decide sobrellevar (copia legible, p. ej. "INHABILITADO_PRESUNTO").
  resultado      String
  /// Motivación OBLIGATORIA del responsable (mínimo 20 caracteres).
  motivo         String
  actor          String
  /// SHA-256 del payload canónico del acto (cliente, fuente, resultado, motivo, actor, ts).
  sha256         String   @db.Char(64)
  estadoFirma    EstadoFirmaOverride @default(SIN_FIRMA) @map("estado_firma")
  /// Sello/serial del certificado cuando se firme con e.firma real (conector futuro).
  firmaDetalle   String?  @map("firma_detalle")
  creadoEn       DateTime @default(now()) @map("creado_en")

  @@index([tenantId, clienteId, fuente])
  @@map("override_alerta")
}
```
+ inversas `overrides OverrideAlerta[]` en Tenant y Cliente. Nada más.

## Reparto

**Agente MODELO-15:**
1. prisma/schema.prisma — enum + modelo EXACTOS + inversas.
2. src/lib/firmador-efirma.ts — conector patrón TimbradorPac: interfaz
   `FirmadorEfirma { firmar(input: { payloadCanonico: string; sha256: string; actor: string }): Promise<ResultadoFirma> }`
   con `ResultadoFirma { ok: boolean; estado: "SIN_FIRMA" | "FIRMADO"; detalle: string; serialCertificado?: string }`;
   `FirmadorNoOp` (default): "Firma e.firma no configurada; el override queda motivado, sellado y
   atribuido (SIN_FIRMA). La firma FIEL del lado del titular se integrará con las APIs del
   cliente." Factoría obtenerFirmador() (env EFIRMA_PROVIDER; hoy NoOp). Documenta que la clave
   privada NUNCA se almacena (decisión C14): la firma real será del lado del titular.

**Agente UI-15:**
1. src/app/api/clientes/[id]/override/route.ts — POST: tenantId del JWT; zod { fuente (enum),
   resultado (string), motivo (min 20 chars) }; dentro de withTenantFromSession: verifica cliente
   del tenant, arma payload canónico + sha256, llama obtenerFirmador().firmar(...), crea
   OverrideAlerta (estadoFirma según resultado del conector) + evento BitacoraAuditoria
   "OVERRIDE_ALERTA" (clienteId en payloadRef, hashPrev encadenado, actor). GET lista overrides
   del cliente. params async.
2. src/components/OverrideForm.tsx — client: visible junto a resultados adversos; textarea de
   motivo (mín 20 chars con contador), aviso legal breve ("este acto queda sellado, atribuido y
   auditable; la responsabilidad de continuar es del responsable — C9/C11"), postea al route.
3. src/app/clientes/[id]/cumplimiento/page.tsx — AJUSTE ACOTADO: bajo la tabla de fuentes,
   sección "Overrides registrados" (lista: fecha, fuente, resultado, motivo, actor, estadoFirma
   con nota honesta si SIN_FIRMA) y monta OverrideForm cuando exista al menos un resultado
   adverso reciente (ALERTA/INHABILITADO_*). No reestructures el resto.

## Coordinación
- Solo MODELO-15 toca schema y el conector. UI-15 asume las formas EXACTAS del blueprint.
- El override NUNCA modifica VerificacionCumplimiento ni Alerta69b: es un acto ADICIONAL.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (migración)
- Local: migrate dev --name override_alerta + re-aplicar 02 y 01 (tabla tenant-scoped → policy).
- Neon: migrate deploy + re-GRANT + 01.
- Verificación: cliente con resultado adverso (el RFC real del 69-B ya registrado sirve) →
  registrar override con motivo → aparece en la lista (SIN_FIRMA con nota honesta) + evento
  OVERRIDE_ALERTA en bitácora; intentar override con motivo de 5 caracteres → 400.
