# Dictamen jurídico de validación — Aviso de Privacidad CE (Borrador v1)

> **Emitido por:** agente abogado especialista en protección de datos personales (LFPDPPP)
> **Fecha:** 30 de junio de 2026
> **Naturaleza:** Dictamen técnico de apoyo. **La validación final corresponde a un abogado humano colegiado.**
> **Documento validado:** [aviso-privacidad-CE-borrador-v1.md](./aviso-privacidad-CE-borrador-v1.md)
> **Resultado aplicado en:** [aviso-privacidad-CE-v2.md](./aviso-privacidad-CE-v2.md)

## Veredicto general
El borrador es **sustancialmente sólido y publicable tras ajustes acotados** (de redacción y completitud, no de diseño). **Corrige las tres fallas** que motivaron la reescritura:
- (a) Finalidad de exposición a la autoridad aduanera → **corregida** (finalidad primaria 6 + tabla de transferencias).
- (b) Declaración falsa de "no recaba datos sensibles" → **corregida** (declara geolocalización y biométricos con consentimiento expreso).
- (c) Rol Responsable/Encargado invertido → **corregido** (tenant = Responsable, CERBERUS = Encargado).

## Cambios BLOQUEANTES (no publicar sin ellos)
1. **Art. 37 mal citado:** eliminar la **fracción II** (es materia de salud), verificar I/V/VI contra texto vigente, y preferir el encuadre de "cumplimiento de obligación legal + requerimiento de autoridad competente" (LFPDPPP arts. 10 y 37; Reglamento art. 10).
2. **Consentimiento de sensibles no forzado (art. 9):** dejar explícito que negar el consentimiento de datos sensibles **no condiciona el resto del servicio**.
3. **Elementos faltantes del art. 16/Lineamientos:** leyenda de autoridad garante, fecha de última actualización visible, y nota de que el aviso es inválido con corchetes sin llenar.
4. **Aviso corto en punto de captura (art. 17):** bloqueante para iniciar la captura de biométricos/geolocalización en producción.

## Mejoras recomendadas (elevan la defensa, no bloquean)
- Separar firma autógrafa estática (ordinario) de firma grafométrica dinámica (sensible biométrico).
- Declarar con claridad el procesamiento internacional / residencia de datos (Neon/Vercel).
- Reformular el plazo de 5 días para oposición a finalidades secundarias (ejercible en cualquier momento).
- Referencias cruzadas de geolocalización entre §2(d), §6 y §7.
- Verificar numeración exacta de los artículos del Reglamento citados (49–55 / 50 / 52).

## Dictamen sobre los 5 pendientes del borrador
1. **Base de licitud art. 37:** reformular (ver bloqueante 1).
2. **Firma grafométrica:** **es biométrico sensible** (confirmado por la Guía del INAI para el Tratamiento de Datos Biométricos — biométrico conductual). Mantener su tratamiento como sensible.
3. **Plazos de conservación:** razonables; *a confirmar* contra Ley Aduanera/RGCE (puede haber plazo aduanero autónomo). No bloquea el aviso; sí la política de retención WORM.
4. **Aviso simplificado en captura:** **sí es necesario** (art. 17); bloquea la captura de sensibles en producción.
5. **Contrato de Encargo:** entregable separado; cláusulas mínimas conforme Reglamento arts. 50–52 (instrucciones, no fines propios, seguridad, confidencialidad, supresión/devolución, subencargados, asistencia ARCO y notificación de brechas).

## A confirmar por abogado humano colegiado
- Numeración vigente de fracciones del art. 37 LFPDPPP y artículos del Reglamento tras reformas.
- Denominación actual del órgano garante sucesor del INAI.
- Plazos de conservación aduaneros específicos.

## Fuentes citadas por el dictamen
- [LFPDPPP — Cámara de Diputados](http://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf)
- [Reglamento de la LFPDPPP — Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf)
- [Guía para el Tratamiento de Datos Biométricos — INAI](https://inicio.inai.org.mx/documentosdeinteres/guiadatosbiometricos_web_links.pdf)
- [Recomendaciones de Seguridad para Datos Biométricos (Dic 2024) — INAI](https://home.inai.org.mx/wp-content/uploads/GuiaBiometricos-Dic2024.pdf)
