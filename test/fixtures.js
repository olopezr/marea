// Respuestas sintéticas de Open-Meteo, IHM y Puertos del Estado para tests sin red.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Cada archivo de test usa su propia carpeta de datos: nunca escribe en data/ del proyecto.
process.env.DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), "marea-test-"));

const H = 3600e3;
const iso = ms => new Date(ms).toISOString().slice(0, 16);

export function installFetch(opts = {}) {
  const { ihmFail = false, buoy = {}, wave = 1.8, period = 12, wind = 4, windDir = 150 } = opts;
  const calls = [];
  const flakySeen = new Set();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push(url.href);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (url.host.includes("open-meteo.com")) {
      const lats = url.searchParams.get("latitude").split(",");
      const start = Math.floor(Date.now() / H) * H - 24 * H;
      const times = Array.from({ length: 9 * 24 }, (_, i) => iso(start + i * H));
      const days = Array.from({ length: 9 }, (_, i) => new Date(start + i * 24 * H).toISOString().slice(0, 10));
      const marine = url.pathname.includes("marine");
      const one = () => marine ? {
        utc_offset_seconds: 0,
        current: { time: iso(Date.now()), wave_height: wave, wave_period: period - 2, wave_direction: 320, swell_wave_height: wave, swell_wave_period: period, swell_wave_direction: 320, sea_level_height_msl: 0.2, sea_surface_temperature: 18.5 },
        hourly: {
          time: times,
          wave_height: times.map(() => wave), wave_period: times.map(() => period - 2), wave_direction: times.map(() => 320),
          swell_wave_height: times.map(() => wave), swell_wave_period: times.map(() => period), swell_wave_direction: times.map(() => 320),
          sea_level_height_msl: times.map((_, i) => 1.5 * Math.sin((2 * Math.PI * i) / 12.42)), sea_surface_temperature: times.map(() => 18.5),
        },
      } : {
        utc_offset_seconds: 0,
        current: { time: iso(Date.now()), wind_speed_10m: wind, wind_direction_10m: windDir, wind_gusts_10m: wind + 3, temperature_2m: 17 },
        hourly: { time: times, wind_speed_10m: times.map(() => wind), wind_direction_10m: times.map(() => windDir), wind_gusts_10m: times.map(() => wind + 3), temperature_2m: times.map(() => 17) },
        daily: { time: days, sunrise: days.map(d => `${d}T06:00`), sunset: days.map(d => `${d}T18:30`) },
      };
      return json(lats.length > 1 ? lats.map(one) : one());
    }

    if (url.host === "ideihm.covam.es") {
      if (ihmFail) return new Response("caído", { status: 503 });
      if (url.searchParams.get("request") === "getlist") {
        return json({ estaciones: { puertos: [
          { id: "20", puerto: "Santander", lat: "43.461", lon: "-3.791" },
          { id: "53", puerto: "Arrecife (Lanzarote)", lat: "28.966", lon: "-13.530" },
        ] } });
      }
      // Mes completo: extremos cada 6 h 12 min, en hora local del puerto.
      const m = url.searchParams.get("month");
      const y = +m.slice(0, 4), mo = +m.slice(4, 6);
      const marea = [];
      for (let t = Date.UTC(y, mo - 1, 1, 3, 0), i = 0; new Date(t).getUTCMonth() === mo - 1; t += 372 * 60e3, i++) {
        const d = new Date(t);
        marea.push({ fecha: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16), altura: i % 2 ? "1.000" : "4.000", tipo: i % 2 ? "bajamar" : "pleamar" });
      }
      return json({ mareas: { datos: { marea } } });
    }

    if (url.host === "portus.puertos.es") {
      // Simula que PORTUS rechaza la primera petición de cada lectura (el servidor debe reintentar).
      if (opts.flaky && init.body && !flakySeen.has(url.pathname + init.body)) {
        flakySeen.add(url.pathname + init.body);
        return new Response("ocupado", { status: 503 });
      }
      const pDate = ms => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + ".0";
      if (url.pathname.endsWith("/ubicaciones/nivmar/Playa")) {
        return json([{ id: 31126, nombre: "Somo (Ribamontan al Mar", latitud: 43.46, longitud: -3.735 }]);
      }
      if (url.pathname.includes("/predData/portus/SEA_LEVEL/")) {
        const start = Math.floor(Date.now() / 86400e3) * 86400e3 - 86400e3;
        return json(Array.from({ length: 96 }, (_, i) => ({ fecha: pDate(start + i * H), datos: [
          { nombreParametro: "Nivel (m)", valor: "0.1" }, { nombreParametro: "Marea (m)", valor: "0.0" },
          { nombreParametro: "Residuo (m)", valor: String(opts.surge ?? 0.12) }, { nombreParametro: "Presión (mb)", valor: "1004" }] })));
      }
      // Punto del modelo de oleaje asociado a la boya de prueba (900) y su predicción horaria.
      if (url.pathname.endsWith("/puntosMalla/portus/pred/Wana/atl")) return json([{ id: 555, codigoEstacion: 900 }, { id: 556, codigoEstacion: -1 }]);
      if (url.pathname.endsWith("/puntosMalla/portus/pred/Wana/med")) return json([]);
      if (url.pathname.includes("/predData/portus/WAVE/555")) {
        const start = Math.floor(Date.now() / 3600e3) * 3600e3 - 24 * H;
        return json(Array.from({ length: 96 }, (_, i) => ({ fecha: pDate(start + i * H), datos: [
          { nombreParametro: "Hs(m)", variableParametro: "Mar total", valor: "2.0" },
          { nombreParametro: "Dir", variableParametro: "Mar total", valor: "135" },
          { nombreParametro: "Tp(s)", variableParametro: "Mar total", valor: "14" },
          { nombreParametro: "Hs(m)", variableParametro: "Mar de fondo", valor: "1.9" },
          { nombreParametro: "Dir", variableParametro: "Mar de fondo", valor: "130" }] })));
      }
      if (url.pathname.endsWith("/estaciones/rt/SEA_LEVEL")) {
        return json([{ id: 3109, nombre: "Mareografo de Santander 2", latitud: 43.4613, longitud: -3.7908, disponible: true }]);
      }
      if (url.pathname.includes("/parametros/")) return json([{ id: 27 }]);
      if (url.pathname.includes("/RTData/station/")) {
        // 24 h de lecturas por minuto respecto al nivel medio, siguiendo la misma marea que la tabla
        // simulada del IHM (pleamar 4 m y bajamar 1 m cada 6 h 12 min desde el día 1 a las 03:00 UTC).
        // gaugeWild: lecturas que no se parecen a la marea (deben descartarse).
        const tide = t => {
          const d = new Date(t), t0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 3, 0);
          return 1.5 * Math.cos((Math.PI * (t - t0)) / (372 * 60e3));
        };
        return json(Array.from({ length: 1440 }, (_, i) => {
          const t = Math.floor(Date.now() / 60e3) * 60e3 - i * 60e3;
          const v = opts.gaugeWild ? (i % 10 < 5 ? 2 : -2) : tide(t) + (opts.gaugeOffset ?? 0);
          return { fecha: pDate(t), datos: [
            { nombreColumna: "nivel", valor: String(Math.round((v + 3) * 1000)), factor: 1000 },
            { nombreColumna: "nivelMedio", valor: String(Math.round(v * 1000)), factor: 1000 }] };
        }));
      }
      if (/\/estaciones\/rt\/(WIND|AIR_TEMP|AIR_PRESURE)$/.test(url.pathname)) {
        return json([{ id: 4136, nombre: "Estacion Meteorologica de Prueba (APB-2)", latitud: 43.5, longitud: -3.7, disponible: true }]);
      }
      if (url.pathname.endsWith("/estaciones/rt/WAVE")) {
        return json([
          // Marcada como no disponible pero transmitiendo: debe usarse igualmente.
          { id: 900, nombre: "Boya de Prueba", latitud: 43.6, longitud: -3.7, boya: true, disponible: opts.buoyFlag ?? true, incidencia: "En tierra", red: { tipoRed: "REDEXT" } },
          // Más cercana a Somo pero sin datos (averiada): debe saltarse.
          ...(opts.brokenNearby ? [{ id: 901, nombre: "Boya de Rota", latitud: 43.47, longitud: -3.74, boya: true, disponible: false, incidencia: "Accidente", red: { tipoRed: "REDCOS" } }] : []),
        ]);
      }
      const variable = JSON.parse(init.body)[0];
      if (url.pathname.endsWith("/lastData/station/901")) return json({ fecha: null, datos: [] });
      const t = new Date(Date.now() - (buoy.ageMin ?? 30) * 60e3).toISOString().replace("T", " ").slice(0, 19) + ".0";
      const pos = [{ nombreColumna: "lat", valor: String(buoy.lat ?? 43.6), factor: 1 }, { nombreColumna: "lon", valor: String(buoy.lon ?? -3.7), factor: 1 }];
      if (variable === "WAVE") return json({ fecha: t, datos: [{ nombreColumna: "hm0", valor: "250", factor: 100 }, { nombreColumna: "tp", valor: "1400", factor: 100 }, { nombreColumna: "dmd", valor: "315", factor: 1 }, ...pos] });
      if (variable === "WATER_TEMP") return json({ fecha: t, datos: [{ nombreColumna: "ts2", valor: "1950", factor: 100 }, ...pos] });
      if (variable === "WIND") return json({ fecha: t, datos: [{ nombreColumna: "vv_md", valor: "500", factor: 100 }, { nombreColumna: "dv_md", valor: "170", factor: 1 }, { nombreColumna: "vv_mx", valor: "800", factor: 100 }] });
      if (variable === "AIR_TEMP") return json({ fecha: t, datos: [{ nombreColumna: "ta", valor: "1850", factor: 100 }] });
      if (variable === "AIR_PRESURE") return json({ fecha: t, datos: [{ nombreColumna: "ps", valor: "9500", factor: 10, averia: true }] });
    }
    return new Response("no encontrado", { status: 404 });
  };
  return calls;
}
