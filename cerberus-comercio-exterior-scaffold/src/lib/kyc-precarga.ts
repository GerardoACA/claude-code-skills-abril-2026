// CERBERUS COMERCIO EXTERIOR — precarga del cuestionario KYC sellado. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/kyc-precarga.ts  (Incremento 47)
// Propósito: Extraer, del payload sellado que se conserva en la bitácora
//            (acción "KYC_SELLADO"), los valores iniciales para precargar el
//            cuestionario 1.4.14 en la siguiente captura: el capturista solo
//            modifica lo que cambió y vuelve a sellar (nueva versión). La
//            manifestación de integridad (no-EFOS) NUNCA se precarga: se
//            re-declara bajo protesta en cada sellado.
//            Función PURA y defensiva: JSON ajeno → solo se toman los campos
//            conocidos con el tipo correcto; lo demás se ignora.
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
