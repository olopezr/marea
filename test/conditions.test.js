import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

const calls = installFetch();
const { overview, detail } = await import("../server/conditions.js");
const { spotById, SPOTS } = await import("../public/js/spots.js");

test("overview combina previsión y marea oficial sin consultar PORTUS", async () => {
  const o = await overview();
  assert.equal(o.spots.length, SPOTS.length);
  const somo = o.spots.find(s => s.id === "somo");
  assert.equal(somo.tide.source, "ihm");
  assert.equal(somo.tide.port.name, "Santander");
  assert.ok(somo.tide.next && somo.tide.next.t > Date.now());
  assert.ok(somo.score >= 3, `terral suave con 1,8 m a 12 s debería ser bueno, fue ${somo.score}`);
  assert.equal(somo.buoy, undefined, "la lista no trae boya");
  assert.equal(calls.filter(u => u.includes("portus.puertos.es")).length, 0, "la lista no llama a PORTUS");
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
  assert.equal(calls.filter(u => u.includes("open-meteo")).length, 2, "una petición por API para todos los spots");
});

test("detail devuelve curva del día, 24 h y 7 días ordenados", async () => {
  const d = await detail(spotById.somo);
  assert.ok(d.tideDay.points.length > 90, "curva cada 15 min");
  assert.ok(d.tideDay.ext.length >= 3);
  assert.ok(d.hours.length >= 24 && d.hours.length <= 25);
  assert.ok(d.days.length >= 6 && d.days.length <= 7);
  for (let i = 1; i < d.days.length; i++) assert.ok(d.days[i].rise > d.days[i - 1].rise);
  assert.ok(d.days.every(day => day.cells.length > 0 && day.best.score >= 0));
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
  const highs = d.tideDay.ext.filter(e => e.type === "high");
  assert.ok(highs.length && highs.every(e => e.coef >= 20 && e.coef <= 120));
  assert.ok(d.tide.coef >= 20);
  assert.equal(d.tideDay.surge.beach, "Somo (Ribamontan al Mar");
  assert.ok(d.tideDay.surge.points.every(([, r]) => r === 0.12));
  assert.equal(d.tideDay.observed.gauge, "Santander 2");
  assert.equal(d.tideDay.observed.samePort, true);
  // Las lecturas respecto al nivel medio se colocan sobre el nivel medio del puerto (2,5 m en la tabla simulada).
  const [t, v] = d.tideDay.observed.points.at(-1);
  const pred = d.tideDay.points.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a))[1];
  assert.ok(Math.abs(v - pred) < 0.15, `medido ${v} frente a previsto ${pred}`);
  assert.ok(d.tideDay.observed.points.length > 100, "serie del mareógrafo cada 5 min");
  assert.ok(Math.abs(d.meteo.wind.wind - 9.7) < 0.1, "5 m/s son 9,7 nudos");
  assert.ok(Math.abs(d.meteo.wind.gust - 15.6) < 0.1);
  assert.equal(d.meteo.air.air, 18.5);
  assert.equal(d.meteo.pressure, null, "un valor marcado como avería no se muestra");
  assert.equal(d.meteo.wind.station.name, "Prueba");
});

test("las mareas del IHM se guardan en disco para no volver a pedirlas", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const files = fs.readdirSync(path.join(process.env.DATA_DIR, "ihm"));
  assert.ok(files.some(f => /^20-\d{6}\.json$/.test(f)), `meses guardados: ${files.join(", ")}`);
});

test("cada boya trae lo previsto por el modelo en su posición", async () => {
  const somo = await detail(spotById.somo);
  assert.deepEqual(somo.buoy.predicted, { h: 2, Tp: 14, dir: 315 }, "la dirección se convierte a 'de dónde viene' (135 + 180)");
});
