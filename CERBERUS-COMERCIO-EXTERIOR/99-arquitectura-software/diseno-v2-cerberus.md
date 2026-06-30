# CERBERUS — Diseño v2 (corregido con panel de expertos y decisiones del cliente)

> **Generado por:** agente `arquitecto-de-apps`
> **Fecha:** 30 de junio de 2026
> **Sustituye a:** [dictamen v1](./dictamen-y-arquitectura-cerberus.md)
> **Insumos:** [reporte normativo](../00-investigacion/reporte-fiscalizacion-comercio-exterior-2025-2026.md) · [dictamen colegiado del panel](./dictamen-colegiado-panel-expertos.md) · [decisiones del cliente](./decisiones-cliente-v1.md)

> **Postura de la v2 en una frase:** CERBERUS deja de prometer un "end-to-end" que no entrega y se redefine como **orquestador de cumplimiento + máquina de prueba**: valida la *forma* del despacho, porta el KYC de SIDF MD, arma el dossier de defensa y produce evidencia oponible — reservando el modelo de datos para los motores *sustantivos* (clasificación, valoración, RRNA, re-determinación) que llegan después. El panel aprobó construir con condiciones; esta v2 incorpora esas condiciones como bloqueantes de Fase 0/1.

---

## 1. Resumen de cambios v1 → v2

### Qué se RECORTÓ del MVP (se difiere, con modelo de datos reservado)
- **Motores sustantivos** (clasificación NICO, valoración aduanera/incrementables, RRNA/NOMs, re-determinación de contribuciones, origen/T-MEC). El MVP **no calcula**; orquesta y valida la forma. Decisión cliente A1.
- **IMMEX / Anexos 24-30-31 como generador del SACI.** Cambia a **auditar/integrar el ERP del cliente**, no construir el inventario. Decisión cliente A4.
- **Recinto / RFE / patios / CCTV / trazabilidad física.** Fuera de alcance, línea de producto futura, **declarado explícitamente** para no inducir incumplimiento del operador de recinto. Decisión cliente A3 + hallazgo ASIPONA.
- **Auditoría "en vivo" con integración directa al SEA.** Pasa a **a posteriori** (acuse capturado por el agente); M8 se rediseña sobre ese supuesto. Decisión cliente B5.
- **Reconocimiento rojo end-to-end** (acta/PAMA/alegatos/litigio). Se reduce a **registrar + armar dossier**. Decisión cliente A2.
- **"Bloqueo automático".** Eliminado del producto: se sustituye por **alertar + frenar como propuesta** con override e.firma motivado. Consenso del panel (Crítica) + decisión cliente C9/C11.

### Qué SUBIÓ a Fase 0 (condiciones bloqueantes, antes de tocar producción)
- **DPIA + rediseño de privacidad y acceso de autoridad default-deny** atado a orden/facultad con expiración. Cierre de la ruta real de fuga de RLS (sin `BYPASSRLS`, `tenant_id` validado contra token, tests en CI). Hallazgos DPO (Crítica) + decisión C12/C16.
- **Capa probatoria corregida:** SHA-256 (no 64-bit), sello local como integridad interna/evidencia **preliminar**, y **PSC/TSA + NOM-151 conectables desde el inicio** aunque se activen después. Decisión cliente C10 (con corrección obligatoria) + hallazgos penalista/arquitecto SAT.
- **Exporte probatorio** verificable por perito tercero. Decisión C16.
- **Separación criptográfica** e.firma (FIEL) / CSD / sello de prevalidación como tres artefactos distintos. Hallazgo arquitecto SAT (Crítica).
- **Pipeline de versionado de catálogos/XSD/XSLT** (parcial hoy). Decisión B7 + hallazgo (Alta).
- **Contrato de encargo por tenant** y rol LFPDPPP = encargado. Decisión C13.

### Qué subió a Fase 1 (MVP)
- **Dossier de debida diligencia sellado por operación (M7-dossier).** Era Fase 4 en v1; el agente es solidario, así que es condición de la primera operación. Hallazgo CAAAREM (Crítica) + decisión A2.
- **Cancelación/sustitución CFDI 4.0** modelada junto a la emisión. Decisión C8.
- **Encargo conferido con vigencia/revocación** y amarre por operación. Hallazgo CAAAREM (Crítica).

### Qué se mantiene de v1
ACL ante dependencias gubernamentales (colas/reintentos), PostgreSQL + RLS multi-tenant, bitácora append-only hash-chain (ahora **reforzada** con TSA/NOM-151), motor de reglas versionado, premisa de responsabilidad solidaria. El panel respaldó esta columna vertebral.

---

## 2. Alcance del MVP redefinido

### IN-SCOPE (Fase 1, lo que CERBERUS SÍ hace en el MVP)
- **KYC / Expediente 1.4.14** portado de SIDF MD: documental, materialidad, evidencia geo firmada, manifestación de integridad e.firma, motor de listas 69-B como **alerta por etapa** (no bloqueo).
- **Orquestación del despacho de importación** (forma, no fondo): verifica que existan y sean coherentes padrón vigente, encargo conferido vigente/aceptado, soporte de valor para MVE/E2, COVE, prevalidación, DODA, y registra el resultado del semáforo capturado por el agente.
- **Máquina de estados del despacho** (esqueleto con incidencia rojo → registra + dispara dossier).
- **Dossier de debida diligencia** sellado por operación (seguro legal del agente).
- **Capa probatoria**: SHA-256 + hash-chain + sello local preliminar + gancho PSC/TSA + **exporte probatorio**.
- **Acceso de autoridad default-deny** atado a orden/facultad.
- **Separación de los tres expedientes** (1.4.14 / probatorio despacho / doble 3.1.42) con sus plazos WORM.

### OUT-OF-SCOPE (explícito, para no vender falsa cobertura)
- **No calcula** contribuciones, NICO, valor en aduana, incrementables, RRNA ni preferencias de origen (Fase 2+, modelo reservado).
- **No genera** el Anexo 24 SACI; **integra/audita** el ERP de la maquila (Fase 3+).
- **No sustituye** el sistema del operador de recinto/RFE ni la videovigilancia/trazabilidad física (fuera de roadmap MVP).
- **No litiga** el reconocimiento rojo (sin acta/PAMA/alegatos en el sistema); solo registra y arma dossier.
- **No ofrece auditoría "en vivo"** integrada al SEA; es **a posteriori** sobre acuses. Riesgo abierto a confirmar con ANAM.
- **No almacena la clave privada de la e.firma**; el titular firma del lado del cliente.

> **Disclaimer de producto (obligatorio, contractual):** "CERBERUS es una herramienta de alerta y soporte documental, **no un decisor ni autoridad**. Las decisiones de clasificación, valoración, procedencia de la operación y respuesta a alertas 69-B son responsabilidad del agente/contribuyente." Acompañado de la **matriz de responsabilidad** (cliente C9/C11).

---

## 3. Arquitectura de módulos v2

Leyenda: **[MVP]** Fase 1 · **[F0]** condición bloqueante Fase 0 · **[DIF]** diferido con modelo reservado · **[OUT]** fuera de alcance declarado.

| Módulo | Estado | Nota |
|---|---|---|
| M0 Núcleo multi-tenant + RLS endurecido | **[F0]** | Sin `BYPASSRLS`; `tenant_id` validado contra token; tests de fuga en CI |
| M1 KYC / Expediente 1.4.14 (portado SIDF MD) | **[MVP]** | Alerta 69-B por etapa, no bloqueo |
| M2 Orquestación importación (forma) | **[MVP]** | Verifica coherencia y completitud; no calcula |
| M2-sub Motores sustantivos (NICO, valoración, incrementables, RRNA, re-determinación, origen) | **[DIF]** | **Modelo de datos reservado desde Fase 0** (Partida/Mercancía, ValoracionAduanera) |
| M3 Exportación + CCE 1.1 | **[DIF]** | Reservado; depende de XSD/XSLT versionados |
| M4 CFDI + Carta Porte 3.1 (multi-PAC) | Fase 2 | Cancelación/sustitución 01-04 modelada desde diseño |
| M5 IMMEX = **integración/auditoría de ERP** (Anexos 24/30/31) | **[DIF]** | NO genera SACI; lee BOM/ERP. Modelo CapaPEPS/BOM como esqueleto |
| M6 Materialidad / estado CSD (17-H vs 17-H Bis) / Buzón | Fase 2 | CSD_CANCELADO vs CSD_RESTRINGIDO |
| M7 Gestión de riesgo del agente | parcial | **Dossier de diligencia → MVP**; scoring de patente → Fase 2+ |
| M8 Auditoría **a posteriori** + acceso autoridad default-deny | **[MVP/F0]** | Sobre acuses; sin SEA en vivo |
| **MP Capa Probatoria** (SHA-256 + sello local + PSC/TSA + exporte) | **[F0]** | Módulo transversal nuevo, de primera clase |
| **MC Catálogos/Esquemas versionados** (XSD/XSLT/c_*) | **[F0]** | Pipeline de ingesta con vigencia temporal |
| **MD Privacidad/LFPDPPP** (encargo, ARCO, brechas) | **[F0]** | CERBERUS = encargado del tenant |
| M-RFE Operador de recinto / CCTV / patios | **[OUT]** | Declarado fuera de alcance |

### Diagrama de componentes v2

```
        ┌─────────────────────────────────────────────────────────┐
        │  CLIENTES (web por perfil + móvil evidencia geo firmada)  │
        │  e.firma SE FIRMA DEL LADO DEL TITULAR (no se almacena)    │
        └───────────────────────────┬─────────────────────────────┘
                                     │ HTTPS / OIDC
        ┌────────────────────────────▼────────────────────────────┐
        │  API GATEWAY  — authN/Z · tenant-routing · audit interceptor │
        │  rol AUTORIDAD = DEFAULT-DENY (sin orden ⇒ cero visibilidad) │
        └────────────────────────────┬────────────────────────────┘
   ┌──────────┬──────────────────────┼───────────────┬──────────────┐
   ▼          ▼                      ▼               ▼              ▼
┌────────┐ ┌──────────────┐  ┌──────────────┐ ┌──────────┐ ┌──────────────┐
│M1 KYC  │ │M2 Orquestación│  │M7 Dossier de │ │M8 Audit. │ │ [DIF] M2-sub │
│(SIDF MD)│ │ del despacho │  │ diligencia   │ │a posterior│ │ NICO/valor/  │
│ 69-B   │ │ (forma)      │  │ por operación│ │ (acuses) │ │ RRNA/redet.  │
│ ALERTA │ │ máq. estados │  └──────┬───────┘ └────┬─────┘ │ modelo       │
└───┬────┘ └──────┬───────┘         │              │       │ RESERVADO    │
    │             │                 │              │       └──────────────┘
    └─────────────┴────────┬────────┴──────────────┘
                           ▼
        ┌──────────────────────────────────────────────┐
        │  MP CAPA PROBATORIA (transversal)             │
        │  SHA-256 → hash-chain → sello local INTERINO  │
        │  (fecha/hora/IP) ──[gancho]──► PSC/TSA + NOM-151 │
        │  ► Exporte probatorio autocontenido (perito 3º)│
        └──────────────────┬───────────────────────────┘
                           ▼
        ┌──────────────────────────────────────────────┐
        │  ACL — colas + reintentos + circuit breakers  │
        └──┬───────┬────────┬────────┬────────┬─────────┘
           ▼       ▼        ▼        ▼        ▼
        ┌──────┐┌──────┐┌────────┐┌──────────┐┌────────────────┐
        │VUCEM ││Preva-││PAC(es) ││SAT 69-B/ ││ [F0 conectable]│
        │ E2   ││lidador││multi+  ││DOF/CSD/  ││ PSC/TSA acred. │
        │      ││       ││failover││Buzón     ││ (NOM-151)      │
        └──────┘└──────┘└────────┘└──────────┘└────────────────┘
        (SEA en vivo = [DIF]; hoy acuse capturado por el agente)

  MC Catálogos/XSD/XSLT versionados  ·  MD Privacidad/LFPDPPP (encargo, ARCO)
  M-RFE recinto/CCTV = [OUT, declarado]
```

### Cómo el modelo de datos "reserva" lo sustantivo
La regla del panel (hallazgo Crítica: "retrofittear el descargo es casi una reescritura") obliga a que **las entidades existan desde Fase 0 aunque su lógica esté vacía**. Concretamente: `Partida/Mercancía`, `ValoracionAduanera`, `RRNA`, `CapaPEPS/BOM` y la máquina de estados del despacho se **crean como tablas con sus campos clave y FKs** en Fase 0; los motores que las *pueblan y calculan* llegan en fases posteriores. Así el MVP escribe en `Partida` los datos de forma (descripción, fracción declarada por el agente) sin calcular, y el motor de clasificación posterior solo añade lógica, no rehace el esquema.

### Capa probatoria corregida (detalle)
- **Integridad interna (inmediata):** cada documento/evento → **SHA-256** (corrige el "64-bit" del cliente) + **hash-chain** append-only. El **sello local** (fecha/hora/IP auto-declarados) se guarda etiquetado como **`EVIDENCIA_PRELIMINAR`** — útil internamente, **no oponible a terceros**.
- **Prueba oponible (conectable desde inicio, activable después):** interfaz `SelladorCalificado` con implementación `NoOp` por defecto y `PSC_TSA` (RFC 3161) + **Constancia NOM-151** enchufable sin tocar el resto. Al sellar, el estado del artefacto pasa a **`PRUEBA_OPONIBLE`**. El diseño no asume que la hash-chain interna basta.
- **Exporte probatorio:** paquete autocontenido (registros + hashes + sellos + snapshot de listas 69-B/DOF consultadas + manual de verificación) que un perito valida **sin acceso al sistema vivo**. Desde Fase 0.
- **No-repudio de actor:** cada acto crítico (override, aceptación de encargo, manifestación) firmado con **e.firma del operador**, no con `user-id` de sesión.

### Acceso de autoridad default-deny (detalle)
Una cuenta de autoridad **sin orden cargada no ve nada**. El acceso se materializa en una entidad `RequerimientoAutoridad(sujeto, periodo, contribución, alcance, expiración, fundamento)`; las consultas se filtran por ese alcance y **cada acceso se sella en la bitácora** y es **visible y exportable para el tenant afectado**. Cumple secreto fiscal (art. 69 CFF) y LFPDPPP.

---

## 4. Modelo de datos v2

```
Tenant (encargado LFPDPPP) ──< ContratoEncargo (instrucciones, subencargados)
  │
  ├─< Patente ──< PersonaFisicaAutorizada (mandatario/agente)   ◄── atribución por acto
  │        └── (cada acto crítico se firma y atribuye a una persona física + patente)
  │
  ├─< Cliente/Importador (RFC, estado_CSD[CANCELADO|RESTRINGIDO], etapa_69B)
  │     │
  │     ├─(1:1) ExpedienteKYC_1414        (retención 3 años)        ┐ TRES expedientes
  │     ├─(1:1) ExpedienteProbatorioDespacho (~5 años art.30 CFF)   │ separados, con
  │     ├─(1:1) ExpedienteDoble_3142      (agente+empresa)          ┘ custodio y plazo propios
  │     │        └─< Documento (tipo, sha256, worm_url, estado_probatorio, vence_en, version[histórica no purgable])
  │     │        └─< ManifestacionIntegridad (e.firma_actor, sha256, acuse)
  │     │        └─< EvidenciaGeo (lat, lon, ts, sha256)
  │     │
  │     ├─< EncargoConferido (B14/B21, e.firma_cliente, aceptacion_agente,
  │     │        VIGENCIA{inicio,fin}, estado[VIGENTE|REVOCADO|VENCIDO])  ◄── verificado por operación
  │     │
  │     └─< Operacion ─(1:1)─ MaquinaEstadoDespacho
  │            │                 estados: ARMADO→PREVALIDADO→PRESENTACION_PENDIENTE
  │            │                 →SELECCION→[VERDE|ROJO]→INCIDENCIA→DOSSIER_GENERADO
  │            │                 (acta/PAMA/rectif./desist. = placeholders [DIF])
  │            │
  │            ├─< Partida/Mercancía  ◄── RESERVADA: descripcion, fraccion_declarada,
  │            │        nico, umt, origen, incoterm, valor_declarado
  │            │        └─(1:1) ValoracionAduanera [DIF: metodo, incrementables, vinculacion]
  │            │        └─< RRNA [DIF: nom/permiso/cupo exigible]
  │            │
  │            ├─< MVE_E2 (soporte_valor[], acuse_VUCEM)
  │            ├─< COVE (acuse_VUCEM)
  │            ├─< Prevalidacion (sello_prevalidacion, decision_motivada_si_discrepa)
  │            ├─< CFDI (uuid, complemento, estado_cancelacion[01-04], sustitucion_uuid)
  │            ├─< Pago (base, arancel, tc_dof, fecha_causacion, IGI/IVA/IEPS/DTA/cuotas)  [re-cálculo DIF]
  │            ├─< DODA (qr, caat)         ── Gafete (persona_fisica, vigencia)  ◄── separados
  │            ├─< ResultadoSemaforo (verde|rojo, fuente=ACUSE_AGENTE, ts)
  │            ├─< DossierDiligencia (sellado por operación, sha256, estado_probatorio)  ◄── MVP
  │            └─< Validacion (regla, fuente_normativa_versionada, resultado, severidad)
  │
  ├─< Alerta69B (etapa[PRESUNTO|DESVIRTUADO|DEFINITIVO|SENTENCIA_FAV], snapshot_DOF{sha256,fecha})
  │        └── ALERTA, no bloqueo; Override(e.firma_actor, motivo, ts, inmutable)
  │
  ├─< [DIF] InventarioERP (lectura del ERP del cliente) ─ CapaPEPS / BOM(factor) / Merma  ◄── esqueleto reservado
  │
  ├─< RequerimientoAutoridad (sujeto, periodo, contribucion, alcance, expiracion, fundamento)
  │        └── AccesoAutoridad (cada consulta sellada, visible/exportable al tenant)
  │
  └─< BitacoraAuditoria (append-only, sha256, hash_prev, actor_efirma, accion, payload_ref)
           └── SelladoCalificado (estado[PRELIMINAR|OPONIBLE], tsa_token?, nom151?)
```

**Decisiones de modelo que el panel exigió y quedan reflejadas:**
- `Partida/Mercancía` y `ValoracionAduanera` existen desde Fase 0 (reservadas), evitando la reescritura.
- **Máquina de estados** del despacho como entidad propia, con la incidencia del rojo como estado.
- **Tres expedientes separados** con retención propia; **versiones históricas no purgables** (prueba exculpatoria).
- `EncargoConferido` con **vigencia/revocación** verificada por operación.
- **Atribución por patente/persona física** en cada acto firmado.
- `CapaPEPS/BOM` como esqueleto para el M5-integración futuro.
- `Documento.estado_probatorio` distingue **PRELIMINAR vs OPONIBLE** (capa probatoria).

---

## 5. Plan por fases v2

### Fase 0 — Cimientos + **condiciones bloqueantes del panel** (no se toca producción sin esto)
Setup (monorepo, IaC, CI/CD, Postgres, object storage WORM **parametrizado por tipo de expediente**) **más** los gates del panel:
1. **DPIA** entregable + rol LFPDPPP = encargado + **contrato de encargo por tenant** (MD).
2. **Acceso de autoridad default-deny** atado a `RequerimientoAutoridad` con expiración; registro de acceso visible al tenant.
3. **RLS endurecido**: ningún rol con `BYPASSRLS`, `tenant_id` validado contra token, **tests de fuga de tenant en CI** como control probatorio.
4. **Capa probatoria** (MP): SHA-256 + hash-chain + sello local PRELIMINAR + **interfaz PSC/TSA conectable** + **exporte probatorio** verificable.
5. **Separación criptográfica** FIEL / CSD / sello de prevalidación (tres artefactos, tres vigencias).
6. **Alerta-no-decisor**: motor 69-B por etapa + override e.firma + disclaimer + **matriz de responsabilidad**.
7. **Pipeline de versionado de catálogos/XSD/XSLT** (MC) con vigencia temporal.
8. **Modelo de datos reservado** completo (Partida, Valoración, máquina de estados, 3 expedientes, CapaPEPS/BOM).
9. **Validación de supuestos de migración SIDF MD** (ver §7): aviso/consentimiento cubren la nueva finalidad; e.firma con valor probatorio. Si falla, re-recabar consentimiento antes de portar.

### Fase 1 — MVP (orquestación + KYC + dossier + prueba)
- **Portar M1 KYC** desde SIDF MD (documental, materialidad, evidencia geo firmada, manifestación, 69-B alerta).
- **M2 Orquestación** del despacho de importación (forma): padrón vigente re-verificado, encargo vigente/aceptado, soporte MVE/E2, COVE, prevalidación, DODA, registro de semáforo por acuse.
- **Máquina de estados** con incidencia rojo → **registra + genera DossierDiligencia** (M7-dossier, sellado por operación).
- **Cancelación/sustitución CFDI 4.0** modelada (aunque la emisión plena sea Fase 2).
- **M8 a posteriori**: bitácora reforzada + portal de autoridad default-deny.
- **Entregable:** un agente integra expediente, orquesta una importación con trazabilidad **oponible** y obtiene su dossier de defensa por operación. Ya aporta valor y **ya protege al agente solidario**.

### Fase 2 — Sustantivo I + facturación
- **M4 CFDI + Carta Porte 3.1** multi-PAC con failover (cierra multas grandes); **M3 export + CCE 1.1**.
- **M6** estado CSD (17-H vs 17-H Bis) + Buzón + materialidad estructurada.
- **Activar PSC/TSA + NOM-151** reales (el gancho ya existía).
- Inicio de **M2-sub**: clasificación NICO + valoración/incrementables como primeras piezas sustantivas.

### Fase 3 — IMMEX por integración + scoring
- **M5 = integración/auditoría del ERP** del cliente (lee BOM/inventario, valida contra Anexos 24/30/31, reporta). **No genera SACI.**
- **M7 scoring de patente** (umbrales art. 164/165), re-determinación de contribuciones.

### Fase 4 — Crecimiento
- Origen/T-MEC, RRNA completo, conciliación contable, y evaluación de **línea de producto recinto/RFE** (hoy OUT) si hay demanda; integración en vivo con el SEA **si ANAM expone web service**.

---

## 6. Backlog del panel mapeado a fase

**Se atiende YA (Fase 0/1):**

| Hallazgo (sev.) | Fase | Cómo |
|---|---|---|
| Bloqueo automático → responsabilidad civil (C) | F0 | Alerta + override e.firma + disclaimer + matriz |
| LFPDPPP ausente (C) | F0 | MD: encargado, aviso, ARCO, contrato de encargo |
| Acceso autoridad sin scoping (C) | F0 | RequerimientoAutoridad default-deny + expiración |
| RLS no protege fuga real (C) | F0 | Sin BYPASSRLS, tenant_id vs token, tests CI |
| Sellado de tiempo no confiable (C) | F0 | SHA-256 + gancho PSC/TSA + NOM-151 |
| No-repudio de actor (C) | F0/F1 | e.firma por acto crítico |
| Overrides sin motivación (C) | F0 | Override firmado+motivado (sin maker-checker, decisión C11) |
| Separación FIEL/CSD/sello (C) | F0 | Tres artefactos en modelo y stack |
| 69-B binario, faltan etapas (C) | F0/F1 | Enumerado de 4 estados + snapshot DOF |
| Dossier diligencia relegado (C) | F1 | Sube a MVP, sellado por operación |
| Encargo sin vigencia/revocación (C) | F1 | Verificado por operación |
| Tres expedientes colapsados (C) | F0 | Separados con retención propia |
| Conservación destruye prueba (B) | F0 | WORM parametrizado, versiones no purgables |
| Snapshot listas 69-B/DOF (A) | F1 | Persistir artefacto con hash/fecha |
| Exporte probatorio (A) | F0 | Paquete autocontenido |
| Cancelación CFDI 4.0 (A) | F1 | Modelada con la emisión |
| Catálogos/XSD/XSLT sin versionar (A) | F0 | Pipeline MC |
| Padrón sin re-verificación de suspensión (A) | F1 | Estado con vigencia por operación |
| DODA vs Gafete intercambiables (A) | F1 | Entidades separadas |
| Modelo sin Partida/Mercancía (A) | F0 | Reservada |

**Se DIFIERE (con justificación y modelo reservado):**

| Hallazgo (sev.) | Fase | Justificación |
|---|---|---|
| Motor clasificación NICO (C) | F2 | Decisión cliente: MVP orquesta, no calcula. Modelo Partida reservado |
| Valoración/incrementables (C) | F2 | Íd. ValoracionAduanera reservada |
| Re-determinación de contribuciones (C) | F3 | Sustantivo; Pago descompuesto desde F1 para habilitarlo |
| RRNA/NOMs (C) | F2/F4 | Entidad RRNA reservada |
| Origen/T-MEC (A) | F4 | Atributo origen reservado en Partida |
| Anexo 24 A/B/C, PEPS, BOM, mermas (C) | F3 | Cambia a **integración de ERP**, no generación. Esqueleto reservado |
| Anexo 31 cálculo de crédito fiscal (C) | F3 | Depende de integración IMMEX |
| Recinto/RFE, CCTV, patios (C) | OUT | Declarado fuera de alcance; línea futura |
| Semáforo en vivo / SEA (A) | F4 | A posteriori por acuse; depende de que ANAM exponga WS |
| Reconocimiento rojo end-to-end (C) | OUT parcial | Registra + dossier; sin litigio en sistema |
| Trazabilidad física patios, almacenaje/abandono, VMS (C/A) | OUT | Pertenecen al perfil recinto |
| Scoring de patente art. 164/165 (A) | F3 | Dossier (no scoring) es lo crítico para el MVP |

**Corrección puntual a aplicar ya:** el hallazgo (Media) sobre la **cita "art. 49 Bis CFF" inexistente** en la manifestación no-EFOS: corregir el fundamento (Regla 1.4.14 RGCE + art. 69-B CFF) en el texto de la manifestación antes de portarla de SIDF MD; una manifestación con base inexistente es impugnable.

---

## 7. Riesgos remanentes y supuestos a validar en Fase 0

**Supuestos del cliente que el panel marcó como riesgo y DEBEN validarse en Fase 0:**
- **Migración SIDF MD (decisión D17):** se asume que aviso/consentimiento cubren la nueva finalidad (exposición a la autoridad) y que la e.firma de SIDF MD produce firmas con valor probatorio (NOM-151/no-repudio). **Si el aviso no cubre la finalidad, hay que re-recabar consentimiento antes de portar** — bloqueante. Verificar también que SIDF MD no traiga el 69-B modelado como binario (se re-modela a 4 etapas).
- **Acceso en vivo al SEA (decisión B5):** se diseña a posteriori; confirmar con ANAM si autorizará web service. Mientras, el "en vivo" **no se promete**.
- **PSC/TSA acreditado:** el gancho existe desde F0 pero el proveedor está por elegir; sin él, los documentos quedan como **PRELIMINAR** y no son prueba plena. Contratar antes de prometer "valor probatorio".

**Riesgos remanentes (vigentes pese a la v2):**
- **Falsa sensación de cobertura:** el mayor riesgo del producto. El MVP valida la *forma*; si el cliente cree que valida el *fondo* (clasificación/valor), se expone donde el SAT determina diferencias. **El disclaimer y la matriz de responsabilidad son mitigación, no eliminación.**
- **Override sin maker-checker (decisión C11):** el cliente optó por e.firma + motivo sin doble validación. El penalista pedía maker-checker para riesgo alto. Aceptado como decisión del cliente, pero **queda como riesgo documentado**: en operaciones de alto riesgo, un override firmado por una sola persona es defendible pero más débil que uno con doble control.
- **Volatilidad normativa:** reglas/fechas/multas externalizadas y versionadas; nunca hardcodeadas (confirmado con Reglamento 23-feb-2026 y modif. 1.4.14 del 14-may-2026).
- **Dependencias gubernamentales (VUCEM/PAC/prevalidador):** aisladas tras la ACL; confirmar **sandboxes** antes de comprometer fechas de Fase 2 (riesgo de cronograma real).
- **Secreto fiscal multi-tenant:** un bug de aislamiento o de scoping del acceso de autoridad es catastrófico (art. 69 CFF + LFPDPPP). Tests de fuga en CI tratados como **control probatorio**, no como prueba unitaria opcional.
- **Esqueleto reservado mal dimensionado:** si las entidades reservadas (Partida/Valoración/CapaPEPS) se diseñan superficialmente, igual habrá reescritura. Vale invertir en su modelado correcto en Fase 0 aunque la lógica llegue después.
