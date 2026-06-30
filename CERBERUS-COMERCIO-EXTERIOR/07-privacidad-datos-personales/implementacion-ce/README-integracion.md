# Implementación del Aviso de Privacidad — CERBERUS Comercio Exterior

> **Producto:** CERBERUS COMERCIO EXTERIOR (SaaS nuevo). **NO es SIDF.**
> SIDF (`cerberus-sidf-mp`) se cita solo como referencia conceptual de patrones
> ya probados (modelo `ConsentimientoDatos`, hash-chain). Aquí NADA toca SIDF.

Estos artefactos materializan, en el producto nuevo, el
[aviso v2](../aviso-privacidad-CE-v2.md), el
[aviso corto de captura](../aviso-privacidad-CE-corto-captura.md) y los
bloqueantes del [dictamen legal](../dictamen-validacion-legal-aviso-v1.md).

## Archivos

| Archivo | Qué es | Dónde va en el producto nuevo |
|---|---|---|
| `schema-consentimiento.prisma` | Modelos `VersionAviso` y `ConsentimientoDatos` | Pegar en `prisma/schema.prisma` |
| `registrar-consentimiento.ts` | Route handler que sella el consentimiento (SHA-256 + timestamp + hash-chain) | `app/api/privacidad/consentimiento/route.ts` |
| `AvisoPrivacidadIntegral.tsx` | Render del aviso integral v2 con versión + hash visibles | `app/(legal)/aviso-privacidad/` |
| `ConsentimientoCaptura.tsx` | Aviso corto + casilla NO pre-marcada + ruta alterna | En el flujo de captura de evidencia sensible |
| `README-integracion.md` | Este documento | — |

## Cómo enchufa (rol LFPDPPP: Responsable = tenant, Encargado = CERBERUS)

1. **Publicación del aviso.** Por cada tenant (Responsable) se inserta una fila
   `VersionAviso` por tipo (`INTEGRAL`, `CORTO_CAPTURA`). El `hashAviso` se
   calcula como `SHA-256(cuerpo)` al publicar; `cuerpo` se conserva para el
   exporte probatorio. La identidad/domicilio/RFC los completa el tenant: el
   aviso es **inválido con `[corchetes]`** y el componente integral lo señala.

2. **Punto de captura.** Antes de capturar firma grafométrica o geolocalización,
   se monta `ConsentimientoCaptura` con la `VersionAviso` CORTO vigente. El
   componente garantiza los bloqueantes del dictamen:
   - casilla **no pre-marcada** (`checked` inicia en `false`);
   - enlace al **Aviso Integral** visible antes de aceptar;
   - botón **"Continuar sin capturar evidencia sensible"** siempre disponible
     (art. 9: no condiciona el resto del servicio).

3. **Registro con sello de integridad.** Al resolver, el componente hace `POST`
   a `registrar-consentimiento.ts`, que:
   - toma `tenantId` **del token de sesión, nunca del body** (coherente con el
     RLS endurecido del diseño v2: `tenant_id` validado contra token);
   - verifica que el `hashAvisoEnPantalla` coincida con el `hashAviso` publicado;
   - calcula `selloRegistro = SHA-256(payload canónico)` y lo **encadena** con el
     `selloRegistro` del registro previo del tenant (`hashPrev`), append-only;
   - persiste versión + hash + timestamp + alcance (biométricos/geoloc/ruta).

4. **Revocación.** No se borra la fila (sin efectos retroactivos, §6 del aviso):
   se marca `revocado/revocadoEn`. El módulo ARCO del producto consume estas
   filas para Acceso y para acreditar el estado del consentimiento.

## Integración con la capa probatoria del diseño v2

El `selloRegistro` y la cadena `hashPrev` son la misma primitiva SHA-256 +
hash-chain de la bitácora append-only del diseño v2. Cuando se active el gancho
**PSC/TSA (RFC 3161) / NOM-151**, basta sellar el `selloRegistro` para que el
acto de consentimiento pase de evidencia preliminar a **prueba oponible**, sin
tocar este código.

## Dependencias

- `react-markdown` (render del aviso integral).
- `@/lib/prisma` (cliente Prisma del producto) y `@/lib/auth` (`getSession`
  con `{ tenantId, userId }`). Ajustar los alias a la estructura real del repo
  del producto nuevo.

## Pendientes heredados (no de código)

El texto del aviso integral conserva los *puntos a confirmar por abogado humano
colegiado* del v2 (art. 37, órgano garante, plazos aduaneros). No publicar en
producción sin esa validación ni con `[corchetes]` sin llenar.
