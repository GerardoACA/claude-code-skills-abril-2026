// CERBERUS COMERCIO EXTERIOR — generador del Contrato de Encargo LFPDPPP. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/contrato-encargo.ts  [Agente MODELO-17, Inc 17]
// Proposito: Producir de forma PURA y DETERMINISTA el cuerpo legible del
//            Contrato de Encargo de tratamiento (encargado del tratamiento) que
//            la LFPDPPP exige entre el RESPONSABLE (el importador/cliente cuyos
//            datos personales se tratan) y el ENCARGADO (la agencia aduanal que
//            opera por cuenta del responsable). Base normativa: art. 36 LFPDPPP
//            y arts. 50-55 de su Reglamento (relacion responsable-encargado,
//            instrucciones, subencargados, confidencialidad, medidas de
//            seguridad, devolucion/supresion al terminar el encargo).
//
// PATRON PROBATORIO (igual que el resto del sistema): NO se persiste el texto.
// El cuerpo se DERIVA deterministicamente de {nombreTenant, rfcTenant, version,
// instrucciones, subencargados, vigenteDesde}. El `sha256` almacenado en
// ContratoEncargo es el SELLO de ese cuerpo => cualquier perito puede regenerar
// el texto con estos mismos datos y recomputar el hash para verificar que no fue
// alterado. Si el cuerpo cambiara aunque sea un caracter, el sello no cuadra.
//
// FUNCION PURA: sin dependencias externas, sin I/O, sin fechas del reloj. La
// unica fuente de no-determinismo posible (la fecha) llega como string ISO en
// los datos de entrada => misma entrada, misma salida, siempre.
// =============================================================================

import { sha256 } from "@/lib/probatoria/hash";

/**
 * Datos de entrada para derivar el cuerpo del contrato. Todos provienen de
 * fuentes verificadas (tenant del JWT + parametros del acto administrativo);
 * `vigenteDesde` viaja como ISO 8601 para que el texto sea 100% reproducible.
 */
export interface DatosContrato {
  /** Razon social / nombre comercial del tenant (responsable/encargado). */
  nombreTenant: string;
  /** RFC del tenant. */
  rfcTenant: string;
  /** Etiqueta de version del contrato, p. ej. "v1". */
  version: string;
  /** Instrucciones del responsable al encargado (min. 20 chars en el borde API). */
  instrucciones: string;
  /** Subencargados autorizados (lista libre / JSON). Opcional. */
  subencargados?: string;
  /** Inicio de vigencia en ISO 8601 (p. ej. "2026-07-02T00:00:00.000Z"). */
  vigenteDesde: string;
}

/**
 * Genera el TEXTO legible del Contrato de Encargo de tratamiento a partir de los
 * datos del tenant. Funcion PURA: misma entrada => misma salida (regenerable y
 * verificable por un perito contra el sha256 sellado). El formato es estable;
 * NO cambiar su composicion sin versionar, porque alteraria el hash de contratos
 * ya emitidos.
 */
export function generarCuerpoContrato(datos: DatosContrato): string {
  const {
    nombreTenant,
    rfcTenant,
    version,
    instrucciones,
    subencargados,
    vigenteDesde,
  } = datos;

  const subencargadosTexto: string =
    subencargados !== undefined && subencargados.trim().length > 0
      ? subencargados.trim()
      : "No se autorizan subencargados. El encargado no podra subcontratar el " +
        "tratamiento sin autorizacion previa y por escrito del responsable " +
        "(art. 54 del Reglamento de la LFPDPPP).";

  // Cuerpo determinista. El salto de linea es "\n" (LF) para que el hash sea
  // reproducible en cualquier plataforma.
  const lineas: string[] = [
    "CONTRATO DE ENCARGO DE TRATAMIENTO DE DATOS PERSONALES",
    "(Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares —",
    "art. 36 LFPDPPP; arts. 50 a 55 de su Reglamento)",
    "",
    `Version del contrato: ${version}`,
    `Responsable / Encargado: ${nombreTenant} (RFC ${rfcTenant})`,
    `Vigente desde: ${vigenteDesde}`,
    "",
    "El presente instrumento formaliza la relacion RESPONSABLE-ENCARGADO prevista",
    "en la LFPDPPP: el ENCARGADO trata datos personales POR CUENTA del RESPONSABLE,",
    "conforme a las instrucciones de este y sin destinarlos a fines propios.",
    "",
    "CLAUSULA PRIMERA — OBJETO DEL ENCARGO.",
    "El responsable encomienda al encargado el tratamiento de datos personales",
    "estrictamente necesario para la prestacion de los servicios de comercio",
    "exterior y despacho aduanero contratados. El encargado unicamente tratara los",
    "datos conforme a las instrucciones documentadas del responsable y no los",
    "utilizara ni destinara a una finalidad distinta de la del encargo.",
    "",
    "CLAUSULA SEGUNDA — INSTRUCCIONES DEL RESPONSABLE.",
    instrucciones.trim(),
    "",
    "CLAUSULA TERCERA — SUBENCARGADOS AUTORIZADOS.",
    subencargadosTexto,
    "Todo subencargado quedara obligado a las mismas condiciones y medidas de",
    "seguridad que este contrato impone al encargado (art. 54 del Reglamento).",
    "",
    "CLAUSULA CUARTA — MEDIDAS DE SEGURIDAD.",
    "El encargado implementara y mantendra las medidas de seguridad administrativas,",
    "tecnicas y fisicas que permitan proteger los datos personales contra dano,",
    "perdida, alteracion, destruccion o el uso, acceso o tratamiento no autorizados",
    "(arts. 19 LFPDPPP y 57 a 60 de su Reglamento).",
    "",
    "CLAUSULA QUINTA — CONFIDENCIALIDAD.",
    "El encargado guardara confidencialidad respecto de los datos personales objeto",
    "del tratamiento, obligacion que subsiste aun despues de terminada la relacion",
    "con el responsable (art. 21 LFPDPPP).",
    "",
    "CLAUSULA SEXTA — DEVOLUCION Y SUPRESION.",
    "Al concluir el encargo por cualquier causa, el encargado debera, a eleccion del",
    "responsable, devolver o suprimir de forma segura los datos personales tratados",
    "y las copias existentes, salvo disposicion legal que obligue a su conservacion",
    "(art. 53 del Reglamento de la LFPDPPP).",
    "",
    "CLAUSULA SEPTIMA — VIGENCIA.",
    `El encargo surte efectos a partir de ${vigenteDesde} y permanecera vigente en`,
    "tanto subsista la relacion de prestacion de servicios, sin perjuicio de las",
    "obligaciones de confidencialidad y supresion que le sobrevivan.",
    "",
    "Este documento es regenerable de forma determinista a partir de los datos del",
    "responsable y queda sellado con SHA-256 como prueba de integridad de su",
    "contenido (verificable por un tercero perito sin acceso al sistema).",
  ];

  return lineas.join("\n");
}

/**
 * Sello probatorio del contrato: SHA-256 (hex, 64 chars) del cuerpo derivado.
 * Es el valor que se persiste en `ContratoEncargo.sha256`. Regenerar el cuerpo
 * con los mismos `datos` y recomputar este sello permite a un perito verificar
 * que el texto no fue alterado.
 */
export function selloContrato(datos: DatosContrato): string {
  return sha256(generarCuerpoContrato(datos));
}
