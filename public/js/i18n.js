// Idioma de la interfaz: inglés si el navegador lo prefiere antes que el español; si no, español
// (también para catalán, gallego y euskera, y como idioma por defecto, igual que en las apps).
import STRINGS from "./strings.js";
import { setLanguage } from "./surf.js";

function pick() {
  for (const l of navigator.languages ?? [navigator.language ?? "es"]) {
    const code = String(l).toLowerCase().slice(0, 2);
    if (["es", "ca", "gl", "eu"].includes(code)) return "es";
    if (code === "en") return "en";
  }
  return "es";
}

export const lang = pick();
setLanguage(lang);
document.documentElement.lang = lang;

/** Texto traducido; {0}, {1}… se sustituyen por los argumentos. */
export function t(key, ...args) {
  const s = STRINGS[lang][key] ?? STRINGS.es[key] ?? key;
  return args.length ? s.replace(/\{(\d)\}/g, (_, i) => args[+i] ?? "") : s;
}
