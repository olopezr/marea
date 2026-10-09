import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

process.env.VAPID_SUBJECT = "mailto:test@example.com";
const push = await import("../server/push.js");
const { clearMemoryCache } = await import("../server/cache.js");
const { getDb } = await import("../server/db.js");

// 10:00 en Madrid en verano y 09:00 en invierno: dentro del horario de avisos en cualquier época.
const NOW = (() => {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0);
  return d.getTime();
})();

const sent = [];
push._setDeliver(async (sub, body) => {
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
});

// Somo mira al NNO (345°): con viento del SSE (165°) es terral y la puntuación sale 5; con viento del NNO, de mar, 2,8.
const scenario = (windDir) => {
  installFetch({ wave: 1.8, period: 13, wind: 12, windDir });
  clearMemoryCache();
  try {
    getDb().exec("DELETE FROM cache_entries");
  } catch {
    // la primera vez la tabla aún no existe
  }
};
const ep = (name) => `https://fcm.googleapis.com/fcm/send/${name}`;
const sub = (name) => ({ endpoint: ep(name), keys: { p256dh: "BPk", auth: "aut" } });
const got = (name) => sent.filter((s) => s.endpoint === ep(name) && /Somo/.test(s.title));
let tick = 0;
const run = () => push.checkAlerts(NOW + ++tick * 60e3);

test("guarda los ajustes de cada spot y descarta los valores no válidos", () => {
  push.subscribe({
    subscription: sub("p1"),
    spots: ["somo", "berria"],
    minScore: 3,
    prefs: {
      somo: { min: 4, offshore: true, from: 8, to: 20 },
      berria: { min: 9, offshore: "sí", from: -1, to: 99 },
      mundaka: { min: 4 }, // no está entre los spots activos
    },
  });
  assert.deepEqual(push.status(ep("p1")).prefs, { somo: { min: 4, offshore: true, from: 8, to: 20 } });
});

test("sin ajustes en la petición se conservan los guardados; con {} se borran; al quitar el spot desaparecen", () => {
  push.subscribe({ subscription: sub("p2"), spots: ["somo"], prefs: { somo: { min: 2 } } });
  push.subscribe({ subscription: sub("p2"), spots: ["somo", "berria"] }); // una app antigua
  assert.deepEqual(push.status(ep("p2")).prefs, { somo: { min: 2 } });
  push.subscribe({ subscription: sub("p2"), spots: ["berria"] });
  assert.deepEqual(push.status(ep("p2")).prefs, {});
  push.subscribe({ subscription: sub("p2"), spots: ["somo"], prefs: { somo: { min: 2 } } });
  push.subscribe({ subscription: sub("p2"), spots: ["somo"], prefs: {} });
  assert.deepEqual(push.status(ep("p2")).prefs, {});
});

test("el umbral de un spot manda sobre el general, en los dos sentidos", async () => {
  scenario(345); // puntuación 2,8
  push.subscribe({ subscription: sub("t-alto"), spots: ["somo"], minScore: 2, prefs: { somo: { min: 3 } } });
  push.subscribe({ subscription: sub("t-bajo"), spots: ["somo"], minScore: 3, prefs: { somo: { min: 2 } } });
  push.subscribe({ subscription: sub("t-general"), spots: ["somo"], minScore: 3 });
  await run();
  assert.equal(got("t-alto").length, 0, "umbral del spot 3 > 2,8");
  assert.equal(got("t-bajo").length, 1, "umbral del spot 2 <= 2,8 aunque el general sea 3");
  assert.equal(got("t-general").length, 0, "sin ajustes se usa el general (3)");
});

test("«solo con terral» solo avisa cuando el viento sopla de tierra", async () => {
  scenario(345); // viento de mar
  push.subscribe({ subscription: sub("o-1"), spots: ["somo"], minScore: 2, prefs: { somo: { offshore: true } } });
  push.subscribe({ subscription: sub("o-2"), spots: ["somo"], minScore: 2 });
  await run();
  assert.equal(got("o-1").length, 0, "con viento de mar no avisa");
  assert.equal(got("o-2").length, 1, "sin el ajuste sí avisa");

  scenario(165); // terral
  await run();
  assert.equal(got("o-1").length >= 1, true, "con terral sí avisa");
});

test("la franja horaria del spot limita cuándo llegan los avisos", async () => {
  scenario(165);
  push.subscribe({ subscription: sub("h-1"), spots: ["somo"], minScore: 2, prefs: { somo: { from: 7, to: 9 } } });
  await run();
  assert.equal(got("h-1").length, 0, "a las 10:00 (o las 09:00) queda fuera de 7-9");
  push.subscribe({ subscription: sub("h-1"), spots: ["somo"], minScore: 2, prefs: { somo: { from: 7, to: 22 } } });
  await run();
  assert.equal(got("h-1").length >= 1, true);
});
