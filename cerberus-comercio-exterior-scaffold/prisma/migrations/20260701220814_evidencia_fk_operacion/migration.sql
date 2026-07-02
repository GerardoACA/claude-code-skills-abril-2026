-- AlterTable
ALTER TABLE "bitacora_auditoria" ADD COLUMN     "operacion_id" TEXT;

-- AlterTable
ALTER TABLE "documento" ADD COLUMN     "operacion_id" TEXT;

-- CreateIndex
CREATE INDEX "bitacora_auditoria_tenant_id_operacion_id_idx" ON "bitacora_auditoria"("tenant_id", "operacion_id");

-- CreateIndex
CREATE INDEX "documento_tenant_id_operacion_id_idx" ON "documento"("tenant_id", "operacion_id");

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_auditoria" ADD CONSTRAINT "bitacora_auditoria_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
