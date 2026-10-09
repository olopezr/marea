// Lectura mínima de XML (RSS y CAP de AEMET) sin dependencias: etiquetas con atributos, varias líneas,
// CDATA y entidades. No es un parser completo; basta para estos dos formatos, que son planos.
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function codePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

// Quita los CDATA (su contenido va tal cual) y decodifica entidades en el resto.
export function text(raw) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, cdata, ent) => {
      if (cdata != null) return cdata;
      if (ent[0] === "#") return codePoint(ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : +ent.slice(1));
      return ENTITIES[ent.toLowerCase()];
    })
    .trim();
}

const tagRe = (name, flags) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, flags);

// Contenido (ya decodificado) de la primera etiqueta `name`, o null.
export function tag(xml, name) {
  const m = xml.match(tagRe(name));
  return m ? text(m[1]) : null;
}

// Contenido en bruto de todas las etiquetas `name` (para recorrer <item>, <info>…).
export function blocks(xml, name) {
  return [...xml.matchAll(tagRe(name, "g"))].map((m) => m[1]);
}
