import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

const calls = installFetch();
const { overview, detail } = await import("../server/conditions.js");
const { spotById, SPOTS } = await import("../public/js/spots.js");

test("overview combina previsión y marea oficial sin consultar PORTUS", async () => {
  const o = await overview();
  assert.equal(o.spots.length, SPOTS.length);
  const somo = o.spots.find((s) => s.id === "somo");
  assert.equal(somo.tide.source, "ihm");
  assert.equal(somo.tide.port.name, "Santander");
  assert.ok(somo.tide.next && somo.tide.next.t > Date.now());
  assert.ok(somo.score >= 3, `terral suave con 1,8 m a 12 s debería ser bueno, fue ${somo.score}`);
  assert.equal(somo.buoy, undefined, "la lista no trae boya");
  assert.equal(calls.filter((u) => u.includes("portus.puertos.es")).length, 0, "la lista no llama a PORTUS");
});

test("la boya se carga al abrir el detalle", async () => {
  const somo = await detail(spotById.somo);
  assert.equal(somo.buoy.buoy.name, "Prueba");
  assert.equal(somo.buoy.h, 2.5);
  assert.equal(somo.buoy.Tp, 14);
  assert.equal(somo.buoy.water, 19.5);
  assert.equal(somo.buoy.buoy.far, false);
  assert.equal(somo.buoy.buoy.fallback, false, "es la boya más cercana");
  // Tapia está a ~260 km: no hay boya cercana, se usa la de aguas profundas marcada como lejana.
  const tapia = (await detail(spotById.tapia)).buoy;
  assert.equal(tapia.buoy.far, true);
  assert.equal(tapia.buoy.fallback, true, "sin boya cercana también se marca");
  assert.ok(tapia.buoy.distKm > 100 && tapia.buoy.distKm <= 300);
  // Canarias queda a más de 300 km de cualquier boya de la prueba.
  assert.equal((await detail(spotById.famara)).buoy, null);
});

test("las fuentes se piden una vez y se reutilizan desde la caché", async () => {
  const before = calls.length;
  await overview();
  assert.equal(calls.length, before, "una segunda llamada no debe tocar la red");
  // Las peticiones de un solo punto son la previsión en la posición de la boya (detalle).
  assert.equal(
    calls.filter((u) => u.includes("open-meteo") && new URL(u).searchParams.get("latitude").includes(",")).length,
    2,
    "una petición por API para todos los spots",
  );
});

test("detail devuelve curva del día, 24 h y 7 días ordenados", async () => {
  const d = await detail(spotById.somo);
  assert.ok(d.tideDay.points.length > 90, "curva cada 15 min");
  assert.ok(d.tideDay.ext.length >= 3);
  assert.ok(d.hours.length >= 24 && d.hours.length <= 25);
  assert.ok(d.days.length >= 6 && d.days.length <= 7);
  for (let i = 1; i < d.days.length; i++) assert.ok(d.days[i].rise > d.days[i - 1].rise);
  assert.ok(d.days.every((day) => day.cells.length > 0 && day.best.score >= 0));
  assert.ok(d.sun && d.sun.rise < d.sun.set);
});

test("las horas del IHM se interpretan en UTC", async () => {
  const d = await detail(spotById.somo);
  const e = d.tideDay.ext[0];
  const first = new Date(e.t);
  const origin = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1, 3, 0);
  assert.equal((e.t - origin) % (372 * 60e3), 0, "coincide con la rejilla UTC de la tabla simulada");
});

test("detail añade coeficientes, efecto meteorológico, nivel medido y meteo de Portus", async () => {
  const d = await detail(spotById.somo);
  const highs = d.tideDay.ext.filter((e) => e.type === "high");
  assert.ok(highs.length && highs.every((e) => e.coef >= 20 && e.coef <= 120));
  assert.ok(d.tide.coef >= 20);
  assert.equal(d.tideDay.surge.beach, "Somo (Ribamontán al Mar)", "cierra el paréntesis que falta en PORTUS");
  assert.ok(d.tideDay.surge.points.every(([, r]) => r === 0.12));
  assert.equal(d.tideDay.observed.gauge, "Santander 2");
  assert.equal(d.tideDay.observed.samePort, true);
  // Las lecturas respecto al nivel medio se colocan sobre el nivel medio del puerto (2,5 m en la tabla simulada).
  const [t, v] = d.tideDay.observed.points.at(-1);
  const pred = d.tideDay.points.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a))[1];
  assert.ok(Math.abs(v - pred) < 0.15, `medido ${v} frente a previsto ${pred}`);
  // Cada 5 min desde una hora antes de empezar el día (no un número fijo: a medianoche hay pocas lecturas).
  const obs = d.tideDay.observed.points;
  assert.ok(obs.length >= 12, "al menos una hora de lecturas");
  assert.ok(
    obs.slice(1).every(([t], i) => Math.abs(t - obs[i][0] - 5 * 60e3) < 1000),
    "serie del mareógrafo cada 5 min",
  );
  assert.ok(Math.abs(d.meteo.wind.wind - 9.7) < 0.1, "5 m/s son 9,7 nudos");
  assert.ok(Math.abs(d.meteo.wind.gust - 15.6) < 0.1);
  assert.equal(d.meteo.air.air, 18.5, "se salta la estación más cercana que marca 0 °C");
  assert.equal(d.meteo.pressure, null, "un valor marcado como avería no se muestra");
  assert.equal(d.meteo.wind.station.name, "Prueba");
});

test("las mareas del IHM se guardan en disco para no volver a pedirlas", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const files = fs.readdirSync(path.join(process.env.DATA_DIR, "ihm"));
  assert.ok(
    files.some((f) => /^20-\d{6}\.json$/.test(f)),
    `meses guardados: ${files.join(", ")}`,
  );
});

test("cada boya trae lo previsto por el modelo en su posición", async () => {
  const somo = await detail(spotById.somo);
  assert.deepEqual(
    somo.buoy.predicted,
    { h: 2, Tp: 14, dir: 315 },
    "la dirección se convierte a 'de dónde viene' (135 + 180)",
  );
});

test("el detalle incluye el índice UV de hoy (ahora y máximo con su hora)", async () => {
  const { uvToday } = await import("../server/conditions.js");
  const H = 3600e3,
    from = Date.UTC(2026, 9, 3);
  const hours = Array.from({ length: 24 }, (_, i) => ({ t: from + i * H, uv: Math.max(0, 6 - Math.abs(i - 13)) }));
  assert.deepEqual(uvToday(hours, from + 10.5 * H, from, from + 24 * H), { now: 3, max: 6, maxT: from + 13 * H });
  assert.equal(
    uvToday(
      hours.map((h) => ({ ...h, uv: null })),
      from,
      from,
      from + 24 * H,
    ),
    null,
    "sin datos (previsión de respaldo)",
  );
  const d = await detail(spotById.somo);
  assert.equal(d.uv.max, 6, "llega desde Open-Meteo hasta el detalle");
});

test("un spot del Mediterráneo no usa un puerto del IHM lejano: marea del modelo con motivo", async () => {
  const d = await detail(spotById.barceloneta);
  assert.equal(d.tide.source, "model");
  assert.equal(d.tide.reason, "no-port");
  assert.equal(d.tide.port, null);
});

test("reconcile: quita el efecto viento/presión si empeora el ajuste y realinea un cero distinto", async () => {
  const { reconcile } = await import("../server/conditions.js");
  const H = 3600e3,
    t0 = Date.UTC(2026, 9, 3);
  const times = Array.from({ length: 25 }, (_, i) => t0 + i * H);
  const tide = { times, levels: times.map((_, i) => 2 + 1.5 * Math.sin(i / 2)) };
  const pts = (f) => times.map((t, i) => [t, f(i)]);
  // Lo medido coincide con la predicción salvo un cero 35 cm más bajo; el modelo de viento dice +20 cm.
  const obs = { gauge: "Prueba", points: pts((i) => tide.levels[i] - 0.35) };
  const badSurge = { beach: "X", points: pts((i) => 0.2 * Math.sin(i)) };
  const r1 = reconcile(tide, badSurge, obs);
  assert.equal(r1.surge, null, "el efecto viento/presión que no cuadra con lo medido se descarta");
  assert.ok(
    Math.abs(r1.observed.points[5][1] - tide.levels[5]) < 0.01,
    "lo medido se realinea al cero de la predicción",
  );
  // Si el efecto viento/presión explica lo medido, se mantiene y no se toca el medido.
  const surge = { beach: "X", points: pts((i) => 0.1 + 0.05 * Math.cos(i)) };
  const obs2 = { gauge: "Prueba", points: pts((i) => tide.levels[i] + 0.1 + 0.05 * Math.cos(i)) };
  const r2 = reconcile(tide, surge, obs2);
  assert.equal(r2.surge, surge);
  assert.equal(r2.observed, obs2);
});

test("el oleaje se pide mar adentro, en la dirección hacia la que mira la playa", async () => {
  const { offshorePoint } = await import("../server/sources/openmeteo.js");
  const north = offshorePoint({ lat: 43.4, lon: -3.7, facing: 0 }, 5);
  assert.ok(north.lat > 43.44 && north.lat < 43.45 && Math.abs(north.lon + 3.7) < 1e-4, "5 km al norte");
  const west = offshorePoint({ lat: 28.1, lon: -15.4, facing: 270 }, 5);
  assert.ok(west.lon < -15.44 && Math.abs(west.lat - 28.1) < 1e-3, "5 km al oeste");
});

test("solo se usan boyas en la ventana de oleaje de la playa", async () => {
  const { inSwellWindow } = await import("../server/sources/portus.js");
  const conil = { lat: 36.282, lon: -6.105, facing: 250 };
  assert.equal(inSwellWindow(conil, { lat: 36.0, lon: -5.6, distKm: 56 }), false, "Tarifa, dentro del Estrecho");
  assert.equal(
    inSwellWindow(conil, { lat: 36.49, lon: -6.96, distKm: 80 }),
    true,
    "Golfo de Cádiz, mar abierto delante",
  );
  const confital = { lat: 28.158, lon: -15.44, facing: 330 };
  assert.equal(
    inSwellWindow(confital, { lat: 28.05, lon: -15.39, distKm: 13 }),
    false,
    "Las Palmas Este, en la otra costa",
  );
  const salinas = { lat: 43.578, lon: -5.958, facing: 340 };
  assert.equal(inSwellWindow(salinas, { lat: 43.75, lon: -6.18, distKm: 26 }), true, "Cabo de Peñas, mar abierto");
});

test("la boya trae sus últimas 48 h, la tendencia y la previsión en su posición", async () => {
  const b = (await detail(spotById.somo)).buoy;
  assert.ok(b.history.length >= 40, "lecturas horarias de dos días");
  assert.ok(
    b.history.every(([t], i) => i === 0 || t > b.history[i - 1][0]),
    "ordenadas",
  );
  assert.equal(b.trend.key, "up", "de 2 a 2,5 m en 6 h es subir");
  assert.ok(b.model.length > 48, "previsión de hace 48 h a dentro de 24 h");
  // Previsión simulada constante de 1,8 m frente a una boya entre 1,5 y 2,5 m: hay error medio.
  assert.ok(b.fit && b.fit.n >= 6);
  assert.equal(typeof b.fit.bias, "number");
  assert.ok(b.fit.mae > 0.2);
});

test("tendencia del oleaje", async () => {
  const { trend } = await import("../server/sources/portus.js");
  const now = Date.now(),
    H = 3600e3;
  const rows = (hs) => hs.map((h, i) => ({ t: now - (hs.length - 1 - i) * H, h }));
  assert.equal(trend(rows([1, 1, 1, 1, 1, 1, 1.1, 1.1])).key, "steady");
  assert.equal(trend(rows([2, 2, 2, 2, 2, 2, 1.5, 1.5])).key, "down");
  assert.equal(trend(rows([1])), null, "sin lecturas de hace 6 h no hay tendencia");
});
