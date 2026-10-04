// Orquestador maestro de animación para promo-v2
import { DURATION, SCENES } from "./timeline.js";

const gsap = window.gsap;
const tl = gsap.timeline({ paused: true });

// --- CANVAS DE FONDO (Radar Sonar + Partículas + Cuadrícula) ---
const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");

// Generador de partículas con posiciones fijas
const NUM_PARTICLES = 60;
const particles = Array.from({ length: NUM_PARTICLES }, (_, i) => ({
  x: ((i * 137.5) % 1920),
  y: ((i * 269.3) % 1080),
  r: 1 + (i % 3) * 1.2,
  speed: 15 + (i % 5) * 8,
  alpha: 0.15 + (i % 4) * 0.12,
}));

function renderCanvas(t) {
  ctx.clearRect(0, 0, 1920, 1080);

  // 1. Rejilla batimétrica sutil
  ctx.strokeStyle = "rgba(69, 209, 223, 0.04)";
  ctx.lineWidth = 1;
  const gridSize = 120;
  for (let x = 0; x <= 1920; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1080);
    ctx.stroke();
  }
  for (let y = 0; y <= 1080; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1920, y);
    ctx.stroke();
  }

  // 2. Haz de radar giratorio (centrado en la escena 1 y ambiental en el resto)
  const radarAlpha = t < 5.0 ? 0.35 : 0.08;
  const cx = 960, cy = 540;
  const angle = t * 2.2;
  const radius = 680;

  const grad = ctx.createConicGradient(angle, cx, cy);
  grad.addColorStop(0, `rgba(86, 230, 245, ${radarAlpha})`);
  grad.addColorStop(0.12, `rgba(86, 230, 245, ${radarAlpha * 0.2})`);
  grad.addColorStop(0.25, "rgba(86, 230, 245, 0)");
  grad.addColorStop(1, "rgba(86, 230, 245, 0)");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Anillos concéntricos del sonar
  for (let r = 160; r <= radius; r += 160) {
    ctx.strokeStyle = `rgba(69, 209, 223, ${radarAlpha * 0.4})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Partículas marinas en suspensión
  for (const p of particles) {
    const curY = (p.y - t * p.speed + 1080 * 10) % 1080;
    const curX = p.x + Math.sin(t * 1.5 + p.y) * 20;
    ctx.fillStyle = `rgba(86, 230, 245, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(curX, curY, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- CANVAS DE LA CURVA DE MAREA (ESCENA 5) ---
const tideCanvas = document.getElementById("tide-canvas");
const tideCtx = tideCanvas.getContext("2d");

function renderTideCurve(progress) {
  const w = tideCanvas.width, h = tideCanvas.height;
  tideCtx.clearRect(0, 0, w, h);

  // Línea base media
  tideCtx.strokeStyle = "rgba(69, 209, 223, 0.15)";
  tideCtx.lineWidth = 1;
  tideCtx.setLineDash([6, 6]);
  tideCtx.beginPath();
  tideCtx.moveTo(0, h * 0.5);
  tideCtx.lineTo(w, h * 0.5);
  tideCtx.stroke();
  tideCtx.setLineDash([]);

  // Curva de marea continua cosenoidal
  const points = [];
  const totalPts = 120;
  for (let i = 0; i <= totalPts; i++) {
    const x = (i / totalPts) * w;
    // Dos ciclos completos de marea en 24h
    const angle = (i / totalPts) * Math.PI * 4 - Math.PI * 0.5;
    const y = h * 0.5 - Math.sin(angle) * (h * 0.36);
    points.push({ x, y });
  }

  // Relleno degradado con neón turquesa
  const fillGrad = tideCtx.createLinearGradient(0, 0, 0, h);
  fillGrad.addColorStop(0, "rgba(86, 230, 245, 0.38)");
  fillGrad.addColorStop(0.6, "rgba(69, 209, 223, 0.12)");
  fillGrad.addColorStop(1, "rgba(4, 17, 23, 0)");

  tideCtx.fillStyle = fillGrad;
  tideCtx.beginPath();
  tideCtx.moveTo(points[0].x, h);
  for (const pt of points) tideCtx.lineTo(pt.x, pt.y);
  tideCtx.lineTo(w, h);
  tideCtx.closePath();
  tideCtx.fill();

  // Trazo de la curva
  tideCtx.strokeStyle = "#56e6f5";
  tideCtx.lineWidth = 4;
  tideCtx.shadowColor = "rgba(86, 230, 245, 0.8)";
  tideCtx.shadowBlur = 16;
  tideCtx.beginPath();
  tideCtx.moveTo(points[0].x, points[0].y);
  for (const pt of points) tideCtx.lineTo(pt.x, pt.y);
  tideCtx.stroke();
  tideCtx.shadowBlur = 0;

  // Marcadores de Pleamar y Bajamar
  const drawMarker = (x, y, label, sub) => {
    tideCtx.fillStyle = "#fff";
    tideCtx.beginPath();
    tideCtx.arc(x, y, 7, 0, Math.PI * 2);
    tideCtx.fill();
    tideCtx.strokeStyle = "#ff6a3d";
    tideCtx.lineWidth = 3;
    tideCtx.stroke();

    tideCtx.textAlign = "center";
    tideCtx.font = "bold 17px 'JetBrains Mono', monospace";
    tideCtx.fillStyle = "#ffffff";
    const isCrest = y < h * 0.5;
    tideCtx.fillText(label, x, isCrest ? y + 28 : y - 26);

    tideCtx.font = "13px 'Figtree', sans-serif";
    tideCtx.fillStyle = "rgba(220, 240, 245, 0.85)";
    tideCtx.fillText(sub, x, isCrest ? y + 46 : y - 10);
  };

  drawMarker(w * 0.25, h * 0.14, "04:52", "Pleamar 4,4 m");
  drawMarker(w * 0.50, h * 0.86, "11:05", "Bajamar 0,7 m");
  drawMarker(w * 0.75, h * 0.14, "17:16", "Pleamar 4,5 m");

  // Cursor del tiempo actual escaneando a lo largo del progreso
  const scanX = w * (0.35 + 0.3 * progress);
  const scanAngle = (scanX / w) * Math.PI * 4 - Math.PI * 0.5;
  const scanY = h * 0.5 - Math.sin(scanAngle) * (h * 0.36);

  tideCtx.strokeStyle = "#ff6a3d";
  tideCtx.lineWidth = 2;
  tideCtx.beginPath();
  tideCtx.moveTo(scanX, 0);
  tideCtx.lineTo(scanX, h);
  tideCtx.stroke();

  tideCtx.fillStyle = "#ff6a3d";
  tideCtx.shadowColor = "#ff6a3d";
  tideCtx.shadowBlur = 18;
  tideCtx.beginPath();
  tideCtx.arc(scanX, scanY, 9, 0, Math.PI * 2);
  tideCtx.fill();
  tideCtx.shadowBlur = 0;
}

// --- CONSTRUCCIÓN DEL TIMELINE GSAP ---

// Escena 1: Hook (0.0s - 4.8s)
const s1 = SCENES.hook;
tl.set("#s-hook", { autoAlpha: 1 }, s1.start);
tl.fromTo("#hook-badge", { scale: 0.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: "back.out(1.8)" }, s1.start + 0.2);
tl.fromTo("#hook-title", { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, ease: "power3.out" }, s1.start + 0.4);
tl.fromTo("#hook-sub", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" }, s1.start + 0.7);

tl.fromTo("#tc-1", { x: -80, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.6, ease: "back.out(1.6)" }, s1.start + 1.1);
tl.fromTo("#tc-2", { x: 80, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.6, ease: "back.out(1.6)" }, s1.start + 1.7);
tl.fromTo("#tc-3", { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: "back.out(1.6)" }, s1.start + 2.3);

// Implosión hacia el centro al final de la escena 1
tl.to(["#hook-title", "#hook-sub", "#hook-badge", "#tc-1", "#tc-2", "#tc-3"], {
  scale: 0.2,
  autoAlpha: 0,
  duration: 0.45,
  ease: "power3.in"
}, s1.end - 0.45);
tl.set("#s-hook", { autoAlpha: 0 }, s1.end);

// Escena 2: The Title Drop (4.8s - 9.6s)
const s2 = SCENES.drop;
tl.set("#s-drop", { autoAlpha: 1 }, s2.start);
tl.fromTo(".marea-logo-svg", { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.8, ease: "back.out(2)" }, s2.start);
tl.fromTo("#drop-brand", { scale: 0.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.7, ease: "expo.out" }, s2.start + 0.2);
tl.fromTo("#drop-tagline", { y: 25, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: "power2.out" }, s2.start + 0.5);
tl.fromTo("#drop-pill", { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "back.out(1.7)" }, s2.start + 0.8);

tl.to("#s-drop", { scale: 1.1, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, s2.end - 0.5);
tl.set("#s-drop", { autoAlpha: 0 }, s2.end);

// Escena 3: Algoritmo de puntuación (9.6s - 15.0s)
const s3 = SCENES.score;
tl.set("#s-score", { autoAlpha: 1 }, s3.start);
tl.fromTo("#s-score .scoring-info", { x: -60, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" }, s3.start);
tl.fromTo("#phone-3d", { rotationY: -40, rotationX: 25, scale: 0.85, autoAlpha: 0 }, { rotationY: -18, rotationX: 12, scale: 1, autoAlpha: 1, duration: 0.9, ease: "back.out(1.4)" }, s3.start + 0.1);

// Cuenta progresiva del rating 4,7
const ratingObj = { val: 0.0 };
tl.to(ratingObj, {
  val: 4.7,
  duration: 1.2,
  ease: "power2.out",
  onUpdate: () => {
    const el = document.getElementById("rating-val");
    if (el) el.innerHTML = `${ratingObj.val.toFixed(1).replace(".", ",")}<span style="font-size: 24px; color: var(--text-muted);"> / 5</span>`;
  }
}, s3.start + 0.4);

tl.fromTo(["#f-1", "#f-2", "#f-3", "#f-4"], { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.15, ease: "back.out(1.5)" }, s3.start + 0.8);

tl.to("#s-score", { x: -80, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, s3.end - 0.5);
tl.set("#s-score", { autoAlpha: 0 }, s3.end);

// Escena 4: Boyas reales vs Modelos (15.0s - 20.0s)
const s4 = SCENES.buoys;
tl.set("#s-buoys", { autoAlpha: 1 }, s4.start);
tl.fromTo("#s-buoys h2, #s-buoys .badge-pill, #s-buoys .subtitle", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.1, ease: "power3.out" }, s4.start);
tl.fromTo("#card-model", { x: -100, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.7, ease: "back.out(1.3)" }, s4.start + 0.3);
tl.fromTo("#card-buoy", { x: 100, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.7, ease: "back.out(1.3)" }, s4.start + 0.5);

tl.to("#s-buoys", { scale: 0.92, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, s4.end - 0.5);
tl.set("#s-buoys", { autoAlpha: 0 }, s4.end);

// Escena 5: Curva de marea (20.0s - 25.0s)
const s5 = SCENES.tide;
tl.set("#s-tide", { autoAlpha: 1 }, s5.start);
tl.fromTo("#s-tide h2, #s-tide .badge-pill, #s-tide .subtitle", { y: 25, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.1, ease: "power3.out" }, s5.start);
tl.fromTo(".tide-card-glow", { scale: 0.9, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.8, ease: "back.out(1.2)" }, s5.start + 0.3);

tl.to("#s-tide", { y: -60, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, s5.end - 0.5);
tl.set("#s-tide", { autoAlpha: 0 }, s5.end);

// Escena 6: Clímax Multiplataforma (25.0s - 30.0s)
const s6 = SCENES.climax;
tl.set("#s-climax", { autoAlpha: 1 }, s6.start);
tl.fromTo("#s-climax .marea-logo-svg", { scale: 0 }, { scale: 1, duration: 0.6, ease: "back.out(2)" }, s6.start);
tl.fromTo(".cta-tagline", { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: "expo.out" }, s6.start + 0.2);
tl.fromTo(".device-card-flat", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.12, ease: "back.out(1.5)" }, s6.start + 0.5);
tl.fromTo(".spec-chip", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.08 }, s6.start + 0.9);

// API determinista expuesta para renderizado frame a frame
window.seek = function(t) {
  tl.seek(t);
  renderCanvas(t);

  // Animar curva de marea si estamos en la escena 5
  if (t >= s5.start && t <= s5.end) {
    const prog = (t - s5.start) / (s5.end - s5.start);
    renderTideCurve(prog);
  }
};

window.DURATION = DURATION;
window.ready = document.fonts.ready.then(() => {
  window.seek(0);
});
