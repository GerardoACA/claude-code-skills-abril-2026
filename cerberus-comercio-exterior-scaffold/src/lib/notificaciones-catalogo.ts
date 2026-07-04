// CERBERUS COMERCIO EXTERIOR — catálogo de notificaciones. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/notificaciones-catalogo.ts  (Incremento 36)
// Propósito: Valores permitidos (y sus etiquetas legibles) para los
//            destinatarios de notificaciones: CATEGORÍAS de módulo, CANALES y
//            CARGOS. Se validan a nivel de aplicación (el schema guarda texto).
// =============================================================================

/** Categorías de aviso que produce el sistema (por módulo). */
export const CATEGORIAS = [
  "CUMPLIMIENTO",
  "VIGENCIAS",
  "OPINION_32D",
  "DESPACHO",
  "KYC",
  "SANCIONES",
  "REPORTE_SEMANAL",
] as const;
export type CategoriaNotificacion = (typeof CATEGORIAS)[number];

export const CATEGORIA_ETIQUETA: Readonly<Record<CategoriaNotificacion, string>> = {
  CUMPLIMIENTO: "Cumplimiento (69-B, verificación)",
  VIGENCIAS: "Vigencias y vencimientos",
  OPINION_32D: "Opinión de cumplimiento (32-D)",
  DESPACHO: "Despacho (operaciones, pedimentos)",
  KYC: "Expediente KYC 1.4.14",
  SANCIONES: "Sanciones internacionales",
  REPORTE_SEMANAL: "Reporte semanal ejecutivo",
};

/** Canales de envío soportados. TELEGRAM es real; EMAIL queda enchufable. */
export const CANALES = ["TELEGRAM", "EMAIL"] as const;
export type CanalNotificacion = (typeof CANALES)[number];

export const CANAL_ETIQUETA: Readonly<Record<CanalNotificacion, string>> = {
  TELEGRAM: "Telegram (chat id)",
  EMAIL: "Correo electrónico",
};

/** Cargos/roles típicos del cliente. */
export const CARGOS = ["CEO", "CFO", "OCN", "OPERACIONES", "LEGAL", "OTRO"] as const;
export type CargoActor = (typeof CARGOS)[number];

export const CARGO_ETIQUETA: Readonly<Record<CargoActor, string>> = {
  CEO: "Dirección general (CEO)",
  CFO: "Finanzas (CFO)",
  OCN: "Operador de comercio / OCN",
  OPERACIONES: "Operaciones",
  LEGAL: "Legal / cumplimiento",
  OTRO: "Otro",
};

export function esCategoria(v: string): v is CategoriaNotificacion {
  return (CATEGORIAS as readonly string[]).includes(v);
}
export function esCanal(v: string): v is CanalNotificacion {
  return (CANALES as readonly string[]).includes(v);
}
export function esCargo(v: string): v is CargoActor {
  return (CARGOS as readonly string[]).includes(v);
}
