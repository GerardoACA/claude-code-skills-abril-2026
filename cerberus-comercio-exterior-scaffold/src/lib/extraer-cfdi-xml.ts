// CERBERUS COMERCIO EXTERIOR — extracción de datos desde un XML CFDI 4.0. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/extraer-cfdi-xml.ts  (Incremento 45)
// Propósito: Función PURA que extrae de un XML de CFDI 4.0 real (factura) los
//            datos reutilizables para PRELLENAR los forms de captura de CFDI:
//            - cfdi:Emisor / cfdi:Receptor => Rfc
//            - cfdi:Comprobante => Total, Moneda, TipoCambio
//            - cfdi:Concepto => ClaveProdServ, NoIdentificacion, Descripcion,
//              Cantidad, ClaveUnidad, ValorUnitario, Importe
//            - Complemento Carta Porte (CUALQUIER versión/prefijo): Ubicacion
//              Origen/Destino (CodigoPostal, FechaHoraSalidaLlegada),
//              PlacaVM / ConfigVehicular y PesoEnKg de la primera Mercancia.
//
//            Se parsea con expresiones regulares sobre los ATRIBUTOS del XML,
//            SIN dependencias nuevas ni DOMParser (corre igual en server, client
//            y Vitest). TOLERANTE por diseño: todo campo es opcional, se
//            devuelve lo que se encuentre más una lista de advertencias, y la
//            función NUNCA lanza (el prellenado es asistivo; decisión C9: el
//            sistema alerta, nunca bloquea — el capturista siempre revisa).
// =============================================================================

/** Concepto (mercancía facturada) extraído de un nodo cfdi:Concepto. */
export type ConceptoCfdiExtraido = {
  claveProdServ?: string;
  noIdentificacion?: string;
  descripcion?: string;
  cantidad?: number;
  claveUnidad?: string;
  valorUnitario?: number;
  importe?: number;
};

/** Ubicación (origen o destino) del complemento Carta Porte. */
export type UbicacionCartaPorteExtraida = {
  codigoPostal?: string;
  /** FechaHoraSalidaLlegada tal cual viene en el XML (ISO local del SAT). */
  fechaHora?: string;
};

/** Datos del complemento Carta Porte (si el CFDI lo trae, cualquier versión). */
export type CartaPorteExtraida = {
  origen?: UbicacionCartaPorteExtraida;
  destino?: UbicacionCartaPorteExtraida;
  placaVm?: string;
  configVehicular?: string;
  pesoEnKg?: number;
};

/** Resultado tolerante de la extracción: solo lo que se encontró. */
export type DatosCfdiExtraidos = {
  emisorRfc?: string;
  receptorRfc?: string;
  total?: number;
  moneda?: string;
  tipoCambio?: number;
  conceptos: ConceptoCfdiExtraido[];
  cartaPorte?: CartaPorteExtraida;
  /** Qué NO se pudo encontrar / qué se ve raro. Nunca se lanza. */
  advertencias: string[];
};

// -----------------------------------------------------------------------------
// Helpers de parseo por regex (tolerantes a prefijos de namespace y a comillas
// simples o dobles en los atributos).
// -----------------------------------------------------------------------------

/** Lee un atributo (Nombre="valor" o Nombre='valor') de una cadena de atributos. */
function atributo(attrs: string, nombre: string): string | undefined {
  const re = new RegExp(
    `(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const m = re.exec(attrs);
  if (m === null) return undefined;
  const valor = (m[1] ?? m[2] ?? "").trim();
  return valor.length > 0 ? valor : undefined;
}

/** Atributo numérico; undefined si no existe o no es un número finito. */
function atributoNumerico(attrs: string, nombre: string): number | undefined {
  const texto = atributo(attrs, nombre);
  if (texto === undefined) return undefined;
  const n = Number(texto);
  return Number.isFinite(n) ? n : undefined;
}

/** Atributos del PRIMER nodo con ese nombre local (ignora el prefijo cfdi:/cce11:/…). */
function primerNodo(xml: string, nombreLocal: string): string | undefined {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombreLocal}\\b([^>]*)`, "i");
  const m = re.exec(xml);
  return m === null ? undefined : (m[1] ?? "");
}

/** Atributos de TODOS los nodos con ese nombre local. */
function todosLosNodos(xml: string, nombreLocal: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombreLocal}\\b([^>]*)`, "gi");
  const resultado: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    resultado.push(m[1] ?? "");
  }
  return resultado;
}

/**
 * Bloques <…:Ubicacion …> del complemento Carta Porte, INCLUYENDO su primer
 * hijo (el Domicilio con CodigoPostal suele venir como hijo autocerrado, por lo
 * que el corte perezoso en "/>" o "</…Ubicacion>" ya lo abarca). No confunde el
 * contenedor <…:Ubicaciones> gracias al límite de palabra.
 */
function bloquesUbicacion(xml: string): string[] {
  const re =
    /<(?:[\w.-]+:)?Ubicacion\b[\s\S]*?(?:\/>|<\/(?:[\w.-]+:)?Ubicacion>)/gi;
  return xml.match(re) ?? [];
}

// -----------------------------------------------------------------------------
// Extracción principal.
// -----------------------------------------------------------------------------

/**
 * Extrae datos de prellenado desde el texto de un XML CFDI 4.0. Pura y
 * tolerante: no lanza; devuelve lo encontrado + advertencias.
 */
export function extraerDatosCfdiXml(xml: string): DatosCfdiExtraidos {
  const advertencias: string[] = [];
  const datos: DatosCfdiExtraidos = { conceptos: [], advertencias };

  if (typeof xml !== "string" || xml.trim().length === 0) {
    advertencias.push("Contenido vacío: no hay XML que analizar.");
    return datos;
  }

  // --- Comprobante: Total / Moneda / TipoCambio -------------------------------
  const comprobante = primerNodo(xml, "Comprobante");
  if (comprobante === undefined) {
    advertencias.push(
      "No se encontró el nodo Comprobante: el archivo no parece un CFDI.",
    );
  } else {
    const total = atributoNumerico(comprobante, "Total");
    if (total !== undefined) datos.total = total;
    const moneda = atributo(comprobante, "Moneda");
    if (moneda !== undefined) datos.moneda = moneda.toUpperCase();
    const tipoCambio = atributoNumerico(comprobante, "TipoCambio");
    if (tipoCambio !== undefined) datos.tipoCambio = tipoCambio;
  }

  // --- Emisor / Receptor -------------------------------------------------------
  const emisor = primerNodo(xml, "Emisor");
  const rfcEmisor = emisor !== undefined ? atributo(emisor, "Rfc") : undefined;
  if (rfcEmisor !== undefined) {
    datos.emisorRfc = rfcEmisor.toUpperCase();
  } else {
    advertencias.push("No se encontró el RFC del emisor (cfdi:Emisor Rfc=).");
  }

  const receptor = primerNodo(xml, "Receptor");
  const rfcReceptor =
    receptor !== undefined ? atributo(receptor, "Rfc") : undefined;
  if (rfcReceptor !== undefined) {
    datos.receptorRfc = rfcReceptor.toUpperCase();
  } else {
    advertencias.push(
      "No se encontró el RFC del receptor (cfdi:Receptor Rfc=).",
    );
  }

  // --- Conceptos ---------------------------------------------------------------
  for (const attrs of todosLosNodos(xml, "Concepto")) {
    const concepto: ConceptoCfdiExtraido = {};
    const claveProdServ = atributo(attrs, "ClaveProdServ");
    if (claveProdServ !== undefined) concepto.claveProdServ = claveProdServ;
    const noIdentificacion = atributo(attrs, "NoIdentificacion");
    if (noIdentificacion !== undefined)
      concepto.noIdentificacion = noIdentificacion;
    const descripcion = atributo(attrs, "Descripcion");
    if (descripcion !== undefined) concepto.descripcion = descripcion;
    const cantidad = atributoNumerico(attrs, "Cantidad");
    if (cantidad !== undefined) concepto.cantidad = cantidad;
    const claveUnidad = atributo(attrs, "ClaveUnidad");
    if (claveUnidad !== undefined) concepto.claveUnidad = claveUnidad;
    const valorUnitario = atributoNumerico(attrs, "ValorUnitario");
    if (valorUnitario !== undefined) concepto.valorUnitario = valorUnitario;
    const importe = atributoNumerico(attrs, "Importe");
    if (importe !== undefined) concepto.importe = importe;
    datos.conceptos.push(concepto);
  }
  if (datos.conceptos.length === 0) {
    advertencias.push("No se encontraron conceptos (cfdi:Concepto).");
  }

  // --- Complemento Carta Porte (cualquier versión: cartaporte20/30/31/…) -------
  const cartaPorte: CartaPorteExtraida = {};

  for (const bloque of bloquesUbicacion(xml)) {
    const tipo = (atributo(bloque, "TipoUbicacion") ?? "").toUpperCase();
    const ubicacion: UbicacionCartaPorteExtraida = {};
    const codigoPostal = atributo(bloque, "CodigoPostal");
    if (codigoPostal !== undefined) ubicacion.codigoPostal = codigoPostal;
    const fechaHora = atributo(bloque, "FechaHoraSalidaLlegada");
    if (fechaHora !== undefined) ubicacion.fechaHora = fechaHora;
    if (Object.keys(ubicacion).length === 0) continue;
    if (tipo === "ORIGEN" && cartaPorte.origen === undefined) {
      cartaPorte.origen = ubicacion;
    } else if (tipo === "DESTINO" && cartaPorte.destino === undefined) {
      cartaPorte.destino = ubicacion;
    }
  }

  // PlacaVM / ConfigVehicular viven en IdentificacionVehicular (o en el propio
  // Autotransporte en versiones viejas): se buscan como atributos en TODO el
  // documento porque solo existen dentro del complemento Carta Porte.
  const placaVm = atributo(xml, "PlacaVM");
  if (placaVm !== undefined) cartaPorte.placaVm = placaVm.toUpperCase();
  const configVehicular = atributo(xml, "ConfigVehicular");
  if (configVehicular !== undefined)
    cartaPorte.configVehicular = configVehicular;

  // Peso de la primera Mercancia que declare PesoEnKg.
  for (const mercancia of todosLosNodos(xml, "Mercancia")) {
    const peso = atributoNumerico(mercancia, "PesoEnKg");
    if (peso !== undefined) {
      cartaPorte.pesoEnKg = peso;
      break;
    }
  }

  const traeComplemento = /cartaporte/i.test(xml);
  if (Object.keys(cartaPorte).length > 0) {
    datos.cartaPorte = cartaPorte;
  } else if (traeComplemento) {
    advertencias.push(
      "El XML menciona Carta Porte pero no se pudieron extraer ubicaciones ni autotransporte.",
    );
  }

  return datos;
}

// =============================================================================
// FIN extraer-cfdi-xml.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
