// 10–16 s · Cobertura: mapa de puntos de España y los spots de public/js/spots.js apareciendo por comunidades,
// a tempo, con un contador. Termina con un zum rápido hacia Somo, el spot que protagoniza las escenas siguientes.
import { tl, hook, cue, el, scene, within, prog, lerp, ease, textBlock, textIn, textOut } from "../core.js";
import { SCENES, W, H } from "../timeline.js";
import { SPOTS, communityOf, COMMUNITY_ORDER, SOMO } from "../data.js";

const S = SCENES.map;
const MAP = window.MAP;
const merc = (p, lon, lat) => [p.t[0] + p.k * lon * Math.PI / 180, p.t[1] - p.k * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];

// Etiqueta de cada comunidad: posición del texto y lado del que sale la línea guía hacia sus spots
// (b: debajo, t: encima, r: derecha, "": sin línea). Una comunidad nueva se coloca sola junto a sus spots.
const LABELS = {
  "Galicia": [790, 86, "b"], "Asturias": [1040, 58, "b"], "Cantabria": [1200, 94, "b"], "País Vasco": [1384, 56, "b"],
  "Cataluña": [1762, 236, "b"], "C. Valenciana": [1566, 580, "t"], "Baleares": [1752, 404, "b"],
  "Andalucía": [890, 690, "r"], "Canarias": [985, 822, ""], "Murcia": [1520, 680, "t"],
};
const T_GROUP0 = S.start + 1.0, GROUP_STEP = 0.375;

export default function build() {
  const sec = scene("map", S, { pre: 0.5, post: 0.2 });

  // Puntos de tierra, silueta, spots y anillos: todo en un canvas con cámara propia (nítido al hacer zum).
  const canvas = el("canvas", "p-map-canvas");
  canvas.width = W; canvas.height = H;
  sec.append(canvas);
  const ctx = canvas.getContext("2d");
  const labelLayer = el("div", "p-map-labels");
  sec.append(labelLayer);

  const spainPath = new Path2D(MAP.spain), canPath = new Path2D(MAP.canaries);
  const measure = d => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); return p.getTotalLength(); };
  const spainLen = measure(MAP.spain), canLen = measure(MAP.canaries);
  const [ix0, iy0] = MAP.inset[0], [ix1, iy1] = MAP.inset[1];
  const inInset = (x, y) => x > ix0 - 30 && x < ix1 + 30 && y > iy0 - 30 && y < iy1 + 30;
  const center = [1300, 470];
  const land = MAP.dots.filter(([x, y, k]) => k !== 2 && !(k === 0 && inInset(x, y))).map(([x, y, k]) => ({ x, y, k, d: Math.hypot(x - center[0], y - center[1]) }));
  const canaryDots = MAP.dots.filter(d => d[2] === 2);
  const maxD = Math.max(...land.map(d => d.d));

  // Spots agrupados por comunidad; dentro de cada grupo, de oeste a este
  const groups = new Map();
  for (const s of SPOTS) {
    const [x, y] = merc(s.tz === "Atlantic/Canary" ? MAP.projC : MAP.proj, s.lon, s.lat);
    const c = communityOf(s);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push({ s, x, y });
  }
  const rank = c => { const i = COMMUNITY_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
  const spots = [];
  order.forEach((c, gi) => {
    const list = groups.get(c).sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const at = T_GROUP0 + gi * GROUP_STEP;
    list.forEach((p, i) => spots.push({ ...p, at: at + i * Math.min(0.03, 0.3 / list.length) }));
    cue(at, "blip", { n: gi, pan: (list[0].x - W / 2) / W });

    const cx = list.reduce((a, p) => a + p.x, 0) / list.length, cy = list.reduce((a, p) => a + p.y, 0) / list.length;
    const [lx, ly, side] = LABELS[c] ?? [cx + 40, cy - 64, "b"];
    const lab = el("div", "p-map-label", `${c}<b>${list.length}</b>`);
    Object.assign(lab.style, { left: `${lx}px`, top: `${ly}px` });
    labelLayer.append(lab);
    tl.fromTo(lab, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out", immediateRender: true }, at);
    if (side) {
      const w = lab.offsetWidth;
      const [x1, y1] = { b: [lx, ly + 26], t: [lx, ly - 6], r: [lx + w / 2 + 10, ly + 11] }[side];
      const lead = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      lead.setAttribute("class", "p-map-lead");
      lead.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${cx}" y2="${cy + (side === "t" ? 8 : -8)}"/><circle cx="${cx}" cy="${cy + (side === "t" ? 8 : -8)}" r="2"/>`;
      labelLayer.append(lead);
      tl.fromTo(lead.querySelector("line"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.3, ease: "power2.out", immediateRender: true }, at);
      tl.fromTo(lead.querySelector("circle"), { opacity: 0 }, { opacity: 1, duration: 0.1, immediateRender: true }, at + 0.25);
    }
  });
  const somo = spots.find(p => p.s.id === SOMO.id) ?? spots[0];

  // Brillo pre-renderizado de los spots
  const glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  const g = glow.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,122,77,.55)"); grad.addColorStop(0.4, "rgba(255,122,77,.18)"); grad.addColorStop(1, "rgba(255,122,77,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);

  const backOut = ease("back.out(3)"), expoOut = ease("expo.out");
  // Cámara. Acercamiento lento sobre el centro de la península; al final, zum rápido sobre Somo:
  // x' = A + (x − somo)·s, con A yendo de donde está Somo en pantalla al centro. Con z = 0 coincide con
  // el acercamiento lento, así que no hay salto.
  const camera = t => {
    const slow = 1 + 0.07 * prog(t, S.start, S.end - S.start, "sine.inOut");
    const z = prog(t, S.end - 0.75, 0.75, "expo.in");
    const s = slow * lerp(1, 7, z);
    const ax = lerp(center[0] + (somo.x - center[0]) * slow, W / 2, z);
    const ay = lerp(center[1] + (somo.y - center[1]) * slow, H / 2, z);
    return { s, tx: ax - somo.x * s, ty: ay - somo.y * s };
  };

  hook(t => {
    if (!within(t, S.start - 0.5, S.end + 0.2)) return;
    const cam = camera(t);
    const fade = 1 - prog(t, S.end - 0.35, 0.35);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.tx, cam.ty);
    labelLayer.style.transform = `matrix(${cam.s},0,0,${cam.s},${cam.tx},${cam.ty})`;
    labelLayer.style.opacity = 1 - prog(t, S.end - 0.8, 0.3);

    // Tierra: aparece en una onda desde el centro de la península
    ctx.globalAlpha = fade;
    for (const d of land) {
      const a = prog(t, S.start - 0.15 + (d.d / maxD) * 0.9, 0.35, "power2.out");
      if (a <= 0) continue;
      ctx.fillStyle = d.k === 0 ? `rgba(79,127,138,${0.22 * a})` : `rgba(91,182,198,${0.5 * a})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, (d.k === 0 ? 1.5 : 2.1) * (0.4 + 0.6 * a), 0, Math.PI * 2); ctx.fill();
    }
    // Recuadro de Canarias
    const ia = prog(t, S.start + 0.5, 0.5);
    if (ia > 0) {
      ctx.globalAlpha = fade * ia;
      ctx.fillStyle = "rgba(7,26,32,.92)"; ctx.strokeStyle = "rgba(91,182,198,.35)"; ctx.lineWidth = 1.5 / cam.s;
      ctx.beginPath(); ctx.roundRect(ix0 - 26, iy0 - 26, ix1 - ix0 + 52, iy1 - iy0 + 52, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(91,182,198,.5)";
      for (const [x, y] of canaryDots) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = fade;
    }
    // Silueta que se dibuja
    const oa = prog(t, S.start + 0.2, 1.4, "power2.inOut");
    if (oa > 0) {
      ctx.lineWidth = 1.6 / cam.s; ctx.strokeStyle = "rgba(91,182,198,.85)";
      ctx.setLineDash([spainLen, spainLen]); ctx.lineDashOffset = spainLen * (1 - oa); ctx.stroke(spainPath);
      ctx.setLineDash([canLen, canLen]); ctx.lineDashOffset = canLen * (1 - oa); ctx.stroke(canPath);
      ctx.setLineDash([]);
    }
    // Spots: aparecen con un rebote y un anillo; al final, una ola de brillo recorre la costa de oeste a este
    const sweep = t > S.start + 4.3 && t < S.start + 5.4;
    const front = lerp(700, 1900, prog(t, S.start + 4.3, 1.0));
    for (const p of spots) {
      const age = t - p.at;
      if (age < 0) continue;
      const sc = age < 0.3 ? backOut(age / 0.3) : 1;
      const pulse = sweep ? Math.exp(-(((p.x - front) / 70) ** 2)) : 0;
      const gr = 26 * sc * (1 + pulse * 0.8);
      ctx.drawImage(glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
      if (age < 1) {
        ctx.strokeStyle = `rgba(255,122,77,${0.85 * (1 - age)})`; ctx.lineWidth = 2 / cam.s;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5 + expoOut(age) * 34, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#ff7a4d"; ctx.strokeStyle = "#071a20"; ctx.lineWidth = 1.4 / Math.sqrt(cam.s);
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.4 * sc * (1 + pulse * 0.35), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  });

  // Texto con contador sincronizado con los spots que van apareciendo
  const tb = textBlock(sec, {
    num: "01", eyebrow: "Cobertura",
    title: `<span class="p-count">${SPOTS.length}</span> spots<br>de surf`,
    sub: "Del Cantábrico al Mediterráneo, <b>de Galicia a Canarias</b>.",
    x: 120, y: 300, width: 620,
  });
  // SplitText ha envuelto el número en su propia palabra animada (y deja un span vacío al partir en líneas):
  // se escribe dentro de esa palabra para no romper la animación.
  const count = tb.words.find(w => w.closest(".p-count"));
  Object.assign(count.style, { display: "inline-block", minWidth: `${String(SPOTS.length).length * 0.66}em`, fontVariantNumeric: "tabular-nums" });
  textIn(tb, S.start + 0.3);
  hook(t => {
    if (!within(t, S.start, S.end)) return;
    count.textContent = spots.filter(p => p.at <= t).length;
  });
  textOut(tb, S.end - 0.75);
}
