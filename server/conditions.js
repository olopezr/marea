// Combina las tres fuentes en las respuestas que consume la app y los avisos.
import { SPOTS } from "../public/js/spots.js";
import {
  rate, rating, windType, waveParts, tideExtremes, curveFromExtremes, tideAt, tideNorm,
  withCoefficients, coefficientAt, startOfLocalDay, dayKey, dayLabel, km,
} from "../public/js/surf.js";
import { forecastAll } from "./forecast.js";
import * as ihm from "./sources/ihm.js";
import * as portus from "./sources/portus.js";
import { airTemperature } from "./sources/metno.js";

const H = 3600e3;

// Marea oficial del IHM; si no responde, la del modelo de Open-Meteo.
// El coeficiente necesita tres meses de datos del puerto, así que solo se calcula en el detalle.
async function tides(spot, fc, from, to, { coef = false } = {}) {
  try {
    const port = await ihm.nearestPort(spot);
    const [raw, mean] = await Promise.all([ihm.extremes(port, from, to), coef ? ihm.meanRange(port).catch(() => null) : null]);
    if (raw.length >= 2) {
      const ext = withCoefficients(raw, mean);
      return { source: "ihm", port: { name: port.name, distKm: Math.round(port.distKm), lat: port.lat, lon: port.lon }, ext, ...curveFromExtremes(ext, from, to) };
    }
  } catch (err) {
    console.warn(`[ihm] ${spot.id}: ${err.message}`);
  }
  const rows = fc.hours.filter(h => h.seaLevel != null);
  const times = rows.map(h => h.t), levels = rows.map(h => h.seaLevel);
  return { source: "model", port: null, ext: tideExtremes(times, levels), times, levels };
}

const scoreOf = (spot, x, tide) =>
  rate({ ...waveParts(x), wind: x.wind, windDir: x.windDir, facing: spot.facing, tideNorm: tideNorm(tide.times, tide.levels, x.t), tidePref: spot.tide });

function nowBlock(spot, c) {
  const w = waveParts(c);
  return { ...w, sh: c.sh, sT: c.sT, sDir: c.sDir, wind: c.wind, windDir: c.windDir, gust: c.gust, windType: windType(c.wind, c.windDir, spot.facing), air: c.air, water: c.water };
}

function tideNow(tide, now) {
  const at = tideAt(tide.times, tide.levels, now);
  const next = tide.ext.find(e => e.t > now) ?? null;
  const port = tide.port && { name: tide.port.name, distKm: tide.port.distKm };
  return { source: tide.source, port, h: at?.h ?? null, rising: at?.rising ?? null, next, coef: coefficientAt(tide.ext, now) };
}

// La lista no consulta PORTUS (boyas, estaciones, mareógrafos): esos datos se cargan solo al abrir
// el detalle de un spot, para no lanzar decenas de peticiones a la vez contra su API.
async function summaryOf(spot, fc, now, opts) {
  const tide = await tides(spot, fc, now - 13 * H, now + 13 * H, opts);
  const c = { ...fc.current, t: now };
  const score = scoreOf(spot, c, tide);
  return {
    id: spot.id, name: spot.name, region: spot.region, tz: spot.tz, lat: spot.lat, lon: spot.lon,
    score, rating: rating(score).key,
    now: nowBlock(spot, c),
    tide: tideNow(tide, now),
  };
}

export async function overview() {
  const now = Date.now();
  const { source, spots: fc } = await forecastAll(SPOTS);
  const spots = await Promise.all(SPOTS.filter(s => fc[s.id]).map(s => summaryOf(s, fc[s.id], now)));
  return { updatedAt: now, forecastSource: source, spots };
}

// Agrupa las horas de luz por día local y busca la mejor ventana de cada día.
export function daysOf(spot, hours, sun) {
  const out = [];
  for (const s of sun) {
    const cells = hours.filter(h => h.t >= s.rise - 0.5 * H && h.t <= s.set);
    if (!cells.length) continue;
    const best = cells.reduce((a, b) => (b.score > a.score ? b : a));
    out.push({
      key: dayKey(s.rise, spot.tz), label: dayLabel(s.rise, spot.tz), rise: s.rise, set: s.set,
      cells: cells.map(h => ({ t: h.t, score: h.score })),
      maxH: Math.max(...cells.map(h => h.h ?? 0)),
      best: { t: best.t, score: best.score, h: best.h, T: best.T, dir: best.dir, wind: best.wind, windDir: best.windDir, windType: windType(best.wind, best.windDir, spot.facing).key },
    });
  }
  return out;
}

export async function forecastFor(spot, fc, now = Date.now(), opts) {
  const dayStart = startOfLocalDay(now, spot.tz);
  const end = dayStart + 8 * 24 * H;
  const tide = await tides(spot, fc, dayStart - 13 * H, end + 13 * H, opts);
  const hours = fc.hours
    .filter(h => h.t >= dayStart && h.t < end)
    .map(h => {
      const score = scoreOf(spot, h, tide);
      return { t: h.t, h: h.h, T: waveParts(h).T, dir: waveParts(h).dir, wind: h.wind, windDir: h.windDir, gust: h.gust, score, rating: rating(score).key };
    });
  const days = daysOf(spot, hours, fc.sun).filter(d => d.rise >= dayStart);
  return { tide, hours, days, dayStart };
}

// Residuo meteorológico previsto (modelo NIVMAR de Puertos del Estado) para la playa más cercana.
async function surge(spot, from, to) {
  try {
    const beach = await portus.nearestBeach(spot);
    if (!beach) return null;
    const rows = (await portus.beachLevel(beach)).filter(r => r.t >= from - H && r.t <= to + H);
    return rows.length ? { beach: beach.name, points: rows.map(r => [r.t, r.residual]) } : null;
  } catch (err) {
    console.warn(`[nivmar] ${spot.id}: ${err.message}`);
    return null;
  }
}

// Nivel medido por un mareógrafo de Puertos del Estado cercano al puerto de referencia (hasta 30 km:
// en esa distancia la marea es prácticamente la misma). Las lecturas llegan respecto al nivel medio
// del mar y se colocan sobre el nivel medio del puerto según el IHM, así sirven mareógrafos con
// cualquier cero. Solo se dibuja si su forma encaja con la predicción y el último dato es reciente.
async function observed(spot, tide, from, to) {
  if (tide.source !== "ihm" || !tide.port) return null;
  try {
    const candidates = (await portus.gaugesNear(tide.port)).slice(0, 3);
    const mslPort = await ihm.meanLevel(tide.port).catch(() => null);
    for (const gauge of candidates) {
      const series = await portus.gaugeSeries(gauge).catch(() => null);
      if (!series || Date.now() - series.points.at(-1)[0] > 3 * H) continue;
      const pts = series.points.filter(([t]) => t >= from - H && t <= to);
      const preds = pts.map(([t]) => tideAt(tide.times, tide.levels, t)?.h ?? null);
      const pairs = pts.map((p, i) => [p, preds[i]]).filter(([, pr]) => pr != null);
      if (pairs.length < 24) continue;
      // Referencia: el nivel medio del puerto; si la serie va respecto a su propia media de 24 h,
      // la media de la predicción en esas mismas horas.
      const offset = series.reference === "nivel medio" && mslPort != null
        ? mslPort
        : pairs.reduce((a, [, pr]) => a + pr, 0) / pairs.length;
      const diffs = pairs.map(([[, v], pr]) => v + offset - pr).sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      const spread = diffs.map(d => Math.abs(d - median)).sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
      if (Math.abs(median) > 0.6 || spread > 0.35) continue; // no encaja con la marea del puerto
      return {
        gauge: gauge.name,
        distKm: Math.round(km(spot, gauge)),
        samePort: gauge.distKm <= 6,
        points: pts.map(([t, v]) => [t, Math.round((v + offset) * 1000) / 1000]),
      };
    }
    return null;
  } catch (err) {
    console.warn(`[mareógrafo] ${tide.port.name}: ${err.message}`);
    return null;
  }
}

export async function detail(spot) {
  const now = Date.now();
  const { source, spots: all } = await forecastAll(SPOTS);
  const fc = all[spot.id];
  if (!fc) throw Object.assign(new Error("No hay previsión disponible para este spot ahora mismo"), { status: 503 });
  const [summary, f] = await Promise.all([summaryOf(spot, fc, now, { coef: true }), forecastFor(spot, fc, now, { coef: true })]);
  const todayEnd = f.dayStart + 24 * H;
  const sunToday = fc.sun.find(s => s.rise >= f.dayStart && s.rise < todayEnd) ?? null;
  // Temperatura del aire: si la previsión no la trae, la de MET Norway.
  if (summary.now.air == null) summary.now.air = await airTemperature(spot).catch(() => null);
  const [buoy, surgeDay, obs, meteo] = await Promise.all([
    portus.nearestReading(spot).catch(() => null),
    surge(spot, f.dayStart, todayEnd),
    observed(spot, f.tide, f.dayStart, todayEnd),
    portus.meteo(spot).catch(() => null),
  ]);
  return {
    ...summary,
    facing: spot.facing, tidePref: spot.tide, updatedAt: now, forecastSource: source,
    sun: sunToday,
    buoy,
    meteo,
    tideDay: {
      from: f.dayStart, to: todayEnd,
      ext: f.tide.ext.filter(e => e.t >= f.dayStart - 6 * H && e.t < todayEnd + 6 * H),
      points: f.tide.times.map((t, i) => [t, f.tide.levels[i]]).filter(([t]) => t >= f.dayStart - H && t <= todayEnd + H),
      surge: surgeDay,
      observed: obs,
    },
    hours: f.hours.filter(h => h.t >= now - H && h.t < now + 24 * H),
    days: f.days.slice(0, 7),
  };
}
