# BLUEPRINT addendum — Incremento 4 (Operación de despacho: encargo conferido + operación + máquina de estados)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md, _INCREMENTO-2/3.
> TypeScript build-safe (compila con next build estricto; sin any; sin widening de literales; en
> Next 16 `params` es Promise → await). Escritura tenant-scoped SIEMPRE con withTenantFromSession.
> **NO cambiar el schema**: los modelos EncargoConferido, Operacion (enum EstadoDespacho),
> Cliente, BitacoraAuditoria YA existen. Revisa sus campos exactos antes de escribir; si un campo
> que quieres no existe, adáptate a los que hay. No inventes columnas.

## Objetivo
Que un usuario autenticado pueda: registrar el Encargo Conferido de un cliente, crear una
Operación de despacho ligada a ese cliente, y avanzar/ver su estado (máquina de estados), con
cada cambio de estado registrado en la BitacoraAuditoria (append-only, sha256 encadenado).

## Reparto (cada agente escribe solo lo suyo; evitar conflicto de archivos)

**Agente ENCARGO:**
- `src/app/clientes/[id]/encargo/page.tsx` — Server Component: sesión+redirect; carga Cliente y sus EncargoConferido con withTenantFromSession; muestra estado/vigencia y el form.
- `src/components/EncargoForm.tsx` — client component: alta de EncargoConferido (tipo B14/B21, vigenciaInicio, vigenciaFin) para el cliente; postea al route.
- `src/app/api/clientes/[id]/encargo/route.ts` — POST: tenantId del JWT; crea EncargoConferido dentro de withTenantFromSession con los campos reales del schema (revisa: tipo/formato, vigencia, estado enum EstadoEncargo). Valida con zod.

**Agente OPERACION:**
- `src/app/operaciones/page.tsx` — Server Component: lista Operaciones del tenant (withTenantFromSession) con cliente, referencia, estado; enlaces a cada operación y a crear nueva; nav a /dashboard.
- `src/app/operaciones/nueva/page.tsx` — client component: form para crear Operación (elegir clienteId de una lista pasada como prop desde un server wrapper, o input; referencia). Postea al route.
- `src/app/api/operaciones/route.ts` — POST: tenantId del JWT; crea Operacion dentro de withTenantFromSession (clienteId, referencia; estado usa @default ARMADO). GET lista. Valida con zod.
- Actualiza `src/app/dashboard/page.tsx` SOLO para añadir un enlace "Operaciones" → /operaciones (cambio mínimo, no reescribas su lógica).

**Agente MAQUINA-ESTADOS:**
- `src/app/operaciones/[id]/page.tsx` — Server Component: detalle de una Operación (con su cliente y estado actual); muestra los estados posibles y el componente para avanzar.
- `src/components/AvanzarEstado.tsx` — client component: botones para avanzar el estado del despacho según transiciones válidas del enum EstadoDespacho; postea al route.
- `src/app/api/operaciones/[id]/estado/route.ts` — POST: tenantId del JWT; dentro de withTenantFromSession valida la transición (define un mapa de transiciones válidas entre los valores REALES del enum EstadoDespacho del schema), actualiza Operacion.estado, y registra un evento en BitacoraAuditoria (append-only: sha256 de @/lib/probatoria/hash, hashPrev encadenado con el último evento del tenant, actor del JWT, accion "CAMBIO_ESTADO"). Si la transición no es válida, responde error sin cambiar nada.

## Coordinación
- Nadie edita schema.prisma. Solo el Agente OPERACION toca dashboard/page.tsx (nav mínima).
- Revisen el enum EstadoDespacho real del schema y úsenlo tal cual (no inventen estados).
- BitacoraAuditoria: revisen sus campos reales (sha256, hashPrev, actor, accion, tenantId, payload/ref) y úsenlos.
- Al terminar, cada agente devuelve la lista de archivos creados/modificados.
