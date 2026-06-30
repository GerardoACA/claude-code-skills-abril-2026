// CERBERUS COMERCIO EXTERIOR — singleton de PrismaClient. NO es SIDF.
import { PrismaClient } from "@prisma/client";

// Reutilizamos una sola instancia de PrismaClient en desarrollo para evitar
// agotar el pool de conexiones por el hot-reload de Next.js.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
