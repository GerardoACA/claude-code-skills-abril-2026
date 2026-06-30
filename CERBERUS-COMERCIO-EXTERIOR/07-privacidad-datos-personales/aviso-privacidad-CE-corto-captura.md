# Aviso de Privacidad Corto / Simplificado — Punto de captura (v1)

> **Uso:** se muestra en pantalla **en el momento de recabar datos directamente del titular**,
> especialmente al capturar **datos sensibles** (firma grafométrica y geolocalización).
> **Fundamento:** LFPDPPP art. 17; Lineamientos del Aviso de Privacidad.
> **Bloqueante:** sin este aviso corto + casilla de consentimiento, **no debe iniciarse la
> captura de biométricos/geolocalización en producción**.

---

## Texto a mostrar en pantalla (captura de evidencia)

> **Protección de tus datos personales**
>
> **[Razón social del Responsable]** recabará tus datos —incluidos **datos sensibles**: tu
> **firma manuscrita** (con sus rasgos dinámicos) y tu **ubicación (geolocalización)**— para
> integrar el expediente de la operación, acreditar su materialidad y cumplir obligaciones
> aduaneras y fiscales, pudiendo ponerlos a disposición de la autoridad competente cuando lo
> requiera por ley.
>
> El tratamiento de tus datos sensibles requiere tu **consentimiento expreso**. **Negarte no te
> impide usar el resto del servicio**; solo impide generar esta evidencia.
>
> Consulta el **[Aviso de Privacidad Integral aquí](enlace)** para conocer todas las finalidades,
> transferencias y cómo ejercer tus derechos ARCO.

`[ ]` **Otorgo mi consentimiento expreso** para el tratamiento de mis datos sensibles
(firma grafométrica y geolocalización) conforme al Aviso de Privacidad Integral.

`[ Continuar ]`  ·  `[ Continuar sin capturar evidencia sensible ]`

---

## Reglas de implementación
- La casilla de consentimiento **no debe venir pre-marcada** (consentimiento debe ser activo).
- El enlace al **Aviso Integral** debe estar visible y accesible antes de aceptar.
- Registrar, con sello de integridad (hash + timestamp), la **versión del aviso** aceptada, la
  fecha y el medio — alimentando el modelo `ConsentimientoDatos` ya existente en SIDF MP.
- Ofrecer siempre la ruta alterna **"Continuar sin capturar evidencia sensible"** para no
  condicionar el servicio (LFPDPPP art. 9).
