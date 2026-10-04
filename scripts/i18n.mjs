// Genera los textos de la web y de las apps a partir de i18n/strings.json (español e inglés):
//   public/js/strings.js                                  (web: {0}, {1}…)
//   ios/Marea/Resources/{es,en}.lproj/Localizable.strings  (iOS: %1$@, %2$@…)
//   android/app/src/main/res/values{,-en}/strings.xml      (Android: %1$s, %2$s…; el español es el idioma por defecto)
// Uso: node scripts/i18n.mjs        (test/i18n.test.js comprueba que los archivos generados están al día)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LANGS = ["es", "en"];

export function load() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/strings.json"), "utf8"));
  delete raw._comment;
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v) || v.length !== LANGS.length || v.some(s => typeof s !== "string" || !s)) throw new Error(`Texto incompleto: ${k}`);
    const args = s => [...s.matchAll(/\{(\d)\}/g)].map(m => m[1]).sort().join();
    if (args(v[0]) !== args(v[1])) throw new Error(`Los idiomas no usan los mismos valores en ${k}`);
  }
  return raw;
}

const hasArgs = s => /\{\d\}/.test(s);

export function web(strings) {
  const out = Object.fromEntries(LANGS.map((l, i) => [l, Object.fromEntries(Object.entries(strings).map(([k, v]) => [k, v[i]]))]));
  return `// Generado por scripts/i18n.mjs a partir de i18n/strings.json. No editar a mano.\nexport default ${JSON.stringify(out, null, 1)};\n`;
}

export function ios(strings, i) {
  const esc = s => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const fmt = s => (hasArgs(s) ? s.replace(/%/g, "%%").replace(/\{(\d)\}/g, (_, n) => `%${+n + 1}$@`) : s);
  return `/* Generado por scripts/i18n.mjs a partir de i18n/strings.json. No editar a mano. */\n` +
    Object.entries(strings).map(([k, v]) => `"${k}" = "${esc(fmt(v[i]))}";`).join("\n") + "\n";
}

export const androidKey = k => k.replace(/\./g, "_");

export function android(strings, i) {
  const esc = s => {
    let x = s.replace(/\\/g, "\\\\").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/'/g, "\\'").replace(/"/g, '\\"');
    if (/^[@?]/.test(x)) x = "\\" + x;
    return /^\s|\s$/.test(x) ? `"${x}"` : x; // conserva los espacios al principio o al final
  };
  const rows = Object.entries(strings).map(([k, v]) => {
    const s = v[i];
    if (hasArgs(s)) return `    <string name="${androidKey(k)}">${esc(s.replace(/%/g, "%%").replace(/\{(\d)\}/g, (_, n) => `%${+n + 1}$s`))}</string>`;
    return `    <string name="${androidKey(k)}"${s.includes("%") ? ' formatted="false"' : ""}>${esc(s)}</string>`;
  });
  // Los textos son comunes a la web y las apps: algunos solo los usan la web o iOS (UnusedResources).
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generado por scripts/i18n.mjs a partir de i18n/strings.json. No editar a mano. -->\n` +
    `<resources xmlns:tools="http://schemas.android.com/tools" tools:ignore="UnusedResources">\n` +
    (i === 0 ? `    <string name="app_name" translatable="false">Marea</string>\n` : "") + `${rows.join("\n")}\n</resources>\n`;
}

export function outputs() {
  const s = load();
  return {
    "public/js/strings.js": web(s),
    "ios/Marea/Resources/es.lproj/Localizable.strings": ios(s, 0),
    "ios/Marea/Resources/en.lproj/Localizable.strings": ios(s, 1),
    "android/app/src/main/res/values/strings.xml": android(s, 0),
    "android/app/src/main/res/values-en/strings.xml": android(s, 1),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [file, content] of Object.entries(outputs())) {
    fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, file), content);
    console.log(`✓ ${file}`);
  }
}
