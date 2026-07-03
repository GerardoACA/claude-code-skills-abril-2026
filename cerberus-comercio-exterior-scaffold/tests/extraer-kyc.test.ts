// CERBERUS COMERCIO EXTERIOR — pruebas de extracción KYC desde documentos. NO es SIDF.

import { describe, it, expect } from "vitest";
import { extraerDatosKyc } from "@/lib/extraer-kyc-doc";

const TXT_OPINION_SAT = `Opinión del cumplimiento de obligaciones fiscales
Nombre, denominación o razón social  Sentido
FUNDACION LO PODEMOS LOGRAR AC  POSITIVO
RFC  Folio
FLP151123IW8  26NB9079651`;

const TXT_OPINION_IMSS = `Opinión del Cumplimiento de Obligaciones Fiscales en materia de Seguridad Social
FECHA: 23 de julio de 2025  MILLENNIAL PRODUCTIVE PARK SA DE CV  MPP171122QX4
Cadena Original:
||Invocante:portalimssdigital|Folio:17532978445751455363986|RFC:MPP171122QX4|Nombre o Razon Social:MILLENNIAL PRODUCTIVE PARK SA DE CV|CURP:|Opinion:POSITIVA||`;

// Formato REAL de la Constancia de Situación Fiscal (texto aplanado por unpdf:
// etiqueta seguida del valor y de la siguiente etiqueta; actividad en tabla).
const TXT_CSF = `CONSTANCIA DE SITUACIÓN FISCAL idCIF: 15110473037
Datos de Identificación del Contribuyente: RFC: MPP171122QX4 Denominación/Razón Social: MILLENNIAL PRODUCTIVE PARK SA DE CV Régimen Capital: SOCIEDAD ANONIMA Nombre Comercial: MILLENNIAL Fecha inicio de operaciones: 22 DE NOVIEMBRE DE 2017 Estatus en el padrón: ACTIVO
Datos del domicilio registrado Código Postal: 06600 Tipo de Vialidad: AVENIDA Nombre de Vialidad: AV REFORMA Número Exterior: 100 Número Interior: Nombre de la Colonia: JUAREZ Nombre de la Localidad: CUAUHTEMOC Nombre del Municipio o Demarcación Territorial: CUAUHTEMOC Nombre de la Entidad Federativa: CIUDAD DE MEXICO Entre Calle: X Y Calle: Y
Actividades Económicas: Orden Actividad Económica Porcentaje Fecha Inicio Fecha Fin 1 Comercio al por mayor de maquinaria 100 22/11/2017
Regímenes: Régimen Fecha Inicio Fecha Fin Régimen General de Ley Personas Morales 01/01/2026`;

describe("extraerDatosKyc", () => {
  it("Opinión SAT: tipo, RFC y razón social limpia", () => {
    const d = extraerDatosKyc(TXT_OPINION_SAT);
    expect(d.tipoDocumento).toBe("OPINION_CUMPLIMIENTO");
    expect(d.rfc).toBe("FLP151123IW8");
    expect(d.razonSocial).toBe("FUNDACION LO PODEMOS LOGRAR AC");
  });

  it("Opinión IMSS: razón social desde la cadena (sin fecha pegada)", () => {
    const d = extraerDatosKyc(TXT_OPINION_IMSS);
    expect(d.rfc).toBe("MPP171122QX4");
    expect(d.razonSocial).toBe("MILLENNIAL PRODUCTIVE PARK SA DE CV");
  });

  it("Constancia de Situación Fiscal: régimen, actividad y domicilio", () => {
    const d = extraerDatosKyc(TXT_CSF);
    expect(d.tipoDocumento).toBe("CONSTANCIA_SITUACION_FISCAL");
    expect(d.rfc).toBe("MPP171122QX4");
    expect(d.razonSocial).toBe("MILLENNIAL PRODUCTIVE PARK SA DE CV");
    expect(d.regimen).toContain("General");
    expect(d.actividadEconomica).toContain("Comercio");
    expect(d.domicilio).toContain("REFORMA");
    expect(d.domicilio).toContain("06600");
  });

  it("Texto sin datos: todo null y tipo DESCONOCIDO", () => {
    const d = extraerDatosKyc("una nota cualquiera sin estructura fiscal.");
    expect(d.tipoDocumento).toBe("DESCONOCIDO");
    expect(d.razonSocial).toBeNull();
  });
});
