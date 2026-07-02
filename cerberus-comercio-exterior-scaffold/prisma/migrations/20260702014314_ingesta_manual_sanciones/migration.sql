-- AlterEnum
ALTER TYPE "FuenteVerificacion" ADD VALUE 'SANCIONES_INT';

-- AlterTable
ALTER TABLE "importacion_listado_sat" ADD COLUMN     "emisor" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'AUTOMATICA';

-- AlterTable
ALTER TABLE "listado_sat_entrada" ALTER COLUMN "rfc" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "listado_sat_entrada_razon_social_idx" ON "listado_sat_entrada"("razon_social");
