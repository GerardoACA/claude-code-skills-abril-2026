# CERBERUS — Dictamen de arquitectura y plan técnico

> **Generado por:** agente `arquitecto-de-apps`
> **Fecha:** 30 de junio de 2026
> **Fuente de verdad normativa:** [`00-investigacion/reporte-fiscalizacion-comercio-exterior-2025-2026.md`](../00-investigacion/reporte-fiscalizacion-comercio-exterior-2025-2026.md)
>
> Datos de integración confirmados: VUCEM ofrece Web Services con diccionario de datos
> para MVE/E2 (convivencia hasta 31-may-2026, hoy ya en régimen obligatorio pleno);
> SEA opera vía Portal ANAM o web services; nuevo Reglamento de la Ley Aduanera publicado
> 23-feb-2026.

---

Premisa de diseño: el producto vive en un terreno donde **lo aburrido y trazable gana
siempre**. Una decisión "brillante" mal puesta puede traducirse en restricción de CSD del
cliente o, peor para el agente aduanal, en responsabilidad **solidaria** (ya no subsidiaria)
por contribuciones omitidas. Todo se diseña bajo esa premisa.

---

## 1. DICTAMEN: ¿sirve la guía del usuario?

**Veredicto general:** la guía es **sólida y bien sustentada como columna vertebral
operativa**, pero está **incompleta frente al marco del reporte**. Cubre bien el flujo
"preventivo (KYC) → importación del particular", pero deja fuera obligaciones que el reporte
marca como centrales y donde están las multas grandes y el riesgo del agente. Sirve como
**núcleo del MVP**; no como alcance total del producto.

### Módulo 1 — Verificación Legal (KYC). Validación punto por punto

| Punto | Sustento citado | Dictamen |
|---|---|---|
| 1. Documental básica (ID, acta, RFC, CSF) | Regla 1.4.14 fracc. I, II, VII, VIII | **Correcto.** Ajuste: la 1ª Modif. RGCE 2026 (DOF 14-may-2026) precisa que la ID es de la **persona física o representante legal**, y exige **comprobante del domicilio donde se realizan las operaciones de CE**. Codifícalo así. |
| 2. Materialidad/infraestructura (arrendamiento, propiedad, maquinaria) | Regla 1.4.14 fracc. VI | **Correcto.** Además alimenta la **materialidad RMF 2026 §6**. Liga cada documento a la operación/CFDI que respalda, no solo al expediente. |
| 3. Evidencia física georreferenciada | Regla 1.4.14 fracc. V | **Correcto.** Asegura **metadatos firmados** (geo, timestamp, hash) o la evidencia es impugnable. |
| 4. Manifestación de integridad bajo protesta con e.firma (no-EFOS) | art. 69-B y 49 Bis CFF; 1.4.14 fracc. IX | **Correcto.** Conserva el sellado e.firma + acuse con hash. |
| 5. Listas negras (RFC vs DOF/SAT, bloqueo automático) | arts. 49 Bis, 69, 69-B, 69-B Bis CFF; 1.4.14 fracc. X | **Correcto, con matiz.** Los listados 69-B tienen **etapas** (presunto/definitivo/desvirtuado). **Recomendación:** semáforo por etapa (presunto = alerta + freno con autorización manual; definitivo = bloqueo duro), con re-verificación programada. |

**Conclusión Módulo 1:** aciertos altos. Es el módulo a **portar desde SIDF MD** y el
acelerador de la Fase 1.

### Módulo 2 — Proceso de Importación. Validación punto por punto

Los 8 pasos describen **correctamente el flujo legal de un despacho de importación** con
sustentos adecuados. Observaciones:

1. **Padrón de Importadores** — Correcto. Añadir verificación del **Padrón de Sectores
   Específicos** cuando la fracción lo exija.
2. **Encargo Conferido con e.firma (B14/B21)** — Correcto.
3. **MVE Formato E2 a VUCEM** — Correcto y actualizado: transmisión **vía portal o Web
   Service**, obligatoria desde 9-dic-2025, convivencia hasta 31-may-2026. Hoy ya en régimen
   obligatorio pleno: diséñalo solo electrónico.
4. **COVE** — Correcto.
5. **Prevalidación con sello digital** — Correcto. El nuevo Reglamento (DOF 23-feb-2026)
   reafirma criterios sintácticos, catalógicos, estructurales y normativos. Pre-valida
   **antes** de mandar al prevalidador, para no pagar rechazos.
6. **Pago de contribuciones (IGI, IVA, IEPS, DTA, cuotas comp.)** — Correcto.
7. **DODA con QR / Gafete Electrónico + CAAT** — Correcto y actualizado.
8. **Despacho + Selección Automatizada, estatus en vivo leyendo el SEA** — Correcto; es el
   enganche con la "auditoría en vivo".

**Conclusión Módulo 2:** flujo correcto. Vacío: cubre importación de un particular, pero el
SaaS sirve también a **IMMEX/maquila** y **exportadores**, cuyo ciclo es distinto.

### Vacíos críticos: obligaciones del reporte que la guía NO cubre y debe

1. **Carta Porte 3.1 (reporte §1)** — Obligatoria desde 17-jul-2024, multas hasta ~$97,330
   MXN **por documento**. Falta módulo de emisión/validación CFDI + Carta Porte 3.1.
2. **Complemento de Comercio Exterior 1.1 (reporte §2)** — Para **exportación A1** falta el
   complemento que cuadra fracción arancelaria y valor pedimento↔CFDI. Sin esto no sirves al
   perfil exportador.
3. **Anexos 24/30/31 — IMMEX (reporte §3)** — **El vacío más grande.** El requisito central
   ("Anexo 24 apartado C, actualización <48 h, acceso remoto") **no aparece en la guía**.
   Falta el motor de inventarios PEPS/SACI, descargo automático, alertas 48 h, conciliación
   de saldos no retornados (Anexo 31) y reporte mensual (Anexo 30).
4. **Materialidad RMF 2026 y estado de CSD (reporte §6)** — Falta **monitoreo continuo del
   estado del CSD** del cliente y alertas ante riesgo de restricción, más gestión de **Buzón
   Tributario**.
5. **Responsabilidad solidaria del agente aduanal (reporte §4)** — Falta un **módulo de
   gestión de riesgo del agente**: scoring por cliente/operación, evidencia de debida
   diligencia y **bitácora inmutable**. Dado que ya es solidario, es su seguro legal.
6. **RFE / acceso remoto continuo e interoperabilidad con el SEA (reporte §4)** — La "auditoría
   en vivo" debe ser un componente de primera clase, no un efecto lateral del paso 8.

**Resumen del dictamen:** Aprueba la guía como **núcleo del MVP (KYC + importación del
particular)**. Suma 6 módulos: Carta Porte, Complemento CE export, IMMEX Anexos 24/30/31,
monitoreo CSD/materialidad, gestión de riesgo del agente, y capa de auditoría en vivo.

---

## 2. ARQUITECTURA

### Módulos del sistema

- **M0 — Núcleo multi-tenant**: identidad, tenants, perfiles (particular, IMMEX, agencia,
  importador/exportador, despacho contable), RBAC, billing.
- **M1 — KYC / Expediente Electrónico (PORTADO de SIDF MD)**: documental, materialidad,
  evidencia georreferenciada, manifestación e.firma, motor listas 69-B. Regla 1.4.14.
- **M2 — Operación de Importación**: padrón, encargo conferido, MVE/E2, COVE, prevalidación,
  pago, DODA, semáforo.
- **M3 — Exportación + Complemento CE 1.1**: A1, fracción arancelaria, cuadre pedimento↔CFDI.
- **M4 — CFDI + Carta Porte 3.1** (vía PAC): emisión/validación, catálogos, placas, CAAT.
- **M5 — IMMEX / Inventarios (Anexo 24 SACI, 30, 31)**: PEPS, descargo, alertas 48 h, saldos
  no retornados.
- **M6 — Cumplimiento fiscal / Materialidad (RMF 2026)**: estado CSD, Buzón Tributario,
  evidencia por CFDI.
- **M7 — Gestión de riesgo del agente**: scoring, debida diligencia, responsabilidad solidaria.
- **M8 — Auditoría en vivo / Acceso autoridad (SAT/ANAM)**: portal/API solo-lectura para la
  autoridad, interoperabilidad SEA, bitácora inmutable, exportes.

### Diagrama de componentes

```
                          ┌─────────────────────────────────────────┐
                          │  CLIENTES (web app por perfil + móvil    │
                          │  para evidencia georreferenciada)        │
                          └───────────────────┬─────────────────────┘
                                              │ HTTPS / OIDC
                          ┌───────────────────▼─────────────────────┐
                          │  API GATEWAY  (authN/Z, rate-limit,      │
                          │  tenant-routing, audit interceptor)      │
                          └───────────────────┬─────────────────────┘
        ┌───────────────┬─────────────────────┼──────────────┬──────────────────┐
        ▼               ▼                     ▼              ▼                  ▼
   ┌─────────┐    ┌───────────┐        ┌────────────┐  ┌───────────┐    ┌──────────────┐
   │ M1 KYC  │    │ M2 Import │        │ M5 IMMEX   │  │ M6 Fiscal │    │ M7 Riesgo    │
   │(SIDF MD)│    │ M3 Export │        │ Inventarios│  │ CSD/Mater.│    │ agente       │
   └────┬────┘    │ M4 CFDI/CP│        │ A24/30/31  │  └─────┬─────┘    └──────┬───────┘
        │         └─────┬─────┘        └─────┬──────┘        │                 │
        └───────────────┴──────────┬─────────┴───────────────┴─────────────────┘
                                    ▼
                  ┌─────────────────────────────────────────┐
                  │  CAPA DE INTEGRACIÓN (Anti-Corruption     │
                  │  Layer): colas + workers + reintentos     │
                  │  por cada dependencia gubernamental       │
                  └──┬──────┬───────┬───────┬───────┬─────────┘
                     ▼      ▼       ▼       ▼       ▼
                 ┌──────┐┌──────┐┌──────┐┌──────┐┌────────────┐
                 │VUCEM ││ SEA/ ││Preva-││ PAC  ││ SAT e.firma│
                 │ MVE  ││ ANAM ││lidador││CFDI/ ││ 69-B/DOF   │
                 │ E2   ││ DODA ││       ││ CP   ││ CSD/Buzón  │  + Bancos (pago)
                 └──────┘└──────┘└──────┘└──────┘└────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  M8 AUDITORÍA EN VIVO: cada acción → BITÁCORA INMUTABLE (append-only,      │
   │  hash-encadenada). Portal/API solo-lectura para SAT/ANAM con acceso        │
   │  remoto continuo, scoping por tenant, e interoperabilidad con el SEA.      │
   └──────────────────────────────────────────────────────────────────────────┘
```

**Patrón clave:** toda integración gubernamental pasa por una **Anti-Corruption Layer** con
colas y reintentos. VUCEM/SEA/prevalidador se caen, cambian XSD y tienen ventanas de
mantenimiento; nunca los llames síncronos desde la request del usuario.

---

## 3. STACK recomendado

| Pieza | Recomendación | Justificación |
|---|---|---|
| Lenguaje backend | **TypeScript (Node.js) o C#/.NET** — según lo que use SIDF MD | Reusar el stack de SIDF MD reduce fricción al portar el KYC. |
| Framework API | **NestJS** (TS) o **ASP.NET Core** | Estructura modular que mapea 1:1 con M0–M8 y facilita multi-tenant. |
| Frontend | **Next.js + React** | SSR para portal de autoridad/cliente; ecosistema maduro. |
| Móvil (evidencia geo) | **React Native (Expo)** | Una base para fotos con geo+timestamp+hash; reusa lógica TS. |
| Base de datos | **PostgreSQL** | Transaccional sólida, JSONB para payloads VUCEM/SEA, **RLS nativa multi-tenant**. |
| Multi-tenancy | **Una BD, schema/RLS por tenant** | Aísla datos sin el costo de una BD por tenant; RLS evita fugas. |
| Bitácora inmutable | **Tabla append-only con hash-chain en Postgres + WORM en object storage** | No-repudio sin blockchain. |
| Almacenamiento documental | **S3-compatible con Object Lock (WORM) + cifrado** | Evidencia inmutable y retenible; cumple conservación fiscal. |
| Colas / async | **Redis + BullMQ** (o RabbitMQ) | Reintentos y backoff para integraciones inestables. |
| Firma e.firma | **Librería de firma XML/CMS sobre certificados SAT** | Requisito legal de encargo conferido, manifestación y prevalidación. |
| Auth | **Keycloak (OIDC) o Auth0** | RBAC por perfil + cuentas solo-lectura para la autoridad. |
| Infra/hosting | **Nube en región México / residencia MX (Azure México Central / AWS)** | Datos fiscales sensibles; residencia y latencia hacia VUCEM/SEA. |
| IaC + CI/CD | **Terraform + GitHub Actions** | Reproducibilidad y auditoría del despliegue. |
| Observabilidad | **OpenTelemetry + Grafana/Loki + alertas** | Probar disponibilidad del acceso remoto continuo exigido a recintos. |

---

## 4. MODELO DE DATOS

```
Tenant (1)───< Usuario >───(N) Rol/Perfil   [particular|immex|agencia|imp-exp|despacho|AUTORIDAD]
   │
   ├──< Cliente/Importador (RFC, padrón, sector, estado_CSD, etapa_69B)
   │        │
   │        ├──(1:1) ExpedienteKYC (regla 1.4.14, ciclo_3años, fecha_revision)
   │        │             └──< Documento (tipo, hash, WORM_url, e.firma?, geo, vence_en)
   │        │             └──< ManifestacionIntegridad (e.firma, hash, acuse)
   │        │             └──< EvidenciaGeo (lat, lon, timestamp, hash)
   │        │
   │        ├──< EncargoConferido (B14/B21, e.firma_cliente, aceptacion_agente)
   │        │
   │        └──< Operacion ───< Pedimento (clave A1/IN/etc, aduana, estatus_SEA)
   │                 │              ├──< MVE_E2 (acuse_VUCEM, expediente_probatorio[])
   │                 │              ├──< COVE (acuse_VUCEM)
   │                 │              ├──< CFDI (uuid, complemento: CartaPorte31|ComercioExt11)
   │                 │              ├──< Prevalidacion (sello_digital, resultado)
   │                 │              ├──< Pago (IGI,IVA,IEPS,DTA,cuotas, ref_bancaria)
   │                 │              ├──< DODA (QR, CAAT, gafete)
   │                 │              └──< Semaforo (verde|rojo, leido_de_SEA, ts)
   │                 │
   │                 └──< Validacion (regla, fuente_normativa, resultado, severidad)
   │
   ├──< InventarioIMMEX (SACI)  ── ItemInventario (PEPS, saldo, no_retornado)
   │        └──< MovimientoInventario (entrada/descargo, pedimento_ref, plazo_48h)
   │
   ├──< AlertaCumplimiento (tipo: CSD|69B|plazo48h|carta_porte|vencimiento, severidad)
   │
   └──< BitacoraAuditoria (append-only, hash_prev, hash_actual, actor, accion, payload)
            └── consultada por rol AUTORIDAD (solo-lectura, scope por tenant)
```

**Relaciones clave:** `Documento` y `Validacion` se enlazan **tanto al ExpedienteKYC como a la
Operacion** para sostener materialidad (RMF 2026). `BitacoraAuditoria` es transversal y es la
base de M8.

---

## 5. PLAN POR FASES (MVP primero, apalancando el KYC existente)

**Fase 0 — Setup (semanas 1-2)**
Monorepo, IaC, Postgres con RLS multi-tenant, esqueleto modular M0, auth OIDC con rol AUTORIDAD
desde el día 1, CI/CD, object storage WORM. Stack alineado a SIDF MD.

**Fase 1 — MVP, acelerado por SIDF MD (semanas 3-10)**
- **Portar M1 KYC desde SIDF MD** (el atajo): documental, materialidad, evidencia geo,
  manifestación e.firma, motor listas 69-B con semáforo por etapa.
- **M2 Importación** flujo feliz: padrón, encargo conferido, MVE/E2 a VUCEM (Web Service),
  COVE, prevalidación, DODA, lectura de semáforo del SEA.
- **M8 mínimo:** bitácora inmutable de todo + portal solo-lectura básico para la autoridad.
- Entregable: un agente aduanal integra expediente y promueve una importación con
  trazabilidad. **Ya aporta valor.**

**Fase 2 — Robustez (semanas 11-18)**
- **M4 CFDI + Carta Porte 3.1** vía PAC (cierra el vacío de multas grandes).
- **M3 Exportación + Complemento CE 1.1**.
- **M6 Materialidad/CSD/Buzón**: monitoreo de estado CSD y alertas.
- Validación dura por regla con cita normativa, manejo de errores de integración, tests de la
  ACL contra mocks de VUCEM/SEA.

**Fase 3 — Producción (semanas 19-24)**
Despliegue en región MX, observabilidad con SLA del acceso remoto continuo, hardening de
seguridad para el acceso de la autoridad, pen-test, DR/backups WORM, CI/CD con aprobaciones.

**Fase 4 — Crecimiento / IMMEX (post-MVP)**
- **M5 IMMEX completo (Anexos 24/30/31)**: SACI PEPS, descargo, alertas 48 h, saldos no
  retornados, reporte mensual. El módulo más pesado y de mayor valor para maquilas.
- **M7 Gestión de riesgo del agente**: scoring y dossier de debida diligencia.
- Integración bancaria de pago, analítica, API pública para despachos contables.

---

## 6. QUÉ NECESITO SABER DE SIDF MD para portar el KYC limpio

Sin esto no se puede decidir entre **(a) copiar el módulo**, **(b) extraerlo como
microservicio**, o **(c) consumirlo vía API**.

**Stack y arquitectura**
1. ¿Lenguaje, framework y versión de SIDF MD?
2. ¿Monolito o servicios separables? ¿El KYC está acoplado a otros módulos?
3. ¿On-premise o nube? ¿Multi-tenant o single-tenant?

**Modelo de datos**
4. ¿Esquema actual del expediente KYC: entidades, campos, relaciones? ¿Mapea a la Regla 1.4.14
   o habrá que extender campos (domicilio de operaciones CE, etapa 69-B)?
5. ¿Cómo versiona documentos y maneja el ciclo de actualización (3 años)?

**API e integración**
6. ¿Expone API (REST/SOAP/GraphQL)? ¿Documentación y contratos estables?
7. ¿Qué integraciones externas ya tiene (69-B/DOF, SAT, validación RFC)?

**Auth e identidad**
8. ¿Cómo autentica hoy? ¿Compatible con OIDC o habrá que federar?
9. ¿Cómo modela "cliente final" vs "usuario operador"? ¿Encaja en multi-tenant?

**Almacenamiento documental y e.firma**
10. ¿Dónde guarda documentos (BD, disco, S3)? ¿Cifrado? ¿Inmutabilidad/WORM?
11. ¿Ya implementa **e.firma** (firma de manifestaciones, validación de certificados SAT)?
    ¿Con qué librería? — lo más valioso a reutilizar.
12. ¿Maneja evidencia georreferenciada con metadatos firmados, o eso es nuevo?

**Operación**
13. ¿Volumen actual de expedientes y restricciones de licencia/propiedad del código?

**Recomendación preliminar de estrategia** (a confirmar): si SIDF MD comparte stack y el KYC es
separable, **extraerlo como servicio "KYC" con API propia** y consumirlo desde CERBERUS —
conserva una sola fuente de verdad del expediente. Si el stack difiere o el acoplamiento es
alto, **copiar el modelo de datos y la lógica de e.firma** y reimplementar dentro de CERBERUS.

---

## 7. RIESGOS Y DECISIONES A VIGILAR

**Legales / normativos**
- **Volatilidad normativa:** confirmada con el nuevo Reglamento de la Ley Aduanera (23-feb-2026)
  y la modif. 1.4.14 (14-may-2026). **No hardcodees reglas, fechas ni multas**; externalízalas
  a un motor de reglas versionado contra Anexo 5 RMF y DOF. La decisión más cara de revertir.
- **Bloqueo automático por 69-B:** bloquear en etapa equivocada genera responsabilidad y
  reclamos. Diséñalo por etapa con override auditado.
- **Responsabilidad solidaria del agente:** la bitácora inmutable es prueba de debida
  diligencia; si falla o es alterable, el agente queda expuesto. Es requisito, no feature.

**Integración con dependencias que no controlas (alto riesgo)**
- **VUCEM, SEA/ANAM y prevalidador cambian XSD, tienen caídas y mantenimiento.** Aísla tras la
  ACL con colas, reintentos, circuit breakers y modo degradado. Versiona XSD/diccionarios.
- **Sin sandbox garantizado:** confirma ambientes de prueba de VUCEM/SEA/PAC antes de
  comprometer fechas de Fase 1; riesgo de cronograma real.
- **Lectura del semáforo del SEA "en tiempo real"** depende de lo que ANAM exponga; diseña para
  el peor caso (polling con backoff).

**Seguridad por dar acceso a la autoridad (crítico)**
- El acceso remoto de SAT/ANAM debe ser **estrictamente solo-lectura, scoping por tenant,
  auditado y revocable**. Cuentas separadas, MFA, registro de cada consulta de la autoridad en
  la bitácora.
- **Residencia y cifrado de datos fiscales:** región MX, cifrado en reposo y tránsito, WORM
  para conservación.
- **Multi-tenant + RLS:** un bug de aislamiento es catastrófico. Tests de fuga de tenant en CI
  desde Fase 0.

**Decisión de producto a vigilar:** no metas IMMEX (M5) en el MVP. El SACI/Anexo 24 con
descargo PEPS y plazos de 48 h es un subsistema completo; en Fase 1 hunde el cronograma. Va en
Fase 4, con su propio equipo.

---

## Fuentes consultadas para confirmar integración técnica

- [VUCEM — Preguntas frecuentes Formato E2 Manifestación de Valor (PDF)](https://www.ventanillaunica.gob.mx/vucem/otros/Preguntas_Frecuentes_Formato_E2_Manifestacion_de_Valor.pdf)
- [VINCULUM — MVE y cómo llenarla en VUCEM (E2)](https://vinculum.mx/2026/01/20/manifestacion-de-valor-electronica-mve-y-como-llenarla-en-vucem-formato-e2/)
- [SAT — Generación DODA QR / PITA](https://wwwmat.sat.gob.mx/aplicacion/43072/generacion-doda-qr---pita)
- [ANAM — Procesamiento electrónico de datos (SEA / prevalidación)](https://www.anam.gob.mx/procesamiento-electronico-de-datos/)
- [Grant Thornton — Reglamento de la Ley Aduanera 2026 (DOF 23-feb-2026)](https://www.grantthornton.mx/AlertasGT/alerta6.2026/)
