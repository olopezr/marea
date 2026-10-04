// 52–60 s · Cierre: la app en iPhone, en la web (tema claro) y en Android; después el logo con el lema.
import { tl, hook, cue, el, scene, within, prog, SplitText, textBlock, textIn } from "../core.js";
import { SCENES, W, H } from "../timeline.js";
import { phone, listView, detailView } from "../ui.js";
import { flash, shockwave, colorSea } from "../fx.js";
import { LOGO_SVG } from "./logo.js";

const S = SCENES.end;
const T_LOCK = S.start + 4; // entra el logo final, en el golpe del compás 28

export default function build() {
  const sec = scene("end", S, { pre: 0.3, post: 0.1 });

  // Tres dispositivos
  const ios = phone({ views: { list: listView() } });
  const android = phone({ kind: "android", views: { detail: detailView({ alertOn: true }) } });
  const web = el("div", "p-device");
  web.innerHTML = `<div class="p-browser"><div class="chrome"><span class="dots"><i></i><i></i><i></i></span>
      <span class="url"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg>Marea · Condiciones de surf</span></div>
    <div class="viewport theme-light"><div class="p-webapp">${listView()}</div></div></div>`;
  for (const v of Object.values(ios.views)) v.style.visibility = "visible";
  for (const v of Object.values(android.views)) v.style.visibility = "visible";
  const devices = [
    { node: ios.dev, w: 418, h: 872, cx: 400, s: 0.74, from: { x: -500, y: 700, r: -24 }, label: ["iPhone", "App nativa"] },
    { node: web, w: 980, h: 640, cx: 960, s: 0.88, from: { x: 0, y: 800, r: 0 }, label: ["Web", "Se instala en el móvil"] },
    { node: android.dev, w: 404, h: 860, cx: 1520, s: 0.74, from: { x: 500, y: 700, r: 24 }, label: ["Android", "App nativa"] },
  ];
  // Todos apoyados en la misma línea base
  const BASE = 892;
  for (const d of devices) d.cy = BASE - (d.h * d.s) / 2;
  const stage = el("div", "p-abs p-devices");
  sec.append(stage);
  devices.forEach((d, i) => {
    stage.append(d.node);
    const at = S.start - 0.2 + i * 0.15;
    const x = d.cx - d.w / 2, y = d.cy - d.h / 2;
    tl.fromTo(d.node, { x: x + d.from.x, y: y + d.from.y, rotation: d.from.r, scale: d.s * 0.9 },
      { x, y, rotation: 0, scale: d.s, duration: 0.9, ease: "expo.out", immediateRender: true }, at);
    const lab = el("div", "p-devlabel", `<b>${d.label[0]}</b><span>${d.label[1]}</span>`);
    Object.assign(lab.style, { left: `${d.cx}px`, top: `${BASE + 30}px` });
    stage.append(lab);
    tl.fromTo(lab, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, immediateRender: true }, at + 0.45);
    cue(at, "whoosh", { pan: (d.cx - W / 2) / W, soft: true });
  });
  // Movimiento dentro de las pantallas para que no parezcan capturas: el detalle de Android se desplaza bajo su
  // barra fija (en la lista la cabecera se desplazaría bajo la barra de estado, así que esa se queda quieta).
  const androidScroll = android.views.detail.querySelector(".p-scroll");
  hook(t => {
    if (!within(t, S.start, T_LOCK)) return;
    const k = prog(t, S.start + 0.9, 2.6, "sine.inOut");
    androidScroll.style.transform = `translateY(${(-520 * k).toFixed(1)}px)`;
    devices.forEach((d, i) => { d.node.firstElementChild.style.translate = `0 ${(Math.sin(t * 1.4 + i * 1.7) * 6).toFixed(2)}px`; });
  });

  const tb = textBlock(sec, { title: "En el móvil y en la web", x: 0, y: 64, width: W, align: "center" });
  tb.h.style.fontSize = "80px";
  textIn(tb, S.start - 0.15, { stagger: 0.05 });

  // Salen los dispositivos y entra el logo
  tl.to([tb.h, ...stage.querySelectorAll(".p-devlabel")], { opacity: 0, y: -30, duration: 0.35, ease: "power2.in" }, T_LOCK - 0.5);
  devices.forEach((d, i) => tl.to(d.node, { y: `+=${900}`, rotation: (i - 1) * 10, duration: 0.6, ease: "power3.in" }, T_LOCK - 0.5 + i * 0.05));

  const fx = el("div", "p-abs");
  fx.style.inset = "0";
  sec.append(fx);
  flash(T_LOCK, { dur: 0.7, peak: 0.6 });
  shockwave(fx, T_LOCK, { n: 3, size: 240, spread: 7, y: 470 });
  colorSea(sec, { riseAt: T_LOCK + 0.05, from: T_LOCK - 0.1, to: S.end + 0.1, height: 210 });
  cue(T_LOCK, "impact", { final: true });

  const lock = el("div", "p-lockup p-endlock", `${LOGO_SVG.replace(/logo-(clip|bg)/g, "end-$1")}<span class="p-word">Marea</span>`);
  sec.append(lock);
  const icon = lock.querySelector(".p-logo"), word = lock.querySelector(".p-word");
  tl.fromTo(icon, { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.85, ease: "back.out(1.7)", immediateRender: true }, T_LOCK + 0.02);
  tl.fromTo(icon.querySelectorAll(".w1, .w2"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.8, ease: "power2.inOut", stagger: 0.1, immediateRender: true }, T_LOCK + 0.15);
  const chars = SplitText.create(word, { type: "chars", mask: "chars" }).chars;
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.05, immediateRender: true }, T_LOCK + 0.22);

  const tag = el("h2", "p-endtag", "No te pierdas <em>ni una ola</em>.");
  sec.append(tag);
  const words = SplitText.create(tag, { type: "words", mask: "words" }).words;
  tl.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.07, immediateRender: true }, T_LOCK + 0.75);
  const plat = el("p", "p-logo-meta p-endmeta", "iOS · Android · Web");
  sec.append(plat);
  tl.fromTo(plat, { opacity: 0, letterSpacing: "0.6em" }, { opacity: 1, letterSpacing: "0.3em", duration: 1.0, ease: "power3.out", immediateRender: true }, T_LOCK + 1.3);
  cue(T_LOCK + 0.75, "shimmer");

  // Fundido final a negro
  const black = el("div");
  black.style.cssText = "position:absolute;inset:0;background:#000;opacity:0";
  document.getElementById("fx-layer").append(black);
  tl.fromTo(black, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power1.in", immediateRender: false }, S.end - 0.8);
}
