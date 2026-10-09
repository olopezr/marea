// Caché en memoria y SQLite con TTL. Agrupa peticiones simultáneas a la misma clave,
// persiste las respuestas válidas en disco para sobrevivir a reinicios del servidor y,
// si la fuente falla, sirve el último valor bueno durante `staleMs`.
// Tras un fallo no se vuelve a llamar a la fuente hasta pasados `retryMs`: así una fuente caída o que
// limita peticiones no recibe una llamada nueva por cada visita.
import { getDb } from "./db.js";

const entries = new Map();

let db = null;
let getStmt = null;
let setStmt = null;
let cleanupScheduled = false;

function initDb() {
  if (db) return db;
  try {
    db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        at INTEGER NOT NULL
      );
    `);
    getStmt = db.prepare("SELECT value, at FROM cache_entries WHERE key = ?");
    setStmt = db.prepare(`
      INSERT INTO cache_entries (key, value, at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at
    `);
    if (!cleanupScheduled && process.env.NODE_ENV !== "test") {
      cleanupScheduled = true;
      setInterval(() => {
        try {
          const weekAgo = Date.now() - 7 * 24 * 3600e3;
          db.prepare("DELETE FROM cache_entries WHERE at < ?").run(weekAgo);
        } catch {}
      }, 24 * 3600e3).unref();
    }
  } catch (err) {
    console.warn(`[cache] Persistencia SQLite no disponible (${err.message}). Se usará solo memoria.`);
    db = null;
  }
  return db;
}

function readDisk(key) {
  if (!initDb() || !getStmt) return null;
  try {
    const row = getStmt.get(key);
    if (!row) return null;
    return { value: JSON.parse(row.value), at: Number(row.at) };
  } catch {
    return null;
  }
}

function writeDisk(key, value, at) {
  if (!initDb() || !setStmt) return;
  try {
    setStmt.run(key, JSON.stringify(value), at);
  } catch {
    // Si no se puede serializar o guardar en disco, el dato sigue en memoria
  }
}

export function clearMemoryCache() {
  entries.clear();
}

export async function cached(key, ttlMs, loader, { staleMs = 24 * 3600e3, retryMs = 2 * 60e3 } = {}) {
  const now = Date.now();
  let e = entries.get(key);
  if (!e) {
    const disk = readDisk(key);
    if (disk) {
      e = disk;
      entries.set(key, e);
    }
  }

  if (e?.value !== undefined && now - e.at < ttlMs) return e.value;
  if (e?.pending) return e.pending;
  if (e?.failedAt && now - e.failedAt < Math.max(retryMs, e.retryAfterMs ?? 0)) {
    if (e.value !== undefined && now - e.at < staleMs) return e.value;
    throw e.error;
  }

  const pending = loader()
    .then((value) => {
      const at = Date.now();
      entries.set(key, { value, at });
      writeDisk(key, value, at);
      return value;
    })
    .catch((err) => {
      const failed = { failedAt: Date.now(), error: err, retryAfterMs: err.retryAfterMs };
      if (e?.value !== undefined && now - e.at < staleMs) {
        entries.set(key, { value: e.value, at: e.at, ...failed });
        console.warn(`[cache] ${key}: ${err.message}. Sirviendo datos de hace ${Math.round((now - e.at) / 60e3)} min`);
        return e.value;
      }
      entries.set(key, failed);
      throw err;
    });
  entries.set(key, { ...e, pending });
  return pending;
}

// Hosts que han pedido que se espere (HTTP 429): no se les vuelve a llamar hasta `until`.
const blocked = new Map();

export async function fetchJSON(url, init = {}, timeoutMs = 15000) {
  const host = new URL(url).host;
  const until = blocked.get(host);
  if (until && Date.now() < until) {
    throw Object.assign(
      new Error(`${host} limita las peticiones; se reintentará en ${Math.ceil((until - Date.now()) / 60e3)} min`),
      { status: 429, retryAfterMs: until - Date.now() },
    );
  }
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "MareaSurf/1.0", ...init.headers },
  });
  if (res.status === 429) {
    const reason = await res
      .json()
      .then((b) => b.reason)
      .catch(() => null);
    const retryAfterMs = (+res.headers.get("retry-after") || 15 * 60) * 1000;
    blocked.set(host, Date.now() + retryAfterMs);
    console.warn(
      `[fuente] ${host} respondió 429${reason ? `: ${reason}` : ""}. Pausa de ${Math.round(retryAfterMs / 60e3)} min`,
    );
    throw Object.assign(new Error(`${host} respondió 429`), { status: 429, retryAfterMs });
  }
  if (!res.ok) throw new Error(`${host} respondió ${res.status}`);
  return res.json();
}

// Limita cuántas peticiones a una misma fuente están en curso a la vez; reintenta una vez si fallan
// (salvo que la fuente haya pedido esperar).
export function limiter(max, retryDelayMs = 600) {
  let active = 0;
  const queue = [];
  return async (url, init) => {
    if (active >= max) await new Promise((r) => queue.push(r));
    active++;
    try {
      try {
        return await fetchJSON(url, init);
      } catch (err) {
        if (err.status === 429) throw err;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return await fetchJSON(url, init);
      }
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
