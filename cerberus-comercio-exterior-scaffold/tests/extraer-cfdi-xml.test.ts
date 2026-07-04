// CERBERUS COMERCIO EXTERIOR — pruebas de extracción desde XML CFDI 4.0. NO es SIDF.
// =============================================================================
// Archivo:  tests/extraer-cfdi-xml.test.ts  (Incremento 45)
// Propósito: Verificar que extraerDatosCfdiXml (función pura, sin dependencias)
//            extrae RFCs, comprobante (Total/Moneda/TipoCambio), conceptos y el
//            complemento Carta Porte de un XML CFDI 4.0; que tolera comillas
//            simples; y que con basura devuelve objeto vacío + advertencias SIN
//            lanzar (C9: el prellenado asiste, nunca bloquea).
// =============================================================================

import { describe, it, expect } from "vitest";
import { extraerDatosCfdiXml } from "@/lib/extraer-cfdi-xml";

// XML CFDI 4.0 mínimo (ingreso, exportación) construido para la prueba.
const XML_CFDI_INGRESO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  TipoDeComprobante="I" Total="12500.00" Moneda="USD" TipoCambio="17.25"
  LugarExpedicion="64000">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EXPORTADORA MX SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="ACME CORP" UsoCFDI="S01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101800" NoIdentificacion="SKU-001"
      Descripcion="Refacciones industriales" Cantidad="10" ClaveUnidad="H87"
      ValorUnitario="1250.00" Importe="12500.00"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

// XML CFDI 4.0 de traslado CON complemento Carta Porte 3.1 (estructura real:
// CodigoPostal vive en el Domicilio hijo de cada Ubicacion; la placa en
// IdentificacionVehicular dentro de Autotransporte).
const XML_CFDI_CARTA_PORTE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31"
  Version="4.0" TipoDeComprobante="T" Total="0" Moneda="XXX">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="TRANSPORTES MX"/>
  <cfdi:Receptor Rfc="BBB020202BBB" Nombre="CLIENTE SA"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101800" Descripcion="Servicio de traslado"
      Cantidad="1" ClaveUnidad="E48"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <cartaporte31:CartaPorte Version="3.1" TranspInternac="No">
      <cartaporte31:Ubicaciones>
        <cartaporte31:Ubicacion TipoUbicacion="Origen"
          FechaHoraSalidaLlegada="2026-07-01T08:00:00">
          <cartaporte31:Domicilio CodigoPostal="64000" Estado="NLE" Pais="MEX"/>
        </cartaporte31:Ubicacion>
        <cartaporte31:Ubicacion TipoUbicacion="Destino" DistanciaRecorrida="225"
          FechaHoraSalidaLlegada="2026-07-01T12:30:00">
          <cartaporte31:Domicilio CodigoPostal="88000" Estado="TAM" Pais="MEX"/>
        </cartaporte31:Ubicacion>
      </cartaporte31:Ubicaciones>
      <cartaporte31:Mercancias PesoBrutoTotal="1250.50" UnidadPeso="KGM" NumTotalMercancias="1">
        <cartaporte31:Mercancia BienesTransp="78101800"
          Descripcion="Refacciones industriales" Cantidad="10" ClaveUnidad="H87"
          PesoEnKg="1250.5"/>
        <cartaporte31:Autotransporte PermSCT="TPAF01" NumPermisoSCT="123456">
          <cartaporte31:IdentificacionVehicular ConfigVehicular="C2"
            PlacaVM="ABC1234" AnioModeloVM="2020"/>
        </cartaporte31:Autotransporte>
      </cartaporte31:Mercancias>
    </cartaporte31:CartaPorte>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// Mismo comprobante mínimo pero con COMILLAS SIMPLES en los atributos.
const XML_COMILLAS_SIMPLES = `<cfdi:Comprobante xmlns:cfdi='http://www.sat.gob.mx/cfd/4'
  Version='4.0' Total='100.00' Moneda='MXN'>
  <cfdi:Emisor Rfc='AAA010101AAA'/>
  <cfdi:Receptor Rfc='BBB020202BBB'/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ='01010101' Descripcion='Prueba' Cantidad='2'
      ClaveUnidad='H87' ValorUnitario='50.00' Importe='100.00'/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

describe("extraerDatosCfdiXml", () => {
  it("extrae RFC emisor y receptor del CFDI 4.0", () => {
    const d = extraerDatosCfdiXml(XML_CFDI_INGRESO);
    expect(d.emisorRfc).toBe("AAA010101AAA");
    expect(d.receptorRfc).toBe("XEXX010101000");
  });

  it("extrae el primer concepto completo", () => {
    const d = extraerDatosCfdiXml(XML_CFDI_INGRESO);
    expect(d.conceptos).toHaveLength(1);
    const c = d.conceptos[0];
    expect(c?.claveProdServ).toBe("78101800");
    expect(c?.noIdentificacion).toBe("SKU-001");
    expect(c?.descripcion).toBe("Refacciones industriales");
    expect(c?.cantidad).toBe(10);
    expect(c?.claveUnidad).toBe("H87");
    expect(c?.valorUnitario).toBe(1250);
    expect(c?.importe).toBe(12500);
  });

  it("extrae Total, Moneda y TipoCambio del Comprobante", () => {
    const d = extraerDatosCfdiXml(XML_CFDI_INGRESO);
    expect(d.total).toBe(12500);
    expect(d.moneda).toBe("USD");
    expect(d.tipoCambio).toBe(17.25);
  });

  it("con complemento Carta Porte extrae CP origen/destino, fechas, placa y peso", () => {
    const d = extraerDatosCfdiXml(XML_CFDI_CARTA_PORTE);
    expect(d.cartaPorte).toBeDefined();
    expect(d.cartaPorte?.origen?.codigoPostal).toBe("64000");
    expect(d.cartaPorte?.origen?.fechaHora).toBe("2026-07-01T08:00:00");
    expect(d.cartaPorte?.destino?.codigoPostal).toBe("88000");
    expect(d.cartaPorte?.destino?.fechaHora).toBe("2026-07-01T12:30:00");
    expect(d.cartaPorte?.placaVm).toBe("ABC1234");
    expect(d.cartaPorte?.configVehicular).toBe("C2");
    expect(d.cartaPorte?.pesoEnKg).toBe(1250.5);
  });

  it("XML basura: objeto vacío con advertencias, SIN lanzar", () => {
    const d = extraerDatosCfdiXml("esto no es un xml de cfdi { basura ]]] <>");
    expect(d.emisorRfc).toBeUndefined();
    expect(d.receptorRfc).toBeUndefined();
    expect(d.total).toBeUndefined();
    expect(d.conceptos).toHaveLength(0);
    expect(d.cartaPorte).toBeUndefined();
    expect(d.advertencias.length).toBeGreaterThan(0);
  });

  it("cadena vacía: advertencia sin lanzar", () => {
    const d = extraerDatosCfdiXml("   ");
    expect(d.conceptos).toHaveLength(0);
    expect(d.advertencias.length).toBeGreaterThan(0);
  });

  it("atributos con comillas simples también funcionan", () => {
    const d = extraerDatosCfdiXml(XML_COMILLAS_SIMPLES);
    expect(d.emisorRfc).toBe("AAA010101AAA");
    expect(d.receptorRfc).toBe("BBB020202BBB");
    expect(d.total).toBe(100);
    expect(d.moneda).toBe("MXN");
    expect(d.conceptos[0]?.cantidad).toBe(2);
    expect(d.conceptos[0]?.descripcion).toBe("Prueba");
  });
});
