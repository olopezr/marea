// Combina las tres fuentes en las respuestas que consume la app y los avisos.
import { SPOTS } from "../public/js/spots.js";
import {
  rate,
  rating,
  windType,
  waveParts,
  tideExtremes,
  curveFromExtremes,
  tideAt,
  tideNorm,
  withCoefficients,
  coefficientAt,
  startOfLocalDay,
  dayKey,
  dayLabel,
  km,
} from "../public/js/surf.js";
import { forecastAll } from "./forecast.js";
import * as ihm from "./sources/ihm.js";
import * as portus from "./sources/portus.js";
import { airTemperature } from "./sources/metno.js";
import { pointWaves } from "./sources/openmeteo.js";
import * as aemet from "./sources/aemet.js";

const H = 3600e3;

// Marea oficial del IHM; si no responde, o no tiene puerto en la zona (Mediterráneo), la del modelo
// de Open-Meteo. `reason` lo distingue para explicarlo en la app.
// El coeficiente necesita tres meses de datos del puerto, así que solo se calcula en el detalle.
async function tides(spot, fc, from, to, { coef = false } = {}) {
  let reason = "down";
  try {
    const port = await ihm.nearestPort(spot);
    if (!port) {
      reason = "no-port";
      throw null;
    }
    const [raw, mean] = await Promise.all([
      ihm.extremes(port, from, to),
      coef ? ihm.meanRange(port).catch(() => null) : null,
    ]);
    if (raw.length >= 2) {
      const ext = withCoefficients(raw, mean);
      return {
        source: "ihm",
        port: { name: port.name, distKm: Math.round(port.distKm), lat: port.lat, lon: port.lon },
        ext,
        ...curveFromExtremes(ext, from, to),
      };
    }
  } catch (err) {
    if (err) console.warn(`[ihm] ${spot.id}: ${err.message}`);
  }
  const rows = fc.hours.filter((h) => h.seaLevel != null);
  const times = rows.map((h) => h.t),
    levels = rows.map((h) => h.seaLevel);
  return { source: "model", reason, port: null, ext: tideExtremes(times, levels), times, levels };
}

const scoreOf = (spot, x, tide) =>
  rate({
    ...waveParts(x),
    wind: x.wind,
    windDir: x.windDir,
    facing: spot.facing,
    tideNorm: tideNorm(tide.times, tide.levels, x.t),
    tidePref: spot.tide,
  });

function nowBlock(spot, c) {
  const w = waveParts(c);
  return {
    ...w,
    sh: c.sh,
    sT: c.sT,
    sDir: c.sDir,
    wind: c.wind,
    windDir: c.windDir,
    gust: c.gust,
    windType: windType(c.wind, c.windDir, spot.facing),
    air: c.air,
    water: c.water,
  };
}

function tideNow(tide, now) {
  const at = tideAt(tide.times, tide.levels, now);
  const next = tide.ext.find((e) => e.t > now) ?? null;
  const port = tide.port && { name: tide.port.name, distKm: tide.port.distKm };
  return {
    source: tide.source,
    ...(tide.reason ? { reason: tide.reason } : {}),
    port,
    h: at?.h ?? null,
    rising: at?.rising ?? null,
    next,
    coef: coefficientAt(tide.ext, now),
  };
}

function currentConditions(fc, now) {
  if (!fc.hours?.length) return { ...fc.current, t: now };
  const closest = fc.hours.reduce((a, b) => (Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a));
  const diffCurrent = Math.abs((fc.current?.t ?? 0) - now);
  const diffClosest = Math.abs(closest.t - now);
  const base = diffCurrent <= diffClosest ? fc.current : closest;
  return { ...base, t: now };
}

// La lista no consulta PORTUS (boyas, estaciones, mareógrafos): esos datos se cargan solo al abrir
// el detalle de un spot, para no lanzar decenas de peticiones a la vez contra su API.
async function summaryOf(spot, fc, now, opts = {}) {
  const tide = await tides(spot, fc, now - 13 * H, now + 13 * H, opts);
  const c = currentConditions(fc, now);
  const score = scoreOf(spot, c, tide);
  const warning = aemet.activeWarningFor(spot, now, opts?.warnings);
  return {
    id: spot.id,
    name: spot.name,
    region: spot.region,
    tz: spot.tz,
    lat: spot.lat,
    lon: spot.lon,
    score,
    rating: rating(score).key,
    now: nowBlock(spot, c),
    tide: tideNow(tide, now),
    warning,
  };
}

export async function overview() {
  const now = Date.now();
  const [{ source, spots: fc }, allWarn] = await Promise.all([forecastAll(SPOTS), aemet.allWarnings().catch(() => [])]);
  const spots = await Promise.all(
    SPOTS.filter((s) => fc[s.id]).map((s) => summaryOf(s, fc[s.id], now, { warnings: allWarn })),
  );
  return { updatedAt: now, forecastSource: source, spots };
}

// Agrupa las horas de luz por día local y busca la mejor ventana de cada día.
export function daysOf(spot, hours, sun) {
  const out = [];
  for (const s of sun) {
    const cells = hours.filter((h) => h.t >= s.rise - 0.5 * H && h.t <= s.set);
    if (!cells.length) continue;
    const best = cells.reduce((a, b) => (b.score > a.score ? b : a));
    out.push({
      key: dayKey(s.rise, spot.tz),
      label: dayLabel(s.rise, spot.tz),
      rise: s.rise,
      set: s.set,
      cells: cells.map((h) => ({ t: h.t, score: h.score })),
      maxH: Math.max(...cells.map((h) => h.h ?? 0)),
      best: {
        t: best.t,
        score: best.score,
        h: best.h,
        T: best.T,
        dir: best.dir,
        wind: best.wind,
        windDir: best.windDir,
        windType: windType(best.wind, best.windDir, spot.facing).key,
      },
    });
  }
  return out;
}

export async function forecastFor(spot, fc, now = Date.now(), opts) {
  const dayStart = startOfLocalDay(now, spot.tz);
  const end = dayStart + 8 * 24 * H;
  const tide = await tides(spot, fc, dayStart - 13 * H, end + 13 * H, opts);
  const hours = fc.hours
    .filter((h) => h.t >= dayStart && h.t < end)
    .map((h) => {
      const score = scoreOf(spot, h, tide);
      return {
        t: h.t,
        h: h.h,
        T: waveParts(h).T,
        dir: waveParts(h).dir,
        wind: h.wind,
        windDir: h.windDir,
        gust: h.gust,
        score,
        rating: rating(score).key,
      };
    });
  const days = daysOf(spot, hours, fc.sun).filter((d) => d.rise >= dayStart);
  return { tide, hours, days, dayStart };
}

// Residuo meteorológico previsto (modelo NIVMAR de Puertos del Estado) para la playa más cercana.
async function surge(spot, from, to) {
  try {
    const beach = await portus.nearestBeach(spot);
    if (!beach) return null;
    const rows = (await portus.beachLevel(beach)).filter((r) => r.t >= from - H && r.t <= to + H);
    return rows.length ? { beach: beach.name, points: rows.map((r) => [r.t, r.residual]) } : null;
  } catch (err) {
    console.warn(`[nivmar] ${spot.id}: ${err.message}`);
    return null;
  }
}

// Minutos que hay que desplazar la predicción para que encaje mejor con lo medido (−60…60).
function bestLag(points, tide) {
  let best = { lag: 0, err: Infinity };
  for (let lag = -60; lag <= 60; lag += 5) {
    const diffs = points
      .map(([t, v]) => {
        const p = tideAt(tide.times, tide.levels, t + lag * 60e3);
        return p ? v - p.h : null;
      })
      .filter((d) => d != null);
    if (diffs.length < 24) continue;
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const err = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / diffs.length;
    if (err < best.err) best = { lag, err };
  }
  return best.lag;
}

// Contrasta la previsión con lo medido por el mareógrafo:
//  - el efecto del viento y la presión (NIVMAR) solo se muestra si acerca la predicción a lo medido;
//  - si lo medido queda desplazado una cantidad fija (otro cero de referencia), se realinea sin
//    tocar su forma, para que la línea "medido" no aparente diferencias que no existen.
export function reconcile(tide, surgeDay, obs) {
  if (!obs?.points?.length) return { surge: surgeDay, observed: obs };
  const at = (pts, t) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [t0, v0] = pts[i],
        [t1, v1] = pts[i + 1];
      if (t >= t0 && t <= t1) return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v0;
    }
    return null;
  };
  const residuals = (withSurge) =>
    obs.points
      .map(([t, v]) => {
        const p = tideAt(tide.times, tide.levels, t)?.h;
        const r = withSurge ? at(surgeDay.points, t) : 0;
        return p == null || r == null || v == null ? null : v - p - r;
      })
      .filter((x) => x != null);
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const spread = (xs) => {
    const m = median(xs);
    return xs.reduce((a, x) => a + Math.abs(x - m), 0) / xs.length;
  };
  let surge = surgeDay;
  const base = residuals(false);
  if (surge && base.length >= 24) {
    const withS = residuals(true);
    if (withS.length < 24 || spread(withS) > spread(base) + 0.03) surge = null;
  }
  const res = surge ? residuals(true) : base;
  const shift = res.length >= 24 ? median(res) : 0;
  const observed =
    Math.abs(shift) > 0.15
      ? { ...obs, points: obs.points.map(([t, v]) => [t, Math.round((v - shift) * 1000) / 1000]) }
      : obs;
  return { surge, observed };
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
      const offset =
        series.reference === "nivel medio" && mslPort != null
          ? mslPort
          : pairs.reduce((a, [, pr]) => a + pr, 0) / pairs.length;
      const diffs = pairs.map(([[, v], pr]) => v + offset - pr).sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      const spread = diffs.map((d) => Math.abs(d - median)).sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
      if (Math.abs(median) > 0.6 || spread > 0.35) continue; // no encaja con la marea del puerto
      // Desfase: un mareógrafo dentro de un río o ría (p. ej. Bonanza, en el Guadalquivir) va con
      // retraso respecto a la playa abierta. Si hace falta mover la curva más de 15 min, no sirve.
      if (
        Math.abs(
          bestLag(
            pairs.map(([p]) => p),
            tide,
          ),
        ) > 15
      )
        continue;
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

// Índice UV de hoy (Open-Meteo): el de la hora en curso y el máximo del día con su hora.
// La previsión de respaldo de Puertos del Estado no lo trae: entonces es null.
export function uvToday(hours, now, from, to) {
  const day = hours.filter((h) => h.uv != null && h.t >= from && h.t < to);
  if (!day.length) return null;
  const cur = day.find((h) => h.t <= now && now < h.t + H);
  const max = day.reduce((a, b) => (b.uv > a.uv ? b : a));
  const r = (x) => Math.round(x * 10) / 10;
  return { now: cur ? r(cur.uv) : null, max: r(max.uv), maxT: max.t };
}

// Previsión en la posición de la boya y cuánto se ha desviado de lo medido en las últimas 24 h:
// `bias` > 0 si la boya mide más de lo previsto (el modelo se queda corto), `mae` el error medio.
export function forecastFit(history, model, now = Date.now()) {
  const byHour = new Map(model.map(([t, h]) => [Math.round(t / H), h]));
  const pairs = history
    .filter(([t]) => now - t <= 24 * H)
    .map(([t, h]) => [h, byHour.get(Math.round(t / H))])
    .filter(([, m]) => m != null);
  if (pairs.length < 6) return null;
  const r = (x) => Math.round(x * 100) / 100;
  return {
    bias: r(pairs.reduce((a, [h, m]) => a + h - m, 0) / pairs.length),
    mae: r(pairs.reduce((a, [h, m]) => a + Math.abs(h - m), 0) / pairs.length),
    n: pairs.length,
  };
}

async function withModel(buoy) {
  if (!buoy || buoy.buoy.lat == null) return buoy;
  const model = await pointWaves(buoy.buoy).catch(() => null);
  if (!model?.length) return { ...buoy, model: null, fit: null };
  return { ...buoy, model, fit: forecastFit(buoy.history ?? [], model) };
}

export async function detail(spot) {
  const now = Date.now();
  const { source, spots: all } = await forecastAll(SPOTS);
  const fc = all[spot.id];
  if (!fc) throw Object.assign(new Error("No hay previsión disponible para este spot ahora mismo"), { status: 503 });
  const [summary, f, warnings] = await Promise.all([
    summaryOf(spot, fc, now, { coef: true }),
    forecastFor(spot, fc, now, { coef: true }),
    aemet.warningsForSpot(spot, now, { fetchDetails: true }).catch(() => []),
  ]);
  const todayEnd = f.dayStart + 24 * H;
  const sunToday = fc.sun.find((s) => s.rise >= f.dayStart && s.rise < todayEnd) ?? null;
  // Temperatura del aire: si la previsión no la trae, la de MET Norway.
  if (summary.now.air == null) summary.now.air = await airTemperature(spot).catch(() => null);
  const [buoy, surgeRaw, obsRaw, meteo] = await Promise.all([
    portus
      .nearestReading(spot)
      .then(withModel)
      .catch(() => null),
    surge(spot, f.dayStart, todayEnd),
    observed(spot, f.tide, f.dayStart, todayEnd),
    portus.meteo(spot).catch(() => null),
  ]);
  const { surge: surgeDay, observed: obs } = reconcile(f.tide, surgeRaw, obsRaw);
  return {
    ...summary,
    facing: spot.facing,
    tidePref: spot.tide,
    updatedAt: now,
    forecastSource: source,
    sun: sunToday,
    uv: uvToday(fc.hours, now, f.dayStart, todayEnd),
    buoy,
    meteo,
    warnings,
    tideDay: {
      from: f.dayStart,
      to: todayEnd,
      ext: f.tide.ext.filter((e) => e.t >= f.dayStart - 6 * H && e.t < todayEnd + 6 * H),
      points: f.tide.times
        .map((t, i) => [t, f.tide.levels[i]])
        .filter(([t]) => t >= f.dayStart - H && t <= todayEnd + H),
      surge: surgeDay,
      observed: obs,
    },
    hours: f.hours.filter((h) => h.t >= now - H && h.t < now + 24 * H),
    days: f.days.slice(0, 7),
  };
}
