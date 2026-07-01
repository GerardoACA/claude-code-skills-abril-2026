// CERBERUS COMERCIO EXTERIOR — boton de cierre de sesion (client component). NO es SIDF.
// =============================================================================
// Archivo:  src/components/CerrarSesion.tsx
// Proposito: Boton client-side que cierra la sesion NextAuth y redirige a /login.
//            Es un client component porque signOut() de next-auth/react corre en
//            el navegador; el tablero que lo usa sigue siendo un Server Component.
// =============================================================================
"use client";

import { signOut } from "next-auth/react";

export function CerrarSesion() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        border: "1px solid #dc2626",
        background: "#fff",
        color: "#dc2626",
        borderRadius: 6,
        padding: "0.5rem 1rem",
        fontSize: "0.9rem",
        cursor: "pointer",
      }}
    >
      Cerrar sesion
    </button>
  );
}
