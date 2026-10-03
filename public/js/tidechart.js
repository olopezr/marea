// Gráfico "Marea de hoy" con cursor deslizable: al arrastrar (o con las flechas del teclado)
// muestra la hora, la altura, si sube o baja, el coeficiente, el efecto del viento y la presión y el nivel medido.
import { tideAt, coefficientAt, coefLabel, hhmm, fmt } from "./surf.js";

const W = 340, H = 176, TOP = 26, BOTTOM = 40;
const STEP = 15 * 60e3;

// Valor interpolado de una serie [[t, v], ...] (null si cae en un hueco mayor que maxGap).
function valueAt(points, t, maxGap = 2 * 3600e3) {
  if (!points?.length) return null;
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i], [t1, v1] = points[i + 1];
    if (t >= t0 && t <= t1) return t1 - t0 > maxGap ? null : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return null;
}

const duration = ms => {
  const m = Math.round(ms / 60e3), h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};
// Cuánto suben o bajan el mar el viento y la presión (residuo meteorológico de Puertos del Estado).
const surgeText = m => {
  if (m == null) return "Viento y presión: sin dato a esta hora";
  const cm = Math.abs(Math.round(m * 100));
  return cm < 3 ? "Viento y presión: sin efecto apreciable" : `Viento y presión: ${m > 0 ? "suben" : "bajan"} el mar ${cm} cm`;
};

function geometry(day) {
  const vals = [...day.points.map(p => p[1]), ...(day.observed?.points ?? []).map(p => p[1])];
  const min = Math.min(...vals) - 0.2, max = Math.max(...vals) + 0.2;
  const span = day.to - day.from;
  return {
    x: t => ((t - day.from) / span) * W,
    y: v => TOP + (1 - (v - min) / (max - min)) * (H - TOP - BOTTOM),
    t: x => day.from + (x / W) * span,
  };
}

const path = (pts, g) => pts.map(([t, v], i) => `${i ? "L" : "M"}${g.x(t).toFixed(1)},${g.y(v).toFixed(1)}`).join(" ");

export function tideChartHTML(day, sun, tz) {
  if (!day || day.points.length < 4) return `<p class="muted">Sin datos de marea para hoy.</p>`;
  const g = geometry(day);
  const line = path(day.points, g);
  const area = `${line} L${g.x(day.points.at(-1)[0]).toFixed(1)},${H - BOTTOM} L${g.x(day.points[0][0]).toFixed(1)},${H - BOTTOM} Z`;
  const night = sun
    ? `<rect x="0" y="${TOP - 10}" width="${Math.max(0, g.x(sun.rise))}" height="${H - TOP - BOTTOM + 10}" class="night"/>
       <rect x="${g.x(sun.set)}" y="${TOP - 10}" width="${Math.max(0, W - g.x(sun.set))}" height="${H - TOP - BOTTOM + 10}" class="night"/>`
    : "";
  const ext = day.ext.filter(e => e.t >= day.from && e.t < day.to);
  const labels = ext.map(e => `<circle cx="${g.x(e.t)}" cy="${g.y(e.h)}" r="3.5" class="ext"/>
    <text x="${Math.min(W - 26, Math.max(26, g.x(e.t)))}" y="${e.type === "high" ? g.y(e.h) - 9 : g.y(e.h) + 17}" text-anchor="middle" class="lbl">${hhmm(e.t, tz)} · ${fmt(e.h)}</text>`).join("");
  const obsPts = day.observed?.points ?? [];
  const obs = obsPts.length ? `<path d="${path(obsPts, g)}" class="obs-line"/>` : "";
  // Etiqueta "medido" al principio de la línea medida, encima de ella, donde no tapa los extremos.
  const first = obsPts.find(([t]) => t >= day.from + 20 * 60e3);
  const obsLabel = first ? `<text x="${g.x(first[0]) + 4}" y="${Math.max(12, g.y(first[1]) - 8)}" class="obs-lbl">medido</text>` : "";
  const ticks = [0, 6, 12, 18].map(hh => `<text x="${(hh / 24) * W + 2}" y="${H - 4}" class="axis">${String(hh).padStart(2, "0")}h</text>`).join("");
  const coefs = ext.filter(e => e.coef != null);

  return `
    <div class="tide-readout" aria-live="polite"></div>
    <div class="chart tide-chart">
      <svg viewBox="0 0 ${W} ${H}" role="slider" tabindex="0" aria-label="Curva de marea de hoy. Arrastra o usa las flechas para cambiar la hora"
        aria-valuemin="0" aria-valuemax="1440" aria-valuenow="0">
        <defs><clipPath id="tide-clip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
        <g clip-path="url(#tide-clip)">${night}<path d="${area}" class="tide-area"/><path d="${line}" class="tide-line"/>${obs}</g>
        ${labels}${obsLabel}
        <line class="now" x1="0" x2="0" y1="${TOP - 10}" y2="${H - BOTTOM}" data-now/>
        <g class="cursor" data-cursor>
          <line x1="0" x2="0" y1="${TOP - 10}" y2="${H - BOTTOM}"/>
          <circle r="6" class="cursor-dot" data-dot/>
          <circle r="4" class="cursor-obs" data-obs-dot/>
        </g>
        ${ticks}
      </svg>
    </div>
    <div class="tide-legend small muted">
      <span><i class="sw sw-pred"></i>Predicción</span>
      ${obs ? `<span><i class="sw sw-obs"></i>Medido en ${day.observed.gauge}${day.observed.samePort === false ? ` (a ${day.observed.distKm} km)` : ""}</span>` : ""}
      <span><i class="sw sw-now"></i>Ahora</span>
      ${coefs.length ? `<span>Coeficientes: ${coefs.map(e => `<b>${e.coef}</b> (${hhmm(e.t, tz)})`).join(" · ")}</span>` : ""}
    </div>`;
}

export function bindTideChart(root, day, tz, now) {
  const svg = root.querySelector(".tide-chart svg");
  if (!svg) return;
  const g = geometry(day);
  const readout = root.querySelector(".tide-readout");
  const cursor = svg.querySelector("[data-cursor]");
  const dot = svg.querySelector("[data-dot]");
  const obsDot = svg.querySelector("[data-obs-dot]");
  const nowLine = svg.querySelector("[data-now]");
  const clampT = t => Math.min(day.to - 60e3, Math.max(day.from, t));

  if (now >= day.from && now < day.to) nowLine.setAttribute("transform", `translate(${g.x(now)},0)`);
  else nowLine.remove();

  let current = clampT(now >= day.from && now < day.to ? now : day.from + 12 * 3600e3);

  function show(t) {
    current = clampT(t);
    const at = tideAt(day.points.map(p => p[0]), day.points.map(p => p[1]), current);
    if (!at) return;
    const x = g.x(current);
    cursor.setAttribute("transform", `translate(${x},0)`);
    dot.setAttribute("cy", g.y(at.h));
    const measured = valueAt(day.observed?.points, current, 20 * 60e3);
    obsDot.style.display = measured == null ? "none" : "";
    if (measured != null) obsDot.setAttribute("cy", g.y(measured));

    const coef = coefficientAt(day.ext, current);
    const next = day.ext.find(e => e.t > current);
    const residual = valueAt(day.surge?.points, current);
    const isNow = Math.abs(current - now) < 8 * 60e3;
    svg.setAttribute("aria-valuenow", Math.round((current - day.from) / 60e3));
    svg.setAttribute("aria-valuetext", `${hhmm(current, tz)}, ${fmt(at.h)} metros, ${at.rising ? "subiendo" : "bajando"}`);

    readout.innerHTML = `
      <div class="ro-main">
        <span class="ro-time">${hhmm(current, tz)}${isNow ? ` <em>ahora</em>` : ""}</span>
        <span class="ro-height"><b>${fmt(at.h, 2)}</b> m ${at.rising ? "↗ subiendo" : "↘ bajando"}</span>
        ${coef != null ? `<span class="ro-coef" title="Coeficiente de marea">Coef. <b>${coef}</b> <span class="muted">${coefLabel(coef)}</span></span>` : ""}
      </div>
      <div class="ro-sub muted">
        ${next ? `<span>${next.type === "high" ? "Pleamar" : "Bajamar"} en ${duration(next.t - current)} (${hhmm(next.t, tz)}, ${fmt(next.h)} m)</span>` : ""}
        ${day.surge ? `<span>${surgeText(residual)}</span>` : ""}
        ${day.observed?.points?.length ? `<span>${measured != null ? `Medido: ${fmt(measured, 2)} m` : "Medido: sin dato a esta hora"}</span>` : ""}
      </div>`;
  }

  const fromPointer = e => {
    const r = svg.getBoundingClientRect();
    return g.t(((e.clientX - r.left) / r.width) * W);
  };
  let dragging = false;
  svg.addEventListener("pointerdown", e => { dragging = true; svg.setPointerCapture(e.pointerId); show(fromPointer(e)); });
  svg.addEventListener("pointermove", e => { if (dragging || e.pointerType === "mouse") show(fromPointer(e)); });
  const end = e => { dragging = false; if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId); };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("keydown", e => {
    const moves = { ArrowLeft: -STEP, ArrowRight: STEP, PageDown: -3600e3, PageUp: 3600e3 };
    if (e.key in moves) { e.preventDefault(); show(current + moves[e.key]); }
    if (e.key === "Home") { e.preventDefault(); show(day.from); }
    if (e.key === "End") { e.preventDefault(); show(day.to); }
  });

  show(current);
}
