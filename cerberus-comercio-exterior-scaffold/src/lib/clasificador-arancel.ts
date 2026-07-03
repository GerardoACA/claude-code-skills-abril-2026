// CERBERUS COMERCIO EXTERIOR — conector de clasificación arancelaria (TIGIE). NO es SIDF.
//
// Patrón de conector enchufable (como TimbradorPac / FirmadorEfirma / ConectorErp):
// interfaz estable + NoOp por defecto + factoría por entorno. Dada una FRACCIÓN
// arancelaria (8 dígitos TIGIE) + NICO, devuelve la TASA DE IGI ad valorem, la
// unidad de medida y las regulaciones/restricciones no arancelarias (permisos,
// NOMs, avisos). Con eso, src/lib/contribuciones.ts calcula IGI/DTA/IVA/IEPS.
//
// HOY NoOp honesto: NO conoce la TIGIE (es un catálogo enorme y cambiante); pide
// capturar la tasa a mano. La conexión real (base TIGIE del cliente, servicio de
// consulta, o tabla propia) se enchufa implementando `ClasificadorArancel` sin
// tocar rutas ni UI. Jamás inventa una tasa.

/** Regulación/restricción no arancelaria asociada a una fracción. */
export interface RegulacionArancel {
  readonly clave: string;
  readonly descripcion: string;
}

/** Datos arancelarios de una fracción TIGIE. */
export interface DatosFraccion {
  readonly fraccion: string;
  readonly nico: string | null;
  /** `true` si la fracción se resolvió contra una fuente real. */
  readonly resuelta: boolean;
  /** Tasa de IGI en porcentaje (null si no se pudo resolver). */
  readonly tasaIgiPct: number | null;
  /** Unidad de medida de la TIGIE (p. ej. "Kg", "Pza"). */
  readonly unidadTigie: string | null;
  readonly regulaciones: readonly RegulacionArancel[];
  readonly detalle: string;
}

export interface ConsultaFraccion {
  readonly fraccion: string;
  readonly nico?: string | null;
}

/** Contrato del clasificador arancelario (Strategy enchufable). */
export interface ClasificadorArancel {
  readonly id: string;
  clasificar(consulta: ConsultaFraccion): Promise<DatosFraccion>;
}

/** ¿Fracción arancelaria válida? 8 dígitos (TIGIE). */
export function esFraccionValida(fraccion: string): boolean {
  return /^\d{8}$/.test(fraccion.trim());
}

/**
 * Conector por defecto. No resuelve la fracción contra ninguna base: pide
 * capturar la tasa de IGI a mano. Comportamiento seguro mientras no haya
 * integración real; nunca inventa una tasa.
 */
export class ClasificadorNoOp implements ClasificadorArancel {
  readonly id = "NOOP";

  async clasificar(consulta: ConsultaFraccion): Promise<DatosFraccion> {
    return {
      fraccion: consulta.fraccion,
      nico: consulta.nico ?? null,
      resuelta: false,
      tasaIgiPct: null,
      unidadTigie: null,
      regulaciones: [],
      detalle:
        "Clasificador TIGIE no configurado. Captura la tasa de IGI de la fracción " +
        "manualmente; CERBERUS está listo para conectar la base arancelaria del " +
        "cliente o un servicio de consulta (variable ARANCEL_PROVIDER).",
    };
  }
}

export const clasificadorPorDefecto: ClasificadorArancel = new ClasificadorNoOp();

/**
 * Devuelve el clasificador activo según el entorno. HOY siempre NoOp.
 *
 * DESPUÉS: implementar `ClasificadorArancel` (base TIGIE del cliente, API de
 * consulta, o tabla propia) y devolverla cuando `ARANCEL_PROVIDER` la identifique.
 * Rutas y UI no cambian: solo consumen esta factoría.
 */
export function obtenerClasificador(): ClasificadorArancel {
  const provider = process.env.ARANCEL_PROVIDER?.trim();
  if (provider) {
    return clasificadorPorDefecto;
  }
  return clasificadorPorDefecto;
}
