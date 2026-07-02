-- CreateEnum
CREATE TYPE "FuenteVerificacion" AS ENUM ('ART_69', 'ART_69B', 'ART_69B_BIS', 'ART_29BIS', 'OPINION_32D', 'CSD_17H');

-- CreateEnum
CREATE TYPE "ResultadoVerificacion" AS ENUM ('AL_CORRIENTE', 'NO_DISPONIBLE', 'ALERTA', 'INHABILITADO_PRESUNTO', 'INHABILITADO_DEFINITIVO');

-- CreateTable
CREATE TABLE "verificacion_cumplimiento" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "fuente" "FuenteVerificacion" NOT NULL,
    "resultado" "ResultadoVerificacion" NOT NULL,
    "detalle" TEXT,
    "snapshot_sha256" CHAR(64),
    "consultado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigencia_hasta" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificacion_cumplimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verificacion_cumplimiento_tenant_id_cliente_id_fuente_idx" ON "verificacion_cumplimiento"("tenant_id", "cliente_id", "fuente");

-- AddForeignKey
ALTER TABLE "verificacion_cumplimiento" ADD CONSTRAINT "verificacion_cumplimiento_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion_cumplimiento" ADD CONSTRAINT "verificacion_cumplimiento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
