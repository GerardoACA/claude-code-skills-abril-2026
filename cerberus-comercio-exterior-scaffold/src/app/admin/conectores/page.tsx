// CERBERUS COMERCIO EXTERIOR — panel de conectores enchufables (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/admin/conectores/page.tsx
// Propósito: página SOLO ADMIN que muestra el ESTADO de todos los conectores
//   enchufables del sistema (PAC de timbrado, e.firma, almacén WORM, ERP/IMMEX),
//   leyendo el `id` de cada factoría SIN ejecutar llamadas de red. Un conector
//   con id "NOOP" está "No configurado" (degradación honesta, no fallo).
//
// Incluye el contexto de negocio del régimen IMMEX y por qué CERBERUS se
// conectará al ERP/sistema de control de inventarios del cliente (Anexo 24/31):
// cruce de saldos y descargos, prevención de créditos por no retorno, alertas
// bajo el principio C9 (alerta, no bloquea).
//
// ACCESO: sesión válida + rol ADMIN; sin sesión => /login; otro rol => aviso
//   dentro de la página (no 500, no detalles).
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obtenerTimbrador } from "@/lib/timbrador-pac";
import { obtenerFirmador } from "@/lib/firmador-efirma";
import { obtenerAlmacen } from "@/lib/almacen-worm";
import { obtenerConectorErp } from "@/lib/conector-erp";

// Depende de sesión: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// Fila de estado de un conector (derivada solo del `id`, sin red).
type FilaConector = {
  conector: string;
  id: string;
  nota: string;
};

// Estado legible a partir del id del conector: "NOOP" => No configurado.
function estadoDeId(id: string): string {
  return id === "NOOP" ? "No configurado" : "Configurado";
}

export default async function AdminConectoresPage() {
  // 1) Verifica el JWT. Sin sesión => /login.
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Solo ADMIN ve el detalle. Otro rol => aviso, no 500 ni detalles.
  if (session.user.rol !== "ADMIN") {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <p style={{ marginBottom: "0.5rem" }}>
          <a href="/dashboard" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
            ← Tablero
          </a>
        </p>
        <h1 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>
          Conectores del sistema
        </h1>
        <p style={{ color: "#b45309" }}>
          Esta sección está reservada al rol ADMIN. Tu usuario no tiene ese rol,
          por lo que no se muestran los detalles de los conectores.
        </p>
      </main>
    );
  }

  // 3) Estado de cada conector: se toma SOLO el `id` de la factoría (sin red).
  const filas: FilaConector[] = [
    {
      conector: "PAC (timbrado CFDI 4.0)",
      id: obtenerTimbrador().id,
      nota: "Timbrado/cancelación ante el SAT vía PAC. NoOp => borrador sellado.",
    },
    {
      conector: "e.firma (FIEL)",
      id: obtenerFirmador().id,
      nota: "Firma del override de alertas (C11). NoOp => acto SIN_FIRMA, sellado.",
    },
    {
      conector: "Almacén WORM (dossier)",
      id: obtenerAlmacen().id,
      nota: "Persistencia inmutable del dossier. NoOp => anclado por sha256.",
    },
    {
      conector: "ERP / inventario IMMEX (Anexo 24/31)",
      id: obtenerConectorErp().id,
      nota: "Lectura de saldos/descargos IMMEX del ERP del cliente. NoOp => sin integración.",
    },
  ];

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/dashboard" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
          ← Tablero
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Conectores del sistema (administración)
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        Estado de los conectores enchufables (patrón Strategy: interfaz estable +
        NoOp por defecto + factoría por entorno). Un conector con id{" "}
        <code>NOOP</code> está <strong>No configurado</strong>: el sistema
        degrada de forma honesta y segura, nunca finge el resultado. El estado se
        deriva del identificador de cada factoría, sin ejecutar llamadas de red.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Conector</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Estado</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const noConfigurado = fila.id === "NOOP";
              return (
                <tr key={fila.conector} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.9rem" }}>
                    {fila.conector}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.85rem" }}>
                    <span
                      style={{
                        color: noConfigurado ? "#b45309" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {estadoDeId(fila.id)}
                    </span>{" "}
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                      }}
                    >
                      ({fila.id})
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.85rem",
                      color: "#475569",
                    }}
                  >
                    {fila.nota}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Conectar un proveedor real no toca rutas ni UI: basta implementar la
          interfaz del conector y seleccionarlo por variable de entorno
          (PAC_PROVIDER, EFIRMA_PROVIDER, BLOB_READ_WRITE_TOKEN, ERP_PROVIDER).
        </p>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>
          IMMEX: por qué CERBERUS se conectará al ERP del cliente
        </h2>
        <p style={{ color: "#475569", fontSize: "0.9rem" }}>
          El régimen <strong>IMMEX</strong> (Industria Manufacturera,
          Maquiladora y de Servicios de Exportación) permite{" "}
          <strong>importar temporalmente</strong> insumos sin pagar IVA/IGI, con
          la obligación de <strong>retornar o descargar</strong> las mercancías
          en plazo y de llevar un <strong>control de inventarios (Anexo 24)</strong>{" "}
          y un <strong>control de saldos (Anexo 31)</strong>.
        </p>
        <p style={{ color: "#475569", fontSize: "0.9rem" }}>
          El SAT/ANAM cruzan los pedimentos de importación temporal contra esos
          saldos y descargos. Una <strong>discrepancia</strong> (mercancía no
          retornada ni descontada a tiempo) genera{" "}
          <strong>créditos fiscales</strong> y es un supuesto típico de
          fiscalización. Por eso, a futuro, CERBERUS leerá del ERP o sistema de
          control de inventarios IMMEX del cliente los saldos por pedimento para
          verificar consistencia documental y <strong>alertar</strong> de riesgos
          (saldo próximo a vencer, mercancía sin descargo), siempre bajo el
          principio <strong>C9: alerta, no bloquea</strong>. CERBERUS solo lee y
          coteja; nunca modifica ni bloquea el ERP del cliente.
        </p>
        <p style={{ color: "#475569", fontSize: "0.9rem" }}>
          Como cada cliente usa un ERP distinto (SAP, Oracle, Softtek/TradeLink,
          sistemas de agentes aduanales, desarrollos propios u hojas de cálculo),
          el conector ERP/IMMEX es <strong>agnóstico</strong>: una interfaz
          estable y adaptadores por proveedor seleccionados por{" "}
          <code>ERP_PROVIDER</code>. La clave es estar listos para conectarnos a
          cualquier ERP del cliente.
        </p>
      </section>
    </main>
  );
}
