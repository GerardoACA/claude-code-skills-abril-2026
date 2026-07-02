// CERBERUS COMERCIO EXTERIOR — panel admin de usuarios (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/UsuariosAdmin.tsx  [Inc 18]
// Proposito: Panel interactivo (client) para que un ADMIN gestione usuarios de su
//            tenant: alta (email, nombre, rol, password) via POST /api/usuarios y,
//            por cada usuario existente, cambio de rol y toggle de activacion via
//            PATCH /api/usuarios/[id]. La cuenta propia (email === emailPropio)
//            tiene sus controles deshabilitados (no auto-degradarse / desactivarse).
//            Muestra errores (403/409/400) y refresca el Server Component al exito.
//
// La contrasena solo se envia al alta; jamas se recibe ni se muestra hash alguno.
// =============================================================================
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Valores EXACTOS del enum RolUsuario (prisma/schema.prisma).
const ROLES = ["ADMIN", "AGENTE", "OPERADOR", "AUDITOR", "AUTORIDAD"] as const;
type RolUsuario = (typeof ROLES)[number];

/** Fila de usuario que recibe el panel (sin passwordHash, nunca). */
export type UsuarioFila = {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string;
};

type Props = {
  usuarios: UsuarioFila[];
  /** Email del ADMIN en sesion: su fila no puede editarse a si misma. */
  emailPropio: string;
};

/** Extrae un mensaje de error legible de la respuesta del API. */
async function mensajeError(resp: Response): Promise<string> {
  const cuerpo = (await resp.json().catch(() => null)) as {
    error?: string;
    detalles?: string[];
  } | null;
  return (
    cuerpo?.detalles?.join(" · ") ??
    cuerpo?.error ??
    `Error ${resp.status}`
  );
}

export function UsuariosAdmin({ usuarios, emailPropio }: Props) {
  const router = useRouter();
  const emailPropioNorm = emailPropio.toLowerCase();

  // --- Estado del formulario de alta ---
  const [email, setEmail] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [rol, setRol] = useState<RolUsuario>("OPERADOR");
  const [password, setPassword] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [exitoAlta, setExitoAlta] = useState<string | null>(null);

  // --- Estado por fila (id -> error / en curso) ---
  const [filaOcupada, setFilaOcupada] = useState<string | null>(null);
  const [errorFila, setErrorFila] = useState<{ id: string; msg: string } | null>(
    null,
  );

  const altaValida =
    email.trim().length > 0 && nombre.trim().length > 0 && password.length >= 8;

  async function crearUsuario(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (!altaValida || enviando) return;
    setEnviando(true);
    setErrorAlta(null);
    setExitoAlta(null);
    try {
      const resp = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          nombre: nombre.trim(),
          rol,
          password,
        }),
      });
      if (!resp.ok) {
        setErrorAlta(await mensajeError(resp));
        return;
      }
      setExitoAlta(`Usuario ${email.trim()} creado correctamente.`);
      setEmail("");
      setNombre("");
      setRol("OPERADOR");
      setPassword("");
      router.refresh();
    } catch {
      setErrorAlta("Error de red al crear el usuario");
    } finally {
      setEnviando(false);
    }
  }

  async function actualizarUsuario(
    id: string,
    cambios: { rol?: RolUsuario; activo?: boolean },
  ): Promise<void> {
    setFilaOcupada(id);
    setErrorFila(null);
    try {
      const resp = await fetch(`/api/usuarios/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      if (!resp.ok) {
        setErrorFila({ id, msg: await mensajeError(resp) });
        return;
      }
      router.refresh();
    } catch {
      setErrorFila({ id, msg: "Error de red al actualizar el usuario" });
    } finally {
      setFilaOcupada(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    marginTop: "0.25rem",
    padding: "0.45rem 0.6rem",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: "0.9rem",
  };

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      {/* Formulario de alta                                                */}
      {/* ---------------------------------------------------------------- */}
      <h2 style={{ fontSize: "1.25rem" }}>Alta de usuario</h2>
      <form onSubmit={crearUsuario} style={{ marginTop: "0.5rem" }}>
        <div style={{ display: "grid", gap: "0.75rem", maxWidth: 520 }}>
          <label style={{ fontSize: "0.9rem", color: "#334155" }}>
            Correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
              required
              style={inputStyle}
            />
          </label>

          <label style={{ fontSize: "0.9rem", color: "#334155" }}>
            Nombre
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={enviando}
              required
              style={inputStyle}
            />
          </label>

          <label style={{ fontSize: "0.9rem", color: "#334155" }}>
            Rol
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as RolUsuario)}
              disabled={enviando}
              style={inputStyle}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: "0.9rem", color: "#334155" }}>
            Contrasena (minimo 8 caracteres)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={enviando}
              minLength={8}
              required
              autoComplete="new-password"
              style={{
                ...inputStyle,
                border: `1px solid ${
                  password.length > 0 && password.length < 8
                    ? "#fca5a5"
                    : "#cbd5e1"
                }`,
              }}
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={enviando || !altaValida}
              style={{
                border: "1px solid #2563eb",
                background: enviando || !altaValida ? "#eff6ff" : "#2563eb",
                color: enviando || !altaValida ? "#2563eb" : "#fff",
                borderRadius: 6,
                padding: "0.6rem 1.2rem",
                fontSize: "0.95rem",
                cursor: enviando
                  ? "wait"
                  : altaValida
                    ? "pointer"
                    : "not-allowed",
              }}
            >
              {enviando ? "Creando…" : "Crear usuario"}
            </button>
          </div>

          {exitoAlta ? (
            <p style={{ margin: 0, color: "#065f46", fontSize: "0.85rem" }}>
              {exitoAlta}
            </p>
          ) : null}
          {errorAlta ? (
            <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.85rem" }}>
              {errorAlta}
            </p>
          ) : null}
        </div>
      </form>

      {/* ---------------------------------------------------------------- */}
      {/* Tabla de usuarios existentes                                      */}
      {/* ---------------------------------------------------------------- */}
      <h2 style={{ fontSize: "1.25rem", marginTop: "2.5rem" }}>
        Usuarios ({usuarios.length})
      </h2>
      {usuarios.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Sin usuarios registrados.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "0.5rem",
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Correo</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Nombre</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Rol</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const esUnoMismo = u.email.toLowerCase() === emailPropioNorm;
              const ocupada = filaOcupada === u.id;
              const bloqueado = esUnoMismo || ocupada;
              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontFamily: "monospace",
                    }}
                  >
                    {u.email}
                    {esUnoMismo ? (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontFamily: "inherit",
                          fontSize: "0.72rem",
                          color: "#64748b",
                        }}
                      >
                        (tu propia cuenta)
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{u.nombre}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <select
                      value={u.rol}
                      disabled={bloqueado}
                      onChange={(e) =>
                        actualizarUsuario(u.id, {
                          rol: e.target.value as RolUsuario,
                        })
                      }
                      style={{
                        padding: "0.3rem 0.5rem",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        fontSize: "0.85rem",
                        cursor: bloqueado ? "not-allowed" : "pointer",
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontSize: "0.85rem",
                        color: "#334155",
                        cursor: bloqueado ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={u.activo}
                        disabled={bloqueado}
                        onChange={(e) =>
                          actualizarUsuario(u.id, { activo: e.target.checked })
                        }
                      />
                      {u.activo ? "Activo" : "Inactivo"}
                    </label>
                    {errorFila && errorFila.id === u.id ? (
                      <p
                        style={{
                          margin: "0.35rem 0 0",
                          color: "#b91c1c",
                          fontSize: "0.78rem",
                        }}
                      >
                        {errorFila.msg}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
