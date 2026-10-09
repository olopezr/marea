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
let failGone = false;
push._setDeliver(async (sub, body) => {
  if (failWith) throw Object.assign(new Error("fallo"), { statusCode: failWith, gone: failGone });
  sent.push({ kind: sub.kind, endpoint: sub.endpoint, ...JSON.parse(body) });
});

const sub = (endpoint) => ({ endpoint, keys: { p256dh: "BPk", auth: "aut" } });
// 10:00 en Madrid: dentro del horario de avisos.
const at10 = () => {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0);
  return d.getTime();
};

test("subscribe valida la suscripción y filtra spots desconocidos", () => {
  assert.throws(() => push.subscribe({ subscription: { endpoint: "http://inseguro" }, spots: ["somo"] }), /no válida/);
  const st = push.subscribe({
    subscription: sub("https://fcm.googleapis.com/fcm/send/a"),
    spots: ["somo", "no-existe"],
    minScore: 3,
  });
  assert.deepEqual(st, { subscribed: true, spots: ["somo"], minScore: 3 });
  assert.equal(
    push.subscribe({ subscription: sub("https://fcm.googleapis.com/fcm/send/a"), spots: ["somo"], minScore: 99 })
      .minScore,
    3,
  );
});

test("checkAlerts avisa una sola vez por spot y día", async () => {
  await push.checkAlerts(at10());
  const first = sent.filter((s) => s.endpoint === "https://fcm.googleapis.com/fcm/send/a");
  assert.equal(first.length, 1);
  assert.match(first[0].title, /^Somo se pone (bueno|muy bueno) (hoy|mañana)$/);
  assert.match(first[0].body, /^Mejor hacia las \d\d:\d\d: 1,8 m · 13 s del NO · sin viento$/);
  assert.equal(first[0].url, "/#/spot/somo");

  await push.checkAlerts(at10() + 60e3);
  const firstDayKey = first[0].tag;
  assert.equal(sent.filter((s) => s.tag === firstDayKey).length, 1, "no repite el aviso del mismo día");
});

test("no se avisa de madrugada", async () => {
  push.subscribe({ subscription: sub("https://fcm.googleapis.com/fcm/send/b"), spots: ["mundaka"], minScore: 2 });
  const n = sent.length;
  const d = new Date();
  d.setUTCHours(1, 0, 0, 0); // 03:00 en Madrid
  await push.checkAlerts(d.getTime());
  assert.equal(sent.length, n);
});

test("una suscripción caducada (410) se borra", async () => {
  push.subscribe({ subscription: sub("https://fcm.googleapis.com/fcm/send/d"), spots: ["liencres"], minScore: 2 });
  failWith = 410;
  await push.checkAlerts(at10() + 2 * 60e3);
  failWith = null;
  assert.equal(push.status("https://fcm.googleapis.com/fcm/send/d").subscribed, false);
});

const APNS = "a1".repeat(32);
const FCM = "dQw4w9WgXcQ:APA91bH-token_de_prueba";

test("subscribe acepta dispositivos de las apps y valida el token", () => {
  assert.throws(
    () => push.subscribe({ device: { platform: "ios", token: "corto" }, spots: ["somo"] }),
    /Token de dispositivo no válido/,
  );
  assert.throws(
    () => push.subscribe({ device: { platform: "android", token: "con espacios no vale" }, spots: ["somo"] }),
    /no válido/,
  );
  assert.throws(
    () => push.subscribe({ device: { platform: "otra", token: APNS }, spots: ["somo"] }),
    /Suscripción no válida/,
  );
  assert.deepEqual(push.subscribe({ device: { platform: "ios", token: APNS }, spots: ["somo"], minScore: 2 }), {
    subscribed: true,
    spots: ["somo"],
    minScore: 2,
  });
  assert.equal(push.status(`apns:${APNS}`).subscribed, true);
  push.subscribe({ device: { platform: "android", token: FCM }, spots: ["somo"], minScore: 2 });
  assert.equal(push.status(`fcm:${FCM}`).subscribed, true);
});

test("checkAlerts avisa también a las apps nativas", async () => {
  await push.checkAlerts(at10() + 3 * 60e3);
  const ios = sent.find((s) => s.endpoint === `apns:${APNS}`);
  const android = sent.find((s) => s.endpoint === `fcm:${FCM}`);
  assert.equal(ios.kind, "apns");
  assert.equal(android.kind, "fcm");
  assert.equal(ios.url, "/#/spot/somo");
  await push.sendTest(`apns:${APNS}`);
  assert.equal(sent.at(-1).title, "Avisos de Marea activados");
});

test("un token nativo rechazado se borra; un fallo pasajero no", async () => {
  failWith = 500;
  await assert.rejects(push.sendTest(`fcm:${FCM}`), /rechazó/);
  assert.equal(push.status(`fcm:${FCM}`).subscribed, true);
  failWith = 404; // en un dispositivo nativo, solo `gone` indica token inválido
  await assert.rejects(push.sendTest(`fcm:${FCM}`));
  assert.equal(push.status(`fcm:${FCM}`).subscribed, true);
  failWith = 400;
  failGone = true;
  await assert.rejects(push.sendTest(`fcm:${FCM}`));
  failWith = null;
  failGone = false;
  assert.equal(push.status(`fcm:${FCM}`).subscribed, false);
});

test("unsubscribe borra la suscripción", () => {
  push.unsubscribe("https://fcm.googleapis.com/fcm/send/a");
  assert.deepEqual(push.status("https://fcm.googleapis.com/fcm/send/a"), { subscribed: false, spots: [], minScore: 3 });
});

test("los avisos llegan en el idioma del dispositivo", async () => {
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/en-1", keys: { p256dh: "k", auth: "a" } };
  push.subscribe({ subscription: sub, spots: ["somo"], minScore: 2, lang: "en" });
  await push.sendTest(sub.endpoint);
  assert.equal(sent.at(-1).title, "Marea alerts are on");
  push.unsubscribe(sub.endpoint);
});

test("solo se aceptan endpoints de servicios push conocidos (evita SSRF)", async () => {
  const { isPushEndpoint } = await import("../server/push.js");
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QK7",
    "https://wns2-db5p.notify.windows.com/w/?token=x",
  ])
    assert.ok(isPushEndpoint(ok), ok);
  for (const bad of [
    "https://evil.example/x",
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://169.254.169.254/latest",
    "no es una url",
  ])
    assert.ok(!isPushEndpoint(bad), bad);
  assert.throws(
    () => push.subscribe({ subscription: { endpoint: "https://evil.example/x", keys: { p256dh: "k", auth: "a" } } }),
    /no válida/,
  );
});

test("dos revisiones simultáneas no duplican el aviso", async () => {
  const token = "dQw4w9WgXcQ:APA91bH-token_concurrente";
  push.subscribe({ device: { platform: "android", token }, spots: ["somo"], minScore: 2 });
  const t = at10() + 5 * 60e3;
  await Promise.all([push.checkAlerts(t), push.checkAlerts(t)]);
  const mine = sent.filter((s) => s.endpoint === `fcm:${token}`);
  assert.ok(mine.length >= 1);
  assert.equal(new Set(mine.map((s) => s.tag)).size, mine.length, "ningún aviso se repite");
  push.unsubscribe(`fcm:${token}`);
});

test("un dispositivo que falla 10 veces seguidas se da de baja", async () => {
  const token = "dQw4w9WgXcQ:APA91bH-token_fallido";
  push.subscribe({ device: { platform: "android", token }, spots: ["somo"] });
  failWith = 500;
  for (let i = 0; i < 9; i++) await assert.rejects(push.sendTest(`fcm:${token}`));
  assert.equal(push.status(`fcm:${token}`).subscribed, true);
  await assert.rejects(push.sendTest(`fcm:${token}`));
  failWith = null;
  assert.equal(push.status(`fcm:${token}`).subscribed, false);
});
