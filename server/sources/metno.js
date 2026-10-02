// Temperatura del aire de MET Norway (Instituto Meteorológico de Noruega): gratuito, sin clave, con
// cobertura en toda España. Se usa solo cuando falta este dato (p. ej. con la previsión de respaldo).
// Exige identificarse con un User-Agent con contacto. Datos bajo licencia CC BY 4.0.
import { cached, fetchJSON } from "../cache.js";

const API = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const UA = "MareaSurf/1.0 https://github.com/olopezr/marea";

export function airTemperature(spot) {
  return cached(`metno:${spot.id}`, 60 * 60e3, async () => {
    const d = await fetchJSON(`${API}?lat=${spot.lat.toFixed(3)}&lon=${spot.lon.toFixed(3)}`, { headers: { "User-Agent": UA } });
    const now = Date.now();
    const series = d.properties.timeseries.map(x => ({ t: Date.parse(x.time), air: x.data.instant.details.air_temperature }));
    const current = series.reduce((a, b) => (Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a));
    return current.air ?? null;
  }, { staleMs: 6 * 3600e3 });
}
