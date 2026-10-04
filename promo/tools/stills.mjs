// Captura fotogramas sueltos para revisar la animación sin renderizar el vídeo entero.
// Uso: node tools/stills.mjs <carpeta> 1.2 6.5 12 …   (añade --sheet para una hoja de contactos)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { serve } from "../serve.mjs";
import { launch } from "./browser.mjs";

const args = process.argv.slice(2);
const sheet = args.includes("--sheet");
const [dir, ...times] = args.filter(a => a !== "--sheet");
fs.mkdirSync(dir, { recursive: true });
const { server, url } = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${url}/promo/index.html`);
await page.waitForFunction(() => window.ready).catch(() => {});
await page.evaluate(() => window.ready);
const files = [];
for (const t of times) {
  await page.evaluate(t => window.seek(t), +t);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = path.join(dir, `t${(+t).toFixed(2).padStart(6, "0")}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  files.push(file);
}
if (sheet && files.length > 1) {
  const cols = Math.min(3, files.length), rows = Math.ceil(files.length / cols);
  const inputs = files.flatMap(f => ["-i", f]);
  const scaled = files.map((_, i) => `[${i}:v]scale=640:-1[v${i}]`).join(";");
  const layout = files.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join("|");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex",
    `${scaled};${files.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${files.length}:layout=${layout}:fill=black`, path.join(dir, "sheet.jpg")]);
  console.log(path.join(dir, "sheet.jpg"));
}
if (errors.length) console.error("Errores en la página:\n" + [...new Set(errors)].join("\n"));
console.log(files.join("\n"));
await browser.close();
server.close();
