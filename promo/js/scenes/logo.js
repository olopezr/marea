// 6–10 s · Caída: destello, ondas y el logo de Marea con su lema. Sale con una ola que sube y tapa la pantalla.
import { tl, cue, el, scene, SplitText } from "../core.js";
import { SCENES } from "../timeline.js";
import { flash, shockwave, waveWipe, colorSea } from "../fx.js";
import { SPOTS } from "../data.js";

const S = SCENES.logo;

// Logo grande: el círculo de la app con las dos olas del icono (naranja y turquesa).
export const LOGO_SVG = `<svg class="p-logo" viewBox="0 0 240 240" aria-hidden="true">
  <defs><clipPath id="logo-clip"><circle cx="120" cy="120" r="112"/></clipPath>
    <radialGradient id="logo-bg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#133a45"/><stop offset="1" stop-color="#06161c"/></radialGradient></defs>
  <circle cx="120" cy="120" r="112" fill="url(#logo-bg)"/>
  <g clip-path="url(#logo-clip)">
    <path class="w2" d="M52 104c19-23 38-23 52 0s32 23 52 0 34-23 46 0" fill="none" stroke="#5bb6c6" stroke-width="13" stroke-linecap="round" opacity=".9"/>
    <path class="w1" d="M30 142c22-29 44-29 59 0s37 29 59 0 44-29 59 0" fill="none" stroke="#ff7a4d" stroke-width="18" stroke-linecap="round"/>
  </g>
  <circle cx="120" cy="120" r="112" fill="none" stroke="rgb(91 182 198 / .35)" stroke-width="3"/>
</svg>`;

export default function build() {
  const sec = scene("logo", S, { post: 0.1 });
  const fx = el("div", "p-abs");
  fx.style.inset = "0";
  sec.append(fx);

  flash(S.start, { dur: 0.6 });
  shockwave(fx, S.start, { n: 3, size: 260, spread: 6 });
  shockwave(fx, S.start + 0.04, { n: 2, size: 200, spread: 9, color: "rgb(255 122 77 / .7)" });
  cue(S.start, "impact");

  // Olas de colores que suben desde abajo y se quedan meciéndose
  colorSea(sec, { riseAt: S.start + 0.05, from: S.start - 0.05, to: S.end + 0.2 });

  // Logotipo
  const lock = el("div", "p-lockup", `${LOGO_SVG}<span class="p-word">Marea</span>`);
  sec.append(lock);
  const icon = lock.querySelector(".p-logo"), word = lock.querySelector(".p-word");
  tl.fromTo(icon, { scale: 0, rotate: -120 }, { scale: 1, rotate: 0, duration: 0.9, ease: "back.out(1.8)", immediateRender: true }, S.start + 0.02);
  tl.fromTo(icon.querySelectorAll(".w1, .w2"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.8, ease: "power2.inOut", stagger: 0.12, immediateRender: true }, S.start + 0.18);
  const chars = SplitText.create(word, { type: "chars", mask: "chars" }).chars;
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.055, immediateRender: true }, S.start + 0.3);
  cue(S.start + 0.3, "shimmer");

  const tag = el("p", "p-tagline", "Oleaje, viento y mareas en tiempo real.");
  const meta = el("p", "p-logo-meta", `${SPOTS.length} spots de surf · Toda España`);
  sec.append(tag, meta);
  tl.fromTo(tag, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", immediateRender: true }, S.start + 1.2);
  tl.fromTo(meta, { opacity: 0, y: 20, letterSpacing: "0.5em" }, { opacity: 1, y: 0, letterSpacing: "0.26em", duration: 0.9, ease: "power3.out", immediateRender: true }, S.start + 1.6);
  cue(S.start + 1.2, "pop", { pitch: 1.2 });

  // Salida: el logo sube y una ola tapa la pantalla para pasar al mapa
  tl.to([lock, tag, meta], { y: -60, opacity: 0, duration: 0.45, ease: "power2.in", stagger: 0.04 }, S.end - 0.65);
  waveWipe(S.end, { dur: 1.1, seed: 1 });
  cue(S.end - 0.5, "whoosh", { big: true });
}
