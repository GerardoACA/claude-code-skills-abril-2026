// CERBERUS COMERCIO EXTERIOR — shim de tipos para @vercel/blob. NO es SIDF.
// =============================================================================
// Archivo:  src/types/vercel-blob.d.ts  (Agente ALMACEN-14, Incremento 14)
//
// POR QUÉ EXISTE: en el entorno de construcción de este incremento el registro
// npm no está disponible, así que `@vercel/blob` (declarado en package.json,
// ^1) no puede instalarse y tsc no resuelve el módulo. Este shim declara SOLO
// el subconjunto de la API pública v1 que consume src/lib/almacen-worm.ts
// (`put` y `list`), con las firmas del paquete real.
//
// IMPORTANTE: una declaración ambiente de módulo tiene precedencia sobre los
// tipos de node_modules. Tras un `npm install` real, BORRAR este archivo para
// usar los tipos oficiales del paquete (las firmas de aquí son compatibles,
// pero los tipos oficiales son la fuente de verdad).
// =============================================================================

declare module "@vercel/blob" {
  /** Resultado de `put` (subconjunto estable de la API pública v1). */
  export interface PutBlobResult {
    /** URL pública (no adivinable) del blob subido. */
    url: string;
    /** URL de descarga con content-disposition: attachment. */
    downloadUrl: string;
    /** Ruta del blob dentro del store. */
    pathname: string;
    contentType: string;
    contentDisposition: string;
  }

  /** Opciones de `put` usadas por este proyecto. */
  export interface PutCommandOptions {
    /** Único modo soportado por Vercel Blob hoy. */
    access: "public";
    /** false => la ruta pedida ES la ruta final (necesario para WORM lógico). */
    addRandomSuffix?: boolean;
    /** default false: subir a una ruta existente lanza error (no sobrescribe). */
    allowOverwrite?: boolean;
    contentType?: string;
    cacheControlMaxAge?: number;
    /** Token RW; por defecto se lee de process.env.BLOB_READ_WRITE_TOKEN. */
    token?: string;
  }

  export function put(
    pathname: string,
    body: string | ArrayBuffer | Blob | Buffer | ReadableStream,
    optionsInput: PutCommandOptions,
  ): Promise<PutBlobResult>;

  /** Un blob dentro del resultado de `list`. */
  export interface ListBlobResultBlob {
    url: string;
    downloadUrl: string;
    pathname: string;
    size: number;
    uploadedAt: Date;
  }

  /** Opciones de `list` usadas por este proyecto. */
  export interface ListCommandOptions {
    prefix?: string;
    limit?: number;
    cursor?: string;
    mode?: "expanded" | "folded";
    token?: string;
  }

  export interface ListBlobResult {
    blobs: ListBlobResultBlob[];
    cursor?: string;
    hasMore: boolean;
  }

  export function list(
    options?: ListCommandOptions,
  ): Promise<ListBlobResult>;
}
