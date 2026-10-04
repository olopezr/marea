// Efectos globales: fondo vivo (brillos y líneas de ola), grano de película, barridos de ola y destellos.
import { tl, hook, el, svgEl, rng, prog, lerp, clamp, within } from "./core.js";
import { W, H } from "./timeline.js";

const TAU = Math.PI * 2;

// Una ola compuesta (dos senos) para bordes y líneas.
export const waveY = (x, t, { amp = 18, len = 620, speed = 0.18, phase = 0 } = {}) =>
  amp * Math.sin(TAU * (x / len + t * speed) + phase) + amp * 0.35 * Math.sin(TAU * (x / (len * 0.47) - t * speed * 1.6) + phase * 1.7);

export function wavePath(y0, t, opts, { x0 = -20, x1 = W + 20, step = 24 } = {}) {
  let d = "";
  for (let x = x0; x <= x1; x += step) d += `${x === x0 ? "M" : "L"}${x},${(y0 + waveY(x, t, opts)).toFixed(1)}`;
  return d;
}

export function setupBackground() {
  const svg = document.getElementById("bg-lines");
  const lines = Array.from({ length: 9 }, (_, i) => {
    const p = svgEl("path", { opacity: (0.045 + i * 0.011).toFixed(3) });
    svg.append(p);
    return { p, y: 600 + i * 56, amp: 8 + i * 2.6, len: 980 - i * 52, speed: 0.05 + i * 0.012, phase: i * 0.9 };
  });
  const [g1, g2, g3] = document.querySelectorAll(".p-glow");
  hook(t => {
    for (const l of lines) l.p.setAttribute("d", wavePath(l.y, t, l, { step: 32 }));
    g1.style.transform = `translate(${Math.sin(t * 0.21) * 90}px, ${Math.cos(t * 0.17) * 60}px)`;
    g2.style.transform = `translate(${Math.cos(t * 0.13) * 110}px, ${Math.sin(t * 0.19) * 70}px)`;
    g3.style.transform = `translate(${Math.sin(t * 0.11 + 1) * 160}px, ${Math.cos(t * 0.15) * 90}px)`;
  });

  // Grano: una tesela de ruido que salta a una posición distinta en cada fotograma.
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d"), img = ctx.createImageData(256, 256), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + r() * 145;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const grain = document.getElementById("grain");
  grain.style.backgroundImage = `url(${c.toDataURL()})`;
  hook(t => {
    const f = Math.round(t * 60), rr = rng(f * 7919 + 13);
    grain.style.backgroundPosition = `${Math.floor(rr() * 256)}px ${Math.floor(rr() * 256)}px`;
  });
}

// Barrido de ola: una masa de agua sube (o cruza) la pantalla, la tapa entera a mitad y deja ver la escena
// siguiente al salir. `at` es el instante en que cubre todo; el cambio de escena debe ocurrir cerca de ahí.
export function waveWipe(at, { dur = 1.0, dir = "up", colors = ["#5bb6c6", "#1f6f80", "#0b2f38"], crest = "#ff7a4d", seed = 0 } = {}) {
  const layer = document.getElementById("fx-layer");
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, preserveAspectRatio: "none" });
  svg.style.cssText = "position:absolute;inset:0;visibility:hidden";
  const id = `ww${Math.round(at * 100)}`;
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${dir === "up" ? 0 : 1}" y2="${dir === "up" ? 1 : 0}">
      <stop offset="0" stop-color="${colors[0]}"/><stop offset=".35" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient></defs>
    <path class="band" fill="url(#${id})"/><path class="crest" fill="none" stroke="${crest}" stroke-width="7" stroke-linecap="round"/>`;
  layer.append(svg);
  const band = svg.querySelector(".band"), crestP = svg.querySelector(".crest");
  const t0 = at - dur / 2, t1 = at + dur / 2;
  tl.set(svg, { visibility: "visible" }, t0 - 0.001);
  tl.set(svg, { visibility: "hidden" }, t1 + 0.02);
  const span = dir === "up" ? H : W;
  const opts = { amp: 34, len: 760, speed: 0.6, phase: seed };
  // Coordenadas a lo largo del borde (x si sube, y si cruza), en ambos sentidos.
  const along = [];
  for (let s = -24; s <= (dir === "up" ? W : H) + 24; s += 24) along.push(s);
  const back = [...along].reverse();
  const edge = (t, pos, ph, list, cmd0) => list.map((s, i) => {
    const off = (pos + waveY(s, t, { ...opts, phase: ph })).toFixed(1);
    return `${i ? "L" : cmd0}${dir === "up" ? `${s},${off}` : `${off},${s}`}`;
  }).join("");
  hook(t => {
    if (!within(t, t0, t1 + 0.02)) return;
    const p = prog(t, t0, dur);
    // Borde delantero y trasero: el trasero sale con retraso, así hay un tramo con la pantalla tapada.
    const a = easeInOut(clamp(p / 0.62)), b = easeInOut(clamp((p - 0.38) / 0.62));
    const lead = dir === "up" ? lerp(span + 120, -160, a) : lerp(-160, span + 120, a);
    const trail = dir === "up" ? lerp(span + 120, -160, b) : lerp(-160, span + 120, b);
    const front = edge(t, lead, seed, along, "M");
    band.setAttribute("d", `${front}${edge(t, trail, seed + 2, back, "L")}Z`);
    crestP.setAttribute("d", front);
  });
}
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// Destello radial (para las caídas).
export function flash(at, { dur = 0.5, color = "rgb(220 245 250)", peak = 0.85 } = {}) {
  const f = el("div");
  f.style.cssText = `position:absolute;inset:0;opacity:0;background:radial-gradient(circle at 50% 50%, ${color} 0%, rgb(91 182 198 / .5) 35%, transparent 75%)`;
  document.getElementById("fx-layer").append(f);
  tl.fromTo(f, { opacity: peak }, { opacity: 0, duration: dur, ease: "power2.out", immediateRender: false }, at);
  return f;
}

// Anillos de onda expansiva desde un punto del escenario.
export function shockwave(parent, at, { x = W / 2, y = H / 2, n = 3, color = "rgb(91 182 198 / .9)", size = 300, spread = 4.5, gap = 0.09 } = {}) {
  for (let i = 0; i < n; i++) {
    const ring = el("div");
    ring.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;border:${3 - i * 0.6}px solid ${color};opacity:0`;
    parent.append(ring);
    tl.fromTo(ring, { scale: 0.1, opacity: 0.95 }, { scale: spread + i, opacity: 0, duration: 1.3, ease: "expo.out", immediateRender: false }, at + i * gap);
  }
}

// Mar de colores del logo (turquesas con la cresta naranja): sube desde abajo en `riseAt` y se mece.
export function colorSea(parent, { riseAt, from, to, height = 230 }) {
  const sea = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "p-sea" });
  sea.innerHTML = `<path class="s3"/><path class="s2"/><path class="s1"/>`;
  parent.append(sea);
  const [s3, s2, s1] = sea.children;
  const rise = { v: 0 };
  tl.fromTo(rise, { v: 0 }, { v: 1, duration: 1.1, ease: "expo.out", immediateRender: true }, riseAt);
  hook(t => {
    if (!within(t, from, to)) return;
    const base = H + 40 - rise.v * height;
    const fill = d => `${d} L${W + 20},${H + 10} L-20,${H + 10} Z`;
    s3.setAttribute("d", fill(wavePath(base - 70, t, { amp: 22, len: 900, speed: 0.12, phase: 1 })));
    s2.setAttribute("d", fill(wavePath(base - 25, t, { amp: 26, len: 700, speed: -0.16, phase: 3 })));
    s1.setAttribute("d", fill(wavePath(base + 30, t, { amp: 30, len: 820, speed: 0.2, phase: 5 })));
  });
  return sea;
}
