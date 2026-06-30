# Reporte de investigación — Fiscalización del Comercio Exterior en México 2025-2026

> **Propósito:** Insumo normativo verificado para el diseño del software CERBERUS.
> **Fecha del reporte:** 30 de junio de 2026
> **Método:** Búsquedas dirigidas con verificación de fuentes (firmas fiscales, SAT, DOF).
>
> ⚠️ **Aviso de uso:** Este documento es una guía de trabajo para desarrollo de software,
> **no asesoría legal**. Toda validación que el software implemente debe contrastarse contra
> el texto oficial vigente en el portal del SAT y el DOF antes de liberarse a producción.
> Las normas de comercio exterior cambian con frecuencia (resoluciones de modificación).

---

## Tabla resumen de obligatoriedad

| Área | Norma / versión | Obligatorio desde | Autoridad |
|------|-----------------|-------------------|-----------|
| Carta Porte | Complemento 3.1 (sobre CFDI 4.0) | 17-jul-2024 (uso obligatorio) | SAT |
| Comercio Exterior | Complemento 1.1 (CFDI 4.0) | Vigente (exportación "A1") | SAT |
| IMMEX inventarios | Anexo 24 (modif.) | 15-nov-2024 | SAT |
| IMMEX cert. IVA/IEPS | Anexos 30 y 31 | Vigente | SAT |
| Ley Aduanera | Decreto de reforma | **1-ene-2026** (DOF 19-nov-2025) | SAT / ANAM |
| RGCE 2026 | Regla 1.4.14 (1ª modif.) | DOF 14-may-2026 | SAT |
| RMF 2026 | DOF 28-dic-2025 | 1-ene-2026 | SAT |

---

## 1. CFDI 4.0 + Complemento Carta Porte 3.1

**Qué exige:** Quien traslade mercancías en territorio nacional debe emitir un CFDI (de
Ingreso o de Traslado) con el **complemento Carta Porte 3.1**. Es obligatorio para
autotransporte federal y demás medios; aplica incluso al mover mercancía propia.

**Desde cuándo:** La versión 3.1 se publicó el 17-jun-2024 y su uso obligatorio inició el
**17-jul-2024**. Desde 2025 el SAT la trata como eje central del control fiscal.

**Validaciones técnicas que el software debe hacer** (los PAC ya las exigen):
- Que las **claves de producto/servicio** existan en el catálogo SAT vigente.
- Que los **códigos postales** de origen y destino sean válidos.
- Que las **placas vehiculares** cumplan el formato oficial.
- Catálogos actualizados a enero 2026 (hay actualización de catálogos vigente).

**Sanciones:** Multas de hasta **~$97,330 MXN por documento**; los montos se publican en el
**Anexo 5 de la RMF** y se actualizan anualmente con la UMA.

**Fuentes:**
- [SAT — Complemento Carta Porte (portal oficial)](http://omawww.sat.gob.mx/tramitesyservicios/paginas/complemento_carta_porte.htm)
- [SAT — Prórroga de convivencia de versiones (gob.mx)](https://www.gob.mx/sat/prensa/sat-amplia-el-periodo-de-convivencia-entre-las-versiones-2-0-y-3-0-del-complemento-carta-porte-001-2024)
- [ADF Abogados — Errores y sanciones Carta Porte 3.1](https://adfabogadosycontadores.org/carta-porte-3-1-errores-y-sanciones-sat/)
- [IDNUBE — Catálogos Carta Porte 3.1 enero 2026](https://idnube.com/blog/catalogos-carta-porte-3-1-enero-2026)

---

## 2. CFDI 4.0 + Complemento de Comercio Exterior (exportaciones)

**Qué exige:** En la **exportación definitiva con clave de pedimento "A1"** de mercancías
objeto de enajenación, el CFDI debe incorporar el **Complemento de Comercio Exterior**
(versión 1.1). Vincula la factura con el pedimento aduanero.

**Datos obligatorios del complemento:** aduana, pedimento, ubicación; por cada mercancía:
**fracción arancelaria**, unidad de medida y valor; domicilios de emisor y receptor.
La versión 1.1 añadió nodo para A1 no enajenadas o a título gratuito, y actualizó catálogos
de fracciones arancelarias.

**Validaciones técnicas para el software:**
- Validar la **fracción arancelaria** contra el catálogo vigente (TIGIE).
- Exigir el complemento sólo cuando aplica (clave A1 enajenada) y advertir cuando falte.
- Cuadrar valor declarado en CFDI vs. pedimento.

**Fuentes:**
- [SAT — Factura de Comercio Exterior (portal)](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/complemento_comercio_exterior.htm)
- [SAT — Guía de llenado del Complemento de Comercio Exterior (PDF)](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Guia_complemento_Comercio_Exterior.pdf)
- [TLC Asociados — CFDI 4.0 en exportaciones definitivas A1](https://www.tlcasociados.com.mx/cfdi-4-0-en-las-exportaciones-definitivas-a1/)

---

## 3. IMMEX — Anexos 24, 30 y 31 de las RGCE

**Anexo 24 — Sistema Automatizado de Control de Inventarios (SACI):**
Registra todas las importaciones temporales y retornos para trazabilidad en tiempo real.
- Modificaciones vigentes desde **15-nov-2024**.
- La empresa debe dar al SAT **usuario y contraseña** para acceso en tiempo real al inventario.
- El SACI debe actualizarse en un plazo **no mayor a 48 horas** tras concluir el despacho.

**Anexo 30 — Reporte mensual (certificación IVA/IEPS):** lineamientos del reporte mensual de
descargo de importaciones temporales para empresas certificadas en IVA e IEPS.

**Anexo 31 — Control de saldos no retornados:** mecanismo por el que el SAT controla los
saldos no retornados que gozaron del crédito fiscal de la certificación IVA/IEPS.

> Los tres anexos se complementan y forman un sistema completo de control del ciclo de vida
> de la mercancía importada temporalmente.

**Validaciones técnicas para el software:**
- Motor de inventario PEPS con descargo automático contra pedimentos.
- Alertas por **plazo de 48 h** de actualización y por vencimiento de plazos de retorno.
- Conciliación de saldos retornados vs. no retornados (insumo del Anexo 31).
- Generación de reportes mensuales (Anexo 30) en el formato del SAT.

**Fuentes:**
- [SAT — Anexo 24 de las RGCE 2025 (PDF)](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2025/rgce/anexos/Anexo24delasRGCEpara2025.pdf)
- [TLC Asociados — Precisiones al SACI, Apartado C del Anexo 24 (2025)](https://www.tlcasociados.com.mx/precisiones-en-el-sistema-automatizado-de-control-de-inventarios-apartado-c-del-anexo-24-de-las-rgce-para-2025/)
- [APCE — Control de inventarios en el Anexo 24](https://www.apce.com.mx/control-de-inventarios-anexo-24/)
- Certificación IVA/IEPS: arts. **28-A LIVA** y **15-A LIEPS** (ver sección 5).

---

## 4. Reforma a la Ley Aduanera 2025-2026

**Publicación / vigencia:** Decreto publicado en el **DOF el 19-nov-2025**; entra en vigor el
**1-ene-2026**.

**Responsabilidad solidaria del agente aduanal:** los agentes aduanales que operan como
socios de una agencia aduanal pasan de responsables **subsidiarios** a **solidarios** del pago
de impuestos al comercio exterior, contribuciones y cuotas compensatorias de las operaciones
que la agencia promueva. Se **eliminan las excluyentes** de responsabilidad: el agente será
responsable en todos los casos por omisión de contribuciones.

**Recintos Fiscalizados Estratégicos (RFE) y patios:** para autorización de despacho en lugar
distinto al autorizado u operar como recinto fiscal/fiscalizado/estratégico se exige contar con
sistemas electrónicos de **control de inventarios, videovigilancia, seguridad, trazabilidad y
monitoreo en tiempo real**, interoperables con el sistema electrónico aduanero, con **acceso
remoto continuo** a las autoridades. El despacho al régimen RFE y el retiro de mercancías solo
podrá tramitarse mediante agentes aduanales inscritos en el registro de empresas certificadas.

**Validaciones / implicaciones para el software:**
- Trazabilidad y registros auditables (la responsabilidad solidaria eleva el riesgo del agente).
- Interoperabilidad con el sistema electrónico aduanero para operadores de recintos.
- Bitácoras de control de inventarios y monitoreo exportables a la autoridad.

**Fuentes:**
- [PwC — Decreto de reforma a la Ley Aduanera](https://www.pwc.com/mx/es/impuestos/novedades-fiscales/decreto-reforma-diversas-disposiciones-ley-aduanera.html)
- [EY — Reformas a la Ley Aduanera para 2026 (TAX Flash, PDF)](https://www.ey.com/content/dam/ey-unified-site/ey-com/es-mx/technical/tax/documents/ey-tax-flash-reformas-ley-aduanera-2026.pdf)
- [Grant Thornton — Reforma a la Ley Aduanera](https://www.grantthornton.mx/AlertasGT/alerta39.2025/)
- [DLA Piper — Mexico amends Customs Law and Federal Tax Code](https://www.dlapiper.com/es-mx/insights/publications/2025/11/mexico-amends-customs-law-and-federal-tax-code)

---

## 5. RGCE 2026 y su engranaje con CFF, ISR, IVA, IEPS

**Regla 1.4.14 (expediente del usuario de comercio exterior):** obliga al agente aduanal a
integrar un **expediente electrónico** por cada importador/exportador. Debe contener:
identificación oficial (de la persona física o del representante legal de la moral), acta
constitutiva y modificaciones (morales), datos de contacto (email, teléfono), comprobante del
domicilio donde se realizan las operaciones de comercio exterior, y RFC o ID fiscal equivalente
(residentes en el extranjero).
- **Actualización:** cada **3 años**, o cuando el usuario informe cambios.
- **Reforma 1ª Resolución de Modificaciones RGCE 2026** (DOF **14-may-2026**): aclara que la
  identificación es de la persona física / representante legal y precisa el domicilio.
- Relacionada con la regla **3.1.42** ("doble expediente": agente aduanal + empresa).

**Engranaje con las leyes tributarias:**
- **CFF:** marco de comprobantes (CFDI), facultades de comprobación, sellos digitales (CSD),
  responsabilidad solidaria y sanciones.
- **LISR:** efectos en deducción/acumulación de operaciones de comercio exterior.
- **LIVA (art. 28-A):** crédito fiscal del 100% del IVA en importación temporal para empresas
  con certificación IVA/IEPS.
- **LIEPS (art. 15-A):** crédito fiscal análogo del IEPS en importación temporal.

**Certificación IVA/IEPS (CIVA):** otorga crédito fiscal del **100%** del IVA e IEPS causado por
importación temporal, condicionado al retorno al extranjero en los plazos. Niveles **A, AA y
AAA** con vigencias y ciclos de devolución progresivamente mejores. Requiere autorización IMMEX
previa de la Secretaría de Economía.

**Fuentes:**
- [Comexyco — Modificación a la regla 1.4.14 RGCE 2026](https://comexyco.com/2026/04/30/modificacion-a-la-regla-1-4-14-de-las-rgce-2026-actualizacion-del-expediente-del-usuario-de-comercio-exterior/)
- [DOF/SIDOF — 1ª Resolución de Modificaciones a las RGCE 2026](https://sidof.segob.gob.mx/notas/docFuente/5787425)
- [CSENCOR — Doble expediente reglas 1.4.14 y 3.1.42](https://www.csencor.com/rgce-2026-regla-1-4-14-y-3-1-42-doble-expediente-en-comercio-exterior-agente-aduanal-empresa/)
- [American Industries — Cómo funciona el IVA en IMMEX y certificación IVA/IEPS](https://hub.americanindustriesgroup.com/insights/how-vat-works-within-the-immex-and-iva-ieps-certifications-for-global-exporters-in-mexico/)
- [SAT — Registro en el Esquema de Certificación de Empresas (IVA/IEPS)](https://wwwmat.sat.gob.mx/tramites/14661/obten-tu-registro-en-el-esquema-de-certificacion-de-empresas)

---

## 6. Resolución Miscelánea Fiscal 2026

**Publicación:** DOF **28-dic-2025**; incorpora ajustes de la Reforma fiscal 2026.

**Ejes relevantes para fiscalización electrónica:**
- **Materialidad de operaciones:** los emisores de CFDI deben poder **acreditar la existencia
  real** de las operaciones amparadas. El SAT tiene facultades renovadas de gestión y
  comprobación para verificar que las facturas amparan actos jurídicos reales; puede imponer
  sanciones, hacer visitas domiciliarias y **restringir los CSD**.
- **Buzón Tributario:** se reorganizan disposiciones de medios electrónicos y autenticación;
  hay prórroga que difiere hasta el **1-ene-2027** las multas por no activarlo.
- Cambios en opinión de cumplimiento, devoluciones y plataformas digitales.

**Validaciones / implicaciones para el software:**
- Conservar evidencia de **materialidad** (contratos, pedimentos, evidencia de entrega) ligada
  a cada CFDI.
- Monitoreo del estado de **CSD** y alertas ante riesgo de restricción.
- Gestión de notificaciones del **Buzón Tributario**.

**Fuentes:**
- [SAT — RMF 2026 (DOF 28-12-2025, PDF)](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/rmf/RMF_2026-DOF-28122025.pdf)
- [KPMG — Flash RMF 2026](https://kpmg.com/mx/es/tendencias/2025/12/flash-resolucion-miscelanea-fiscal-2026.html)
- [PwC — Resolución Miscelánea Fiscal 2026](https://www.pwc.com/mx/es/impuestos/novedades-fiscales/resolucion-miscelanea-fiscal-rmf-2026.html)
- [CONTPAQi — Principales cambios en la RMF 2026](https://www.contpaqi.com/publicaciones/tendencias-fiscales/principales-cambios-en-la-resolucion-miscelanea-fiscal-2026)

---

## Implicaciones de diseño para CERBERUS (resumen accionable)

| Módulo del software | Obligación que cubre | Validación núcleo |
|---------------------|----------------------|-------------------|
| Emisión/validación CFDI + Carta Porte | Sec. 1 | Catálogos SAT, CP, placas, claves |
| Facturación de exportación | Sec. 2 | Fracción arancelaria, cuadre con pedimento |
| Control de inventarios IMMEX | Sec. 3 | SACI, plazo 48 h, saldos no retornados |
| Expediente del cliente (1.4.14) | Sec. 5 | Integridad documental, ciclo 3 años |
| Gestión de riesgo del agente aduanal | Sec. 4 | Trazabilidad, responsabilidad solidaria |
| Cumplimiento fiscal / materialidad | Sec. 6 | Evidencia por CFDI, estado de CSD, buzón |

---

## Notas metodológicas y limitaciones

- El primer intento de investigación (harness deep-research) **identificó las fuentes
  correctas pero no pudo descargar su contenido** por restricciones de red del entorno; este
  reporte se reconstruyó con búsquedas dirigidas verificadas.
- Las **cifras de multas y fechas** deben confirmarse contra el **Anexo 5 de la RMF** y el
  texto en el DOF antes de codificarse como reglas duras.
- Pendiente de profundizar (siguiente iteración): montos exactos de sanciones por supuesto,
  catálogos técnicos (XSD) de cada complemento, y el texto íntegro del Decreto de reforma
  aduanera artículo por artículo.
