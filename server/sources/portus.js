// Medidas reales de las boyas de Puertos del Estado (PORTUS).
// Es la API que usa portus.puertos.es; no está documentada públicamente, así que todo se valida
// y, si algo falla, la app sigue funcionando sin boya.
// Los campos de estado de la API (`disponible`, `incidencia`) no son fiables: hay boyas marcadas
// "En tierra" que transmiten. Por eso no se filtra por ellos: una boya se usa si su dato es reciente,
// plausible y está en su posición nominal. Así, una boya que vuelve a funcionar se usa en cuanto
// envía datos, aunque PORTUS aún no haya actualizado su estado.
import { cached, limiter } from "../cache.js";
import { km } from "../../public/js/surf.js";

const API = "https://portus.puertos.es/portussvr/api";
const KN = 1.943844; // m/s → nudos
const MAX_KM = 100;
const FAR_KM = 300;
const MAX_DRIFT_KM = 15;
const MAX_AGE = 3 * 3600e3;

export function buoys() {
  return cached("portus:buoys", 6 * 3600e3, async () => {
    const list = await request(`${API}/estaciones/rt/WAVE?locale=es`);
    return list
      .filter(s => s.boya && s.red?.tipoRed !== "PROPAGACION")
      .map(s => ({ id: s.id, name: s.nombre.replace(/^Boya (Costera )?de /, "").replace(/\s*-\s*/g, "-"), lat: s.latitud, lon: s.longitud, deep: s.red?.tipoRed === "REDEXT" }));
  });
}

async function lastData(id, variable) {
  const d = await post(`lastData/station/${id}?locale=es`, [variable]);
  if (!d.fecha || !d.datos?.length) return null;
  // Los valores marcados como avería (`averia`) se descartan.
  const v = Object.fromEntries(d.datos.map(x => [x.nombreColumna, x.valor == null || x.averia ? null : +x.valor / x.factor]));
  return { t: parseDate(d.fecha), v };
}

// Las fechas de PORTUS van en UTC: "2026-10-02 05:00:00.0".
const parseDate = s => Date.parse(s.replace(" ", "T").replace(/\.\d+$/, "") + "Z");

// PORTUS falla si recibe muchas peticiones a la vez: como mucho 4 simultáneas y un reintento.
const request = limiter(4);
const post = (path, body) => request(`${API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const cleanName = n => n.replace(/^(Boya (Costera )?de |Mare[oó]grafo (de )?|Estaci[oó]n Meteorol[oó]gica (de )?)/i, "").replace(/\s*\([^)]*\)$/, "");

function reading(buoy) {
  return cached(`portus:read:${buoy.id}`, 15 * 60e3, async () => {
    const [wave, temp] = await Promise.all([lastData(buoy.id, "WAVE"), lastData(buoy.id, "WATER_TEMP").catch(() => null)]);
    if (!wave || Date.now() - wave.t > MAX_AGE) return null;
    const { hm0, tp, lat, lon } = wave.v;
    if (!(hm0 > 0 && hm0 < 20) || (tp != null && !(tp > 1 && tp < 30))) return null;
    if (lat != null && lon != null && km(buoy, { lat, lon }) > MAX_DRIFT_KM) return null; // a la deriva
    return {
      t: wave.t,
      h: wave.v.hm0, hmax: wave.v.hmax ?? null, Tp: wave.v.tp ?? null, Tm: wave.v.tm02 ?? null, dir: wave.v.dmd ?? null,
      water: temp && Date.now() - temp.t < MAX_AGE ? temp.v.ts2 ?? temp.v.ts ?? null : null,
    };
  }, { staleMs: MAX_AGE });
}

// ---------- Predicción de oleaje en la posición de cada boya (modelo de Puertos del Estado) ----------
// PORTUS tiene un punto de su modelo de oleaje asociado a cada boya (`codigoEstacion`), con 72 h de
// predicción horaria. El modelo da la dirección hacia la que va el oleaje: se le suman 180° para
// expresarla, como las boyas, de dónde viene (comprobado con Pasaia II: medido 319°, previsto 135°+180°).

// Todos los puntos del modelo de oleaje de PORTUS (Atlántico y Mediterráneo).
function wanaPoints() {
  return cached("portus:wana", 7 * 24 * 3600e3, async () => {
    const lists = await Promise.all(["atl", "med"].map(r => request(`${API}/puntosMalla/portus/pred/Wana/${r}`).catch(() => [])));
    return lists.flat().map(p => ({ id: p.id, lat: p.latitud, lon: p.longitud, station: p.codigoEstacion, grid: p.malla }));
  });
}

// Predicción horaria (72 h) de un punto del modelo: oleaje total, mar de fondo y viento.
// Las direcciones del modelo indican hacia dónde va; se convierten a de dónde viene.
function pointForecast(pointId) {
  return cached(`portus:point:${pointId}`, 60 * 60e3, async () => {
    const rows = await request(`${API}/predData/portus/WAVE/${pointId}?locale=es`);
    return rows.map(r => {
      const g = (variable, name) => {
        const x = r.datos.find(d => d.variableParametro === variable && d.nombreParametro === name);
        return x?.valor == null ? null : +x.valor;
      };
      const from = d => (d == null ? null : (d + 180) % 360);
      const wind = g("VIENTO", "Vv(m/s)");
      return {
        t: parseDate(r.fecha),
        h: g("Mar total", "Hs(m)"), Tp: g("Mar total", "Tp(s)"), Tz: g("Mar total", "Tz(s)"), dir: from(g("Mar total", "Dir")),
        sh: g("Mar de fondo", "Hs(m)"), sT: g("Mar de fondo", "Tz(s)"), sDir: from(g("Mar de fondo", "Dir")),
        wind: wind == null ? null : wind * KN, windDir: from(g("VIENTO", "Dir")),
      };
    }).filter(r => r.h != null);
  }, { staleMs: 6 * 3600e3 });
}

export async function buoyForecast(buoyId) {
  const point = (await wanaPoints()).find(p => p.station === buoyId);
  return point ? pointForecast(point.id) : null;
}

// Previsión de PORTUS en el punto de mar abierto más cercano a un spot (a menos de 30 km).
// Se excluyen las mallas de detalle de los puertos ("A" + número: agitación en el interior;
// "S" + número: aproximación a puerto), cuyo oleaje no representa una playa abierta.
export async function spotForecast(spot) {
  const point = (await wanaPoints())
    .filter(p => !/^[AS]\d/.test(p.grid ?? ""))
    .map(p => ({ ...p, distKm: km(spot, p) }))
    .sort((a, b) => a.distKm - b.distKm)[0];
  if (!point || point.distKm > 30) return null;
  return pointForecast(point.id);
}

// Valor previsto más cercano a un instante (las predicciones son horarias).
export const forecastAt = (series, t) =>
  series?.length ? series.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)) : null;

// Lectura de la boya operativa más cercana al spot (prueba hasta 3 candidatas a menos de 100 km).
// Si no hay ninguna, usa la boya de aguas profundas más cercana (hasta 300 km) marcada como lejana:
// sirve como referencia del mar de fondo que llega a la zona, no del oleaje en la playa.
export async function nearestReading(spot) {
  const all = (await buoys()).map(b => ({ ...b, distKm: km(spot, b) })).sort((a, b) => a.distKm - b.distKm);
  const tryList = async (list, far) => {
    for (const b of list) {
      const r = await reading(b).catch(() => null);
      if (r) {
        const series = await buoyForecast(b.id).catch(() => null);
        const p = forecastAt(series, r.t);
        const predicted = p && Math.abs(p.t - r.t) <= 90 * 60e3 ? { h: p.h, Tp: p.Tp, dir: p.dir } : null;
        return { buoy: { id: b.id, name: b.name, distKm: Math.round(b.distKm), deep: b.deep, far }, ...r, predicted };
      }
    }
    return null;
  };
  const result = (await tryList(all.filter(b => b.distKm <= MAX_KM).slice(0, 3), false))
    ?? await tryList(all.filter(b => b.deep && b.distKm > MAX_KM && b.distKm <= FAR_KM).slice(0, 2), true);
  // `fallback`: la boya mostrada no es la más cercana al spot (la más cercana no envía datos) o no hay
  // ninguna a menos de 100 km. En ambos casos el dato puede no representar bien la playa.
  if (result) {
    const closest = all[0];
    const fallback = result.buoy.far || (closest && closest.id !== result.buoy.id);
    result.buoy.fallback = Boolean(fallback);
    result.buoy.closest = fallback && closest && closest.id !== result.buoy.id && closest.distKm <= MAX_KM
      ? { name: closest.name, distKm: Math.round(closest.distKm) } : null;
  }
  return result;
}

// ---------- Previsión del nivel del mar por playa (modelo NIVMAR de Puertos del Estado) ----------
// Incluye la marea astronómica y el residuo meteorológico (lo que viento y presión suben o bajan el mar).

export function beaches() {
  return cached("portus:beaches", 7 * 24 * 3600e3, async () =>
    (await request(`${API}/ubicaciones/nivmar/Playa`)).map(b => ({ id: b.id, name: b.nombre, lat: b.latitud, lon: b.longitud })));
}

export async function nearestBeach(spot, maxKm = 8) {
  const best = (await beaches()).map(b => ({ ...b, distKm: km(spot, b) })).sort((a, b) => a.distKm - b.distKm)[0];
  return best && best.distKm <= maxKm ? best : null;
}

export function beachLevel(beach) {
  return cached(`portus:nivmar:${beach.id}`, 60 * 60e3, async () => {
    const rows = await request(`${API}/predData/portus/SEA_LEVEL/${beach.id}?locale=es`);
    return rows.map(r => {
      const v = Object.fromEntries(r.datos.map(x => [x.nombreParametro, x.valor == null ? null : +x.valor]));
      return { t: parseDate(r.fecha), level: v["Nivel (m)"], tide: v["Marea (m)"], residual: v["Residuo (m)"], pressure: v["Presión (mb)"] };
    }).filter(r => r.residual != null);
  });
}

// ---------- Mareógrafos: nivel del mar medido cada minuto ----------

export function gauges() {
  return cached("portus:gauges", 24 * 3600e3, async () =>
    (await request(`${API}/estaciones/rt/SEA_LEVEL?locale=es`))
      .filter(s => s.disponible)
      .map(s => ({ id: s.id, name: cleanName(s.nombre), lat: s.latitud, lon: s.longitud })));
}

// Mareógrafos cercanos a un puerto de referencia, del más cercano al más lejano.
export async function gaugesNear(port, maxKm = 30) {
  return (await gauges()).map(g => ({ ...g, distKm: km(port, g) })).filter(g => g.distKm <= maxKm).sort((a, b) => a.distKm - b.distKm);
}

// Últimas 24 h cada 5 min, como altura respecto al nivel medio del mar, para poder compararla con
// cualquier predicción sea cual sea el cero de cada mareógrafo. Si el mareógrafo publica su nivel
// sobre el nivel medio (`nivelMedio`) se usa ese; si no, su nivel menos su propia media de 24 h.
export function gaugeSeries(gauge) {
  return cached(`portus:gauge:${gauge.id}`, 5 * 60e3, async () => {
    const params = await cached(`portus:params:${gauge.id}`, 7 * 24 * 3600e3, () => post(`parametros/${gauge.id}?locale=es`, ["SEA_LEVEL"]));
    const rows = (await post(`RTData/station/${gauge.id}?locale=es`, params.map(p => p.id)))
      .map(r => ({ t: parseDate(r.fecha), d: Object.fromEntries(r.datos.map(x => [x.nombreColumna, x.valor == null || x.averia ? null : +x.valor / x.factor])) }))
      .filter(r => Math.floor(r.t / 60e3) % 5 === 0)
      .sort((a, b) => a.t - b.t);
    const withMean = rows.filter(r => r.d.nivelMedio != null);
    if (withMean.length >= rows.length * 0.8 && withMean.length > 12) {
      return { reference: "nivel medio", points: withMean.map(r => [r.t, r.d.nivelMedio]) };
    }
    const raw = rows.filter(r => r.d.nivel != null);
    if (raw.length < 12) return null;
    const mean = raw.reduce((a, r) => a + r.d.nivel, 0) / raw.length;
    return { reference: "media de 24 h", points: raw.map(r => [r.t, r.d.nivel - mean]) };
  }, { staleMs: 30 * 60e3 });
}

// ---------- Estaciones meteorológicas y boyas: viento, temperatura del aire y presión ----------

function stations(variable) {
  return cached(`portus:stations:${variable}`, 24 * 3600e3, async () =>
    (await request(`${API}/estaciones/rt/${variable}?locale=es`))
      .filter(s => s.disponible)
      .map(s => ({ id: s.id, name: cleanName(s.nombre), lat: s.latitud, lon: s.longitud })));
}

const METEO = {
  WIND: v => (v.vv_md == null ? null : { wind: v.vv_md * KN, windDir: v.dv_md ?? null, gust: v.vv_mx != null ? v.vv_mx * KN : null }),
  // Un 0 exacto suele ser un sensor averiado que la API no marca (estación del puerto exterior de Ferrol).
  AIR_TEMP: v => (v.ta == null || v.ta === 0 || v.ta < -10 || v.ta > 45 ? null : { air: v.ta }),
  AIR_PRESURE: v => (v.ps == null || v.ps < 900 || v.ps > 1080 ? null : { pressure: v.ps }),
};

async function nearestMeteo(spot, variable, maxKm = 40) {
  const list = (await stations(variable)).map(s => ({ ...s, distKm: km(spot, s) })).filter(s => s.distKm <= maxKm).sort((a, b) => a.distKm - b.distKm).slice(0, 3);
  for (const s of list) {
    const r = await cached(`portus:meteo:${variable}:${s.id}`, 15 * 60e3, () => lastData(s.id, variable)).catch(() => null);
    const value = r && Date.now() - r.t < MAX_AGE ? METEO[variable](r.v) : null;
    if (value) return { ...value, t: r.t, station: { name: s.name, distKm: Math.round(s.distKm) } };
  }
  return null;
}

// Viento, temperatura del aire y presión medidos más cerca del spot.
export async function meteo(spot) {
  const [wind, air, pressure] = await Promise.all(["WIND", "AIR_TEMP", "AIR_PRESURE"].map(v => nearestMeteo(spot, v).catch(() => null)));
  return wind || air || pressure ? { wind, air, pressure } : null;
}
