// Suscripción a avisos push en el navegador.
import { push } from "./api.js";

export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iOS solo permite notificaciones web si la app está instalada en la pantalla de inicio.
export const needsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches && !navigator.standalone;

const b64ToBytes = b64 => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

// Si el service worker no llega a registrarse (navegadores integrados, modo privado…), `ready` no se
// resuelve nunca: se espera como mucho 4 s para no dejar la pantalla de avisos cargando para siempre.
const swReady = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => setTimeout(() => reject(new Error("Este navegador no permite activar avisos ahora mismo.")), 4000)),
]);

async function currentSubscription() {
  if (!supported()) return null;
  const reg = await swReady();
  return reg.pushManager.getSubscription();
}

let state = { subscribed: false, spots: [], minScore: 3 };
export const getState = () => state;

export async function load() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return (state = { subscribed: false, spots: [], minScore: state.minScore });
  state = await push.status(sub.endpoint).catch(() => state);
  return state;
}

async function ensureSubscription() {
  const existing = await currentSubscription();
  if (existing) return existing;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Para recibir avisos, permite las notificaciones de Marea en los ajustes del navegador.");
  const { publicKey } = await push.key();
  const reg = await swReady();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
}

export async function save(spots, minScore = state.minScore) {
  if (!spots.length) return disableAll();
  const sub = await ensureSubscription();
  state = await push.subscribe({ subscription: sub.toJSON(), spots, minScore });
  return state;
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
  return (state = { subscribed: false, spots: [], minScore: 3 });
}

export async function sendTest() {
  const sub = await currentSubscription();
  if (!sub) throw new Error("Activa antes los avisos de algún spot.");
  return push.test(sub.endpoint);
}
