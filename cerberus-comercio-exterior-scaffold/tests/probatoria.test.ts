// CERBERUS COMERCIO EXTERIOR — pruebas capa probatoria. NO es SIDF.

import { describe, it, expect } from "vitest";

import {
  sha256,
  verifyHash,
  isSha256Hex,
  SHA256_HEX_LENGTH,
} from "@/lib/probatoria/hash";
import {
  GENESIS_SELLO,
  canonicalizar,
  construirCadena,
  verificarCadena,
  appendRegistro,
} from "@/lib/probatoria/hash-chain";
import {
  SelladorNoOp,
  SelladorPscTsa,
  EstadoProbatorio,
  type ProveedorPscTsa,
} from "@/lib/probatoria/sellador-calificado";
import {
  armarExporteProbatorio,
  verificarExporte,
  type RegistroProbatorio,
} from "@/lib/probatoria/exporte-probatorio";

describe("hash (SHA-256)", () => {
  it("es determinista y produce hex de 64 chars", () => {
    const a = sha256("cerberus");
    const b = sha256("cerberus");
    expect(a).toBe(b);
    expect(a).toHaveLength(SHA256_HEX_LENGTH);
    expect(isSha256Hex(a)).toBe(true);
  });

  it("coincide con el vector conocido de la cadena vacía", () => {
    // SHA-256("") es un vector estándar y verificable por un perito.
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("cambia ante la mínima variación de entrada", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("verifyHash acepta el hash correcto y rechaza el incorrecto", () => {
    const h = sha256("operacion-0001");
    expect(verifyHash("operacion-0001", h)).toBe(true);
    expect(verifyHash("operacion-0002", h)).toBe(false);
  });

  it("verifyHash rechaza un hash mal formado sin lanzar", () => {
    expect(verifyHash("x", "no-es-un-hash")).toBe(false);
  });
});

describe("canonicalizar (JSON determinista)", () => {
  it("ordena claves para que el orden de inserción no afecte el hash", () => {
    const c1 = canonicalizar({ b: 1, a: 2, c: { z: 1, a: 2 } });
    const c2 = canonicalizar({ c: { a: 2, z: 1 }, a: 2, b: 1 });
    expect(c1).toBe(c2);
    expect(sha256(c1)).toBe(sha256(c2));
  });
});

describe("hash-chain (append-only)", () => {
  const payloads = [
    { evento: "DOCUMENTO_RECIBIDO", id: "DOC-1" },
    { evento: "VALIDACION_OK", id: "DOC-1" },
    { evento: "DOSSIER_SELLADO", op: "OP-1" },
  ];

  it("encadena desde el génesis", () => {
    const cadena = construirCadena(payloads);
    expect(cadena[0].hashPrev).toBe(GENESIS_SELLO);
    expect(cadena[1].hashPrev).toBe(cadena[0].selloRegistro);
    expect(cadena[2].hashPrev).toBe(cadena[1].selloRegistro);
  });

  it("una cadena íntegra se verifica como válida", () => {
    const cadena = construirCadena(payloads);
    expect(verificarCadena(cadena).valida).toBe(true);
    expect(verificarCadena(cadena, payloads).valida).toBe(true);
  });

  it("detecta manipulación de un registro intermedio (re-sellado)", () => {
    const cadena = construirCadena(payloads);
    // El atacante altera el payload del registro 1 y recalcula SU sello para
    // intentar pasar como válido, sin tocar los siguientes.
    const payloadAlterado = { evento: "VALIDACION_OK", id: "DOC-FALSO" };
    const reSellado = appendRegistro(cadena[1].hashPrev, payloadAlterado, 1);
    const manipulada = [...cadena];
    manipulada[1] = reSellado;

    // Estructuralmente, el siguiente eslabón ya no encadena.
    const r = verificarCadena(manipulada);
    expect(r.valida).toBe(false);
    expect(r.indiceRoto).toBe(2);
  });

  it("detecta manipulación de contenido cuando se proveen los payloads", () => {
    const cadena = construirCadena(payloads);
    const payloadsAlterados = [...payloads];
    payloadsAlterados[0] = { evento: "DOCUMENTO_RECIBIDO", id: "DOC-FALSO" };
    const r = verificarCadena(cadena, payloadsAlterados);
    expect(r.valida).toBe(false);
    expect(r.indiceRoto).toBe(0);
    expect(r.motivo).toMatch(/payload manipulado/);
  });
});

describe("SelladorCalificado", () => {
  it("NoOp devuelve EVIDENCIA_PRELIMINAR", async () => {
    const sellador = new SelladorNoOp();
    const r = await sellador.sellar(sha256("artefacto"));
    expect(r.estado).toBe(EstadoProbatorio.EVIDENCIA_PRELIMINAR);
    expect(r.tsaToken).toBeUndefined();
    expect(r.nom151).toBeUndefined();
  });

  it("NoOp rechaza un hash inválido", async () => {
    const sellador = new SelladorNoOp();
    await expect(sellador.sellar("no-es-hash")).rejects.toThrow();
  });

  it("PSC_TSA sin proveedor se degrada a PRELIMINAR (no finge oponibilidad)", async () => {
    const sellador = new SelladorPscTsa();
    const r = await sellador.sellar(sha256("artefacto"));
    expect(r.estado).toBe(EstadoProbatorio.EVIDENCIA_PRELIMINAR);
  });

  it("PSC_TSA con proveedor eleva a PRUEBA_OPONIBLE con TSA + NOM-151", async () => {
    const proveedor: ProveedorPscTsa = {
      async obtenerTsaToken(hash) {
        return {
          tokenBase64: Buffer.from(`tsa:${hash}`).toString("base64"),
          selladoEn: "2026-06-30T00:00:00.000Z",
          autoridad: "PSC-DEMO",
          algoritmo: "SHA-256",
        };
      },
      async obtenerConstanciaNom151(hash) {
        return {
          folio: `NOM151-${hash.slice(0, 8)}`,
          psc: "PSC-DEMO",
          emitidaEn: "2026-06-30T00:00:00.000Z",
        };
      },
    };
    const sellador = new SelladorPscTsa(proveedor);
    const r = await sellador.sellar(sha256("artefacto"));
    expect(r.estado).toBe(EstadoProbatorio.PRUEBA_OPONIBLE);
    expect(r.tsaToken?.algoritmo).toBe("SHA-256");
    expect(r.nom151?.psc).toBe("PSC-DEMO");
  });
});

describe("exporte probatorio", () => {
  function construirRegistros(): RegistroProbatorio[] {
    const payloads = [
      { evento: "DOCUMENTO_RECIBIDO", id: "DOC-1" },
      { evento: "DOSSIER_SELLADO", op: "OP-1" },
    ];
    const cadena = construirCadena(payloads);
    return cadena.map((eslabon, i) => ({
      eslabon,
      payloadCanonico: canonicalizar(payloads[i]),
    }));
  }

  it("produce un paquete autovalidable y con sello de paquete", () => {
    const paquete = armarExporteProbatorio({
      tenantId: "tenant-1",
      expediente: "OP-1",
      registros: construirRegistros(),
    });
    expect(isSha256Hex(paquete.selloPaquete)).toBe(true);
    expect(paquete.manualVerificacion).toContain("MANUAL DE VERIFICACIÓN");
    expect(paquete.resumen.estadoGlobal).toBe(
      EstadoProbatorio.EVIDENCIA_PRELIMINAR,
    );

    const v = verificarExporte(paquete);
    expect(v.valida).toBe(true);
    expect(v.selloPaqueteOk).toBe(true);
  });

  it("detecta alteración del paquete tras su emisión", () => {
    const paquete = armarExporteProbatorio({
      tenantId: "tenant-1",
      expediente: "OP-1",
      registros: construirRegistros(),
    });
    const alterado = { ...paquete, expediente: "OP-FALSIFICADO" };
    const v = verificarExporte(alterado);
    expect(v.valida).toBe(false);
    expect(v.selloPaqueteOk).toBe(false);
  });
});
