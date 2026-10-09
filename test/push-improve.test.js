import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

process.env.VAPID_SUBJECT = "mailto:test@example.com";
const push = await import("../server/push.js");
const { clearMemoryCache } = await import("../server/cache.js");
const { getDb } = await import("../server/db.js");

const NOW = (() => {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0); // 10:00 en Madrid en verano, 09:00 en invierno
  return d.getTime();
})();

const sent = [];
push._setDeliver(async (sub, body) => {
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
});

// Somo mira al NNO (345°): con viento del NNO (de mar) la puntuación es 2,8 («aceptable»); con terral, 5 («muy bueno»).
const scenario = (windDir) => {
  installFetch({ wave: 1.8, period: 13, wind: 12, windDir });
  clearMemoryCache();
  try {
    getDb().exec("DELETE FROM cache_entries");
  } catch {
    // la primera vez la tabla aún no existe
  }
};
const EP = "https://fcm.googleapis.com/fcm/send/improve";
const mine = (re) => sent.filter((s) => s.endpoint === EP && re.test(s.title));
let tick = 0;
const run = () => push.checkAlerts(NOW + ++tick * 60e3);

push.subscribe({ subscription: { endpoint: EP, keys: { p256dh: "BPk", auth: "aut" } }, spots: ["somo"], minScore: 2 });

test("el primer aviso del día sale como siempre", async () => {
  scenario(345);
  await run();
  assert.equal(mine(/se pone aceptable/).length, 1);
  assert.equal(mine(/mejora/).length, 0);
});

test("si el día mejora de nivel después de avisar, llega un aviso de mejora", async () => {
  scenario(165); // el viento rola a terral: aceptable -> muy bueno
  await run();
  const m = mine(/mejora/);
  assert.equal(m.length, 1);
  assert.match(m[0].title, /^Somo mejora: ahora muy bueno (hoy|mañana)$/);
  assert.match(m[0].body, /^Mejor hacia las \d\d:\d\d/);
  // Mismo tag que el aviso anterior del día: en el móvil lo sustituye.
  assert.equal(m[0].tag, mine(/se pone aceptable/)[0].tag);
});

test("no repite la mejora, y si el día empeora no avisa", async () => {
  await run();
  await run();
  assert.equal(mine(/mejora/).length, 1);
  scenario(345);
  const before = sent.length;
  await run();
  assert.equal(
    sent.slice(before).filter((s) => s.endpoint === EP).length,
    0,
    "con el oleaje peor no se avisa de nuevo",
  );
});

test("un día que ya tenía aviso de antes del cambio no genera una mejora falsa", async () => {
  // Se simula un aviso antiguo: la marca del día existe pero sin nivel guardado.
  getDb().exec(`DELETE FROM sent WHERE endpoint = '${EP}' AND day LIKE 'lvl:%'`);
  scenario(165);
  const before = mine(/mejora/).length;
  await run();
  assert.equal(mine(/mejora/).length, before, "solo se toma como punto de partida");
  scenario(165);
  await run();
  assert.equal(mine(/mejora/).length, before);
});

test("en inglés el aviso de mejora también sale traducido", async () => {
  const en = "https://fcm.googleapis.com/fcm/send/improve-en";
  push.subscribe({
    subscription: { endpoint: en, keys: { p256dh: "BPk", auth: "aut" } },
    spots: ["somo"],
    minScore: 2,
    lang: "en",
  });
  scenario(345);
  await run();
  scenario(165);
  await run();
  assert.equal(sent.filter((s) => s.endpoint === en && /is getting better: now very good/.test(s.title)).length, 1);
});
