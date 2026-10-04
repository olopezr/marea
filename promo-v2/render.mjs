// Renderizador cinemático en paralelo para promo-v2 (Chromium CDP + ffmpeg)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";
import { launch } from "../promo/tools/browser.mjs";
import { renderSoundtrack } from "./js/synth.mjs";
import { DURATION } from "./js/timeline.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};
const flag = name => process.argv.includes(`--${name}`);

const FPS = +arg("fps", 60);
const SCALE = +arg("scale", 1);
const WORKERS = +arg("workers", Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2))));
const OUT = path.resolve(DIR, arg("out", "out/marea-promo-v2.mp4"));
const TMP = path.join(DIR, "out", ".tmp");
fs.mkdirSync(TMP, { recursive: true });

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
  p.on("exit", code => (code === 0 ? resolve() : reject(new Error(`${cmd} falló con código ${code}`))));
});

const t0 = Date.now();
const { server, url } = await serve();
const PAGE = `${url}/promo-v2/index.html`;

// 1. Verificación y audio
console.log("Comprobando página y generando banda sonora a 124 BPM…");
const probe = await launch();
const page0 = await probe.newPage({ viewport: { width: 1920, height: 1080 } });
const pageErrors = [];
page0.on("pageerror", e => pageErrors.push(e.message));
await page0.goto(PAGE);
await page0.evaluate(() => window.ready);
await probe.close();

if (pageErrors.length) {
  throw new Error(`Errores en la animación:\n${pageErrors.join("\n")}`);
}

const audioFile = path.join(DIR, "out", "soundtrack.wav");
renderSoundtrack(audioFile);

// 2. Renderizado de fotogramas por tramos en paralelo
const from = +arg("from", 0);
const to = Math.min(+arg("to", DURATION), DURATION);
const first = Math.round(from * FPS);
const last = Math.round(to * FPS);
const total = last - first;
const per = Math.ceil(total / WORKERS);
const chunks = Array.from({ length: WORKERS }, (_, i) => [
  first + i * per,
  Math.min(last, first + (i + 1) * per)
]).filter(([a, b]) => b > a);

let done = 0;
const progress = () => {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`\rRenderizando fotogramas: ${done}/${total} (${elapsed} s)  `);
};

async function renderChunk([a, b], i) {
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: SCALE
  });
  await page.goto(PAGE);
  await page.evaluate(() => window.ready);
  const cdp = await page.context().newCDPSession(page);

  const file = path.join(TMP, `chunk-${String(i).padStart(2, "0")}.mp4`);
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS),
    "-c:v", "png", "-i", "-",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "faster", "-crf", "17",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(FPS), file
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const finished = new Promise((resolve, reject) => {
    ff.on("exit", c => (c === 0 ? resolve() : reject(new Error(`ffmpeg chunk ${i} terminó con ${c}`))));
  });

  for (let f = a; f < b; f++) {
    await page.evaluate(t => window.seek(t), f / FPS);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    if (!ff.stdin.write(Buffer.from(data, "base64"))) {
      await new Promise(r => ff.stdin.once("drain", r));
    }
    done++;
    if (done % 30 === 0) progress();
  }

  ff.stdin.end();
  await finished;
  await browser.close();
  return file;
}

console.log(`Renderizando ${total} fotogramas (${(total / FPS).toFixed(1)} s a ${FPS} fps, ${1920 * SCALE}×${1080 * SCALE}) con ${chunks.length} workers…`);
const files = await Promise.all(chunks.map(renderChunk));
progress();
console.log();
server.close();

// 3. Montaje final de vídeo + audio
const list = path.join(TMP, "chunks.txt");
fs.writeFileSync(list, files.map(f => `file '${f}'`).join("\n"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });

console.log("Ensamblando tramos y masterizando vídeo final…");
await run("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
  "-ss", String(from), "-t", String(to - from), "-i", audioFile,
  "-map", "0:v", "-map", "1:a",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
  "-movflags", "+faststart", "-shortest", OUT
]);

fs.rmSync(TMP, { recursive: true, force: true });

// Portada / Fotograma destacado (en t = 27 s, escena de cierre)
const COVER = OUT.replace(/\.mp4$/, "-cover.jpg");
await run("ffmpeg", [
  "-y", "-loglevel", "error",
  "-ss", String(Math.min(27.0, DURATION - 1.0)),
  "-i", OUT, "-frames:v", "1", "-q:v", "2", COVER
]);

console.log(`\n¡Vídeo finalizado con éxito en ${((Date.now() - t0) / 1000).toFixed(1)} s!`);
console.log(`Archivo: ${path.relative(process.cwd(), OUT)}`);
console.log(`Portada: ${path.relative(process.cwd(), COVER)}`);
