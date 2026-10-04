// 42–48 s · Avisos: vuelve el móvil con la pantalla de avisos; se elige "Muy bueno" y se activan dos spots.
// El móvil se bloquea y llega la notificación, igual que la que envía el servidor (server/push.js).
import { tl, hook, cue, el, scene, within, prog, textBlock, textIn, textOut } from "../core.js";
import { SCENES } from "../timeline.js";
import { notifHTML } from "../ui.js";
import { ALERTS } from "../data.js";
import { heroPhone, phoneTo, phoneShow, phoneHide, phoneFloat, crossfade, tap, screenPos } from "../phone.js";

const S = SCENES.alerts;
const PHONE = { cx: 1380, cy: 560 };

export default function build() {
  const sec = scene("alerts", S, { post: 0.2 });
  const ph = heroPhone();
  const { views } = ph;

  // Fuera de cuadro durante la marea y las boyas; vuelve ya en la pantalla de avisos
  phoneHide(SCENES.tide.start + 0.3);
  tl.set(views.detail, { visibility: "hidden" }, S.start - 0.4);
  tl.set(views.alerts, { visibility: "visible", x: 0, zIndex: 1 }, S.start - 0.4);
  tl.set(ph.dev, { x: PHONE.cx - 209 + 260, y: 1250, rotationY: -34, rotationX: 22, rotationZ: 6, scale: 0.95 }, S.start - 0.37);
  phoneShow(S.start - 0.35);
  phoneTo(S.start - 0.35, 0.95, { ...PHONE, ry: -14, rx: 5, rz: 0, s: 1, ease: "expo.out" });
  phoneFloat(S.start + 0.6, S.end - 0.5);
  cue(S.start - 0.35, "whoosh", { pan: 0.5 });

  const tb = textBlock(sec, {
    num: "06", eyebrow: "Avisos",
    title: "Te avisamos<br>cuando se<br>pone bueno",
    sub: "Eliges tus spots y la calidad mínima. Como mucho, <b>un aviso por spot y día</b>.",
    x: 120, y: 230, width: 760,
  });
  textIn(tb, S.start + 0.2);

  // "Avisar a partir de": de Bueno a Muy bueno
  const alertsView = views.alerts;
  const seg = alertsView.querySelector(".p-minscore");
  const [, good, epic] = seg.querySelectorAll("button");
  const T_SEG = S.start + 0.95;
  const sp = screenPos(epic);
  tap(T_SEG, sp.x + sp.w / 2, sp.y + sp.h / 2);
  cue(T_SEG, "click");
  const off = { backgroundColor: "rgba(13,37,45,0)", color: "#8fa9af", boxShadow: "0 1px 2px rgba(0,0,0,0)" };
  const on = { backgroundColor: "#0d252d", color: "#dce9eb", boxShadow: "0 1px 2px rgba(0,0,0,.08)" };
  tl.fromTo(good, on, { ...off, duration: 0.2, immediateRender: true }, T_SEG);
  tl.fromTo(epic, off, { ...on, duration: 0.2, immediateRender: true }, T_SEG);

  // Interruptores de los spots elegidos
  ALERTS.spots.forEach((id, i) => {
    const sw = alertsView.querySelector(`.p-switch[data-spot="${id}"]`);
    if (!sw) return;
    const at = S.start + 1.45 + i * 0.5;
    const p = screenPos(sw);
    tap(at, p.x + p.w / 2, p.y + p.h / 2);
    tl.fromTo(sw, { backgroundColor: "#1d3a43" }, { backgroundColor: "#5cc48c", duration: 0.2, ease: "power2.out", immediateRender: true }, at);
    tl.fromTo(sw.firstElementChild, { x: 0 }, { x: 18, duration: 0.22, ease: "back.out(2)", immediateRender: true }, at);
    cue(at, "toggle", { n: i });
  });

  // Se bloquea el móvil y llega el aviso
  const T_LOCK = S.start + 2.6, T_NOTIF = S.start + 3.15;
  crossfade(T_LOCK, "alerts", "lock", { dur: 0.3 });
  // En la pantalla de bloqueo la hora va en grande: la barra de estado no la repite
  tl.to(ph.screen.querySelector(".p-status > span"), { opacity: 0, duration: 0.2 }, T_LOCK);
  cue(T_LOCK, "lock");
  const notif = views.lock.querySelector(".p-notif");
  tl.fromTo(notif, { y: -170, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.5)", immediateRender: true }, T_NOTIF);
  cue(T_NOTIF, "ding");

  // Copia grande del aviso, que sale hacia el espectador para poder leerlo
  const pop = el("div", "p-pop p-notifpop", notifHTML());
  document.getElementById("pop-layer").append(pop);
  const np = screenPos(notif);
  const sx = PHONE.cx - 195 + np.x + np.w / 2, sy = PHONE.cy - 422 + np.y + np.h / 2;
  tl.set(pop, { visibility: "hidden" }, 0);
  tl.set(pop, { visibility: "visible" }, T_NOTIF + 0.35);
  tl.fromTo(pop, { x: sx - 183, y: sy - 50, scale: 1, rotationY: -14, transformPerspective: 1600, opacity: 0 },
    { x: 1190 - 183, y: 215 - 50, scale: 1.62, rotationY: 6, rotationZ: -1.5, opacity: 1, duration: 0.65, ease: "expo.out", immediateRender: false }, T_NOTIF + 0.35);
  tl.to(views.lock.querySelector(".p-notif"), { opacity: 0.3, duration: 0.3 }, T_NOTIF + 0.4);
  cue(T_NOTIF + 0.35, "pop", { pitch: 1.3 });
  const glow = el("div", "p-notifglow");
  pop.prepend(glow);
  hook(t => {
    if (!within(t, T_NOTIF, S.end)) return;
    glow.style.opacity = (0.5 + 0.5 * Math.sin((t - T_NOTIF) * 3)) * prog(t, T_NOTIF + 0.4, 0.4);
  });

  // Salida
  textOut(tb, S.end - 0.75);
  tl.to(pop, { x: "+=300", opacity: 0, duration: 0.4, ease: "power2.in" }, S.end - 0.6);
  tl.set(pop, { visibility: "hidden" }, S.end - 0.15);
  phoneTo(S.end - 0.55, 0.65, { cx: 1500, cy: 1700, ry: -20, rx: -18, rz: -6, s: 1.1, ease: "power3.in" });
  phoneHide(S.end + 0.15);
}
