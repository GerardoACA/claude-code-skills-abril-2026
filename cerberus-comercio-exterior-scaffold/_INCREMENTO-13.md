# BLUEPRINT addendum — Incremento 13 (CFDI + Carta Porte 3.1 con TimbradorPac conectable)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (sin any; Next 16). **CAMBIA EL SCHEMA** → migración local + Neon.
> Contexto normativo: reporte §1 (Carta Porte 3.1 obligatoria desde 17-jul-2024; multas hasta
> ~$97,330/documento; validaciones: claves prod/serv, códigos postales, placas). Decisión C8 del
> cliente: la CANCELACIÓN (motivos 01-04) se modela desde el inicio. El cliente YA tiene PAC:
> aquí se construye el CONECTOR (patrón SelladorCalificado NoOp/real); la conexión real es posterior.

## Objetivo
Capturar y validar un CFDI de Traslado con complemento Carta Porte 3.1 por operación, sellarlo
(borrador probatorio), y dejar el flujo de timbrado/cancelación listo detrás del conector
TimbradorPac (NoOp hoy → PAC real después).

## Modelo nuevo (Agente MODELO-13)
```prisma
enum TipoComprobante { INGRESO TRASLADO }
enum EstadoCfdi { BORRADOR TIMBRADO CANCELADO SUSTITUIDO }
enum TipoComplemento { NINGUNO CARTA_PORTE_31 COMERCIO_EXT_11 }
enum MotivoCancelacion { M01 M02 M03 M04 }   // 01..04 del estándar CFDI 4.0

model ComprobanteCfdi {
  id            String          @id @default(cuid())
  tenantId      String          @map("tenant_id")
  tenant        Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  operacionId   String          @map("operacion_id")
  operacion     Operacion       @relation(fields: [operacionId], references: [id], onDelete: Cascade)
  tipo          TipoComprobante
  complemento   TipoComplemento @default(NINGUNO)
  estado        EstadoCfdi      @default(BORRADOR)
  emisorRfc     String          @map("emisor_rfc")
  receptorRfc   String          @map("receptor_rfc")
  /// Datos capturados (incluido el complemento) como JSON canónico (string).
  payload       String
  sha256        String          @db.Char(64)
  uuid          String?         // folio fiscal al timbrar (lo pondrá el PAC real)
  motivoCancelacion MotivoCancelacion? @map("motivo_cancelacion")
  sustituyeUuid String?         @map("sustituye_uuid")   // para motivo 01
  detallePac    String?         @map("detalle_pac")      // respuesta/estado del conector
  creadoEn      DateTime        @default(now()) @map("creado_en")
  actualizadoEn DateTime        @updatedAt @map("actualizado_en")

  @@index([tenantId, operacionId])
  @@index([tenantId, estado])
  @@map("comprobante_cfdi")
}
```
+ relaciones inversas `comprobantes ComprobanteCfdi[]` en Tenant y Operacion. Nada más.

## Reparto

**Agente MODELO-13 (schema + validaciones + conector):**
1. prisma/schema.prisma — el modelo/enums de arriba EXACTOS + inversas.
2. src/lib/carta-porte.ts — tipos del complemento Carta Porte 3.1 (subset pragmático:
   origen { codigoPostal, fechaSalida }, destino { codigoPostal, fechaLlegada, distanciaKm },
   autotransporte { placaVm, configVehicular, aseguradora?, polizaSeguro?, caat? },
   figuraTransporte { rfcOperador, nombreOperador, licencia? },
   mercancias: [{ claveProdServ, descripcion, cantidad, claveUnidad, pesoKg }]) y
   `validarCartaPorte(cp): ErrorValidacion[]` con las validaciones del reporte §1:
   CP de 5 dígitos, placa formato oficial (alfanumérico 5-7 sin guiones normalizado),
   claveProdServ 8 dígitos, claveUnidad no vacía, pesos/cantidades > 0, fechas coherentes
   (llegada > salida), RFC formato. Exporta tipos y `canonicalizarCartaPorte` (JSON canónico).
3. src/lib/timbrador-pac.ts — interfaz `TimbradorPac { timbrar(input): Promise<ResultadoTimbrado>;
   cancelar(input): Promise<ResultadoCancelacion> }` con tipos claros; implementación
   `TimbradorNoOp` (default): timbrar → { ok: false, estado: "SIN_PAC", detalle: "Conector PAC no
   configurado; el comprobante queda en BORRADOR sellado" }; cancelar → análogo. Factoría
   `obtenerTimbrador()` que hoy devuelve NoOp y documenta dónde se enchufará el PAC real del
   cliente (env PAC_PROVIDER). Patrón idéntico a SelladorCalificado.

**Agente UI-13 (captura + rutas):**
1. src/app/operaciones/[id]/cfdi/page.tsx — Server Component (sesión+redirect): lista los
   ComprobanteCfdi de la operación (tipo, complemento, estado, uuid, sha corto) y monta el form.
   params async.
2. src/components/CfdiCartaPorteForm.tsx — client: captura de CFDI de TRASLADO con complemento
   CARTA_PORTE_31 (emisorRfc, receptorRfc + los campos del complemento del lib); muestra errores
   de validación devueltos por el route; postea a /api/operaciones/[id]/cfdi.
3. src/app/api/operaciones/[id]/cfdi/route.ts — POST: tenantId del JWT; valida con
   validarCartaPorte (400 con la lista de errores si falla); dentro de withTenantFromSession
   crea ComprobanteCfdi (payload = JSON canónico, sha256 del payload, estado BORRADOR) + evento
   BitacoraAuditoria "CFDI_BORRADOR" (operacionId, hashPrev encadenado, patrón existente).
   GET lista. params async.
4. src/app/api/operaciones/[id]/cfdi/[cfdiId]/timbrar/route.ts — POST: llama
   obtenerTimbrador().timbrar(...); con NoOp actualiza detallePac y deja BORRADOR; si (futuro)
   ok, pondría estado TIMBRADO + uuid. Registra evento bitácora "CFDI_TIMBRAR_INTENTO".
5. src/app/api/operaciones/[id]/cfdi/[cfdiId]/cancelar/route.ts — POST { motivo: "M01".."M04",
   sustituyeUuid? (obligatorio si M01) }: valida con zod; solo aplica sobre TIMBRADO (hoy con
   NoOp responderá que no hay timbrado que cancelar; el flujo queda modelado — decisión C8);
   evento bitácora "CFDI_CANCELAR_INTENTO".
6. src/app/operaciones/[id]/page.tsx — SOLO añade UN enlace "CFDI / Carta Porte →" (una línea,
   respeta los existentes).

## Coordinación
- Solo MODELO-13 toca schema.prisma, carta-porte.ts y timbrador-pac.ts. UI-13 asume sus formas
  EXACTAS de este blueprint.
- C9: validaciones ALERTAN con lista de errores; guardar borrador con errores NO está permitido
  (integridad del documento), pero nada bloquea la operación en sí.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (migración)
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name comprobante_cfdi` + re-aplicar
  02-app-role.sql y 01-enable-rls-policies.sql (la tabla nueva ES tenant-scoped → recibirá policy).
- Neon: `migrate deploy` + re-GRANT + 01.
- Verificación: en una operación → "CFDI / Carta Porte": capturar un traslado con CP/placas
  inválidos → errores claros; corregir → BORRADOR sellado listado; "Timbrar" → mensaje honesto
  "Conector PAC no configurado" (detallePac) y evento en bitácora.
