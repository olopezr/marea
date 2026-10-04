// Caché en memoria con TTL. Agrupa peticiones simultáneas a la misma clave y,
// si la fuente falla, sirve el último valor bueno durante `staleMs`.
// Tras un fallo no se vuelve a llamar a la fuente hasta pasados `retryMs`: así una fuente caída o que
// limita peticiones no recibe una llamada nueva por cada visita.
const entries = new Map();

export async function cached(key, ttlMs, loader, { staleMs = 24 * 3600e3, retryMs = 2 * 60e3 } = {}) {
  const now = Date.now();
  const e = entries.get(key);
  if (e?.value !== undefined && now - e.at < ttlMs) return e.value;
  if (e?.pending) return e.pending;
  if (e?.failedAt && now - e.failedAt < Math.max(retryMs, e.retryAfterMs ?? 0)) {
    if (e.value !== undefined && now - e.at < staleMs) return e.value;
    throw e.error;
  }

  const pending = loader()
    .then((value) => {
      entries.set(key, { value, at: Date.now() });
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
