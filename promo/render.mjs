// Renderiza el vídeo: varios Chromium en paralelo capturan tramos consecutivos de fotogramas (la animación es
// determinista: seek(t) siempre da el mismo fotograma), cada tramo se codifica con ffmpeg y al final se unen
// con la música generada a partir de los momentos sonoros de la animación.
//
//   node render.mjs                      → out/marea-promo.mp4 (1920×1080, 60 fps)
//   node render.mjs --fps 30 --workers 6
//   node render.mjs --scale 2            → 3840×2160
//   node render.mjs --from 16 --to 22    → solo un tramo (para revisar)
//   node render.mjs --audio mi-musica.mp3  /  --no-audio
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";
import { launch } from "./tools/browser.mjs";
import { renderMusic, normalizeLoudness } from "./music.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? def : process.argv[i + 1]; };
const flag = name => process.argv.includes(`--${name}`);
const FPS = +arg("fps", 60), SCALE = +arg("scale", 1);
const WORKERS = +arg("workers", Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2))));
const OUT = path.resolve(DIR, arg("out", "out/marea-promo.mp4"));
const TMP = path.join(DIR, "out", ".tmp");
fs.mkdirSync(TMP, { recursive: true });

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
  p.on("exit", code => (code === 0 ? resolve() : reject(new Error(`${cmd} terminó con código ${code}`))));
});

const { server, url } = await serve();
const PAGE = `${url}/promo/index.html`;
const t0 = Date.now();

// 1. Duración y momentos sonoros
const probe = await launch();
const page0 = await probe.newPage({ viewport: { width: 1920, height: 1080 } });
const pageErrors = [];
page0.on("pageerror", e => pageErrors.push(e.message));
await page0.goto(PAGE);
await page0.evaluate(() => window.ready);
const { DURATION, CUES } = await page0.evaluate(() => ({ DURATION: window.DURATION, CUES: window.CUES }));
await probe.close();
if (pageErrors.length) throw new Error(`Errores en la animación:\n${pageErrors.join("\n")}`);
const from = +arg("from", 0), to = Math.min(+arg("to", DURATION), DURATION);
fs.writeFileSync(path.join(DIR, "out", "cues.json"), JSON.stringify(CUES, null, 1));

// 2. Música
let audio = arg("audio", null);
if (!audio && !flag("no-audio")) {
  audio = path.join(DIR, "out", "music.wav");
  console.log("Generando música…");
  renderMusic({ duration: DURATION, cues: CUES, file: audio });
  normalizeLoudness(audio);
}

// 3. Fotogramas en paralelo, un ffmpeg por tramo
const first = Math.round(from * FPS), last = Math.round(to * FPS); // [first, last)
const total = last - first;
const per = Math.ceil(total / WORKERS);
const chunks = Array.from({ length: WORKERS }, (_, i) => [first + i * per, Math.min(last, first + (i + 1) * per)]).filter(([a, b]) => b > a);
let done = 0;
const progress = () => process.stdout.write(`\rFotogramas ${done}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)  `);

async function renderChunk([a, b], i) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE });
  await page.goto(PAGE);
  await page.evaluate(() => window.ready);
  const cdp = await page.context().newCDPSession(page);
  const file = path.join(TMP, `chunk-${String(i).padStart(2, "0")}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-g", String(FPS * 2), "-bf", "2",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(FPS), file], { stdio: ["pipe", "inherit", "inherit"] });
  const finished = new Promise((resolve, reject) => ff.on("exit", c => (c === 0 ? resolve() : reject(new Error(`ffmpeg (tramo ${i}) terminó con ${c}`)))));
  for (let f = a; f < b; f++) {
    await page.evaluate(t => window.seek(t), f / FPS);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise(r => ff.stdin.once("drain", r));
    done++;
    if (done % 30 === 0) progress();
  }
  ff.stdin.end();
  await finished;
  await browser.close();
  return file;
}

console.log(`Renderizando ${total} fotogramas (${(total / FPS).toFixed(1)} s a ${FPS} fps, ${1920 * SCALE}×${1080 * SCALE}) con ${chunks.length} procesos…`);
const files = await Promise.all(chunks.map(renderChunk));
progress();
console.log();
server.close();

// 4. Unir tramos y música
const list = path.join(TMP, "chunks.txt");
fs.writeFileSync(list, files.map(f => `file '${f}'`).join("\n"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const audioArgs = audio ? ["-ss", String(from), "-t", String(to - from), "-i", path.resolve(audio)] : [];
await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, ...audioArgs,
  "-map", "0:v", ...(audio ? ["-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-ar", "48000"] : []),
  "-c:v", "copy", "-movflags", "+faststart", "-shortest", OUT]);
fs.rmSync(TMP, { recursive: true, force: true });
// Portada: el cierre con el logo y el lema
if (to - from === DURATION) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(DURATION - 2.4), "-i", OUT, "-frames:v", "1", "-q:v", "2", OUT.replace(/\.mp4$/, "-portada.jpg")]);
}
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(process.cwd(), OUT)}`);
