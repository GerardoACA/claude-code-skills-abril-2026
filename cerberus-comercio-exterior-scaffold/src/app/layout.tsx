// CERBERUS COMERCIO EXTERIOR — layout raíz (App Router). NO es SIDF.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cerberus Comercio Exterior",
  description:
    "Plataforma de cumplimiento y trazabilidad probatoria para agencias aduanales.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          color: "#0f172a",
          background: "#f8fafc",
        }}
      >
        {children}
      </body>
    </html>
  );
}
