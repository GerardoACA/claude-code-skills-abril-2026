// CERBERUS COMERCIO EXTERIOR — API admin: ingesta MANUAL de listados. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/admin/listados/manual/route.ts
// Propósito (Incremento 12 — Agente SERVICIO-12):
//   POST — SOLO rol ADMIN (401 sin sesión / 403 otro rol): recibe
//   multipart/form-data con `fuente` (valor del enum FuenteVerificacion,
//   validado con zod; incluye SANCIONES_INT), `emisor` opcional (SAT, OFAC,
//   ONU, UE, UK…) y `archivo` (CSV, máx 25 MB). Importa con el MISMO rigor
//   probatorio que la sincronización automática: sha256 del buffer CRUDO,
//   fecha, origen "MANUAL", url "manual://<nombre-archivo>", entradas con
//   createMany por lotes de 1000 (rfc puede ser null: las listas de
//   SANCIONES_INT identifican por NOMBRE).
//
// DECISIÓN DE DISEÑO — TABLAS GLOBALES SIN TENANT (heredada del Inc 10):
//   ImportacionListadoSat/ListadoSatEntrada son referencia GLOBAL (sin
//   tenant_id): se usa `prisma` directo, NO withTenantFromSession. La
//   escritura queda restringida por ROL DE APLICACIÓN: solo ADMIN ingesta.
//
// DECODIFICACIÓN: los CSV del SAT vienen en latin1 (misma decisión que
// descargarListado en src/lib/sat-listados.ts); si la decodificación primaria
// deja muchos U+FFFD (defensivo: otros orígenes/decodificadores), se intenta
// utf-8 y se conserva la variante con menos reemplazos. El sha256 sellado es
// SIEMPRE el de los bytes crudos subidos (reproducible contra el original).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/probatoria/hash";
import { parsearCsvListado } from "@/lib/sat-listados";
import {
  FUENTES_VERIFICACION,
  type FuenteVerificacion,
} from "@/lib/verificacion-cumplimiento";

export const runtime = "nodejs";
// Parsear + insertar cientos de miles de filas puede tardar: tope Vercel.
export const maxDuration = 300;

/** Tamaño máximo del archivo subido (25 MB). */
const TAMANO_MAX_BYTES = 25 * 1024 * 1024;

/** Tamaño de lote para createMany (misma semántica que sincronizar-listados). */
const TAMANO_LOTE = 1000;

// -----------------------------------------------------------------------------
// Validación de campos de texto del multipart. La fuente se valida contra los
// literales EXACTOS del enum FuenteVerificacion (vía FUENTES_VERIFICACION del
// servicio, que en el Incremento 12 incluye SANCIONES_INT).
// -----------------------------------------------------------------------------
const EsquemaIngesta = z.object({
  fuente: z.enum(FUENTES_VERIFICACION),
  emisor: z.string().trim().min(1).max(120).optional(),
});

// -----------------------------------------------------------------------------
// Decodificación latin1 con fallback utf-8 (ver cabecera del archivo).
// -----------------------------------------------------------------------------
function contarReemplazos(texto: string): number {
  let n = 0;
  let i = texto.indexOf("�");
  while (i !== -1) {
    n++;
    i = texto.indexOf("�", i + 1);
  }
  return n;
}

function decodificarCsv(buffer: Buffer): string {
  const latin1 = buffer.toString("latin1");
  const reemplazosLatin1 = contarReemplazos(latin1);
  // latin1 mapea todos los bytes, así que este umbral rara vez se cruza; es
  // defensivo para conservar el contrato "fallback utf-8 si hay reemplazos".
  if (reemplazosLatin1 === 0) return latin1;
  const utf8 = buffer.toString("utf8");
  return contarReemplazos(utf8) < reemplazosLatin1 ? utf8 : latin1;
}

// -----------------------------------------------------------------------------
// POST /api/admin/listados/manual — importa un CSV subido por el ADMIN.
// -----------------------------------------------------------------------------
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.rol !== "ADMIN") {
    // Escritura de referencia global: restringida por rol de aplicación.
    return NextResponse.json(
      { error: "Solo el rol ADMIN puede ingestar listados manualmente" },
      { status: 403 },
    );
  }

  // 1) Leer el multipart/form-data (falla limpio si el body no es multipart).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo debe ser multipart/form-data con los campos fuente, emisor (opcional) y archivo" },
      { status: 400 },
    );
  }

  // 2) Validar campos de texto (fuente contra el enum, emisor opcional).
  const emisorCrudo = form.get("emisor");
  const camposParseados = EsquemaIngesta.safeParse({
    fuente: form.get("fuente"),
    emisor:
      typeof emisorCrudo === "string" && emisorCrudo.trim().length > 0
        ? emisorCrudo
        : undefined,
  });
  if (!camposParseados.success) {
    return NextResponse.json(
      {
        error: `Campos inválidos: la fuente debe ser uno de ${FUENTES_VERIFICACION.join(", ")}; el emisor (opcional) debe tener entre 1 y 120 caracteres.`,
      },
      { status: 400 },
    );
  }
  const fuente: FuenteVerificacion = camposParseados.data.fuente;
  const emisor: string | null = camposParseados.data.emisor ?? null;

  // 3) Validar el archivo (presencia, tipo File y tamaño máximo).
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { error: "Falta el campo archivo (CSV) en el formulario" },
      { status: 400 },
    );
  }
  if (archivo.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (archivo.size > TAMANO_MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo de 25 MB" },
      { status: 413 },
    );
  }

  // 4) Bytes crudos → sha256 del CRUDO (snapshot sellado reproducible) →
  //    texto (latin1 con fallback utf-8) → parseo con la heurística compartida.
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const sha256Archivo = sha256(buffer);
  const texto = decodificarCsv(buffer);

  // El parser (Agente MODELO-12) tolera RFC ausente cuando la fuente es
  // SANCIONES_INT; el aserto de tipo cubre el hueco entre el enum completo del
  // formulario y el subtipo de fuentes que declare la firma del parser.
  const entradas = parsearCsvListado(
    texto,
    fuente as Parameters<typeof parsearCsvListado>[1],
  );

  if (entradas.length === 0) {
    // Un CSV sin filas reconocibles casi siempre es el archivo equivocado:
    // no se sella una importación vacía por accidente (rigor probatorio).
    return NextResponse.json(
      {
        error:
          "No se reconoció ninguna fila en el CSV (verifica que tenga encabezado con RFC o NOMBRE/ENTITY y filas de datos)",
      },
      { status: 422 },
    );
  }

  const nombreArchivo = archivo.name.trim().length > 0 ? archivo.name.trim() : "archivo.csv";

  // 5) Crear la importación (origen MANUAL + emisor) y sus entradas por lotes
  //    de 1000 (misma semántica que sincronizar-listados; rfc puede ser null).
  const importacion = await prisma.importacionListadoSat.create({
    data: {
      fuente,
      url: `manual://${nombreArchivo}`,
      sha256Archivo,
      filas: entradas.length,
      origen: "MANUAL",
      emisor,
    },
    select: { id: true },
  });

  for (let i = 0; i < entradas.length; i += TAMANO_LOTE) {
    const lote = entradas.slice(i, i + TAMANO_LOTE).map((e) => ({
      importacionId: importacion.id,
      fuente,
      rfc: e.rfc ?? null,
      razonSocial: e.razonSocial ?? null,
      situacion: e.situacion ?? null,
    }));
    await prisma.listadoSatEntrada.createMany({ data: lote });
  }

  return NextResponse.json(
    { fuente, filas: entradas.length, sha256: sha256Archivo, origen: "MANUAL" },
    { status: 201 },
  );
}
