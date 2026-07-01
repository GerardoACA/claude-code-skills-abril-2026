// CERBERUS COMERCIO EXTERIOR — boton de sincronizacion de listados SAT (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/SincronizarListados.tsx
// Proposito (Incremento 10): Boton client-side que dispara POST a
//            /api/admin/listados (descarga e importa los listados publicos del
//            SAT: art. 69, 69-B, 69-B Bis, 49 Bis), muestra estado de progreso
//            mientras corre (puede tardar varios minutos) y, al terminar, el
//            resumen por fuente. Refresca el Server Component contenedor
//            (router.refresh) para actualizar "Ultima sincronizacion".
//
// VISIBILIDAD: se renderiza SOLO si la prop `esAdmin` es true (el rol proviene
// del JWT verificado en el Server Component que lo monta). La autorizacion REAL
// la impone el endpoint (403 si el rol del token no es ADMIN): ocultar el boton
// es solo UX, no la defensa.
// =============================================================================
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Resumen por fuente que devuelve POST /api/admin/listados.
type ResumenFuente = {
  fuente: string;
  estado: "importado" | "omitido" | "error";
  filas: number | null;
  sha256: string | null;
  detalle: string;
};

type RespuestaSincronizacion = {
  ok: boolean;
  resumen: ResumenFuente[];
};

type Props = {
  /** true solo si el rol del JWT verificado es ADMIN (lo pasa el Server Component). */
  esAdmin: boolean;
};

export function SincronizarListados({ esAdmin }: Props) {
  const router = useRouter();
  const [cargando, setCargando] = useState<boolean>(false);
  const [resumen, setResumen] = useState<ResumenFuente[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Solo ADMIN ve el boton (el endpoint ademas responde 403 a cualquier otro rol).
  if (!esAdmin) {
    return null;
  }

  async function sincronizar(): Promise<void> {
    setCargando(true);
    setResumen(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/listados", { method: "POST" });
      const cuerpo = (await resp.json().catch(() => null)) as
        | (Partial<RespuestaSincronizacion> & { error?: string })
        | null;

      if (!resp.ok && !Array.isArray(cuerpo?.resumen)) {
        setError(cuerpo?.error ?? "No se pudo sincronizar los listados del SAT");
        return;
      }
      // Aunque el status sea 502 (ninguna fuente importada), mostramos el
      // resumen por fuente si vino: explica que fallo u omitio cada una.
      setResumen(cuerpo?.resumen ?? []);
      // Refresca el Server Component para actualizar "Ultima sincronizacion".
      router.refresh();
    } catch {
      setError("Error de red al sincronizar los listados del SAT");
    } finally {
      setCargando(false);
    }
  }

  function colorEstado(estado: ResumenFuente["estado"]): string {
    if (estado === "importado") return "#065f46";
    if (estado === "omitido") return "#92400e";
    return "#b91c1c";
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <button
        type="button"
        onClick={sincronizar}
        disabled={cargando}
        style={{
          border: "1px solid #0f766e",
          background: cargando ? "#f0fdfa" : "#0f766e",
          color: cargando ? "#0f766e" : "#fff",
          borderRadius: 6,
          padding: "0.6rem 1.2rem",
          fontSize: "0.95rem",
          cursor: cargando ? "wait" : "pointer",
        }}
      >
        {cargando ? "Sincronizando listados..." : "Sincronizar listados del SAT"}
      </button>

      {cargando ? (
        <p style={{ marginTop: "0.75rem", color: "#475569", fontSize: "0.9rem" }}>
          Descargando e importando los listados publicos del SAT (69, 69-B,
          69-B Bis, 49 Bis). Puede tardar varios minutos; no cierres esta
          pestana.
        </p>
      ) : null}

      {resumen ? (
        <ul style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}>
          {resumen.map((r) => (
            <li
              key={r.fuente}
              style={{
                fontSize: "0.85rem",
                color: colorEstado(r.estado),
                marginBottom: "0.25rem",
              }}
            >
              <strong>{r.fuente}</strong> — {r.estado}
              {r.filas !== null ? ` (${r.filas} filas)` : ""}: {r.detalle}
              {r.sha256 ? (
                <>
                  {" "}
                  <code style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    sha256 {r.sha256.slice(0, 16)}…
                  </code>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}

      <p style={{ marginTop: "0.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        Los listados son referencia GLOBAL (publicos del SAT, iguales para todos
        los tenants). Solo el rol ADMIN puede sincronizarlos.
      </p>
    </div>
  );
}
