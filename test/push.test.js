import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installFetch } from "./fixtures.js";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "marea-test-"));
process.env.VAPID_SUBJECT = "mailto:test@example.com";
installFetch({ wave: 1.8, period: 13, wind: 4, windDir: 165 });
const push = await import("../server/push.js");

const sent = [];
let failWith = null;
push._setDeliver(async (sub, body) => {
  if (failWith) throw Object.assign(new Error("fallo"), { statusCode: failWith });
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
});

const sub = endpoint => ({ endpoint, keys: { p256dh: "BPk", auth: "aut" } });
// 10:00 en Madrid: dentro del horario de avisos.
const at10 = () => { const d = new Date(); d.setUTCHours(8, 0, 0, 0); return d.getTime(); };

test("subscribe valida la suscripción y filtra spots desconocidos", () => {
  assert.throws(() => push.subscribe({ subscription: { endpoint: "http://inseguro" }, spots: ["somo"] }), /no válida/);
  const st = push.subscribe({ subscription: sub("https://push.example/a"), spots: ["somo", "no-existe"], minScore: 3 });
  assert.deepEqual(st, { subscribed: true, spots: ["somo"], minScore: 3 });
  assert.equal(push.subscribe({ subscription: sub("https://push.example/a"), spots: ["somo"], minScore: 99 }).minScore, 3);
});

test("checkAlerts avisa una sola vez por spot y día", async () => {
  await push.checkAlerts(at10());
  const first = sent.filter(s => s.endpoint === "https://push.example/a");
  assert.equal(first.length, 1);
  assert.match(first[0].title, /^Somo se pone (bueno|muy bueno) (hoy|mañana)$/);
  assert.match(first[0].body, /^Mejor hacia las \d\d:\d\d: 1,8 m · 13 s del NO · sin viento$/);
  assert.equal(first[0].url, "/#/spot/somo");

  await push.checkAlerts(at10() + 60e3);
  const firstDayKey = first[0].tag;
  assert.equal(sent.filter(s => s.tag === firstDayKey).length, 1, "no repite el aviso del mismo día");
});

test("no se avisa de madrugada", async () => {
  push.subscribe({ subscription: sub("https://push.example/b"), spots: ["mundaka"], minScore: 2 });
  const n = sent.length;
  const d = new Date(); d.setUTCHours(1, 0, 0, 0); // 03:00 en Madrid
  await push.checkAlerts(d.getTime());
  assert.equal(sent.length, n);
});

test("una suscripción caducada (410) se borra", async () => {
  push.subscribe({ subscription: sub("https://push.example/d"), spots: ["liencres"], minScore: 2 });
  failWith = 410;
  await push.checkAlerts(at10() + 2 * 60e3);
  failWith = null;
  assert.equal(push.status("https://push.example/d").subscribed, false);
});

test("unsubscribe borra la suscripción", () => {
  push.unsubscribe("https://push.example/a");
  assert.deepEqual(push.status("https://push.example/a"), { subscribed: false, spots: [], minScore: 3 });
});
