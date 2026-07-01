// CERBERUS COMERCIO EXTERIOR — seed mínimo del modelo de datos. NO es SIDF.
// Crea: un Tenant demo, un Usuario, un Cliente y una VersionAviso.
// Ejecutar con: npm run db:seed  (tsx prisma/seed.ts)

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

/// SHA-256 hex (64 chars) del cuerpo del aviso, para la prueba probatoria.
function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

async function main() {
  // --- Tenant demo (raíz multi-tenant) -------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { rfc: "DEMO010101AAA" },
    update: {},
    create: {
      nombre: "Agencia Aduanal Demo S.C.",
      rfc: "DEMO010101AAA",
      activo: true,
    },
  });

  // --- Usuario admin demo ---------------------------------------------------
  // Credenciales demo: admin@demo.mx / demo1234 (hash scrypt via password.ts).
  const passwordHashDemo: string = hashPassword("demo1234");
  await prisma.usuario.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.mx" } },
    update: { passwordHash: passwordHashDemo },
    create: {
      tenantId: tenant.id,
      email: "admin@demo.mx",
      nombre: "Administrador Demo",
      rol: "ADMIN",
      passwordHash: passwordHashDemo,
      activo: true,
    },
  });

  // --- Cliente / importador demo -------------------------------------------
  const cliente = await prisma.cliente.upsert({
    where: { tenantId_rfc: { tenantId: tenant.id, rfc: "IMPO020202BBB" } },
    update: {},
    create: {
      tenantId: tenant.id,
      rfc: "IMPO020202BBB",
      razonSocial: "Importadora Demo S.A. de C.V.",
      estadoCsd: "ACTIVO",
      etapa69b: "NINGUNA",
    },
  });

  // --- Operacion demo (para que el tablero tenga datos) --------------------
  // Ligada al cliente demo; campos requeridos: tenantId, clienteId, referencia.
  await prisma.operacion.upsert({
    where: {
      tenantId_referencia: { tenantId: tenant.id, referencia: "OP-DEMO-0001" },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      clienteId: cliente.id,
      referencia: "OP-DEMO-0001",
      estado: "ARMADO",
    },
  });

  // --- Versión del aviso de privacidad (corto de captura) ------------------
  const cuerpoAviso =
    "Aviso de Privacidad Corto (Captura) — CERBERUS Comercio Exterior. " +
    "Tratamos datos personales conforme a la LFPDPPP. Datos sensibles " +
    "(firma grafométrica y geolocalización) requieren consentimiento expreso.";

  await prisma.versionAviso.upsert({
    where: {
      tenantId_tipo_version: {
        tenantId: tenant.id,
        tipo: "CORTO_CAPTURA",
        version: "v2",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      tipo: "CORTO_CAPTURA",
      version: "v2",
      hashAviso: sha256(cuerpoAviso),
      cuerpo: cuerpoAviso,
      publicadoPor: "seed",
    },
  });

  console.log(
    "Seed completado: 1 Tenant, 1 Usuario (admin@demo.mx / demo1234), " +
      "1 Cliente, 1 Operacion, 1 VersionAviso.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
