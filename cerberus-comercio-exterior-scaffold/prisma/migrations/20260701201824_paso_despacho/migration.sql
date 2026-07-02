-- CreateEnum
CREATE TYPE "TipoPaso" AS ENUM ('MVE_E2', 'COVE', 'PREVALIDACION', 'PAGO', 'DODA');

-- CreateTable
CREATE TABLE "paso_despacho" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operacion_id" TEXT NOT NULL,
    "tipo" "TipoPaso" NOT NULL,
    "acuse" TEXT,
    "sello" TEXT,
    "monto" DECIMAL(14,2),
    "detalle" TEXT,
    "sha256" CHAR(64) NOT NULL,
    "completado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paso_despacho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paso_despacho_tenant_id_operacion_id_tipo_idx" ON "paso_despacho"("tenant_id", "operacion_id", "tipo");

-- AddForeignKey
ALTER TABLE "paso_despacho" ADD CONSTRAINT "paso_despacho_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paso_despacho" ADD CONSTRAINT "paso_despacho_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
