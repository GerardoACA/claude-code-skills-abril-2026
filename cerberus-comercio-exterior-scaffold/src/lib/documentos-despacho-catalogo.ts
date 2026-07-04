// CERBERUS COMERCIO EXTERIOR — catálogo de documentos del expediente del despacho. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/documentos-despacho-catalogo.ts  (Incremento 50)
// Propósito: Valores permitidos (y sus etiquetas legibles) para los TIPOS de
//            documento de la bóveda documental del expediente probatorio del
//            DESPACHO (pedimento, factura, carta porte, COVE, DODA, etc.).
//            Se validan a nivel de aplicación: el campo Documento.tipo del
//            schema guarda texto libre (mismo patrón que el catálogo KYC,
//            src/lib/documentos-kyc-catalogo.ts).
//
// NOTA: el catálogo es a nivel APP y se ampliará con el dictamen del agente
// aduanal (nuevos tipos documentales se agregan aquí sin tocar el schema).
// =============================================================================

/** Tipos documentales del expediente probatorio del despacho. */
export const TIPOS_DOC_DESPACHO = [
  "PEDIMENTO",
  "FACTURA_COMERCIAL",
  "CARTA_PORTE_XML",
  "CARTA_PORTE_PDF",
  "DOCUMENTO_TRANSPORTE",
  "COVE_ACUSE",
  "DODA",
  "MANIFESTACION_VALOR",
  "CERTIFICADO_ORIGEN",
  "PERMISO_NOM",
  "ENCARGO_CONFERIDO_ACUSE",
  "OTRO",
] as const;
export type TipoDocDespacho = (typeof TIPOS_DOC_DESPACHO)[number];

/** Etiquetas legibles (UI / bitácora) por tipo documental. */
export const TIPO_DOC_DESPACHO_ETIQUETA: Readonly<Record<TipoDocDespacho, string>> = {
  PEDIMENTO: "Pedimento",
  FACTURA_COMERCIAL: "Factura comercial",
  CARTA_PORTE_XML: "Carta porte (CFDI XML)",
  CARTA_PORTE_PDF: "Carta porte (representación PDF)",
  DOCUMENTO_TRANSPORTE: "Documento de transporte (BL / guía aérea / talón)",
  COVE_ACUSE: "Acuse de valor (COVE)",
  DODA: "DODA (documento de operación para despacho aduanero)",
  MANIFESTACION_VALOR: "Manifestación de valor",
  CERTIFICADO_ORIGEN: "Certificado de origen",
  PERMISO_NOM: "Permiso / cumplimiento de NOM",
  ENCARGO_CONFERIDO_ACUSE: "Acuse de encargo conferido",
  OTRO: "Otro documento del despacho",
};

/** Type guard: valida un texto libre contra el catálogo de tipos. */
export function esTipoDocDespacho(v: string): v is TipoDocDespacho {
  return (TIPOS_DOC_DESPACHO as readonly string[]).includes(v);
}

// =============================================================================
// FIN documentos-despacho-catalogo.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
