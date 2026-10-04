// Arranque: carga fuentes, monta las escenas sobre una única línea de tiempo y expone seek(t) al renderizador.
// En el navegador: ?play reproduce con controles, ?t=12.5 congela ese instante (para capturas sueltas).
import { tl, seek, CUES } from "./core.js";
import { DURATION, W, H } from "./timeline.js";
import { setupBackground } from "./fx.js";
import hook from "./scenes/hook.js";
import logo from "./scenes/logo.js";
import map from "./scenes/map.js";
import rating from "./scenes/rating.js";
import forecast from "./scenes/forecast.js";
import tide from "./scenes/tide.js";
import buoys from "./scenes/buoys.js";
import alerts from "./scenes/alerts.js";
import extras from "./scenes/extras.js";
import end from "./scenes/end.js";

async function boot() {
  await Promise.all(["800 40px Archivo", "500 40px Figtree", "700 40px Figtree", "600 40px 'JetBrains Mono'", "700 40px 'JetBrains Mono'"].map(f => document.fonts.load(f)));
  await document.fonts.ready;
  await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
  setupBackground();
  for (const build of [hook, logo, map, rating, forecast, tide, buoys, alerts, extras, end]) build();
  // Recorre la línea de tiempo entera una vez para que cada tween registre sus valores de partida en orden.
  tl.seek(DURATION, true);
  tl.seek(0, true);
  seek(0);
  Object.assign(window, { seek, DURATION, CUES });
  preview();
}

function preview() {
  const params = new URLSearchParams(location.search);
  const stage = document.getElementById("stage");
  const fit = () => {
    const s = Math.min(innerWidth / W, (innerHeight - (params.has("play") ? 52 : 0)) / H);
    stage.style.transform = s < 0.999 || s > 1.001 ? `scale(${s})` : "";
  };
  fit();
  addEventListener("resize", fit);
  if (params.has("t")) seek(+params.get("t"));
  if (!params.has("play")) return;

  const controls = document.getElementById("controls"), scrub = document.getElementById("scrub");
  const clock = document.getElementById("clock"), play = document.getElementById("play");
  controls.hidden = false;
  scrub.max = DURATION;
  let t = +params.get("t") || 0, playing = true, last = performance.now();
  const loop = now => {
    if (playing) t = (t + (now - last) / 1000) % DURATION;
    last = now;
    seek(t);
    scrub.value = t;
    clock.textContent = t.toFixed(2);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  play.onclick = () => { playing = !playing; play.textContent = playing ? "❚❚" : "▶︎"; };
  scrub.oninput = () => { t = +scrub.value; };
  addEventListener("keydown", e => {
    if (e.key === " ") { e.preventDefault(); play.click(); }
    if (e.key === "ArrowRight") t = Math.min(DURATION, t + (e.shiftKey ? 1 : 1 / 60));
    if (e.key === "ArrowLeft") t = Math.max(0, t - (e.shiftKey ? 1 : 1 / 60));
  });
  play.textContent = "❚❚";
}

window.ready = boot().then(() => true, err => { console.error(err); throw err; });
