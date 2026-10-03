// Cliente de la API de Marea. Guarda la última respuesta para poder abrir sin conexión.
const FRESH_MS = 5 * 60e3;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

async function request(path, init) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

async function cachedGet(path, force) {
  const key = `marea:v4:${path}`; // v4: índice UV. Sube la versión cuando cambien las respuestas.
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.ts < FRESH_MS) return { ...hit, stale: false };
  try {
    const data = await request(path);
    const entry = { ts: Date.now(), data };
    store.set(key, entry);
    return { ...entry, stale: false };
  } catch (err) {
    if (hit) return { ...hit, stale: true, error: err.message };
    throw err;
  }
}

export const getOverview = force => cachedGet("/api/spots", force);
export const getSpot = (id, force) => cachedGet(`/api/spots/${encodeURIComponent(id)}`, force);
export const getBuoy = (id, force) => cachedGet(`/api/spots/${encodeURIComponent(id)}/boya`, force);

const post = (path, body) => request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const push = {
  key: () => request("/api/push/key"),
  subscribe: body => post("/api/push/subscribe", body),
  unsubscribe: endpoint => post("/api/push/unsubscribe", { endpoint }),
  status: endpoint => post("/api/push/status", { endpoint }),
  test: endpoint => post("/api/push/test", { endpoint }),
};
