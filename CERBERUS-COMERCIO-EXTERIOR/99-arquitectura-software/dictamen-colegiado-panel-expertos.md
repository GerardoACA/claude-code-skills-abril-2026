# Dictamen colegiado del panel de expertos — CERBERUS

> **Generado por:** panel de 11 expertos (9 sillas fijas + 2 consultores) + moderador
> **Fecha:** 30 de junio de 2026
> **Insumos revisados:** [reporte normativo](../00-investigacion/reporte-fiscalizacion-comercio-exterior-2025-2026.md) y [dictamen de arquitectura](./dictamen-y-arquitectura-cerberus.md)

## 1. Resumen ejecutivo

El panel coincide en que CERBERUS es **viable y bien encaminado en su columna vertebral** (aislamiento de dependencias gubernamentales tras una Anti-Corruption Layer con colas/reintentos, bitácora inmutable append-only con hash-chain + WORM, externalización de reglas a un motor versionado, premisa de responsabilidad solidaria del agente), **pero NO es completo ni está listo para producción tal como se describe**. El diagnóstico transversal es que el diseño modela la **forma** del despacho (KYC, prevalidación, cuadre documental, lectura del semáforo) pero es **ciego al fondo sustantivo** donde se origina el crédito fiscal, la PAMA y el riesgo penal: clasificación arancelaria/NICO, construcción del valor en aduana e incrementables, RRNA/NOMs/permisos, origen/tratados, re-determinación independiente de contribuciones, la incidencia del reconocimiento rojo (acta/PAMA), el ciclo real de los Anexos 24/30/31, la separación técnica e.firma/CSD/sello de prevalidación, y un régimen de protección de datos/secreto fiscal y de prueba penal hoy inexistentes. Varios paneles emiten un **veredicto condicionado**: el DPO pide expresamente **no liberar a producción** sin rediseñar privacidad y el acceso de la autoridad. La dirección es correcta; el alcance "end-to-end" anunciado no se sostiene sin módulos sustantivos y sin recalibrar prioridades de fase.

## 2. Consenso del panel

1. **El "bloqueo automático" del software es jurídicamente peligroso.** El abogado RGCE/CFF y el penalista coinciden: CERBERUS no es autoridad, no puede "bloquear"; debe **alertar y frenar como propuesta** que el responsable solidario confirma o anula mediante **override firmado con e.firma, motivado y auditado**. Un bloqueo mal calibrado (p. ej. en etapa de 69-B presunto) genera responsabilidad civil del proveedor por interrupción indebida.

2. **La fracción arancelaria es el origen del riesgo, no un dato de catálogo.** Inspector ANAM, experto en comercio exterior, contador, perito clasificador y arquitecto SAT coinciden: falta motor de **clasificación (NICO de 10 dígitos)**, **valoración aduanera con incrementables (art. 64-65 LA)**, **RRNA/NOMs/permisos**, **cuotas compensatorias por fracción+origen** y **precios estimados**. Sin ello no se detecta mala clasificación ni subvaluación, que es donde el SAT determina diferencias.

3. **El semáforo no es binario y el sistema enmudece justo donde litiga el dinero.** Inspector ANAM y experto en comercio exterior: falta la **máquina de estados del despacho** y, sobre todo, la **incidencia del reconocimiento rojo** (acta circunstanciada, PAMA, embargo precautorio, rectificación art. 89, desistimiento art. 93). M8 audita un objeto incompleto.

4. **El expediente y la conservación están colapsados; los plazos son distintos.** Agente CAAAREM, abogado CFF, contador, penalista y DPO: hay que separar **ExpedienteKYC 1.4.14 (3 años)**, **ExpedienteProbatorioDespacho (~5 años, art. 30/67 CFF)** y el **doble expediente 3.1.42**, con custodios y retención propios. El versionado **no debe purgar versiones históricas** que pueden ser prueba exculpatoria alineada a prescripción penal/caducidad.

5. **El acceso remoto continuo de la autoridad está sobre-extendido y sub-acotado.** Inspector ANAM, agente, abogado CFF, penalista, DPO y ASIPONA: la obligación de acceso continuo es del **recinto/RFE**, no de todo tenant. El acceso de SAT/ANAM debe atarse a **facultad/orden concreta (sujeto, periodo, contribución)**, con expiración, default-deny y registro inmutable. Tal como está, viola **secreto fiscal (art. 69 CFF)** y **LFPDPPP** y crea superficie de exfiltración masiva.

6. **La responsabilidad solidaria 2026 exige atribución personal (patente) y el dossier de debida diligencia como producto, no como feature.** Agente CAAAREM y experto en comercio exterior: subir el dossier de diligencia a Fase 1; amarrar cada acto a la **patente/persona física** que lo promueve, no solo al tenant.

7. **La bitácora hash-chain es necesaria pero insuficiente como prueba.** Penalista, arquitecto SAT y DPO: falta **sellado de tiempo calificado (TSA/NOM-151)**, **no-repudio de actor (e.firma por acto)**, **snapshot fechado de las listas 69-B/DOF consultadas**, cadena de custodia y "exporte probatorio" verificable por perito tercero.

## 3. Hallazgos priorizados

| Sev. | Tema | Panelista(s) | Fundamento legal/técnico | Recomendación |
|---|---|---|---|---|
| Crítica | "Bloqueo automático" expone a responsabilidad civil; el software no puede bloquear | Abogado RGCE/CFF; Penalista | Art. 69-B y efectos solo tras definitivo; art. 1910 CCF; art. 13 CPF | Nunca bloquear; alertar + frenar como propuesta con override e.firma motivado y auditado; disclaimer "herramienta de alerta, no decisor" |
| Crítica | Ausencia de motor de clasificación arancelaria y NICO; fracción tratada como dato de catálogo | Perito clasificador; Comercio exterior; Inspector ANAM | LIGIE/TIGIE; Anexo 6 RGCE; arts. 81, 184-III, 36-A LA | Módulo de clasificación con NICO 10 díg., RGI 1-6, UMT, justificación por partida, versionado temporal; validar coherencia descripción↔fracción |
| Crítica | Valoración reducida a "cuadre CFDI vs pedimento"; sin valor en aduana ni incrementables | Comercio exterior; Contador; Perito; Penalista | Arts. 64-78 LA; art. 65 (incrementables); Acuerdo de Valoración OMC (art. VII GATT) | Entidad ValoracionAduanera (método 1-6, incrementables, INCOTERM, vinculación art. 68); alertar bajo precios estimados/valores de referencia |
| Crítica | Sin motor de re-determinación independiente de contribuciones (IGI/IVA/IEPS/DTA/cuotas) | Contador | Arts. 52, 56, 64-78 LA; art. 49 LFD; arts. 1-A, 24 LIVA; art. 20 CFF (TC) | Recalcular desde base gravable; descomponer Pago (base, arancel, TC, fecha causación); diferencia >0 = alerta de omisión |
| Crítica | Semáforo binario; falta máquina de estados e incidencia del reconocimiento rojo (acta/PAMA) | Inspector ANAM (Comercio exterior afín) | LA arts. 43, 44, 46, 150-153; RGCE Tít. 3 | Máquina de estados despacho→selección→reconocimiento→incidencia→acta/PAMA/embargo/regularización/rectificación/desistimiento |
| Crítica | Ausencia de módulo RRNA (NOMs, permisos previos, avisos, cupos) | Comercio exterior; Perito; Inspector ANAM | Arts. 56, 36-A LA; Acuerdo RRNA SE; NOMs; cupos | Dada fracción/NICO+régimen, listar RRNA exigibles y exigir el documento antes de prevalidar; frenar si falta |
| Crítica | Modelo de datos del Anexo 24 no refleja Apartados A/B/C; SACI no es "una tabla" | Especialista IMMEX | Anexo 24 RGCE (A/B/C); regla 7.1.1 | Rediseñar M5 por apartado: catálogos, importaciones, descargos PEPS; el campo "no_retornado" no sustituye módulo de descargos |
| Crítica | Descargo PEPS debe ser por fracción/parte/UMT con BOM y mermas, no por "item" | Especialista IMMEX; Contador | Anexo 24 B/C; LIGIE; control de mermas/desperdicios | Entidades ListaDeMateriales(factor), CapaPEPS, Descargo(pedimento_retorno, insumo, capa) |
| Crítica | Plazos de permanencia (108 LA) distintos del plazo 48h del SACI | Especialista IMMEX; Comercio exterior | Arts. 108, 109 LA; Anexo 31 | Motor de vencimientos por capa con fecha límite por tipo de bien y alertas escalonadas (90/60/30/15) |
| Crítica | Anexo 31 implica calcular y enterar crédito fiscal sobre saldos no retornados, no solo "conciliar" | Especialista IMMEX; Contador | Anexo 31; art. 28-A LIVA, 15-A LIEPS; reglas 7.3.x | Calcular base, IVA/IEPS, actualización y recargos; generar línea de captura; registrar en bitácora |
| Crítica | 69-B modelado binario; faltan 5 situaciones, plazo de 15 días y omisión de 69-B Bis | Abogado RGCE/CFF | Art. 69-B y 69-B Bis CFF | Enumerado PRESUNTO/DESVIRTUADO/DEFINITIVO/SENTENCIA_FAVORABLE; verificación separada de 69-B Bis; no bloquear a quien desvirtuó |
| Crítica | Sellado de tiempo no confiable; hash-chain no prueba CUÁNDO | Penalista; Arquitecto SAT | Arts. 108-109 CFF; 105 LA; 210-A CFPC; NOM-151-SCFI-2016 | TSA RFC 3161 de PSC acreditado + Constancia de Conservación NOM-151 por bloque/documento |
| Crítica | No-repudio de ACTOR ausente; bitácora con user-id es repudiable | Penalista | Arts. 102/105 LA; 108-109 CFF; 13 CPF; 19 CNPP | Cada acto crítico firmado con e.firma del operador humano y sellado, no user-id de sesión |
| Crítica | Overrides sin motivación firmada "regalan" el dolo a la Fiscalía | Penalista | Art. 69-B, 108 CFF; LFPIORPI 17-18; 13 CPF | Override = acto firmado, motivado, inmutable, con maker-checker para riesgo alto |
| Crítica | Confusión e.firma (FIEL) vs CSD vs sello de prevalidación en una sola librería | Arquitecto SAT | Anexo 20 RMF; arts. 29, 29-A CFF | Separar tres artefactos: FIEL (actos del contribuyente), CSD (sello CFDI), sello de prevalidación; cada uno con su vigencia/estado |
| Crítica | Cadena original del CFDI con XSLT oficial del SAT no contemplada | Arquitecto SAT | Anexo 20 (CFDI 4.0, CP 3.1, CCE 1.1) | Pipeline canónico XSD→XSLT oficial→cadena original→sello CSD→PAC; versionar XSLT y mantener CFDI de regresión |
| Crítica | Ausencia total del régimen LFPDPPP (responsable/encargado, aviso, ARCO, base de licitud) | DPO | LFPDPPP arts. 3, 8-9, 15-18, 22-26, 36; RLFPDPPP 14-21 | CERBERUS = encargado; SAT/ANAM = terceros receptores; avisos por perfil, consentimiento sellado, módulo ARCO |
| Crítica | Acceso de autoridad sin scoping a orden/facultad ni límite temporal | DPO; Abogado CFF; Penalista; Inspector ANAM; ASIPONA | LFPDPPP 6-7, 10-11, 37; art. 42 y 69 CFF; art. 16 CPEUM | Acceso ligado a mandato verificable (tenant, periodo, alcance, expiración); default-deny; cuenta sin orden = cero visibilidad |
| Crítica | RLS no protege la ruta real de fuga (workers/rol AUTORIDAD con BYPASSRLS o tenant_id de app) | DPO | LFPDPPP 19; RLFPDPPP 57-61 | Cada query bajo rol no-superusuario sin BYPASSRLS; SET tenant_id validado contra token; tests en CI de que ningún rol tiene BYPASSRLS |
| Crítica | El sistema del RECINTO/RFE no existe; M8 audita al usuario, no al recinto | ASIPONA | LA reformada 14, 14-A, 14-D, 119; Reglamento 23-feb-2026 | Perfil OPERADOR DE RECINTO con módulo propio, o declarar explícitamente fuera de alcance para no inducir incumplimiento |
| Crítica | Trazabilidad física en patios ausente (ubicación, slot, movimientos intra-recinto) | ASIPONA | Reforma LA 2026; Reglamento 23-feb-2026 | Entidades UbicacionPatio/Slot, UnidadAlmacenable, EventoTrazabilidad con timestamp/geo/responsable |
| Crítica | M7 (dossier de debida diligencia) relegado a Fase 4 | Agente CAAAREM | Reforma LA 2026 (responsabilidad solidaria, sin excluyentes) | Subir el dossier sellado por operación a Fase 1 (MVP); el scoring puede esperar, el dossier no |
| Crítica | Encargo conferido (B14/B21) tratado como check, sin vigencia/revocación ni amarre por operación | Agente CAAAREM | Art. 59-III, 54 LA; RGCE encargo conferido | Verificar encargo VIGENTE y ACEPTADO antes de generar pedimento; bloquear si revocado/vencido; sellar la consulta en cada despacho |
| Alta | INCOTERMS no modelados pese a determinar incrementables y base gravable | Comercio exterior; Perito | Incoterms 2020; arts. 64-65 LA | INCOTERM como atributo obligatorio de Operacion ligado al motor de incrementables |
| Alta | Origen y tratados (T-MEC/TLCs) completamente ausentes | Comercio exterior | T-MEC cap. 4-5; reglas de origen; Decreto IMMEX | Gestión de certificados de origen, vigencia y reglas por fracción; riesgo fiscal por preferencia indebida |
| Alta | Padrón de Importadores/Sectores como bandera; falta estado de SUSPENSIÓN re-verificado en despacho | Inspector ANAM; Agente; Comercio exterior | Art. 59-IV LA; RGCE 1.3.x; Anexo 10 | Estado con vigencia/motivo re-verificado antes de cada operación, no solo en KYC |
| Alta | Restricción de CSD reducida a "monitoreo"; no distingue 17-H de 17-H Bis ni el procedimiento de 40 días | Abogado RGCE/CFF | Arts. 17-H y 17-H Bis CFF | Modelar CSD_CANCELADO vs CSD_RESTRINGIDO; gestionar aclaración, plazos y resolución |
| Alta | Materialidad = "adjuntar PDF" sin estándar probatorio (sustancia, razón de negocios, plazo 15 días) | Abogado RGCE/CFF; Penalista | Art. 69-B y 5-A CFF | Estructurar evidencia por elemento probatorio; "dossier de defensa 69-B" generable en <15 días |
| Alta | DODA y Gafete Electrónico tratados como intercambiables | Inspector ANAM | RGCE operación del despacho; reglas de Gafete | Separar: DODA = documento de operación; Gafete = identifica a la persona física con su vigencia/padrón |
| Alta | Se asume "leer el semáforo del SEA en tiempo real" antes del cruce | Inspector ANAM; Arquitecto SAT (afín) | Art. 43 LA; SEA/ANAM | El resultado se materializa al presentar mercancía+DODA; marcar estado pendiente_presentacion; polling con backoff |
| Alta | Cuadre valor solo a nivel total, no por partida ni con incrementables | Contador; Perito; Arquitecto SAT | Arts. 64-65 LA; CCE 1.1; Anexo 20 | Cuadre por partida (cant. × unitario) con incrementables conciliados; tolerancias de redondeo; TC del DOF correcto |
| Alta | Falta conciliación contable (contabilidad electrónica, cuentas de aduana, IVA acreditable) | Contador | Art. 28 III/IV CFF; art. 5 LIVA | Conciliación pedimento↔póliza↔CFDI; validar IVA de importación acreditable con pedimento a nombre del importador |
| Alta | Causación/descargo IVA-IEPS en temporales no ligado al crédito 28-A/15-A | Contador; Especialista IMMEX | Art. 28-A LIVA, 15-A LIEPS; Anexos 30/31 | Calcular contingencia fiscal por saldo no retornado vencido como pasivo del cliente y exposición del agente |
| Alta | Ciclo administrativo SE/SAT ausente (programa IMMEX, anexo de bienes, reporte anual, renovación CIVA) | Especialista IMMEX | Decreto IMMEX; reglas 7.2.x RGCE | Entidades ProgramaIMMEX, AnexoBienes, ObligacionPeriodica y tablero de causales de cancelación |
| Alta | Operaciones virtuales (V1/V5), transferencias y submanufactura sin descargo | Especialista IMMEX; Contador; Comercio exterior | Reglas 4.3.x RGCE; art. 112 LA | Modelar Transferencia(origen, destino, pedimento virtual par, constancia); cuadre par a par del IVA causado/acreditado |
| Alta | Idempotencia del timbrado y cancelación CFDI 4.0 no diseñadas | Arquitecto SAT | CFF 29; estándar CFDI 4.0 | Clave de idempotencia (hash cadena original), consulta de estatus antes de reintentar; modelar cancelación (motivos 01-04) y sustitución 04 |
| Alta | Catálogos sustantivos (TIGIE/NICO, Anexo 22/27/10, XSD/XSLT) no versionados como dependencias | Comercio exterior; Arquitecto SAT; Perito | Anexos 22/27/10 RGCE; Anexo 20 | Versionar XSD, XSLT y catálogos c_* con vigencia temporal; Anexo 27 determina IVA a la importación |
| Alta | Sin tablero de riesgo de PATENTE (umbrales de cancelación/suspensión) | Agente CAAAREM | Arts. 164, 165 LA | Alertar al acercarse a umbrales del art. 165 y supuestos del 164; el riesgo terminal del agente es perder la patente |
| Alta | MVE/E2 sin expediente de valor previo a transmitir ni método de valoración | Agente; Comercio exterior; Perito | Art. 59-A, 64, 68 LA; Acuerdo OMC | Exigir y vincular soporte de valor (factura, contrato, INCOTERM, SWIFT, vinculación) antes del E2 |
| Alta | Snapshot fechado de listas 69-B/DOF no conservado | Penalista | Arts. 69, 69-B CFF; regla 1.4.14-X | Persistir el artefacto consultado (PDF/CSV del DOF) con hash y fecha, no solo el booleano |
| Alta | Cadena de custodia de evidencia digital no diseñada para sede penal | Penalista | Arts. 227-228, 272, 383-390 CNPP | Función de "exporte probatorio" autocontenido verificable por perito tercero (registros+hashes+NOM-151+manual) |
| Alta | Solo se conserva el "flujo feliz"; se descarta lo que prueba diligencia | Penalista | Art. 109 CFF; 105 LA; 13 CNPP | Conservar inmutablemente rechazos, correcciones, versiones intermedias y alertas atendidas |
| Alta | Datos sensibles/e.firma/geo sin régimen reforzado; clave privada no debe almacenarse | DPO | LFPDPPP art. 3-VI, 9 | Consentimiento expreso; firmar del lado del titular o HSM/KMS; cifrado a nivel campo |
| Alta | Portal/API de autoridad como superficie de exfiltración masiva | DPO | LFPDPPP 19-20 | MFA resistente a phishing (FIDO2), allow-list IP/mTLS, rate-limiting, detección de exfiltración, perímetro aislado |
| Alta | Sin procedimiento de notificación de brechas ni respuesta a incidentes | DPO | LFPDPPP 20; RLFPDPPP 63-66 | Runbook de incidentes y contrato de encargo con responsabilidades de notificación por tenant |
| Alta | Falta contrato de encargo y cláusulas de transferencia (tenant/CERBERUS/autoridad/subencargados) | DPO | LFPDPPP 36; RLFPDPPP 49-55 | Tratar datos solo bajo instrucciones documentadas; registrar subencargados (nube, PAC, KMS); no usar para fines propios |
| Alta | Tiempos de almacenaje y abandono no modelados (recinto) | ASIPONA | Arts. 15, 29, 32 LA | Reloj de almacenaje por unidad, alertas de abandono, cálculo de cargos |
| Alta | Videovigilancia/CCTV mencionada pero no diseñada | ASIPONA | Reforma LA 2026 | Ingesta VMS/NVR (RTSP/ONVIF), retención WORM de video con sello, correlación evento↔cámara |
| Alta | "Tiempo real" del recinto mal calibrado (polling de lectura vs publicación push) | ASIPONA | Reforma LA 2026 | Canal de PUBLICACIÓN recinto→SEA/ANAM (push/streaming) con SLA y heartbeat, distinto de la lectura del semáforo |
| Alta | Interoperabilidad recinto↔SEA infraespecificada (no es VUCEM/E2) | ASIPONA | Reforma LA 2026; SEA/ANAM | Conector ANAM-recinto con diccionario/XSD propio versionado; confirmar catálogo de mensajes con ANAM |
| Media | 69-B → EDOS retroactivo no gestionado (proveedor que se vuelve definitivo) | Abogado RGCE/CFF | Art. 69-B CFF (plazo 30 días) | Identificar retroactivamente CFDI ya usados y disparar plazo de 30 días para corregir/acreditar |
| Media | Buzón tributario sin cómputo de plazos de notificación | Abogado RGCE/CFF | Arts. 17-K, 134 CFF | Computar efectos (4º día hábil) y disparar alertas de plazos derivados (15 días 69-B, 40 días CSD) |
| Media | Cita errónea "art. 49 Bis CFF" (no existe) en la manifestación no-EFOS | Abogado RGCE/CFF | Regla 1.4.14 RGCE; art. 69-B CFF | Corregir fundamento; una manifestación con base inexistente es impugnable |
| Media | DTA como monto único sin distinguir régimen (fija/ad valorem/exenta) | Contador | Art. 49 LFD | Parametrizar DTA por régimen de pedimento |
| Media | Sin actualización, recargos y multas en la cuantificación del riesgo | Contador; Abogado CFF | Arts. 17-A, 21, 76, 78 CFF; Anexo 5 RMF (UMA) | Cuantificar contingencia = principal + actualización + recargos + multa, con sujeto infractor identificado |
| Media | Acceso remoto continuo generalizado a todo tenant como si fuera RFE | Inspector ANAM; ASIPONA | Reforma LA 2026 (obligación de recintos) | Perfiles de exposición diferenciados por tipo de tenant; no ofrecer "acceso continuo" a todos por igual |
| Media | Sin rectificación (89), desistimiento (93) ni duda de valor (78-A/C) | Inspector ANAM; Comercio exterior; Perito | Arts. 78-A, 78-C, 89, 93 LA | Modelar transiciones reales del pedimento y alojarlas en la bitácora |
| Media | Multi-tenant: acceso de autoridad puede ver expedientes de otros agentes/clientes | Agente; Penalista; DPO | Art. 69 CFF; RLS; CNPP | Scoping por operación/pedimento y por requerimiento formal citado; tests de fuga como control probatorio |
| Media | Bitácora WORM como lago de datos personales imborrable choca con minimización/ARCO | DPO | LFPDPPP 6, 11 | Guardar hashes/referencias, no copias; separar cadena de integridad de los datos sustantivos |
| Media | Residencia MX comprometida por subprocesadores (nube/PAC/KMS/telemetría) | DPO | LFPDPPP 36 | Inventariar flujos y subprocesadores; scrubbing de logs; confinar backups/claves a MX |
| Media | Precios estimados / cuentas aduaneras de garantía no contemplados | Comercio exterior; Perito | Arts. 84-A, 86-A LA; Anexo 3 RGCE | Alertar cuando el valor unitario cae bajo el precio estimado y exigir garantía |
| Media | Niveles A/AA/AAA sin comportamiento funcional diferenciado | Especialista IMMEX | Reglas 7.x RGCE | Nivel como atributo del tenant que parametriza calendarios de renovación y SLAs de devolución |
| Media | Mermas, desperdicios y rectificaciones que rompen el PEPS no modelados | Especialista IMMEX | Anexo 24; art. 89 LA | Entidades de merma/desperdicio y re-proceso de capas PEPS ante rectificación |
| Media | Acceso en tiempo real al SACI (Anexo 24) con su propia mecánica de credenciales | Especialista IMMEX; ASIPONA | Anexo 24; reforma LA 2026 | Vista/credencial por tenant con aislamiento y SLA propios para el inventario |
| Media | Perfil agencia aduanal vs agente persona física no diferenciado | Agente; Comercio exterior | Reforma LA 2026 | Modelar relación patente-agencia-mandatario y atribuir cada firma a la persona responsable |
| Media | Prevalidación como check sintáctico sin sellar la decisión del agente ante discrepancias | Agente | Art. 16-A LA; Reglamento 23-feb-2026 | Sellar en bitácora la decisión motivada de proceder pese a discrepancia |
| Baja | CAAT/transportista no verificado contra padrón en el cruce | Inspector ANAM | RGCE CAAT; Carta Porte 3.1 | Modelar Transportista(CAAT, vigencia) ligado a DODA y Carta Porte |
| Baja | Depósito fiscal y tránsitos no contemplados; modelo acoplado a A1/IN | Comercio exterior | Arts. 119-134 LA | Dejar extensible el tipo de régimen en el modelo de datos |
| Baja | Conservación del XML timbrado + acuse + XSD/XSLT no garantizada para revalidación | Arquitecto SAT | Art. 30 CFF | Conservar XML+acuse+complemento con verificación de hash y el esquema con que se generó |
| Baja | Retención de 3 años puede destruir prueba exculpatoria | Penalista; Contador | Art. 30 CFF; prescripción CPF; art. 67 CFF | Retención legal alineada a prescripción penal/caducidad, no al ciclo administrativo |
| Baja | Registro de acceso de autoridad no visible/exportable para el tenant afectado | DPO | LFPDPPP 6, 14 | Hacerlo visible al tenant e inalterable incluso por admins; firmar cada evento de acceso |

## 4. Dictamen por especialista

### Inspector ANAM — Reconocimiento Aduanero (silla fija)
**Veredicto:** entiende el papeleo previo pero modela el despacho como "leer un semáforo verde/rojo"; enmudece justo donde la autoridad y el contribuyente litigan dinero.
- El semáforo no es binario; falta la incidencia de reconocimiento, el acta y la PAMA (M8 queda ciego). **(Crítica)**
- DODA y Gafete tratados como sinónimos; son documentos distintos. **(Alta)**
- Padrón como bandera sin estado de suspensión re-verificado; faltan fracción/RRNA/NOMs como objeto de validación de primera clase. **(Alta)**

### Agente aduanal CAAAREM (silla fija)
**Veredicto:** bien encaminado, pero diseñado desde la óptica del importador, no del agente que responde con su patrimonio y patente.
- M7/dossier de debida diligencia relegado a Fase 4: para el agente, es la condición para la primera operación. **(Crítica)**
- Encargo conferido sin vigencia/revocación ni amarre operación-a-encargo. **(Crítica)**
- Confusión entre expediente 1.4.14, probatorio del despacho y doble 3.1.42, con plazos distintos. **(Alta)**

### Experto en Comercio Exterior (silla fija)
**Veredicto:** captura el eje fiscal-tributario pero con sesgo no aduanero-operativo; el "end-to-end" no se sostiene sin módulos sustantivos.
- Sin motor de clasificación ni control de Padrón de Sectores Específicos/Exportadores. **(Crítica)**
- Valoración reducida a "cuadre CFDI"; faltan método, incrementables y vinculación. **(Crítica)**
- Ausencia de módulo RRNA y de origen/tratados. **(Crítica/Alta)**

### Especialista RGCE y CFF (silla fija)
**Veredicto:** sólido en lo operativo pero confunde conceptos jurídicos fuente de responsabilidad e impugnación; convierte cumplimiento en automatismos riesgosos.
- "Bloqueo automático" expone al proveedor y al agente a responsabilidad civil. **(Crítica)**
- 69-B modelado binario; faltan cinco situaciones, plazo de 15 días y 69-B Bis. **(Crítica)**
- CSD reducido a monitoreo; no distingue 17-H de 17-H Bis ni el procedimiento de aclaración. **(Alta)**

### Contador de Comercio Exterior (silla fija)
**Veredicto:** sirve para demostrar que existió la operación, no que la contribución se determinó y pagó bien, que es el corazón de una fiscalización contributiva.
- Sin motor de re-determinación independiente de contribuciones. **(Crítica)**
- Tipo de cambio y conversión cambiaria no modelados. **(Alta)**
- Cuadre solo a nivel total; falta conciliación contable y causación IVA/IEPS en temporales. **(Alta)**

### Penalista en contrabando y PLD (silla fija)
**Veredicto:** está pensado como cumplimiento administrativo, no para producir prueba idónea en sede penal, que es donde el cliente se juega la libertad.
- Sellado de tiempo no confiable; la hash-chain no prueba cuándo. **(Crítica)**
- No-repudio de actor ausente; el user-id es repudiable. **(Crítica)**
- Overrides sin motivación firmada regalan el dolo a la Fiscalía. **(Crítica)**

### DPO Técnico — Datos Personales y Ciberseguridad (silla fija)
**Veredicto:** NO liberar a producción sin rediseñar privacidad y el modelo de acceso de la autoridad; CERBERUS es el peor escenario de privacidad imaginable.
- Ausencia total del régimen LFPDPPP (responsable/encargado, aviso, ARCO). **(Crítica)**
- Acceso de autoridad sin scoping a orden ni límite temporal. **(Crítica)**
- RLS no protege la ruta real de fuga (workers/rol AUTORIDAD con BYPASSRLS). **(Crítica)**

### Arquitecto de Integración SAT (silla fija)
**Veredicto:** acierta en lo macro pero opera a un nivel de abstracción peligroso y mezcla mundos de firma que no son intercambiables.
- Confusión e.firma (FIEL) vs CSD vs sello de prevalidación en una sola librería. **(Crítica)**
- Cadena original del CFDI con XSLT oficial del SAT no contemplada. **(Crítica)**
- M3/M4 se construirían sin los XSD/XSLT/catálogos (riesgo de cronograma real). **(Alta)**

### Especialista IMMEX/SE (silla fija)
**Veredicto:** dirección correcta pero la profundidad de M5 está peligrosamente subestimada; el modelo actual no produce un Anexo 24/30/31 defendible.
- Modelo no refleja Apartados A/B/C del Anexo 24. **(Crítica)**
- Descargo PEPS debe operar por fracción/parte/UMT con BOM y mermas. **(Crítica)**
- Plazos de permanencia (108 LA) y el cálculo/entero del crédito fiscal del Anexo 31. **(Crítica)**

### Funcionario ASIPONA — Recintos/RFE (consultor)
**Veredicto:** está diseñado para el USUARIO de comercio exterior, no para el OPERADOR/RECINTO; la ambigüedad es el mayor riesgo (vender "auditoría en vivo" a un puerto puede leerse como cumplimiento del recinto, y no lo es).
- El sistema del recinto/RFE no existe como módulo. **(Crítica)**
- Trazabilidad física en patios ausente. **(Crítica)**
- Tiempos de almacenaje/abandono y videovigilancia no diseñados. **(Alta)**

### Perito en clasificación y valoración (consultor)
**Veredicto:** la fracción se trata como dato a validar, no como el origen del 80% del riesgo real; sin clasificación y valoración, CERBERUS es ciego al riesgo sustantivo.
- No existe módulo de clasificación arancelaria con NICO. **(Crítica)**
- No hay construcción del valor en aduana ni control de incrementables; no detecta subvaluación. **(Crítica)**
- Modelo de datos sin entidad Partida/Mercancía. **(Alta)**

## 5. Preguntas abiertas para el cliente (Gerardo)

**Alcance y promesa del producto**
1. ¿CERBERUS **calcula** contribuciones y **determina RRNA por fracción** (alcance sustantivo) o solo **orquesta y valida la forma** del despacho? La respuesta define si necesita motores de clasificación/valoración/origen o solo workflow.
2. ¿Cubre el flujo de reconocimiento rojo **end-to-end** (acta, PAMA, embargo, pruebas y alegatos) o solo registra que salió rojo?
3. ¿Sirve al perfil **OPERADOR DE RECINTO** (ASIPONA/RFE/patios) o solo a usuarios de comercio exterior? Si no, ¿se declarará explícitamente fuera de alcance para no inducir incumplimiento?
4. ¿M5 GENERA el Anexo 24 SACI en el layout que el SAT consume, o solo audita un inventario que ya lleva otro sistema/ERP de la maquila? ¿Habrá integración con BOM/ERP?
5. ¿Se contemplan pedimentos virtuales (V1/V5), transferencias entre IMMEX, depósito fiscal y tránsitos?

**Integraciones técnicas**
6. ¿ANAM autorizará integración real al SEA para leer el estatus/resultado del módulo, o se dependerá del acuse capturado por el agente? (define si M8 es auditoría "en vivo" o "a posteriori").
7. ¿Qué PAC(es) soporta hoy Carta Porte 3.1 y CCE 1.1 con sandbox y SLA? ¿Multi-PAC con failover?
8. ¿Ya están ingeridos y versionados los XSD, XSLT y catálogos c_* (CFDI 4.0, CP 3.1, CCE 1.1, TIGIE/NICO, Anexos 22/27/10)? ¿Cómo se actualizarán ante cada resolución?
9. ¿La cadena original del CFDI se generará con el XSLT oficial del SAT en el backend o se delega al PAC?
10. ¿Se modelará la cancelación CFDI 4.0 (motivos 01-04, aceptación del receptor) y la sustitución?

**Responsabilidad, prueba y datos personales**
11. ¿Quién asume contractualmente la responsabilidad cuando el software frena (o no) por una lectura del listado 69-B: agente, tenant o CERBERUS? ¿Existe matriz de responsabilidad y disclaimer "herramienta de alerta, no decisor"?
12. ¿CERBERUS emitirá Constancias NOM-151 y contratará TSA/PSC acreditado, o asume que la hash-chain interna basta como prueba oponible a terceros?
13. ¿El override de alertas exige e.firma del autorizante, motivación capturada y maker-checker para riesgo alto?
14. ¿Existe un "exporte probatorio" que un perito tercero pueda verificar sin acceso al sistema vivo?
15. ¿Cuál es la base jurídica EXACTA del "acceso remoto continuo" de SAT/ANAM y cómo se acota a una facultad concreta (sujeto, periodo, contribución) en vez de visibilidad permanente sobre todos los tenants?
16. ¿CERBERUS es **encargado** de cada tenant, **responsable** propio, o ambos según el dato? ¿Hay DPIA para este tratamiento de alto riesgo como entregable de Fase 0?
17. ¿Dónde y cómo se custodia la **clave privada de la e.firma**? ¿Se firma del lado del titular o en HSM?
18. ¿El plazo de conservación WORM está parametrizado por tipo de expediente (3 años 1.4.14 vs ~5 años art. 30/67 CFF vs prescripción penal), o usa un plazo único que podría borrar prueba aún exigible?

**Migración y datos heredados**
19. Al portar M1 desde SIDF MD: ¿bajo qué aviso de privacidad y consentimiento se captaron los datos, y cubre la nueva finalidad (exposición a la autoridad)? ¿La e.firma de SIDF MD produce firmas con valor probatorio (NOM-151, no-repudio)? ¿SIDF MD ya trata el 69-B como binario?
20. ¿Cómo se manejará la transición de mercancía importada temporalmente bajo reglas anteriores frente a la reforma LA 2026 y al Reglamento (DOF 23-feb-2026), con saldos abiertos cuyo marco cambió a media vida?

## 6. Recomendación final del panel

**Sí procede construir, pero con condiciones.** La arquitectura base es correcta y el panel respalda la columna vertebral (ACL, bitácora WORM, motor de reglas versionado, premisa de responsabilidad solidaria). Sin embargo, el plan por fases tal como está descrito **invierte prioridades de riesgo** y **promete una cobertura "end-to-end" que no entrega**. El panel exige los siguientes cambios **antes de arrancar** o como condición de Fase 0/1:

**Condiciones bloqueantes (Fase 0, previas a tocar producción):**
1. **DPIA y rediseño de privacidad/acceso de autoridad.** Definir roles LFPDPPP (CERBERUS = encargado; SAT/ANAM = terceros con base legal propia), avisos por perfil, ARCO, y un modelo de acceso de autoridad **default-deny atado a orden/facultad con expiración**. Cerrar la ruta real de fuga de RLS (sin BYPASSRLS, tenant_id validado contra token, tests en CI). El DPO condiciona la liberación a esto.
2. **Capa probatorio-penal.** TSA RFC 3161 + Constancia NOM-151 sobre bitácora y documentos; no-repudio de actor con e.firma por acto crítico; snapshot fechado de listas 69-B/DOF; "exporte probatorio" verificable por perito tercero; conservación del material descartado.
3. **Sustituir todo "bloqueo automático" por alertar + frenar como propuesta** con override firmado y motivado, y publicar el disclaimer "herramienta de alerta, no decisor" con su matriz de responsabilidad contractual.
4. **Corregir la separación criptográfica** e.firma (FIEL) / CSD / sello de prevalidación en el modelo de datos y el stack, e **ingerir/versionar XSD, XSLT y catálogos** antes de comprometer fechas de Fase 2.

**Cambios de modelo de datos (reservar las entidades correctas desde el inicio para evitar reescrituras):**
5. **Entidad Partida/Mercancía** con fracción, NICO, UMT, origen, incrementables y valor en aduana; máquina de estados del despacho con incidencia/acta/PAMA/rectificación/desistimiento; estado de padrones con vigencia/suspensión; separación de los tres expedientes con sus plazos; encargo conferido con vigencia/revocación; atribución por patente/persona física.
6. **Reservar el modelo correcto de M5** (Anexos 24 A/B/C, CapaPEPS, BOM, mermas, transferencias virtuales, plazos del art. 108, cálculo del crédito fiscal del Anexo 31) aunque su construcción se difiera, porque retrofittear el descargo es casi una reescritura.

**Recalibración de prioridades de fase:**
7. **Subir a Fase 1 (MVP) el dossier de debida diligencia sellado por operación** (M7) — para el agente solidario es la condición para promover la primera operación, no un módulo de crecimiento.
8. **Elevar "Clasificación + Valoración" a módulo de primera clase transversal** (a M2/M3/M5); sin él CERBERUS audita la forma y es ciego al grueso del riesgo fiscal.
9. **Decidir explícitamente el alcance del perfil recinto/RFE.** O se construye un módulo dedicado (datos físicos, CCTV, gateway de interoperabilidad ANAM-recinto), o se documenta que CERBERUS **no sustituye** la obligación del operador de recinto.

Con estas condiciones el producto pasa de ser una "excelente herramienta de trámite y un mal seguro legal" (en palabras del agente CAAAREM) a un verdadero software de cumplimiento y defensa. Sin ellas, el panel advierte que CERBERUS transmite una **falsa sensación de cobertura** precisamente en los puntos donde se determina el crédito fiscal, se finca la responsabilidad solidaria y se juega la libertad del cliente.
