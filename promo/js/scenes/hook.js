// 0–6 s · Gancho: "¿Hay olas hoy?" y el lío de mirar previsión, mareas y boyas en sitios distintos.
// Todo acaba absorbido hacia el centro justo antes de la caída, de donde sale el logo.
import { tl, hook, cue, el, rng, within, prog } from "../core.js";
import { SCENES, W, H } from "../timeline.js";

const S = SCENES.hook;

const miniBars = `<svg viewBox="0 0 300 120"><g fill="#5bb6c6">${[38, 52, 70, 88, 96, 84, 66, 58, 74, 92, 104, 90].map((h, i) => `<rect x="${8 + i * 24}" y="${116 - h}" width="15" height="${h}" rx="3" opacity="${0.45 + i * 0.045}"/>`).join("")}</g></svg>`;
const miniTide = `<svg viewBox="0 0 300 120"><path d="M0,95 C40,95 55,20 100,20 S160,98 200,98 255,22 300,22" fill="none" stroke="#5bb6c6" stroke-width="5" stroke-linecap="round"/><path d="M0,95 C40,95 55,20 100,20 S160,98 200,98 255,22 300,22 V120 H0Z" fill="rgb(91 182 198 / .18)"/><circle cx="100" cy="20" r="7" fill="#0d252d" stroke="#5bb6c6" stroke-width="4"/></svg>`;
const miniBuoy = `<div class="p-mini-buoy"><span class="dot"></span><b>1,4 m</b><span>11 s · NO</span></div>`;

const CHIPS = ["Viento", "Mar de fondo", "Coeficiente", "Agua", "Horas de luz", "Presión", "Periodo", "Mareógrafo", "Índice UV"];
// Huecos alrededor del texto central donde caen las pestañas pequeñas (x, y, giro).
const CHIP_POS = [[150, 150, -7], [1520, 470, 5], [640, 860, 4], [1180, 900, -5], [120, 380, 6], [1560, 880, -3], [920, 160, 3], [300, 930, -4], [1650, 140, 8]];

export default function build() {
  const sec = document.createElement("section");
  sec.className = "p-scene";
  sec.id = "s-hook";
  sec.style.visibility = "visible";
  document.getElementById("scenes").append(sec);
  tl.set(sec, { visibility: "hidden" }, S.end);

  const stack = el("div", "p-hook-stack");
  sec.append(stack);

  // Pregunta
  const q = el("h1", "p-hook-q", ["¿Hay", "olas", "hoy?"].map(w => `<span>${w}</span>`).join(" "));
  stack.append(q);
  const words = [...q.children];
  words.forEach((w, i) => {
    const at = 0.5 + i * 0.5;
    tl.fromTo(w, { opacity: 0, scale: 1.6, filter: "blur(18px)", y: 30 }, { opacity: 1, scale: 1, filter: "blur(0px)", y: 0, duration: 0.42, ease: "expo.out", immediateRender: true }, at);
    cue(at, "hit", { n: i });
  });
  tl.to(q, { y: -318, scale: 0.46, duration: 0.55, ease: "power3.inOut" }, 2.0);
  tl.to(words[1], { color: "#5bb6c6", duration: 0.3 }, 2.0);

  // "Previsión en una web. Mareas en otra. Boyas en otra más."
  const lines = ["Previsión en una web.", "Mareas en otra.", "Boyas en otra más."].map((txt, i) => {
    const l = el("p", "p-hook-line", txt);
    l.style.top = `${430 + i * 84}px`;
    stack.append(l);
    tl.fromTo(l, { opacity: 0, y: 40, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.4, ease: "back.out(1.6)", immediateRender: true }, 2.5 + i * 0.5);
    return l;
  });

  // Tres "webs" distintas que aparecen con cada frase
  const cards = [
    { title: "previsión-olas", body: miniBars, x: 140, y: 470, r: -8, from: [-500, 140] },
    { title: "tabla-mareas", body: miniTide, x: 1400, y: 170, r: 6, from: [600, -300] },
    { title: "boyas-tiempo-real", body: miniBuoy, x: 1390, y: 610, r: -5, from: [600, 300] },
  ].map((c, i) => {
    const card = el("div", "p-tab", `<div class="p-tab-bar"><i></i><i></i><i></i><span>${c.title}</span></div><div class="p-tab-body">${c.body}</div>`);
    Object.assign(card.style, { left: `${c.x}px`, top: `${c.y}px` });
    stack.append(card);
    tl.fromTo(card, { x: c.from[0], y: c.from[1], rotate: c.r * 3, opacity: 0 }, { x: 0, y: 0, rotate: c.r, opacity: 1, duration: 0.55, ease: "back.out(1.3)", immediateRender: true }, 2.45 + i * 0.5);
    cue(2.5 + i * 0.5, "whoosh", { pan: c.x < W / 2 ? -0.6 : 0.6 });
    return card;
  });

  // Más pestañas: el lío crece a semicorcheas
  const r = rng(42);
  const chips = CHIPS.map((label, i) => {
    const [x, y, rot] = CHIP_POS[i];
    const chip = el("div", "p-tabchip", `<i></i><span>${label}</span>`);
    Object.assign(chip.style, { left: `${x}px`, top: `${y}px` });
    stack.append(chip);
    const at = 4.0 + i * 0.125;
    tl.fromTo(chip, { scale: 0, rotate: rot * 4, opacity: 0 }, { scale: 1, rotate: rot, opacity: 1, duration: 0.35, ease: "back.out(2.2)", immediateRender: true }, at);
    cue(at, "tick", { pan: (x - W / 2) / W, pitch: 0.8 + r() * 0.5 });
    return chip;
  });

  // Temblor de cámara mientras se acumula todo
  hook(t => {
    if (t > S.end) return;
    const k = within(t, 3.9, 5.05) ? prog(t, 3.9, 1.1) * 7 : 0;
    stack.style.translate = k ? `${(Math.sin(t * 71) * k).toFixed(2)}px ${(Math.cos(t * 53) * k).toFixed(2)}px` : "";
  });

  // Implosión hacia el centro
  const core = el("div", "p-core");
  sec.append(core);
  const all = [q, ...lines, ...cards, ...chips];
  all.forEach((node, i) => {
    tl.to(node, {
      x: () => W / 2 - (node.offsetLeft + node.offsetWidth / 2),
      y: () => H / 2 - (node.offsetTop + node.offsetHeight / 2),
      scale: 0.04, rotate: (i % 2 ? 1 : -1) * (120 + i * 7), opacity: 0,
      duration: 0.72, ease: "power4.in",
    }, 5.0 + (i % 5) * 0.03);
  });
  cue(5.0, "suck");
  tl.fromTo(core, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power2.in", immediateRender: true }, 5.05);
  tl.to(core, { scale: 0.18, duration: 0.2, ease: "power3.in" }, 5.78);
}
