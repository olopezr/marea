// Datos de la historia que cuenta el vídeo: un jueves de octubre con buen mar en Somo. Son valores
// ilustrativos pero verosímiles, y se calculan con las mismas funciones que usa la app (public/js/surf.js),
// así que formatos, horas y coeficientes salen igual que en ella. Los spots salen de public/js/spots.js.
import { SPOTS, spotById } from "/js/spots.js";
import { localToUtc, curveFromExtremes, sunTimes, dayLabel } from "/js/surf.js";

export { SPOTS, spotById };
export const TZ = "Europe/Madrid";
const DATE = "2026-10-08";
const at = (time, date = DATE) => localToUtc(date, time, TZ);

export const NOW = at("09:40");
const spot = id => spotById[id] ?? SPOTS[0];
export const SOMO = spot("somo");

// Comunidades para agrupar los spots en el mapa. Si una provincia nueva no está aquí, se usa su nombre.
const COMMUNITY = {
  Pontevedra: "Galicia", "A Coruña": "Galicia", Lugo: "Galicia", Asturias: "Asturias", Cantabria: "Cantabria",
  Bizkaia: "País Vasco", Gipuzkoa: "País Vasco", Cádiz: "Andalucía", Huelva: "Andalucía", Málaga: "Andalucía", Almería: "Andalucía",
  Valencia: "C. Valenciana", Alicante: "C. Valenciana", Castellón: "C. Valenciana", Murcia: "Murcia",
  Barcelona: "Cataluña", Girona: "Cataluña", Tarragona: "Cataluña",
  Mallorca: "Baleares", Menorca: "Baleares", Ibiza: "Baleares", Eivissa: "Baleares", Formentera: "Baleares",
  Lanzarote: "Canarias", Fuerteventura: "Canarias", "Gran Canaria": "Canarias", Tenerife: "Canarias",
  "La Palma": "Canarias", "La Gomera": "Canarias", "El Hierro": "Canarias",
};
export const communityOf = s => COMMUNITY[s.region] ?? s.region;
export const COMMUNITY_ORDER = ["Galicia", "Asturias", "Cantabria", "País Vasco", "Cataluña", "C. Valenciana", "Murcia", "Baleares", "Andalucía", "Canarias"];

// ---------- Marea del día (puerto de Santander) ----------
const ext = [
  { type: "low",  t: at("22:41", "2026-10-07"), h: 0.9 },
  { type: "high", t: at("04:52"), h: 4.4, coef: 82 },
  { type: "low",  t: at("11:05"), h: 0.7 },
  { type: "high", t: at("17:16"), h: 4.5, coef: 84 },
  { type: "low",  t: at("23:31"), h: 0.8 },
  { type: "high", t: at("05:38", "2026-10-09"), h: 4.4, coef: 85 },
];
const from = at("00:00"), to = at("00:00", "2026-10-09");
const curve = curveFromExtremes(ext, from, to);
const predAt = t => {
  const i = curve.times.findIndex(x => x >= t);
  if (i <= 0) return curve.levels[0];
  const f = (t - curve.times[i - 1]) / (curve.times[i] - curve.times[i - 1]);
  return curve.levels[i - 1] + (curve.levels[i] - curve.levels[i - 1]) * f;
};
const wobble = t => 0.055 + 0.018 * Math.sin(t / 2.1e6) + 0.01 * Math.sin(t / 0.7e6);
const observed = [];
for (let t = from; t <= at("09:30"); t += 10 * 60e3) observed.push([t, +(predAt(t) + wobble(t)).toFixed(3)]);
const surge = [];
for (let t = from; t <= to; t += 3600e3) surge.push([t, +(0.06 + 0.012 * Math.sin(t / 9e6)).toFixed(3)]);

export const SUN = sunTimes(at("12:00"), SOMO.lat, SOMO.lon);
export const TIDE_DAY = {
  from, to,
  points: curve.times.map((t, i) => [t, curve.levels[i]]),
  ext,
  observed: { points: observed, gauge: "Santander 2", samePort: true },
  surge: { points: surge, beach: "Somo (Ribamontán al Mar)" },
};

// ---------- Ahora en Somo ----------
export const NOW_SOMO = {
  score: 4.4, h: 1.8, T: 12, dir: 315, wind: 6, windDir: 160, gust: 9, windType: { key: "off", label: "Terral" },
  sh: 1.6, sT: 13, sDir: 312, tideH: 1.4, rising: false, nextTide: ext[2], coef: 82,
  water: 17.8, air: 19, uv: 3, uvMax: 4, uvMaxT: at("14:00"),
  buoy: { name: "Santander-IEO", distKm: 37, h: 2.1, Tp: 12, dir: 318, water: 17.8, t: at("09:00"), predicted: 2.0 },
  station: { name: "Santander", distKm: 9, wind: 7, windDir: 165, gust: 10, air: 19.4, pressure: 1021 },
};

// Tarjetas de la lista, ordenadas por valoración como en la app.
export const LIST = [
  { id: "somo",    score: 4.4, h: 1.8, T: 12, dir: 315, wind: 6,  wt: ["off", "Terral"],  rising: false, next: ["low", "11:05"], buoy: ["Santander-IEO", 2.1, 12, 318, 2.0, "09:00"] },
  { id: "mundaka", score: 4.1, h: 1.6, T: 12, dir: 320, wind: 4,  wt: ["calm", "Calma"],  rising: false, next: ["low", "11:12"], buoy: ["Bilbao II", 2.3, 12, 320, 2.2, "09:00"] },
  { id: "rodiles", score: 3.6, h: 1.5, T: 11, dir: 330, wind: 8,  wt: ["off", "Terral"],  rising: false, next: ["low", "10:58"], buoy: ["Gijón", 1.9, 11, 325, 1.8, "09:00"] },
  { id: "zarautz", score: 3.2, h: 1.3, T: 11, dir: 325, wind: 9,  wt: ["cross", "Cruzado"], rising: false, next: ["low", "11:20"], buoy: ["Bilbao II", 2.3, 12, 320, 2.2, "09:00"] },
  { id: "famara",  score: 2.4, h: 1.1, T: 9,  dir: 340, wind: 14, wt: ["on", "De mar"],   rising: true,  next: ["high", "13:41"], buoy: ["Lanzarote", 1.4, 9, 345, 1.3, "08:00"], tz: "Atlantic/Canary" },
].map(c => ({ ...c, spot: spot(c.id), nextT: at(c.next[1]) }));

// Próximas 24 horas desde las 09:00.
const hourScores = [4.3, 4.4, 4.4, 4.2, 3.8, 3.5, 3.2, 2.8, 2.4, 2.2, 2.0, 1.6, 1.2, 1.2, 1.4, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 3.8, 4.0, 4.1];
export const HOURS = hourScores.map((score, i) => ({
  t: NOW - 40 * 60e3 + i * 3600e3, score,
  h: [1.8, 1.8, 1.8, 1.7, 1.7, 1.6, 1.6, 1.5, 1.5, 1.5, 1.4, 1.4, 1.4, 1.4, 1.5, 1.5, 1.6, 1.6, 1.7, 1.7, 1.8, 1.8, 1.9, 1.9][i],
  T: i < 12 ? 12 : 13, windDir: i < 5 ? 160 : i < 14 ? 330 : 170, wind: [6, 6, 7, 8, 9, 11, 12, 13, 12, 10, 8, 6, 5, 4, 4, 4, 5, 5, 6, 6, 6, 5, 5, 5][i],
}));

// 7 días: horas de luz (08h a 19h) por calidad, ola máxima y mejor hora.
const W = { f: "flat", p: "poor", a: "fair", g: "good", e: "epic" };
const weekRows = [
  ["geeeegggaaap", 1.9, "10"], ["ggggaaaaappp", 1.6, "08"], ["aaapppppppff", 1.0, "09"], ["ppppffffpppp", 0.7, "08"],
  ["paaaggggggee", 2.2, "18"], ["eeeeggggggaa", 2.6, "09"], ["gggaaaaapppp", 1.8, "08"],
];
export const WEEK = weekRows.map(([cells, maxH, best], i) => ({
  label: i === 0 ? "Hoy" : dayLabel(at("12:00") + i * 86400e3, TZ),
  cells: [...cells.slice(0, 12)].map(c => W[c]),
  maxH, best: `${best}h`, today: i === 0,
}));
export const WEEK_HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);

export const ALERTS = { minScore: 4, spots: ["somo", "liencres"] };
export const NOTIFY = {
  time: "20:04", date: "Miércoles, 7 de octubre",
  title: `${SOMO.name} se pone muy bueno mañana`,
  body: "Mejor hacia las 09:00: 1,8 m · 12 s del NO · viento terral de 6 kn",
};
export { at };
