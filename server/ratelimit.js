// Límite sencillo por clave (IP) con ventana deslizante. Cada clave caduca por separado; si hay demasiadas,
// se descartan las más antiguas en vez de vaciar todo el mapa (que dejaría a un atacante reiniciar su contador).
const MAX_KEYS = 10_000;

export function createLimiter(max, windowMs, now = Date.now) {
  const hits = new Map();
  return function limited(key) {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    recent.push(t);
    hits.delete(key); // reinserta al final: el mapa queda ordenado de menos a más reciente
    hits.set(key, recent);
    while (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value);
    return recent.length > max;
  };
}
