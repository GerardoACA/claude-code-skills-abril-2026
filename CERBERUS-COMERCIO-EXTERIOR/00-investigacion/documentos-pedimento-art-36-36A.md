# Documentos anexos al pedimento de importación — arts. 36 y 36-A de la Ley Aduanera

> ⚠️ **GENERADO POR AGENTE ESPECIALISTA DE IA (conocimiento al corte 2026) — PENDIENTE DE
> VALIDACIÓN POR ABOGADO COLEGIADO. No citar ante autoridad sin cotejar contra el texto
> vigente del DOF.**
>
> **Propósito:** Insumo normativo para la bóveda documental del expediente probatorio del
> despacho en CERBERUS (catálogo `src/lib/documentos-despacho-catalogo.ts`).
> **Fecha del documento:** 4 de julio de 2026.
> **Método:** Conocimiento experto del modelo (Ley Aduanera reformada, DOF 19-nov-2025,
> vigente 1-ene-2026; RGCE 2026 y su 1ª Resolución de Modificaciones) + búsquedas web de
> corroboración. **Nota de acceso:** el proxy del entorno bloqueó (HTTP 403) la descarga del
> texto íntegro de las fuentes oficiales (ANAM, SAT, DOF, Justia); los números de regla RGCE
> marcados con (†) provienen de conocimiento del modelo y deben cotejarse con especial cuidado.

---

## 1. Marco general: arts. 36 y 36-A LA

- **Art. 36 LA:** quienes introduzcan o extraigan mercancías del territorio nacional están
  obligados a transmitir, a través del **sistema electrónico aduanero (SEA)**, en **documento
  electrónico**, un **pedimento** con la información referente a las mercancías, empleando
  **e.firma o sello digital**. El agente aduanal o la agencia aduanal que promueva el despacho
  transmite el pedimento en igual forma.
- **Art. 36-A LA:** lista la **información que debe transmitirse en documento electrónico o
  digital como ANEXOS al pedimento**, la cual debe contener el **acuse generado por el SEA**
  (folio COVE / e-document). Los documentos "se entienden presentados" ante la autoridad cuando
  sus acuses están transmitidos; la autoridad puede requerir originales físicos para cotejo.
- **Regla de no duplicidad (art. 36-A, párrafos finales):** NO es necesario transmitir la
  información que las dependencias competentes ya hayan transmitido al SEA/VUCEM (p. ej.
  permisos emitidos electrónicamente): basta **declarar el e-document** en el pedimento.
- **Reforma 2025-2026 (DOF 19-nov-2025, vigente 1-ene-2026):** modifica la obligación de
  anexos del 36-A, adiciona el **art. 89-A LA** (expediente electrónico de comercio exterior
  con procedimientos de control interno) y endurece la responsabilidad (solidaria) del agente
  aduanal respecto de la veracidad/correspondencia de lo transmitido.
- **VUCEM → VUTCE:** por decreto (DOF 4-may-2026) la plataforma de trámites evoluciona a la
  **Ventanilla Única de Trámites de Comercio Exterior (VUTCE)**; las referencias operativas a
  VUCEM deben leerse hacia VUTCE conforme a sus transitorios.

**Distinción clave para el software:** una cosa es la información que se transmite como anexo
(36-A), otra los documentos que se **conservan** en el expediente (arts. 59, 89-A LA y 30 CFF —
en general **5 años**), y otra los datos que solo se **declaran** en el pedimento (Anexo 22).
CERBERUS archiva TODO en la bóveda del expediente del despacho.

---

## 2. Tabla resumen (importación)

| # | Documento / información | Fundamento | Exigible cuando | Transmisión |
|---|--------------------------|------------|-----------------|-------------|
| 1 | Pedimento | Art. 36 LA; Anexo 22 RGCE | Toda operación | SEA, e.firma/sello |
| 2 | Factura comercial / documento equivalente → **COVE** | Art. 36-A-I-a) LA; reglas cap. 1.9 RGCE († 1.9.18/1.9.19) | Siempre (valor y comercialización) | VUCEM/VUTCE, acuse COVE |
| 3 | Documento de transporte **revalidado** (BL / lista de intercambio / guía aérea) | Art. 36-A-I-b) LA | Tráfico marítimo y aéreo | Digitalizado (e-document) / dato en pedimento |
| 4 | Cumplimiento de **RRNA** (permisos, NOMs, avisos, certificados) | Art. 36-A-I-c) LA; LCE arts. 17 y 20; Anexo 2.4.1 SE (NOMs) | Cuando la fracción/NICO esté sujeta | E-document VUCEM emitido por la dependencia; se declara en pedimento |
| 5 | Documento de **origen/procedencia** (certificado o certificación de origen) | Art. 36-A-I-d) LA; tratados (T-MEC, TIPAT, TLCUEM…); Acuerdo de marcado/cuotas | Trato preferencial, cuotas compensatorias, cupos, marcado | Según tratado: se conserva y/o digitaliza; se declara identificador |
| 6 | **Garantía en cuenta aduanera** de precios estimados | Art. 36-A-I-e), 84-A y 86-A LA; Resolución de precios estimados SHCP | Valor declarado < precio estimado (vehículos usados, textil, calzado…) | Constancia de depósito digitalizada (e-document) |
| 7 | **Certificado de peso o volumen** | Art. 36-A-I-f) LA; RLA (empresas certificadas) | Granel en aduanas marítimas | E-document |
| 8 | Información de **identificación individual** (series, parte, marca, modelo) | Art. 36-A-I, párrafos finales; reglas SAT | Mercancía identificable individualmente | Datos en pedimento / anexo electrónico |
| 9 | **Manifestación de valor** (MVE, formato E2) | Art. 59-III LA; RLA art. 81; reglas cap. 1.5 RGCE 2026; Anexo 1 | Importaciones definitivas (obligatoriedad MVE con prórrogas; boletines la sitúan en jun-2026) | Portal SAT/VUCEM; folio de 13 caracteres declarado como e-document (registro 507, identificador ED) |
| 10 | **Encargo conferido** al agente aduanal | Arts. 40 y 41 LA; regla († 1.2.4) RGCE | Antes de que el agente promueva el primer despacho | Portal SAT; acuse electrónico |
| 11 | **CFDI + complemento Carta Porte** (traslado) | Art. 29 CFF; RMF; CCP 3.1 | Traslado en territorio nacional ligado a la operación | No es anexo 36-A en sentido estricto: se emite/valida y su folio se vincula al despacho |
| 12 | **Aviso electrónico / facturas de pedimento consolidado** | Arts. 37 y 37-A LA | Operaciones consolidadas (remesas) | Aviso electrónico por remesa + CFDI/COVE; cierre del consolidado |
| 13 | **DODA** (activación del mecanismo de selección automatizado) | Art. 43 LA; reglas cap. 3.1 RGCE | Presentación de mercancías en aduana | Generación electrónica (QR); no es "anexo" sino presentación |
| 14 | **E-document VUCEM/VUTCE** (digitalización de anexos) | Art. 36-A LA; reglas cap. 3.1 RGCE; Anexo 22, Apéndice 8 (identificador **ED**) | Todo anexo digitalizado | PDF escala de grises, 300 dpi, ≤ 3 MB (especificación VUCEM) |

---

## 3. Detalle por documento

### 3.1 Pedimento (documento base)
- **Fundamento:** art. 36 LA; instructivo de llenado en **Anexo 22 RGCE 2026** (identificadores
  en su **Apéndice 8**).
- **Exigible:** toda importación (salvo excepciones de pedimento simplificado/avisos).
- **Transmisión:** SEA con e.firma o sello digital del agente/agencia aduanal o del importador
  en despacho directo (art. 40 LA).

### 3.2 Factura comercial / documento equivalente — COVE (acuse de valor)
- **Fundamento:** art. 36-A, fracc. I, inciso a) LA; reglas del **capítulo 1.9 RGCE**
  († numeración de referencia 1.9.18 y 1.9.19).
- **Qué es:** la información de **valor y demás datos de comercialización** (antes "factura")
  se transmite a VUCEM/VUTCE ANTES del despacho y genera el **acuse de valor (COVE)**, cuyo
  folio se declara en el pedimento. La reforma 2025-2026 sustituye en varios preceptos
  "factura comercial" por **CFDI o documento equivalente** e incorpora notas de crédito y
  descuentos especiales.
- **Exigible:** siempre en importación definitiva y temporal con valor de transacción; el
  documento fuente (factura/CFDI) se conserva en el expediente.

### 3.3 Documento de transporte revalidado
- **Fundamento:** art. 36-A, fracc. I, inciso b) LA.
- **Qué es:** **conocimiento de embarque (BL)** en tráfico marítimo, **guía aérea (AWB)** en
  aéreo, o **lista de intercambio** — **revalidados** por la empresa porteadora/agente naviero.
- **Exigible:** tráfico marítimo y aéreo (en terrestre el control se da vía DODA/carta porte).
- **Transmisión:** digitalizado como e-document y/o datos declarados en el pedimento
  (número de guía/BL).

### 3.4 Regulaciones y restricciones no arancelarias (RRNA)
- **Fundamento:** art. 36-A, fracc. I, inciso c) LA; arts. 17 y 20 LCE; acuerdos de la SE
  (p. ej. **Anexo 2.4.1**, "acuerdo de NOMs") y ordenamientos sectoriales.
- **Ejemplos:** permisos previos y avisos automáticos (SE), autorizaciones sanitarias
  (COFEPRIS), certificados fito/zoosanitarios (SENASICA), autorizaciones SEMARNAT, permisos
  SEDENA, constancias/dictámenes de cumplimiento de **NOM** (información comercial o producto).
- **Exigible:** cuando la fracción arancelaria + NICO esté sujeta conforme a los acuerdos.
- **Transmisión:** la dependencia emite el documento en VUCEM/VUTCE y el pedimento **declara el
  e-document**; si no fue emitido electrónicamente, se digitaliza (identificador ED). C9: el
  sistema ALERTA la falta, nunca bloquea.

### 3.5 Origen y procedencia (certificado / certificación de origen)
- **Fundamento:** art. 36-A, fracc. I, inciso d) LA; reglamentaciones uniformes de tratados
  (**T-MEC** cap. 5 — certificación de origen del importador/exportador/productor, sin formato
  oficial; TIPAT, TLCUEM, ACE…); Acuerdo de marcado de país de origen y disposiciones sobre
  **cuotas compensatorias** (certificado de país de origen para desvirtuar la cuota).
- **Exigible:** al aplicar **trato arancelario preferencial**, para **no pagar cuota
  compensatoria**, cupos y marcado.
- **Transmisión:** según el tratado, el documento se **conserva** en el expediente y se declara
  el identificador correspondiente en el pedimento; puede digitalizarse como e-document. OJO:
  bajo T-MEC la certificación puede estar en poder del importador y presentarse a requerimiento.

### 3.6 Garantía en cuenta aduanera de garantía (precios estimados)
- **Fundamento:** art. 36-A, fracc. I, inciso e) LA, en relación con **arts. 84-A y 86-A LA**;
  Resolución de precios estimados de la SHCP y sus anexos (vehículos usados, textiles,
  calzado y demás sectores listados).
- **Exigible:** cuando el **valor declarado sea inferior al precio estimado** publicado para la
  mercancía; la garantía cubre la diferencia de contribuciones y se cancela en los plazos del
  art. 86-A.
- **Transmisión:** la **constancia de depósito en cuenta aduanera de garantía** (expedida por
  institución de crédito o casa de bolsa autorizada) se transmite digitalizada como anexo del
  pedimento.

### 3.7 Certificado de peso o volumen
- **Fundamento:** art. 36-A, fracc. I, inciso f) LA; RLA (certificación por empresas
  autorizadas por la autoridad aduanera).
- **Exigible:** despacho de mercancías **a granel** en **aduanas de tráfico marítimo**, en los
  casos que el Reglamento establece.
- **Transmisión:** e-document digitalizado, expedido por empresa certificada.

### 3.8 Identificación individual de mercancías
- **Fundamento:** art. 36-A, fracc. I, párrafos finales, y reglas del SAT.
- **Qué es:** **números de serie, parte, marca y modelo** o especificaciones técnicas para
  mercancías susceptibles de identificarse individualmente.
- **Transmisión:** como datos del pedimento o en el propio COVE/anexo electrónico; puede
  cumplirse con relación firmada transmitida antes de activar el mecanismo de selección.

### 3.9 Manifestación de valor (MVE, formato E2)
- **Fundamento:** art. 59, fracc. III LA; art. 81 RLA (documentos que la acompañan); reglas
  del **capítulo 1.5 RGCE 2026**; **formato E2 del Anexo 1**.
- **Qué es:** declaración del importador, bajo protesta de decir verdad, de los elementos que
  determinan la base gravable (valor de transacción, incrementables, vinculación, descuentos,
  notas de crédito — ampliados por la reforma 2026).
- **Exigible:** importaciones definitivas; la **MVE electrónica** ha tenido prórrogas
  transitorias en las RGCE 2026 — boletines especializados sitúan la obligatoriedad plena en
  **junio de 2026** (cotejar el transitorio vigente en el DOF).
- **Transmisión:** portal SAT/VUCEM-VUTCE; genera **folio de 13 caracteres** que se declara en
  el **registro 507** del pedimento como e-document con **identificador ED** (Anexo 22,
  Apéndice 8). El acuse, el detalle y los documentos anexos se conservan 5 años (art. 30 CFF).

### 3.10 Encargo conferido
- **Fundamento:** arts. 40 y 41 LA (representación por agente aduanal); regla RGCE del
  capítulo 1.2 († referencia 1.2.4).
- **Exigible:** antes de que el agente aduanal promueva operaciones del importador (salvo
  excepciones por padrón/sector). El **acuse de aceptación del encargo conferido** integra el
  expediente.
- **Transmisión:** Portal del SAT con e.firma del importador; aceptación del agente.

### 3.11 CFDI con complemento Carta Porte (traslado)
- **Fundamento:** art. 29, penúltimo párrafo CFF; RMF (título 2.7); **CCP 3.1** obligatorio
  desde 17-jul-2024; RGCE en lo relativo a declarar el folio fiscal en operaciones de comercio
  exterior.
- **Precisión jurídica:** NO es un anexo del art. 36-A; ampara el **traslado** en territorio
  nacional (tramo importación/exportación) y la autoridad lo exige en verificación de
  mercancía en transporte. El expediente del despacho debe vincular XML + representación
  impresa al pedimento correspondiente.

### 3.12 Pedimento consolidado — aviso electrónico y facturas por remesa
- **Fundamento:** **arts. 37 y 37-A LA**.
- **Qué es:** un pedimento que ampara varias operaciones (remesas) de un mismo
  importador/exportador; por cada remesa se transmite **aviso electrónico** con el COVE/CFDI
  correspondiente, y el pedimento se cierra en los plazos de ley.
- **Transmisión:** SEA; la relación de facturas/COVEs por remesa integra el expediente.

### 3.13 DODA (Documento de Operación para Despacho Aduanero)
- **Fundamento:** art. 43 LA (activación del mecanismo de selección automatizado); reglas del
  capítulo 3.1 RGCE.
- **Precisión:** no es anexo del pedimento sino el instrumento de **presentación** ante el
  módulo (QR). Se archiva como constancia de la modulación y su resultado.

### 3.14 E-document VUCEM/VUTCE (vehículo de digitalización)
- **Fundamento:** art. 36-A LA; reglas de digitalización del capítulo 3.1 RGCE; **Anexo 22,
  Apéndice 8, identificador "ED — Documento Digitalizado"**.
- **Qué es:** el acuse (número e-document) que devuelve VUCEM/VUTCE al digitalizar cualquier
  anexo; es el "sobre" electrónico de los documentos 3.3 a 3.9. Especificación técnica usual:
  PDF escala de grises, 300 dpi, ≤ 3 MB.

### 3.15 Exportación (referencia breve — art. 36-A, fracc. II)
- a) información de **valor y comercialización** (COVE sobre el CFDI con **complemento de
  comercio exterior** en A1 enajenadas); b) documentos de **RRNA**. Ver sección 2 del
  reporte de fiscalización 2025-2026.

---

## 4. Cobertura: documento normativo → tipo del catálogo CERBERUS

| Documento normativo (sección) | Tipo en `TIPOS_DOC_DESPACHO` | Estado |
|-------------------------------|------------------------------|--------|
| Pedimento (3.1) | `PEDIMENTO` | Ya existía |
| Factura comercial / CFDI equivalente (3.2) | `FACTURA_COMERCIAL` | Ya existía |
| Acuse de valor COVE (3.2) | `COVE_ACUSE` | Ya existía |
| Documento de transporte revalidado (3.3) | `DOCUMENTO_TRANSPORTE` | Ya existía |
| RRNA: permisos / NOMs / avisos / certificados (3.4) | `PERMISO_NOM` | Ya existía |
| Certificado / certificación de origen (3.5) | `CERTIFICADO_ORIGEN` | Ya existía |
| Garantía cuenta aduanera precios estimados (3.6) | `GARANTIA_PRECIOS_ESTIMADOS` | **Agregado** |
| Certificado de peso o volumen (3.7) | `CERTIFICADO_PESO_VOLUMEN` | **Agregado** |
| Identificación individual (3.8) | (datos del pedimento/COVE; sin tipo propio) | N/A |
| Manifestación de valor / MVE (3.9) | `MANIFESTACION_VALOR` | Ya existía |
| Encargo conferido (3.10) | `ENCARGO_CONFERIDO_ACUSE` | Ya existía |
| CFDI Carta Porte XML / PDF (3.11) | `CARTA_PORTE_XML` / `CARTA_PORTE_PDF` | Ya existían |
| Aviso electrónico de consolidado (3.12) | `AVISO_CONSOLIDADO` | **Agregado** |
| DODA (3.13) | `DODA` | Ya existía |
| Acuse e-document VUCEM/VUTCE (3.14) | `EDOCUMENT_VUCEM` | **Agregado** |
| CFDI complemento comercio exterior, exportación (3.15) | `CFDI_COMERCIO_EXTERIOR` | **Agregado** |
| Cualquier otro anexo | `OTRO` | Ya existía |

---

## 5. Notas metodológicas y limitaciones

- El proxy del entorno devolvió **HTTP 403** al intentar descargar el texto íntegro de ANAM,
  SAT/DOF y compilaciones (Justia, Logycom); la lista se redactó con **conocimiento del
  modelo** y se corroboró con **resultados de búsqueda** (títulos/extractos) de fuentes
  especializadas.
- Los números de regla RGCE marcados con **(†)** (1.9.18/1.9.19 COVE, 1.2.4 encargo conferido)
  y la letra exacta de cada inciso del 36-A deben **cotejarse contra las RGCE 2026 publicadas
  en el DOF (30-dic-2025) y su 1ª Resolución de Modificaciones (DOF 14-may-2026)** antes de
  codificarse como reglas duras o citarse ante autoridad.
- La fecha de obligatoriedad plena de la **MVE** ha sido objeto de prórrogas sucesivas;
  confirmar el transitorio vigente.

**Fuentes consultadas (títulos localizados vía búsqueda; texto íntegro no accesible por proxy):**
- [ANAM — Documentos electrónicos o digitales que se deben transmitir como anexos al pedimento de importación](https://www.anam.gob.mx/documentos-electronicos-o-digitales-que-se-deben-transmitir-como-anexos-al-pedimento-de-importacion/)
- [Ley Aduanera vigente (Cámara de Diputados, PDF)](https://www.diputados.gob.mx/LeyesBiblio//pdf/LAdua.pdf)
- [RGCE para 2026 (SAT, PDF)](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/rgce/ReglasGeneralesComercioExteriorpara2026.pdf)
- [Anexo 22 de las RGCE para 2026 (SAT, PDF)](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rgce/anexos/Anexo22delasRGCEpara2026.pdf)
- [EY — Reformas a la Ley Aduanera para 2026](https://www.ey.com/es_mx/technical/tax/boletines-fiscales/reformas-ley-aduanera-para-2026)
- [TLC Asociados — Resumen de las reformas de la legislación aduanera](https://www.tlcasociados.com.mx/resumen-de-las-reformas-de-la-legislacion-aduanera-y-de-comercio-exterior/)
- [CJ Aduanero — Modificaciones a la Manifestación de Valor en las RGCE 2026](https://blog.cjaduanero.com/modificaciones-a-la-manifestacion-de-valor-en-las-rgce-2026-nuevos-supuestos-y-prorroga-transitoria/)
- [AudiCo — Preguntas frecuentes de la MVE (formato E2)](https://www.audico.com.mx/boletines/preguntas-frecuentes-de-la-manifestacin-de-valor-electrnica-formato-e2)
- [GOMSA — MVE será obligatoria en junio 2026](https://publicaciones.gomsa.com/2026/04/mve-sera-obligatoria-en-junio-2026-conoce-los-puntos-clave/)
- [Simetría Legal — MVE 2026: prórroga, VUTCE y riesgo aduanero](https://www.simetrialegal.mx/negocio-sin-riesgo/manifestacion-valor-electronica-vucem-2026)
