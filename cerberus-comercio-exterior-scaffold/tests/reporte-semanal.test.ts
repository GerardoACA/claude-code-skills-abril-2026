// CERBERUS COMERCIO EXTERIOR — pruebas del reporte semanal ejecutivo (Inc 42). NO es SIDF.
// Solo la función PURA componerTextoReporte: sin base de datos, sin red.

import { describe, it, expect } from "vitest";
import { componerTextoReporte, type DatosReporteTenant } from "@/lib/reporte-semanal";

/** Fabrica datos del reporte con valores por defecto "todo en orden". */
function datos(parcial: Partial<DatosReporteTenant> = {}): DatosReporteTenant {
  return {
    totalClientes: 12,
    clientesConProblemas: 0,
    alertasVigia7d: 0,
    vencidos: 0,
    porVencer: 0,
    operaciones7d: 3,
    ...parcial,
  };
}

describe("componerTextoReporte", () => {
  it("sin problemas → encabezado, '✅ Todo en orden' y los conteos", () => {
    const texto = componerTextoReporte(datos());
    expect(texto).toContain("🐺 CERBERUS — Reporte semanal");
    expect(texto).toContain("✅");
    expect(texto).toContain("Todo en orden");
    expect(texto).not.toContain("⚠️");
    expect(texto).toContain("12 en total");
    expect(texto).toContain("0 con problemas de cumplimiento");
    expect(texto).toContain("Operaciones nuevas (7 días): 3");
  });

  it("con clientes en rojo → '⚠️ Requiere atención'", () => {
    const texto = componerTextoReporte(datos({ clientesConProblemas: 2 }));
    expect(texto).toContain("⚠️");
    expect(texto).toContain("Requiere atención");
    expect(texto).not.toContain("✅");
  });

  it("con alertas del vigía → '⚠️ Requiere atención'", () => {
    const texto = componerTextoReporte(datos({ alertasVigia7d: 5 }));
    expect(texto).toContain("⚠️");
    expect(texto).toContain("Alertas del vigía (7 días): 5");
  });

  it("con vencidos → '⚠️ Requiere atención'", () => {
    const texto = componerTextoReporte(datos({ vencidos: 1, porVencer: 4 }));
    expect(texto).toContain("⚠️");
    expect(texto).toContain("1 vencido(s)");
    expect(texto).toContain("4 por vencer");
  });

  it("los números aparecen en el texto", () => {
    const texto = componerTextoReporte(
      datos({
        totalClientes: 7,
        clientesConProblemas: 2,
        alertasVigia7d: 9,
        vencidos: 3,
        porVencer: 11,
        operaciones7d: 5,
      }),
    );
    expect(texto).toContain("7 en total");
    expect(texto).toContain("2 con problemas de cumplimiento");
    expect(texto).toContain("Alertas del vigía (7 días): 9");
    expect(texto).toContain("3 vencido(s)");
    expect(texto).toContain("11 por vencer");
    expect(texto).toContain("Operaciones nuevas (7 días): 5");
  });

  it("0 clientes → texto coherente sin NaN ni undefined", () => {
    const texto = componerTextoReporte(
      datos({ totalClientes: 0, clientesConProblemas: 0, operaciones7d: 0 }),
    );
    expect(texto).toContain("🐺 CERBERUS — Reporte semanal");
    expect(texto).toContain("✅");
    expect(texto).toContain("0 en total");
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("NaN");
  });
});
