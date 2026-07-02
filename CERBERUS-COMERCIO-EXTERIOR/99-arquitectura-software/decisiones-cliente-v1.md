# Decisiones del cliente (Gerardo) — respuestas a las 20 preguntas del panel

> **Fecha:** 30 de junio de 2026
> Insumo para la **v2** del diseño de CERBERUS. Responde al cuestionario del
> [dictamen colegiado del panel](./dictamen-colegiado-panel-expertos.md).

## A. Alcance y promesa del producto

1. **Alcance central:** **Híbrido por fases.** El MVP arranca en *orquestación* (validar que el despacho esté completo y bien armado); el modelo de datos se reserva desde el inicio para sumar después los motores *sustantivos* (clasificación NICO, valoración, incrementables, RRNA, re-determinación de contribuciones).
2. **Reconocimiento rojo:** **Registra + dossier.** Registra el rojo y su resultado, y arma automáticamente el expediente probatorio para defensa. No gestiona el litigio completo (acta/PAMA/alegatos) en el sistema.
3. **Perfil operador de recinto / RFE (ASIPONA, patios, CCTV):** **Fase futura.** Fuera del MVP; se reserva en el roadmap como línea de producto posterior, sin construir ahora.
4. **IMMEX (M5) / Anexo 24:** **Audita / integra el ERP existente.** La maquila lleva su inventario en su ERP; CERBERUS lo lee, valida y reporta (dependiente de integración con BOM/ERP del cliente). No genera el SACI completo desde cero.

## B. Integraciones técnicas

5. **Auditoría en vivo (M8) / SEA:** **A posteriori.** Sin integración directa al SEA por ahora; se depende del acuse que captura el agente. Marcar como riesgo a confirmar con ANAM y diseñar para evolucionar a "en vivo" si ANAM expone web service.
6. **PAC / timbrado:** **Por elegir.** El arquitecto recomienda criterios y un diseño **multi-PAC con failover**; selección como tarea de Fase 0.
7. **Catálogos y esquemas del SAT (XSD, XSLT, TIGIE/NICO, Anexos 22/27/10):** **Parciales.** Hay algunos (posiblemente en SIDF MD); falta el pipeline completo de ingesta y versionado, que se formaliza.
8. **Cancelación / sustitución CFDI 4.0 (motivos 01-04, aceptación del receptor):** **Desde el inicio.** Se modela junto con la emisión para evitar deuda técnica.

## C. Responsabilidad, prueba y datos personales

9. **Responsabilidad ante el 69-B:** **Alerta, no decisor.** CERBERUS solo alerta/propone; la decisión y la responsabilidad son del agente/tenant vía override firmado. Disclaimer y matriz de responsabilidad explícitos para blindar al proveedor.
10. **Valor probatorio (decisión propia del cliente):** se emularán **3 hashes tipo blockchain** con fecha, hora e IP del equipo que genera el documento, y **posteriormente se conectarán las blockchains y el PSC**.
    - ⚠️ **Recomendaciones del asistente (a recoger en la v2):**
      - El sello local (fecha/hora/IP auto-declarados) es **capa de integridad interna**, pero **no constituye prueba plena frente a terceros** hasta el sellado por **PSC/TSA acreditado** (idealmente + Constancia **NOM-151**).
      - Usar **SHA-256** (no hashes de 64 bit, criptográficamente débiles y colisionables).
      - Tratar el documento como "prueba oponible" **solo a partir del sellado PSC/TSA**; antes de eso, etiquetarlo como evidencia preliminar.
11. **Override de alertas:** **e.firma + motivo** (firma del autorizante y motivación capturada; sin maker-checker/doble validación).
12. **Acceso de la autoridad (SAT/ANAM):** **Atado a orden/facultad.** Default-deny: visibilidad solo por sujeto/periodo/contribución con requerimiento formal citado y expiración. Cumple secreto fiscal (art. 69 CFF) y LFPDPPP.
13. **Rol LFPDPPP:** **Encargado del tenant.** Cada agencia/empresa es responsable; CERBERUS trata por instrucción suya. Contrato de encargo por tenant.
14. **Clave privada de la e.firma (FIEL):** **Del lado del titular.** El usuario firma en su dispositivo; CERBERUS **no** almacena la clave privada.
15. **Conservación (WORM):** **Parametrizada por tipo de expediente.** KYC 1.4.14 (3 años), probatorio de despacho (~5 años art. 30 CFF), penal (prescripción). Evita destruir prueba aún exigible.
16. **Exporte probatorio:** **Desde Fase 0.** Paquete autocontenido (registros + hashes + sellos + manual de verificación) verificable por perito tercero sin acceso al sistema vivo.

## D. Migración y datos heredados

17. **Migración del KYC desde SIDF MD:** el aviso de privacidad/consentimiento **ya cubren la nueva finalidad** (exposición a la autoridad) y la e.firma de SIDF MD **tiene valor probatorio** → se porta directo.
    - *Nota:* conviene validar formalmente este supuesto en Fase 0 (el panel lo señaló como riesgo); si resulta que el aviso no cubre la finalidad, habrá que re-recabar consentimiento.
18. **Mercancía temporal con saldos abiertos (reglas previas vs reforma 2026):** **No aplica aún.** Como IMMEX entra vía integración con ERP y en fase posterior, la transición de saldos se difiere a ese momento.

---

## Implicaciones inmediatas para la v2 del diseño

- El **MVP se reduce y se enfoca**: orquestación + KYC (portado de SIDF MD) + dossier de defensa + capa probatoria, sin motores sustantivos ni recinto/RFE ni IMMEX completo.
- **Sube a primera clase desde Fase 0/1:** capa probatoria (con la corrección SHA-256 + PSC/TSA), exporte probatorio, acceso de autoridad default-deny, contrato de encargo y DPIA.
- **Se difiere explícitamente:** motores de clasificación/valoración (reservando modelo de datos), recinto/RFE, IMMEX completo y la integración en vivo con el SEA.

## Adenda (2-jul-2026) — Infraestructura de certificación ya contratada
El cliente confirma que YA CUENTA con:
- **PAC** (timbrado CFDI) — no se requiere selección de proveedor.
- **PSC / NOM-151** (constancias de conservación).
- **3 blockchains** para anclaje probatorio (patrón Polygon/Mainnet/Sepolia ya construido en SIDF: lib/ethereum-anchor.ts).
**Decisión:** los módulos de CERBERUS CE se construyen con CONECTORES (interfaces enchufables,
patrón SelladorCalificado NoOp/real ya usado): TimbradorPac, SelladorNom151, AnclaBlockchain.
La conexión real a sus APIs se hará "más adelante" — los ganchos deben quedar listos desde ahora.
