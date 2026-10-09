// Avisos push: el usuario elige spots y un umbral; una vez por hora se revisa la previsión
// y se avisa como máximo una vez por spot y día cuando la mejor ventana supera el umbral.
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { SPOTS, spotById } from "../public/js/spots.js";
import { RATINGS, rating, fmt, hhmm, hourOf, cardinal } from "../public/js/surf.js";
import { forecastAll } from "./forecast.js";
import { forecastFor } from "./conditions.js";
import * as nativePush from "./native-push.js";
import * as aemet from "./sources/aemet.js";

import { DATA_DIR } from "./config.js";
import { getDb } from "./db.js";

// ---------- Claves VAPID ----------
function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = path.join(DATA_DIR, "vapid.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.warn(
    `[push] Claves VAPID generadas en ${file}. En producción defínelas con VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.`,
  );
  return keys;
}
const VAPID = vapidKeys();
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:avisos@example.com";
if (!process.env.VAPID_SUBJECT)
  console.warn("[push] Define VAPID_SUBJECT (mailto: o URL de contacto) antes de publicar.");
webpush.setVapidDetails(SUBJECT, VAPID.publicKey, VAPID.privateKey);
export const publicKey = VAPID.publicKey;

// ---------- Base de datos ----------
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    min_score REAL NOT NULL DEFAULT 3, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    endpoint TEXT NOT NULL REFERENCES subscriptions(endpoint) ON DELETE CASCADE,
    spot_id TEXT NOT NULL, PRIMARY KEY (endpoint, spot_id)
  );
  CREATE TABLE IF NOT EXISTS sent (
    endpoint TEXT NOT NULL, spot_id TEXT NOT NULL, day TEXT NOT NULL, sent_at INTEGER NOT NULL,
    PRIMARY KEY (endpoint, spot_id, day)
  );
  PRAGMA foreign_keys = ON;
`);
// Las apps nativas comparten tabla con Web Push: endpoint "apns:<token>" o "fcm:<token>", sin claves.
if (
  !db
    .prepare(`PRAGMA table_info(subscriptions)`)
    .all()
    .some((c) => c.name === "kind")
) {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN kind TEXT NOT NULL DEFAULT 'web'`);
}

// Idioma de los avisos de cada dispositivo ("es" o "en").
if (
  !db
    .prepare(`PRAGMA table_info(subscriptions)`)
    .all()
    .some((c) => c.name === "lang")
) {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN lang TEXT NOT NULL DEFAULT 'es'`);
}

// Envíos fallidos seguidos de cada dispositivo: pasado el máximo se da de baja (token ya inservible).
if (
  !db
    .prepare(`PRAGMA table_info(subscriptions)`)
    .all()
    .some((c) => c.name === "fails")
) {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN fails INTEGER NOT NULL DEFAULT 0`);
}
const MAX_FAILS = 10;

// Ajustes de cada spot dentro de una suscripción: calidad mínima propia, «solo con terral» y franja horaria.
for (const [col, ddl] of [
  ["min_score", "REAL"],
  ["offshore", "INTEGER NOT NULL DEFAULT 0"],
  ["from_h", "INTEGER NOT NULL DEFAULT 7"],
  ["to_h", "INTEGER NOT NULL DEFAULT 22"],
]) {
  if (
    !db
      .prepare(`PRAGMA table_info(alerts)`)
      .all()
      .some((c) => c.name === col)
  )
    db.exec(`ALTER TABLE alerts ADD COLUMN ${col} ${ddl}`);
}

const q = {
  upsertSub:
    db.prepare(`INSERT INTO subscriptions (endpoint, p256dh, auth, min_score, created_at, kind, lang) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, min_score = excluded.min_score, kind = excluded.kind, lang = excluded.lang`),
  clearAlerts: db.prepare(`DELETE FROM alerts WHERE endpoint = ?`),
  addAlert: db.prepare(
    `INSERT OR IGNORE INTO alerts (endpoint, spot_id, min_score, offshore, from_h, to_h) VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  prefsOf: db.prepare(`SELECT spot_id, min_score, offshore, from_h, to_h FROM alerts WHERE endpoint = ?`),
  deleteSub: db.prepare(`DELETE FROM subscriptions WHERE endpoint = ?`),
  deleteAlerts: db.prepare(`DELETE FROM alerts WHERE endpoint = ?`),
  getSub: db.prepare(`SELECT * FROM subscriptions WHERE endpoint = ?`),
  spotsOf: db.prepare(`SELECT spot_id FROM alerts WHERE endpoint = ?`),
  activeSpots: db.prepare(`SELECT DISTINCT spot_id FROM alerts`),
  watchers: db.prepare(
    `SELECT s.*, a.min_score AS spot_min, a.offshore, a.from_h, a.to_h
     FROM subscriptions s JOIN alerts a ON a.endpoint = s.endpoint WHERE a.spot_id = ?`,
  ),
  failed: db.prepare(`UPDATE subscriptions SET fails = fails + 1 WHERE endpoint = ?`),
  delivered: db.prepare(`UPDATE subscriptions SET fails = 0 WHERE endpoint = ?`),
  fails: db.prepare(`SELECT fails FROM subscriptions WHERE endpoint = ?`),
  levelsOf: db.prepare(`SELECT day FROM sent WHERE endpoint = ? AND spot_id = ? AND day LIKE ?`),
  unmarkSent: db.prepare(`DELETE FROM sent WHERE endpoint = ? AND spot_id = ? AND day = ?`),
  markSent: db.prepare(`INSERT OR IGNORE INTO sent (endpoint, spot_id, day, sent_at) VALUES (?, ?, ?, ?)`),
  pruneSent: db.prepare(`DELETE FROM sent WHERE sent_at < ?`),
};

// ---------- API ----------
// Solo servicios push conocidos: el servidor hace POST a esta URL, así que aceptar cualquiera permitiría
// usarlo para enviar peticiones a terceros (SSRF). Chrome, Edge (FCM/WNS), Firefox y Safari.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];
export function isPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && !u.username && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
const isSub = (s) =>
  s &&
  typeof s.endpoint === "string" &&
  s.endpoint.length < 1000 &&
  isPushEndpoint(s.endpoint) &&
  typeof s.keys?.p256dh === "string" &&
  typeof s.keys?.auth === "string";

// Token de dispositivo de las apps: APNs en hexadecimal; FCM, texto sin espacios.
const NATIVE = { ios: { kind: "apns", re: /^[0-9a-f]{64,200}$/i }, android: { kind: "fcm", re: /^[\w:.-]{20,4096}$/ } };

// `subscription` (navegador) o `device: { platform, token }` (app nativa).
function target({ subscription, device }) {
  const n =
    device && typeof device.platform === "string" && Object.hasOwn(NATIVE, device.platform) && NATIVE[device.platform];
  if (n) {
    const token = String(device.token ?? "");
    if (!n.re.test(token)) throw Object.assign(new Error("Token de dispositivo no válido"), { status: 400 });
    return { kind: n.kind, endpoint: `${n.kind}:${token}`, p256dh: "", auth: "" };
  }
  if (!isSub(subscription)) throw Object.assign(new Error("Suscripción no válida"), { status: 400 });
  return {
    kind: "web",
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  };
}

const DEFAULT_FROM = 7,
  DEFAULT_TO = 22; // horario de avisos: nada de madrugada

// Ajustes de un spot ya validados; lo que no sea válido o sea el valor por defecto se descarta.
function cleanPref(p) {
  const out = {};
  if (!p || typeof p !== "object") return out;
  if ([2, 3, 4].includes(p.min)) out.min = p.min;
  if (p.offshore === true) out.offshore = true;
  const ok = (h, lo, hi) => Number.isInteger(h) && h >= lo && h <= hi;
  if (ok(p.from, DEFAULT_FROM, DEFAULT_TO - 1) && ok(p.to, DEFAULT_FROM + 1, DEFAULT_TO) && p.from < p.to) {
    if (p.from !== DEFAULT_FROM || p.to !== DEFAULT_TO) Object.assign(out, { from: p.from, to: p.to });
  }
  return out;
}

// Ajustes guardados de una suscripción, solo los que se apartan de los valores por defecto.
function prefsMap(endpoint) {
  const out = {};
  for (const r of q.prefsOf.all(endpoint)) {
    const p = cleanPref({
      min: r.min_score,
      offshore: r.offshore === 1,
      from: r.from_h,
      to: r.to_h,
    });
    if (Object.keys(p).length) out[r.spot_id] = p;
  }
  return out;
}

export function subscribe({ subscription, device, spots, minScore, lang, prefs }) {
  const t = target({ subscription, device });
  const ids = (Array.isArray(spots) ? spots : []).filter((id) => spotById[id]).slice(0, 50);
  const min = [2, 3, 4].includes(+minScore) ? +minScore : 3;
  const ep = t.endpoint;
  db.exec("BEGIN");
  try {
    // Sin `prefs` (apps antiguas) se conservan los ajustes que ya tenía cada spot.
    const source = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs : prefsMap(ep);
    q.upsertSub.run(ep, t.p256dh, t.auth, min, Date.now(), t.kind, lang === "en" ? "en" : "es");
    q.clearAlerts.run(ep);
    for (const id of ids) {
      const p = cleanPref(source[id]);
      q.addAlert.run(ep, id, p.min ?? null, p.offshore ? 1 : 0, p.from ?? DEFAULT_FROM, p.to ?? DEFAULT_TO);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return status(ep);
}

export function unsubscribe(endpoint) {
  q.deleteAlerts.run(endpoint);
  q.deleteSub.run(endpoint);
  return { spots: [], minScore: 3 };
}

export function status(endpoint) {
  const sub = q.getSub.get(endpoint);
  if (!sub) return { subscribed: false, spots: [], minScore: 3, prefs: {} };
  return {
    subscribed: true,
    spots: q.spotsOf.all(endpoint).map((r) => r.spot_id),
    minScore: sub.min_score,
    prefs: prefsMap(endpoint),
  };
}

// Sustituible en los tests para no depender de los servicios push reales.
const native = nativePush.fromEnv();
let deliver = async (sub, body, opts) => {
  if (sub.kind === "web") return webpush.sendNotification(sub, body, opts);
  const channel = native[sub.kind];
  if (!channel) throw Object.assign(new Error(`canal ${sub.kind} sin configurar`), { statusCode: 503 });
  return channel(sub.endpoint.slice(sub.kind.length + 1), JSON.parse(body), { ttl: opts.TTL });
};
export const _setDeliver = (fn) => {
  deliver = fn;
};

async function send(sub, payload) {
  try {
    await deliver(
      { kind: sub.kind ?? "web", endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 3600 },
    );
    q.delivered.run(sub.endpoint);
    return true;
  } catch (err) {
    if (err.gone || ((sub.kind ?? "web") === "web" && (err.statusCode === 404 || err.statusCode === 410))) {
      unsubscribe(sub.endpoint); // el navegador o el móvil ya no la acepta
    } else {
      console.warn(`[push] envío fallido (${err.statusCode ?? err.message})`);
      q.failed.run(sub.endpoint);
      if ((q.fails.get(sub.endpoint)?.fails ?? 0) >= MAX_FAILS) unsubscribe(sub.endpoint);
    }
    return false;
  }
}

export async function sendTest(endpoint) {
  const sub = q.getSub.get(endpoint);
  if (!sub) throw Object.assign(new Error("No hay suscripción para este dispositivo"), { status: 404 });
  const ok = await send(
    sub,
    sub.lang === "en"
      ? { title: "Marea alerts are on", body: "We'll let you know when your spots are in good shape.", url: "/" }
      : {
          title: "Avisos de Marea activados",
          body: "Te avisaremos cuando tus spots estén en buenas condiciones.",
          url: "/",
        },
  );
  if (!ok) throw Object.assign(new Error("El servicio de notificaciones rechazó el envío"), { status: 502 });
  return { ok };
}

// ---------- Revisión periódica ----------
const EN_RATING = { flat: "flat", poor: "poor", fair: "fair", good: "good", epic: "very good" };
const EN_WIND = { off: "offshore", cross: "cross-shore", on: "onshore" };
const enCardinal = (deg) => cardinal(deg).replace(/O/g, "W");

function message(spot, day, isToday, lang = "es", improved = false) {
  const b = day.best;
  const base = { url: `/#/spot/${spot.id}`, tag: `${spot.id}-${day.key}` };
  if (lang === "en") {
    const n = (x, d = 1) => fmt(x, d).replace(",", ".");
    const wind = b.windType === "calm" ? "no wind" : `${EN_WIND[b.windType] ?? ""} wind ${n(b.wind, 0)} kn`.trim();
    return {
      ...base,
      title: improved
        ? `${spot.name} is getting better: now ${EN_RATING[rating(b.score).key]} ${isToday ? "today" : "tomorrow"}`
        : `${spot.name} looks ${EN_RATING[rating(b.score).key]} ${isToday ? "today" : "tomorrow"}`,
      body: `Best around ${hhmm(b.t, spot.tz)}: ${n(b.h)} m · ${n(b.T, 0)} s from ${enCardinal(b.dir)} · ${wind}`,
    };
  }
  const when = isToday ? "hoy" : "mañana";
  const wind =
    b.windType === "calm"
      ? "sin viento"
      : `viento ${{ off: "terral", cross: "cruzado", on: "de mar" }[b.windType] ?? ""} de ${fmt(b.wind, 0)} kn`.replace(
          "  ",
          " ",
        );
  return {
    ...base,
    title: improved
      ? `${spot.name} mejora: ahora ${rating(b.score).label.toLowerCase()} ${when}`
      : `${spot.name} se pone ${rating(b.score).label.toLowerCase()} ${when}`,
    body: `Mejor hacia las ${hhmm(b.t, spot.tz)}: ${fmt(b.h)} m · ${fmt(b.T, 0)} s del ${cardinal(b.dir)} · ${wind}`,
  };
}

// ---------- Avisos meteorológicos de AEMET ----------
const WARN_ES = { costeros: "fenómenos costeros" };
const WARN_EN = {
  costeros: "coastal hazards",
  vientos: "wind",
  lluvias: "rain",
  tormentas: "thunderstorms",
  galerna: "galerna squall",
  rissaga: "rissaga",
  "temperaturas máximas": "high temperatures",
  "temperaturas mínimas": "low temperatures",
  nevadas: "snow",
  niebla: "fog",
};
const LEVEL_EN = { amarillo: "Yellow", naranja: "Orange", rojo: "Red" };

function warningMessage(spot, w, lang = "es") {
  const en = lang === "en";
  const name = w.phenomenon.toLowerCase();
  const when = (t) =>
    new Intl.DateTimeFormat(en ? "en-GB" : "es-ES", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: spot.tz,
    }).format(t);
  let timing = "";
  if (w.active && w.end != null) timing = en ? `In force until ${when(w.end)}` : `En vigor hasta ${when(w.end)}`;
  else if (!w.active && w.start != null) timing = en ? `Starts ${when(w.start)}` : `Empieza ${when(w.start)}`;
  const body = `AEMET · ${w.zone}.${timing ? ` ${timing}.` : ""}`;
  return {
    url: `/#/spot/${spot.id}`,
    tag: `${spot.id}-warning-${w.level}`,
    title: en
      ? `${LEVEL_EN[w.level]} warning at ${spot.name}: ${WARN_EN[name] ?? name}`
      : `Aviso ${w.level} en ${spot.name}: ${WARN_ES[name] ?? name}`,
    body,
  };
}

// Un aviso de AEMET se notifica una vez por dispositivo. La clave incluye el nivel (si sube, avisa de nuevo)
// y el día de inicio (así una corrección menor del aviso no lo repite). Usa la tabla `sent` de los avisos de oleaje.
const warningKey = (w, now) =>
  `w:${w.phenomenon.toLowerCase()}:${w.zone}:${w.level}:${new Date(w.start ?? now).toISOString().slice(0, 10)}`;

// Avisa a quien tiene alertas en un spot cuando AEMET publica un aviso amarillo, naranja o rojo que le afecta.
// No depende del umbral de calidad del oleaje: es información de seguridad.
export async function checkWarnings(now = Date.now()) {
  const ids = q.activeSpots
    .all()
    .map((r) => r.spot_id)
    .filter((id) => spotById[id]);
  if (!ids.length) return { checked: 0, sent: 0 };
  const all = await aemet.allWarnings(); // si AEMET falla devuelve [], nunca avisos falsos
  let sentCount = 0;
  for (const id of ids) {
    const spot = spotById[id];
    const local = hourOf(now, spot.tz);
    if (local < 7 || local >= 22) continue; // los avisos vigentes se envían por la mañana
    const warnings = aemet.alertableWarnings(spot, all, now);
    if (!warnings.length) continue;
    for (const sub of q.watchers.all(id)) {
      if (local < sub.from_h || local >= sub.to_h) continue; // fuera de la franja elegida por el usuario
      for (const w of warnings) {
        const key = warningKey(w, now);
        if (!q.markSent.run(sub.endpoint, id, key, now).changes) continue;
        if (await send(sub, warningMessage(spot, w, sub.lang))) sentCount++;
        else q.unmarkSent.run(sub.endpoint, id, key);
        break; // un aviso meteorológico por spot en cada revisión
      }
    }
  }
  return { checked: ids.length, sent: sentCount };
}

export async function checkAlerts(now = Date.now()) {
  const ids = q.activeSpots
    .all()
    .map((r) => r.spot_id)
    .filter((id) => spotById[id]);
  if (!ids.length) return { checked: 0, sent: 0 };
  // Primero los avisos de AEMET: si la previsión de oleaje falla, estos deben llegar igualmente.
  let warned = 0;
  try {
    warned = (await checkWarnings(now)).sent;
  } catch (err) {
    console.error("[push] avisos de AEMET:", err.message);
  }
  const fc = (await forecastAll(SPOTS)).spots;
  let sentCount = warned;
  for (const id of ids) {
    const spot = spotById[id];
    const local = hourOf(now, spot.tz);
    if (local < 7 || local >= 22) continue; // nada de avisos de madrugada
    if (!fc[id]) continue;
    const { days } = await forecastFor(spot, fc[id], now);
    // Hoy (si la mejor hora aún no ha pasado) y mañana.
    const candidates = days
      .slice(0, 2)
      .map((d, i) => ({ d, isToday: i === 0 }))
      .filter(({ d }) => d.best.t > now);
    for (const sub of q.watchers.all(id)) {
      if (local < sub.from_h || local >= sub.to_h) continue; // fuera de la franja elegida por el usuario
      for (const { d, isToday } of candidates) {
        if (d.best.score < (sub.spot_min ?? sub.min_score)) continue;
        if (sub.offshore && !["off", "calm"].includes(d.best.windType)) continue; // «solo con terral»
        const lvl = RATINGS.findIndex((r) => r.key === rating(d.best.score).key);
        const lvlKey = `lvl:${d.key}:${lvl}`; // nivel de calidad del que ya se avisó ese día
        // Se reserva el aviso antes de enviarlo: si otro proceso (web y worker a la vez) ya lo envió, no se repite.
        if (!q.markSent.run(sub.endpoint, id, d.key, now).changes) {
          // Ya se avisó de este día: solo se vuelve a avisar si ha mejorado de nivel (entra un swell, el viento rola).
          const before = q.levelsOf.all(sub.endpoint, id, `lvl:${d.key}:%`).map((r) => +r.day.split(":").at(-1));
          if (!before.length) q.markSent.run(sub.endpoint, id, lvlKey, now); // aviso de antes de existir esto: punto de partida
          if (!before.length || lvl <= Math.max(...before)) continue;
          if (!q.markSent.run(sub.endpoint, id, lvlKey, now).changes) continue;
          if (await send(sub, message(spot, d, isToday, sub.lang, true))) sentCount++;
          else q.unmarkSent.run(sub.endpoint, id, lvlKey);
          break;
        }
        q.markSent.run(sub.endpoint, id, lvlKey, now);
        if (await send(sub, message(spot, d, isToday, sub.lang))) sentCount++;
        else {
          q.unmarkSent.run(sub.endpoint, id, d.key);
          q.unmarkSent.run(sub.endpoint, id, lvlKey);
        }
        break; // un aviso por spot en cada revisión
      }
    }
  }
  q.pruneSent.run(now - 10 * 24 * 3600e3);
  return { checked: ids.length, sent: sentCount };
}

export function startScheduler() {
  const run = () =>
    checkAlerts()
      .then((r) => r.sent && console.log(`[push] ${r.sent} ${r.sent === 1 ? "aviso enviado" : "avisos enviados"}`))
      .catch((err) => console.error("[push]", err.message));
  setTimeout(run, 60e3);
  return setInterval(run, 60 * 60e3);
}
