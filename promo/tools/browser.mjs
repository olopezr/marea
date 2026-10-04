// Chromium para capturar: usa el de Playwright si está instalado (npx playwright install chromium-headless-shell)
// o el que indique CHROMIUM_PATH.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

function findHeadlessShell() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), os.platform() === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter(d => d.startsWith("chromium_headless_shell-")).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of fs.readdirSync(path.join(cache, d))) {
      const bin = path.join(cache, d, sub, os.platform() === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined; // que Playwright busque el suyo
}

export const launch = () => chromium.launch({ executablePath: findHeadlessShell(), args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"] });
