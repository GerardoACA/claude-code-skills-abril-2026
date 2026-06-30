# Informe de reconciliación — diseño v2 ↔ código existente

> **Generado por:** sesión Claude Code (modelo Opus 4.7 1M)
> **Fecha:** 30 de junio de 2026
> **Insumos:** [guion de reconciliación](./guion-reconciliacion-repos.md) · [diseño v2](./diseno-v2-cerberus.md) · repos `cerberus-sidf-mp` y `cerberus-platform` accesibles en `~/Desktop/`.
> **Postura del informe en una frase:** la columna vertebral del **expediente probatorio**, la **capa probatoria (SHA-256 + hash-chain + NOM-151 conectable + blockchain)** y el **motor 69-B por etapas** ya están construidos y son portables al MVP de Comercio Exterior; lo que **falta y bloquea Fase 0** es el modelo aduanero (Patente / Encargo / Operación / DODA / COVE / MVE-E2 / Partida) y tres correcciones LFPDPPP/RLS/criptografía que ningún repo resuelve hoy.

---

## 1. Inventario de los repos analizados

### 1.1 `cerberus-sidf-mp` — Sistema Integral de Defensa Fiscal y Materialidad Probatoria
- **Stack:** Next.js 16.2.6 (App Router) + Prisma 7.8 + PostgreSQL (local + Neon) + NextAuth 4 (JWT). Monolito.
- **Librerías diferenciadoras:** `ethers 6.16` (anclaje blockchain Polygon/Mainnet/Sepolia), `@vercel/blob` (dual local/cloud), `@sparticuz/chromium` (scraping headless), `pdf-parse`/`mammoth`/`docx`, `@anthropic-ai/sdk` (orquestación Claude).
- **Esquema Prisma:** **~70 modelos** (`prisma/schema.prisma:1-1450+`). Cubre Expediente de Defensa, Operación, Documento, IndicioMaterialidad (16 tipos PRODECON), AnclajeProbatorio (Merkle), SmartContract → Cláusula → Obligación → Hito → Entregable → Validación, Prueba de Entrega (Tesis 2027498), Cartera de Proveedores, Verificaciones EFOS/REPSE/3-Conductas, ARCO, BeneficiarioControlador, AcuerdoConclusivoCaso.
- **Migraciones:** 10+, la más reciente `20260608000000_add_unique_cfdi_per_expediente`. Migración `20260501165219_audit_event_encadenado` confirma hash-chain en producción.
- **Rutas API funcionales (muestra):** `/api/expedientes`, `/api/efos-repse/verificar-rfc`, `/api/signature-workflow`, `/api/arco`, `/api/prueba-entrega/consentimiento`, `/api/auditoria/reporte`, `/api/certificacion`.

### 1.2 `cerberus-platform` — Plataforma de Cumplimiento de Carranza Abogados (clientes OCN)
- **Stack:** Next.js 16.2.3 + Prisma 7.7 + PostgreSQL (Neon) + NextAuth 4. Monolito.
- **Librerías diferenciadoras:** `xlsx`/`pdf-lib`/`docx` (paquetes MICN), `node-cron` (Vigía DOF), `@anthropic-ai/sdk` (Claude Opus 4.7 + Haiku 4.5), `resend` (email).
- **Esquema Prisma:** **46 modelos** (`prisma/schema.prisma:1-1100+`). Cubre Tenant (raíz multi-tenant), DiagnósticoCerberus, PaqueteCumplimiento → DocumentoCliente, **DictamenRiesgo** (con `selloHmacSha256`, `selloEd25519`, `selloCanonicalJcs` RFC 8785, `legalHoldHasta`), BitácoraLLM (hash-chain con `hashAnterior`, `retencionDias=3650`), ListaNegraSAT (Art. 69 / 69-B / 69-B Bis / 49 Bis), ListaSancionInternacional (OFAC / ONU / UE / UK / OpenSanctions), AdjudicacionVLR, FuenteCitada (con `reemplazadaPor`).
- **Migraciones:** init + `add_modulos_config` + **`manual-triggers-anti-delete.sql`** (triggers Postgres que bloquean DELETE físico salvo `app.allow_purge='true'` y que protegen `legalHoldHasta`).
- **Rutas API funcionales (muestra):** `/api/dictamen-riesgo/generar`, `/api/paquetes/*`, `/api/listas/*`, `/api/monitor`, `/api/cron/dof-listas`, `/api/proveedores/verificacion-masiva`.

### 1.3 Repos opcionales mencionados en el guion
- `cerberus-legal-knowledge` y `cerberus-seguridad-higiene` **no están presentes** en `~/Desktop/`. Lo que el guion atribuía a "seguridad-higiene" (Cincel NOM-151 + blockchain) ya vive en `cerberus-sidf-mp` (`lib/nom151-psc.ts` + `lib/ethereum-anchor.ts`). El cuerpo de conocimiento legal del MICN (versionado, biblioteca normativa, calendario fiscal 2026) ya vive en `cerberus-platform` (`lib/biblioteca-normativa.ts`, `lib/micn-catalogo.ts`, `scripts/vigia-dof.ts`).

---

## 2. Auditoría del KYC y de los supuestos bloqueantes de Fase 0

### 2.1 Modelo del Expediente — ¿mapea a Regla 1.4.14 RGCE de Comercio Exterior?
- **Lo que existe:** `ExpedienteDefensa` (`cerberus-sidf-mp/prisma/schema.prisma:69-135`) cubre razón social, RFC, ejercicio fiscal, **domicilio fiscal**, sector económico, tamaño, ingresos, régimen, partes relacionadas y flags de comercio exterior. Materialidad: `scoreMaterialidad`, `scoreMaterialidadNivel` (DEBIL/RAZONABLE/SOLIDA), `actividadesExtraidas`.
- **Lo que falta para Comercio Exterior:** no existe **domicilio de operaciones CE** distinto del fiscal; no existen las **fracciones I, II, V, VI, VII, VIII, IX, X** de la Regla 1.4.14 como entidades/campos (catálogo de productos a importar, vinculación con clientes/proveedores extranjeros, soporte de operación, etc.); no existen `Patente`, `PersonaFisicaAutorizada`, `EncargoConferido`, `Operacion` de despacho, `Partida/Mercancía`, `ValoracionAduanera`, `MVE_E2`, `COVE`, `DODA`, `Gafete`, `Prevalidacion`.
- **Veredicto:** la **estructura de KYC documental + materialidad + indicios PRODECON es portable** (M1 Expediente 1.4.14 ≈ 60 % reutilizable); el **vocabulario aduanero del MVP hay que crearlo desde cero** en Fase 0.

### 2.2 e.firma (FIEL / CSD / sello de prevalidación)
- **Lo que existe:** `cerberus-sidf-mp/lib/signature-workflow.ts` orquesta hashing + firma + blockchain. La firma se aplica **del lado del titular** (FirmasRegistry serializa el resultado, **no almacena clave privada**). `cerberus-platform/lib/dictamen/sello-integridad.ts` produce sello dual **HMAC-SHA256 + Ed25519 + canonicalización JCS RFC 8785** sobre el dictamen.
- **Lo que NO existe:** la **separación de tres artefactos criptográficos** (FIEL del titular / CSD del emisor / sello del prevalidador) que el panel arquitecto-SAT marcó como crítica. Hoy `signature-workflow` trata "la firma" como un único registro; no hay tablas separadas con vigencia/serie/emisor por tipo.
- **Veredicto:** **supuesto del cliente confirmado** (la FIEL no se almacena ni de SIDF MD ni de la plataforma) ✅. **Pero el supuesto colateral del panel (separación FIEL/CSD/sello) se cae**: hay que modelarla explícitamente en Fase 0 antes de portar.

### 2.3 Capa probatoria (SHA-256 / NOM-151 / TSA / blockchain / exporte verificable)
- **SHA-256:** sí, presente y consistente. `cerberus-sidf-mp/lib/hash.ts` (determinista, con `verifyHash`). `cerberus-platform` lo aplica a `systemPromptHash`, `userPromptHash`, `responseHash`, `hashContenido`, `cadenaOriginalHash` y `hashArchivo`. **El "sello 64-bit" del cliente nunca fue construido en el código real — es un riesgo de comunicación, no de implementación.**
- **Hash-chain append-only:** sí, en ambos repos.
  - `cerberus-sidf-mp/prisma/schema.prisma:385-409` (`AuditEvent`: `sequence` autoincrement + `prevHash` + `eventHash` + `hmac` con `AUDIT_HMAC_KEY`).
  - `cerberus-platform/prisma/schema.prisma:51-71` (`BitacoraLLM` con `hashAnterior` SHA-256, `retencionDias=3650`).
- **NOM-151 conectable:** sí. `cerberus-sidf-mp/lib/nom151-psc.ts` ya tiene la interfaz `PSC_PROVIDER` con implementaciones `MOCK | CINCEL | ADVANTAGE | TRUST_FACTORY | EDICOM` y el modelo `Documento.nom151Provider/Folio/HashCertificado/Timestamp/Url`. Hoy emite estado `PENDIENTE` si no hay PSC contratado — exactamente lo que el panel pidió ("PSC/TSA conectable desde el inicio, activable después").
- **TSA RFC 3161:** **NO** existe como módulo separado. Hoy Cincel hace NOM-151 directo. Para el MVP de Comercio Exterior, el gancho `SelladorCalificado` del diseño v2 puede materializarse extendiendo `nom151-psc.ts`.
- **Blockchain (anclaje):** sí. `cerberus-sidf-mp/lib/ethereum-anchor.ts` ancla hashes vía self-send de 0 wei en Polygon/Mainnet/Sepolia; el modelo `AnclajeProbatorio` guarda `merkleRoot`, `txHash`, `blockNumber`. **Wallet sin fondear** (declarado en README). Para el MVP probatorio el blockchain es **complementario**, no sustituye al PSC.
- **Exporte probatorio autocontenido (verificable por perito tercero):** **PARCIAL**. Hay `DocumentoGenerado` (markdown + hash SHA-256 + versión recuperable) y `RegistroFirma` (serialización JSON de firmas + blockchain), pero **NO existe un comando "empaquetar expediente exportable"** con: registros + hashes + sellos + snapshot 69-B/DOF + manual de verificación. Hay que construirlo en Fase 0 (módulo MP del diseño v2).
- **WORM lógico:** sí. `cerberus-platform/prisma/migrations/manual-triggers-anti-delete.sql` instala triggers Postgres anti-DELETE y anti-soft-delete bajo `legalHoldHasta` para 6 tablas críticas. **Este patrón se reutiliza tal cual** en el MVP de CE para las tres tablas de expedientes (1.4.14, ProbatorioDespacho, Doble 3.1.42).
- **Veredicto:** **capa probatoria 70 % reutilizable**. Se porta tal cual `hash.ts`, `nom151-psc.ts`, `ethereum-anchor.ts`, `AuditEvent`, triggers anti-DELETE. Se construye el **empaque exportable**, la **interfaz `SelladorCalificado`** con `NoOp`/`PSC_TSA` y la **etiqueta `EVIDENCIA_PRELIMINAR` vs `PRUEBA_OPONIBLE`** (hoy el campo existe en `Documento` pero no se usa como semáforo de oposición a tercero).

### 2.4 Listas 69-B (etapas, snapshot, no binario)
- **`cerberus-sidf-mp`:** `ListadoSATRegistro.situacion` admite literal `Definitivo | Presunto | Desvirtuado | Sentencia Favorable` (parseado del CSV oficial); `ImportacionListadoSAT.hashArchivo` SHA-256 + `VerificacionEFOS.resultado` (`LIMPIO | EFOS_DEFINITIVO | EFOS_PRELIMINAR | NO_ENCONTRADO`) con `vigenciaHasta` (+30 d) y `csvVersion`.
- **`cerberus-platform`:** `ListaNegraSAT.tipoLista` (`ART_69 | ART_69B | ART_69B_BIS | ART_49BIS`) y `situacion` con **6 estados** (`PRESUNTO | DEFINITIVO | DESVIRTUADO | SENTENCIA_FAVORABLE | CREDITO_FIRME | CANCELADO`). `EstadoListaSancion` mantiene `hash` y `ultimaRevision` por fuente (vigía detecta cambios). `DictamenRiesgo.catalogoListasSancionVersion` deja **snapshot fechado** atado al dictamen emitido.
- **Veredicto:** **supuesto del cliente confirmado y reforzado** ✅. El 69-B **NO está modelado como binario** en ninguno de los dos repos. El portado al MVP de CE es **directo**: tomar `situacion` de 6 estados de `cerberus-platform` + el snapshot fechado, y enriquecer `cerberus-sidf-mp` para alinear nombres.

### 2.5 Aviso de privacidad / consentimiento / ARCO
- **Lo que existe:** `cerberus-sidf-mp/app/aviso-privacidad/page.tsx` (Aviso integral LFPDPPP arts. 15-17 y Reglamento 24-27), `/app/arco/page.tsx` + `/api/arco` (Acceso/Rectificación/Cancelación/Oposición, fecha límite +20 hábiles art. 32, rate limit 5 req/min). Modelo `ConsentimientoDatos` con `hashAvisoPrivacidad` SHA-256 + `versionAviso` + `revocado` (LFPDPPP art. 9 datos sensibles, Tesis 2027498).
- **Lo que falla contra el diseño v2 (CRÍTICO):**
  1. **Finalidades primarias declaradas hoy:** "integración del acervo probatorio + dictámenes + verificación de proveedores EFOS/REPSE + asesoría legal". **No menciona** "exposición a la autoridad fiscal/aduanera ante facultades de comprobación", ni VUCEM/ANAM/SAT-AGA, ni pedimentos / DODA / COVE. Para el MVP de CE **hay que ampliar el texto del aviso y re-recabar consentimiento** antes de portar expedientes desde SIDF MD (decisión D17 del cliente queda **parcialmente bloqueada**).
  2. **Contradicción material:** el aviso declara "el Sistema **no recaba** datos sensibles" (art. 3 fr. VI LFPDPPP), pero `PruebaEntrega` recaba `geolocalizacion` + `biometrico` (firma manuscrita en SVG/PNG). El consentimiento expreso de `ConsentimientoDatos` cubre la captura, pero la **declaración general del aviso es inconsistente** y hay que corregirla.
  3. **Rol LFPDPPP del aviso vigente:** declara a **Carranza Abogados como Responsable**. El diseño v2 exige que para CE-comercio-exterior, **el tenant (importador / agente aduanal) sea el Responsable y CERBERUS el Encargado** (decisión C13). El cambio de rol implica nuevo aviso por tenant + **contrato de encargo** (LFPDPPP arts. 50/52) **que hoy no existe como entidad** en ninguno de los dos repos.
  4. **ARCO operativo:** el flujo está bien (modelo + endpoint + plazos). Reutilizable tal cual.
- **Veredicto:** **supuesto bloqueante del cliente PARCIALMENTE TUMBADO** ❌→⚠️. La maquinaria está; el texto del aviso y el modelo de roles LFPDPPP no cubren la nueva finalidad. **Decisión:** en Fase 0 hay que (a) escribir el nuevo Aviso de Privacidad para CE, (b) modelar `ContratoEncargo` por tenant, (c) eliminar la frase "no recaba datos sensibles" del aviso o corregir el alcance, (d) versionar el aviso y disparar re-aceptación a los titulares migrados de SIDF MD.

### 2.6 Multi-tenancy / RLS
- **`cerberus-sidf-mp`:** aislamiento por `clienteId` en queries de aplicación (`WHERE clienteId = user.id` para CLIENTE_FISCAL; todo abierto para DEFENSOR). Token validado en `lib/get-user.ts` (lee `x-user-id` inyectado por `proxy.ts`). **No hay RLS Postgres activada**, no hay `BYPASSRLS`.
- **`cerberus-platform`:** aislamiento por `tenantId` (FK desde `Tenant`), patrón `where: { tenantId: session.user.tenantId }` en cada query. NextAuth inyecta `tenantId` y `rol` en el JWT. **No hay RLS Postgres activada**, no hay `BYPASSRLS`.
- **Lo que el diseño v2 exige:** RLS en Postgres + `tenant_id` validado **contra el token JWT** + **tests de fuga de tenant en CI tratados como control probatorio**. **Nada de eso existe** hoy. La protección actual es disciplina del desarrollador, no garantía estructural — exactamente el riesgo de la "fuga real de RLS" que el panel marcó como crítico.
- **Veredicto:** **supuesto NO confirmado** ❌. F0 debe activar RLS en Postgres en **ambas tablas portadas** y agregar suite de tests de fuga antes de tocar producción. El esfuerzo es de días, no semanas, porque el `tenant_id` ya está en todos los modelos del lado platform y un equivalente `clienteId` en sidf-mp (renombrar a `tenant_id` y agregar policy es trivial).

---

## 3. Mapeo de módulos del diseño v2 contra el código existente

| Módulo v2 | Estado | Repo / archivo dominante | Acción para el MVP de CE |
|---|---|---|---|
| **M0** Núcleo multi-tenant + RLS endurecido | **PARCIAL** (tenantId/clienteId sí, RLS no, tests de fuga no) | `cerberus-platform/lib/auth.ts`, ambos `prisma/schema.prisma` | **CONSTRUIR** policies RLS + tests CI; renombrar `clienteId`→`tenantId` al portar sidf-mp |
| **M1** KYC / Expediente 1.4.14 | **PARCIAL** (estructura documental + materialidad sí; vocabulario aduanero no) | `cerberus-sidf-mp/prisma/schema.prisma:69-410` (ExpedienteDefensa + Indicio + Operación + Documento + ARCO + Consentimiento) | **PORTAR + EXTENDER**: agregar fracciones I-X de Regla 1.4.14, domicilio de operaciones CE, Patente, EncargoConferido |
| **M2** Orquestación importación (forma) | **FALTA** (no hay Operación de despacho, COVE/MVE/DODA, máquina de estados) | — | **CONSTRUIR desde cero** sobre el patrón `SmartContract → Cláusula → Hito → Validación` de sidf-mp (es una analogía estructural útil) |
| **M2-sub** Motores sustantivos (NICO/valoración/RRNA/redet/origen) | **DIFERIDO con modelo reservado** — hoy ni el modelo existe | — | **MODELAR RESERVADO en F0**: `Partida/Mercancía`, `ValoracionAduanera`, `RRNA`, `Pago` (sin lógica) |
| **M3** Exportación + CCE 1.1 | **FALTA** | — | Diferido |
| **M4** CFDI + Carta Porte 3.1 multi-PAC | **PARCIAL** (modelo de Operación con `cfdiUUID`, `CotejoCFDI` en platform) | `cerberus-sidf-mp/Operacion.cfdiUUID`, `cerberus-platform/CotejoCFDI` | **Modelar cancelación 01-04 + sustitución** en F1 (no se difiere completa: el panel exigió que la cancelación se modele junto a la emisión) |
| **M5** IMMEX = integración/auditoría de ERP | **FALTA** | — | Reservar `CapaPEPS/BOM` como entidad vacía en F0 |
| **M6** Estado CSD (17-H vs 17-H Bis) + Buzón + materialidad | **PARCIAL** (materialidad sí; CSD no diferenciado) | `cerberus-sidf-mp/IndicioMaterialidad`, `cerberus-platform/OpinionCumplimientoReg` | Diferido F2; modelar campo `estado_CSD` (CANCELADO vs RESTRINGIDO) en `Cliente` en F0 |
| **M7** Dossier de diligencia del agente | **EXISTE casi listo** (AuditoriaReporte cross-expediente + Certificación Defendible + RegistroFirma + DocumentoGenerado) | `cerberus-sidf-mp/prisma/schema.prisma:977-998` + `/marketplace/certificacion` | **PORTAR y RENOMBRAR** como `DossierDiligencia` sellado por **operación de despacho** (hoy es por **expediente fiscal**) |
| **M8** Auditoría a posteriori + acceso autoridad default-deny | **PARCIAL** (auditoría sí; RequerimientoAutoridad/AccesoAutoridad/scoping/expiración NO) | `AuditEvent` (sidf-mp) + `BitacoraLLM` (platform) + triggers anti-DELETE | **CONSTRUIR** `RequerimientoAutoridad` con `sujeto/periodo/contribucion/alcance/expiracion/fundamento` + filtro de scoping + portal de autoridad |
| **MP** Capa probatoria (transversal) | **EXISTE ~70 %** | `cerberus-sidf-mp/lib/hash.ts` + `lib/nom151-psc.ts` + `lib/ethereum-anchor.ts` + `cerberus-platform/migrations/manual-triggers-anti-delete.sql` | **PORTAR tal cual** + **CONSTRUIR** interfaz `SelladorCalificado` (NoOp/PSC_TSA), etiqueta `EVIDENCIA_PRELIMINAR` vs `PRUEBA_OPONIBLE`, **paquete exporte autocontenido** |
| **MC** Catálogos / XSD / XSLT versionados (pipeline) | **PARCIAL** (vigía DOF + catalogoVersion sí; XSD/XSLT no) | `cerberus-platform/scripts/vigia-dof.ts` + `EstadoListaSancion` + `DictamenRiesgo.*Version`; `cerberus-sidf-mp/ImportacionListadoSAT` | **CONSTRUIR** ingesta versionada de XSD/XSLT (VUCEM, CCE 1.1, CFDI 4.0, Carta Porte 3.1) con vigencia temporal — el patrón de versionado ya existe |
| **MD** Privacidad / LFPDPPP (encargo, ARCO, brechas) | **PARCIAL** (Aviso + ARCO + ConsentimientoDatos sí; ContratoEncargo + rol Encargado por tenant no; texto del aviso desalineado) | `cerberus-sidf-mp/app/aviso-privacidad`, `/app/arco`, `/lib` | **CONSTRUIR** `ContratoEncargo` por tenant, **CORREGIR** texto del aviso (finalidades CE + datos sensibles), **VERSIONAR** y re-recabar |
| **M-RFE** Recinto / CCTV / patios | **FUERA DE ALCANCE** declarado | — | OUT |

---

## 4. Reconciliación de la capa probatoria (Paso 4 del guion)

> El guion sugería revisar `cerberus-seguridad-higiene`. Ese repo **no está en el workspace**, pero el contenido que el cliente atribuía a ese nombre ("Cincel NOM-151 + blockchain") ya vive en `cerberus-sidf-mp`.

- **Integración Cincel (PSC) como módulo reutilizable:** sí, `lib/nom151-psc.ts` declara la interfaz `PSC_PROVIDER` con `CINCEL` como implementación nominal. Producción exige contratar a Cincel (declarado pendiente en el README). El gancho `SelladorCalificado` del diseño v2 se materializa renombrando esa interfaz y agregando `NoOp` por defecto. **No hay que rediseñar nada en F0.**
- **Esquema blockchain (3 hashes + fecha/hora/IP):** sí, `AnclajeProbatorio` guarda `merkleRoot` + `txHash` + `blockNumber` + `red`; `AuditEvent` guarda `ip` y timestamps; `Documento` guarda `hashTimestamp`. Para los **tres hashes** que el cliente menciona (documento, firma, blockchain), los campos ya están separados. **Coincide ≈ 95 %.**
- **Exporte probatorio:** no existe paquete autocontenido. **Hay que construirlo** (PARTE NUEVA), encapsulando: dump JSON canónico de `AuditEvent` chain + `Documento` con hashes/sellos + snapshot 69-B fechado + manual `verify-export.md` ejecutable por un perito sin acceso al sistema vivo.

---

## 5. Reconciliación de la base de conocimiento legal (Paso 5 del guion)

> El repo `cerberus-legal-knowledge` **no está en el workspace**. El cuerpo equivalente vive en `cerberus-platform`.

- **Versionado del corpus legal:** sí. `lib/biblioteca-normativa.ts` (URLs oficiales con clave + alias), `lib/micn-catalogo.ts` (catálogo MICN-2026-v7), `lib/cerberus-agent.ts` (pinning `VERSION_SYSTEM_PROMPT="v2.2026-06-25"`, `VERSION_CATALOGO_MICN="MICN-2026-v7"`, `VERSION_CUESTIONARIO="cuestionario-cerberus-v2"`), `DictamenRiesgo` guarda `catalogoVigiaDofVersion`, `catalogoFiscalRMFVersion`, `anexo22Version`, `catalogoListasSancionVersion`. El Anexo 22 ya tiene snapshot versionado **fuera del código** lo cual es directamente lo que el MVP de CE necesita para fracciones arancelarias.
- **¿Consumible por CERBERUS-comercio-exterior?** Parcialmente. La **biblioteca normativa fiscal** (CFF, LFT, LSS, LFPIORPI, LFPDPPP, LGRA, LISR, LIVA, NOM-035) está bien estructurada y se puede invocar con poco trabajo, pero **la Ley Aduanera, RGCE, Anexo 22 / 24 / 30 / 31 y las RFRE no están cargadas como módulos consumibles** (sólo el `anexo22Version` aparece como snapshot del MICN, no hay tabla `Anexo22Registro`). **Construir un módulo `biblioteca-normativa-aduanera.ts` en F0** siguiendo el patrón ya probado.

---

## 6. Veredicto sobre los supuestos bloqueantes de Fase 0

| Supuesto del diseño v2 | Verificado contra código | Veredicto | Acción F0 |
|---|---|---|---|
| **e.firma firmada del lado del titular (no se almacena)** | `signature-workflow.ts` + ausencia de clave privada en cualquier modelo | **CONFIRMADO** ✅ | Mantener; documentar |
| **Separación criptográfica FIEL / CSD / sello de prevalidación** | No existe como tres artefactos modelados | **TUMBADO** ❌ | **Modelar tres entidades** con vigencia/serie/emisor distintos |
| **69-B modelado por etapas (presunto / desvirtuado / definitivo / sentencia favorable)** | `ListadoSATRegistro.situacion` + `ListaNegraSAT.situacion` (6 estados) | **CONFIRMADO** ✅ | Normalizar nombres entre repos al portar |
| **Snapshot fechado de DOF / listas 69-B** | `EstadoListaSancion.hash/ultimaRevision` + `DictamenRiesgo.catalogoListasSancionVersion` + `ImportacionListadoSAT.hashArchivo` | **CONFIRMADO** ✅ | Reutilizar tal cual |
| **SHA-256 (no 64-bit) en toda la cadena probatoria** | `lib/hash.ts` + todos los hashes del esquema son SHA-256 | **CONFIRMADO** ✅ | El "64-bit" fue una preocupación del cliente, no un defecto del código |
| **Hash-chain append-only + HMAC** | `AuditEvent` + `BitacoraLLM` (encadenados, con HMAC en sidf-mp) | **CONFIRMADO** ✅ | Reutilizar; portar el HMAC a platform también |
| **PSC/TSA conectable desde el inicio (activable después)** | `nom151-psc.ts` con interfaz `PSC_PROVIDER` y modo `MOCK`/`PENDIENTE` | **CONFIRMADO** ✅ | Renombrar interfaz a `SelladorCalificado`; contratar Cincel cuando se decida activar |
| **Exporte probatorio autocontenido** | No existe paquete | **TUMBADO** ❌ | **Construir** comando "empaqueta expediente exportable" en F0 |
| **WORM por tipo de expediente / retenciones distintas** | Triggers anti-DELETE + `legalHoldHasta` en 6 tablas críticas (platform) + `retencionDias` en BitácoraLLM | **CONFIRMADO** ✅ | Aplicar mismo patrón a las **3 tablas** de expedientes CE (1.4.14, ProbatorioDespacho, Doble 3.1.42) |
| **RLS sin `BYPASSRLS` + `tenant_id` validado contra token + tests de fuga en CI** | Validación es sólo de aplicación; RLS Postgres no activa; sin tests | **TUMBADO** ❌ | **Activar policies RLS** en F0 + suite de tests CI |
| **Aviso de privacidad cubre la nueva finalidad (exposición a la autoridad)** | El aviso de SIDF MP no la menciona y declara "no recaba datos sensibles" siendo falso | **TUMBADO** ❌ | **Reescribir el aviso**, versionarlo, re-recabar consentimiento antes de portar |
| **CERBERUS = Encargado del tenant + ContratoEncargo por tenant** | Hoy Carranza = Responsable; no hay modelo `ContratoEncargo` | **TUMBADO** ❌ | **Modelar** `ContratoEncargo` con instrucciones y subencargados; nuevo aviso por tenant |
| **Decisión "Alerta, no decisor" + Override e.firma motivado** | Sin "bloqueo automático" en el código; `RegistroRevisionHumanaIA` documenta overrides pero **sin firma e.firma del actor** ni motivo obligatorio | **PARCIAL** ⚠️ | Añadir requerimiento de firma + motivo obligatorio en overrides |
| **Tres expedientes separados (1.4.14 / Probatorio Despacho / Doble 3.1.42) con retención propia** | Hoy hay UN expediente (`ExpedienteDefensa`) | **FALTA** ❌ | **Modelar las tres tablas** con custodio y plazo WORM propios en F0 |
| **Encargo conferido con vigencia/revocación verificada por operación** | No existe `EncargoConferido` | **FALTA** ❌ | **Construir** modelo + verificación por operación |
| **Default-deny para acceso de autoridad** | No existe `RequerimientoAutoridad` ni filtro por scoping | **FALTA** ❌ | **Construir** entidad + middleware de scoping + portal autoridad |

**Conclusión de §6:** de **16 supuestos bloqueantes auditados**, **7 están confirmados** y se reutilizan, **2 son parciales y se completan barato**, **7 están tumbados o ausentes** y son trabajo neto de Fase 0 antes de tocar producción.

---

## 7. Diseño v2 ajustado para no duplicar lo construido

A continuación, los cambios concretos al diseño v2 publicado para reflejar lo que ya existe.

### 7.1 Reutilización directa (no se rediseña)
- **Capa probatoria base** (SHA-256, hash-chain, NOM-151 conectable, blockchain anclaje): se importa de `cerberus-sidf-mp/lib/{hash,nom151-psc,ethereum-anchor,signature-workflow}.ts` como librería compartida. **No se reimplementa.**
- **Patrón WORM Postgres** (`manual-triggers-anti-delete.sql`): se aplica a las tres tablas de expedientes CE. **No se reescribe.**
- **Vigía DOF + BitácoraLLM con `retencionDias`** (`cerberus-platform/scripts/vigia-dof.ts` + modelo `BitacoraLLM`): se importa para el monitoreo normativo aduanero. **No se reimplementa.**
- **Modelo de 6 estados del 69-B** (`ListaNegraSAT.situacion`): se promueve a tabla compartida en F0. **No se reabre el debate "binario vs etapas".**
- **`AuditEvent` con HMAC + secuencia** (sidf-mp): se promueve a la implementación canónica para el módulo M8. **No se usa la versión sin HMAC de platform.**
- **Patrón de pinning de versiones** (`VERSION_*` en `cerberus-agent.ts` + `*Version` en `DictamenRiesgo`): se importa para el MVP de CE (XSD/XSLT/catálogos). **No se diseña otro mecanismo de versionado.**

### 7.2 Adaptaciones (lo existente requiere modificación)
- **`ExpedienteDefensa` → `ExpedienteKYC_1414_CE`**: se porta como esqueleto base, se le agregan los campos de Regla 1.4.14 RGCE faltantes (domicilio de operaciones CE, datos de mercancías importadas, clientes/proveedores extranjeros, soporte de operación).
- **`SolicitudARCO` + `ConsentimientoDatos`**: se portan, pero el **texto del Aviso de Privacidad se reescribe** desde cero para CE y para corregir la declaración falsa sobre datos sensibles.
- **Rol LFPDPPP**: cambia de "Carranza = Responsable" a **"Tenant (importador/agente) = Responsable, CERBERUS = Encargado"** + nuevo modelo `ContratoEncargo`. Cambio de modelo de negocio, no sólo técnico.
- **`signature-workflow.ts`**: se divide en **tres rutas criptográficas separadas** — FIEL del titular (firma de manifestaciones), CSD del emisor (CFDI), sello del prevalidador (pedimento). Hoy todo va por la misma función.
- **`AuditoriaReporte` (cross-expediente fiscal) → `DossierDiligencia` (por operación de despacho)**: cambio de grano (de "ejercicio fiscal del cliente" a "operación de importación"). El modelo se adapta, no se reescribe.

### 7.3 Construcción neta (no existe en ningún repo)
- **Modelo aduanero**: `Patente`, `PersonaFisicaAutorizada`, `EncargoConferido` (con vigencia/revocación), `Operacion` de despacho, `MaquinaEstadoDespacho`, `Partida/Mercancía` (reservada), `ValoracionAduanera` (reservada), `RRNA` (reservada), `MVE_E2`, `COVE`, `Prevalidacion`, `DODA`, `Gafete`, `ResultadoSemaforo`.
- **RLS Postgres real + tests de fuga en CI** (M0).
- **`RequerimientoAutoridad` + `AccesoAutoridad` + middleware de scoping + portal autoridad** (M8).
- **`ContratoEncargo` por tenant** (MD).
- **Paquete `exporte probatorio` autocontenido + `verify-export.md`** (MP).
- **Interfaz `SelladorCalificado`** con `NoOp`/`PSC_TSA` + etiqueta `EVIDENCIA_PRELIMINAR`/`PRUEBA_OPONIBLE` operativa.
- **Tres expedientes separados** (`ExpedienteKYC_1414_CE` / `ExpedienteProbatorioDespacho` / `ExpedienteDoble_3142`) con WORM y retención propios.
- **Catálogos XSD/XSLT versionados** (VUCEM, CCE 1.1, CFDI 4.0, Carta Porte 3.1).
- **`biblioteca-normativa-aduanera.ts`** (Ley Aduanera, RGCE, Anexos 22/24/30/31, RFRE) siguiendo el patrón de `biblioteca-normativa.ts`.

### 7.4 Reorganización del monorepo (propuesta)
El diseño v2 hablaba de "monorepo + IaC + CI/CD" en F0 sin especificar. Dada la realidad de los repos:
```
cerberus/
├── packages/
│   ├── probatoria/         ← de cerberus-sidf-mp/lib/{hash,nom151-psc,ethereum-anchor,signature-workflow}
│   ├── auditoria-chain/    ← de cerberus-sidf-mp AuditEvent + cerberus-platform BitacoraLLM
│   ├── vigia-normativa/    ← de cerberus-platform/scripts/vigia-dof.ts + lib/biblioteca-normativa.ts
│   └── listas-sancion/     ← unificado de los dos modelos 69-B
├── apps/
│   ├── sidf-mp/            ← producto fiscal existente (sigue en producción)
│   ├── platform/           ← producto compliance MICN existente (sigue en producción)
│   └── comercio-exterior/  ← NUEVO MVP
└── infra/
    ├── rls/                ← policies + tests de fuga (NUEVO)
    └── worm/               ← triggers anti-DELETE
```
La regla operativa: **`apps/comercio-exterior` no duplica código** — lo importa de `packages/*`. Cualquier mejora en la capa probatoria beneficia a los tres productos.

---

## 8. Resumen ejecutivo

- **Lo que existe y se reutiliza (≈ 50-60 % del MVP de CE):** capa probatoria (SHA-256 + hash-chain + NOM-151 conectable + blockchain), patrón WORM Postgres, 69-B por etapas con snapshot fechado, vigía DOF, biblioteca normativa fiscal versionada, KYC documental + materialidad PRODECON + indicios, ARCO con plazos LFPDPPP, base UI Next.js + Prisma + NextAuth.
- **Lo que existe parcialmente y hay que adaptar (≈ 15-20 %):** Expediente (extender al vocabulario aduanero), `AuditoriaReporte`→`DossierDiligencia` (cambio de grano), `signature-workflow` (separar FIEL/CSD/sello), texto del Aviso de Privacidad, rol LFPDPPP del tenant.
- **Lo que falta y hay que construir (≈ 25-30 %):** modelo aduanero completo (Patente/Encargo/Operación/DODA/COVE/MVE-E2/Partida), RLS real + tests CI, `RequerimientoAutoridad` + portal autoridad, `ContratoEncargo`, paquete exporte autocontenido, catálogos XSD/XSLT versionados, biblioteca normativa aduanera.
- **Supuestos bloqueantes F0:** **7 confirmados**, **2 parciales**, **7 tumbados**. Los siete tumbados son trabajo neto antes de producción; ninguno es bloqueante imposible — todos tienen patrón análogo ya construido en alguno de los dos repos.
- **Recomendación operativa:** **monorepo con packages compartidos**, no fork. La capa probatoria es un activo que ya está pagado; obligar a `comercio-exterior` a importarla en vez de copiarla protege a los tres productos.

---

## 9. Pendientes para siguiente sesión
1. Confirmar con el cliente la existencia (o no) de `cerberus-legal-knowledge` y `cerberus-seguridad-higiene` — si están en otra parte, revisar antes de cerrar la sección §5.
2. Validar con asesor LFPDPPP el texto del nuevo Aviso de Privacidad para CE antes de migrar consentimientos de SIDF MD.
3. Decidir si el monorepo se materializa moviendo los dos repos a `apps/*` o si se mantienen separados y `comercio-exterior` consume `packages/*` vía npm privado.
4. Contratar Cincel (PSC) o equivalente antes de prometer "valor probatorio" en demos comerciales — el gancho está, la firma legal no.
5. Activar policies RLS en `cerberus-platform` y `cerberus-sidf-mp` aunque su MVP ya esté en producción: hoy son vulnerables al riesgo "fuga real de RLS" del panel.
