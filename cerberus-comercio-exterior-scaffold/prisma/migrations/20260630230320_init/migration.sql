-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'AGENTE', 'OPERADOR', 'AUDITOR', 'AUTORIDAD');

-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('INTEGRAL', 'CORTO_CAPTURA');

-- CreateEnum
CREATE TYPE "EstadoCsd" AS ENUM ('ACTIVO', 'RESTRINGIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Etapa69b" AS ENUM ('NINGUNA', 'PRESUNTO', 'DESVIRTUADO', 'DEFINITIVO', 'SENTENCIA_FAVORABLE');

-- CreateEnum
CREATE TYPE "EstadoEncargo" AS ENUM ('VIGENTE', 'REVOCADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "EstadoProbatorio" AS ENUM ('EVIDENCIA_PRELIMINAR', 'PRUEBA_OPONIBLE');

-- CreateEnum
CREATE TYPE "EstadoDespacho" AS ENUM ('ARMADO', 'PREVALIDADO', 'PRESENTACION_PENDIENTE', 'SELECCION', 'VERDE', 'ROJO', 'INCIDENCIA', 'DOSSIER_GENERADO');

-- CreateEnum
CREATE TYPE "Estado69b" AS ENUM ('PRESUNTO', 'DESVIRTUADO', 'DEFINITIVO', 'SENTENCIA_FAVORABLE', 'OVERRIDE', 'CERRADO');

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'OPERADOR',
    "password_hash" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_encargo" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "instrucciones" TEXT NOT NULL,
    "subencargados" TEXT,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3),
    "sha256" CHAR(64),

    CONSTRAINT "contrato_encargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "estado_csd" "EstadoCsd" NOT NULL DEFAULT 'ACTIVO',
    "etapa_69b" "Etapa69b" NOT NULL DEFAULT 'NINGUNA',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patente" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titular" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_fisica_autorizada" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "patente_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rfc" TEXT,
    "curp" TEXT,
    "efirma_serie" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_fisica_autorizada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encargo_conferido" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" "EstadoEncargo" NOT NULL DEFAULT 'VIGENTE',
    "efirma_cliente" TEXT,
    "aceptacion_agente" BOOLEAN NOT NULL DEFAULT false,
    "vigencia_inicio" TIMESTAMP(3) NOT NULL,
    "vigencia_fin" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encargo_conferido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expediente_kyc_1414" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "custodio" TEXT,
    "retiene_hasta" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expediente_kyc_1414_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expediente_probatorio_despacho" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "custodio" TEXT,
    "retiene_hasta" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expediente_probatorio_despacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expediente_doble_3142" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "custodio" TEXT,
    "retiene_hasta" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expediente_doble_3142_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "worm_url" TEXT,
    "estado_probatorio" "EstadoProbatorio" NOT NULL DEFAULT 'EVIDENCIA_PRELIMINAR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "vence" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expediente_kyc_id" TEXT,
    "expediente_probatorio_id" TEXT,
    "expediente_doble_id" TEXT,

    CONSTRAINT "documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "patente_id" TEXT,
    "encargo_id" TEXT,
    "referencia" TEXT NOT NULL,
    "estado" "EstadoDespacho" NOT NULL DEFAULT 'ARMADO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partida" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operacion_id" TEXT NOT NULL,
    "descripcion" TEXT,
    "fraccion_declarada" TEXT,
    "nico" TEXT,
    "umt" TEXT,
    "origen" TEXT,
    "incoterm" TEXT,
    "valor_declarado" DECIMAL(18,4),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_69b" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "estado" "Estado69b" NOT NULL DEFAULT 'PRESUNTO',
    "snapshot_dof_sha256" CHAR(64),
    "snapshot_dof_fecha" TIMESTAMP(3),
    "override_efirma" TEXT,
    "override_motivo" TEXT,
    "override_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerta_69b_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_aviso" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "TipoAviso" NOT NULL,
    "version" TEXT NOT NULL,
    "hash_aviso" CHAR(64) NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3),
    "publicado_por" TEXT,

    CONSTRAINT "version_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimiento_datos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "titular_ref" TEXT NOT NULL,
    "operacion_ref" TEXT,
    "version_aviso_id" TEXT NOT NULL,
    "version_aviso_etiqueta" TEXT NOT NULL,
    "hash_aviso_privacidad" CHAR(64) NOT NULL,
    "consiente_biometricos" BOOLEAN NOT NULL DEFAULT false,
    "consiente_geoloc" BOOLEAN NOT NULL DEFAULT false,
    "ruta_sin_evidencia" BOOLEAN NOT NULL DEFAULT false,
    "medio" TEXT NOT NULL DEFAULT 'WEB_PUNTO_CAPTURA',
    "ip_origen" TEXT,
    "user_agent" TEXT,
    "sello_registro" CHAR(64) NOT NULL,
    "hash_prev" CHAR(64),
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "revocado_en" TIMESTAMP(3),
    "motivo_revocacion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimiento_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora_auditoria" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "payload_ref" TEXT,
    "sha256" CHAR(64) NOT NULL,
    "hash_prev" CHAR(64),
    "estado_sello" "EstadoProbatorio" NOT NULL DEFAULT 'EVIDENCIA_PRELIMINAR',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_rfc_key" ON "tenant"("rfc");

-- CreateIndex
CREATE INDEX "usuario_tenant_id_rol_idx" ON "usuario"("tenant_id", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_tenant_id_email_key" ON "usuario"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "contrato_encargo_tenant_id_vigente_hasta_idx" ON "contrato_encargo"("tenant_id", "vigente_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_encargo_tenant_id_version_key" ON "contrato_encargo"("tenant_id", "version");

-- CreateIndex
CREATE INDEX "cliente_tenant_id_estado_csd_idx" ON "cliente"("tenant_id", "estado_csd");

-- CreateIndex
CREATE INDEX "cliente_tenant_id_etapa_69b_idx" ON "cliente"("tenant_id", "etapa_69b");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_tenant_id_rfc_key" ON "cliente"("tenant_id", "rfc");

-- CreateIndex
CREATE INDEX "patente_tenant_id_activa_idx" ON "patente"("tenant_id", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "patente_tenant_id_numero_key" ON "patente"("tenant_id", "numero");

-- CreateIndex
CREATE INDEX "persona_fisica_autorizada_tenant_id_patente_id_idx" ON "persona_fisica_autorizada"("tenant_id", "patente_id");

-- CreateIndex
CREATE INDEX "encargo_conferido_tenant_id_cliente_id_estado_idx" ON "encargo_conferido"("tenant_id", "cliente_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "expediente_kyc_1414_cliente_id_key" ON "expediente_kyc_1414"("cliente_id");

-- CreateIndex
CREATE INDEX "expediente_kyc_1414_tenant_id_idx" ON "expediente_kyc_1414"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "expediente_probatorio_despacho_cliente_id_key" ON "expediente_probatorio_despacho"("cliente_id");

-- CreateIndex
CREATE INDEX "expediente_probatorio_despacho_tenant_id_idx" ON "expediente_probatorio_despacho"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "expediente_doble_3142_cliente_id_key" ON "expediente_doble_3142"("cliente_id");

-- CreateIndex
CREATE INDEX "expediente_doble_3142_tenant_id_idx" ON "expediente_doble_3142"("tenant_id");

-- CreateIndex
CREATE INDEX "documento_tenant_id_tipo_idx" ON "documento"("tenant_id", "tipo");

-- CreateIndex
CREATE INDEX "documento_tenant_id_estado_probatorio_idx" ON "documento"("tenant_id", "estado_probatorio");

-- CreateIndex
CREATE INDEX "documento_tenant_id_vence_idx" ON "documento"("tenant_id", "vence");

-- CreateIndex
CREATE INDEX "operacion_tenant_id_estado_idx" ON "operacion"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "operacion_tenant_id_cliente_id_idx" ON "operacion"("tenant_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "operacion_tenant_id_referencia_key" ON "operacion"("tenant_id", "referencia");

-- CreateIndex
CREATE INDEX "partida_tenant_id_operacion_id_idx" ON "partida"("tenant_id", "operacion_id");

-- CreateIndex
CREATE INDEX "alerta_69b_tenant_id_cliente_id_estado_idx" ON "alerta_69b"("tenant_id", "cliente_id", "estado");

-- CreateIndex
CREATE INDEX "version_aviso_tenant_id_tipo_vigente_hasta_idx" ON "version_aviso"("tenant_id", "tipo", "vigente_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "version_aviso_tenant_id_tipo_version_key" ON "version_aviso"("tenant_id", "tipo", "version");

-- CreateIndex
CREATE INDEX "consentimiento_datos_tenant_id_titular_ref_creado_en_idx" ON "consentimiento_datos"("tenant_id", "titular_ref", "creado_en");

-- CreateIndex
CREATE INDEX "consentimiento_datos_tenant_id_revocado_idx" ON "consentimiento_datos"("tenant_id", "revocado");

-- CreateIndex
CREATE INDEX "bitacora_auditoria_tenant_id_creado_en_idx" ON "bitacora_auditoria"("tenant_id", "creado_en");

-- CreateIndex
CREATE INDEX "bitacora_auditoria_tenant_id_accion_idx" ON "bitacora_auditoria"("tenant_id", "accion");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_encargo" ADD CONSTRAINT "contrato_encargo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patente" ADD CONSTRAINT "patente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_fisica_autorizada" ADD CONSTRAINT "persona_fisica_autorizada_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_fisica_autorizada" ADD CONSTRAINT "persona_fisica_autorizada_patente_id_fkey" FOREIGN KEY ("patente_id") REFERENCES "patente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encargo_conferido" ADD CONSTRAINT "encargo_conferido_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encargo_conferido" ADD CONSTRAINT "encargo_conferido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_kyc_1414" ADD CONSTRAINT "expediente_kyc_1414_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_kyc_1414" ADD CONSTRAINT "expediente_kyc_1414_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_probatorio_despacho" ADD CONSTRAINT "expediente_probatorio_despacho_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_probatorio_despacho" ADD CONSTRAINT "expediente_probatorio_despacho_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_doble_3142" ADD CONSTRAINT "expediente_doble_3142_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_doble_3142" ADD CONSTRAINT "expediente_doble_3142_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_expediente_kyc_id_fkey" FOREIGN KEY ("expediente_kyc_id") REFERENCES "expediente_kyc_1414"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_expediente_probatorio_id_fkey" FOREIGN KEY ("expediente_probatorio_id") REFERENCES "expediente_probatorio_despacho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_expediente_doble_id_fkey" FOREIGN KEY ("expediente_doble_id") REFERENCES "expediente_doble_3142"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_patente_id_fkey" FOREIGN KEY ("patente_id") REFERENCES "patente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargo_conferido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida" ADD CONSTRAINT "partida_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida" ADD CONSTRAINT "partida_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_69b" ADD CONSTRAINT "alerta_69b_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_69b" ADD CONSTRAINT "alerta_69b_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_aviso" ADD CONSTRAINT "version_aviso_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimiento_datos" ADD CONSTRAINT "consentimiento_datos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimiento_datos" ADD CONSTRAINT "consentimiento_datos_version_aviso_id_fkey" FOREIGN KEY ("version_aviso_id") REFERENCES "version_aviso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_auditoria" ADD CONSTRAINT "bitacora_auditoria_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
