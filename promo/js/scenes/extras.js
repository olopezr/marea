// 48–52 s · Y además…: el resto de funciones en una cuadrícula que entra a corcheas, con iconos animados.
import { tl, cue, el, scene, SplitText } from "../core.js";
import { SCENES, W } from "../timeline.js";

const S = SCENES.extras;
const ICONS = {
  fav: `<svg viewBox="0 0 48 48"><path class="star" d="M24 6l5.4 11 12.1 1.8-8.8 8.5 2.1 12L24 33.6 13.2 39.3l2.1-12-8.8-8.5L18.6 17z" stroke-width="3" stroke-linejoin="round"/></svg>`,
  near: `<svg viewBox="0 0 48 48"><ellipse class="shadow" cx="24" cy="42" rx="9" ry="2.5"/><path class="pin" d="M24 4c-7.7 0-14 6-14 13.6C10 28 24 40 24 40s14-12 14-22.4C38 10 31.7 4 24 4zm0 19a5.4 5.4 0 1 1 0-10.8A5.4 5.4 0 0 1 24 23z"/></svg>`,
  search: `<svg viewBox="0 0 48 48"><circle cx="21" cy="21" r="12" fill="none" stroke-width="4"/><path d="M30 30l10 10" stroke-width="4.5" stroke-linecap="round"/></svg>`,
  offline: `<svg viewBox="0 0 48 48"><path d="M6 19a26 26 0 0 1 36 0M12 26a17 17 0 0 1 24 0M18 33a8.5 8.5 0 0 1 12 0" fill="none" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="39" r="2.8"/><path class="slash" d="M9 7l30 34" stroke-width="4.5" stroke-linecap="round"/></svg>`,
  theme: `<svg viewBox="0 0 48 48"><g class="spin"><circle cx="24" cy="24" r="10"/><path d="M24 14a10 10 0 0 0 0 20z" class="half"/><path d="M24 3v5M24 40v5M3 24h5M40 24h5M9.2 9.2l3.5 3.5M35.3 35.3l3.5 3.5M9.2 38.8l3.5-3.5M35.3 12.7l3.5-3.5" stroke-width="3.5" stroke-linecap="round"/></g></svg>`,
  install: `<svg viewBox="0 0 48 48"><rect x="12" y="4" width="24" height="40" rx="6" fill="none" stroke-width="3.5"/><g class="arrow"><path d="M24 13v14M18 22l6 6 6-6" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M20 38h8" stroke-width="3" stroke-linecap="round"/></svg>`,
};
const ITEMS = [
  ["fav", "Favoritos", "Tus spots, siempre a mano"],
  ["near", "Cerca de mí", "Ordenados por distancia"],
  ["search", "Buscador", `<span class="typed">cicer</span> → La Cícer`],
  ["offline", "Sin conexión", "Con el último dato"],
  ["theme", "Claro y oscuro", "Sigue el tema de tu móvil"],
  ["install", "Se instala", "Como una app más"],
];

export default function build() {
  const sec = scene("extras", S, { post: 0.1 });
  const head = el("h2", "p-h p-extras-h", "Y además…");
  sec.append(head);
  const chars = SplitText.create(head, { type: "chars", mask: "chars" }).chars;
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "expo.out", stagger: 0.03, immediateRender: true }, S.start);
  cue(S.start, "impact", { small: true });

  const grid = el("div", "p-extras");
  sec.append(grid);
  ITEMS.forEach(([key, title, desc], i) => {
    const tile = el("div", `p-xtile x-${key}`, `<div class="ico">${ICONS[key]}</div><div><h3>${title}</h3><p>${desc}</p></div>`);
    grid.append(tile);
    const at = S.start + 0.45 + i * 0.25;
    tl.fromTo(tile, { opacity: 0, y: 50, scale: 0.86 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)", immediateRender: true }, at);
    cue(at, "pop", { pitch: 0.9 + i * 0.1, pan: ((i % 3) - 1) * 0.5 });
    const ico = tile.querySelector(".ico svg"), t2 = at + 0.25;
    if (key === "fav") tl.fromTo(ico.querySelector(".star"), { fill: "rgba(255,122,77,0)", scale: 0.6, svgOrigin: "24 24" }, { fill: "rgba(255,122,77,1)", scale: 1, duration: 0.45, ease: "back.out(3)", immediateRender: true }, t2);
    if (key === "near") {
      tl.fromTo(ico.querySelector(".pin"), { y: -22 }, { y: 0, duration: 0.5, ease: "bounce.out", immediateRender: true }, t2);
      tl.fromTo(ico.querySelector(".shadow"), { scale: 0.3, svgOrigin: "24 42" }, { scale: 1, duration: 0.5, ease: "bounce.out", immediateRender: true }, t2);
    }
    if (key === "search") {
      const typed = tile.querySelector(".typed"), word = typed.textContent;
      typed.innerHTML = [...word].map(c => `<i>${c}</i>`).join("");
      tl.fromTo(typed.querySelectorAll("i"), { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.07, immediateRender: true }, t2);
    }
    if (key === "offline") tl.fromTo(ico.querySelector(".slash"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.35, ease: "power2.out", immediateRender: true }, t2);
    if (key === "theme") tl.fromTo(ico.querySelector(".spin"), { rotate: -180, svgOrigin: "24 24" }, { rotate: 0, duration: 0.7, ease: "back.out(1.6)", immediateRender: true }, t2 - 0.1);
    if (key === "install") tl.fromTo(ico.querySelector(".arrow"), { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "bounce.out", immediateRender: true }, t2);
  });

  // Salida: todo se aleja hacia el centro
  tl.to([head, grid], { scale: 0.86, opacity: 0, duration: 0.45, ease: "power3.in", transformOrigin: `${W / 2}px 50%` }, S.end - 0.45);
}
