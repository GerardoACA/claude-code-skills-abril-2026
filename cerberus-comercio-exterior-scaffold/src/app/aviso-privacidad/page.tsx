// CERBERUS COMERCIO EXTERIOR — Privacidad (página /aviso-privacidad). NO es SIDF.
// ============================================================================
// Server Component que publica el Aviso de Privacidad Integral v2. Lee el
// cuerpo desde src/content/aviso-privacidad-v2.md, calcula su SHA-256 (hex, 64)
// con la primitiva probatoria del producto (@/lib/probatoria/hash) y delega el
// render al componente cliente AvisoPrivacidadIntegral, que muestra versión +
// hash visibles y marca el aviso como borrador si conserva [corchetes].
// ============================================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@/lib/probatoria/hash";
import {
  AvisoPrivacidadIntegral,
  type AvisoIntegral,
} from "@/components/AvisoPrivacidadIntegral";

// El hash debe calcularse sobre el texto exacto publicado: render dinámico
// (sin cachear el cuerpo en build) para que el hash siempre cotice la fuente.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Aviso de Privacidad Integral — CERBERUS Comercio Exterior",
  description:
    "Aviso de Privacidad Integral (v2) conforme a la LFPDPPP. Versión y hash de integridad visibles.",
};

async function cargarAviso(): Promise<AvisoIntegral> {
  // Fuente del hash: el .md íntegro versionado en el repo.
  const ruta = join(process.cwd(), "src", "content", "aviso-privacidad-v2.md");
  const cuerpoMarkdown = await readFile(ruta, "utf8");

  return {
    version: "v2",
    hashAviso: sha256(cuerpoMarkdown),
    fechaActualizacion: "30 de junio de 2026",
    cuerpoMarkdown,
  };
}

export default async function AvisoPrivacidadPage() {
  const aviso = await cargarAviso();
  return (
    <main className="aviso-privacidad-page">
      <AvisoPrivacidadIntegral aviso={aviso} />
    </main>
  );
}
