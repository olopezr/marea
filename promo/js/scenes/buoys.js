// 36–42 s · Medido en el mar (segunda caída): una boya que se mece sobre el oleaje, emitiendo, con las lecturas
// en directo alrededor y la comparación con lo que preveía el modelo, como en el panel de la app.
import { tl, hook, cue, el, svgEl, scene, within, prog, lerp, ease, rng, textBlock, textIn, textOut } from "../core.js";
import { SCENES, W, H, BEAT } from "../timeline.js";
import { cardinal, fmt, hhmm } from "/js/surf.js";
import { NOW_SOMO, TZ } from "../data.js";
import { waveY, wavePath } from "../fx.js";

const S = SCENES.buoys;
const B = NOW_SOMO.buoy;
const BX = 560;                  // posición de la boya
const SEA = { amp: 26, len: 760, speed: 0.22, phase: 2 };
const seaLevel = t => lerp(H + 160, 742, prog(t, S.start, 0.7, "expo.out"));

const BUOY_SVG = `<svg viewBox="-130 -330 260 420" class="p-buoy-svg">
  <defs><linearGradient id="hull" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f3c552"/><stop offset="1" stop-color="#c98f1f"/></linearGradient>
    <radialGradient id="lamp"><stop offset="0" stop-color="#fff6d6"/><stop offset=".35" stop-color="#ffd166" stop-opacity=".9"/><stop offset="1" stop-color="#ffd166" stop-opacity="0"/></radialGradient></defs>
  <path d="M-34 -40 L-20 -250 H20 L34 -40 Z" fill="url(#hull)"/>
  <path d="M-26 -90 H26 M-24 -140 H24 M-22 -190 H22" stroke="#9c6c12" stroke-width="5"/>
  <path d="M-30 -315 L30 -265 M30 -315 L-30 -265" stroke="#f3c552" stroke-width="13" stroke-linecap="round"/>
  <rect x="-5" y="-262" width="10" height="16" fill="#3a4a50"/>
  <path d="M0 -330 V-318" stroke="#9db6bb" stroke-width="3"/><circle cx="0" cy="-332" r="5" fill="#9db6bb"/>
  <path d="M-118 -10 Q0 -86 118 -10 L104 34 Q0 52 -104 34 Z" fill="url(#hull)"/>
  <path d="M-110 8 Q0 26 110 8" stroke="#1d2a2f" stroke-width="14" fill="none"/>
  <circle class="lamp" cx="0" cy="-252" r="46" fill="url(#lamp)"/>
</svg>`;

export default function build() {
  const sec = scene("buoys", S, { pre: 0.5, post: 0.3 });

  // Mar en capas
  const sea = svgEl("svg", { class: "p-buoy-sea", viewBox: `0 0 ${W} ${H}` });
  sea.innerHTML = `<path class="b3"/><path class="b2"/><g class="pulses"></g><path class="b1"/>`;
  const [b3, b2, pulses, b1] = sea.children;
  const rings = Array.from({ length: 4 }, () => { const c = svgEl("circle", { r: 10 }); pulses.append(c); return c; });

  const buoy = el("div", "p-buoy", BUOY_SVG);
  const splash = svgEl("svg", { class: "p-splash", viewBox: `0 0 ${W} ${H}` });
  const r = rng(9);
  const drops = Array.from({ length: 16 }, () => ({ vx: (r() - 0.5) * 520, vy: -(380 + r() * 520), size: 3 + r() * 6, c: svgEl("circle") }));
  drops.forEach(d => splash.append(d.c));
  // La capa de delante tapa la base de la boya. Todo va en un contenedor para poder sacarlo de escena de una vez
  // (la boya ya recibe su transform del hook en cada fotograma).
  const front = svgEl("svg", { class: "p-buoy-sea front", viewBox: `0 0 ${W} ${H}` });
  front.innerHTML = `<defs><linearGradient id="sea-front" gradientUnits="userSpaceOnUse" x1="0" y1="700" x2="0" y2="${H}">
    <stop offset="0" stop-color="#17647a"/><stop offset="1" stop-color="#082731"/></linearGradient></defs>`;
  front.append(b1);
  const world = el("div", "p-abs p-buoy-world");
  world.append(sea, buoy, splash, front);
  sec.append(world);

  const T_POP = S.start + 0.12;
  hook(t => {
    if (!within(t, S.start - 0.5, S.end + 0.3)) return;
    const lvl = seaLevel(t);
    const fill = (d) => `${d} L${W + 20},${H + 20} L-20,${H + 20} Z`;
    b3.setAttribute("d", fill(wavePath(lvl - 92, t, { amp: 18, len: 980, speed: -0.12, phase: 0.5 })));
    b2.setAttribute("d", fill(wavePath(lvl - 46, t, { amp: 22, len: 640, speed: 0.17, phase: 4 })));
    b1.setAttribute("d", fill(wavePath(lvl + 18, t, SEA)));
    // La boya flota sobre la ola de delante: altura y giro salen de la propia ola
    const pop = ease("back.out(1.6)")(prog(t, T_POP, 0.7));
    const wy = lvl + 18 + waveY(BX, t, SEA);
    const slope = (waveY(BX + 6, t, SEA) - waveY(BX - 6, t, SEA)) / 12;
    const by = wy - 8 + (1 - pop) * 260;
    buoy.style.transform = `translate(${BX - 130}px, ${by - 330}px) rotate(${(Math.atan(slope) * 180 / Math.PI * 0.8).toFixed(2)}deg)`;
    buoy.style.opacity = prog(t, T_POP, 0.15);
    // Pulsos de señal, uno por pulso musical
    rings.forEach((c, i) => {
      const k = ((t - (S.start + 0.6)) / BEAT - i) / 4;
      const ph = k - Math.floor(k);
      const on = t > S.start + 0.6 + i * BEAT;
      c.setAttribute("cx", BX); c.setAttribute("cy", by - 330 + 6);
      c.setAttribute("r", (12 + ph * 300).toFixed(1));
      c.style.opacity = on ? ((1 - ph) * 0.55).toFixed(3) : 0;
    });
    // Salpicadura al salir del agua
    const st = t - (T_POP + 0.18);
    drops.forEach(d => {
      const vis = st > 0 && st < 1.2;
      d.c.style.opacity = vis ? Math.max(0, 1 - st / 1.1).toFixed(3) : 0;
      if (!vis) return;
      d.c.setAttribute("cx", (BX + d.vx * st).toFixed(1));
      d.c.setAttribute("cy", (wy - 20 + d.vy * st + 0.5 * 1600 * st * st).toFixed(1));
      d.c.setAttribute("r", d.size.toFixed(1));
    });
    // Luz de la boya: parpadeo a tempo
    const lamp = buoy.querySelector(".lamp");
    lamp.style.opacity = (0.35 + 0.65 * Math.pow(Math.max(0, Math.cos(Math.PI * (t - S.start) / BEAT)), 6)).toFixed(3);
  });
  cue(S.start, "impact", { big: true });
  cue(T_POP + 0.15, "splash");

  // Lecturas alrededor de la boya
  const readings = [
    ["Ola", `${fmt(B.h)} m`, 210, 250], ["Periodo pico", `${fmt(B.Tp, 0)} s`, 700, 190],
    ["Dirección", `↘ ${cardinal(B.dir)}`, 120, 520], ["Agua", `${fmt(B.water)} °C`, 790, 470],
  ];
  const leads = svgEl("svg", { class: "p-buoy-leads", viewBox: `0 0 ${W} ${H}` });
  sec.append(leads);
  readings.forEach(([label, value, x, y], i) => {
    const chip = el("div", "p-reading", `<span>${label}</span><b>${value}</b>`);
    Object.assign(chip.style, { left: `${x}px`, top: `${y}px` });
    sec.append(chip);
    const line = svgEl("line");
    leads.append(line);
    const at = S.start + 0.65 + i * 0.5;
    tl.fromTo(chip, { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(2)", immediateRender: true }, at);
    tl.fromTo(line, { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: true }, at + 0.1);
    cue(at, "pop", { pitch: 1.1 + i * 0.1, pan: (x - W / 2) / W });
    hook(t => {
      if (!within(t, at, S.end + 0.3)) return;
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(buoy.style.transform);
      const ax = +m[1] + 130, ay = +m[2] + 330 - 170;
      const cx = x + chip.offsetWidth / 2, cy = y + chip.offsetHeight / 2;
      const k = prog(t, at + 0.1, 0.35, "power2.out");
      line.setAttribute("x1", cx); line.setAttribute("y1", cy);
      line.setAttribute("x2", lerp(cx, ax, k).toFixed(1)); line.setAttribute("y2", lerp(cy, ay, k).toFixed(1));
    });
  });

  const live = el("div", "p-live", `<i></i>En directo · Boya ${B.name} · ${hhmm(B.t, TZ)}`);
  sec.append(live);
  tl.fromTo(live, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, immediateRender: true }, S.start + 0.45);
  const liveDot = live.querySelector("i");
  hook(t => {
    if (!within(t, S.start, S.end + 0.3)) return;
    const ph = ((t - S.start) % 1) / 1;
    liveDot.style.boxShadow = `0 0 0 ${(ph * 12).toFixed(1)}px rgb(92 196 140 / ${(0.6 * (1 - ph)).toFixed(2)})`;
  });

  // Texto y comparación medido / previsto
  const tb = textBlock(sec, {
    num: "05", eyebrow: "Medido en el mar",
    title: "El mar,<br>en directo",
    sub: "Boyas, estaciones y mareógrafos de <b>Puertos del Estado</b>, junto a la previsión.",
    x: 1100, y: 150, width: 700,
  });
  textIn(tb, S.start + 0.3);
  const cmp = el("div", "p-compare", `
    <div class="row"><span>Medido</span><b>${fmt(B.h)} m</b><i class="bar m"></i></div>
    <div class="row"><span>Previsto</span><b>${fmt(B.predicted)} m</b><i class="bar p"></i></div>
    <p>${Math.abs(B.h - B.predicted) < 0.2 ? `La boya mide lo mismo que preveía el modelo.` : `La boya mide ${fmt(Math.abs(B.h - B.predicted))} m ${B.h > B.predicted ? "más" : "menos"} de lo que preveía el modelo.`}</p>`);
  sec.append(cmp);
  const T_CMP = S.start + 2.7;
  tl.fromTo(cmp, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, immediateRender: true }, T_CMP);
  tl.fromTo(cmp.querySelector(".bar.m"), { scaleX: 0 }, { scaleX: B.h / 2.6, duration: 0.8, ease: "power3.out", immediateRender: true }, T_CMP + 0.2);
  tl.fromTo(cmp.querySelector(".bar.p"), { scaleX: 0 }, { scaleX: B.predicted / 2.6, duration: 0.8, ease: "power3.out", immediateRender: true }, T_CMP + 0.32);
  tl.fromTo(cmp.querySelector("p"), { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, T_CMP + 0.9);
  cue(T_CMP + 0.2, "sparkle");

  // Salida
  textOut(tb, S.end - 0.95);
  tl.to([cmp, live, ...sec.querySelectorAll(".p-reading"), leads], { opacity: 0, y: -30, duration: 0.4, stagger: 0.03, ease: "power2.in" }, S.end - 0.9);
  tl.to(world, { y: 340, duration: 0.7, ease: "power3.in" }, S.end - 0.55);
}
