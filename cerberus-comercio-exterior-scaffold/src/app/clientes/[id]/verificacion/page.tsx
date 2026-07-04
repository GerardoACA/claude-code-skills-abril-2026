// CERBERUS COMERCIO EXTERIOR — redirect permanente a la pagina de cumplimiento. NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/verificacion/page.tsx
// Proposito: [Inc 56] La antigua pagina "Verificacion 69-B" quedo FUSIONADA en
//            /clientes/[id]/cumplimiento (pantalla unica de supuestos de
//            cumplimiento, incluida la seccion "Historial 69-B"). Este archivo
//            se CONSERVA solo para no romper enlaces guardados/bookmarks: toda
//            visita redirige permanentemente a la pagina de cumplimiento.
//            Sin lecturas de BD ni sesion: la pagina destino ya exige sesion
//            valida y aplica RLS via withTenantFromSession.
// =============================================================================

import { redirect } from "next/navigation";

// Depende del parametro dinamico: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function VerificacionPage({ params }: PageProps) {
  const { id } = await params;
  // Redirect permanente (fusion Inc 56): el contenido 69-B vive ahora en la
  // pantalla unica de cumplimiento.
  redirect(`/clientes/${encodeURIComponent(id)}/cumplimiento`);
}
