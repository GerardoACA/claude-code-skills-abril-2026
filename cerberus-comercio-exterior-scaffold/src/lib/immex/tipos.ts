// CERBERUS COMERCIO EXTERIOR — contratos del módulo IMMEX (cotejo). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/tipos.ts  (Incremento 61 — CONTRATOS CONGELADOS)
// Propósito: Tipos compartidos entre los carriles del módulo IMMEX (motor PEPS,
//            ingesta/API, UI de saldos y vigía). Este módulo es el LIBRO DE
//            COTEJO de CERBERUS (decisión A4, diseño v2 §75): reconstruye
//            entradas/descargos de los pedimentos capturados, deriva saldos y
//            plazos y ALERTA (C9) — NO es el SACI oficial del cliente.
//            NO CAMBIAR firmas sin coordinar los cuatro carriles.
// =============================================================================

/** Entrada de importación temporal (pedimento tipo IN). */
export interface EntradaImmexInput {
  fraccion: string;
  nico?: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  valorAduana?: number;
  /** Pedimento que ampara la entrada (número 15 dígitos normalizable). */
  pedimentoNumero: string;
  clavePedimento: string;
  /** ISO 8601. R6: dato capturado; el plazo legal exacto lo confirma el abogado. */
  fechaLimiteRetorno: string;
  /** ISO 8601. R2 (regla de 48h): cuándo concluyó el despacho. */
  despachoConcluidoEn?: string;
}

/** Descargo (retorno/exportación o cambio de régimen; pedimento tipo RT…). */
export interface DescargoImmexInput {
  fraccion: string;
  nico?: string;
  cantidad: number;
  pedimentoNumero: string;
  clavePedimento: string;
  despachoConcluidoEn?: string;
}

/** Vista mínima de un movimiento persistido, para el motor PEPS (sin Prisma). */
export interface MovimientoLite {
  id: string;
  tipo: "ENTRADA" | "DESCARGO" | "AJUSTE";
  cantidad: number;
  /** ISO 8601 (orden PEPS = por registradoEn ascendente). */
  registradoEn: string;
  fechaLimiteRetorno: string | null;
  pedimentoNumero: string | null;
  /** En DESCARGO: id de la ENTRADA consumida (si ya se aplicó PEPS). */
  entradaOrigenId: string | null;
  descripcion?: string;
  fraccion?: string;
}

/** Proyección de saldos, forma-compatible con SaldoImmex del conector ERP. */
export interface SaldoDerivado {
  fraccion: string;
  descripcion: string;
  pedimentoImportacion: string;
  cantidadImportada: number;
  cantidadDescargada: number;
  saldoPendiente: number;
  /** ISO 8601. */
  fechaLimiteRetorno: string;
}

/** Alerta producida por el barrido IMMEX del vigía (consumida por carril D). */
export interface AlertaImmex {
  clienteId: string;
  tipo: "PLAZO_RETORNO" | "REGLA_48H" | "SALDO_NO_RETORNADO";
  severidad: "ALTA" | "MEDIA";
  referencia: string;
  contexto: string;
  venceIso: string | null;
  diasRestantes: number | null;
}

/** Resultado de aplicar un descargo PEPS contra las entradas con saldo. */
export interface ResultadoDescargoPeps {
  /** Consumos por entrada (más antigua primero). */
  consumos: { entradaId: string; cantidad: number }[];
  /** Cantidad que NO alcanzó saldo (0 si el descargo cupo completo). C9: se
   *  registra y se alerta, nunca se rechaza. */
  faltante: number;
}

/** Evaluación de la regla de las 48 horas (Anexo 24). */
export interface ResultadoRegla48h {
  horas: number;
  incumple: boolean;
}
