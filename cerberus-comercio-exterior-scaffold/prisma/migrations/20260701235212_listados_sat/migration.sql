-- CreateTable
CREATE TABLE "importacion_listado_sat" (
    "id" TEXT NOT NULL,
    "fuente" "FuenteVerificacion" NOT NULL,
    "url" TEXT NOT NULL,
    "sha256_archivo" CHAR(64) NOT NULL,
    "filas" INTEGER NOT NULL,
    "importado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacion_listado_sat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listado_sat_entrada" (
    "id" TEXT NOT NULL,
    "importacion_id" TEXT NOT NULL,
    "fuente" "FuenteVerificacion" NOT NULL,
    "rfc" TEXT NOT NULL,
    "razon_social" TEXT,
    "situacion" TEXT,

    CONSTRAINT "listado_sat_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importacion_listado_sat_fuente_importado_en_idx" ON "importacion_listado_sat"("fuente", "importado_en");

-- CreateIndex
CREATE INDEX "listado_sat_entrada_rfc_fuente_idx" ON "listado_sat_entrada"("rfc", "fuente");

-- AddForeignKey
ALTER TABLE "listado_sat_entrada" ADD CONSTRAINT "listado_sat_entrada_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importacion_listado_sat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
