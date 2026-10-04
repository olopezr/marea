import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

// Open-Meteo bloquea las peticiones (429), como en alojamientos con IP compartida.
const calls = installFetch({ openMeteo429: true });
const { overview, detail } = await import("../server/conditions.js");
const { spotById } = await import("../public/js/spots.js");

test("si Open-Meteo responde 429 se usa la previsión de Puertos del Estado", async () => {
  const o = await overview();
  assert.equal(o.forecastSource, "portus");
  const somo = o.spots.find((s) => s.id === "somo");
  assert.ok(somo, "Somo tiene previsión");
  assert.equal(somo.now.h, 2, "usa el punto de mar abierto, no el del interior del puerto (0,1 m)");
  assert.equal(somo.now.dir, 310, "domina el mar de fondo: su dirección convertida a de dónde viene (130 + 180)");
  assert.equal(somo.now.windDir, 165, "dirección del viento convertida a de dónde viene");
  assert.ok(Math.abs(somo.now.wind - 5.8) < 0.1, "3 m/s son 5,8 nudos");
});

test("el detalle con previsión de respaldo trae horas de luz calculadas y menos días", async () => {
  const d = await detail(spotById.somo);
  assert.equal(d.forecastSource, "portus");
  assert.ok(d.sun && d.sun.set - d.sun.rise > 10 * 3600e3, "hay más de 10 h de luz");
  assert.ok(d.days.length >= 2 && d.days.length <= 4);
  assert.equal(d.now.air, 19, "sin temperatura del aire en la previsión, se usa la de MET Norway");
});

test("tras un 429 no se vuelve a llamar a Open-Meteo en cada petición", async () => {
  const before = calls.filter((u) => u.includes("open-meteo")).length;
  await overview();
  await overview();
  await detail(spotById.somo);
  assert.equal(calls.filter((u) => u.includes("open-meteo")).length, before, "Open-Meteo queda en pausa");
});
