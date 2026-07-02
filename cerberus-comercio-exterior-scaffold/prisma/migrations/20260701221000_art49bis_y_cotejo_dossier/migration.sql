-- Incremento 9.1 — Renombrar el valor de enum ART_29BIS -> ART_49BIS.
-- El cliente confirmó que la disposición es el art. 49 Bis del CFF (no 29 Bis).
-- Se usa ALTER TYPE ... RENAME VALUE: preserva los datos existentes (rename in-place),
-- a diferencia del drop+add que propone el diff de Prisma. Parte A del Inc 9.1
-- (cotejo del dossier) es solo cambio de codigo de aplicacion; no toca el schema.
ALTER TYPE "FuenteVerificacion" RENAME VALUE 'ART_29BIS' TO 'ART_49BIS';
