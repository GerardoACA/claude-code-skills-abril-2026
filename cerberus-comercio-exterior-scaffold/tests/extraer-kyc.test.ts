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

const TXT_CSF = `Constancia de Situación Fiscal
idCIF: 12345678901
RFC: MPP171122QX4
Denominación/Razón Social: MILLENNIAL PRODUCTIVE PARK SA DE CV
Régimen: Régimen General de Ley Personas Morales
Nombre de la Vialidad: AV REFORMA
Número Exterior: 100
Nombre de la Colonia: JUAREZ
Código Postal: 06600
Municipio o Delegación: CUAUHTEMOC
Entidad Federativa: CIUDAD DE MEXICO
Actividad Económica: Comercio al por mayor de maquinaria`;

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
