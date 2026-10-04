// Núcleo de la animación: una línea de tiempo GSAP en pausa que se posiciona en cualquier instante,
// más funciones por fotograma (hooks) para lo que se calcula (contadores, canvas, curvas).
// Todo es determinista: el mismo t da siempre el mismo fotograma, que es lo que permite renderizar en paralelo.
const { gsap, SplitText, DrawSVGPlugin, CustomEase } = window;
gsap.registerPlugin(SplitText, DrawSVGPlugin, CustomEase);
gsap.config({ force3D: true });
export { gsap, SplitText };

export const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", duration: 0.6 } });

const hooks = [];
export const hook = fn => hooks.push(fn);

// Momentos sonoros (golpes, clics, avisos) que la música coloca en su sitio.
export const CUES = [];
export const cue = (t, type, opts = {}) => CUES.push({ t: Math.round(t * 1000) / 1000, type, ...opts });

export function seek(t) {
  tl.seek(t, true);
  for (const h of hooks) h(t);
}

export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
export const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, p) => a + (b - a) * p;
const easeCache = new Map();
export const ease = name => {
  if (!easeCache.has(name)) easeCache.set(name, gsap.parseEase(name));
  return easeCache.get(name);
};
// Progreso 0–1 de un tramo [start, start + dur] con suavizado opcional.
export const prog = (t, start, dur, e) => {
  const p = clamp((t - start) / dur);
  return e ? ease(e)(p) : p;
};

// Aleatorio con semilla (mulberry32): mismas posiciones en cada render.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sección de escena: visible solo durante su tramo (con margen para las transiciones).
export function scene(id, { start, end }, { pre = 0, post = 0 } = {}) {
  const sec = el("section", "p-scene");
  sec.id = `s-${id}`;
  document.getElementById("scenes").append(sec);
  if (start - pre > 0) tl.set(sec, { visibility: "visible" }, start - pre - 0.001);
  else sec.style.visibility = "visible";
  tl.set(sec, { visibility: "hidden" }, end + post);
  return sec;
}

// Activo si t cae en el tramo; los hooks lo usan para no trabajar fuera de su escena.
export const within = (t, a, b) => t >= a && t <= b;

// Bloque de texto estándar: antetítulo numerado, titular y entradilla.
export function textBlock(parent, { num, eyebrow, title, sub, x, y, width = 760, align = "left" }) {
  const box = el("div", "p-text");
  Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, textAlign: align, justifyItems: align === "center" ? "center" : "start" });
  box.innerHTML = `
    ${eyebrow ? `<div class="p-eyebrow">${num ? `<span class="n">${num}</span>` : ""}<span class="bar"></span><span class="lbl">${eyebrow}</span></div>` : ""}
    <h2 class="p-h">${title}</h2>
    ${sub ? `<p class="p-sub">${sub}</p>` : ""}`;
  parent.append(box);
  const h = box.querySelector(".p-h");
  const split = SplitText.create(h, { type: "lines,words", mask: "lines", linesClass: "p-line" });
  return { box, eyebrow: box.querySelector(".p-eyebrow"), h, words: split.words, sub: box.querySelector(".p-sub") };
}

export function textIn(b, t0, { stagger = 0.06 } = {}) {
  if (b.eyebrow) {
    tl.fromTo(b.eyebrow.querySelector(".bar"), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.out" }, t0);
    tl.fromTo([...b.eyebrow.children].filter(c => !c.classList.contains("bar")), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.08 }, t0 + 0.05);
  }
  tl.fromTo(b.words, { yPercent: 115, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 0.75, ease: "expo.out", stagger }, t0 + 0.12);
  if (b.sub) tl.fromTo(b.sub, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, t0 + 0.42);
}

export function textOut(b, t0) {
  const parts = [b.eyebrow, b.h, b.sub, ...b.box.querySelectorAll(".p-chips")].filter(Boolean);
  tl.to(parts, { y: -40, opacity: 0, duration: 0.4, ease: "power2.in", stagger: 0.04 }, t0);
}

// Número que cuenta con formato español (coma decimal).
export const fmtNum = (n, d = 0) => n.toFixed(d).replace(".", ",");
