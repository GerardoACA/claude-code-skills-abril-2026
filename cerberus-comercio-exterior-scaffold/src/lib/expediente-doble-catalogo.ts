// CERBERUS COMERCIO EXTERIOR — catálogo del expediente doble 3.1.42. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/expediente-doble-catalogo.ts  (Incremento 54)
// Propósito: Valores permitidos (y sus etiquetas legibles) para los TIPOS de
//            documento del EXPEDIENTE DOBLE de la regla 3.1.42 RGCE: el agente
//            aduanal Y la empresa importadora/exportadora deben conservar CADA
//            UNO su expediente de las operaciones. Baseline razonable a nivel
//            de aplicación (el campo Documento.tipo del schema guarda texto
//            libre, patrón de src/lib/documentos-kyc-catalogo.ts); el ABOGADO
//            validará/ajustará la lista definitiva de tipos documentales.
//            El modelo ExpedienteDoble3142 NO distingue la "parte" (agente /
//            empresa): se codifica como PREFIJO del tipo almacenado
//            ("AGENTE:COPIA_PEDIMENTO" / "EMPRESA:FACTURA") — helpers abajo.
// =============================================================================

/** Tipos documentales del expediente doble 3.1.42 (baseline; valida el abogado). */
export const TIPOS_DOC_DOBLE_3142 = [
  "COPIA_PEDIMENTO",
  "FACTURA",
  "DOCUMENTO_TRANSPORTE",
  "CERTIFICADO_ORIGEN",
  "ACUSE_COVE",
  "CORRESPONDENCIA_CLIENTE",
  "OTRO",
] as const;
export type TipoDocDoble3142 = (typeof TIPOS_DOC_DOBLE_3142)[number];

/** Etiquetas legibles (UI / bitácora) por tipo documental. */
export const TIPO_DOC_DOBLE_ETIQUETA: Readonly<Record<TipoDocDoble3142, string>> = {
  COPIA_PEDIMENTO: "Copia del pedimento",
  FACTURA: "Factura (comercial / CFDI)",
  DOCUMENTO_TRANSPORTE: "Documento de transporte (BL / guía / carta porte)",
  CERTIFICADO_ORIGEN: "Certificado de origen",
  ACUSE_COVE: "Acuse COVE",
  CORRESPONDENCIA_CLIENTE: "Correspondencia con el cliente",
  OTRO: "Otro documento de la operación",
};

/** Type guard: valida un texto libre contra el catálogo de tipos. */
export function esTipoDocDoble3142(v: string): v is TipoDocDoble3142 {
  return (TIPOS_DOC_DOBLE_3142 as readonly string[]).includes(v);
}

// =============================================================================
// "Parte" del expediente doble: quién custodia la copia (agente aduanal o
// empresa importadora/exportadora). El schema NO tiene campo para esto: se
// guarda como prefijo del Documento.tipo ("AGENTE:..." / "EMPRESA:...").
// =============================================================================

/** Las dos partes obligadas a conservar expediente por la regla 3.1.42. */
export const PARTES_EXPEDIENTE_DOBLE = ["AGENTE", "EMPRESA"] as const;
export type ParteExpedienteDoble = (typeof PARTES_EXPEDIENTE_DOBLE)[number];

/** Etiquetas legibles por parte (encabezados de columna en la UI). */
export const PARTE_EXPEDIENTE_ETIQUETA: Readonly<Record<ParteExpedienteDoble, string>> = {
  AGENTE: "Expediente del agente",
  EMPRESA: "Expediente de la empresa",
};

/** Type guard: valida un texto libre contra las partes permitidas. */
export function esParteExpedienteDoble(v: string): v is ParteExpedienteDoble {
  return (PARTES_EXPEDIENTE_DOBLE as readonly string[]).includes(v);
}

/** Compone el tipo ALMACENADO en Documento.tipo: "AGENTE:COPIA_PEDIMENTO". */
export function tipoConParte(parte: ParteExpedienteDoble, tipo: TipoDocDoble3142): string {
  return `${parte}:${tipo}`;
}

/**
 * Descompone un Documento.tipo almacenado en { parte, tipo }, o null si el
 * texto no corresponde al formato del expediente doble (lector defensivo:
 * nunca lanza ante datos históricos o de otros expedientes).
 */
export function separarTipoConParte(
  almacenado: string,
): { parte: ParteExpedienteDoble; tipo: TipoDocDoble3142 } | null {
  const idx = almacenado.indexOf(":");
  if (idx <= 0) return null;
  const parte = almacenado.slice(0, idx);
  const tipo = almacenado.slice(idx + 1);
  if (!esParteExpedienteDoble(parte) || !esTipoDocDoble3142(tipo)) return null;
  return { parte, tipo };
}
