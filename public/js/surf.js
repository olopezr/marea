// Lógica pura compartida por servidor y cliente: valoración, mareas, geometría y formato.
// Todas las horas son instantes absolutos (ms desde epoch); la zona horaria solo se usa al mostrar.

export const angDiff = (a, b) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};

let CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const cardinal = (deg) => (deg == null ? "–" : CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]);

// Idioma de los textos con formato (la web lo cambia a inglés; el servidor siempre usa español):
// coma o punto decimal, Oeste (O) o West (W) y nombres de los días.
let DECIMAL = ",",
  LOCALE = "es-ES";
export function setLanguage(lang) {
  const en = lang === "en";
  DECIMAL = en ? "." : ",";
  LOCALE = en ? "en-GB" : "es-ES";
  CARDINALS = CARDINALS.map((c) => (en ? c.replace(/O/g, "W") : c.replace(/W/g, "O")));
  fmtCache.clear();
}

// Rumbo inicial (0–360°) para ir de a hacia b.
export function bearing(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function km(a, b) {
  const R = 6371,
    rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Tipo de viento según la orientación de la playa.
export function windType(speed, dir, facing) {
  if (speed == null || dir == null) return { key: "na", label: "–" };
  if (speed < 5) return { key: "calm", label: "Calma" };
  const d = angDiff(dir, facing); // viento que llega desde el mar => d pequeño
  if (d >= 135) return { key: "off", label: "Terral" };
  if (d >= 60) return { key: "cross", label: "Cruzado" };
  return { key: "on", label: "De mar" };
}

// Si el mar de fondo es la componente principal, su periodo y dirección mandan.
export function waveParts({ h, T, dir, sh, sT, sDir }) {
  const swellLeads = sh != null && h != null && sh >= 0.5 * h && sT != null;
  return { h, T: swellLeads ? sT : T, dir: swellLeads ? sDir : dir };
}

// Valoración 0–5 de las condiciones de surf.
export function rate({ h, T, dir, wind, windDir, facing, tideNorm = 0.5, tidePref = "all" }) {
  if (h == null || T == null) return 0;
  const exposure = dir == null ? 0 : angDiff(dir, facing);
  const factor = exposure <= 45 ? 1 : exposure <= 90 ? 0.7 : exposure <= 120 ? 0.35 : 0.1;
  const he = h * factor;

  let s = he < 0.3 ? 0 : he < 0.6 ? 1.2 : he < 1 ? 2.2 : he < 1.8 ? 3 : he < 2.8 ? 3.2 : he < 4 ? 2.6 : 1.8;
  s += T >= 13 ? 1 : T >= 10 ? 0.6 : T >= 8 ? 0.2 : T >= 6 ? -0.4 : -1.2;

  if (wind != null && windDir != null) {
    const wd = angDiff(windDir, facing);
    if (wind < 5) s += 0.5;
    else if (wd >= 135) s += wind < 18 ? 0.6 : -0.3;
    else if (wd >= 60) s -= Math.min(1.5, wind / 12);
    else s -= Math.min(2.5, wind / 7);
  }

  if (tidePref === "low") s += tideNorm < 0.35 ? 0.3 : tideNorm > 0.7 ? -0.6 : 0;
  if (tidePref === "high") s += tideNorm > 0.65 ? 0.3 : tideNorm < 0.3 ? -0.6 : 0;
  if (tidePref === "mid") s += Math.abs(tideNorm - 0.5) > 0.38 ? -0.4 : 0.1;

  if (he < 0.3) s = Math.min(s, 0.5);
  return Math.max(0, Math.min(5, Math.round(s * 10) / 10));
}

export const RATINGS = [
  { key: "flat", label: "Plato", min: 0 },
  { key: "poor", label: "Pobre", min: 1 },
  { key: "fair", label: "Aceptable", min: 2 },
  { key: "good", label: "Bueno", min: 3 },
  { key: "epic", label: "Muy bueno", min: 4 },
];
export const rating = (score) => [...RATINGS].reverse().find((r) => score >= r.min);

// ---------- Mareas ----------

// Pleamares y bajamares a partir de una serie regular, refinadas con interpolación parabólica.
export function tideExtremes(times, levels) {
  const out = [];
  const step = times[1] - times[0];
  for (let i = 1; i < levels.length - 1; i++) {
    const [a, b, c] = [levels[i - 1], levels[i], levels[i + 1]];
    if (a == null || b == null || c == null) continue;
    const isHigh = b >= a && b > c,
      isLow = b <= a && b < c;
    if (!isHigh && !isLow) continue;
    const curv = (a - 2 * b + c) / 2,
      slope = (c - a) / 2;
    const off = curv ? -slope / (2 * curv) : 0;
    out.push({
      type: isHigh ? "high" : "low",
      t: times[i] + off * step,
      h: curv ? b - (slope * slope) / (4 * curv) : b,
    });
  }
  return out;
}

// Curva continua entre extremos (interpolación cosenoidal, la de las tablas de marea).
export function curveFromExtremes(ext, from, to, stepMs = 15 * 60e3) {
  const times = [],
    levels = [];
  for (let t = from; t <= to; t += stepMs) {
    const i = ext.findIndex((e) => e.t > t);
    if (i <= 0) continue;
    const a = ext[i - 1],
      b = ext[i];
    const f = (t - a.t) / (b.t - a.t);
    times.push(t);
    levels.push(a.h + ((b.h - a.h) * (1 - Math.cos(Math.PI * f))) / 2);
  }
  return { times, levels };
}

// Coeficiente de marea de cada pleamar: carrera de esa marea frente a la carrera media del puerto,
// en la escala habitual (20 = mínima, 45 = muertas medias, 70 = media, 100 = vivas medias, 120 = máxima).
export function withCoefficients(ext, meanRange) {
  if (!meanRange) return ext;
  return ext.map((e, i) => {
    if (e.type !== "high") return e;
    const ranges = [ext[i - 1], ext[i + 1]].filter((x) => x && x.type === "low").map((x) => e.h - x.h);
    if (!ranges.length) return e;
    const range = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    return { ...e, coef: Math.max(20, Math.min(120, Math.round((70 * range) / meanRange))) };
  });
}

// Coeficiente de la marea en curso: el de la pleamar más cercana.
export function coefficientAt(ext, t) {
  let best = null;
  for (const e of ext) if (e.coef != null && (!best || Math.abs(e.t - t) < Math.abs(best.t - t))) best = e;
  return best?.coef ?? null;
}

export const coefLabel = (c) =>
  c == null ? "" : c >= 95 ? "vivas fuertes" : c >= 70 ? "mareas vivas" : c >= 45 ? "marea media" : "mareas muertas";

// Nivel interpolado en un instante y si la marea sube o baja.
export function tideAt(times, levels, t) {
  for (let i = 0; i < times.length - 1; i++) {
    if (t >= times[i] && t <= times[i + 1]) {
      const f = (t - times[i]) / (times[i + 1] - times[i]);
      return { h: levels[i] + (levels[i + 1] - levels[i]) * f, rising: levels[i + 1] > levels[i] };
    }
  }
  return null;
}

// Posición relativa (0 = bajamar, 1 = pleamar) en la ventana de ±12 h.
export function tideNorm(times, levels, t) {
  const win = levels.filter((_, i) => Math.abs(times[i] - t) <= 12 * 3600e3);
  const at = tideAt(times, levels, t);
  if (!at || win.length < 2) return 0.5;
  const min = Math.min(...win),
    max = Math.max(...win);
  return max === min ? 0.5 : (at.h - min) / (max - min);
}

// ---------- Formato (zona horaria del spot) ----------

const fmtCache = new Map();
function dtf(tz, opts) {
  const k = tz + JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...opts }));
  return fmtCache.get(k);
}
export const hhmm = (ms, tz) => dtf(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
export const hourOf = (ms, tz) => +dtf(tz, { hour: "numeric", hourCycle: "h23" }).format(ms);
export const dayKey = (ms, tz) => {
  const p = Object.fromEntries(
    dtf(tz, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year}`;
};
export const dayLabel = (ms, tz) => {
  const s = dtf(tz, { weekday: "short", day: "numeric" }).format(ms).replace(".", "").replace(",", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Desfase (ms) de una zona horaria respecto a UTC en un instante.
export function tzOffset(ms, tz) {
  const p = Object.fromEntries(
    dtf(tz, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(ms)
      .map((x) => [x.type, +x.value]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Hora local de pared ("2026-10-02", "06:49") en una zona → instante absoluto.
export function localToUtc(date, time, tz) {
  const naive = Date.UTC(
    +date.slice(0, 4),
    +date.slice(5, 7) - 1,
    +date.slice(8, 10),
    +time.slice(0, 2),
    +time.slice(3, 5),
  );
  let t = naive - tzOffset(naive, tz);
  t = naive - tzOffset(t, tz); // segunda pasada por si cruza un cambio de hora
  return t;
}

// Inicio del día local (00:00) que contiene `ms`.
export function startOfLocalDay(ms, tz) {
  const [d, m, y] = dayKey(ms, tz).split("/");
  return localToUtc(`${y}-${m}-${d}`, "00:00", tz);
}

export const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? "–" : n.toFixed(d).replace(".", DECIMAL));

// Salida y puesta de sol (ecuación del amanecer, precisión de ~1 min) y crepúsculo civil para el día UTC que contiene `ms`.
export function sunTimes(ms, lat, lon) {
  const rad = Math.PI / 180;
  const jd = Math.floor(ms / 86400e3) + 2440588; // día juliano a mediodía UTC
  const n = jd - 2451545 + 0.0008;
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDecl = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const toMs = (j) => Math.round((j - 2440587.5) * 86400e3);

  const hourAngle = (angle) => {
    const cosW = (Math.sin(angle * rad) - Math.sin(lat * rad) * sinDecl) / (Math.cos(lat * rad) * cosDecl);
    if (cosW < -1 || cosW > 1) return null;
    return Math.acos(cosW) / rad;
  };

  const wSun = hourAngle(-0.833);
  if (wSun == null) return null;
  const wCivil = hourAngle(-6.0);

  return {
    rise: toMs(jTransit - wSun / 360),
    set: toMs(jTransit + wSun / 360),
    dawn: wCivil != null ? toMs(jTransit - wCivil / 360) : null,
    dusk: wCivil != null ? toMs(jTransit + wCivil / 360) : null,
  };
}

// Fase lunar y tipo de marea asociada (vivas / muertas) para cualquier instante `ms`.
export function moonPhase(ms) {
  const LUNAR_MONTH = 29.53058770576;
  const NEW_MOON_REF = 947182440000; // 2000-01-06 18:14 UTC (Luna nueva de referencia)
  const daysSince = (ms - NEW_MOON_REF) / 86400e3;
  let cycle = (daysSince % LUNAR_MONTH) / LUNAR_MONTH;
  if (cycle < 0) cycle += 1;
  const illumination = Math.round(((1 - Math.cos(cycle * 2 * Math.PI)) / 2) * 100);

  let key, emoji;
  if (cycle < 0.03 || cycle >= 0.97) {
    key = "new";
    emoji = "🌑";
  } else if (cycle < 0.22) {
    key = "waxingCrescent";
    emoji = "🌒";
  } else if (cycle < 0.28) {
    key = "firstQuarter";
    emoji = "🌓";
  } else if (cycle < 0.47) {
    key = "waxingGibbous";
    emoji = "🌔";
  } else if (cycle < 0.53) {
    key = "full";
    emoji = "🌕";
  } else if (cycle < 0.72) {
    key = "waningGibbous";
    emoji = "🌖";
  } else if (cycle < 0.78) {
    key = "lastQuarter";
    emoji = "🌗";
  } else {
    key = "waningCrescent";
    emoji = "🌘";
  }

  // Mareas vivas: cerca de luna llena o nueva (±2,5 días)
  const distFromNewOrFull = Math.min(cycle, Math.abs(cycle - 0.5), 1 - cycle);
  const isSpringTide = distFromNewOrFull <= 0.08;
  const distFromQuarter = Math.min(Math.abs(cycle - 0.25), Math.abs(cycle - 0.75));
  const isNeapTide = distFromQuarter <= 0.08;
  const tideType = isSpringTide ? "springTide" : isNeapTide ? "neapTide" : "normalTide";

  return { key, emoji, cycle, illumination, isSpringTide, isNeapTide, tideType };
}
