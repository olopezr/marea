// 22–28 s · Previsión: el móvil pasa a la izquierda con el detalle de Somo, salen las fichas de condiciones y
// después la cámara se acerca al panel de 7 días, que se colorea en diagonal.
import { tl, hook, cue, el, scene, within, prog, textBlock, textIn, textOut } from "../core.js";
import { SCENES } from "../timeline.js";
import { TILES } from "../ui.js";
import { heroPhone, phoneTo, phoneFloat, scrollTo, screenPos } from "../phone.js";

const S = SCENES.forecast;
const PHONE = { cx: 560, cy: 560 };
// Fichas que salen del móvil y dónde se quedan flotando (centro en el escenario, giro).
const OUT = [["swell", 205, 300, -4], ["wind", 190, 575, 3], ["water", 215, 840, -2], ["uv", 912, 360, 4], ["light", 918, 730, -3]];

export default function build() {
  const sec = scene("forecast", S, { post: 0.2 });
  const ph = heroPhone();
  const detail = ph.views.detail;

  phoneTo(S.start - 0.3, 1.0, { ...PHONE, ry: 16, rx: 4, rz: 0, s: 1 });
  phoneFloat(S.start + 0.7, S.start + 2.9);

  const tb = textBlock(sec, {
    num: "03", eyebrow: "Previsión",
    title: "Hora a hora,<br>7 días vista",
    sub: "Oleaje, mar de fondo, viento, agua, índice UV y horas de luz. <b>Y la mejor hora de cada día</b>, de un vistazo.",
    x: 1070, y: 250, width: 740,
  });
  textIn(tb, S.start + 0.3);

  // Fichas que salen del móvil
  const pops = OUT.map(([key, x, y, rot], i) => {
    const src = detail.querySelector(`.t-${key}`);
    const p = screenPos(src);
    const sx = PHONE.cx - 195 + p.x + p.w / 2, sy = PHONE.cy - 422 + p.y + p.h / 2;
    const pop = el("div", "p-pop theme-dark p-tilepop", TILES[key]);
    pop.style.width = `${p.w}px`;
    document.getElementById("pop-layer").append(pop);
    const at = S.start + 0.85 + i * 0.25;
    tl.set(pop, { visibility: "hidden" }, 0);
    tl.set(pop, { visibility: "visible" }, at - 0.001);
    tl.fromTo(pop, { x: sx - p.w / 2, y: sy - p.h / 2, scale: 0.9, rotate: 0, opacity: 0.4 },
      { x: x - p.w / 2, y: y - p.h / 2, scale: 1.32, rotate: rot, opacity: 1, duration: 0.65, ease: "back.out(1.4)", immediateRender: false }, at);
    tl.to(pop, { x: sx - p.w / 2, y: sy - p.h / 2, scale: 0.7, opacity: 0, duration: 0.4, ease: "power2.in" }, S.start + 2.95 + i * 0.03);
    tl.set(pop, { visibility: "hidden" }, S.start + 3.45);
    cue(at, "pop", { pitch: 1 + i * 0.12, pan: x < PHONE.cx ? -0.5 : 0.3 });
    return { pop, i };
  });
  // Flotan un poco mientras están fuera
  const inner = pops.map(({ pop }) => pop.firstElementChild);
  hook(t => {
    if (!within(t, S.start + 0.8, S.start + 3.5)) return;
    inner.forEach((n, i) => { n.style.transform = `translateY(${(Math.sin(t * 1.7 + i * 1.3) * 6).toFixed(2)}px)`; });
  });

  // Acercamiento al panel de 7 días
  const week = detail.querySelector(".p-week");
  const wp = screenPos(week);
  const scrollY = wp.y + wp.h / 2 - 470;
  const T_ZOOM = S.start + 3.05;
  scrollTo(T_ZOOM, 0.9, "detail", scrollY, "power3.inOut");
  phoneTo(T_ZOOM, 0.9, { cx: 590, cy: 540 - (470 - 422) * 1.8, ry: 0, rx: 0, rz: 0, s: 1.8, ease: "power3.inOut" });
  cue(T_ZOOM, "whoosh", { pan: -0.3 });

  const rows = [...week.querySelectorAll(".day:not(.week-head)")];
  const cells = rows.flatMap((r, ri) => [...r.querySelectorAll(".cells .q")].map((c, ci) => ({ c, d: ri * 0.55 + ci })));
  const T_FILL = T_ZOOM + 0.55;
  cells.forEach(({ c, d }) => {
    tl.fromTo(c, { scale: 0, opacity: 0 }, { scale: 1, opacity: c.classList.contains("past") ? 0.35 : 1, duration: 0.35, ease: "back.out(2.5)", immediateRender: true }, T_FILL + d * 0.032);
  });
  const ends = rows.flatMap(r => [...r.querySelectorAll(":scope > .small")]);
  tl.fromTo(ends, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, immediateRender: true }, T_FILL + 0.4);
  cue(T_FILL, "sparkle");

  // Salida: el móvil baja y deja paso a la marea
  textOut(tb, S.end - 0.8);
  phoneTo(S.end - 0.6, 0.7, { cx: 640, cy: 1750, ry: 8, rx: -24, rz: 4, s: 1.2, ease: "power3.in" });
}
