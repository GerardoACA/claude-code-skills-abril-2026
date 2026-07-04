// CERBERUS COMERCIO EXTERIOR — gestor de destinatarios de notificaciones. NO es SIDF.
// =============================================================================
// Archivo:  src/components/DestinatariosNotificaciones.tsx  (Incremento 36)
// Propósito: Client Component que deja al cliente definir QUIÉN recibe QUÉ:
//            alta/edición/baja de destinatarios (CEO/CFO/OCN…), su canal
//            (Telegram/correo), dirección (chat id o correo) y las CATEGORÍAS de
//            módulo a las que se suscriben. Consume las rutas
//            /api/clientes/[id]/destinatarios (GET/POST) y .../[destId] (PATCH/DELETE).
// =============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIAS,
  CATEGORIA_ETIQUETA,
  CANALES,
  CANAL_ETIQUETA,
  CARGOS,
  CARGO_ETIQUETA,
  type CategoriaNotificacion,
} from "@/lib/notificaciones-catalogo";

interface Destinatario {
  id: string;
  nombre: string;
  cargo: string;
  canal: string;
  direccion: string;
  categorias: string[];
  activo: boolean;
  creadoEn: string;
}

interface Props {
  clienteId: string;
}

type Borrador = {
  nombre: string;
  cargo: string;
  canal: string;
  direccion: string;
  categorias: CategoriaNotificacion[];
};

const BORRADOR_VACIO: Borrador = {
  nombre: "",
  cargo: "CEO",
  canal: "TELEGRAM",
  direccion: "",
  categorias: [],
};

const card: React.CSSProperties = {
  padding: "1rem 1.1rem",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
};
const label: React.CSSProperties = { fontSize: "0.78rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "0.25rem" };
const input: React.CSSProperties = { width: "100%", padding: "0.5rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" };

export function DestinatariosNotificaciones({ clienteId }: Props) {
  const [lista, setLista] = useState<Destinatario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [probandoId, setProbandoId] = useState<string | null>(null);
  const [resultadoPrueba, setResultadoPrueba] = useState<{ id: string; ok: boolean; detalle: string } | null>(null);

  const base = useMemo(() => `/api/clientes/${encodeURIComponent(clienteId)}/destinatarios`, [clienteId]);

  async function recargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof data === "object" && data !== null && "error" in data ? String((data as { error: unknown }).error) : "No se pudo cargar";
        throw new Error(msg);
      }
      const filas = (data as { destinatarios?: Destinatario[] }).destinatarios ?? [];
      setLista(filas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  function toggleCategoria(cat: CategoriaNotificacion) {
    setBorrador((b) => ({
      ...b,
      categorias: b.categorias.includes(cat) ? b.categorias.filter((c) => c !== cat) : [...b.categorias, cat],
    }));
  }

  function empezarEdicion(d: Destinatario) {
    setEditandoId(d.id);
    setBorrador({
      nombre: d.nombre,
      cargo: d.cargo,
      canal: d.canal,
      direccion: d.direccion,
      categorias: d.categorias.filter((c): c is CategoriaNotificacion => (CATEGORIAS as readonly string[]).includes(c)),
    });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setBorrador(BORRADOR_VACIO);
    setError(null);
  }

  async function guardar() {
    if (borrador.nombre.trim() === "" || borrador.direccion.trim() === "" || borrador.categorias.length === 0) {
      setError("Nombre, dirección y al menos una categoría son obligatorios.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const url = editandoId === null ? base : `${base}/${encodeURIComponent(editandoId)}`;
      const metodo = editandoId === null ? "POST" : "PATCH";
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(borrador),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof data === "object" && data !== null && "error" in data ? String((data as { error: unknown }).error) : "No se pudo guardar";
        throw new Error(msg);
      }
      cancelarEdicion();
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(d: Destinatario) {
    try {
      await fetch(`${base}/${encodeURIComponent(d.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !d.activo }),
      });
      await recargar();
    } catch {
      setError("No se pudo cambiar el estado.");
    }
  }

  async function probar(d: Destinatario) {
    setProbandoId(d.id);
    setResultadoPrueba(null);
    try {
      const res = await fetch(`${base}/${encodeURIComponent(d.id)}/probar`, { method: "POST" });
      const data: unknown = await res.json();
      const ok = typeof data === "object" && data !== null && "ok" in data && (data as { ok: unknown }).ok === true;
      const detalle =
        typeof data === "object" && data !== null && "detalle" in data
          ? String((data as { detalle: unknown }).detalle)
          : ok ? "Mensaje de prueba enviado." : "No se pudo enviar.";
      setResultadoPrueba({ id: d.id, ok, detalle });
    } catch {
      setResultadoPrueba({ id: d.id, ok: false, detalle: "Error de red al probar el envío." });
    } finally {
      setProbandoId(null);
    }
  }

  async function eliminar(d: Destinatario) {
    if (!confirm(`¿Eliminar a ${d.nombre}?`)) return;
    try {
      await fetch(`${base}/${encodeURIComponent(d.id)}`, { method: "DELETE" });
      if (editandoId === d.id) cancelarEdicion();
      await recargar();
    } catch {
      setError("No se pudo eliminar.");
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {/* Formulario de alta/edición */}
      <section style={card}>
        <h2 style={{ fontSize: "1.1rem", marginTop: 0, marginBottom: "1rem" }}>
          {editandoId === null ? "Nuevo destinatario" : "Editar destinatario"}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.9rem" }}>
          <div>
            <label style={label} htmlFor="dn-nombre">Nombre</label>
            <input id="dn-nombre" style={input} value={borrador.nombre} onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label style={label} htmlFor="dn-cargo">Cargo / actor</label>
            <select id="dn-cargo" style={input} value={borrador.cargo} onChange={(e) => setBorrador((b) => ({ ...b, cargo: e.target.value }))}>
              {CARGOS.map((c) => (<option key={c} value={c}>{CARGO_ETIQUETA[c]}</option>))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="dn-canal">Canal</label>
            <select id="dn-canal" style={input} value={borrador.canal} onChange={(e) => setBorrador((b) => ({ ...b, canal: e.target.value }))}>
              {CANALES.map((c) => (<option key={c} value={c}>{CANAL_ETIQUETA[c]}</option>))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="dn-direccion">{borrador.canal === "TELEGRAM" ? "Chat id de Telegram" : "Correo electrónico"}</label>
            <input id="dn-direccion" style={input} value={borrador.direccion} onChange={(e) => setBorrador((b) => ({ ...b, direccion: e.target.value }))} placeholder={borrador.canal === "TELEGRAM" ? "p. ej. 8797245651" : "correo@empresa.mx"} />
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <span style={label}>Categorías suscritas (qué módulos le avisan)</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.35rem" }}>
            {CATEGORIAS.map((cat) => {
              const activa = borrador.categorias.includes(cat);
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => toggleCategoria(cat)}
                  style={{
                    padding: "0.35rem 0.7rem",
                    borderRadius: 999,
                    border: `1px solid ${activa ? "#2563eb" : "#cbd5e1"}`,
                    background: activa ? "#eff6ff" : "#fff",
                    color: activa ? "#1d4ed8" : "#475569",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {activa ? "✓ " : ""}{CATEGORIA_ETIQUETA[cat]}
                </button>
              );
            })}
          </div>
        </div>

        {error !== null && (
          <p style={{ marginTop: "0.9rem", color: "#b91c1c", fontSize: "0.85rem" }}>{error}</p>
        )}

        <div style={{ marginTop: "1.1rem", display: "flex", gap: "0.6rem" }}>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            style={{ padding: "0.55rem 1.1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: guardando ? "wait" : "pointer", opacity: guardando ? 0.7 : 1 }}
          >
            {guardando ? "Guardando…" : editandoId === null ? "Agregar destinatario" : "Guardar cambios"}
          </button>
          {editandoId !== null && (
            <button type="button" onClick={cancelarEdicion} style={{ padding: "0.55rem 1.1rem", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
          )}
        </div>
      </section>

      {/* Lista de destinatarios */}
      <section>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Destinatarios configurados</h2>
        {cargando ? (
          <p style={{ color: "#94a3b8" }}>Cargando…</p>
        ) : lista.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>Aún no hay destinatarios. Agrega al primero arriba.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.7rem" }}>
            {lista.map((d) => (
              <div key={d.id} style={{ ...card, opacity: d.activo ? 1 : 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {d.nombre}{" "}
                      <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.85rem" }}>· {CARGO_ETIQUETA[d.cargo as keyof typeof CARGO_ETIQUETA] ?? d.cargo}</span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#475569", marginTop: "0.2rem" }}>
                      {d.canal === "TELEGRAM" ? "Telegram" : "Correo"}: <code style={{ fontFamily: "monospace" }}>{d.direccion}</code>
                      {!d.activo && <span style={{ marginLeft: "0.5rem", color: "#b91c1c", fontWeight: 600 }}>· inactivo</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
                      {d.categorias.map((c) => (
                        <span key={c} style={{ padding: "0.12rem 0.5rem", borderRadius: 999, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155", fontSize: "0.72rem", fontWeight: 600 }}>
                          {CATEGORIA_ETIQUETA[c as CategoriaNotificacion] ?? c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void probar(d)} disabled={probandoId === d.id} style={{ padding: "0.35rem 0.7rem", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: probandoId === d.id ? "wait" : "pointer" }}>
                      {probandoId === d.id ? "Enviando…" : "Probar envío"}
                    </button>
                    <button type="button" onClick={() => empezarEdicion(d)} style={{ padding: "0.35rem 0.7rem", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.8rem", cursor: "pointer" }}>Editar</button>
                    <button type="button" onClick={() => void alternarActivo(d)} style={{ padding: "0.35rem 0.7rem", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.8rem", cursor: "pointer" }}>{d.activo ? "Desactivar" : "Activar"}</button>
                    <button type="button" onClick={() => void eliminar(d)} style={{ padding: "0.35rem 0.7rem", background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, fontSize: "0.8rem", cursor: "pointer" }}>Eliminar</button>
                  </div>
                </div>
                {resultadoPrueba !== null && resultadoPrueba.id === d.id && (
                  <p style={{ margin: "0.6rem 0 0", fontSize: "0.8rem", fontWeight: 600, color: resultadoPrueba.ok ? "#065f46" : "#b91c1c" }}>
                    {resultadoPrueba.ok ? "✅ " : "⚠️ "}{resultadoPrueba.detalle}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
