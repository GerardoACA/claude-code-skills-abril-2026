// CERBERUS COMERCIO EXTERIOR — mapeo de datos de CSF al form de alta de cliente. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/prefill-cliente.ts  (Incremento 46)
// Propósito: Lógica PURA que convierte los datos extraídos de la Constancia de
//            Situación Fiscal (respuesta de POST /api/clientes/prefill) en los
//            valores del formulario de alta (rfc, razonSocial, domicilio) y en
//            las ADVERTENCIAS de campos que el PDF no trajo. Sin red ni React:
//            se prueba en vitest sin montar el componente.
//
// Principio de captura asistida (C9): el prellenado SUGIERE, nunca impone; el
// capturista revisa y corrige antes de enviar. Los campos no detectados se
// dejan vacíos y se avisa para que se capturen a mano.
// =============================================================================

/** Datos que devuelve POST /api/clientes/prefill dentro de `datos`. */
export interface DatosPrefillCliente {
  rfc: string | null;
  razonSocial: string | null;
  domicilio: string | null;
  regimen: string | null;
  actividad: string | null;
}

/** Resultado del mapeo: valores para el form + banderas de precargado + avisos. */
export interface ResultadoPrefillCliente {
  valores: {
    rfc: string;
    razonSocial: string;
    domicilioOperacionesCE: string;
  };
  /** true si el campo vino del documento (para pintarlo como precargado). */
  precargados: {
    rfc: boolean;
    razonSocial: boolean;
    domicilioOperacionesCE: boolean;
  };
  /** Avisos legibles: campos que el PDF no trajo y hay que capturar a mano. */
  advertencias: string[];
}

/**
 * Mapea los datos extraídos de la CSF a los campos del alta de cliente.
 * Campo null => valor vacío + advertencia (el capturista lo teclea).
 * Régimen y actividad NO tienen campo en el alta: se capturan después en el
 * expediente KYC (donde el prefill KYC los vuelve a ofrecer).
 */
export function mapearPrefillCliente(datos: DatosPrefillCliente): ResultadoPrefillCliente {
  const advertencias: string[] = [];
  if (datos.rfc === null) {
    advertencias.push("El PDF no trajo el RFC: captúralo a mano.");
  }
  if (datos.razonSocial === null) {
    advertencias.push("El PDF no trajo la razón social: captúrala a mano.");
  }
  if (datos.domicilio === null) {
    advertencias.push("El PDF no trajo el domicilio: puedes capturarlo a mano (es opcional).");
  }

  return {
    valores: {
      rfc: datos.rfc ?? "",
      razonSocial: datos.razonSocial ?? "",
      domicilioOperacionesCE: datos.domicilio ?? "",
    },
    precargados: {
      rfc: datos.rfc !== null,
      razonSocial: datos.razonSocial !== null,
      domicilioOperacionesCE: datos.domicilio !== null,
    },
    advertencias,
  };
}
