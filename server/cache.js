// Caché en memoria con TTL. Agrupa peticiones simultáneas a la misma clave y,
// si la fuente falla, sirve el último valor bueno durante `staleMs`.
const entries = new Map();

export async function cached(key, ttlMs, loader, { staleMs = 24 * 3600e3 } = {}) {
  const now = Date.now();
  const e = entries.get(key);
  if (e?.value !== undefined && now - e.at < ttlMs) return e.value;
  if (e?.pending) return e.pending;

  const pending = loader()
    .then(value => {
      entries.set(key, { value, at: Date.now() });
      return value;
    })
    .catch(err => {
      if (e?.value !== undefined && now - e.at < staleMs) {
        entries.set(key, { ...e, pending: null });
        console.warn(`[cache] ${key}: ${err.message}. Sirviendo datos de hace ${Math.round((now - e.at) / 60e3)} min`);
        return e.value;
      }
      entries.delete(key);
      throw err;
    });
  entries.set(key, { ...e, pending });
  return pending;
}

export async function fetchJSON(url, init = {}, timeoutMs = 15000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "MareaSurf/1.0", ...init.headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} respondió ${res.status}`);
  return res.json();
}

// Limita cuántas peticiones a una misma fuente están en curso a la vez; reintenta una vez si fallan.
export function limiter(max, retryDelayMs = 600) {
  let active = 0;
  const queue = [];
  return async (url, init) => {
    if (active >= max) await new Promise(r => queue.push(r));
    active++;
    try {
      try { return await fetchJSON(url, init); }
      catch {
        await new Promise(r => setTimeout(r, retryDelayMs));
        return await fetchJSON(url, init);
      }
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
