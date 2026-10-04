// El móvil protagonista: un único teléfono que pasa por varias escenas (lista → detalle → avisos → bloqueo).
// Sus movimientos se encadenan con phoneTo(), siempre en orden cronológico, para que cada tramo parta de
// donde terminó el anterior.
import { tl, gsap, el, hook, prog } from "./core.js";
import { phone, listView, detailView, alertsView, lockView } from "./ui.js";

const PW = 418, PH = 872;
let hero = null;

export function heroPhone() {
  if (hero) return hero;
  hero = phone({ views: { list: listView(), detail: detailView(), alerts: alertsView(), lock: lockView() } });
  hero.dev.classList.add("p-hero");
  document.getElementById("phone-layer").append(hero.dev);
  for (const [name, v] of Object.entries(hero.views)) {
    v.style.visibility = name === "list" ? "visible" : "hidden";
    v.insertAdjacentHTML("beforeend", `<div class="p-dim"></div>`);
  }
  hero.touch = el("div", "p-touch");
  hero.screen.append(hero.touch);
  floatHook(hero.body);
  gsap.set(hero.dev, { x: 1500, y: 1400, rotationY: -40, rotationX: 24, rotationZ: 8, scale: 0.9, transformPerspective: 2400, autoAlpha: 0 });
  return hero;
}

// Lleva el móvil a un estado: centro (cx, cy) en el escenario, giros en grados y escala.
export function phoneTo(t, dur, { cx, cy, ry = 0, rx = 0, rz = 0, s = 1, ease = "power3.inOut" }) {
  const { dev } = heroPhone();
  tl.to(dev, { x: cx - PW / 2, y: cy - PH / 2, rotationY: ry, rotationX: rx, rotationZ: rz, scale: s, duration: dur, ease }, t);
}

export function phoneShow(t) { tl.set(heroPhone().dev, { autoAlpha: 1 }, t); }
export function phoneHide(t) { tl.set(heroPhone().dev, { autoAlpha: 0 }, t); }

// Navegación como en iOS: la vista nueva entra desde la derecha y la anterior se desplaza y oscurece.
export function push(t, from, to, { dur = 0.55 } = {}) {
  const { views } = heroPhone();
  tl.set(views[to], { visibility: "visible", x: 390, zIndex: 2 }, t - 0.001);
  tl.to(views[to], { x: 0, duration: dur, ease: "power3.inOut" }, t);
  tl.to(views[from], { x: -120, duration: dur, ease: "power3.inOut" }, t);
  tl.fromTo(views[from].querySelector(".p-dim"), { opacity: 0 }, { opacity: 0.45, duration: dur, ease: "power2.inOut", immediateRender: false }, t);
  tl.set(views[from], { visibility: "hidden", zIndex: 0 }, t + dur);
  tl.set(views[to], { zIndex: 1 }, t + dur);
}

// Cambio directo (fundido), por ejemplo al bloquear el móvil.
export function crossfade(t, from, to, { dur = 0.35 } = {}) {
  const { views } = heroPhone();
  tl.set(views[to], { visibility: "visible", x: 0, zIndex: 2, opacity: 0 }, t - 0.001);
  tl.to(views[to], { opacity: 1, duration: dur, ease: "power2.inOut" }, t);
  tl.set(views[from], { visibility: "hidden", zIndex: 0 }, t + dur);
  tl.set(views[to], { zIndex: 1 }, t + dur);
}

// Desplaza el contenido de una vista (como un scroll).
export function scrollTo(t, dur, view, y, ease = "power2.inOut") {
  tl.to(heroPhone().views[view].querySelector(".p-scroll"), { y: -y, duration: dur, ease }, t);
}

// Toque con el dedo en un punto de la pantalla (coordenadas de la pantalla del móvil, 390×844).
export function tap(t, x, y) {
  const { touch } = heroPhone();
  tl.set(touch, { left: x, top: y }, t - 0.2);
  tl.fromTo(touch, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out", immediateRender: false }, t - 0.18);
  tl.to(touch, { scale: 0.85, duration: 0.08, ease: "power2.in" }, t);
  tl.to(touch, { opacity: 0, scale: 1.25, duration: 0.3, ease: "power2.out" }, t + 0.1);
}

// Posición de un elemento dentro de la pantalla del móvil (sin transformaciones), para colocar toques.
export function screenPos(node) {
  const { screen } = heroPhone();
  let x = 0, y = 0, n = node;
  while (n && n !== screen) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

// Balanceo suave mientras está quieto, para que nunca parezca una imagen fija. Un único hook calcula la
// amplitud a partir de todos los tramos, así cada fotograma tiene un valor definido aunque se salte en el tiempo.
const floats = [];
export function phoneFloat(t0, t1, amp = 1) { floats.push([t0, t1, amp]); }
function floatHook(body) {
  hook(t => {
    let k = 0;
    for (const [t0, t1, amp] of floats) k = Math.max(k, Math.min(prog(t, t0 - 0.5, 0.8), 1 - prog(t, t1, 0.5)) * amp);
    body.style.transform = k ? `translateY(${(Math.sin(t * 1.3) * 8 * k).toFixed(2)}px) rotateZ(${(Math.sin(t * 0.9) * 0.6 * k).toFixed(3)}deg)` : "";
  });
}
