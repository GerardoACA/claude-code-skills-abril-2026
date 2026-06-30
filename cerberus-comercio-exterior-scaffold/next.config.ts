// CERBERUS COMERCIO EXTERIOR — configuración Next.js. NO es SIDF.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El cliente de Prisma se trata como externo en el bundle del servidor.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
