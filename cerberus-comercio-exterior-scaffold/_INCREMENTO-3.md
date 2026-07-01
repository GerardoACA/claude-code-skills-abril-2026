# BLUEPRINT addendum — Incremento 3 (KYC usable: registrar cliente + cuestionario 1.4.14 + 69-B)

> Para el producto NUEVO `cerberus-comercio-exterior`. NO es SIDF. Respeta `_BLUEPRINT.md` y
> `_INCREMENTO-2.md`. TypeScript build-safe (compila con `next build` estricto; sin `any`, sin
> widening de literales). Toda escritura tenant-scoped va dentro de `withTenantFromSession`.
> **No hace falta cambiar el schema** (los modelos Cliente, ExpedienteKyc1414, Documento,
> Alerta69b, Operacion YA existen). Si algún agente necesitara un campo nuevo, que lo evite.

## Objetivo
Que un usuario autenticado pueda: dar de alta un Cliente/importador, llenar el cuestionario del
expediente 1.4.14, y ver el resultado de una verificación 69-B (alerta, NO bloqueo).

## Reparto (cada agente escribe solo lo suyo; evitar conflictos de archivo)

**Agente CLIENTES:**
- `src/app/clientes/page.tsx` — lista de clientes del tenant (withTenantFromSession → cliente.findMany), con enlace a "Registrar cliente" y a cada expediente.
- `src/app/clientes/nuevo/page.tsx` — formulario (client component) para alta de Cliente: rfc, razonSocial, (domicilio de operaciones CE como texto). Postea a un route handler.
- `src/app/api/clientes/route.ts` — POST que crea Cliente dentro de withTenantFromSession (tenantId del JWT, NUNCA del body); valida con zod; responde ok/errores.
- Actualiza `src/app/dashboard/page.tsx` SOLO para añadir un enlace de navegación a /clientes (cambio mínimo, no reescribas su lógica).

**Agente CUESTIONARIO:**
- `src/app/clientes/[id]/kyc/page.tsx` — cuestionario del expediente 1.4.14 (server component que carga el cliente; incrusta el form client). Secciones: (1) Datos generales, (2) Materialidad e infraestructura, (3) Manifestación de integridad (checkbox bajo protesta, no-EFOS), (4) resumen.
- `src/components/CuestionarioKyc.tsx` — client component con el formulario multi-sección; postea al route handler.
- `src/app/api/clientes/[id]/kyc/route.ts` — POST que crea/actualiza ExpedienteKyc1414 del cliente y registra Documentos/campos, dentro de withTenantFromSession; sella con SHA-256 de @/lib/probatoria/hash. tenantId del JWT.

**Agente VERIFICACION-69B:**
- `src/app/clientes/[id]/verificacion/page.tsx` — muestra el estado 69-B del cliente y un botón "Verificar".
- `src/app/api/clientes/[id]/verificar-69b/route.ts` — POST que, como STUB demostrativo (sin API externa real todavía), determina un estado (LIMPIO | PRESUNTO | DEFINITIVO) — por ahora reglas simples/placeholder — y crea/actualiza un registro Alerta69b (enum Estado69b) para el cliente, con snapshot fechado simulado (sha256 + fecha). Deja MUY claro en comentarios que es ALERTA, NO bloqueo (decisión C9): nunca bloquea la operación, solo marca y registra. tenantId del JWT, dentro de withTenantFromSession.
- `src/components/BotonVerificar69b.tsx` — client component con el botón que llama al endpoint.

## Coordinación
- Los modelos ya existen; nadie edita `prisma/schema.prisma`.
- Solo el Agente CLIENTES toca `dashboard/page.tsx` (cambio mínimo de nav). Los otros no.
- Usen los campos reales del schema (revísenlo): Cliente(rfc, razonSocial, estadoCsd, etapa69b),
  ExpedienteKyc1414 (revisar sus campos), Alerta69b (estado: Estado69b, snapshot), Documento(sha256...).
- Al terminar, cada agente devuelve la lista de archivos creados/modificados.
