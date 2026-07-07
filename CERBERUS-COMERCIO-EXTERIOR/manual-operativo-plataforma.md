# CERBERUS Comercio Exterior — Manual operativo de la plataforma

**Versión:** julio 2026 · **URL:** https://cerberus-comercio-exterior.vercel.app
**Audiencia:** usuarios de la plataforma (operadores, capturistas, agentes, administradores).

---

## Índice

1. Acceso, sesión y roles
2. Conceptos que aplican en toda la plataforma
3. Clientes: alta y gestión
4. Panorama del cliente
5. Cumplimiento (verificación contra listados)
6. Expediente KYC 1.4.14
7. Opinión de cumplimiento 32-D
8. e.firma, Encargo conferido y Expediente doble
9. Operaciones y despacho
10. IMMEX (libro de cotejo)
11. Notificaciones y destinatarios
12. Vigía automático y reportes
13. Administración (usuarios, listados, contrato de encargo)
14. Portal de la autoridad
15. Solución de problemas frecuentes

---

## 1. Acceso, sesión y roles

- Entrar a la URL de la plataforma e iniciar sesión con **correo y contraseña**.
- Sin sesión válida, toda pantalla redirige a `/login`.
- Las cuentas las crea un usuario ADMIN en **Usuarios** (ver §13).

**Roles y qué puede hacer cada uno:**

| Rol | Alcance |
|---|---|
| ADMIN | Todo, incluida la administración de usuarios y listados |
| AGENTE | Operación completa de clientes y despachos |
| OPERADOR | Captura diaria (rol por defecto) |
| AUDITOR | Consulta |
| AUTORIDAD | SOLO lectura del portal `/autoridad` (ver §14) |

Cada usuario pertenece a **una agencia (tenant)** y solo ve los datos de su
agencia — el aislamiento se aplica a nivel base de datos, no es configurable.

---

## 2. Conceptos que aplican en toda la plataforma

**2.1 Captura asistida.** Casi todo formulario acepta subir el documento
fuente (PDF, XML o CSV). El sistema extrae los datos y **prellena** los
campos, que se marcan con **fondo verde** y una etiqueta "precargado". El
usuario siempre puede editar; al editar a mano, la marca desaparece. El
prellenado **nunca sobrescribe** lo que ya se tecleó.

**2.2 Sellos y bitácora.** Cada documento, cuestionario, verificación o
movimiento genera una **huella SHA-256** y un evento en la **bitácora
encadenada** (cada evento guarda la huella del anterior). Esto no requiere
ninguna acción del usuario; es automático. Los sha256 que se muestran
abreviados (p. ej. `a3f9c2e1…`) tienen su valor completo en el detalle.

**2.3 Semáforos.** Verde = en orden · Ámbar = con observaciones / por vencer ·
Rojo = requiere atención / vencido · Gris = sin datos / no disponible.

**2.4 El sistema alerta, no bloquea.** Ninguna alerta impide guardar ni
operar. Cuando el usuario decide continuar pese a una alerta, puede registrar
un **override motivado** (ver §5) que documenta la decisión.

**2.5 Diagnóstico visible.** Cuando algo no se puede hacer (un QR que no se
lee, un servicio externo caído), la pantalla lo dice con el motivo específico
y, cuando aplica, ofrece un botón de reintento o una vía manual.

---

## 3. Clientes: alta y gestión

**Clientes** (menú principal) lista los clientes de la agencia.

### 3.1 Alta de un cliente

1. **Clientes → Nuevo**.
2. Opción recomendada: en el recuadro **"Da de alta desde la CSF"**, subir la
   **Constancia de Situación Fiscal** (PDF). El sistema extrae RFC, razón
   social y domicilio y los precarga.
3. Revisar/corregir los campos y pulsar **Registrar cliente**.
4. Si no se tiene la CSF a la mano, se pueden teclear los campos directamente.

> El domicilio capturado aquí se usa después en el expediente KYC.

### 3.2 Ficha del cliente

Cada cliente tiene sub-secciones (accesibles desde su Panorama): Cumplimiento,
KYC 1.4.14, Opinión 32-D, e.firma, Encargo, Expediente doble 3.1.42, Saldos
IMMEX y Notificaciones.

---

## 4. Panorama del cliente

**Clientes → (cliente) → Panorama.** Pantalla de consolidación:

- **Estado global** (recuadro superior derecho): EN ORDEN / CON OBSERVACIONES /
  REQUIERE ATENCIÓN. Se calcula con: inhabilitaciones, etapa 69-B, estado del
  CSD, existencia del expediente KYC y el veredicto de la última opinión.
- **Tarjetas base**: CSD (17-H), etapa 69-B, expediente KYC (sellado y número
  de documentos), conteo de operaciones/pedimentos.
- **Verificación de cumplimiento**: las 8 fuentes con su último resultado.
- **Opinión 32-D** y **e.firma/IMMEX**: último veredicto y accesos.
- **Expedientes y accesos**: enlaces a todas las sub-secciones.

Úsese como punto de partida de cualquier gestión sobre un cliente.

---

## 5. Cumplimiento (verificación contra listados)

**Panorama → Cumplimiento / documentos.**

### 5.1 Verificar

- Botón **"Verificar todo"**: cruza el RFC (y el nombre, para sanciones)
  contra los listados cargados en el sistema. Genera un registro por fuente
  con fecha, resultado y huella del listado usado.
- Resultados posibles: **Al corriente** (verde) · **Alerta** (ámbar) ·
  **Inhabilitado presunto/definitivo** (rojo) · **No disponible** (gris — la
  fuente no tiene listado cargado; el detalle dice cómo cargarlo).

### 5.2 Fuentes verificadas

Art. 69, Art. 69-B (EFOS), Art. 69-B Bis, Art. 49 Bis, Opinión 32-D, CSD
17-H, Sanciones internacionales (OFAC/ONU/UE/UK) y Padrón de Importadores.

- **Sanciones**: el cruce es por NOMBRE (los listados internacionales no traen
  RFC), por eso su resultado es siempre "Alerta con revisión humana": una
  coincidencia debe confirmarse manualmente.
- **Padrón de Importadores**: requiere que un ADMIN cargue el listado por CSV
  (ver §13.2). Con listado cargado: Activo → al corriente; Suspendido → rojo;
  no localizado → alerta (el listado puede ser parcial).

### 5.3 Historial 69-B y overrides

- Al final de la pantalla está el **historial 69-B** del cliente (estados y
  huellas de cada verificación).
- **Override motivado**: si se decide operar pese a una alerta, seleccionar la
  fuente/resultado y escribir el motivo (mínimo 20 caracteres). Queda sellado
  con autor y fecha.

---

## 6. Expediente KYC 1.4.14

**Panorama → KYC 1.4.14.** Dos bloques, en este orden de trabajo:

### 6.1 Documentos del expediente (bóveda)

1. Elegir el **tipo de persona** (física/moral) — el checklist resalta los
   documentos OBLIGATORIOS para cada caso.
2. Tipos disponibles: identificación oficial, acta constitutiva, poder del
   representante, comprobante de domicilio fiscal, **comprobante del domicilio
   de operaciones de comercio exterior**, CSF, ID fiscal extranjero, otro.
3. Seleccionar tipo → elegir archivo (PDF/imagen, máx. 10 MB) → **Subir al
   expediente**. Cada documento queda sellado; subir de nuevo el mismo tipo
   crea una **nueva versión** (las anteriores se conservan).
4. Si el archivo es un PDF con texto (p. ej. la CSF), el sistema **extrae los
   datos ahí mismo** y los usará para prellenar el cuestionario.

### 6.2 Cuestionario

- Secciones: **Datos generales** (tipo de persona; representante legal con
  tipo y número de identificación —solo morales—; residencia fiscal, con ID
  fiscal y país si es extranjera; contacto; actividad), **Materialidad**
  (domicilio de operaciones CE, contratos, infraestructura, empleados),
  **Integridad** (manifestación bajo protesta de no vínculos con EFOS — es
  obligatoria para sellar) y **Resumen**.
- **Precarga automática**: el formulario aparece prellenado con la última
  versión sellada y, en los huecos, con lo extraído de los documentos de la
  bóveda. Solo se modifica lo que cambió.
- La **integridad NUNCA se precarga**: se declara de nuevo en cada sellado.
- **Sellar** crea una nueva versión del cuestionario con su huella. El
  expediente debe **re-actualizarse cada 3 años**; el vigía avisa cuando se
  acerca la fecha.

---

## 7. Opinión de cumplimiento 32-D

**Panorama → Opinión 32-D.** Para las opiniones (SAT o IMSS) que el cliente
entrega en PDF.

### 7.1 Ingesta y validación

1. **Seleccionar archivo** (el PDF de la opinión) → **Ingerir y validar
   autenticidad**.
2. El sistema extrae la Cadena Original, el Sello Digital y el QR; detecta el
   emisor (SAT/IMSS); compara el RFC con el del cliente; verifica el sello
   criptográficamente (para SAT, descargando el certificado oficial del
   repositorio RCCF por número de serie).
3. **Veredicto**: AUTÉNTICA / SOSPECHOSA / NO AUTÉNTICA / NO VERIFICABLE, con
   la lista de comprobaciones realizadas.

### 7.2 Cotejo en vivo ante el SAT

- En el mismo resultado aparece la sección **"Cotejo en el portal del SAT"**:
  el sistema sigue la URL del QR y compara contra el validador oficial.
  Estados: **CONFIRMADA / DISCREPANCIA / NO DISPONIBLE** (con el motivo).
- La respuesta del SAT queda guardada como **evidencia sellada**, y el enlace
  **"Abrir cotejo en el portal del SAT →"** permite reproducirlo.
- Si el QR no se pudo leer: usar **"Reintentar cotejo"** en el historial; si
  persiste, escanear el QR una vez con el teléfono y pegar la URL en el campo
  correspondiente.

### 7.3 Historial

Tabla con todas las opiniones ingestadas: fecha, veredicto, folio, sentido
(POSITIVA/NEGATIVA), estado del cotejo y enlaces.

---

## 8. e.firma, Encargo conferido y Expediente doble

- **e.firma** (Panorama → e.firma): subir el certificado **.cer** del cliente.
  Se valida estructura X.509, titularidad (RFC) y vigencia. **Nunca subir la
  llave privada (.key)** — el sistema no la pide ni la almacena.
- **Encargo conferido** (Panorama → Encargo): registrar tipo (B14/B21),
  vigencias y aceptación. El vigía avisa los vencimientos. Sin encargo vigente,
  la prevalidación interna marca error normativo.
- **Expediente doble 3.1.42** (Panorama → Expediente doble): dos columnas —
  documentos que conserva el **agente** y documentos que conserva la
  **empresa** — cada una con su checklist (copia de pedimento, factura,
  documento de transporte, certificado de origen, acuse COVE,
  correspondencia). Subida y sellado igual que la bóveda KYC.

---

## 9. Operaciones y despacho

**Operaciones → Nueva**: elegir cliente y asignar una referencia interna.
Dentro de la operación:

### 9.1 Partidas y contribuciones (Operación → Partidas)

- **Encabezado del pedimento**: capturar/editar número (15 dígitos), aduana
  (3 dígitos), clave, régimen y tipo de cambio. Botón **"Prellenar desde el
  pedimento (PDF)"**: subir el pedimento y los campos se llenan solos (las
  contribuciones detectadas se muestran como referencia).
- **Partidas**: captura individual (fracción, descripción, valores, tasas) —
  el sistema calcula IGI, DTA, IEPS e IVA por partida y los totales — o
  **Ingesta masiva CSV** (formato: `fraccion,descripcion,valorAduana,
  tasaIgiPct,tasaIepsPct`; hasta 500 filas; las filas con error se reportan
  con su número de línea y no bloquean a las demás).

### 9.2 CFDI (Operación → CFDI)

- **Carta Porte 3.1** (traslado) y **Comercio Exterior 1.1** (exportación).
- Los formularios llegan **precargados** con lo que el sistema ya sabe (RFCs,
  clave de pedimento, tipo de cambio, primera mercancía).
- **"Prellenar desde XML (CFDI)"**: subir el XML de la factura y se llenan los
  campos restantes (solo los vacíos).
- **Cuadre CFDI ↔ Pedimento**: recuadro automático que compara fracciones y
  valores (tolerancia ±2%): verde cuadra, ámbar no comparable (con motivo),
  rojo discrepancia (con hallazgos). Corregir antes de timbrar.
- Cancelación de CFDI con motivos M01-M04 y UUID de sustitución.

### 9.3 Trámites del despacho (Operación → Trámites)

- **Prevalidación interna**: botón **"Prevalidar (interno)"** — ejecuta 18
  verificaciones en 4 criterios (sintáctico, catalógico, estructural,
  normativo). El informe distingue ERRORES (rojo) de ADVERTENCIAS (ámbar) con
  códigos (SIN-001, CAT-001, EST-004, NOR-001…) y mensajes accionables. No
  sustituye al prevalidador autorizado.
- **Registrar paso**: MVE/E2, COVE, Prevalidación, Pago, DODA — con folio de
  acuse y, opcionalmente, **el archivo del acuse** (PDF/XML), que se sella y
  queda ligado al paso (aparece 📎 en el checklist).

### 9.4 Expediente de la operación (Operación → Expediente)

- **Documentos del despacho**: checklist de 17 tipos (pedimento, factura
  comercial, carta porte XML/PDF, documento de transporte, COVE, DODA,
  manifestación de valor, certificado de origen, permisos/NOM, garantía de
  precios estimados, e-document VUCEM, CFDI comercio exterior, aviso de
  consolidado, certificado de peso/volumen, acuse de encargo, otro). Subir la
  **carta porte XML** extrae y muestra los datos al momento.
- **Exporte probatorio**: descarga el paquete autocontenido con la cadena de
  evidencia de la operación, verificable por un perito.
- Si la operación cae en **rojo**, se genera el **dossier** de diligencia.

---

## 10. IMMEX (libro de cotejo)

**Cliente → Saldos IMMEX.** Para clientes con programa IMMEX. Importante:
este módulo es un **libro de cotejo interno** — NO sustituye el sistema de
control de inventarios (Anexo 24) que la empresa está obligada a llevar.

### 10.1 Registrar movimientos

- **ENTRADA** (importación temporal): fracción, descripción, unidad, cantidad,
  valor, pedimento (número y clave), **fecha límite de retorno** y, si se
  conoce, la fecha en que concluyó el despacho.
- **DESCARGO** (retorno/cambio de régimen): fracción, cantidad, pedimento.
  El sistema aplica el descargo **PEPS** (consume las entradas más antiguas).
  Si la cantidad excede el saldo, el faltante se registra y se reporta.
- **Ingesta masiva CSV** para ambos tipos.
- Si entre el fin del despacho y el registro pasan más de **48 horas**, el
  sistema lo señala (regla del Anexo 24).

### 10.2 Consultar saldos

- Dos tablas con el mismo semáforo de plazos: **Cotejo CERBERUS** (derivado de
  los movimientos registrados) y **ERP del cliente** (si hay conector). Las
  diferencias entre ambas son las discrepancias a investigar.
- Pill "Certificada IVA/IEPS" cuando aplica (las alertas de saldos no
  retornados suben de severidad).

### 10.3 Reporte mensual

Sección **"Reporte mensual de descargos"**: elegir el mes → **Generar** →
resumen con huella y **Descargar CSV** (base del Anexo 30; el layout oficial
está pendiente de confirmación normativa).

---

## 11. Notificaciones y destinatarios

**Cliente → Notificaciones.**

1. **Estado de canales** (arriba): indica si Telegram y Correo están
   configurados a nivel plataforma.
2. **Agregar destinatario**: nombre, cargo (CEO, CFO, OCN, operaciones,
   legal, otro), canal (**Telegram** → chat id; **Correo** → dirección) y las
   **categorías** a las que se suscribe: Cumplimiento, Vigencias, Opinión
   32-D, Despacho, KYC, Sanciones, IMMEX, Reporte semanal ejecutivo.
3. **Probar envío**: manda un mensaje de prueba inmediato al canal del
   destinatario — verificar SIEMPRE al dar de alta.
4. Editar / Desactivar / Eliminar por fila.

**Cómo llegan los avisos:** el vigía agrupa todos los avisos del día de cada
persona en **UN solo mensaje** (digest) con secciones por categoría.

> Para obtener el chat id de Telegram: el destinatario escribe al bot de la
> agencia y el administrador consulta el id (procedimiento interno).

---

## 12. Vigía automático y reportes

Sin intervención del usuario:

- **Diario, 6:00 am (CDMX)**: sincroniza los listados del SAT → re-verifica a
  TODOS los clientes → revisa TODOS los vencimientos (opiniones, encargos,
  contratos, documentos, trienal KYC, plazos IMMEX, regla 48h) → envía el
  resumen global al canal de la agencia y los avisos individuales a los
  destinatarios suscritos.
- **Solo avisa novedades**: un cumplimiento que EMPEORÓ o un vencimiento
  activo. Si no hay nada, no envía (los vencimientos activos sí se repiten
  cada día hasta resolverse).
- **Lunes**: **reporte semanal ejecutivo** por cliente — salud general ("Todo
  en orden" / "Requiere atención") y cifras de los últimos 7 días — a los
  destinatarios suscritos a esa categoría.
- **Pantallas relacionadas**: **Vigencias** (calendario de todo lo que vence,
  por urgencia) y **Tablero ejecutivo** (semáforos de toda la cartera).

---

## 13. Administración

### 13.1 Usuarios (rol ADMIN)

**Usuarios**: crear cuenta (correo, nombre, rol, contraseña), editar rol,
activar/desactivar. Para dar acceso a la autoridad, crear un usuario con rol
**AUTORIDAD** (solo verá el portal de consulta).

### 13.2 Listados (rol ADMIN)

**Admin → Listados**:

- **Sincronizar**: descarga los listados públicos del SAT configurados
  (Art. 69, 69-B) — también lo hace solo el vigía cada día.
- **Ingesta manual**: para fuentes sin descarga pública — **Sanciones
  internacionales** (CSV de nombres) y **Padrón de Importadores** (CSV
  `rfc,estado` con estado ACTIVO/SUSPENDIDO). Cada ingesta queda sellada con
  la fecha, que aparece luego en el detalle de las verificaciones.

### 13.3 Contrato de encargo (LFPDPPP)

**Contrato de encargo**: versión vigente del contrato de tratamiento de datos
del tenant (instrucciones, subencargados, vigencia). El vigía avisa su
vencimiento.

---

## 14. Portal de la autoridad

Un usuario con rol **AUTORIDAD** entra a **/autoridad** y ve, en solo lectura:

- La lista de operaciones (referencia, cliente, estado, conteo de pasos y
  documentos sellados).
- El detalle de cada operación: línea de tiempo de pasos, documentos con su
  **SHA-256 completo**, y los últimos eventos de la bitácora con su
  encadenamiento — más la explicación de cómo verificar la integridad y el
  enlace al exporte probatorio.

No existe ningún botón de edición en ese portal.

---

## 15. Solución de problemas frecuentes

| Situación | Qué hacer |
|---|---|
| "El QR de la opinión no se leyó" | Usar **Reintentar cotejo** en el historial; si persiste, escanear el QR con el teléfono y pegar la URL. La ingesta y el veredicto de autenticidad NO dependen del QR. |
| "Una fuente dice NO DISPONIBLE" | El detalle dice el motivo: falta cargar el listado (Admin → Listados) o la URL de la fuente no está configurada. |
| "El CSV de partidas/IMMEX marca errores" | El mensaje indica la línea y el problema; las filas correctas SÍ se procesaron. Corregir solo las filas listadas y volver a subir. |
| "No llegó la notificación de prueba (Telegram)" | Verificar el chat id y que el destinatario haya iniciado conversación con el bot. |
| "No llegó el correo de prueba" | El panel de canales indica si falta configurar el correo; con remitente de arranque solo se puede enviar al correo registrado del servicio (hasta verificar dominio propio). |
| "El cuadre CFDI↔Pedimento sale ámbar" | Falta el pedimento, sus valores o el complemento; el recuadro dice exactamente qué falta. |
| "La prevalidación marca NOR-001" | El cliente no tiene encargo conferido vigente: registrarlo en Panorama → Encargo. |
| "Subí un documento y dice 'solo sello'" | El archivo quedó sellado (huella válida) pero el almacenamiento de archivos no está configurado en la plataforma; avisar al administrador. |
| "Quiero deshacer un sellado" | No se puede — por diseño probatorio. Capturar la corrección y sellar una nueva versión; ambas quedan en el historial. |

---

*Manual operativo. La plataforma evoluciona continuamente: ante cualquier
diferencia entre este documento y la pantalla, la pantalla manda; reportar la
diferencia para actualizar el manual.*
