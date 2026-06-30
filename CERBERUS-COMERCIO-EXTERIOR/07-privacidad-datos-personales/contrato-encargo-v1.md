# Contrato de Encargo del Tratamiento de Datos Personales — CERBERUS Comercio Exterior (v1)

> **Naturaleza:** Borrador / dictamen técnico de apoyo redactado por agente abogado especialista
> en protección de datos personales. **NO es asesoría legal definitiva.** La validación y firma
> finales corresponden a un **abogado humano colegiado**. No suscribir sin esa validación.
> **Producto:** CERBERUS **Comercio Exterior** (SaaS nuevo). **No** confundir con SIDF
> (cerberus-sidf-mp). Este contrato es del producto **nuevo** y no hereda cláusulas de SIDF.
> **Estado:** v1 — alineado al [Aviso de Privacidad CE v2](./aviso-privacidad-CE-v2.md) y al
> pendiente 5 del [dictamen de validación](./dictamen-validacion-legal-aviso-v1.md).
> **Fundamento:** LFPDPPP art. 3 fr. IX, art. 9, art. 19, art. 21, art. 36 y art. 37;
> Reglamento de la LFPDPPP arts. 49–55 (en particular **50, 51 y 52** — *numeración exacta a
> confirmar*); Lineamientos del Aviso de Privacidad; Guía INAI de Datos Biométricos.

---

## Nota de arquitectura (no forma parte del contrato suscribible)

Plantilla que cada **tenant (Responsable)** suscribe con el **operador de CERBERUS Comercio
Exterior (Encargado)**. Reproduce el reparto de roles del aviso v2: el **tenant** (agencia
aduanal / importador / despacho) es **Responsable**; **CERBERUS** es **Encargado** (art. 3 fr. IX
LFPDPPP), trata datos por cuenta del Responsable, bajo instrucciones documentadas y **sin
finalidades propias**. **El contrato es inválido mientras existan campos entre `[corchetes]` sin
completar.**

---

# CONTRATO DE ENCARGO DEL TRATAMIENTO DE DATOS PERSONALES

Que celebran, por una parte, **[Razón social del tenant]**, con domicilio en **[domicilio fiscal
completo]** y RFC **[RFC del Responsable]**, representada por **[nombre del representante legal]**,
en lo sucesivo el **"RESPONSABLE"**; y por la otra, **[Razón social del operador de CERBERUS
Comercio Exterior]**, con domicilio en **[domicilio]** y RFC **[RFC del Encargado]**, representada
por **[nombre del representante legal]**, en lo sucesivo el **"ENCARGADO"**; y cuando actúen de
forma conjunta, las **"PARTES"**, al tenor de las siguientes declaraciones y cláusulas.

## Declaraciones

1. Declara el **RESPONSABLE** que es el titular de la decisión sobre el tratamiento de los datos
   personales objeto de este contrato y que cuenta con un **aviso de privacidad** vigente que
   ampara las finalidades aquí encomendadas (alineado al Aviso de Privacidad CE v2).
2. Declara el **ENCARGADO** que opera la plataforma **CERBERUS Comercio Exterior** y que cuenta
   con la capacidad técnica, organizativa y de seguridad para tratar datos por cuenta del
   Responsable conforme a la LFPDPPP y su Reglamento.
3. Declaran las **PARTES** que se reconocen la personalidad con que comparecen y que es su
   voluntad obligarse en los términos siguientes.

## Cláusulas

### PRIMERA. Objeto

El RESPONSABLE encarga al ENCARGADO el **tratamiento de datos personales por su cuenta** a través
de la plataforma CERBERUS Comercio Exterior, exclusivamente para las finalidades **primarias**
descritas en el aviso de privacidad del Responsable. El ENCARGADO actúa como tal en términos del
**art. 3 fr. IX LFPDPPP** y **art. 36 LFPDPPP**, sin que este contrato le confiera titularidad ni
derecho de uso propio sobre los datos.

### SEGUNDA. Datos personales y finalidades del encargo

El encargo comprende el tratamiento de las categorías de datos recabadas conforme al aviso v2:

- **Identificación y contacto:** nombre, RFC, CURP, domicilios, correo, teléfono, firma autógrafa
  visible y datos de la e.firma (certificado y número de serie). **La clave privada de la e.firma
  no se recaba ni almacena**; la firma se realiza del lado del titular.
- **Representante legal y personas autorizadas:** identificación, poder o instrumento notarial,
  número de patente aduanal en su caso.
- **Datos fiscales y de operación:** régimen, ingresos, padrones, expedientes, pedimentos, CFDI y
  soporte documental de materialidad.
- **Datos personales SENSIBLES** (tratados solo con consentimiento expreso por escrito recabado
  por el Responsable, art. 9 LFPDPPP):
  - **Biométricos conductuales:** firma manuscrita capturada en dispositivo con sus rasgos
    grafométricos dinámicos (presión, velocidad, trazo).
  - **Geolocalización:** ubicación del dispositivo al capturar evidencia georreferenciada.

**Finalidades del encargo (primarias del aviso v2):** integrar y resguardar el expediente del
usuario de comercio exterior (Regla 1.4.14 RGCE); verificar listados de los arts. 69, 69-B y 69-B
Bis del CFF y sanciones; tramitar y dar trazabilidad a las operaciones (manifestación de valor,
COVE, prevalidación, pedimento, DODA, despacho); acreditar materialidad y conservar evidencia con
valor probatorio; y poner información a disposición de **autoridades competentes** cuando la
requieran (puesta a disposición que es obligación legal del Responsable y por requerimiento de
autoridad — **arts. 10 y 37 LFPDPPP**, *fracciones a confirmar*).

El ENCARGADO **no** tratará los datos para finalidades secundarias ni para fines propios.

### TERCERA. Tratamiento solo conforme a instrucciones documentadas

El ENCARGADO tratará los datos personales **única y exclusivamente conforme a las instrucciones
documentadas del RESPONSABLE** (Reglamento art. 50, *numeración a confirmar*), expresadas en este
contrato, en la configuración de la plataforma y en instrucciones posteriores por escrito o por
medios electrónicos con trazabilidad. En consecuencia, el ENCARGADO:

1. **No** utilizará los datos para **finalidades propias** ni distintas a las instruidas.
2. **No** transferirá los datos a terceros salvo (i) instrucción del Responsable, (ii) las
   remisiones a subencargados autorizadas en la Cláusula SÉPTIMA, o (iii) requerimiento de
   autoridad competente conforme a derecho, informando al Responsable cuando legalmente sea
   posible.
3. Si considera que una instrucción **infringe** la LFPDPPP o su Reglamento, lo notificará al
   Responsable sin demora.
4. Tratará los datos durante la vigencia y, al terminar, los **suprimirá o devolverá** conforme a
   la Cláusula DÉCima.

### CUARTA. Medidas de seguridad

El ENCARGADO implementará y mantendrá medidas administrativas, técnicas y físicas adecuadas al
riesgo (LFPDPPP arts. 19 y 21; Reglamento *arts. a confirmar*), que incluyen al menos:

- **Cifrado** de datos en reposo y en tránsito.
- **Control de acceso por rol** con principio de mínimo privilegio y **aislamiento entre clientes
  (RLS / segregación multi-tenant)**.
- **Bitácora de auditoría inmutable** y **conservación inmutable (WORM)** de la evidencia con
  valor probatorio.
- Sellos de integridad sobre el consentimiento de datos sensibles y la evidencia generada.
- Gestión de vulnerabilidades, respaldo y continuidad, y revisión periódica de las medidas.

El ENCARGADO tratará los datos sensibles (biométricos y geolocalización) con medidas reforzadas,
conforme a las recomendaciones del INAI para datos biométricos.

### QUINTA. Confidencialidad (incluido el personal)

El ENCARGADO guardará **confidencialidad** respecto de los datos personales, aún después de
terminada la relación. Esta obligación se extiende a **todo su personal, empleados, colaboradores
y terceros** que intervengan en el tratamiento, a quienes hará suscribir compromisos de
confidencialidad equivalentes y a quienes capacitará y supervisará. El acceso se limitará al
personal que lo requiera para la prestación del servicio.

### SEXTA. Asistencia en el ejercicio de derechos ARCO

El ENCARGADO **asistirá al RESPONSABLE** en la atención de las solicitudes de **Acceso,
Rectificación, Cancelación y Oposición (ARCO)** y de **revocación del consentimiento** de los
titulares, mediante las funcionalidades del módulo ARCO de la plataforma y la entrega oportuna de
la información necesaria, dentro de plazos que permitan al Responsable responder en los **20 días
hábiles** del art. 32 LFPDPPP. El ENCARGADO **no resolverá por sí** las solicitudes ARCO; la
respuesta corresponde al Responsable, salvo instrucción documentada en contrario.

### SÉPTIMA. Subencargados, remisiones y procesamiento internacional

1. El RESPONSABLE **autoriza** al ENCARGADO a apoyarse en **subencargados** para la prestación del
   servicio, en las categorías ya declaradas en el aviso v2:
   - **Prestador de Servicios de Certificación (PSC)** — p. ej. tipo **Cincel** — para sellado de
     tiempo / conservación **NOM-151**.
   - **Proveedor de Autorización Certificado (PAC)** — para timbrado de CFDI y complementos.
   - **Proveedores de infraestructura en la nube** — cómputo y almacenamiento.
2. El ENCARGADO impondrá a cada subencargado, por contrato, **las mismas obligaciones** de este
   instrumento (instrucciones documentadas, no fines propios, seguridad, confidencialidad,
   supresión/devolución, asistencia y notificación de brechas) y **responde** ante el Responsable
   por su actuación.
3. El ENCARGADO mantendrá un **registro de subencargados** a disposición del Responsable e
   **informará con antelación razonable** cualquier alta, cambio o sustitución, pudiendo el
   Responsable **oponerse** por causa justificada.
4. **Procesamiento y residencia internacional.** Parte de la infraestructura puede ubicarse
   **fuera del territorio nacional**. En tal caso, las remisiones a proveedores en el extranjero
   (nube, PSC, PAC) se rigen por **contratos de encargo** que les obligan a confidencialidad, a
   tratar los datos solo bajo instrucción y a mantener el **nivel de protección exigido por la
   LFPDPPP**. Cuando la normativa lo exija, los datos se **confinan en territorio nacional**.

### OCTAVA. Notificación de vulneraciones de seguridad (brechas)

El ENCARGADO **notificará al RESPONSABLE sin dilación indebida** y, a más tardar dentro de
**[plazo, p. ej. 48–72 horas]** desde que tenga conocimiento, cualquier **vulneración de
seguridad** que afecte de forma significativa los derechos patrimoniales o morales de los
titulares (Reglamento arts. 63–66, *numeración a confirmar*). La notificación incluirá, al menos:
naturaleza del incidente, datos comprometidos, recomendaciones al titular, acciones correctivas
inmediatas y medios para más información. El ENCARGADO **cooperará** con el Responsable en la
contención, investigación y, en su caso, comunicación a los titulares y a la autoridad garante.
La obligación de comunicar a titulares y/o autoridad corresponde al **Responsable**.

> **Nota:** la LFPDPPP no fija un plazo numérico único; el plazo de **[48–72 h]** es contractual
> y **a confirmar** por abogado humano (alinéese a la política interna de respuesta a incidentes).

### NOVENA. Auditoría y verificación

El RESPONSABLE podrá **verificar** el cumplimiento de este contrato mediante requerimientos de
información, evidencias de cumplimiento (certificaciones, reportes de seguridad) o, con aviso
razonable y sin afectar la operación ni la confidencialidad de otros clientes, auditorías. El
ENCARGADO prestará la colaboración necesaria.

### DÉCIMA. Supresión o devolución al terminar el encargo

Al concluir la relación, por cualquier causa, el ENCARGADO **suprimirá o devolverá** al
RESPONSABLE, a elección de éste, **todos** los datos personales tratados y suprimirá las copias
existentes, **salvo** que una **disposición legal exija su conservación** (p. ej. plazos del art.
30 CFF, Regla 1.4.14 RGCE y plazos aduaneros). En tal supuesto, los datos remanentes quedarán
**bloqueados** (acceso restringido, conservación WORM) hasta el vencimiento del deber legal, tras
lo cual se suprimirán. El ENCARGADO entregará constancia de la supresión o devolución cuando se le
solicite.

### DÉCIMA PRIMERA. Vigencia

Este contrato inicia su vigencia en la fecha de su firma y permanecerá vigente **mientras subsista
la relación de prestación del servicio CERBERUS Comercio Exterior** entre las Partes. Las
obligaciones de confidencialidad, supresión/devolución y conservación legal subsisten a su
terminación.

### DÉCIMA SEGUNDA. Responsabilidad

Cada Parte responde del incumplimiento de sus propias obligaciones legales y contractuales. El
ENCARGADO responde frente al RESPONSABLE por los daños derivados de un tratamiento contrario a las
instrucciones documentadas o a la LFPDPPP, así como por la actuación de sus subencargados. Lo
anterior sin perjuicio de las facultades y sanciones de la autoridad garante.
*(Límites de responsabilidad, indemnización y caso fortuito/fuerza mayor: a confirmar por abogado
humano.)*

### DÉCIMA TERCERA. Terminación

Son causas de terminación: (i) la conclusión de la relación de servicio; (ii) el mutuo acuerdo;
(iii) el incumplimiento grave no subsanado dentro de **[plazo]** tras requerimiento; y (iv) las
demás previstas en el contrato principal de prestación de servicios. La terminación detona las
obligaciones de la Cláusula DÉCIMA.

### DÉCIMA CUARTA. Misceláneos

Este contrato es **accesorio** del contrato principal de prestación del servicio y se interpreta
de forma armónica con él y con el **aviso de privacidad** del Responsable; en lo no previsto, rige
la **LFPDPPP, su Reglamento** y demás normativa aplicable. *(Jurisdicción, notificaciones y
modificaciones: a confirmar por abogado humano.)*

---

**Firmas**

| EL RESPONSABLE | EL ENCARGADO |
|---|---|
| **[Razón social del tenant]** | **[Razón social del operador de CERBERUS CE]** |
| Nombre: **[representante legal]** | Nombre: **[representante legal]** |
| Cargo: **[cargo]** | Cargo: **[cargo]** |
| Fecha: **[fecha]** | Fecha: **[fecha]** |
| Firma: ____________________ | Firma: ____________________ |

> **Versión:** v1 (borrador técnico, pendiente de firma legal humana) · **Fecha:** [fecha] ·
> **Hash:** [SHA-256 al emitir]

---

## Puntos "a confirmar por abogado humano colegiado"

1. **Numeración exacta del Reglamento** de la LFPDPPP aplicable al encargo (se citan arts.
   **49–55 / 50 / 51 / 52** para contenido del encargo y arts. **63–66** para vulneraciones;
   confirmar contra texto vigente tras reformas).
2. **Fracciones vigentes del art. 37 LFPDPPP** y encuadre de la puesta a disposición a autoridad
   (alinear con bloqueante 1 del dictamen).
3. **Plazo contractual de notificación de brechas** (sugerido 48–72 h): definir y alinear a la
   política de respuesta a incidentes.
4. **Plazos de conservación aduaneros** específicos (Ley Aduanera / RGCE) para la Cláusula DÉCIMA.
5. **Denominación del órgano garante** sucesor del INAI tras la reforma de 2025.
6. **Cláusulas de responsabilidad, límites, indemnización, jurisdicción, notificaciones y
   modificaciones** (DÉCIMA SEGUNDA a DÉCIMA CUARTA).
7. Validación integral del texto y **firma de conformidad**.

> **Recordatorio:** dictamen/borrador técnico de apoyo. **No constituye asesoría legal
> definitiva.** Requiere validación de abogado humano colegiado antes de su suscripción.
