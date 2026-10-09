// Diario de sesiones: solo en este dispositivo (localStorage). Sin DOM, para poder probarlo.
import { cardinal } from "./surf.js";

export const KEY = "marea:diary";
export const MAX_ENTRIES = 500;
export const MAX_NOTES = 500;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
};

const valid = (e) =>
  e &&
  typeof e === "object" &&
  typeof e.id === "string" &&
  typeof e.spotId === "string" &&
  e.spotId &&
  /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
  Number.isFinite(e.rating);

export const load = () => read().filter(valid);

// Fecha local del dispositivo (yyyy-mm-dd).
export const todayISO = (now = Date.now()) => {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function add({ spotId, date, rating, notes = "", snap = null }) {
  if (!spotId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    spotId,
    date,
    rating: Math.min(5, Math.max(1, Math.round(Number(rating) || 1))),
    notes: String(notes ?? "")
      .trim()
      .slice(0, MAX_NOTES),
    snap: snap ?? null,
  };
  write([...load(), entry].slice(-MAX_ENTRIES));
  return entry;
}

export function remove(id) {
  write(load().filter((e) => e.id !== id));
}

// Más reciente primero: por fecha y, a igual fecha, la última añadida.
export const listNewestFirst = (entries = load()) =>
  entries
    .map((e, i) => [e, i])
    .sort((a, b) => (a[0].date === b[0].date ? b[1] - a[1] : a[0].date < b[0].date ? 1 : -1))
    .map(([e]) => e);

// Condiciones del momento a partir del detalle del spot: boya si hay lectura, si no la previsión;
// viento medido si hay estación.
export function buildSnap(s) {
  const n = s.now ?? {};
  const b = s.buoy;
  const w = s.meteo?.wind;
  const tide = s.tide?.h != null ? { h: s.tide.h, rising: !!s.tide.rising, coef: s.tide.coef ?? null } : null;
  return {
    h: b?.h ?? n.h ?? null,
    Tp: b?.Tp ?? n.T ?? null,
    dir: b?.dir ?? n.dir ?? null,
    water: b?.water ?? n.water ?? null,
    wind: w?.wind ?? n.wind ?? null,
    windDir: w?.windDir ?? n.windDir ?? null,
    gust: w?.gust ?? n.gust ?? null,
    tide,
    score: s.score ?? null,
  };
}

// PORTUS solo guarda 48 h: la instantánea se toma únicamente cuando la sesión es de hoy.
export const snapFor = (s, date, now = Date.now()) => (date === todayISO(now) ? buildSnap(s) : null);

const stat = (vals) => {
  const v = vals.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const r = (x) => Math.round(x * 10) / 10;
  return { avg: r(v.reduce((a, b) => a + b, 0) / v.length), min: r(Math.min(...v)), max: r(Math.max(...v)) };
};

// Qué te funciona en un spot: media y rango de las sesiones puntuadas con 4-5 (mínimo 2 con datos).
export function insights(entries, spotId) {
  const good = entries.filter((e) => e.spotId === spotId && e.rating >= 4 && e.snap);
  if (good.length < 2) return null;
  const dirs = {};
  for (const e of good)
    if (e.snap.windDir != null) dirs[cardinal(e.snap.windDir)] = (dirs[cardinal(e.snap.windDir)] ?? 0) + 1;
  const top = Object.entries(dirs).sort((a, b) => b[1] - a[1])[0];
  return {
    count: good.length,
    h: stat(good.map((e) => e.snap.h)),
    Tp: stat(good.map((e) => e.snap.Tp)),
    wind: stat(good.map((e) => e.snap.wind)),
    windDir: top ? top[0] : null,
  };
}
