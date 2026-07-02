// CERBERUS COMERCIO EXTERIOR — conector de cotejo EN VIVO de la opinión 32-D. NO es SIDF.
//
// Toda opinión de cumplimiento VIGENTE del SAT trae un CÓDIGO QR que codifica una
// URL de verificación del propio SAT: al abrirla, el SAT despliega los datos de
// la opinión (folio, RFC, fecha de emisión y sentido) y el procedimiento oficial
// es corroborar que COINCIDAN con los del documento. Este módulo AUTOMATIZA ese
// cotejo:
//   1) VerificadorOpinionSatQr (REAL, camino PRIMARIO): toma la URL del QR
//      (escaneada por el operador o extraída del texto), la abre —RESTRINGIDA a
//      dominios del SAT por seguridad (anti-SSRF)— y compara folio/RFC/sentido de
//      la página con los del documento ingestado. CONFIRMADA / DISCREPANCIA /
//      NO_DISPONIBLE. No requiere la e.firma del cliente.
//   2) VerificadorOpinionSatHttp (REAL, alterno): consulta un gateway/PAC que
//      valide el folio (contrato JSON), activado por env.
//   3) VerificadorOpinionNoOp: fallback honesto (no finge confirmaciones).
// La factoría devuelve un compuesto (Auto) que elige por lo disponible.
//
// SEGURIDAD (anti-SSRF): el verificador de QR SOLO abre URLs https alojadas en
// dominios del SAT (allowlist; default sat.gob.mx, ampliable con SAT_OPINION_HOSTS).
// Nunca abre una URL arbitraria del usuario. Además es fail-safe: cualquier error,
// bloqueo anti-bot o cambio de formato degrada a NO_DISPONIBLE, jamás a un falso
// CONFIRMADA — el cotejo visual humano del QR sigue siendo válido como respaldo.
//
// C9: el resultado alimenta la alerta de cumplimiento; nunca bloquea.

/** Estado del cotejo (espeja el enum Prisma EstadoCotejoSat). */
export type EstadoCotejoSat =
  | "NO_INTENTADO"
  | "CONFIRMADA"
  | "DISCREPANCIA"
  | "NO_DISPONIBLE";

/** Entrada del cotejo en vivo. */
export interface EntradaCotejo {
  readonly rfc: string;
  readonly folio: string | null;
  readonly sentidoDeclarado: string;
  /** URL de verificación del QR de la opinión (si se escaneó/extrajo). */
  readonly urlVerificacion?: string | null;
}

/** Resultado del cotejo en vivo. */
export interface ResultadoCotejo {
  readonly ok: boolean;
  readonly estado: EstadoCotejoSat;
  readonly detalle: string;
  /** Sentido que reportó el SAT (si se pudo determinar); útil en cotejo por QR
   *  cuando no se ingestó texto de la opinión. */
  readonly sentidoSat?: string | null;
}

/** Contrato del conector de cotejo en vivo (Strategy enchufable). */
export interface VerificadorOpinionSat {
  readonly id: string;
  cotejar(input: EntradaCotejo): Promise<ResultadoCotejo>;
}

// ============================================================================
// Utilidades comunes
// ============================================================================

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** Normaliza sentido a un token comparable. */
function normalizarSentido(s: string): string {
  return normalizar(s).replace(/\s+/g, "_").trim();
}

/** Detecta el sentido dentro de un texto (HTML) del SAT. */
function detectarSentido(norm: string): string | null {
  if (norm.includes("SIN OBLIGACIONES")) return "SIN_OBLIGACIONES";
  if (norm.includes("NO INSCRITO") || norm.includes("NO REGISTRADO")) return "NO_INSCRITO";
  if (norm.includes("POSITIVO") || norm.includes("POSITIVA")) return "POSITIVA";
  if (norm.includes("NEGATIVO") || norm.includes("NEGATIVA")) return "NEGATIVA";
  return null;
}

/** Dominios del SAT permitidos para el cotejo por QR (allowlist anti-SSRF). */
function hostsPermitidos(): string[] {
  const extra = (process.env.SAT_OPINION_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return Array.from(new Set(["sat.gob.mx", ...extra]));
}

/** ¿La URL es https y su host pertenece a un dominio del SAT permitido? */
export function urlEsDelSat(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return hostsPermitidos().some((d) => host === d || host.endsWith(`.${d}`));
}

// ============================================================================
// NoOp
// ============================================================================

export class VerificadorOpinionNoOp implements VerificadorOpinionSat {
  readonly id = "NOOP";
  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    void input;
    return {
      ok: false,
      estado: "NO_DISPONIBLE",
      detalle:
        "Cotejo en vivo no disponible: no se aportó la URL del QR (dominio del SAT) " +
        "ni hay un gateway configurado. Escanea el QR de la opinión y pega su URL, " +
        "o define SAT_OPINION_PROVIDER=HTTP + SAT_OPINION_URL.",
    };
  }
}

// ============================================================================
// REAL 1: cotejo por la URL del QR del SAT (camino primario)
// ============================================================================

export interface OpcionesQr {
  readonly timeoutMs?: number;
}

export class VerificadorOpinionSatQr implements VerificadorOpinionSat {
  readonly id = "QR_SAT";
  private readonly timeoutMs: number;

  constructor(opciones: OpcionesQr = {}) {
    this.timeoutMs = opciones.timeoutMs ?? 12000;
  }

  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    const url = input.urlVerificacion?.trim();
    if (!url) {
      return { ok: false, estado: "NO_DISPONIBLE", detalle: "Sin URL de QR para cotejar." };
    }
    if (!urlEsDelSat(url)) {
      return {
        ok: false,
        estado: "NO_DISPONIBLE",
        detalle:
          "La URL del QR no corresponde a un dominio del SAT (https + sat.gob.mx). " +
          "Por seguridad no se abre una URL ajena al SAT.",
      };
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controlador.signal,
      });
      if (!res.ok) {
        return {
          ok: false,
          estado: "NO_DISPONIBLE",
          detalle: `La verificación del SAT respondió HTTP ${res.status}.`,
        };
      }
      const html = await res.text();
      // Aplanar HTML a texto comparable.
      const texto = normalizar(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

      const rfcN = normalizar(input.rfc.trim());
      const folioN = input.folio ? normalizar(input.folio.trim()) : null;
      const hayRfc = texto.includes(rfcN);
      const hayFolio = folioN !== null && folioN.length > 0 && texto.includes(folioN);

      // La página del SAT debe mostrar al menos el folio o el RFC de la opinión.
      if (!hayFolio && !hayRfc) {
        return {
          ok: true,
          estado: "DISCREPANCIA",
          detalle:
            "La página de verificación del SAT no muestra el folio ni el RFC de la " +
            "opinión entregada: posible documento falso o folio erróneo.",
        };
      }

      // Comparar el sentido si ambos lo declaran.
      const declarado = normalizarSentido(input.sentidoDeclarado);
      const delSat = detectarSentido(texto);
      if (delSat !== null && declarado !== "INDETERMINADO" && delSat !== declarado) {
        return {
          ok: true,
          estado: "DISCREPANCIA",
          detalle: `El SAT muestra sentido ${delSat}, distinto al del documento (${declarado}).`,
          sentidoSat: delSat,
        };
      }

      const coincidencias = [hayFolio ? "folio" : null, hayRfc ? "RFC" : null]
        .filter((x): x is string => x !== null)
        .join(" y ");
      return {
        ok: true,
        estado: "CONFIRMADA",
        detalle:
          `El SAT confirma la opinión vía QR (coincide ${coincidencias}` +
          `${delSat ? `, sentido ${delSat}` : ""}).`,
        sentidoSat: delSat,
      };
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        estado: "NO_DISPONIBLE",
        detalle: abortado
          ? `Tiempo de espera agotado (${this.timeoutMs} ms) al abrir la verificación del SAT.`
          : "No se pudo abrir la URL de verificación del SAT (bloqueo anti-bot o red). " +
            "El cotejo visual del QR sigue siendo válido como respaldo.",
      };
    } finally {
      clearTimeout(temporizador);
    }
  }
}

// ============================================================================
// REAL 2: gateway HTTP (alterno, contrato JSON)
// ============================================================================

export interface OpcionesHttp {
  readonly url: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

interface RespuestaGateway {
  encontrada: boolean;
  sentido?: string;
  detalle?: string;
}

function parseRespuesta(data: unknown): RespuestaGateway | null {
  if (data === null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.encontrada !== "boolean") return null;
  return {
    encontrada: o.encontrada,
    sentido: typeof o.sentido === "string" ? o.sentido : undefined,
    detalle: typeof o.detalle === "string" ? o.detalle : undefined,
  };
}

export class VerificadorOpinionSatHttp implements VerificadorOpinionSat {
  readonly id = "HTTP";
  private readonly opciones: OpcionesHttp;
  constructor(opciones: OpcionesHttp) {
    this.opciones = opciones;
  }

  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    if (input.folio === null || input.folio.trim() === "") {
      return { ok: false, estado: "NO_DISPONIBLE", detalle: "Sin folio/acuse no es posible cotejar ante el gateway." };
    }
    const timeoutMs = this.opciones.timeoutMs ?? 12000;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.opciones.apiKey) headers.Authorization = `Bearer ${this.opciones.apiKey}`;
      const res = await fetch(this.opciones.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ rfc: input.rfc, folio: input.folio, sentidoDeclarado: input.sentidoDeclarado }),
        signal: controlador.signal,
      });
      if (!res.ok) {
        return { ok: false, estado: "NO_DISPONIBLE", detalle: `El gateway de validación respondió HTTP ${res.status}.` };
      }
      let cuerpo: unknown;
      try {
        cuerpo = await res.json();
      } catch {
        return { ok: false, estado: "NO_DISPONIBLE", detalle: "Respuesta del gateway no interpretable (JSON inválido)." };
      }
      const resp = parseRespuesta(cuerpo);
      if (resp === null) {
        return {
          ok: false,
          estado: "NO_DISPONIBLE",
          detalle: "La respuesta del gateway no cumple el contrato ({ encontrada: boolean, sentido?, detalle? }).",
        };
      }
      if (!resp.encontrada) {
        return {
          ok: true,
          estado: "DISCREPANCIA",
          detalle: resp.detalle ?? "El SAT no localizó el folio: posible documento falso o folio erróneo.",
        };
      }
      const declarado = normalizarSentido(input.sentidoDeclarado);
      const delSat = resp.sentido ? normalizarSentido(resp.sentido) : null;
      if (delSat !== null && declarado !== "INDETERMINADO" && delSat !== declarado) {
        return {
          ok: true,
          estado: "DISCREPANCIA",
          detalle: resp.detalle ?? `El SAT reporta sentido "${resp.sentido}", distinto al del documento.`,
          sentidoSat: delSat,
        };
      }
      return {
        ok: true,
        estado: "CONFIRMADA",
        detalle: resp.detalle ?? `El SAT confirma el folio${resp.sentido ? ` (sentido ${resp.sentido})` : ""}.`,
        sentidoSat: delSat,
      };
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        estado: "NO_DISPONIBLE",
        detalle: abortado
          ? `Tiempo de espera agotado (${timeoutMs} ms) al cotejar ante el gateway.`
          : "No se pudo contactar el gateway de validación.",
      };
    } finally {
      clearTimeout(temporizador);
    }
  }
}

// ============================================================================
// Compuesto: QR (si hay URL del SAT) → HTTP (si hay gateway) → NoOp
// ============================================================================

export class VerificadorOpinionSatAuto implements VerificadorOpinionSat {
  readonly id = "AUTO";
  private readonly qr: VerificadorOpinionSatQr;
  private readonly http: VerificadorOpinionSatHttp | null;

  constructor(http: VerificadorOpinionSatHttp | null) {
    this.qr = new VerificadorOpinionSatQr();
    this.http = http;
  }

  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    // 1) Si viene la URL del QR y es del SAT, cotejar por QR (camino oficial).
    const url = input.urlVerificacion?.trim();
    if (url && urlEsDelSat(url)) {
      const r = await this.qr.cotejar(input);
      // Si el QR dio un veredicto útil (confirma/discrepa), ese manda.
      if (r.estado === "CONFIRMADA" || r.estado === "DISCREPANCIA") return r;
      // Si el QR no estuvo disponible, intentar el gateway como respaldo.
      if (this.http) return this.http.cotejar(input);
      return r;
    }
    // 2) Sin URL del SAT: usar el gateway si está configurado.
    if (this.http) return this.http.cotejar(input);
    // 3) Nada disponible.
    return new VerificadorOpinionNoOp().cotejar(input);
  }
}

// ============================================================================
// Factoría
// ============================================================================

export const verificadorOpinionPorDefecto: VerificadorOpinionSat = new VerificadorOpinionSatAuto(null);

/**
 * Devuelve el verificador activo. Siempre soporta el cotejo por QR del SAT
 * (no necesita configuración). Si además hay gateway HTTP configurado
 * (SAT_OPINION_PROVIDER=HTTP + SAT_OPINION_URL), lo usa como respaldo/alterno.
 */
export function obtenerVerificadorOpinion(): VerificadorOpinionSat {
  const provider = process.env.SAT_OPINION_PROVIDER?.trim().toUpperCase();
  const url = process.env.SAT_OPINION_URL?.trim();
  let http: VerificadorOpinionSatHttp | null = null;
  if (provider === "HTTP" && url) {
    const apiKey = process.env.SAT_OPINION_API_KEY?.trim();
    const timeoutRaw = process.env.SAT_OPINION_TIMEOUT_MS?.trim();
    const timeoutMs = timeoutRaw && /^\d+$/.test(timeoutRaw) ? Number(timeoutRaw) : undefined;
    http = new VerificadorOpinionSatHttp({
      url,
      ...(apiKey ? { apiKey } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    });
  }
  return new VerificadorOpinionSatAuto(http);
}
