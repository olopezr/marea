// Avisos meteorológicos oficiales de AEMET (Plan Meteoalerta en formato CAP).
// Cruza los spots con las alertas activas para detectar condiciones desfavorables o peligrosas.
// Fuente gratuita, sin clave obligatoria y actualizada en tiempo real mediante RSS/CAP.
import { cached } from "../cache.js";
import { blocks, tag } from "./xml.js";

const RSS_URL = "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAE_wah_RSS.xml";
const UA = "MareaSurf/1.0 https://github.com/olopezr/marea";

const REGION_ZONES = {
  Pontevedra: ["rias baixas", "rías baixas", "pontevedra", "miño de pontevedra"],
  "A Coruña": [
    "a coruña",
    "coruña",
    "costa da morte",
    "ferrol",
    "noroeste de a coruña",
    "oeste de a coruña",
    "suroeste de a coruña",
  ],
  Asturias: ["litoral occidental asturiano", "litoral oriental asturiano", "litoral asturiano", "asturias"],
  Cantabria: ["litoral cántabro", "litoral de cantabria", "cantabria"],
  Bizkaia: ["bizkaia litoral", "litoral de bizkaia", "bizkaia", "vizcaya"],
  Gipuzkoa: ["gipuzkoa litoral", "litoral de gipuzkoa", "gipuzkoa", "guipúzcoa"],
  Huelva: ["litoral de huelva", "huelva"],
  Cádiz: ["litoral gaditano", "estrecho", "cádiz", "cadiz"],
  Valencia: ["litoral norte de valencia", "litoral sur de valencia", "valencia"],
  Barcelona: ["litoral de barcelona", "barcelona"],
  Girona: ["ampurdán", "empordà", "litoral sur de girona", "litoral norte de girona", "girona"],
  Mallorca: [
    "sierra tramontana",
    "tramuntana",
    "norte y nordeste de mallorca",
    "sur de mallorca",
    "levante mallorquín",
    "mallorca",
  ],
  Menorca: ["menorca"],
  Lanzarote: ["lanzarote"],
  Fuerteventura: ["fuerteventura"],
  "Gran Canaria": ["norte de gran canaria", "este, sur y oeste de gran canaria", "gran canaria"],
  Tenerife: ["norte de tenerife", "este, sur y oeste de tenerife", "tenerife"],
};

const EXCLUDED_INLAND = [
  "pirineo",
  "prepirineo",
  "picos de europa",
  "cordillera",
  "depresión central",
  "ebro",
  "interior",
  "suroccidental",
  "central y valle",
  "vertiente cantábrica de navarra",
];

const LEVEL_RANK = {
  rojo: 3,
  naranja: 2,
  amarillo: 1,
};

const PHENOM_RANK = {
  costeros: 10,
  galerna: 10,
  rissaga: 10,
  vientos: 8,
  tormentas: 7,
  lluvias: 5,
};

function parseAemetDate(str) {
  if (!str) return null;
  // Formato habitual: "08:00 08-10-2026 CEST (UTC+2)" o "(UTC+1)"
  const m = str.match(/(\d{2}):(\d{2})\s+(\d{2})-(\d{2})-(\d{4})\s+\w+\s+\(UTC([+-]\d+)\)/);
  if (!m) return null;
  const [, hh, mm, dd, MM, yyyy, tz] = m;
  const sign = Number(tz) >= 0 ? "+" : "-";
  const absTz = String(Math.abs(Number(tz))).padStart(2, "0");
  const iso = `${yyyy}-${MM}-${dd}T${hh}:${mm}:00${sign}${absTz}:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function parseAemetRss(xml) {
  if (!xml || typeof xml !== "string") return [];
  const items = blocks(xml, "item");
  const out = [];

  for (const block of items) {
    const title = tag(block, "title") ?? "";
    const desc = tag(block, "description") ?? "";
    const link = tag(block, "link") ?? "";
    const guid = tag(block, "guid") ?? "";

    // Ejemplo: "Aviso. Nivel naranja. Costeros. Menorca"
    const m = title.match(/^Aviso\.\s+Nivel\s+(\w+)\.\s+([^.]+)\.\s+(.+)$/i);
    if (!m) continue;

    const level = m[1].toLowerCase();
    const phenomenon = m[2].trim();
    const zone = m[3].trim();

    let start = null;
    let end = null;
    const timeMatch = desc.match(
      /de\s+([0-9: -]+(?:CEST|CET)\s+\([A-Z0-9+-]+\))\s+a\s+([0-9: -]+(?:CEST|CET)\s+\([A-Z0-9+-]+\))/i,
    );
    if (timeMatch) {
      start = parseAemetDate(timeMatch[1]);
      end = parseAemetDate(timeMatch[2]);
    }

    out.push({
      id: guid || link || `${level}-${phenomenon}-${zone}`,
      level,
      phenomenon,
      zone,
      desc,
      start,
      end,
      link,
    });
  }

  return out;
}

// Solo se descargan detalles de AEMET por HTTPS: la URL viene del RSS y no debe llevar al servidor a otro sitio.
const isAemetUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.port && (u.hostname === "aemet.es" || u.hostname.endsWith(".aemet.es"));
  } catch {
    return false;
  }
};

export async function fetchCapDetail(url) {
  if (!url || !isAemetUrl(url)) return null;
  return cached(
    `aemet:detail:${url}`,
    60 * 60e3,
    async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`AEMET detail error: ${res.status}`);
      const xml = await res.text();

      const [esInfo = "", enInfo = ""] = blocks(xml, "info");

      const extract = (block) => ({
        headline: tag(block, "headline"),
        description: tag(block, "description"),
        instruction: tag(block, "instruction"),
        onset: tag(block, "onset"),
        expires: tag(block, "expires"),
      });

      return {
        es: extract(esInfo),
        en: extract(enInfo),
      };
    },
    { staleMs: 4 * 3600e3 },
  ).catch((err) => {
    console.warn(`[aemet] Error al descargar detalle de ${url}: ${err.message}`);
    return null;
  });
}

export async function allWarnings() {
  return cached(
    "aemet:all",
    15 * 60e3,
    async () => {
      const res = await fetch(RSS_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`AEMET RSS error: ${res.status}`);
      const xml = await res.text();
      return parseAemetRss(xml);
    },
    { staleMs: 2 * 3600e3 },
  ).catch((err) => {
    console.warn(`[aemet] Error al obtener avisos: ${err.message}`);
    return [];
  });
}

function matchesSpot(warning, spot) {
  const keys = REGION_ZONES[spot.region];
  if (!keys) return false;
  const z = warning.zone.toLowerCase();
  // Excluir zonas de interior o montaña que no afectan a la costa
  if (EXCLUDED_INLAND.some((ex) => z.includes(ex)) && !z.includes("litoral")) {
    return false;
  }
  return keys.some((k) => z.includes(k));
}

function warningScore(w, now) {
  const active = w.start != null && w.end != null ? now >= w.start && now <= w.end : true;
  const imminent = w.start != null && w.start > now && w.start - now <= 24 * 3600e3;
  const activeScore = active ? 100 : imminent ? 50 : 10;
  const lScore = (LEVEL_RANK[w.level] ?? 0) * 10;
  const pScore = PHENOM_RANK[w.phenomenon.toLowerCase()] ?? 1;
  return activeScore + lScore + pScore;
}

export function sortWarnings(warnings, now = Date.now()) {
  return [...warnings].sort((a, b) => warningScore(b, now) - warningScore(a, now));
}

export async function warningsForSpot(spot, now = Date.now(), { fetchDetails = false } = {}) {
  const all = await allWarnings();
  const matched = all.filter((w) => matchesSpot(w, spot));

  // Filtrar avisos ya caducados hace más de 1 hora
  const relevant = matched.filter((w) => (w.end != null ? w.end >= now - 3600e3 : true));
  const sorted = sortWarnings(relevant, now);

  if (!fetchDetails) {
    return sorted.map((w) => ({
      ...w,
      active: w.start != null && w.end != null ? now >= w.start && now <= w.end : true,
    }));
  }

  // Si se solicitan detalles, obtener los textos oficiales de AEMET para los primeros 3 avisos
  const enriched = await Promise.all(
    sorted.slice(0, 3).map(async (w) => {
      const active = w.start != null && w.end != null ? now >= w.start && now <= w.end : true;
      let details = null;
      if (w.link) {
        details = await fetchCapDetail(w.link);
      }
      return {
        ...w,
        active,
        details,
      };
    }),
  );

  return enriched;
}

// Avisos de nivel amarillo o superior que afectan a un spot y merecen una notificación: los que están en vigor
// o empiezan en las próximas 24 h. Los caducados no. Ordenados de más a menos relevante.
export function alertableWarnings(spot, all, now = Date.now()) {
  const list = (all ?? []).filter(
    (w) => matchesSpot(w, spot) && LEVEL_RANK[w.level] && (w.end == null || w.end >= now),
  );
  return sortWarnings(
    list.filter((w) => w.start == null || w.start - now <= 24 * 3600e3),
    now,
  ).map((w) => ({
    ...w,
    active: w.start != null && w.end != null ? now >= w.start && now <= w.end : true,
  }));
}

export function activeWarningFor(spot, now = Date.now(), all = null) {
  const list = all ?? [];
  const matched = list.filter((w) => matchesSpot(w, spot));
  const relevant = matched.filter((w) => (w.end != null ? w.end >= now - 3600e3 : true));
  if (!relevant.length) return null;
  const sorted = sortWarnings(relevant, now);
  const best = sorted[0];
  const active = best.start != null && best.end != null ? now >= best.start && now <= best.end : true;
  return {
    id: best.id,
    level: best.level,
    phenomenon: best.phenomenon,
    zone: best.zone,
    active,
    start: best.start,
    end: best.end,
    desc: best.desc,
  };
}
