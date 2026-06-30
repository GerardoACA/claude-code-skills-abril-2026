# Aviso de Privacidad Integral — CERBERUS Comercio Exterior (BORRADOR v1)

> **Estado:** BORRADOR para validación legal. **No publicar** sin revisión del agente abogado
> LFPDPPP y, en su caso, de asesor jurídico humano.
> **Corrige los 3 hallazgos críticos del informe de reconciliación (§2.5):**
> (a) cubre la finalidad de exposición a la autoridad aduanera; (b) declara correctamente
> el tratamiento de datos sensibles (geolocalización y biométricos); (c) refleja el modelo
> **Responsable = tenant / Encargado = CERBERUS** con contrato de encargo.
> **Fundamento:** LFPDPPP arts. 3, 8, 9, 15, 16, 17, 22, 26, 33, 36, 37; Reglamento arts. 14-30.

---

## Nota de arquitectura del documento (no forma parte del aviso publicable)

Este aviso es una **plantilla que el Responsable (cada tenant: agencia aduanal, importador,
despacho) adopta y personaliza**. CERBERUS opera como **Encargado** (LFPDPPP art. 3 fr. IX):
trata los datos por cuenta y bajo instrucciones del Responsable, conforme al **Contrato de
Encargo** (LFPDPPP art. 36; Reglamento arts. 49-55). Los campos entre `[corchetes]` los
completa cada tenant.

---

# AVISO DE PRIVACIDAD INTEGRAL

## 1. Identidad y domicilio del Responsable

**[Razón social del tenant — Responsable]**, con domicilio en **[domicilio fiscal completo]**
y RFC **[RFC]**, es el **Responsable** del tratamiento de sus datos personales, en términos
de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).

Para la operación, resguardo y trazabilidad de la información, el Responsable se apoya en la
plataforma **CERBERUS Comercio Exterior**, operada por **[Razón social del operador de
CERBERUS]**, que actúa exclusivamente como **Encargado**, tratando los datos por cuenta del
Responsable y bajo sus instrucciones documentadas, sin finalidades propias.

## 2. Datos personales que se recaban

Para las finalidades de este aviso, el Responsable recaba las siguientes categorías:

**a) Datos de identificación y contacto:** nombre, RFC, CURP, domicilio fiscal, domicilio
donde se realizan operaciones de comercio exterior, correo electrónico, teléfono, firma
autógrafa y datos de la e.firma (certificado y su número de serie; **la clave privada de la
e.firma nunca es recabada ni almacenada por la plataforma** —la firma se realiza del lado del
titular).

**b) Datos del representante legal y personas autorizadas:** identificación oficial, poder o
instrumento notarial, número de patente aduanal (en su caso).

**c) Datos fiscales y de operación:** régimen, ingresos, padrones, expedientes, pedimentos,
CFDI, soporte documental de materialidad.

**d) DATOS PERSONALES SENSIBLES.** El Responsable hace de su conocimiento, de manera expresa,
que **SÍ recaba datos personales sensibles** en supuestos específicos, a saber:
- **Datos biométricos:** firma autógrafa digitalizada (grafométrica) capturada como evidencia
  de entrega o de manifestación.
- **Datos de geolocalización:** ubicación del dispositivo al momento de capturar evidencia
  georreferenciada de operaciones, entregas o constatación de domicilio.

El tratamiento de estos datos sensibles requiere su **consentimiento expreso** (LFPDPPP art. 9)
y se documenta de forma separada (firma de consentimiento con sello de integridad). Sin dicho
consentimiento, no se realizará la captura de evidencia biométrica o georreferenciada.

## 3. Finalidades del tratamiento

### 3.1 Finalidades primarias (necesarias para la relación; no requieren consentimiento adicional salvo datos sensibles)
1. Integrar y resguardar el **expediente del usuario de comercio exterior** conforme a la
   **Regla 1.4.14 de las RGCE** y demás obligaciones aplicables.
2. Verificar la situación del contribuyente frente a los listados de los **artículos 69, 69-B
   y 69-B Bis del CFF** (EFOS/EDOS) y listas de sanciones aplicables.
3. Tramitar, orquestar y dar trazabilidad a operaciones de comercio exterior (manifestación de
   valor, COVE, prevalidación, pedimento, DODA y despacho).
4. Acreditar la **materialidad** de las operaciones y conservar evidencia con valor probatorio.
5. Cumplir obligaciones legales, fiscales y aduaneras a cargo del Responsable.
6. **Poner la información a disposición de las autoridades competentes (SAT, ANAM, VUCEM y
   demás) cuando éstas la requieran en ejercicio de sus facultades de comprobación,
   fiscalización o despacho aduanero**, en los términos de los artículos 42 y 69 del CFF y la
   Ley Aduanera. Esta transferencia/remisión a la autoridad **no requiere su consentimiento**
   (LFPDPPP art. 37, fracciones I, II y VI).

### 3.2 Finalidades secundarias (puede oponerse sin afectar la relación)
7. Envío de comunicaciones informativas sobre cambios normativos relevantes.
8. Elaboración de estadísticas y mejora del servicio en forma disociada.

Si no desea que sus datos se traten para las finalidades secundarias, puede manifestarlo
en **[mecanismo, p. ej. correo de ARCO / casilla de oposición]** dentro de los 5 días
hábiles siguientes.

## 4. Transferencias y remisiones de datos

| Destinatario | Finalidad | ¿Requiere consentimiento? |
|---|---|---|
| Autoridades (SAT, ANAM, VUCEM, autoridad jurisdiccional) | Cumplimiento de obligaciones y facultades de comprobación/despacho | **No** (art. 37 fr. I, II, VI LFPDPPP) |
| Prestador de Servicios de Certificación (PSC, p. ej. Cincel) | Sellado de tiempo / conservación NOM-151 | No (remisión a encargado/subencargado) |
| Proveedor de Autorización Certificado (PAC) | Timbrado de CFDI y complementos | No (remisión necesaria para la finalidad) |
| Agente aduanal designado | Despacho de la operación | No (necesaria para la prestación) |

Las **remisiones** a Encargado/subencargados (PSC, PAC, infraestructura en la nube) se rigen
por contratos de encargo que obligan a confidencialidad y a tratar los datos solo bajo
instrucción del Responsable, con **residencia de datos en territorio nacional** cuando sea
exigible.

## 5. Medios para ejercer los derechos ARCO

Usted puede ejercer sus derechos de **Acceso, Rectificación, Cancelación y Oposición (ARCO)**,
así como **revocar su consentimiento**, enviando solicitud a **[correo ARCO del Responsable]**
o a través del módulo de ARCO de la plataforma. La respuesta se emitirá en un plazo máximo de
**20 días hábiles** (LFPDPPP art. 32). La solicitud deberá contener: nombre del titular,
documento que acredite identidad/representación, descripción clara de los datos y derecho a
ejercer, y domicilio o medio para la respuesta.

## 6. Revocación del consentimiento

Puede revocar el consentimiento otorgado, en particular para el tratamiento de **datos
sensibles** (biométricos y de geolocalización), por los mismos medios de la sección 5. La
revocación no tendrá efectos retroactivos y puede estar sujeta a la conservación que la ley
exija para fines de fiscalización o defensa (ver sección 8).

## 7. Opciones para limitar el uso o divulgación / tecnologías de rastreo

La plataforma utiliza **geolocalización** únicamente al capturar evidencia y solo con su
consentimiento; puede desactivarla en su dispositivo, entendiendo que ello impedirá generar
ese tipo de evidencia. No se utilizan cookies de rastreo con fines publicitarios.

## 8. Conservación de los datos

Los datos se conservan por los plazos legales aplicables, diferenciados por tipo de expediente:
- Expediente Regla 1.4.14: **3 años** (o el plazo que fije la regla vigente).
- Expediente probatorio del despacho y contabilidad: **5 años** (art. 30 CFF).
- Información con relevancia para defensa fiscal o penal: hasta la **prescripción** aplicable.

Vencido el plazo, los datos se bloquean y suprimen conforme a la LFPDPPP, salvo deber legal de
conservación.

## 9. Medidas de seguridad

El Responsable y el Encargado aplican medidas administrativas, técnicas y físicas: cifrado en
reposo y tránsito, control de acceso por rol con aislamiento entre clientes, registro de
auditoría inalterable, conservación inmutable (WORM) y notificación de vulneraciones conforme
a la LFPDPPP y su Reglamento.

## 10. Cambios al aviso de privacidad

Este aviso puede modificarse. Los cambios se comunicarán a través de **[medio: plataforma /
correo]** indicando la versión y fecha. El uso continuado tras la notificación, o la
re-aceptación cuando el cambio afecte finalidades o datos sensibles, implica conformidad.

---

**Versión:** v1 (borrador) · **Fecha:** [fecha de publicación] · **Hash del aviso:** [SHA-256 al publicar]

> **Consentimiento para datos sensibles** (se recaba por separado, con firma + sello de integridad):
> "Otorgo mi consentimiento expreso para el tratamiento de mis datos personales sensibles
> (biométricos y de geolocalización) para las finalidades primarias señaladas en este aviso."
> [ ] Acepto   ·   Nombre y firma del titular: ____________________

---

## Pendientes señalados para la validación legal
1. Confirmar la redacción de la base de licitud de la transferencia a la autoridad (art. 37).
2. Confirmar si la firma grafométrica se clasifica como dato biométrico sensible en el criterio
   vigente del INAI/órgano sucesor, o como dato personal ordinario.
3. Validar plazos de conservación frente a la normativa aduanera específica.
4. Verificar la necesidad de aviso simplificado/corto adicional en el punto de captura.
5. Confirmar las cláusulas mínimas del Contrato de Encargo (Responsable–CERBERUS) por separado.
