// CERBERUS COMERCIO EXTERIOR — servicio de verificación de cumplimiento. NO es SIDF.
// ============================================================================
// Incremento 5 — Alcance ampliado del KYC más allá del art. 69-B.
//
// **ESTO ES UN STUB.** No consulta ninguna fuente externa. La integración REAL
// con:
//   - listados públicos del SAT (art. 69, 69-B, 69-B Bis),
//   - publicaciones del DOF,
//   - la opinión de cumplimiento de obligaciones fiscales (art. 32-D) vía el
//     servicio del SAT,
//   - y el estado del CSD (17-H / 17-H Bis),
// es trabajo POSTERIOR. Aquí solo generamos un resultado por cada
// `FuenteVerificacion` con lógica placeholder derivada del patrón del RFC, para
// poder ejercitar la UI, el modelo de datos y el flujo probatorio.
//
// Principio rector C9: el sistema ALERTA y registra con snapshot fechado;
// NUNCA bloquea. Un resultado adverso NO impide operar; solo alerta.
//
// El snapshot (snapshotSha256) se calcula con la primitiva SHA-256 compartida
// de @/lib/probatoria/hash sobre un payload canónico que incluye la fecha de
// consulta, de modo que quede una huella fechada y reproducible del stub.
// ============================================================================

import { sha256 } from "@/lib/probatoria/hash";

/**
 * Fuentes/supuestos verificados. Los valores coinciden EXACTAMENTE con el enum
 * `FuenteVerificacion` del schema Prisma (Incremento 5).
 */
export const FUENTES_VERIFICACION = [
  "ART_69",
  "ART_69B",
  "ART_69B_BIS",
  "ART_49BIS",
  "OPINION_32D",
  "CSD_17H",
] as const;

/** Unión de literales de fuente (equivalente al enum Prisma `FuenteVerificacion`). */
export type FuenteVerificacion = (typeof FUENTES_VERIFICACION)[number];

/**
 * Resultados posibles. Coinciden EXACTAMENTE con el enum
 * `ResultadoVerificacion` del schema Prisma (Incremento 5).
 */
export const RESULTADOS_VERIFICACION = [
  "AL_CORRIENTE",
  "NO_DISPONIBLE",
  "ALERTA",
  "INHABILITADO_PRESUNTO",
  "INHABILITADO_DEFINITIVO",
] as const;

/** Unión de literales de resultado (equivalente al enum Prisma `ResultadoVerificacion`). */
export type ResultadoVerificacion = (typeof RESULTADOS_VERIFICACION)[number];

/** Entrada del servicio: identificación del cliente/proveedor a verificar. */
export interface EntradaVerificacion {
  /** RFC del cliente/proveedor (única entrada que necesita el stub). */
  rfc: string;
}

/** Resultado de la verificación para UNA fuente. */
export interface ResultadoFuente {
  /** Fuente/supuesto verificado. */
  fuente: FuenteVerificacion;
  /** Resultado del supuesto para el RFC. */
  resultado: ResultadoVerificacion;
  /** Texto explicativo legible (STUB: describe el placeholder aplicado). */
  detalle: string;
  /** SHA-256 (hex, 64 chars) del payload canónico fechado del snapshot. */
  snapshotSha256: string;
  /** Fecha de consulta (ISO 8601) usada dentro del payload del snapshot. */
  consultadoEn: string;
}

/** Etiqueta legible por fuente, para el `detalle` del stub. */
const ETIQUETA_FUENTE: Readonly<Record<FuenteVerificacion, string>> = {
  ART_69: "art. 69 CFF (créditos firmes / no localizados)",
  ART_69B: "art. 69-B CFF (EFOS/EDOS)",
  ART_69B_BIS: "art. 69-B Bis CFF (transmisión indebida de pérdidas)",
  ART_49BIS:
    "Art. 49 Bis CFF (verificación documental en curso por abogado; supuesto de la reforma CFF 2026)",
  OPINION_32D: "art. 32-D CFF (opinión de cumplimiento)",
  CSD_17H: "art. 17-H / 17-H Bis CFF (sello digital)",
};

/**
 * Deriva un resultado placeholder a partir del patrón del RFC.
 *
 * STUB — la lógica NO tiene valor jurídico: sólo produce, de forma determinista,
 * una mezcla de resultados (la mayoría AL_CORRIENTE, con alguna ALERTA y algún
 * INHABILITADO_PRESUNTO) para demostrar el flujo end-to-end. En producción esto
 * se reemplaza por la consulta real a cada fuente.
 */
function resultadoPlaceholder(
  rfc: string,
  fuente: FuenteVerificacion,
): ResultadoVerificacion {
  const normalizado = rfc.trim().toUpperCase();

  // Placeholder por patrón del RFC — determinista y sólo demostrativo.
  // 32-D: si el RFC contiene "NEG" simulamos opinión negativa (ALERTA).
  if (fuente === "OPINION_32D" && normalizado.includes("NEG")) {
    return "ALERTA";
  }
  // 69-B: si el RFC contiene "EFOS" simulamos presunto EFOS (INHABILITADO_PRESUNTO).
  if (fuente === "ART_69B" && normalizado.includes("EFOS")) {
    return "INHABILITADO_PRESUNTO";
  }
  // CSD: si el RFC contiene "CSD" simulamos sello restringido (ALERTA).
  if (fuente === "CSD_17H" && normalizado.includes("CSD")) {
    return "ALERTA";
  }
  // 49 Bis: verificación documental en curso por abogado (reforma CFF 2026) →
  // por defecto sin dato disponible hasta la integración real.
  if (fuente === "ART_49BIS") {
    return "NO_DISPONIBLE";
  }
  // Resto: al corriente (caso esperado de un cliente en regla).
  return "AL_CORRIENTE";
}

/**
 * Verifica el cumplimiento fiscal de un cliente/proveedor contra TODAS las
 * fuentes de `FuenteVerificacion`, devolviendo un `ResultadoFuente` por cada
 * una (mismo orden que `FUENTES_VERIFICACION`).
 *
 * **STUB:** no consulta fuentes externas; la integración real SAT/DOF/opinión
 * 32-D es posterior. Cada resultado incluye un snapshot fechado (SHA-256 de un
 * payload canónico con la fecha de consulta) para dejar huella reproducible.
 *
 * @param entrada - `{ rfc }` del cliente/proveedor.
 * @param ahora - Momento de consulta (inyectable para pruebas). Por defecto `new Date()`.
 */
export function verificarCumplimiento(
  entrada: EntradaVerificacion,
  ahora: Date = new Date(),
): ResultadoFuente[] {
  const rfc = entrada.rfc.trim().toUpperCase();
  const consultadoEn = ahora.toISOString();

  return FUENTES_VERIFICACION.map((fuente): ResultadoFuente => {
    const resultado = resultadoPlaceholder(rfc, fuente);

    // Payload canónico y fechado del snapshot. STUB: en producción sería el
    // contenido real de la fuente (listado SAT/DOF, respuesta de la opinión, etc.).
    const payload = JSON.stringify({
      version: "stub-1",
      rfc,
      fuente,
      resultado,
      consultadoEn,
    });
    const snapshotSha256 = sha256(payload);

    const detalle =
      `STUB (sin fuente externa): ${ETIQUETA_FUENTE[fuente]} → ` +
      `${resultado} para RFC ${rfc}. Integración real SAT/DOF/32-D pendiente.`;

    return { fuente, resultado, detalle, snapshotSha256, consultadoEn };
  });
}
