// Previsión de oleaje y viento (Open-Meteo). Una petición por API para todos los spots.
// Con OPEN_METEO_API_KEY se usan los servidores del plan comercial.
// Con OPEN_METEO_BASE_URL se puede redirigir a un proxy de caché (ej. Cloudflare Worker o Nginx).
import { cached, fetchJSON as get } from "../cache.js";

const KEY = process.env.OPEN_METEO_API_KEY;
// Secreto compartido con el proxy (PROXY_SECRET en el Worker). Solo se envía al proxy propio.
const PROXY_SECRET = process.env.OPEN_METEO_PROXY_SECRET;
const BASE_URL = process.env.OPEN_METEO_BASE_URL?.replace(/\/+$/, "");
const MARINE = BASE_URL
  ? `${BASE_URL}/v1/marine`
  : KEY
    ? "https://customer-marine-api.open-meteo.com/v1/marine"
    : "https://marine-api.open-meteo.com/v1/marine";
const WEATHER = BASE_URL
  ? `${BASE_URL}/v1/forecast`
  : KEY
    ? "https://customer-api.open-meteo.com/v1/forecast"
    : "https://api.open-meteo.com/v1/forecast";
const MARINE_VARS =
  "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_level_height_msl";
const WIND_VARS = "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m";
// Open-Meteo cuenta cada spot como una llamada. Con ~80 spots, un TTL de 2 horas reduce el consumo
// a ~2.000 llamadas al día (muy holgado dentro del límite gratuito de 10.000). Los modelos no
// actualizan más a menudo. Configurable con OPEN_METEO_TTL_HOURS.
const TTL = Math.max(1, Number(process.env.OPEN_METEO_TTL_HOURS) || 2) * 3600e3;

const fetchJSON = (u) => (BASE_URL && PROXY_SECRET ? get(u, { headers: { "X-Proxy-Secret": PROXY_SECRET } }) : get(u));
const utc = (s) => Date.parse(s + "Z");

// El oleaje se pide en un punto mar adentro, a OFFSHORE_KM en la dirección hacia la que mira la playa.
// Con la coordenada de la propia playa, Open-Meteo usa la celda de mar más cercana de su malla (~8 km),
// que a veces cae en otra vertiente (dentro de una ría, al otro lado de un cabo o de una isla) y da el
// oleaje de otra costa. El viento, la temperatura y el UV sí se piden en la playa.
// 8 km: con 5 km aún quedaban 3 playas (Ponzos, Cullera, La Cícer) con la celda fuera de su vertiente;
// con 8 km las 83 quedan frente a la playa (comprobado con la malla de Open-Meteo).
export const OFFSHORE_KM = 8;
export function offshorePoint(spot, km = OFFSHORE_KM) {
  const R = 6371,
    rad = (x) => (x * Math.PI) / 180,
    d = km / R,
    b = rad(spot.facing);
  const la = rad(spot.lat),
    lo = rad(spot.lon);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: Math.round(((la2 * 180) / Math.PI) * 1e4) / 1e4, lon: Math.round(((lo2 * 180) / Math.PI) * 1e4) / 1e4 };
}
const asArray = (x) => (Array.isArray(x) ? x : [x]);
const url = (base, params) => `${base}?${new URLSearchParams({ ...params, ...(KEY ? { apikey: KEY } : {}) })}`;

export function forecastAll(spots) {
  return cached("openmeteo:all", TTL, async () => {
    const coords = {
      latitude: spots.map((s) => s.lat).join(","),
      longitude: spots.map((s) => s.lon).join(","),
      timezone: "GMT",
    };
    const off = spots.map((s) => offshorePoint(s));
    const sea = {
      latitude: off.map((p) => p.lat).join(","),
      longitude: off.map((p) => p.lon).join(","),
      timezone: "GMT",
    };
    const [marine, weather] = await Promise.all([
      fetchJSON(
        url(MARINE, {
          ...sea,
          current: MARINE_VARS + ",sea_surface_temperature",
          hourly: MARINE_VARS + ",sea_surface_temperature",
          past_days: 1,
          forecast_days: 8,
          cell_selection: "sea",
        }),
      ),
      fetchJSON(
        url(WEATHER, {
          ...coords,
          current: WIND_VARS,
          hourly: WIND_VARS + ",uv_index",
          daily: "sunrise,sunset",
          wind_speed_unit: "kn",
          past_days: 1,
          forecast_days: 8,
        }),
      ),
    ]);
    const m = asArray(marine),
      w = asArray(weather);
    return Object.fromEntries(spots.map((s, i) => [s.id, normalize(m[i], w[i])]));
  });
}

function normalize(m, w) {
  const windIdx = new Map(w.hourly.time.map((t, i) => [t, i]));
  const hours = m.hourly.time.map((t, i) => {
    const j = windIdx.get(t);
    const W = (k) => (j == null ? null : w.hourly[k][j]);
    return {
      t: utc(t),
      h: m.hourly.wave_height[i],
      T: m.hourly.wave_period[i],
      dir: m.hourly.wave_direction[i],
      sh: m.hourly.swell_wave_height[i],
      sT: m.hourly.swell_wave_period[i],
      sDir: m.hourly.swell_wave_direction[i],
      seaLevel: m.hourly.sea_level_height_msl[i],
      water: m.hourly.sea_surface_temperature[i],
      wind: W("wind_speed_10m"),
      windDir: W("wind_direction_10m"),
      gust: W("wind_gusts_10m"),
      air: W("temperature_2m"),
      uv: W("uv_index") ?? null,
    };
  });
  const c = m.current,
    cw = w.current;
  return {
    current: {
      t: utc(c.time),
      h: c.wave_height,
      T: c.wave_period,
      dir: c.wave_direction,
      sh: c.swell_wave_height,
      sT: c.swell_wave_period,
      sDir: c.swell_wave_direction,
      seaLevel: c.sea_level_height_msl,
      water: c.sea_surface_temperature,
      wind: cw.wind_speed_10m,
      windDir: cw.wind_direction_10m,
      gust: cw.wind_gusts_10m,
      air: cw.temperature_2m,
    },
    hours,
    sun: w.daily.time.map((_, i) => ({ rise: utc(w.daily.sunrise[i]), set: utc(w.daily.sunset[i]) })),
  };
}

// Oleaje previsto en la posición de una boya, de hace 48 h a dentro de 24 h, para compararlo con lo medido.
// Es el mismo modelo que da la previsión de los spots: así se ve si la previsión de hoy está acertando.
export function pointWaves({ lat, lon }) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  return cached(`openmeteo:point:${key}`, TTL, async () => {
    const d = await fetchJSON(
      url(MARINE, {
        latitude: lat,
        longitude: lon,
        timezone: "GMT",
        hourly: "wave_height",
        past_days: 2,
        forecast_days: 2,
        cell_selection: "sea",
      }),
    );
    const now = Date.now();
    return d.hourly.time
      .map((t, i) => [utc(t), d.hourly.wave_height[i]])
      .filter(([t, h]) => h != null && t >= now - 49 * 3600e3 && t <= now + 25 * 3600e3);
  });
}
