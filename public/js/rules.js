// Regla de aviso personalizada de un spot. Misma normalización que el servidor (cleanRule):
// los valores por defecto se omiten y un campo no válido se descarta.
const DEFAULTS = { hMin: 0, hMax: 10, windMax: 60, ahead: 24 };
const TIDES = ["low", "mid", "high", "any"];

const num = (v) => {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function normalizeRule(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  let hMin = num(raw.hMin);
  let hMax = num(raw.hMax);
  if (hMin != null) hMin = Math.round(clamp(hMin, 0, 10) * 10) / 10;
  if (hMax != null) hMax = Math.round(clamp(hMax, 0, 10) * 10) / 10;
  if (hMin != null && hMax != null && hMin > hMax) [hMin, hMax] = [hMax, hMin];
  if (hMin != null && hMin !== DEFAULTS.hMin) out.hMin = hMin;
  if (hMax != null && hMax !== DEFAULTS.hMax) out.hMax = hMax;
  const windMax = num(raw.windMax);
  if (windMax != null) {
    const w = Math.round(clamp(windMax, 0, 60));
    if (w !== DEFAULTS.windMax) out.windMax = w;
  }
  if (raw.wind === "off") out.wind = "off";
  if (TIDES.includes(raw.tide) && raw.tide !== "any") out.tide = raw.tide;
  const ahead = num(raw.ahead);
  if (ahead != null) {
    const a = Math.round(clamp(ahead, 6, 48));
    if (a !== DEFAULTS.ahead) out.ahead = a;
  }
  return Object.keys(out).length ? out : null;
}

// Campos del formulario (cadenas, y `wind` como casilla) a regla normalizada.
export const ruleFromForm = (f) => normalizeRule({ ...f, wind: f.wind ? "off" : "any" });
