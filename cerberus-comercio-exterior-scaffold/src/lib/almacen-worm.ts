// CERBERUS COMERCIO EXTERIOR — conector de almacén WORM (blob del dossier). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/almacen-worm.ts  (Agente ALMACEN-14, Incremento 14)
// Propósito: persistir OBJETOS INMUTABLES (hoy: el JSON íntegro del dossier de
//            diligencia) en un almacén de objetos, vía un CONECTOR enchufable
//            con el patrón de TimbradorPac / SelladorCalificado:
//            interfaz estable + implementación NoOp por defecto + factoría que
//            decide por entorno. Backend real: Vercel Blob (@vercel/blob).
//
// WORM LÓGICO (Write Once, Read Many):
//   Vercel Blob no ofrece inmutabilidad dura a nivel de servicio; aquí el
//   carácter WORM se construye por convención de dos piezas:
//   1) Ruta CONTENT-ADDRESSED: la ruta incluye el sha256 del contenido
//      (dossiers/<tenantId>/<operacionId>/<sha256>.json), de modo que a un
//      contenido distinto le corresponde SIEMPRE una ruta distinta.
//   2) Política de "nunca sobrescribir": se sube con addRandomSuffix: false y
//      SIN allowOverwrite; si la ruta ya existe, el servicio rechaza la
//      escritura. Como la ruta deriva del sha256, "ya existe" implica que el
//      MISMO contenido ya fue guardado → se captura ese error y se trata como
//      ya-guardado IDEMPOTENTE (ok, no fallo). Ver AlmacenVercelBlob.guardar.
//
// TRADE-OFF DE PRIVACIDAD (access: "public"):
//   Los dossiers contienen datos del tenant. El SDK de Vercel Blob se usa con
//   access: "public": la URL resultante NO es adivinable (incluye componente
//   aleatorio del store) pero SÍ es pública — cualquiera que posea la URL puede
//   leer el blob, sin autenticación. Mitigación actual: la URL solo se muestra
//   dentro de la sesión autenticada del tenant (página /dossier) y no se
//   publica en ningún otro canal. Mitigación futura: blob privado o un proxy
//   autenticado del propio sistema que sirva el objeto tras validar el JWT.
//
// Con el NoOp (BLOB_READ_WRITE_TOKEN ausente) todo sigue funcionando como
// hasta el Inc 13: el dossier queda anclado por su sha256 y es regenerable;
// el conector responde HONESTAMENTE que no hay almacén configurado.
// =============================================================================

// Import ESTÁTICO deliberado: @vercel/blob no falla al importarse sin token,
// solo al USARSE (put/list lanzan si falta BLOB_READ_WRITE_TOKEN). La factoría
// garantiza que AlmacenVercelBlob solo se instancia cuando el token existe.
import { list, put } from "@vercel/blob";

// ============================================================================
// Tipos
// ============================================================================

/** Resultado de un intento de guardado en el almacén WORM. */
export interface ResultadoGuardado {
  /** `true` si el objeto quedó disponible en el almacén (incluye idempotente). */
  readonly ok: boolean;
  /** URL pública del objeto guardado, si hubo guardado. */
  readonly url?: string;
  /** Detalle legible del resultado (va al payload del evento de bitácora). */
  readonly detalle: string;
}

/**
 * Contrato del conector de almacén WORM. Permite pasar del NoOp al backend
 * real (Vercel Blob) — o a otro object storage — sin tocar rutas ni UI
 * (Strategy enchufable, como TimbradorPac / SelladorCalificado).
 */
export interface AlmacenWorm {
  /** Identificador estable del conector (aparece en detalle / bitácora). */
  readonly id: string;
  /**
   * Guarda `contenido` en `ruta` (content-addressed) con el `contentType`
   * dado. Acepta texto (JSON del dossier) o binario crudo (Buffer: PDF/imagen
   * de la bóveda documental KYC, Inc 43). NUNCA debe lanzar por condiciones
   * esperables (sin token, ruta ya existente, fallo de red): reporta vía
   * ResultadoGuardado.
   */
  guardar(
    ruta: string,
    contenido: string | Buffer,
    contentType: string,
  ): Promise<ResultadoGuardado>;
}

// ============================================================================
// Implementación NoOp (default mientras no haya BLOB_READ_WRITE_TOKEN)
// ============================================================================

/**
 * Conector por defecto. NO contacta a ningún almacén: responde honestamente
 * que no hay almacén configurado. El dossier queda igual que hasta el Inc 13:
 * anclado por sha256 (selloContenidoDossier) y regenerable desde la evidencia
 * viva. Comportamiento seguro mientras no se aprovisione el store de Blob.
 */
export class AlmacenNoOp implements AlmacenWorm {
  readonly id = "NOOP";

  async guardar(
    ruta: string,
    contenido: string | Buffer,
    contentType: string,
  ): Promise<ResultadoGuardado> {
    void ruta;
    void contenido;
    void contentType;
    return {
      ok: false,
      detalle:
        "Almacén WORM no configurado (BLOB_READ_WRITE_TOKEN ausente); el " +
        "dossier queda anclado por sha256 y es regenerable",
    };
  }
}

// ============================================================================
// Implementación Vercel Blob
// ============================================================================

/** Extrae un mensaje legible de un error desconocido (sin any). */
function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Heurística de IDEMPOTENCIA: con addRandomSuffix: false y sin allowOverwrite,
 * @vercel/blob rechaza subir a una ruta existente con un error cuyo mensaje
 * indica que el blob ya existe. Como la ruta es content-addressed (incluye el
 * sha256 del contenido), "ya existe" == "este MISMO contenido ya fue guardado"
 * → no es un fallo sino un guardado previo; se trata como éxito idempotente.
 */
function esErrorYaExiste(error: unknown): boolean {
  return /already exists/i.test(mensajeDeError(error));
}

/**
 * Conector real sobre Vercel Blob (patrón dual ya usado en el ecosistema del
 * cliente). Sube el objeto con:
 *   - access: "public"        → ver trade-off de privacidad en la cabecera.
 *   - addRandomSuffix: false  → la ruta content-addressed ES la identidad del
 *                               objeto; un sufijo aleatorio rompería la
 *                               idempotencia y la política WORM.
 * No pasa allowOverwrite → el servicio rechaza reescrituras (nunca sobrescribir).
 */
export class AlmacenVercelBlob implements AlmacenWorm {
  readonly id = "VERCEL_BLOB";

  async guardar(
    ruta: string,
    contenido: string | Buffer,
    contentType: string,
  ): Promise<ResultadoGuardado> {
    try {
      const blob = await put(ruta, contenido, {
        access: "public",
        addRandomSuffix: false,
        contentType,
      });
      return {
        ok: true,
        url: blob.url,
        detalle: `Blob guardado en almacén WORM (${this.id}): ${ruta}`,
      };
    } catch (error) {
      if (esErrorYaExiste(error)) {
        // Idempotente: el mismo contenido ya estaba guardado (ruta content-
        // addressed). Se recupera la URL existente para poder anclarla igual.
        const url = await this.urlExistente(ruta);
        return {
          ok: true,
          url,
          detalle:
            `Ruta ya existente en almacén WORM (${this.id}); mismo contenido ` +
            "(content-addressed) → tratado como ya-guardado idempotente",
        };
      }
      // Fallo real (red, token inválido, etc.): se reporta sin lanzar; el
      // dossier NUNCA debe fallar por el almacén (queda anclado por sha256).
      return {
        ok: false,
        detalle: `Fallo al guardar en almacén WORM (${this.id}): ${mensajeDeError(error)}`,
      };
    }
  }

  /** Busca la URL del objeto ya guardado en `ruta` (best-effort, sin lanzar). */
  private async urlExistente(ruta: string): Promise<string | undefined> {
    try {
      const { blobs } = await list({ prefix: ruta, limit: 1 });
      const existente = blobs.find((b) => b.pathname === ruta) ?? blobs[0];
      return existente?.url;
    } catch {
      return undefined;
    }
  }
}

// ============================================================================
// Factoría
// ============================================================================

/** Conector por defecto del sistema mientras no haya store de Blob. */
export const almacenPorDefecto: AlmacenWorm = new AlmacenNoOp();

/**
 * Devuelve el conector de almacén WORM activo según el entorno:
 *   - BLOB_READ_WRITE_TOKEN presente → AlmacenVercelBlob (la integración de
 *     Vercel inyecta ese token al vincular el store; @vercel/blob lo lee del
 *     entorno, no hace falta pasarlo).
 *   - Ausente → AlmacenNoOp honesto (todo funciona como hasta el Inc 13).
 * Rutas y lógica de dossier no cambian: solo consumen esta factoría.
 */
export function obtenerAlmacen(): AlmacenWorm {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    return new AlmacenVercelBlob();
  }
  return almacenPorDefecto;
}
