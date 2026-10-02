// Configuración compartida del servidor.
import fs from "node:fs";
import path from "node:path";

// Carpeta de datos persistentes: avisos, claves VAPID y caché de mareas.
export const DATA_DIR = process.env.DATA_DIR || path.resolve(import.meta.dirname, "../data");
fs.mkdirSync(DATA_DIR, { recursive: true });
