// CERBERUS COMERCIO EXTERIOR — pruebas del digest por destinatario (Inc 38). NO es SIDF.
// Solo la función PURA componerDigestes: sin red, sin mocks de Telegram/correo.

import { describe, it, expect } from "vitest";
import { componerDigestes, type DestinoEnvio } from "@/lib/despacho-notificaciones";
import { CATEGORIA_ETIQUETA } from "@/lib/notificaciones-catalogo";

/** Fabrica un destino con valores por defecto razonables. */
function destino(parcial: Partial<DestinoEnvio>): DestinoEnvio {
  return {
    destinatarioId: "d-1",
    nombre: "Carla CFO",
    cargo: "CFO",
    canal: "TELEGRAM",
    direccion: "111",
    categoria: "CUMPLIMIENTO",
    texto: "Aviso genérico.",
    ...parcial,
  };
}

describe("componerDigestes", () => {
  it("3 avisos de 2 categorías al mismo destinatario → 1 digest con 2 secciones en orden del catálogo", () => {
    const digestes = componerDigestes([
      // VIGENCIAS llega ANTES que CUMPLIMIENTO: el digest debe reordenar
      // según el catálogo (CUMPLIMIENTO va primero).
      destino({ categoria: "VIGENCIAS", texto: "Certificado por vencer." }),
      destino({ categoria: "CUMPLIMIENTO", texto: "Proveedor en lista 69-B." }),
      destino({ categoria: "VIGENCIAS", texto: "Opinión 32-D caduca en 5 días." }),
    ]);

    expect(digestes).toHaveLength(1);
    const d = digestes[0]!;
    expect(d.canal).toBe("TELEGRAM");
    expect(d.direccion).toBe("111");
    expect(d.nombre).toBe("Carla CFO");
    expect(d.texto).toContain("🐺 CERBERUS — Avisos para Carla CFO");
    expect(d.texto).toContain(`— ${CATEGORIA_ETIQUETA.CUMPLIMIENTO} —`);
    expect(d.texto).toContain(`— ${CATEGORIA_ETIQUETA.VIGENCIAS} —`);
    expect(d.texto).toContain("Proveedor en lista 69-B.");
    expect(d.texto).toContain("Certificado por vencer.");
    expect(d.texto).toContain("Opinión 32-D caduca en 5 días.");
    // Orden del catálogo: CUMPLIMIENTO antes que VIGENCIAS.
    expect(d.texto.indexOf(`— ${CATEGORIA_ETIQUETA.CUMPLIMIENTO} —`)).toBeLessThan(
      d.texto.indexOf(`— ${CATEGORIA_ETIQUETA.VIGENCIAS} —`),
    );
    // Cada aviso en su propia línea, bajo su sección.
    const lineas = d.texto.split("\n");
    expect(lineas).toContain("Proveedor en lista 69-B.");
    expect(lineas).toContain("Certificado por vencer.");
  });

  it("2 destinatarios distintos → 2 digestes", () => {
    const digestes = componerDigestes([
      destino({ direccion: "111", nombre: "Carla CFO", texto: "Aviso A." }),
      destino({ direccion: "222", nombre: "Óscar OCN", canal: "EMAIL", texto: "Aviso B." }),
    ]);
    expect(digestes).toHaveLength(2);
    const direcciones = digestes.map((d) => `${d.canal}:${d.direccion}`).sort();
    expect(direcciones).toEqual(["EMAIL:222", "TELEGRAM:111"]);
    const deOscar = digestes.find((d) => d.direccion === "222")!;
    expect(deOscar.texto).toContain("🐺 CERBERUS — Avisos para Óscar OCN");
    expect(deOscar.texto).toContain("Aviso B.");
    expect(deOscar.texto).not.toContain("Aviso A.");
  });

  it("texto duplicado al mismo destinatario → aparece una sola vez", () => {
    const digestes = componerDigestes([
      destino({ texto: "Proveedor en lista 69-B." }),
      destino({ texto: "Proveedor en lista 69-B." }),
      destino({ texto: "Otro aviso distinto." }),
    ]);
    expect(digestes).toHaveLength(1);
    const apariciones = digestes[0]!.texto.split("Proveedor en lista 69-B.").length - 1;
    expect(apariciones).toBe(1);
    expect(digestes[0]!.texto).toContain("Otro aviso distinto.");
  });

  it("categoría desconocida usa la clave cruda como etiqueta", () => {
    const digestes = componerDigestes([
      destino({ categoria: "INVENTADA_X", texto: "Aviso raro." }),
    ]);
    expect(digestes).toHaveLength(1);
    expect(digestes[0]!.texto).toContain("— INVENTADA_X —");
    expect(digestes[0]!.texto).toContain("Aviso raro.");
  });

  it("lista vacía → []", () => {
    expect(componerDigestes([])).toEqual([]);
  });
});
