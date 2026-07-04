// CERBERUS COMERCIO EXTERIOR — catálogo de documentos del expediente KYC. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/documentos-kyc-catalogo.ts  (Incrementos 43 y 52)
// Propósito: Valores permitidos (y sus etiquetas legibles) para los TIPOS de
//            documento de la bóveda documental del expediente KYC 1.4.14, más
//            la lista de documentos OBLIGATORIOS según el tipo de persona
//            (física / moral). Se validan a nivel de aplicación: el campo
//            Documento.tipo del schema guarda texto libre (patrón del catálogo
//            de notificaciones, src/lib/notificaciones-catalogo.ts).
//            Incremento 52: la 1ª Resolución de Modificaciones a las RGCE 2026
//            (DOF 14-may-2026) precisa que el expediente 1.4.14 debe contener
//            el comprobante del DOMICILIO DONDE SE REALIZAN LAS OPERACIONES DE
//            COMERCIO EXTERIOR, distinto del comprobante de domicilio fiscal:
//            se agrega COMPROBANTE_DOMICILIO_OPERACIONES_CE como obligatorio
//            para persona física y moral.
// =============================================================================

/** Tipos documentales del expediente KYC 1.4.14 (Regla 1.4.14 CFF). */
export const TIPOS_DOC_KYC = [
  "IDENTIFICACION_OFICIAL",
  "ACTA_CONSTITUTIVA",
  "PODER_REPRESENTANTE",
  "COMPROBANTE_DOMICILIO",
  "COMPROBANTE_DOMICILIO_OPERACIONES_CE",
  "RFC_CSF",
  "ID_FISCAL_EXTRANJERO",
  "OTRO",
] as const;
export type TipoDocKyc = (typeof TIPOS_DOC_KYC)[number];

/** Etiquetas legibles (UI / bitácora) por tipo documental. */
export const TIPO_DOC_KYC_ETIQUETA: Readonly<Record<TipoDocKyc, string>> = {
  IDENTIFICACION_OFICIAL: "Identificación oficial vigente",
  ACTA_CONSTITUTIVA: "Acta constitutiva",
  PODER_REPRESENTANTE: "Poder del representante legal",
  COMPROBANTE_DOMICILIO: "Comprobante de domicilio fiscal",
  COMPROBANTE_DOMICILIO_OPERACIONES_CE:
    "Comprobante de domicilio de operaciones de comercio exterior (RGCE 1.4.14, 1ª Modif. 2026)",
  RFC_CSF: "Constancia de situación fiscal (RFC / CSF)",
  ID_FISCAL_EXTRANJERO: "Identificación fiscal extranjera",
  OTRO: "Otro documento del expediente",
};

/** Type guard: valida un texto libre contra el catálogo de tipos. */
export function esTipoDocKyc(v: string): v is TipoDocKyc {
  return (TIPOS_DOC_KYC as readonly string[]).includes(v);
}

/** Tipo de persona del cliente (decide qué documentos son obligatorios). */
export type TipoPersona = "FISICA" | "MORAL";

/**
 * Documentos OBLIGATORIOS del expediente KYC según el tipo de persona:
 *  - FÍSICA: identificación oficial, comprobante de domicilio fiscal,
 *    comprobante del domicilio de operaciones de comercio exterior
 *    (RGCE 1.4.14, 1ª Modif. 2026, DOF 14-may-2026) y RFC/CSF.
 *  - MORAL:  además, acta constitutiva y poder del representante legal.
 * El resto del catálogo (id fiscal extranjera, otro) es opcional/situacional.
 */
export function documentosRequeridos(tipoPersona: TipoPersona): TipoDocKyc[] {
  const base: TipoDocKyc[] = [
    "IDENTIFICACION_OFICIAL",
    "COMPROBANTE_DOMICILIO",
    "COMPROBANTE_DOMICILIO_OPERACIONES_CE",
    "RFC_CSF",
  ];
  if (tipoPersona === "MORAL") {
    return [
      "IDENTIFICACION_OFICIAL",
      "ACTA_CONSTITUTIVA",
      "PODER_REPRESENTANTE",
      "COMPROBANTE_DOMICILIO",
      "COMPROBANTE_DOMICILIO_OPERACIONES_CE",
      "RFC_CSF",
    ];
  }
  return base;
}
