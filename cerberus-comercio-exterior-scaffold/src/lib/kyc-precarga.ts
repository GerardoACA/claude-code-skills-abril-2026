// CERBERUS COMERCIO EXTERIOR — precarga del cuestionario KYC sellado. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/kyc-precarga.ts  (Incrementos 47 y 48B)
// Propósito: Extraer, del payload sellado que se conserva en la bitácora
//            (acción "KYC_SELLADO"), los valores iniciales para precargar el
//            cuestionario 1.4.14 en la siguiente captura: el capturista solo
//            modifica lo que cambió y vuelve a sellar (nueva versión). La
//            manifestación de integridad (no-EFOS) NUNCA se precarga: se
//            re-declara bajo protesta en cada sellado.
//            [Inc 48B] Además: extraer precargas de los eventos KYC_DOCUMENTO
//            (documentos subidos a la bóveda con datos extraídos por IA/OCR)
//            y combinarlas con la versión sellada (el sellado tiene prioridad
//            campo por campo; los documentos solo rellenan huecos).
//            Funciones PURAS y defensivas: JSON ajeno → solo se toman los
//            campos conocidos con el tipo correcto; lo demás se ignora.
// =============================================================================

export interface InicialesDatosGenerales {
  tipoPersona?: "FISICA" | "MORAL";
  nombreComercial?: string;
  representanteLegal?: string;
  repLegalTipoIdentificacion?: "INE" | "PASAPORTE" | "CEDULA" | "OTRO";
  repLegalNumeroIdentificacion?: string;
  repLegalPoderFecha?: string;
  residenciaFiscal?: "MEXICO" | "EXTRANJERO";
  idFiscalExtranjero?: string;
  paisResidencia?: string;
  correoContacto?: string;
  telefonoContacto?: string;
  actividadEconomica?: string;
}

export interface InicialesMaterialidad {
  domicilioOperacionesCE?: string;
  tieneContratos?: boolean;
  descripcionContratos?: string;
  tieneInfraestructura?: boolean;
  descripcionInfraestructura?: string;
  numeroEmpleados?: string;
}

export interface PrecargaCuestionario {
  datosGenerales: InicialesDatosGenerales;
  materialidad: InicialesMaterialidad;
  /** Fecha ISO del sellado del que provienen los valores (para mostrarla). */
  capturadoEn: string | null;
}

const TEXTO_GENERALES = [
  "nombreComercial",
  "representanteLegal",
  "repLegalNumeroIdentificacion",
  "repLegalPoderFecha",
  "idFiscalExtranjero",
  "paisResidencia",
  "correoContacto",
  "telefonoContacto",
  "actividadEconomica",
] as const;

const TEXTO_MATERIALIDAD = [
  "domicilioOperacionesCE",
  "descripcionContratos",
  "descripcionInfraestructura",
  "numeroEmpleados",
] as const;

const BOOL_MATERIALIDAD = ["tieneContratos", "tieneInfraestructura"] as const;

function comoObjeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Parsea el payload sellado (JSON de la bitácora) y devuelve los valores
 * precargables, o null si el JSON no es un cuestionario reconocible.
 */
export function extraerInicialesDeSellado(payloadRef: string): PrecargaCuestionario | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(payloadRef);
  } catch {
    return null;
  }
  const raiz = comoObjeto(crudo);
  if (!raiz) return null;

  const dg = comoObjeto(raiz["datosGenerales"]);
  const mat = comoObjeto(raiz["materialidad"]);
  if (!dg && !mat) return null;

  const datosGenerales: InicialesDatosGenerales = {};
  if (dg) {
    for (const campo of TEXTO_GENERALES) {
      const v = dg[campo];
      if (typeof v === "string" && v.trim() !== "") datosGenerales[campo] = v;
    }
    if (dg["tipoPersona"] === "FISICA" || dg["tipoPersona"] === "MORAL") {
      datosGenerales.tipoPersona = dg["tipoPersona"];
    }
    const tipoId = dg["repLegalTipoIdentificacion"];
    if (tipoId === "INE" || tipoId === "PASAPORTE" || tipoId === "CEDULA" || tipoId === "OTRO") {
      datosGenerales.repLegalTipoIdentificacion = tipoId;
    }
    if (dg["residenciaFiscal"] === "MEXICO" || dg["residenciaFiscal"] === "EXTRANJERO") {
      datosGenerales.residenciaFiscal = dg["residenciaFiscal"];
    }
  }

  const materialidad: InicialesMaterialidad = {};
  if (mat) {
    for (const campo of TEXTO_MATERIALIDAD) {
      const v = mat[campo];
      if (typeof v === "string" && v.trim() !== "") materialidad[campo] = v;
    }
    for (const campo of BOOL_MATERIALIDAD) {
      const v = mat[campo];
      if (typeof v === "boolean") materialidad[campo] = v;
    }
  }

  const capturadoEn = typeof raiz["capturadoEn"] === "string" ? raiz["capturadoEn"] : null;
  return { datosGenerales, materialidad, capturadoEn };
}

/**
 * [Inc 48B] Parsea el payloadRef de un evento KYC_DOCUMENTO de la bitácora
 * (contrato: { ref: "kyc-doc", documentoId, clienteId, tipo, extraido }) y
 * devuelve los valores precargables del cuestionario, o null si no aplica.
 * Defensiva: los eventos VIEJOS traen un string plano no-JSON ("kyc-doc:...")
 * → null sin lanzar; extraido ausente/null o sin campos útiles → null.
 * Mapeo: actividad → datosGenerales.actividadEconomica,
 *        razonSocial → datosGenerales.nombreComercial,
 *        domicilio → materialidad.domicilioOperacionesCE.
 */
export function extraerInicialesDeDocumento(payloadRef: string): PrecargaCuestionario | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(payloadRef);
  } catch {
    return null; // eventos viejos: string plano "kyc-doc:...", no-JSON.
  }
  const raiz = comoObjeto(crudo);
  if (!raiz || raiz["ref"] !== "kyc-doc") return null;

  const extraido = comoObjeto(raiz["extraido"]);
  if (!extraido) return null;

  const comoTexto = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v : undefined;

  const datosGenerales: InicialesDatosGenerales = {};
  const materialidad: InicialesMaterialidad = {};
  const razonSocial = comoTexto(extraido["razonSocial"]);
  const actividad = comoTexto(extraido["actividad"]);
  const domicilio = comoTexto(extraido["domicilio"]);
  if (razonSocial !== undefined) datosGenerales.nombreComercial = razonSocial;
  if (actividad !== undefined) datosGenerales.actividadEconomica = actividad;
  if (domicilio !== undefined) materialidad.domicilioOperacionesCE = domicilio;

  // Sin campos útiles no hay nada que precargar (evita banner de precarga vacío).
  if (razonSocial === undefined && actividad === undefined && domicilio === undefined) {
    return null;
  }
  return { datosGenerales, materialidad, capturadoEn: null };
}

/**
 * [Inc 48B] Combina la precarga del último sellado con la derivada de los
 * documentos de la bóveda. El SELLADO tiene prioridad campo por campo (es lo
 * que el capturista ya revisó y firmó); los documentos SOLO rellenan huecos.
 * Devuelve null si ambas entradas son null.
 */
export function combinarPrecargas(
  sellado: PrecargaCuestionario | null,
  deDocumentos: PrecargaCuestionario | null,
): PrecargaCuestionario | null {
  if (!sellado && !deDocumentos) return null;
  if (!sellado) return deDocumentos;
  if (!deDocumentos) return sellado;
  return {
    datosGenerales: { ...deDocumentos.datosGenerales, ...sellado.datosGenerales },
    materialidad: { ...deDocumentos.materialidad, ...sellado.materialidad },
    capturadoEn: sellado.capturadoEn ?? deDocumentos.capturadoEn,
  };
}
