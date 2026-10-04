// 28–36 s · Marea: la curva del día a pantalla completa, con noche, extremos, nivel medido y "ahora".
// Un dedo arrastra el cursor y la lectura cambia como en la app (hora, altura, coeficiente, próxima marea,
// efecto del viento y la presión, nivel medido). Los valores salen de las mismas funciones que usa la app.
import { tl, hook, cue, el, svgEl, scene, within, prog, lerp, clamp, ease, textBlock, textIn, textOut } from "../core.js";
import { SCENES, W } from "../timeline.js";
import { tideAt, coefficientAt, coefLabel, hhmm, fmt } from "/js/surf.js";
import { TIDE_DAY as D, SUN, NOW, TZ } from "../data.js";
import { waveWipe } from "../fx.js";

const S = SCENES.tide;
const X0 = 150, X1 = 1770, YTOP = 612, YBOT = 930;
const times = D.points.map(p => p[0]), levels = D.points.map(p => p[1]);
const vals = [...levels, ...D.observed.points.map(p => p[1])];
const vmin = Math.min(...vals) - 0.25, vmax = Math.max(...vals) + 0.25;
const x = t => X0 + ((t - D.from) / (D.to - D.from)) * (X1 - X0);
const y = v => YTOP + (1 - (v - vmin) / (vmax - vmin)) * (YBOT - YTOP);
const H_ = 3600e3;

// Igual que en public/js/tidechart.js
function valueAt(points, t, maxGap = 2 * H_) {
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i], [t1, v1] = points[i + 1];
    if (t >= t0 && t <= t1) return t1 - t0 > maxGap ? null : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return null;
}
const duration = ms => { const m = Math.round(ms / 60e3), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
const surgeText = m => {
  if (m == null) return "Viento y presión: sin dato a esta hora";
  const cm = Math.abs(Math.round(m * 100));
  return cm < 3 ? "Viento y presión: sin efecto apreciable" : `Viento y presión: ${m > 0 ? "suben" : "bajan"} el mar ${cm} cm`;
};

// Recorrido del dedo: [instante del vídeo, hora del día] con pausas en bajamar y pleamar.
const at = hhmmStr => { const [h, m] = hhmmStr.split(":").map(Number); return D.from + (h * 60 + m) * 60e3; };
const PATH = [[S.start + 2.0, NOW], [S.start + 2.25, NOW], [S.start + 3.35, D.ext[2].t], [S.start + 3.8, D.ext[2].t], [S.start + 5.3, D.ext[3].t], [S.start + 5.75, D.ext[3].t], [S.start + 6.6, at("14:10")]];
const io = ease("power2.inOut");
function cursorTime(t) {
  if (t <= PATH[0][0]) return PATH[0][1];
  for (let i = 0; i < PATH.length - 1; i++) {
    const [a, ta] = PATH[i], [b, tb] = PATH[i + 1];
    if (t <= b) return lerp(ta, tb, io((t - a) / (b - a)));
  }
  return PATH.at(-1)[1];
}

export default function build() {
  const sec = scene("tide", S, { pre: 0.3, post: 0.6 });

  const tb = textBlock(sec, {
    num: "04", eyebrow: "Mareas",
    title: "Desliza sobre la marea",
    sub: "Predicción oficial del <b>Instituto Hidrográfico de la Marina</b>, con coeficiente y nivel medido.",
    x: 120, y: 96, width: 1680,
  });
  tb.sub.style.maxWidth = "none";
  textIn(tb, S.start - 0.15);

  // Gráfico
  const svg = svgEl("svg", { class: "p-tide", viewBox: `0 0 ${W} 1080`, width: W, height: 1080 });
  sec.append(svg);
  const line = D.points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${X1},${YBOT}L${X0},${YBOT}Z`;
  const obs = D.observed.points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ext = D.ext.filter(e => e.t >= D.from && e.t < D.to);
  svg.innerHTML = `
    <defs>
      <linearGradient id="tide-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5bb6c6" stop-opacity=".34"/><stop offset="1" stop-color="#5bb6c6" stop-opacity=".02"/></linearGradient>
      <clipPath id="tide-reveal"><rect class="reveal" x="${X0}" y="${YTOP - 120}" width="0" height="${YBOT - YTOP + 160}"/></clipPath>
      <clipPath id="obs-reveal"><rect class="oreveal" x="${X0 - 10}" y="${YTOP - 120}" width="0" height="${YBOT - YTOP + 160}"/></clipPath>
    </defs>
    <rect class="p-night n1" x="${X0}" y="${YTOP - 70}" width="${x(SUN.rise) - X0}" height="${YBOT - YTOP + 70}" rx="10"/>
    <rect class="p-night n2" x="${x(SUN.set)}" y="${YTOP - 70}" width="${X1 - x(SUN.set)}" height="${YBOT - YTOP + 70}" rx="10"/>
    <g class="p-sunlbl s1"><text x="${x(SUN.rise) + 12}" y="${YTOP - 40}">↑ ${hhmm(SUN.rise, TZ)}</text></g>
    <g class="p-sunlbl s2"><text x="${x(SUN.set) - 12}" y="${YTOP - 40}" text-anchor="end">${hhmm(SUN.set, TZ)} ↓</text></g>
    <line class="base" x1="${X0}" x2="${X1}" y1="${YBOT}" y2="${YBOT}"/>
    <g clip-path="url(#tide-reveal)"><path class="area" d="${area}"/></g>
    <path class="curve" d="${line}"/>
    <g clip-path="url(#obs-reveal)"><path class="obs" d="${obs}"/></g>
    <text class="p-obs-lbl" x="${x(D.observed.points[9][0]) - 16}" y="${y(D.observed.points[9][1]) - 4}" text-anchor="end">medido</text>
    ${ext.map((e, i) => `<g class="p-ext e${i}"><circle cx="${x(e.t)}" cy="${y(e.h)}" r="8"/>
      <text x="${x(e.t)}" y="${e.type === "high" ? y(e.h) - 24 : y(e.h) + 44}" text-anchor="middle">${hhmm(e.t, TZ)} · ${fmt(e.h)} m</text></g>`).join("")}
    <g class="p-now"><line x1="${x(NOW)}" x2="${x(NOW)}" y1="${YTOP - 70}" y2="${YBOT}"/><text x="${x(NOW)}" y="${YTOP - 84}" text-anchor="middle">AHORA</text></g>
    ${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => `<text class="p-axis" x="${lerp(X0, X1, h / 24)}" y="${YBOT + 72}" text-anchor="middle">${String(h).padStart(2, "0")}h</text>`).join("")}
    <g class="p-cursor"><line y1="${YTOP - 70}" y2="${YBOT}"/><circle class="touch" r="34"/><circle class="dot" r="12"/><circle class="odot" r="8"/></g>`;
  const $ = s => svg.querySelector(s);

  // Se dibuja: noche, curva (trazo y relleno a la vez), extremos al pasar, medido y "ahora"
  const T_DRAW = S.start + 0.3;
  tl.fromTo(svg.querySelectorAll(".p-night, .p-sunlbl"), { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.1, immediateRender: true }, T_DRAW - 0.2);
  tl.fromTo($(".base"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.2, ease: "power2.inOut", immediateRender: true }, T_DRAW - 0.2);
  tl.fromTo($(".curve"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.5, ease: "power1.inOut", immediateRender: true }, T_DRAW);
  tl.fromTo($(".reveal"), { attr: { width: 0 } }, { attr: { width: X1 - X0 }, duration: 1.5, ease: "power1.inOut", immediateRender: true }, T_DRAW);
  const draw = ease("power1.inOut");
  ext.forEach((e, i) => {
    const f = (x(e.t) - X0) / (X1 - X0);
    // Instante en que el trazo pasa por el extremo (inversa aproximada del suavizado)
    let lo = 0, hi = 1;
    for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; draw(m) < f ? (lo = m) : (hi = m); }
    const when = T_DRAW + lo * 1.5;
    tl.fromTo(svg.querySelector(`.e${i}`), { opacity: 0, scale: 0.4, svgOrigin: `${x(e.t)} ${y(e.h)}` }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.5)", immediateRender: true }, when);
    cue(when, "blip", { n: i + 2, soft: true });
  });
  tl.fromTo([$(".obs"), $(".p-obs-lbl")], { opacity: 0 }, { opacity: 1, duration: 0.5, immediateRender: true }, T_DRAW + 1.2);
  tl.fromTo($(".oreveal"), { attr: { width: 0 } }, { attr: { width: x(NOW) - X0 + 20 }, duration: 0.7, ease: "power2.out", immediateRender: true }, T_DRAW + 1.2);
  tl.fromTo($(".p-now"), { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", immediateRender: true }, T_DRAW + 1.35);
  tl.fromTo(svg.querySelectorAll(".p-axis"), { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.04, immediateRender: true }, T_DRAW + 0.2);

  // Lectura que acompaña al cursor
  const card = el("div", "p-readout");
  sec.append(card);
  const cursor = $(".p-cursor"), dot = $(".dot"), odot = $(".odot"), touch = $(".touch");
  const T_CUR = PATH[0][0];
  tl.fromTo([cursor, card], { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: true }, T_CUR - 0.25);
  tl.fromTo(card, { y: 20 }, { y: 0, duration: 0.45, ease: "power3.out", immediateRender: true }, T_CUR - 0.25);
  tl.fromTo(touch, { attr: { r: 60 }, opacity: 0 }, { attr: { r: 34 }, opacity: 1, duration: 0.25, ease: "power2.out", immediateRender: true }, T_CUR + 0.05);
  hook(t => {
    if (!within(t, S.start, S.end + 0.6)) return;
    const ct = cursorTime(t), cx = x(ct);
    const a = tideAt(times, levels, ct);
    cursor.setAttribute("transform", `translate(${cx.toFixed(1)},0)`);
    dot.setAttribute("cy", y(a.h).toFixed(1));
    touch.setAttribute("cy", y(a.h).toFixed(1));
    const measured = valueAt(D.observed.points, ct, 20 * 60e3);
    odot.style.display = measured == null ? "none" : "";
    if (measured != null) odot.setAttribute("cy", y(measured).toFixed(1));
    const coef = coefficientAt(D.ext, ct), next = D.ext.find(e => e.t > ct), isNow = Math.abs(ct - NOW) < 8 * 60e3;
    card.innerHTML = `
      <div class="ro-main"><span class="ro-time">${hhmm(ct, TZ)}${isNow ? " <em>ahora</em>" : ""}</span>
        <span class="ro-height"><b>${fmt(a.h, 2)}</b> m ${a.rising ? "↗ subiendo" : "↘ bajando"}</span>
        <span class="ro-coef">Coef. <b>${coef}</b> <span class="muted">${coefLabel(coef)}</span></span></div>
      <div class="ro-sub">
        <span>${next.type === "high" ? "Pleamar" : "Bajamar"} en ${duration(next.t - ct)} (${hhmm(next.t, TZ)}, ${fmt(next.h)} m)</span>
        <span>${surgeText(valueAt(D.surge.points, ct))}</span>
        <span>${measured != null ? `Medido: ${fmt(measured, 2)} m` : "Medido: sin dato a esta hora"}</span>
      </div>`;
    card.style.left = `${clamp(cx - 300, 120, W - 120 - 600)}px`;
  });
  // Un clic suave cada vez que el cursor cruza una hora en punto (instantes calculados de antemano)
  for (let i = 0; i < PATH.length - 1; i++) {
    const [a, ta] = PATH[i], [b, tbb] = PATH[i + 1];
    if (ta === tbb) continue;
    const h0 = Math.ceil(Math.min(ta, tbb) / H_), h1 = Math.floor(Math.max(ta, tbb) / H_);
    for (let h = h0; h <= h1; h++) {
      const target = h * H_;
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; ((lerp(ta, tbb, io(m)) - target) * Math.sign(tbb - ta) < 0) ? (lo = m) : (hi = m); }
      cue(a + lo * (b - a), "tick", { soft: true, pan: (x(target) - W / 2) / W });
    }
  }

  // Salida: barrido lateral hacia las boyas
  textOut(tb, S.end - 0.9);
  tl.to([svg, card], { opacity: 0, y: 30, duration: 0.5, ease: "power2.in" }, S.end - 0.6);
  waveWipe(S.end, { dur: 1.0, dir: "right", seed: 4 });
  cue(S.end - 0.45, "whoosh", { big: true, pan: 0 });
}
