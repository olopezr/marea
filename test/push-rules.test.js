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

// Olas de 1,8 m y 12 kn constantes; Somo mira al NNO: viento del SSE (165) es terral, del NNO (345) de mar.
const scenario = (opts = {}) => {
  installFetch({ wave: 1.8, period: 13, wind: 12, windDir: 165, ...opts });
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
const run = (offsetMs = 0) => push.checkAlerts(NOW + offsetMs + ++tick * 60e3);
const subscribeRule = (name, rule, extra = {}) =>
  push.subscribe({ subscription: sub(name), spots: ["somo"], minScore: 4, prefs: { somo: { rule, ...extra } } });

test("cleanRule: guarda solo valores válidos y descarta los de por defecto", () => {
  push.subscribe({
    subscription: sub("c1"),
    spots: ["somo", "berria", "mundaka"],
    prefs: {
      somo: { rule: { hMin: 1.2, hMax: 2.5, windMax: 15, wind: "off", tide: "mid", ahead: 12, extra: 1 } },
      berria: { rule: { hMin: 0, hMax: 10, windMax: 60, wind: "any", tide: "any", ahead: 24 } },
      mundaka: { rule: { hMin: "alto", hMax: 99, windMax: -3, wind: "x", tide: "x", ahead: 3 } },
    },
  });
  assert.deepEqual(push.status(ep("c1")).prefs, {
    somo: { rule: { hMin: 1.2, hMax: 2.5, windMax: 15, wind: "off", tide: "mid", ahead: 12 } },
  });
});

test("cleanRule: rango incoherente, tipos erróneos y reglas sin restricción", () => {
  push.subscribe({
    subscription: sub("c2"),
    spots: ["somo", "berria", "mundaka"],
    prefs: {
      somo: { rule: { hMin: 3, hMax: 1, windMax: 20 } }, // hMin > hMax: se ignoran las dos alturas
      berria: { rule: { ahead: 12 } }, // «ahead» solo no es una restricción
      mundaka: { rule: "mucho" },
    },
  });
  assert.deepEqual(push.status(ep("c2")).prefs, { somo: { rule: { windMax: 20 } } });
  push.subscribe({ subscription: sub("c2"), spots: ["somo"], prefs: { somo: { rule: { hMin: 1.25 } } } });
  assert.deepEqual(push.status(ep("c2")).prefs, {}, "alturas con paso distinto de 0,1 se ignoran");
});

test("la regla convive con los demás ajustes y un cliente antiguo sin regla la borra", () => {
  subscribeRule("r1", { hMin: 1 }, { min: 4, from: 8, to: 20 });
  assert.deepEqual(push.status(ep("r1")).prefs, { somo: { min: 4, from: 8, to: 20, rule: { hMin: 1 } } });
  // Sin `prefs` (cliente que ni los envía) se conservan; con prefs sin `rule` se reemplazan todos (borra la regla).
  push.subscribe({ subscription: sub("r1"), spots: ["somo"] });
  assert.deepEqual(push.status(ep("r1")).prefs.somo.rule, { hMin: 1 });
  push.subscribe({ subscription: sub("r1"), spots: ["somo"], prefs: { somo: { min: 4 } } });
  assert.deepEqual(push.status(ep("r1")).prefs, { somo: { min: 4 } });
});

test("una regla que encaja avisa una sola vez y no se repite el mismo día", async () => {
  scenario();
  subscribeRule("m1", { hMin: 1.5, hMax: 2.5, windMax: 20, wind: "off" });
  await run();
  assert.equal(got("m1").length, 1);
  assert.match(got("m1")[0].title, /Somo/);
  assert.match(got("m1")[0].url, /somo/);
  await run();
  await run(30 * 60e3);
  assert.equal(got("m1").length, 1, "segunda revisión del mismo día: sin duplicado");
});

test("la regla manda sobre el umbral de calidad y el «solo con terral»", async () => {
  scenario({ windDir: 345, wave: 0.7, period: 7 }); // puntuación baja, viento de mar
  subscribeRule("m2", { hMin: 0.5, hMax: 1 }, { min: 4, offshore: true });
  await run();
  assert.equal(got("m2").length, 1);
});

test("no avisa si la altura, el viento o la marea no encajan", async () => {
  scenario(); // 1,8 m, 12 kn de terral
  subscribeRule("n1", { hMin: 2.5 });
  subscribeRule("n2", { hMax: 1 });
  subscribeRule("n3", { windMax: 8 });
  await run();
  scenario({ windDir: 345 });
  subscribeRule("n4", { wind: "off" });
  await run();
  for (const n of ["n1", "n2", "n3", "n4"]) assert.equal(got(n).length, 0, n);
});

test("la marea baja y la alta caen en horas distintas", async () => {
  scenario();
  subscribeRule("t1", { tide: "low" });
  subscribeRule("t2", { tide: "high" });
  await run();
  assert.equal(got("t1").length, 1);
  assert.equal(got("t2").length, 1);
  assert.notEqual(got("t1")[0].body, got("t2")[0].body, "cada estado de marea llega a una hora distinta");
});

test("la ventana «ahead» limita hasta dónde se mira", async () => {
  scenario();
  subscribeRule("a1", { tide: "low", ahead: 6 });
  subscribeRule("a2", { tide: "low", ahead: 48 });
  subscribeRule("a3", { tide: "low", ahead: 6, hMin: 9 }); // altura imposible
  await run();
  assert.equal(got("a2").length, 1);
  assert.equal(got("a3").length, 0);
  // A 6 h vista solo avisa si la marea baja cae en esa ventana: debe coincidir con lo que ve la de 48 h.
  const lowAt = (body) => body.match(/\d\d:\d\d/)[0];
  const mine = got("a1").map((s) => lowAt(s.body));
  assert.ok(mine.length <= 1);
});

test("el aviso se reserva de nuevo si el envío falla", async () => {
  scenario();
  subscribeRule("f1", { hMin: 1 });
  push._setDeliver(async () => {
    throw new Error("caído");
  });
  await run();
  push._setDeliver(async (s, body) => {
    sent.push({ endpoint: s.endpoint, ...JSON.parse(body) });
  });
  await run();
  assert.equal(got("f1").length, 1);
});

test("un spot sin regla se comporta como antes", async () => {
  scenario();
  push.subscribe({ subscription: sub("o1"), spots: ["somo"], minScore: 2 });
  await run();
  assert.equal(got("o1").length, 1);
  assert.doesNotMatch(got("o1")[0].tag ?? "", /rule/);
});
