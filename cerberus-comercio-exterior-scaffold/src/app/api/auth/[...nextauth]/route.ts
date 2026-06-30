// CERBERUS COMERCIO EXTERIOR — handler de NextAuth (App Router). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/auth/[...nextauth]/route.ts
// Proposito: Exponer los endpoints de NextAuth 4 (signin/signout/session/csrf/...)
//            usando la configuracion central de src/lib/auth.ts. En App Router el
//            mismo handler atiende GET y POST.
// =============================================================================

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
