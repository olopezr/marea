// Previsión de oleaje y viento de todos los spots.
// Fuente principal: Open-Meteo (7 días). Si no responde o limita las peticiones (en alojamientos
// gratuitos la dirección de salida se comparte con muchas otras apps y Open-Meteo puede bloquearla),
// se usa el modelo de Puertos del Estado en el punto más cercano a cada spot (3 días).
import { cached } from "./cache.js";
import { sunTimes } from "../public/js/surf.js";
import { forecastAll as openMeteo } from "./sources/openmeteo.js";
import { spotForecast } from "./sources/portus.js";

const DAY = 86400e3;

function portusAll(spots) {
  return cached("forecast:portus", 60 * 60e3, async () => {
    const now = Date.now();
    const entries = await Promise.all(
      spots.map(async (s) => {
        const rows = await spotForecast(s).catch(() => null);
        if (!rows?.length) return [s.id, null];
        const hours = rows.map((r) => ({
          // Algunas mallas (p. ej. Rías Baixas) dan la altura del mar de fondo pero no su periodo ni
          // dirección: se usan los del oleaje total, casi iguales cuando domina el mar de fondo.
          t: r.t,
          h: r.h,
          T: r.Tz ?? r.Tp,
          dir: r.dir,
          sh: r.sh,
          sT: r.sT ?? r.Tz ?? r.Tp,
          sDir: r.sDir ?? r.dir,
          seaLevel: null,
          water: null,
          wind: r.wind,
          windDir: r.windDir,
          gust: null,
          air: null,
        }));
        const current = hours.reduce((a, b) => (Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a));
        const sun = [];
        for (let d = Math.floor((now - DAY) / DAY) * DAY; d < now + 8 * DAY; d += DAY) {
          const st = sunTimes(d + DAY / 2, s.lat, s.lon);
          if (st) sun.push(st);
        }
        return [s.id, { current: { ...current, t: now }, hours, sun }];
      }),
    );
    const data = Object.fromEntries(entries);
    if (!Object.values(data).some(Boolean)) throw new Error("Puertos del Estado tampoco responde");
    return data;
  });
}

export async function forecastAll(spots) {
  try {
    return { source: "open-meteo", spots: await openMeteo(spots) };
  } catch (err) {
    console.warn(`[previsión] Open-Meteo no disponible (${err.message}); se usa Puertos del Estado`);
    return { source: "portus", spots: await portusAll(spots) };
  }
}
