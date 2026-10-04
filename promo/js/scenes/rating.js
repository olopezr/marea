// 16–22 s · Valoración: entra el móvil con la lista de spots; la tarjeta de Somo sale de la pantalla y su nota
// sube de "Plato" a "Muy bueno" a medida que aparecen los factores que la componen.
import { tl, hook, cue, el, scene, within, prog, textBlock, textIn, textOut } from "../core.js";
import { SCENES } from "../timeline.js";
import { rating, fmt } from "/js/surf.js";
import { LIST } from "../data.js";
import { cardHTML } from "../ui.js";
import { heroPhone, phoneTo, phoneShow, phoneFloat, push, tap, screenPos } from "../phone.js";

const S = SCENES.rating;
const PHONE = { cx: 1400, cy: 560 };
const FACTORS = ["Ola", "Periodo", "Exposición", "Viento", "Marea"];
const STEPS = [0.9, 0.9, 0.9, 0.9, 0.8]; // suman 4,4: la nota de Somo
const T_STEP0 = S.start + 1.5;

export default function build() {
  const sec = scene("rating", S, { post: 0.2 });
  const ph = heroPhone();

  // Entra el móvil y se van colocando las tarjetas
  phoneShow(S.start - 0.45);
  phoneTo(S.start - 0.45, 1.05, { ...PHONE, ry: -16, rx: 5, rz: 0, s: 1, ease: "expo.out" });
  phoneFloat(S.start + 0.6, S.end - 0.6);
  const list = ph.views.list;
  const cards = [...list.querySelectorAll(".card")];
  tl.fromTo([list.querySelector(".lede"), ...cards], { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", stagger: 0.07, immediateRender: true }, S.start - 0.05);
  cue(S.start - 0.45, "whoosh", { pan: 0.5 });

  // Texto
  const tb = textBlock(sec, {
    num: "02", eyebrow: "Valoración",
    title: "¿Merece la<br>pena ir?",
    sub: "Una nota de 0 a 5 para cada spot y cada hora, calculada con:",
    x: 120, y: 250, width: 720,
  });
  const chips = el("div", "p-chips p-factors", FACTORS.map(f => `<span class="p-chip">${f}</span>`).join(""));
  tb.box.append(chips);
  textIn(tb, S.start + 0.25);

  // La tarjeta sale del móvil
  const first = cards[0];
  const pos = screenPos(first);
  const start = { x: PHONE.cx - 195 + pos.x + pos.w / 2, y: PHONE.cy - 422 + pos.y + pos.h / 2 };
  const pop = el("div", "p-pop theme-dark p-cardpop", `<div class="p-scorebadge"><b>0,0</b><span>/ 5</span></div>${cardHTML({ ...LIST[0], score: 0 }, { fav: true })}`);
  pop.style.width = `${pos.w}px`;
  document.getElementById("pop-layer").append(pop);
  const T_POP = S.start + 1.15, T_BACK = S.end - 0.75;
  tl.set(pop, { visibility: "hidden" }, 0);
  tl.set(pop, { visibility: "visible" }, T_POP - 0.001);
  tl.set(pop, { visibility: "hidden" }, T_BACK + 0.45);
  tl.fromTo(pop, { x: start.x - pos.w / 2, y: start.y - pos.h / 2, scale: 1, rotationY: -16, rotationZ: 0, transformPerspective: 1600 },
    { x: 1120 - pos.w / 2, y: 640 - pos.h / 2, scale: 1.42, rotationY: 7, rotationZ: -2, duration: 0.6, ease: "expo.out", immediateRender: false }, T_POP);
  tl.to(first, { opacity: 0.25, duration: 0.25 }, T_POP);
  cue(T_POP, "pop", { pitch: 0.9 });

  // Cada factor suma a la nota; la etiqueta y el color cambian al cruzar cada umbral
  [...chips.children].forEach((c, i) => {
    const at = T_STEP0 + i * 0.5;
    tl.fromTo(c, { opacity: 0, y: 18, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(2)", immediateRender: true }, at);
    tl.fromTo(c, { backgroundColor: "rgba(255,122,77,.5)" }, { backgroundColor: "rgba(91,182,198,.12)", duration: 0.6, ease: "power2.out", immediateRender: false }, at);
    cue(at, "step", { n: i });
  });
  const ratingEl = pop.querySelector(".rating"), chip = ratingEl.querySelector(".chip"), bars = [...ratingEl.querySelectorAll(".score i")];
  const badge = pop.querySelector(".p-scorebadge b");
  hook(t => {
    if (!within(t, T_POP - 0.1, T_BACK + 0.5)) return;
    const score = STEPS.reduce((sum, v, i) => sum + v * prog(t, T_STEP0 + i * 0.5, 0.32, "power2.out"), 0);
    const r = rating(score);
    ratingEl.className = `rating r-${r.key}`;
    chip.textContent = r.label;
    bars.forEach((b, i) => b.style.setProperty("--f", Math.max(0, Math.min(1, score - i)).toFixed(3)));
    badge.textContent = fmt(score);
    badge.parentElement.className = `p-scorebadge r-${r.key}`;
  });

  // Vuelta al móvil, toque en Somo y paso al detalle
  tl.to(pop, { x: start.x - pos.w / 2, y: start.y - pos.h / 2, scale: 1, rotationY: -16, rotationZ: 0, duration: 0.45, ease: "power3.in" }, T_BACK);
  tl.to(first, { opacity: 1, duration: 0.15 }, T_BACK + 0.4);
  textOut(tb, S.end - 0.85);
  tap(S.end - 0.3, pos.x + pos.w / 2, pos.y + 60);
  cue(S.end - 0.3, "click");
  push(S.end - 0.2, "list", "detail");
}
