// CERBERUS COMERCIO EXTERIOR — conector ERP / control de inventarios IMMEX (Anexo 24/31). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/conector-erp.ts
// Propósito: dejar "listo para conectar" la lectura del ERP o sistema de control
//   de inventarios IMMEX del cliente, vía un CONECTOR enchufable con el MISMO
//   patrón de TimbradorPac (src/lib/timbrador-pac.ts), FirmadorEfirma
//   (src/lib/firmador-efirma.ts) y AlmacenWorm (src/lib/almacen-worm.ts):
//   interfaz estable + implementación NoOp por defecto + factoría que decide por
//   entorno. HOY no hay integración real: el conector responde HONESTAMENTE que
//   no está configurado (NoOp); jamás finge saldos.
//
// ¿PARA QUÉ SE NECESITA? — RÉGIMEN IMMEX
//   IMMEX (Industria Manufacturera, Maquiladora y de Servicios de Exportación)
//   permite IMPORTAR TEMPORALMENTE insumos, materias primas y componentes SIN
//   pagar IVA/IGI, a condición de RETORNAR (exportar) o DESCARGAR esas
//   mercancías dentro de los plazos legales. Para probar ese cumplimiento, la
//   empresa está obligada a llevar:
//     - ANEXO 24: control de inventarios automatizado (entradas, salidas,
//       existencias, valor, correspondencia con pedimentos).
//     - ANEXO 31: control de SALDOS de mercancías de importación temporal
//       (sistema que reporta a la autoridad los saldos vivos por pedimento).
//   El SAT/ANAM CRUZAN los pedimentos de importación temporal contra estos
//   saldos y descargos. Una DISCREPANCIA (mercancía importada temporalmente que
//   no se retornó ni descargó a tiempo) genera CRÉDITOS FISCALES (IVA/IGI +
//   recargos) y es un supuesto típico de FISCALIZACIÓN.
//
// ¿QUÉ HARÁ CERBERUS CON ESTO? — PRINCIPIO C9 (ALERTA, NO BLOQUEA)
//   A futuro, CERBERUS leerá del ERP/sistema de inventarios IMMEX del cliente
//   los SALDOS por pedimento (cantidad importada, cantidad descargada, saldo
//   pendiente, fecha límite de retorno) para VERIFICAR CONSISTENCIA DOCUMENTAL
//   frente a la evidencia de la operación y ALERTAR de riesgos (saldo próximo a
//   vencer, mercancía sin descargo, inconsistencia de fracción). CERBERUS NO
//   bloquea ni corrige el ERP del cliente: solo LEE, coteja y ALERTA (C9).
//
// ¿POR QUÉ AGNÓSTICO DE PROVEEDOR? — LO CLAVE ES ESTAR LISTOS PARA CUALQUIER ERP
//   Cada cliente usa un ERP/sistema distinto: SAP, Oracle, Softtek/TradeLink,
//   sistemas de agentes aduanales, desarrollos propios o incluso hojas de
//   cálculo. Por eso el conector es AGNÓSTICO: una interfaz ESTABLE
//   (`ConectorErp`) y ADAPTADORES POR PROVEEDOR seleccionados por la variable de
//   entorno `ERP_PROVIDER`. Conectar un ERP concreto NO debe tocar rutas ni UI:
//   basta implementar `ConectorErp` para ese proveedor y enchufarlo en la
//   factoría. La clave del diseño es precisamente estar listos para conectarse a
//   CUALQUIER ERP del cliente.
// =============================================================================

// ============================================================================
// Tipos
// ============================================================================

/**
 * Saldo de una mercancía de importación temporal bajo IMMEX, normalizado al
 * modelo de CERBERUS (Anexo 24/31). Cada adaptador de proveedor debe MAPEAR los
 * campos de su ERP a esta forma estable: así el resto del sistema no depende del
 * ERP concreto.
 */
export interface SaldoImmex {
  /** Fracción arancelaria (TIGIE) de la mercancía. */
  readonly fraccion: string;
  /** Descripción de la mercancía. */
  readonly descripcion: string;
  /** Pedimento de importación temporal que amparó la entrada. */
  readonly pedimentoImportacion: string;
  /** Cantidad importada temporalmente (unidades de medida del pedimento). */
  readonly cantidadImportada: number;
  /** Cantidad ya descargada (retornada, transferida o cambiada de régimen). */
  readonly cantidadDescargada: number;
  /** Saldo pendiente de retorno/descargo (importada − descargada). */
  readonly saldoPendiente: number;
  /** Fecha límite de retorno/descargo en formato ISO 8601. */
  readonly fechaLimiteRetorno: string;
}

/** Parámetros de una consulta de saldos al ERP/inventario IMMEX del cliente. */
export interface ConsultaErp {
  /** RFC del cliente (tenant) cuyo control de inventarios IMMEX se consulta. */
  readonly rfcCliente: string;
}

/** Resultado de una consulta de saldos IMMEX al ERP del cliente. */
export interface ResultadoConsultaErp {
  /** `true` solo si el conector real respondió con datos (nunca en NoOp). */
  readonly ok: boolean;
  /** Proveedor/adaptador que atendió la consulta ("NINGUNO" en NoOp). */
  readonly proveedor: string;
  /** `true` si hay una integración de ERP activa y disponible. */
  readonly disponible: boolean;
  /** Detalle legible del resultado (se registra en bitácora / se muestra). */
  readonly detalle: string;
  /** Saldos IMMEX normalizados; vacío mientras no haya conexión real. */
  readonly saldos: SaldoImmex[];
}

/**
 * Contrato del conector de ERP/inventario IMMEX. Permite pasar del NoOp al ERP
 * real del cliente (SAP, Oracle, REST genérico, etc.) SIN tocar rutas ni UI
 * (Strategy enchufable, como TimbradorPac / FirmadorEfirma / AlmacenWorm).
 */
export interface ConectorErp {
  /** Identificador estable del conector (aparece en detalle / bitácora). */
  readonly id: string;
  /**
   * Lee del ERP/inventario IMMEX del cliente los saldos por pedimento de
   * importación temporal. NUNCA debe lanzar por condiciones esperables (sin
   * configuración, sin red): reporta vía ResultadoConsultaErp.
   */
  obtenerSaldosImmex(consulta: ConsultaErp): Promise<ResultadoConsultaErp>;
}

// ============================================================================
// Implementación NoOp (default mientras no se conecte el ERP del cliente)
// ============================================================================

/**
 * Conector por defecto. NO contacta a ningún ERP: responde HONESTAMENTE que no
 * hay integración configurada. CERBERUS queda listo para conectarse al ERP o
 * sistema de control de inventarios IMMEX (Anexo 24/31) del cliente vía
 * adaptador por proveedor; hoy no hay integración activa y por eso NO se finge
 * ningún saldo. Comportamiento seguro mientras la conexión real no esté hecha.
 */
export class ConectorErpNoOp implements ConectorErp {
  readonly id = "NOOP";

  async obtenerSaldosImmex(
    consulta: ConsultaErp,
  ): Promise<ResultadoConsultaErp> {
    void consulta;
    return {
      ok: false,
      proveedor: "NINGUNO",
      disponible: false,
      saldos: [],
      detalle:
        "Conector ERP/IMMEX no configurado. CERBERUS está listo para " +
        "conectarse al ERP o sistema de control de inventarios IMMEX (Anexo " +
        "24/31) del cliente vía adaptador por proveedor; hoy no hay " +
        "integración activa.",
    };
  }
}

// ============================================================================
// Factoría
// ============================================================================

/** Conector por defecto del sistema mientras no se conecte el ERP real. */
export const conectorErpPorDefecto: ConectorErp = new ConectorErpNoOp();

/**
 * Devuelve el conector de ERP/inventario IMMEX activo según el entorno.
 *
 * HOY: siempre `ConectorErpNoOp` — el gancho está presente pero NO hay
 * implementación real todavía; se degrada de forma segura a NoOp en lugar de
 * fingir saldos.
 *
 * DESPUÉS (dónde se enchufa el ERP real): como cada cliente puede tener un ERP
 * DISTINTO, se implementa un ADAPTADOR POR PROVEEDOR (una clase
 * `implements ConectorErp` que traduce la API/consulta del ERP concreto y MAPEA
 * sus campos al tipo `SaldoImmex`) y se devuelve aquí cuando `ERP_PROVIDER`
 * identifique al proveedor, p. ej.:
 *
 *   switch (process.env.ERP_PROVIDER) {
 *     case "SAP":
 *       // Adaptador para SAP (p. ej. OData/RFC/BAPI del módulo de comercio
 *       // exterior GTS): return new ConectorErpSap({ ... });
 *     case "ORACLE":
 *       // Adaptador para Oracle EBS/Fusion (REST/SOAP):
 *       // return new ConectorErpOracle({ ... });
 *     case "REST":
 *       // Adaptador genérico contra un endpoint REST del cliente (o de su
 *       // sistema Anexo 31): return new ConectorErpGenericoRest({
 *       //   baseUrl: process.env.ERP_BASE_URL!,
 *       //   apiKey: process.env.ERP_API_KEY!,
 *       // });
 *     default:
 *       return conectorErpPorDefecto;
 *   }
 *
 * Rutas y UI no cambian: solo consumen esta factoría.
 */
export function obtenerConectorErp(): ConectorErp {
  const provider = process.env.ERP_PROVIDER?.trim();
  if (provider) {
    // Gancho presente pero sin implementación real todavía: degradar de forma
    // segura a NoOp en lugar de fingir una consulta al ERP.
    return conectorErpPorDefecto;
  }
  return conectorErpPorDefecto;
}
