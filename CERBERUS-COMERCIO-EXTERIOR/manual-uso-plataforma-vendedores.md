# CERBERUS Comercio Exterior — Manual de uso de la plataforma
### Guía de capacitación para el equipo de ventas

**Versión:** julio 2026 · **URL de la plataforma:** https://cerberus-comercio-exterior.vercel.app

---

## 1. Qué es CERBERUS y por qué existe

CERBERUS Comercio Exterior es una plataforma SaaS de **cumplimiento aduanero y
fiscal mexicano** para agencias aduanales, agentes aduanales y empresas
importadoras/exportadoras.

**El contexto que lo hace indispensable (úsenlo al abrir toda conversación de
venta):** la reforma a la Ley Aduanera (DOF 19-nov-2025, en vigor desde el
1 de enero de 2026) convirtió al agente aduanal en **responsable SOLIDARIO**
de las operaciones de sus clientes y eliminó las excluyentes de
responsabilidad. Un cliente que resulte EFOS, un pedimento mal cuadrado o un
expediente incompleto ya no es "problema del importador": es patrimonio del
agente en riesgo. CERBERUS es el **seguro de debida diligencia**: verifica,
documenta, sella criptográficamente y deja evidencia inmutable de que el
agente hizo todo lo que la norma exige.

**Frase ancla de venta:** *"CERBERUS no evita que tu cliente tenga problemas
con el SAT; evita que sus problemas se conviertan en los tuyos."*

### Los tres pilares (así se explica en 1 minuto)

1. **CONOCE** a tu cliente y proveedor: expediente 1.4.14 completo,
   verificación contra los listados del SAT (69, 69-B, sanciones
   internacionales, padrón), opiniones de cumplimiento autenticadas.
2. **DOCUMENTA** cada operación: bóveda de documentos del despacho, pedimentos,
   CFDI con Carta Porte y Comercio Exterior, cotejo IMMEX — todo sellado con
   huella criptográfica SHA-256 y bitácora encadenada (evidencia que un perito
   puede verificar).
3. **VIGILA** todos los días: el "vigía" re-verifica automáticamente a todos
   los clientes cada mañana y avisa por Telegram y correo a las personas
   correctas (CEO, CFO, operador) cuando algo empeora o está por vencer.

### Principio de diseño C9 (respuesta a la objeción "¿me va a frenar?")

CERBERUS **alerta, nunca bloquea**. El sistema jamás impide una operación:
informa, deja constancia y el humano decide. La responsabilidad de decidir es
del agente; la de documentar la decisión, de CERBERUS.

---

## 2. Acceso y primeros pasos

1. Entrar a **https://cerberus-comercio-exterior.vercel.app**.
2. Iniciar sesión con correo y contraseña (las cuentas las crea el
   administrador de la agencia en **Usuarios**).
3. Roles disponibles: **ADMIN** (todo), **AGENTE**, **OPERADOR** (captura),
   **AUDITOR**, y **AUTORIDAD** (un rol especial de solo lectura para dar a la
   autoridad el "acceso remoto continuo" que exige la reforma — punto de venta
   fuerte, ver §10).
4. El **Dashboard** es la pantalla de inicio: accesos a clientes, operaciones,
   tablero ejecutivo, vigencias y administración.

> 💡 **Regla de oro de la plataforma (repítanla en cada demo):** *el
> capturista nunca teclea lo que un documento ya dice.* Casi todo formulario
> acepta subir el documento fuente (PDF/XML/CSV) y la IA extrae y prellena los
> datos; el usuario solo revisa y confirma.

---

## 3. Clientes: alta y expediente

### 3.1 Alta de cliente desde la CSF (demo estrella de 60 segundos)

**Clientes → Nuevo.** Arriba está el recuadro "Da de alta desde la CSF
(recomendado)": se sube la **Constancia de Situación Fiscal** en PDF y el
sistema extrae y precarga **RFC, razón social y domicilio** (los campos
precargados se marcan en verde). El vendedor debe subrayar: *un RFC mal
tecleado aquí contamina todo el sistema; por eso CERBERUS lo lee del documento
oficial.*

### 3.2 Panorama del cliente (la pantalla que enamora a los directores)

**Clientes → (cliente) → Panorama.** Un solo lugar con el semáforo GLOBAL del
cliente (EN ORDEN / CON OBSERVACIONES / REQUIERE ATENCIÓN) y el estado de:
CSD 17-H, etapa 69-B, expediente KYC, las 8 fuentes de verificación, la última
opinión 32-D con su cotejo, e.firma, operaciones y pedimentos. Desde aquí se
navega a todo lo demás.

### 3.3 Cumplimiento: las 8 fuentes en una pantalla

**Panorama → Cumplimiento / documentos.** Botón **"Verificar todo"**: cruza el
RFC del cliente contra los listados REALES del SAT (descargados y sellados):

| Fuente | Qué detecta |
|---|---|
| Art. 69 CFF | Créditos firmes / no localizados |
| Art. 69-B | EFOS (facturación de operaciones inexistentes) |
| Art. 69-B Bis | Transmisión indebida de pérdidas |
| Art. 49 Bis | Inhabilitación de operaciones |
| Opinión 32-D | Opinión de cumplimiento vigente |
| CSD 17-H | Sellos digitales restringidos/cancelados |
| Sanciones internacionales | OFAC/ONU/UE/UK (por nombre, siempre con revisión humana) |
| Padrón de Importadores | Activo / suspendido / no localizado |

Cada verificación guarda **snapshot con huella SHA-256** del listado usado —
si mañana el SAT pregunta "¿cómo sabías que estaba al corriente?", la
respuesta está sellada con fecha. Incluye el historial 69-B completo y los
**overrides motivados** (si el agente decide operar pese a una alerta, queda
documentado quién y por qué — eso también es debida diligencia).

### 3.4 Expediente KYC 1.4.14 (regla de conocimiento del cliente)

**Panorama → KYC 1.4.14.** Dos partes:

**a) Bóveda de documentos** — checklist con los documentos que la regla exige
(identificación oficial del representante, acta constitutiva, poder,
comprobante de domicilio fiscal, comprobante del domicilio de operaciones de
comercio exterior —novedad de la 1ª Modif. RGCE 2026—, CSF). El sistema marca
cuáles son obligatorios según persona física o moral. Cada archivo se sella
con SHA-256 y se custodia en almacenamiento inmutable (WORM).

**b) Cuestionario** — datos generales (tipo de persona, representante legal
con su identificación, residencia fiscal, contacto), materialidad (domicilio,
contratos, infraestructura, empleados) y la manifestación bajo protesta de no
tener vínculos con EFOS. **Magia para la demo:** al subir la CSF a la bóveda,
el cuestionario se **prellena solo**; y en re-capturas aparece precargado con
la última versión sellada — solo se modifica lo que cambió. Cada sellado crea
una **nueva versión**; las anteriores nunca se borran (historial probatorio).
El vigía avisa cuando toca la **re-actualización trienal**.

### 3.5 Opinión de cumplimiento 32-D con cotejo ante el SAT (demo "wow")

**Panorama → Opinión 32-D.** El cliente entrega su opinión impresa/PDF (SAT o
IMSS). Se sube el PDF y CERBERUS, en segundos:

1. Extrae la **Cadena Original** y el **Sello Digital** del documento.
2. **Verifica criptográficamente el sello** descargando el certificado del SAT
   desde su repositorio oficial (RCCF) — detecta opiniones falsificadas.
3. **Lee el QR directamente del PDF** (sin fotos ni escáneres) y **coteja en
   vivo contra el validador oficial del SAT**, guardando la respuesta como
   evidencia sellada.
4. Da el veredicto: **AUTÉNTICA / SOSPECHOSA / NO AUTÉNTICA**, con enlace
   "Abrir cotejo en el portal del SAT" para que cualquiera lo compruebe.

Si algo no se puede cotejar, la pantalla dice exactamente por qué y ofrece
"Reintentar cotejo". **Argumento de venta:** *nadie más valida la autenticidad
del papel; CERBERUS detecta la opinión "photoshopeada" que un cliente
malicioso entrega.*

### 3.6 Otros expedientes del cliente

- **e.firma**: el cliente entrega su certificado (.cer) y se valida
  vigencia/titularidad. La llave privada **jamás** se almacena (decisión C14).
- **Encargo conferido (B14/B21)**: registro y vigencia; el vigía avisa el
  vencimiento.
- **Expediente doble 3.1.42**: la regla exige que agente Y empresa conserven
  cada uno su expediente — dos columnas con documentos sellados por parte.
- **Notificaciones**: ver §7.

---

## 4. Operaciones: el despacho documentado

**Operaciones → Nueva** (se elige el cliente y una referencia interna).
Dentro de cada operación:

### 4.1 Partidas y contribuciones
Captura de partidas con **cálculo automático de contribuciones** (IGI, DTA,
IEPS, IVA) partida por partida y totales del pedimento. Ingesta **masiva por
CSV** para operaciones grandes. Cada partida sellada con SHA-256.

### 4.2 Encabezado del pedimento
Se sube el **pedimento en PDF** y se prellenan número (15 dígitos), aduana,
clave, régimen y tipo de cambio — validados contra el formato del Anexo 22.

### 4.3 CFDI con complementos (sin re-teclear)
- **Carta Porte 3.1** (traslado) y **Comercio Exterior 1.1** (exportación).
- Los RFC del emisor/receptor, clave de pedimento, tipo de cambio y mercancías
  **se precargan de lo que el sistema ya sabe**; y se puede subir el **XML de
  la factura** para prellenar el resto.
- **Cuadre automático CFDI ↔ Pedimento**: semáforo que compara fracciones y
  valores (el mismo cruce que hace el SAT en auditoría, pero antes de que el
  SAT lo haga). *Punto de venta:* una discrepancia detectada hoy cuesta una
  corrección; detectada por el SAT, cuesta multa.

### 4.4 Trámites del despacho (MVE, COVE, prevalidación, pago, DODA)
Registro de cada paso con la opción de **adjuntar el acuse real** (PDF/XML),
que se sella y custodia en la bóveda — ya no un simple folio tecleado.

**Prevalidación interna** (botón "Prevalidar"): 18 verificaciones en los 4
criterios del Reglamento de la Ley Aduanera 2026 (sintáctico, catalógico,
estructural, normativo): números y claves bien formados, fracciones válidas,
totales que cuadran contra el recálculo, encargo conferido vigente, opinión
reciente. Informe sellado. *No sustituye al prevalidador autorizado: atrapa
los errores antes de pagar por transmitir.*

### 4.5 Expediente y bóveda del despacho
**Operación → Expediente.** Checklist de los **17 tipos documentales** del
trámite de importación (pedimento, factura comercial, carta porte, documento
de transporte, COVE, DODA, manifestación de valor, certificado de origen,
permisos/NOMs, garantía de precios estimados, e-documents VUCEM…). Al subir la
**carta porte XML**, los datos se extraen automáticamente. Todo sellado, todo
versionado.

### 4.6 Dossier y exporte probatorio
Si la operación cae en **rojo**, se genera el dossier de diligencia. En
cualquier momento se puede descargar el **exporte probatorio autocontenido**:
un paquete verificable por perito con la cadena de hashes completa. *Este es
el producto en una frase: la operación entera, demostrable.*

---

## 5. IMMEX: el libro de cotejo (Anexos 24/30/31)

**Cliente → Saldos IMMEX.** Para clientes con programa IMMEX:

- Registro de **entradas** (importaciones temporales con su pedimento y fecha
  límite de retorno) y **descargos** (retornos), uno a uno o por CSV.
- **Motor PEPS**: cada descargo consume automáticamente las entradas más
  antiguas, como exige la mecánica del Anexo 24.
- **Dos tablas comparables**: el libro de cotejo de CERBERUS y lo que reporta
  el ERP del cliente — las discrepancias saltan a la vista.
- **Semáforo de plazos de retorno** y alertas de: plazo vencido/por vencer,
  **saldos no retornados** (crítico si el cliente está certificado IVA/IEPS:
  el crédito fiscal se vuelve exigible) y violaciones de la **regla de las
  48 horas** de actualización.
- **Reporte mensual de descargos** descargable (base del Anexo 30).

**Aclaración honesta para el vendedor (no prometer de más):** CERBERUS **no
sustituye** el sistema de control de inventarios oficial que la empresa IMMEX
está obligada a llevar; es el **auditor paralelo** del agente que detecta a
tiempo lo que le puede costar la patente.

---

## 6. El Vigía: monitoreo automático diario

Todos los días a las **6:00 am (CDMX)**, sin que nadie haga nada:

1. Descarga y sella los listados actualizados del SAT (69, 69-B…).
2. **Re-verifica a TODOS los clientes** contra los listados frescos.
3. Revisa **vencimientos**: opiniones, encargos, contratos, documentos,
   re-actualización trienal del KYC, plazos IMMEX.
4. Si algo **empeoró** o está por vencer → alerta inmediata.

Además, cada **lunes** se envía el **reporte semanal ejecutivo**: "✅ Todo en
orden" o "⚠️ Requiere atención" con las cifras de la semana — el cliente sabe
que lo cuidan aun cuando no pasa nada.

---

## 7. Notificaciones a la medida de cada cliente

**Cliente → Notificaciones.** Aquí el cliente define **quién recibe qué**:

- **Destinatarios**: CEO, CFO, OCN, operaciones, legal — cada uno con su canal
  (**Telegram** o **correo**) y las **categorías** que le interesan
  (cumplimiento, vigencias, opinión 32-D, despacho, KYC, sanciones, IMMEX,
  reporte semanal).
- Los avisos llegan **agrupados en un solo mensaje por persona** (digest), no
  como spam.
- Botón **"Probar envío"** para validar la configuración al instante.
- Panel de **estado de canales** (Telegram/correo configurados o no).

*Punto de venta:* el CFO del cliente recibe SU información en SU canal — la
agencia deja de ser un cuello de botella de comunicación.

---

## 8. Tablero ejecutivo y vigencias

- **Tablero ejecutivo**: la cartera completa de clientes con sus semáforos —
  para la dirección de la agencia.
- **Vigencias**: calendario de TODO lo que vence en el tenant, ordenado por
  urgencia.

---

## 9. La capa probatoria (el diferenciador técnico-jurídico)

Para cuando el prospecto pregunte "¿y esto vale en un litigio?":

- Todo artefacto (documento, verificación, cuestionario, movimiento) se sella
  con **SHA-256** y se registra en una **bitácora inmutable encadenada**: cada
  evento contiene la huella del anterior — alterar uno rompe toda la cadena.
- Los archivos se custodian en almacenamiento **WORM** (se escribe una vez,
  nunca se sobrescribe), direccionados por su propia huella.
- El **exporte probatorio** permite a un perito independiente verificar la
  integridad sin acceso al sistema.
- Hoy los sellos son *evidencia preliminar*; la plataforma está preparada para
  elevarlos a **prueba oponible** (NOM-151) conectando un PSC — se ofrece como
  upgrade.

---

## 10. Portal de la autoridad (rol AUTORIDAD)

La reforma exige dar a la autoridad **acceso remoto de consulta**. CERBERUS lo
resuelve con el portal `/autoridad`: un usuario con rol AUTORIDAD ve —en solo
lectura, sin un solo botón de edición— las operaciones, sus pasos, los
documentos con sus huellas y la bitácora verificable. *Punto de venta:* cuando
la autoridad pida acceso, la agencia lo entrega en minutos, controlado y
auditado, en lugar de improvisar carpetas.

---

## 11. Guion de demo sugerido (15 minutos)

| Min | Paso | Mensaje |
|---|---|---|
| 0-1 | Contexto: responsabilidad solidaria 2026 | "El riesgo ya es tuyo; te enseño cómo lo blindas" |
| 1-3 | Alta de cliente subiendo la CSF | "Nadie tecleó el RFC: lo leyó del documento oficial" |
| 3-5 | Cumplimiento → Verificar todo | "8 fuentes del SAT en un clic, con evidencia sellada" |
| 5-8 | Opinión 32-D: subir PDF → veredicto + cotejo QR ante el SAT | "Detectamos opiniones falsificadas; compruébalo tú mismo en el portal del SAT" |
| 8-10 | KYC: bóveda + cuestionario prellenado | "La regla 1.4.14 completa, sin re-teclear nada" |
| 10-12 | Operación: partidas CSV + cuadre CFDI↔pedimento + prevalidar | "Los errores que el SAT te cobraría, atrapados antes" |
| 12-14 | Notificaciones: probar envío al Telegram del prospecto | "Tu CFO recibiría esto mañana a las 6 am sin que nadie mueva un dedo" |
| 14-15 | Exporte probatorio | "Y todo esto, demostrable ante un perito. Eso es debida diligencia" |

## 12. Objeciones frecuentes

- **"Ya tengo un sistema de pedimentos."** CERBERUS no compite con tu sistema
  de transmisión: es la capa de *cumplimiento y evidencia* que ninguno trae.
- **"¿Me va a bloquear operaciones?"** Nunca (principio C9): alerta y
  documenta; tú decides, y tu decisión queda respaldada.
- **"¿Y mis datos?"** Aislamiento por agencia a nivel base de datos (RLS),
  cada quien ve solo lo suyo; la llave FIEL jamás se almacena.
- **"¿El SACI del Anexo 24 me lo lleva CERBERUS?"** No — ese es tuyo por ley;
  CERBERUS lo audita en paralelo y te avisa antes de que el SAT encuentre la
  diferencia.

## 13. Glosario mínimo para vendedores

**EFOS** empresa que factura operaciones simuladas (lista 69-B) · **32-D**
opinión de cumplimiento de obligaciones fiscales · **CSD** certificado de
sello digital · **KYC 1.4.14** expediente de conocimiento del cliente
(RGCE) · **MVE/E2** manifestación de valor electrónica · **COVE** comprobante
de valor electrónico · **DODA** documento de operación para despacho
aduanero · **IMMEX** programa de importación temporal para exportación ·
**PEPS** primeras entradas, primeras salidas · **WORM** almacenamiento de una
sola escritura · **SHA-256** huella criptográfica única de un archivo ·
**RLS** aislamiento de datos por agencia a nivel base de datos.

---

*Manual generado para capacitación interna del equipo comercial. La
plataforma evoluciona continuamente; verificar contra la versión en
producción antes de cada ciclo de capacitación.*
