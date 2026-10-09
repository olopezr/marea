// Suscripción a avisos push en el navegador.
import { push } from "./api.js";
import { t, lang } from "./i18n.js";

export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iOS solo permite notificaciones web si la app está instalada en la pantalla de inicio.
export const needsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !window.matchMedia("(display-mode: standalone)").matches &&
  !navigator.standalone;

const b64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Si el service worker no llega a registrarse (navegadores integrados, modo privado…), `ready` no se
// resuelve nunca: se espera como mucho 4 s para no dejar la pantalla de avisos cargando para siempre.
const swReady = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error(t("err.webPushUnavailable"))), 4000)),
  ]);

async function currentSubscription() {
  if (!supported()) return null;
  const reg = await swReady();
  return reg.pushManager.getSubscription();
}

let state = { subscribed: false, spots: [], minScore: 3, prefs: {} };
export const getState = () => state;

export async function load() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return (state = { subscribed: false, spots: [], minScore: state.minScore, prefs: {} });
  // Un servidor anterior a los ajustes por spot no devuelve `prefs`: entonces no se ofrecen en la pantalla.
  state = await push.status(sub.endpoint).catch(() => state);
  return state;
}

async function ensureSubscription() {
  const existing = await currentSubscription();
  if (existing) return existing;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(t("err.permissionWeb"));
  const { publicKey } = await push.key();
  const reg = await swReady();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
}

export async function save(spots, minScore = state.minScore, prefs = state.prefs) {
  if (!spots.length) return disableAll();
  const sub = await ensureSubscription();
  // Solo los ajustes de los spots que siguen activos.
  const keep = Object.fromEntries(Object.entries(prefs ?? {}).filter(([id]) => spots.includes(id)));
  state = await push.subscribe({ subscription: sub.toJSON(), spots, minScore, prefs: keep, lang });
  return state;
}

// Ajustes de un spot: calidad mínima propia (`min`), solo con terral (`offshore`) y franja horaria (`from`, `to`).
// Un valor nulo o falso quita ese ajuste.
export async function setPref(id, patch) {
  if (!state.spots.includes(id)) return state;
  const next = { ...state.prefs?.[id], ...patch };
  for (const k of Object.keys(next)) if (next[k] == null || next[k] === false) delete next[k];
  return save(state.spots, state.minScore, { ...state.prefs, [id]: next });
}

// Sin spots activos el umbral se guarda en memoria y se envía con la primera suscripción.
export async function setMinScore(v) {
  if (state.spots.length) return save(state.spots, v);
  return (state = { ...state, minScore: v });
}

export async function toggleSpot(id) {
  const set = new Set(state.spots);
  set.has(id) ? set.delete(id) : set.add(id);
  return save([...set]);
}

export async function disableAll() {
  const sub = await currentSubscription();
  if (sub) {
    await push.unsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return (state = { subscribed: false, spots: [], minScore: 3, prefs: {} });
}

export async function sendTest() {
  const sub = await currentSubscription();
  if (!sub) throw new Error(t("err.noSpots"));
  return push.test(sub.endpoint);
}
