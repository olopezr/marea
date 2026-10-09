// Conexión SQLite única del proceso, compartida por la caché y los avisos.
// busy_timeout: si otro proceso (p. ej. el worker) está escribiendo, se espera en vez de fallar con SQLITE_BUSY.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./config.js";

let db = null;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(path.join(DATA_DIR, "marea.db"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }
  return db;
}
