# CERBERUS Comercio Exterior — instrucciones para Claude

## Modo de trabajo DEFINITIVO (pedido por Gerardo)
Para TODA tarea sustantiva (nuevos módulos, incrementos, features), trabajar con
**agentes específicos en paralelo y de forma sincronizada**:
1. Descomponer la tarea en frentes con carriles de archivos DISJUNTOS (los agentes
   no deben tocar los mismos archivos).
2. Definir por adelantado los CONTRATOS (firmas/tipos) entre frentes para que
   avancen sin esperarse.
3. Lanzar los agentes en paralelo; cada uno verifica su parte (vitest dirigido +
   `tsc --noEmit`), SIN build ni commit.
4. Al terminar todos: integrar, correr verificación completa (tsc + suite entera
   + `npm run build`), commit + push del conjunto.

## Principio DEFINITIVO: captura asistida (pedido por Gerardo)
El capturista NO debe teclear lo que un documento ya dice ni lo que el sistema
ya sabe. Para TODO paso de captura (construido o por construir):
1. Ofrecer SIEMPRE la ingesta del documento fuente (PDF/imagen) — carta porte,
   CSF, acta constitutiva, cédula de identificación fiscal, opinión 32-D, etc. —
   y prellenar los campos con extracción IA/OCR (patrón de referencia:
   src/lib/extraer-kyc-doc.ts + CuestionarioKyc.tsx: unpdf + extractores por
   etiqueta acotados, el usuario revisa y confirma; C9: sugerir, nunca imponer).
2. REUTILIZAR lo ya ingestado: si un dato vive en el expediente del cliente
   (RFC, razón social, domicilio, régimen…) los forms nuevos lo precargan de la
   BD, no lo vuelven a pedir.

## Contexto del proyecto
- Producto: SaaS multi-tenant de cumplimiento aduanero/comercio exterior mexicano.
  Trabajar SOLO dentro de `cerberus-comercio-exterior-scaffold/`. NO es SIDF; no
  tocar cerberus-sidf-mp ni cerberus-platform.
- Stack: Next.js 16 App Router, TypeScript ESTRICTO (sin `any`), Prisma 6,
  PostgreSQL con Row-Level Security, NextAuth (JWT con tenantId), Vitest, Vercel+Neon.
- Convenciones duras: comentarios/nombres en español; cabecera de archivo con
  primera línea que termina en "NO es SIDF." y bloque ===== Archivo/Propósito;
  conectores = interface + impl real + NoOp + factory por env; fail-safe (nunca
  lanzar en envíos); hosts fijos en fetch (anti-SSRF); zod en rutas API;
  `withTenantFromSession`/`withTenant` para RLS (NUNCA tenantId del request).
- Decisiones: C9 = el sistema alerta, NUNCA bloquea. C14 = la llave privada FIEL
  jamás se almacena.
- Despliegue: lo corre el usuario en su Mac con `cerberus-comercio-exterior-scaffold/deploy.sh`
  (detecta cambios de esquema; con migración exige NEON_ADMIN). Evitar cambios de
  schema cuando sea razonable. La rama de trabajo la indica la sesión.
- El entorno remoto NO alcanza Telegram/SAT/Neon (proxy 403): las pruebas en vivo
  las hace el usuario desde su Mac/navegador; darle comandos copiables (bloques
  heredoc a /tmp/*.sh + nohup, su terminal se congela con procesos largos).
