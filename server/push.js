// Avisos push: el usuario elige spots y un umbral; una vez por hora se revisa la previsión
// y se avisa como máximo una vez por spot y día cuando la mejor ventana supera el umbral.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import webpush from "web-push";
import { SPOTS, spotById } from "../public/js/spots.js";
import { rating, fmt, hhmm, hourOf, cardinal } from "../public/js/surf.js";
import { forecastAll } from "./forecast.js";
import { forecastFor } from "./conditions.js";

import { DATA_DIR } from "./config.js";

// ---------- Claves VAPID ----------
function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = path.join(DATA_DIR, "vapid.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.warn(`[push] Claves VAPID generadas en ${file}. En producción defínelas con VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.`);
  return keys;
}
const VAPID = vapidKeys();
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:avisos@example.com";
if (!process.env.VAPID_SUBJECT) console.warn("[push] Define VAPID_SUBJECT (mailto: o URL de contacto) antes de publicar.");
webpush.setVapidDetails(SUBJECT, VAPID.publicKey, VAPID.privateKey);
export const publicKey = VAPID.publicKey;

// ---------- Base de datos ----------
const db = new DatabaseSync(path.join(DATA_DIR, "marea.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
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

const q = {
  upsertSub: db.prepare(`INSERT INTO subscriptions (endpoint, p256dh, auth, min_score, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, min_score = excluded.min_score`),
  clearAlerts: db.prepare(`DELETE FROM alerts WHERE endpoint = ?`),
  addAlert: db.prepare(`INSERT OR IGNORE INTO alerts (endpoint, spot_id) VALUES (?, ?)`),
  deleteSub: db.prepare(`DELETE FROM subscriptions WHERE endpoint = ?`),
  deleteAlerts: db.prepare(`DELETE FROM alerts WHERE endpoint = ?`),
  getSub: db.prepare(`SELECT * FROM subscriptions WHERE endpoint = ?`),
  spotsOf: db.prepare(`SELECT spot_id FROM alerts WHERE endpoint = ?`),
  activeSpots: db.prepare(`SELECT DISTINCT spot_id FROM alerts`),
  watchers: db.prepare(`SELECT s.* FROM subscriptions s JOIN alerts a ON a.endpoint = s.endpoint WHERE a.spot_id = ?`),
  wasSent: db.prepare(`SELECT 1 FROM sent WHERE endpoint = ? AND spot_id = ? AND day = ?`),
  markSent: db.prepare(`INSERT OR IGNORE INTO sent (endpoint, spot_id, day, sent_at) VALUES (?, ?, ?, ?)`),
  pruneSent: db.prepare(`DELETE FROM sent WHERE sent_at < ?`),
};

// ---------- API ----------
const isSub = s => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys?.p256dh && s.keys?.auth;

export function subscribe({ subscription, spots, minScore }) {
  if (!isSub(subscription)) throw Object.assign(new Error("Suscripción no válida"), { status: 400 });
  const ids = (Array.isArray(spots) ? spots : []).filter(id => spotById[id]).slice(0, 50);
  const min = [2, 3, 4].includes(+minScore) ? +minScore : 3;
  const ep = subscription.endpoint;
  db.exec("BEGIN");
  try {
    q.upsertSub.run(ep, subscription.keys.p256dh, subscription.keys.auth, min, Date.now());
    q.clearAlerts.run(ep);
    for (const id of ids) q.addAlert.run(ep, id);
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
  if (!sub) return { subscribed: false, spots: [], minScore: 3 };
  return { subscribed: true, spots: q.spotsOf.all(endpoint).map(r => r.spot_id), minScore: sub.min_score };
}

// Sustituible en los tests para no depender de los servicios push reales.
let deliver = (sub, body, opts) => webpush.sendNotification(sub, body, opts);
export const _setDeliver = fn => { deliver = fn; };

async function send(sub, payload) {
  try {
    await deliver({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      unsubscribe(sub.endpoint); // el navegador ya no la acepta
    } else {
      console.warn(`[push] envío fallido (${err.statusCode ?? err.message})`);
    }
    return false;
  }
}

export async function sendTest(endpoint) {
  const sub = q.getSub.get(endpoint);
  if (!sub) throw Object.assign(new Error("No hay suscripción para este dispositivo"), { status: 404 });
  const ok = await send(sub, { title: "Avisos de Marea activados", body: "Te avisaremos cuando tus spots se pongan buenos.", url: "/" });
  if (!ok) throw Object.assign(new Error("El servicio de notificaciones rechazó el envío"), { status: 502 });
  return { ok };
}

// ---------- Revisión periódica ----------
function message(spot, day, isToday) {
  const b = day.best;
  const when = isToday ? "hoy" : "mañana";
  const wind = b.windType === "calm" ? "sin viento"
    : `viento ${{ off: "terral", cross: "cruzado", on: "de mar" }[b.windType] ?? ""} de ${fmt(b.wind, 0)} kn`.replace("  ", " ");
  return {
    title: `${spot.name} se pone ${rating(b.score).label.toLowerCase()} ${when}`,
    body: `Mejor hacia las ${hhmm(b.t, spot.tz)}: ${fmt(b.h)} m · ${fmt(b.T, 0)} s del ${cardinal(b.dir)} · ${wind}`,
    url: `/#/spot/${spot.id}`,
    tag: `${spot.id}-${day.key}`,
  };
}

export async function checkAlerts(now = Date.now()) {
  const ids = q.activeSpots.all().map(r => r.spot_id).filter(id => spotById[id]);
  if (!ids.length) return { checked: 0, sent: 0 };
  const fc = (await forecastAll(SPOTS)).spots;
  let sentCount = 0;
  for (const id of ids) {
    const spot = spotById[id];
    const local = hourOf(now, spot.tz);
    if (local < 7 || local >= 22) continue; // nada de avisos de madrugada
    if (!fc[id]) continue;
    const { days } = await forecastFor(spot, fc[id], now);
    // Hoy (si la mejor hora aún no ha pasado) y mañana.
    const candidates = days.slice(0, 2).map((d, i) => ({ d, isToday: i === 0 })).filter(({ d }) => d.best.t > now);
    for (const sub of q.watchers.all(id)) {
      for (const { d, isToday } of candidates) {
        if (d.best.score < sub.min_score || q.wasSent.get(sub.endpoint, id, d.key)) continue;
        if (await send(sub, message(spot, d, isToday))) {
          q.markSent.run(sub.endpoint, id, d.key, now);
          sentCount++;
        }
        break; // un aviso por spot en cada revisión
      }
    }
  }
  q.pruneSent.run(now - 10 * 24 * 3600e3);
  return { checked: ids.length, sent: sentCount };
}

export function startScheduler() {
  const run = () => checkAlerts().then(r => r.sent && console.log(`[push] ${r.sent} ${r.sent === 1 ? "aviso enviado" : "avisos enviados"}`)).catch(err => console.error("[push]", err.message));
  setTimeout(run, 60e3);
  return setInterval(run, 60 * 60e3);
}
