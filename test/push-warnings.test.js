import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

// Avisos de AEMET con fechas relativas a "ahora": el test no depende del día en que se ejecute.
const NOW = (() => {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0); // 10:00 en Madrid en verano, 09:00 en invierno: dentro del horario de avisos
  return d.getTime();
})();
const H = 3600e3;
const p2 = (n) => String(n).padStart(2, "0");
// Formato de AEMET: "14:59 09-10-2026 CEST (UTC+2)". Se escribe en UTC+2.
const aemetDate = (ms) => {
  const d = new Date(ms + 2 * H);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} ${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} CEST (UTC+2)`;
};
const item = (level, phenomenon, zone, from, to, guid) => `<item>
  <title>Aviso. Nivel ${level}. ${phenomenon}. ${zone}</title>
  <description>Aviso de ${phenomenon} de nivel ${level} de ${aemetDate(from)} a ${aemetDate(to)}.</description>
  <link>https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/${guid}.xml</link>
  <guid>${guid}</guid>
</item>`;

let warnings = [];
installFetch({
  wave: 1.8,
  period: 13,
  wind: 4,
  windDir: 165,
  aemetRss: () => (typeof warnings === "string" ? warnings : `<rss><channel>${warnings.join("")}</channel></rss>`),
});
process.env.VAPID_SUBJECT = "mailto:test@example.com";
const push = await import("../server/push.js");
const { clearMemoryCache } = await import("../server/cache.js");

const sent = [];
let failWith = null;
push._setDeliver(async (sub, body) => {
  if (failWith) throw Object.assign(new Error("fallo"), { statusCode: failWith });
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
});

const sub = (endpoint) => ({ endpoint, keys: { p256dh: "BPk", auth: "aut" } });
const EP = "https://fcm.googleapis.com/fcm/send/warn";
const mine = () => sent.filter((s) => s.endpoint === EP);
// Cada paso lee un RSS distinto: se vacía la caché (memoria y disco) para que no sirva el anterior.
const setWarnings = async (list) => {
  warnings = list;
  clearMemoryCache();
  const { getDb } = await import("../server/db.js");
  try {
    getDb().exec("DELETE FROM cache_entries WHERE key LIKE 'aemet:%'");
  } catch {
    // la primera vez la tabla aún no existe: no hay nada que borrar
  }
};

// min_score 4: el aviso de AEMET no debe depender de lo bueno que esté el oleaje.
push.subscribe({ subscription: sub(EP), spots: ["somo"], minScore: 4 });

test("avisa de un aviso naranja activo en el litoral cántabro, sin importar el umbral de calidad", async () => {
  await setWarnings([item("naranja", "Costeros", "Litoral cántabro", NOW - H, NOW + 5 * H, "w1")]);
  const r = await push.checkAlerts(NOW);
  const m = mine().filter((s) => /naranja/i.test(s.title));
  assert.equal(m.length, 1);
  assert.match(m[0].title, /^Aviso naranja en Somo: fenómenos costeros$/);
  assert.match(m[0].body, /^AEMET · Litoral cántabro\. En vigor hasta /);
  assert.equal(m[0].url, "/#/spot/somo");
  assert.ok(r.sent >= 1);
});

test("no repite el mismo aviso en la siguiente revisión", async () => {
  const warns = () => mine().filter((s) => /^Aviso /.test(s.title)).length;
  const before = warns();
  await push.checkAlerts(NOW + 60e3);
  assert.equal(warns(), before);
});

test("un aviso que sube de nivel vuelve a avisar", async () => {
  await setWarnings([item("rojo", "Costeros", "Litoral cántabro", NOW - H, NOW + 5 * H, "w1b")]);
  await push.checkAlerts(NOW + 2 * 60e3);
  assert.ok(mine().some((s) => /^Aviso rojo en Somo/.test(s.title)));
});

test("avisos de otra zona, caducados o lejanos no avisan", async () => {
  await setWarnings([
    item("naranja", "Costeros", "Menorca", NOW - H, NOW + 5 * H, "x1"),
    item("rojo", "Vientos", "Litoral cántabro", NOW - 10 * H, NOW - 5 * H, "x2"),
    item("amarillo", "Lluvias", "Litoral cántabro", NOW + 30 * H, NOW + 40 * H, "x3"),
  ]);
  const warns = () => mine().filter((s) => /^Aviso /.test(s.title)).length;
  const before = warns();
  await push.checkAlerts(NOW + 3 * 60e3);
  assert.equal(warns(), before);
});

test("avisa de un aviso amarillo que empieza dentro de 24 h", async () => {
  await setWarnings([item("amarillo", "Vientos", "Litoral cántabro", NOW + 6 * H, NOW + 12 * H, "y1")]);
  await push.checkAlerts(NOW + 4 * 60e3);
  const m = mine().filter((s) => /^Aviso amarillo en Somo: vientos$/.test(s.title));
  assert.equal(m.length, 1);
  assert.match(m[0].body, /Empieza /);
});

test("llega en inglés al dispositivo que lo tiene configurado", async () => {
  const en = "https://fcm.googleapis.com/fcm/send/warn-en";
  push.subscribe({ subscription: sub(en), spots: ["somo"], lang: "en" });
  await setWarnings([item("naranja", "Tormentas", "Litoral cántabro", NOW - H, NOW + 5 * H, "z1")]);
  await push.checkAlerts(NOW + 5 * 60e3);
  const m = sent.filter((s) => s.endpoint === en && /warning/i.test(s.title));
  assert.equal(m.length, 1);
  assert.match(m[0].title, /^Orange warning at Somo: thunderstorms$/);
  assert.match(m[0].body, /^AEMET · Litoral cántabro\. In force until /);
});

test("no avisa de madrugada y no marca el aviso como enviado", async () => {
  await setWarnings([item("rojo", "Galerna", "Litoral cántabro", NOW - H, NOW + 20 * H, "n1")]);
  const night = new Date(NOW);
  night.setUTCHours(1, 0, 0, 0);
  const warns = () => mine().filter((s) => /^Aviso /.test(s.title)).length;
  const before = warns();
  await push.checkAlerts(night.getTime());
  assert.equal(warns(), before);
  await push.checkAlerts(NOW + 6 * 60e3); // por la mañana sí
  assert.ok(mine().some((s) => /galerna/i.test(s.title)));
});

test("si el envío falla, el aviso se reintenta en la siguiente revisión", async () => {
  await setWarnings([item("naranja", "Lluvias", "Litoral cántabro", NOW - H, NOW + 5 * H, "f1")]);
  failWith = 500;
  await push.checkAlerts(NOW + 7 * 60e3);
  failWith = null;
  assert.equal(mine().filter((s) => /lluvias/i.test(s.title)).length, 0);
  await push.checkAlerts(NOW + 8 * 60e3);
  assert.equal(mine().filter((s) => /lluvias/i.test(s.title)).length, 1);
});

test("si AEMET responde con una página de rechazo, no avisa y lo cuenta como fallo de la fuente", async () => {
  const { sourceErrors } = await import("../server/cache.js");
  const before = sourceErrors.aemet ?? 0;
  await setWarnings("<html><head><title>Request Rejected</title></head></html>");
  const warns = () => mine().filter((s) => /^Aviso /.test(s.title)).length;
  const n = warns();
  await push.checkAlerts(NOW + 9 * 60e3);
  assert.equal(warns(), n);
  assert.ok((sourceErrors.aemet ?? 0) > before);
});

test("un aviso amarillo de calor o lluvia no genera notificación", async () => {
  await setWarnings([
    item("amarillo", "Temperaturas máximas", "Litoral cántabro", NOW - H, NOW + 5 * H, "h1"),
    item("amarillo", "Lluvias", "Litoral cántabro", NOW - H, NOW + 5 * H, "h2"),
  ]);
  const warns = () => mine().filter((s) => /^Aviso /.test(s.title)).length;
  const n = warns();
  await push.checkAlerts(NOW + 10 * 60e3);
  assert.equal(warns(), n);
});
