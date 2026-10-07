import { t, lang } from "./i18n.js";
import { SPOTS, spotById } from "./spots.js";
import { getOverview, getSpot, getBuoy } from "./api.js";
import * as alerts from "./alerts.js";
import { rating, RATINGS, cardinal, windType, hhmm, hourOf, km, fmt, dayLabel, moonPhase, sunTimes } from "./surf.js";
import { tideChartHTML, bindTideChart } from "./tidechart.js";

const app = document.getElementById("app");

// ---------- Preferencias del usuario (solo en este dispositivo) ----------
const local = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const favs = new Set(local.get("marea:favs", []));
let filter = local.get("marea:filter", "all");
let query = ""; // búsqueda en la lista; se conserva al volver de un spot
let home = null; // última respuesta de la lista, para filtrar sin volver a pedir datos
let position = null;
let currentSpotData = null;

function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  local.set("marea:favs", [...favs]);
}

// ---------- Piezas de interfaz ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const arrow = (deg) =>
  deg == null
    ? ""
    : `<svg class="arrow" viewBox="0 0 24 24" style="transform:rotate(${deg + 180}deg)" aria-hidden="true"><path d="M12 3l6 9h-4v9h-4v-9H6z"/></svg>`;

const icon = {
  star: (on) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  bell: (on) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  map: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  help: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8v.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" stroke-width="2"/></svg>`,
  video: `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" class="logo-bg"/><path d="M4 19c3-4 6-4 8 0s5 4 8 0 6-4 8 0" fill="none" class="logo-wave" stroke-width="2.6" stroke-linecap="round"/></svg>`,
};

const ratingLabel = (key) => t(`rating.${key}`);
const scoreBar = (s) =>
  `<span class="score" aria-label="${t("score.of", fmt(s))}">${[0, 1, 2, 3, 4].map((i) => `<i style="--f:${Math.max(0, Math.min(1, s - i))}"></i>`).join("")}</span>`;

const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60e3);
  return m < 1 ? t("ago.now") : m < 60 ? t("ago.min", m) : t("ago.h", Math.round(m / 60));
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const windLabel = (wt) => t(`wind.${wt.key === "na" ? "calm" : wt.key}`);
const windPhrase = (wt, kn) =>
  wt.key === "calm" ? t("windPhrase.calm") : t("windPhrase", windLabel(wt).toLowerCase(), fmt(kn, 0));
const tideWord = (e) => t(e.type === "high" ? "tide.high" : "tide.low");
// Cuándo llega la próxima marea favorable para el spot. Lo que cae después de hoy se indica como "mañana".
function idealTideText(pref, ext, now, dayEnd, tz) {
  if (pref === "all") return t("ideal.all");
  const tomorrow = (x) => (x >= dayEnd ? t("ideal.tomorrow") : "");
  if (pref === "mid") {
    const m = ext
      .slice(1)
      .map((e, i) => (ext[i].t + e.t) / 2)
      .find((x) => x > now);
    return m ? t("ideal.mid", tomorrow(m), hhmm(m, tz)) : t("ideal.noData");
  }
  const e = ext.find((x) => x.type === pref && x.t > now);
  return e ? t(pref === "low" ? "ideal.low" : "ideal.high", tomorrow(e.t), hhmm(e.t, tz)) : t("ideal.noData");
}

// Índice UV en la escala de la OMS.
const uvLabel = (uv) => {
  const i = Math.round(uv);
  return t(i < 3 ? "uv.low" : i < 6 ? "uv.moderate" : i < 8 ? "uv.high" : i < 11 ? "uv.veryHigh" : "uv.extreme");
};
const uvAdvice = (uv) => {
  const i = Math.round(uv);
  return t(i < 3 ? "uv.adviceLow" : i < 8 ? "uv.adviceMid" : "uv.adviceHigh");
};
const wetsuit = (c) =>
  c == null ? "" : t(c < 15 ? "wetsuit.54" : c < 17 ? "wetsuit.43" : c < 20 ? "wetsuit.32" : "wetsuit.short");

// Potencia del oleaje en aguas profundas (kW por metro de frente de ola): 0,49 · H² · T.
const power = (h, T) => (h == null || T == null ? null : 0.49 * h * h * T);
const powerLabel = (p) =>
  t(p < 5 ? "energy.low" : p < 15 ? "energy.moderate" : p < 40 ? "energy.strong" : "energy.veryStrong");

// Tendencia de la boya: flecha, palabra y cambio en las últimas horas.
const trendArrow = (k) => ({ up: "↗", down: "↘", steady: "→" })[k] ?? "";
const signed = (x) => {
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt(Math.abs(r))}`;
};

// ---------- Ayuda: qué significa cada dato ----------
const HELP = ["rating", "height", "period", "swell", "wind", "tide", "energy", "buoy"];
const helpBtn = (topic) =>
  `<button type="button" class="help-btn" data-help="${topic}" aria-label="${esc(t("help.button", t(`help.${topic}.title`)))}">${icon.help}</button>`;
function showHelp(topic) {
  let dlg = document.querySelector("dialog.help");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "help";
    document.body.append(dlg);
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
  }
  dlg.innerHTML = `<h3>${esc(t(`help.${topic}.title`))}</h3><p>${esc(t(`help.${topic}.text`))}</p>
    <form method="dialog"><button class="btn">${t("close")}</button></form>`;
  dlg.showModal();
}
const glossary = () => `<section class="panel glossary">
    <h3>${t("help.glossary")}</h3>
    ${HELP.map((k) => `<details><summary>${esc(t(`help.${k}.title`))}</summary><p class="small">${esc(t(`help.${k}.text`))}</p></details>`).join("")}
  </section>`;

const footer = () => `
  <footer class="foot muted">
    <p>${t("footer.sources")}</p>
    <nav class="legal"><a href="/legal/fuentes.html">${t("footer.dataSources")}</a><a href="/legal/privacidad.html">${t("footer.privacy")}</a><a href="/legal/aviso-legal.html">${t("footer.legal")}</a></nav>
  </footer>`;

// Avisos sobre el estado de los datos: guardados (sin conexión o servidor sin datos) y fuente de respaldo.
function dataBanners(res) {
  const out = [];
  if (res.stale)
    out.push(`<p class="banner">${t(navigator.onLine === false ? "banner.offline" : "banner.stale", ago(res.ts))}</p>`);
  if (res.data.forecastSource === "portus") out.push(`<p class="banner">${t("banner.portus")}</p>`);
  return out.join("");
}

function warningBanner(warnings, tz) {
  if (!warnings?.length) return "";
  const lang = t("lang") === "en" ? "en" : "es";
  const list = warnings.slice(0, 3);
  const isMultiple = list.length > 1;

  const top = list[0];
  const topLvl = top.level || "amarillo";
  const topLvlText = t(`warning.level.${topLvl}`) || topLvl;
  const topRisk = t(`warning.risk.${topLvl}`) || "";

  const activeCount = list.filter((w) => w.active).length;
  let stateText;
  if (isMultiple) {
    stateText = activeCount > 0 ? t("warning.activeCount", activeCount) : t("warning.totalCount", list.length);
  } else {
    stateText = t(top.active ? "warning.activeNow" : "warning.upcoming");
  }

  const zone = top.zone || "";
  const headline = isMultiple
    ? t("warning.aemetPlural")
    : `${t("warning.aemet")}: ${t(`warning.phenomenon.${top.phenomenon}`) || top.phenomenon} (${topLvlText.toUpperCase()})`;

  const itemsHtml = list
    .map((w) => {
      const lvl = w.level || "amarillo";
      const lvlText = t(`warning.level.${lvl}`) || lvl;
      const phenom = t(`warning.phenomenon.${w.phenomenon}`) || w.phenomenon;
      const desc =
        (lang === "en" ? w.details?.en?.description : w.details?.es?.description) ||
        w.details?.es?.description ||
        w.desc ||
        "";
      const timeStr =
        w.start && w.end
          ? t(
              "warning.window",
              `${new Date(w.start).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
              `${new Date(w.end).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
            )
          : "";

      return `
      <div class="wb-item">
        <div class="wb-item-header">
          <span class="wb-item-chip chip-${lvl}">
            <span class="wb-item-dot" aria-hidden="true"></span>
            ${esc(phenom)} (${esc(lvlText.charAt(0).toUpperCase() + lvlText.slice(1))})
          </span>
          ${timeStr ? `<span class="wb-time"><span class="wb-clock" aria-hidden="true">🕒</span> ${esc(timeStr)}</span>` : ""}
        </div>
        ${desc ? `<p class="wb-desc">${esc(desc)}</p>` : ""}
      </div>`;
    })
    .join("");

  const topInstruction =
    (lang === "en" ? top.details?.en?.instruction : top.details?.es?.instruction) || top.details?.es?.instruction || "";

  return `
  <aside class="warning-banner banner-${topLvl}" role="alert">
    <div class="wb-header">
      <div class="wb-icon" aria-hidden="true">⚠️</div>
      <div class="wb-title-group">
        <div class="wb-meta">
          <span class="wb-pill pill-${topLvl}">${esc(topLvlText)} · ${esc(topRisk)}</span>
          <span class="wb-state">${esc(stateText)}</span>
          ${zone ? `<span class="wb-zone">${esc(zone)}</span>` : ""}
        </div>
        <h3 class="wb-headline">${esc(headline)}</h3>
      </div>
    </div>
    <div class="wb-items">
      ${itemsHtml}
    </div>
    <p class="wb-notice">${esc(t("warning.unfavorable"))}</p>
    ${topInstruction ? `<p class="wb-instruction small muted"><span class="eyebrow">${esc(t("warning.instruction"))}:</span> ${esc(topInstruction)}</p>` : ""}
  </aside>`;
}

function warningBadge(w) {
  if (!w) return "";
  const lvl = w.level || "amarillo";
  const lvlText = t(`warning.level.${lvl}`) || lvl;
  const phenom = t(`warning.phenomenon.${w.phenomenon}`) || w.phenomenon;
  return `<span class="badge-warning badge-${lvl}" title="${esc(w.desc || w.phenomenon)}"><span class="badge-dot" aria-hidden="true"></span><span class="badge-text">${esc(t("warning.badge", lvlText))}: ${esc(phenom)}</span></span>`;
}

const skeletonCards = (n = 4) =>
  Array.from({ length: n }, () => `<div class="card skeleton" aria-hidden="true"></div>`).join("");
const errorBox = (msg) =>
  `<div class="empty"><p>${t("error.title")}</p><p class="muted small">${esc(t("error.hint", msg))}</p></div>`;

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

// ---------- Lista de spots ----------
// Línea de la boya en cada tarjeta. Se pide solo cuando la tarjeta aparece en pantalla
// y como mucho 3 a la vez, para no lanzar todas las peticiones de golpe.
function buoyLineHTML(b, tz) {
  if (!b) return `<span class="muted">${t("buoyline.none")}</span>`;
  const off = b.buoy.fallback;
  return `<span class="dot-live${off ? " off" : ""}" aria-hidden="true"></span>${off ? `<span class="sr-only">${t("buoyline.notClosest")} </span>` : ""}${esc(t("buoyline.name", b.buoy.name))}${off ? esc(t("buoyline.away", b.buoy.distKm)) : ""}: <b>${fmt(b.h)} m</b>${b.Tp != null ? ` · ${fmt(b.Tp, 0)} s` : ""}${b.dir != null ? ` ${cardinal(b.dir)}` : ""}${b.trend ? ` · <span class="trend trend-${b.trend.key}">${trendArrow(b.trend.key)} ${t(`trend.${b.trend.key}`)}</span>` : ""}${b.predicted ? ` <span class="muted">· ${t("buoyline.pred", fmt(b.predicted.h))}</span>` : ""} <span class="muted">· ${hhmm(b.t, tz)}</span>`;
}

let buoyObserver = null;
const buoyQueue = [];
let buoyActive = 0;
function pumpBuoys() {
  while (buoyActive < 3 && buoyQueue.length) {
    const { el, id, tz } = buoyQueue.shift();
    buoyActive++;
    getBuoy(id)
      .then((res) => {
        el.innerHTML = buoyLineHTML(res.data.buoy, tz);
      })
      .catch(() => {
        el.innerHTML = `<span class="muted">${t("buoyline.failed")}</span>`;
      })
      .finally(() => {
        buoyActive--;
        pumpBuoys();
      });
  }
}
function watchBuoyLines(rows) {
  buoyObserver?.disconnect();
  buoyQueue.length = 0;
  const tzOf = Object.fromEntries(rows.map((r) => [r.s.id, r.s.tz]));
  const load = (el) => {
    buoyQueue.push({ el, id: el.dataset.buoy, tz: tzOf[el.dataset.buoy] });
    pumpBuoys();
  };
  const lines = app.querySelectorAll("[data-buoy]");
  if (!("IntersectionObserver" in window)) {
    lines.forEach(load);
    return;
  }
  buoyObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          buoyObserver.unobserve(e.target);
          load(e.target);
        }
    },
    { rootMargin: "200px 0px" },
  );
  lines.forEach((el) => buoyObserver.observe(el));
}

function card(s, dist) {
  const r = rating(s.score),
    n = s.now,
    tide = s.tide,
    w = s.warning;
  return `
  <article class="card">
    <a class="card-link" href="#/spot/${s.id}" aria-label="${esc(t("card.open", s.name))}"></a>
    <header>
      <div>
        <h2>${esc(s.name)}</h2>
        <p class="sub">${esc(s.region)}${dist != null ? ` · ${Math.round(dist)} km` : ""}</p>
      </div>
      <button class="fav ${favs.has(s.id) ? "on" : ""}" data-fav="${s.id}" aria-pressed="${favs.has(s.id)}" aria-label="${t("favorite")}">${icon.star(favs.has(s.id))}</button>
    </header>
    ${warningBadge(w)}
    <div class="rating r-${r.key}"><span class="chip">${ratingLabel(r.key)}</span>${scoreBar(s.score)}</div>
    <dl class="metrics">
      <div><dt>${t("metric.wave")}</dt><dd><b>${fmt(n.h)}</b> m</dd></div>
      <div><dt>${t("metric.period")}</dt><dd><b>${fmt(n.T, 0)}</b> s ${arrow(n.dir)}</dd></div>
      <div><dt>${t("metric.wind")}</dt><dd><b>${fmt(n.wind, 0)}</b> kn <span class="wt wt-${n.windType.key}">${windLabel(n.windType)}</span></dd></div>
      <div><dt>${t("metric.tide")}</dt><dd>${tide.rising == null ? "–" : t(tide.rising ? "tide.rising" : "tide.falling")}${tide.next ? `<span class="muted small next">${tideWord(tide.next)} ${hhmm(tide.next.t, s.tz)}</span>` : ""}</dd></div>
    </dl>
    <p class="buoy-line small" data-buoy="${s.id}"><span class="muted">${t("buoyline.loading")}</span></p>
  </article>`;
}

function homeShell() {
  const st = alerts.getState();
  return `
  <header class="topbar">
    <div class="brand">${icon.logo}<span>Marea</span></div>
    <div class="top-actions">
      <span class="updated muted">${t("loading")}</span>
      <a class="icon-btn" href="#/mapa" aria-label="${t("map.title")}">${icon.map}</a>
      <a class="icon-btn ${st.spots.length ? "on" : ""}" href="#/avisos" aria-label="${t("alerts")}">${icon.bell(st.spots.length > 0)}</a>
      <button class="icon-btn" id="refresh" aria-label="${t("refresh")}">${icon.refresh}</button>
    </div>
  </header>
  <div class="seg" role="tablist" aria-label="${t("filter.label")}">
    ${["all", "fav", "near"].map((k) => `<button role="tab" aria-selected="${filter === k}" data-filter="${k}">${t(`filter.${k}`)}</button>`).join("")}
  </div>
  <div class="search" role="search">
    ${icon.search}
    <input id="spot-search" type="search" placeholder="${t("search.placeholder")}" aria-label="${t("search.placeholder")}"
      autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(query)}">
    <button type="button" class="search-clear" aria-label="${t("search.clear")}" ${query ? "" : "hidden"}>×</button>
  </div>
  <main><div class="list">${skeletonCards()}</div></main>
  ${footer()}`;
}

// Búsqueda sin distinguir mayúsculas ni tildes ("cicer" encuentra "La Cícer"); cada palabra debe aparecer.
const normalize = (str) =>
  str
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const matches = (s, q) => {
  const hay = normalize(`${s.name} ${s.region}`);
  return normalize(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};

function drawList() {
  if (!home) return;
  const { res, rows } = home;
  const q = query.trim();
  let shown = filter === "fav" ? rows.filter((r) => favs.has(r.s.id)) : rows;
  if (q) shown = shown.filter((r) => matches(r.s, q));
  shown =
    filter === "near" && position
      ? [...shown].sort((a, b) => a.dist - b.dist)
      : [...shown].sort((a, b) => b.s.score - a.s.score);

  let empty = `<div class="empty"><p>${t("empty.favs")}</p><p class="muted small">${t("empty.favsHint")}</p></div>`;
  if (q) {
    const elsewhere = filter === "fav" ? rows.filter((r) => matches(r.s, q)).length : 0;
    empty = `<div class="empty"><p>${esc(t("empty.noMatch", q))}</p>
      ${
        elsewhere
          ? `<p><button class="btn ghost" type="button" data-search-all>${t(elsewhere === 1 ? "empty.seeAll.one" : "empty.seeAll.other", elsewhere)}</button></p>`
          : `<p class="muted small">${t("empty.hint")}</p>`
      }</div>`;
  }

  const best = rows.reduce((a, b) => (b.s.score > a.s.score ? b : a)).s;
  app.querySelector(".list").innerHTML =
    dataBanners(res) +
    (filter === "all" && !q
      ? `<p class="lede">${t("list.bestPrefix")}<a href="#/spot/${best.id}">${esc(best.name)}</a>${t("list.bestSuffix", fmt(best.now.h), fmt(best.now.T, 0), windPhrase(best.now.windType, best.now.wind))}</p>`
      : "") +
    (q && shown.length
      ? `<p class="lede">${esc(t(shown.length === 1 ? "list.results.one" : "list.results.other", shown.length, q))}</p>`
      : "") +
    (filter === "near" && !position ? `<p class="banner">${t("list.locationNeeded")}</p>` : "") +
    (shown.length ? shown.map((r) => card(r.s, r.dist)).join("") : empty);
  watchBuoyLines(rows);
  app.querySelector("[data-search-all]")?.addEventListener("click", () => {
    filter = "all";
    local.set("marea:filter", filter);
    renderHome();
  });
  return shown;
}

function bindSearch() {
  const input = app.querySelector("#spot-search");
  const clear = app.querySelector(".search-clear");
  input.addEventListener("input", () => {
    query = input.value;
    clear.hidden = !query;
    drawList();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
    if (e.key === "Enter") {
      // Con un único resultado, Enter abre directamente ese spot.
      const only = app.querySelectorAll(".card-link");
      if (only.length === 1) location.hash = only[0].getAttribute("href");
      input.blur();
    }
  });
  clear.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
    input.focus();
  });
}

async function renderHome(force = false) {
  document.title = "Marea";
  app.innerHTML = homeShell();
  app.querySelector("#refresh").onclick = (e) => {
    e.currentTarget.classList.add("spin");
    renderHome(true);
  };
  app.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        local.set("marea:filter", filter);
        if (filter === "near" && !position) locate().then(() => renderHome());
        else renderHome();
      }),
  );

  bindSearch();

  let res;
  try {
    res = await getOverview(force);
  } catch (err) {
    app.querySelector(".list").innerHTML = errorBox(err.message);
    return;
  }

  home = { res, rows: res.data.spots.map((s) => ({ s, dist: position ? km(position, s) : null })) };
  app.querySelector(".updated").textContent = capitalize(ago(res.data.updatedAt));
  drawList();
}

function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        position = { lat: p.coords.latitude, lon: p.coords.longitude };
        resolve();
      },
      () => resolve(),
      { timeout: 8000, maximumAge: 600e3 },
    );
  });
}

// ---------- Mapa de spots ----------
// MapLibre (public/vendor/maplibre) con el mapa de OpenFreeMap: libre, sin claves ni límites y con uso
// comercial permitido (las teselas de openstreetmap.org no admiten apps con tráfico). Se carga al usarlo.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
let maplibre = null;
function loadMapLibre() {
  if (!maplibre) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/vendor/maplibre/maplibre-gl.css";
    document.head.append(css);
    maplibre = import("/vendor/maplibre/maplibre-gl.mjs").catch((err) => {
      maplibre = null;
      throw new Error(t("error.connect"), { cause: err });
    });
  }
  return maplibre;
}
const qColor = (key) => getComputedStyle(document.documentElement).getPropertyValue(`--q-${key}`).trim();

async function renderMap() {
  document.title = `${t("map.title")} · Marea`;
  app.innerHTML = `
  <header class="topbar detail-bar">
    <a class="icon-btn" href="#/" aria-label="${t("back")}">${icon.back}</a>
    <div class="title"><h1>${t("map.title")}</h1><p class="sub">${t("map.hint")}</p></div>
  </header>
  <main id="map-view"><div class="spots-map" id="spots-map"></div>
    <div class="legend small">${RATINGS.map((x) => `<span><i class="q q-${x.key}"></i>${ratingLabel(x.key)}</span>`).join("")}</div>
  </main>`;
  let res, ml;
  try {
    [res, ml] = await Promise.all([getOverview(false), loadMapLibre()]);
  } catch (err) {
    app.querySelector("#map-view").innerHTML = errorBox(err.message);
    return;
  }
  const el = app.querySelector("#spots-map");
  if (!el) return; // se ha cambiado de pantalla mientras cargaba
  const spots = res.data.spots;
  // Se abre sobre la Península y Baleares; Canarias queda a un desplazamiento.
  const main = spots.filter((s) => s.lat > 34);
  const box = (main.length ? main : spots).reduce(
    (b, s) => [Math.min(b[0], s.lon), Math.min(b[1], s.lat), Math.max(b[2], s.lon), Math.max(b[3], s.lat)],
    [180, 90, -180, -90],
  );
  const map = new ml.Map({
    container: el,
    style: MAP_STYLE,
    bounds: box,
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: true },
  });
  map.addControl(new ml.NavigationControl({ showCompass: false }));
  const features = [...spots]
    .sort((a, b) => a.score - b.score) // los mejores, encima
    .map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { id: s.id, q: rating(s.score).key },
    }));
  map.on("load", () => {
    map.addSource("spots", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({
      id: "spots",
      type: "circle",
      source: "spots",
      paint: {
        "circle-radius": 8,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-color": ["match", ["get", "q"], ...RATINGS.flatMap((r) => [r.key, qColor(r.key)]), "#888888"],
      },
    });
  });
  map.on("mouseenter", "spots", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "spots", () => (map.getCanvas().style.cursor = ""));
  map.on("click", "spots", (e) => {
    const s = spots.find((x) => x.id === e.features[0].properties.id);
    if (!s) return;
    const r = rating(s.score);
    new ml.Popup({ offset: 12 })
      .setLngLat([s.lon, s.lat])
      .setHTML(
        `<b>${esc(s.name)}</b><br>${esc(ratingLabel(r.key))} · ${fmt(s.now.h)} m · ${fmt(s.now.T, 0)} s<br><a href="#/spot/${s.id}">${esc(t("card.open", s.name))}</a>`,
      )
      .addTo(map);
  });
}

// Mapa pequeño de la ubicación (sin interacción: un toque abre la ruta). Se crea al verse en pantalla.
function bindLocationMap(s) {
  const el = app.querySelector(".location .map");
  if (!el) return;
  const create = async () => {
    try {
      const ml = await loadMapLibre();
      if (!el.isConnected) return;
      new ml.Map({
        container: el,
        style: MAP_STYLE,
        center: [s.lon, s.lat],
        zoom: 13.5,
        interactive: false,
        attributionControl: { compact: true },
      }).on("load", function () {
        new ml.Marker({ color: qColor("epic") }).setLngLat([s.lon, s.lat]).addTo(this);
      });
    } catch {
      el.classList.add("map-off");
    }
  };
  if (!("IntersectionObserver" in window)) return create();
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        create();
      }
    },
    { rootMargin: "300px 0px" },
  );
  io.observe(el);
}

// ---------- Detalle de un spot ----------
const tile = (label, value, sub, help) =>
  `<div class="tile"><span class="eyebrow tile-label">${label}${help ? helpBtn(help) : ""}</span><strong>${value}</strong><span class="muted small">${sub}</span></div>`;

function hourCell(h, tz) {
  const r = rating(h.score);
  return `<div class="hour">
    <span class="muted small">${hhmm(h.t, tz).slice(0, 2)}h</span>
    <i class="q q-${r.key}" title="${ratingLabel(r.key)}"></i>
    <b>${fmt(h.h)}</b>
    <span class="small">${fmt(h.T, 0)} s</span>
    <span class="small wind">${arrow(h.windDir)}${fmt(h.wind, 0)}</span>
  </div>`;
}

// Todas las filas comparten las mismas columnas horarias (la misma hora queda en la misma columna cada día),
// con las horas encima y cabeceras para la ola máxima y la mejor hora. Las horas ya pasadas de hoy, atenuadas.
function weekRows(days, tz, todayFrom) {
  const hours = days.flatMap((d) => d.cells.map((c) => hourOf(c.t, tz)));
  const cols = hours.length
    ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i)
    : [];
  const now = Date.now();
  const head = `<div class="day week-head" aria-hidden="true"><span></span>
      <span class="cells">${cols.map((h) => `<span>${(h - cols[0]) % 2 === 0 ? `${String(h).padStart(2, "0")}h` : ""}</span>`).join("")}</span>
      <span>${t("week.max")}</span><span>${t("week.best")}</span></div>`;
  return (
    head +
    days
      .map((d, i) => {
        const today = i === 0 && d.rise < todayFrom + 86400e3;
        return `<div class="day">
      <span class="dname">${today ? t("today") : esc(dayLabel(d.rise, tz))}</span>
      <span class="cells">${cols
        .map((h) => {
          const c = d.cells.find((x) => hourOf(x.t, tz) === h);
          return c
            ? `<i class="q q-${rating(c.score).key}${today && c.t + 3600e3 <= now ? " past" : ""}" title="${hhmm(c.t, tz)} · ${ratingLabel(rating(c.score).key)}"></i>`
            : `<i class="q-none"></i>`;
        })
        .join("")}</span>
      <span class="small"><b>${fmt(d.maxH)} m</b></span>
      <span class="small muted">${d.best.score >= 1 ? hhmm(d.best.t, tz).slice(0, 2) + "h" : "–"}</span>
    </div>`;
      })
      .join("")
  );
}

// Dónde está la playa: mapa (OpenFreeMap) y coordenadas.
const coords = (lat, lon) =>
  `${fmt(Math.abs(lat), 4)}° ${lat >= 0 ? "N" : "S"} · ${fmt(Math.abs(lon), 4)}° ${lon >= 0 ? "E" : lang === "en" ? "W" : "O"}`;
function locationPanel(s) {
  // Ruta hasta la playa (abre Google Maps o su app en el móvil).
  const link = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
  return `<section class="panel location">
    <h3>${t("loc.title")}</h3>
    <a class="map" href="${link}" target="_blank" rel="noopener" aria-label="${esc(t("loc.map", s.name))}. ${esc(t("loc.hint"))}"></a>
    <div class="location-row"><span class="coords">${coords(s.lat, s.lon)}</span><a href="${link}" target="_blank" rel="noopener">${t("loc.directions")}</a></div>
  </section>`;
}

// Horas de luz de hoy: barra de 0 a 24 h con la noche, el día entre el amanecer y el atardecer y la hora actual.
const lightLength = (ms) => {
  const m = Math.round(ms / 60e3);
  return t("duration.hm", Math.floor(m / 60), String(m % 60).padStart(2, "0"));
};
function daylight(sun, from, to, now, tz) {
  const W = 320,
    H = 34,
    BAR = 12,
    Y = 4;
  const x = (tm) => Math.max(0, Math.min(W, ((tm - from) / (to - from)) * W));
  const len = lightLength(sun.set - sun.rise);
  const inDay = now >= from && now < to;
  return `<div class="daylight">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("sun.aria", hhmm(sun.rise, tz), hhmm(sun.set, tz), len))}">
      <rect class="night" x="0" y="${Y}" width="${W}" height="${BAR}" rx="6"/>
      ${sun.dawn && sun.dusk ? `<rect class="twilight" x="${x(sun.dawn)}" y="${Y}" width="${Math.max(0, x(sun.dusk) - x(sun.dawn))}" height="${BAR}"/>` : ""}
      <rect class="day" x="${x(sun.rise)}" y="${Y}" width="${x(sun.set) - x(sun.rise)}" height="${BAR}"/>
      <line class="edge" x1="${x(sun.rise)}" x2="${x(sun.rise)}" y1="${Y - 2}" y2="${Y + BAR + 2}"/>
      <line class="edge" x1="${x(sun.set)}" x2="${x(sun.set)}" y1="${Y - 2}" y2="${Y + BAR + 2}"/>
      ${inDay ? `<circle class="now-dot" cx="${x(now)}" cy="${Y + BAR / 2}" r="4.5"/>` : ""}
      ${[0, 6, 12, 18, 24].map((h) => `<text class="axis" x="${(h / 24) * W}" y="${H - 2}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${String(h).padStart(2, "0")}h</text>`).join("")}
    </svg>
    <div class="daylight-row">
      <span class="sun-time"><b>${hhmm(sun.rise, tz)}</b><span class="muted">${t("sun.rise")}</span>${sun.dawn ? `<span class="sun-twilight">${t("sun.dawn")}: ${hhmm(sun.dawn, tz)}</span>` : ""}</span>
      <span class="len">${t("sun.daylight", len)}</span>
      <span class="sun-time end"><b>${hhmm(sun.set, tz)}</b><span class="muted">${t("sun.set")}</span>${sun.dusk ? `<span class="sun-twilight">${t("sun.dusk")}: ${hhmm(sun.dusk, tz)}</span>` : ""}</span>
    </div>
  </div>`;
}

// Medido frente a lo previsto por el modelo de Puertos del Estado en la misma posición de la boya.
function buoyForecastBlock(b) {
  if (!b.predicted) return `<p class="muted small">${t("buoy.noPred")}</p>`;
  const diff = b.h - b.predicted.h;
  const verdict =
    Math.abs(diff) < 0.2
      ? t("buoy.same", fmt(b.predicted.h))
      : t(diff > 0 ? "buoy.more" : "buoy.less", fmt(Math.abs(diff)), fmt(b.predicted.h));
  return `<p class="small buoy-pred"><b>${verdict}</b></p>`;
}

function buoyPanel(b, s) {
  const m = s.meteo;
  if (!b && !m)
    return `<section class="panel"><h3>${t("buoy.title")}</h3><p class="muted small">${t("buoy.none")}</p></section>`;
  const latest = Math.max(b?.t ?? 0, m?.wind?.t ?? 0, m?.air?.t ?? 0, m?.pressure?.t ?? 0);
  const sources = [
    b && t("buoy.src.buoy", esc(b.buoy.name), b.buoy.distKm),
    m?.wind && t("buoy.src.wind", esc(m.wind.station.name), m.wind.station.distKm),
    !m?.wind &&
      (m?.air || m?.pressure) &&
      t("buoy.src.station", esc((m.air ?? m.pressure).station.name), (m.air ?? m.pressure).station.distKm),
  ].filter(Boolean);
  return `<section class="panel buoy">
    <div class="panel-head"><h3 class="with-help">${t("buoy.title")}${helpBtn("buoy")}</h3><span class="live"><span class="dot-live${b?.buoy.fallback ? " off" : ""}" aria-hidden="true"></span>${hhmm(latest, s.tz)}</span></div>
    <div class="buoy-grid">
      ${
        b
          ? `<div><span class="eyebrow">${t("buoy.wave")}</span><strong>${fmt(b.h)} m</strong></div>
      <div><span class="eyebrow">${t("buoy.peak")}</span><strong>${fmt(b.Tp, 0)} s</strong></div>
      <div><span class="eyebrow">${t("buoy.dir")}</span>${b.dir != null ? `<strong>${arrow(b.dir)} ${cardinal(b.dir)}</strong>` : `<strong title="${t("buoy.noDir")}">-</strong>`}</div>`
          : ""
      }
      ${b?.trend ? `<div><span class="eyebrow">${t("buoy.trend")}</span><strong class="trend trend-${b.trend.key}">${trendArrow(b.trend.key)} ${t(`trend.${b.trend.key}`)}</strong><span class="muted small">${t("trend.detail", signed(b.trend.delta), b.trend.hours)}</span></div>` : ""}
      ${b?.water != null ? `<div><span class="eyebrow">${t("buoy.water")}</span><strong>${fmt(b.water)} °C</strong></div>` : ""}
      ${m?.wind ? `<div><span class="eyebrow">${t("buoy.wind")}</span><strong>${fmt(m.wind.wind, 0)} kn ${arrow(m.wind.windDir)}</strong>${m.wind.gust != null ? `<span class="muted small">${t("gusts", fmt(m.wind.gust, 0))}</span>` : ""}</div>` : ""}
      ${m?.air ? `<div><span class="eyebrow">${t("buoy.air")}</span><strong>${fmt(m.air.air)} °C</strong></div>` : ""}
      ${m?.pressure ? `<div><span class="eyebrow">${t("buoy.pressure")}</span><strong>${fmt(m.pressure.pressure, 0)} hPa</strong></div>` : ""}
    </div>
    ${
      b?.buoy.far
        ? `<p class="small far-note"><span class="dot-live off" aria-hidden="true"></span>${t("buoy.far", b.buoy.distKm)}</p>`
        : b?.buoy.fallback
          ? `<p class="small far-note"><span class="dot-live off" aria-hidden="true"></span>${b.buoy.closest ? esc(t("buoy.closestDown", b.buoy.closest.name, b.buoy.closest.distKm)) : t("buoy.closestDownAnon")}${esc(t("buoy.next", b.buoy.name, b.buoy.distKm))}</p>`
          : ""
    }
    <p class="muted small">${t("buoy.sources", sources.join(", "))}${b?.buoy.deep && !b.buoy.far ? t("buoy.deep") : ""}</p>
    ${b ? buoyForecastBlock(b) : ""}
  </section>`;
}

// Últimas 48 h medidas por la boya frente a la previsión en su posición (de −48 h a +24 h).
function fitText(fit) {
  if (!fit) return "";
  if (fit.bias >= 0.15) return t("hist.fitLow", fmt(fit.bias));
  if (fit.bias <= -0.15) return t("hist.fitHigh", fmt(-fit.bias));
  return t(fit.mae < 0.25 ? "hist.fitGood" : "hist.fitMixed", fmt(fit.mae));
}
function historyPanel(b) {
  const hist = b?.history ?? [],
    model = b?.model ?? [];
  if (hist.length < 6 && !model.length) return "";
  const W = 340,
    H = 150,
    L = 30,
    R = 6,
    TOP = 10,
    BOTTOM = 24;
  const now = Date.now(),
    from = now - 48 * 3600e3,
    to = now + 24 * 3600e3;
  const vals = [...hist, ...model].map((p) => p[1]);
  const max = Math.max(1, Math.ceil(Math.max(...vals) * 1.15 * 2) / 2);
  const x = (tm) => L + ((tm - from) / (to - from)) * (W - L - R);
  const y = (v) => TOP + (1 - v / max) * (H - TOP - BOTTOM);
  const line = (pts) =>
    pts
      .filter(([tm]) => tm >= from && tm <= to)
      .map(([tm, v], i) => `${i ? "L" : "M"}${x(tm).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  const step = max > 4 ? 2 : max > 2 ? 1 : 0.5;
  const grid = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const ticks = [
    [from, "−48 h"],
    [now - 24 * 3600e3, "−24 h"],
    [now, t("hist.now")],
    [to, "+24 h"],
  ];
  return `<section class="panel history">
    <h3>${t("hist.title")}</h3>
    <svg class="hist-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("hist.aria")}">
      ${grid.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${fmt(v, step < 1 ? 1 : 0)}</text>`).join("")}
      <line class="now" x1="${x(now)}" x2="${x(now)}" y1="${TOP}" y2="${H - BOTTOM}"/>
      ${model.length ? `<path class="model" d="${line(model)}"/>` : ""}
      ${hist.length ? `<path class="measured" d="${line(hist)}"/>${hist.map(([tm, v]) => `<circle class="measured-dot" cx="${x(tm).toFixed(1)}" cy="${y(v).toFixed(1)}" r="1.8"/>`).join("")}` : ""}
      ${ticks.map(([tm, label], i) => `<text class="axis" x="${x(tm)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}">${label}</text>`).join("")}
    </svg>
    <div class="chart-legend small muted">
      <span><i class="sw sw-buoy"></i>${t("hist.measured")}</span>
      <span><i class="sw sw-pred"></i>${t("hist.forecast")}</span>
    </div>
    ${b.fit ? `<p class="small"><b>${fitText(b.fit)}</b></p>` : ""}
    <p class="muted small">${esc(t("hist.place", b.buoy.name))}</p>
  </section>`;
}

function alertButton(id) {
  if (!alerts.supported()) return "";
  const on = alerts.getState().spots.includes(id);
  return `<button class="alert-btn ${on ? "on" : ""}" data-alert="${id}" aria-pressed="${on}">${icon.bell(on)}<span>${t(on ? "alert.on" : "alert.off")}</span></button>`;
}

function webcamButton(spot) {
  if (!spot?.webcam) return "";
  return `<a class="webcam-btn" href="${esc(spot.webcam)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t("detail.webcamAria", spot.name))}">${icon.video}<span>${t("detail.webcam")}</span></a>`;
}

const tideNote = (s) => {
  const tide = s.tide;
  if (tide.reason === "no-port") return t("tide.note.noPort");
  if (tide.source !== "ihm") return t("tide.note.down");
  const o = s.tideDay.observed;
  return esc(
    t("tide.note.ihm", tide.port.name, tide.port.distKm) +
      (s.tideDay.surge ? t("tide.note.surge", s.tideDay.surge.beach) : "") +
      (o ? t("tide.note.gauge", o.gauge) + (o.samePort ? "" : t("tide.note.neighbour", o.distKm)) + "." : "") +
      t("tide.note.coef"),
  );
};

function bestSession(s, now, sun, meta) {
  if (!s.days?.length) return null;
  // Si ya es después de la puesta de sol, la mejor ventana de mañana.
  if (sun?.set && now > sun.set && s.days[1]?.best) {
    return { ...s.days[1].best, isTomorrow: true };
  }
  const todayBest = s.days[0]?.best;
  // Si la mejor hora de hoy aún está por delante o es ahora mismo (con 45 min de margen):
  if (todayBest && todayBest.t >= now - 45 * 60e3) {
    return { ...todayBest, isTomorrow: false };
  }
  // Si la mejor hora de hoy ya pasó pero aún queda luz, buscar la mejor entre las horas restantes de hoy:
  const remaining = s.hours?.filter((h) => h.t >= now - 30 * 60e3 && (!sun?.set || h.t <= sun.set)) ?? [];
  if (remaining.length) {
    const bestRem = remaining.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      t: bestRem.t,
      score: bestRem.score,
      h: bestRem.h,
      T: bestRem.T,
      wind: bestRem.wind,
      windType: windType(bestRem.wind, bestRem.windDir, meta.facing).key,
      isTomorrow: false,
    };
  }
  // Si no quedan horas de luz hoy, la mejor de mañana:
  if (s.days[1]?.best) {
    return { ...s.days[1].best, isTomorrow: true };
  }
  return todayBest ? { ...todayBest, isTomorrow: false } : null;
}

async function renderSpot(id, force = false) {
  const meta = spotById[id];
  if (!meta) {
    location.hash = "#/";
    return;
  }
  document.title = `${meta.name} · Marea`;
  app.innerHTML = `
  <header class="topbar detail-bar">
    <a class="icon-btn" href="#/" aria-label="${t("back")}">${icon.back}</a>
    <div class="title"><h1>${esc(meta.name)}</h1><p class="sub">${esc(t("detail.facing", meta.region, cardinal(meta.facing)))}</p></div>
    <div class="detail-actions">
      <button class="icon-btn share-btn" data-share="${id}" aria-label="${t("detail.share")}">${icon.share}</button>
      <button class="fav ${favs.has(id) ? "on" : ""}" data-fav="${id}" aria-pressed="${favs.has(id)}" aria-label="${t("favorite")}">${icon.star(favs.has(id))}</button>
    </div>
  </header>
  <main id="detail">${skeletonCards(2)}</main>`;

  let res;
  try {
    res = await getSpot(id, force);
  } catch (err) {
    app.querySelector("#detail").innerHTML = errorBox(err.message);
    return;
  }
  const s = res.data,
    tz = s.tz,
    now = Date.now(),
    n = s.now,
    r = rating(s.score),
    tide = s.tide;
  const water = s.buoy?.water ?? n.water;
  const p = power(n.h, n.T);
  const st = sunTimes(now, meta.lat, meta.lon);
  const sun = s.sun ? { ...s.sun, dawn: s.sun.dawn ?? st?.dawn, dusk: s.sun.dusk ?? st?.dusk } : st;
  const moon = moonPhase(now);
  const bs = bestSession(s, now, sun, meta);
  currentSpotData = { meta, s, n, r, tide };

  app.querySelector("#detail").innerHTML = `
    ${dataBanners(res)}
    ${warningBanner(s.warnings, tz)}
    <section class="hero r-${r.key}">
      <p class="eyebrow">${t("hero.now", hhmm(now, tz))}</p>
      <div class="hero-row">
        <div><p class="hero-label">${ratingLabel(r.key)}${helpBtn("rating")}</p>${scoreBar(s.score)}</div>
        <p class="hero-wave"><b>${fmt(n.h)}</b><span>m</span></p>
      </div>
      <p class="hero-line">${t("hero.line", fmt(n.T, 0), cardinal(n.dir), windPhrase(n.windType, n.wind))}</p>
    </section>

    <div class="spot-actions">
      ${alertButton(id)}
      ${webcamButton(meta)}
    </div>
    ${buoyPanel(s.buoy, s)}
    ${historyPanel(s.buoy)}

    <section class="tiles">
      ${tile(t("tile.swell"), `${fmt(n.sh)} m · ${fmt(n.sT, 0)} s`, `${arrow(n.sDir)} ${cardinal(n.sDir)}`, "swell")}
      ${tile(t("tile.wind"), `${fmt(n.wind, 0)} kn ${arrow(n.windDir)}`, `${n.gust != null ? `${t("gusts", fmt(n.gust, 0))} · ` : ""}${cardinal(n.windDir)}`, "wind")}
      ${tile(t("tile.tide"), tide.h != null ? `${fmt(tide.h)} m ${tide.rising ? "↗" : "↘"}` : "–", `${tide.next ? `${tideWord(tide.next)} ${hhmm(tide.next.t, tz)}` : ""}${tide.coef != null ? ` · ${t("coef", tide.coef)}` : ""}`, "tide")}
      ${tile(t("tile.idealTide"), t(`tidePref.${s.tidePref}`), idealTideText(s.tidePref, s.tideDay.ext, now, s.tideDay.to, tz))}
      ${tile(t("tile.energy"), p == null ? "–" : `${fmt(p, p < 10 ? 1 : 0)} kW/m`, p == null ? "" : powerLabel(p), "energy")}
      ${tile(t("tile.moon"), `${moon.emoji} ${t(`moon.${moon.key}`)}`, `${moon.illumination}% · ${t(`moon.${moon.tideType}`)}`)}
      ${tile(t("tile.water"), `${fmt(water)} °C`, wetsuit(water))}
      ${tile(t("tile.air"), `${fmt(s.meteo?.air?.air ?? n.air, 0)} °C`, t(s.meteo?.air ? "air.measured" : "air.forecast"))}
      ${tile(
        t("tile.uv"),
        s.uv?.now != null ? `${Math.round(s.uv.now)} · ${uvLabel(s.uv.now)}` : "–",
        s.uv ? t("uv.max", Math.round(s.uv.max), hhmm(s.uv.maxT, tz).slice(0, 2), uvAdvice(s.uv.max)) : t("uv.none"),
      )}
      ${tile(
        t("tile.bestSession"),
        bs
          ? `${bs.isTomorrow ? `${t("tomorrow")} ` : ""}${hhmm(bs.t, tz)} · ${ratingLabel(rating(bs.score).key)}`
          : "–",
        bs ? `${fmt(bs.h)} m · ${fmt(bs.T, 0)} s · ${windPhrase({ key: bs.windType }, bs.wind)}` : "",
      )}
      <div class="tile tile-wide"><span class="eyebrow">${t("tile.firstLight")}</span>${sun ? daylight(sun, s.tideDay.from, s.tideDay.to, now, tz) : "<strong>–</strong>"}</div>
    </section>

    <section class="panel tide-panel">
      <div class="panel-head"><h3>${t("tide.today")}</h3><span class="muted small hint">${t("tide.slide")}</span></div>
      ${tideChartHTML(s.tideDay, sun, tz)}
      <p class="muted small">${tideNote(s)}</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>${t("hours.title")}</h3>
        <div class="scroll-btns">
          <button type="button" data-scroll="-1" aria-label="${t("hours.prev")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" data-scroll="1" aria-label="${t("hours.next")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <div class="hours-wrap"><div class="hours" tabindex="0" aria-label="${t("hours.aria")}">${s.hours.map((h) => hourCell(h, tz)).join("")}</div></div>
    </section>

    <section class="panel">
      <h3>${t("week.title", s.days.length)}</h3>
      <p class="muted small">${t("week.help")}</p>
      <div class="week">${weekRows(s.days, tz, s.tideDay.from)}</div>
      <div class="legend small">${RATINGS.map((x) => `<span><i class="q q-${x.key}"></i>${ratingLabel(x.key)}</span>`).join("")}</div>
    </section>

    ${glossary()}
    ${locationPanel(s)}

    <p class="muted small updated-line">${t("updated", ago(s.updatedAt))}</p>
    ${footer()}`;
  bindHourStrip();
  const tidePanel = app.querySelector(".tide-panel");
  if (tidePanel && s.tideDay.points.length >= 4) bindTideChart(tidePanel, s.tideDay, tz, now);
  bindLocationMap(s);
}

// Botones ◀ ▶ y degradado de la tira horaria según la posición del scroll.
function bindHourStrip() {
  const strip = app.querySelector(".hours");
  if (!strip) return;
  const wrap = strip.parentElement;
  const [prev, next] = app.querySelectorAll("[data-scroll]");
  const update = () => {
    const max = strip.scrollWidth - strip.clientWidth - 1;
    prev.disabled = strip.scrollLeft <= 0;
    next.disabled = strip.scrollLeft >= max;
    wrap.classList.toggle("at-end", strip.scrollLeft >= max);
  };
  for (const b of [prev, next]) b.onclick = () => strip.scrollBy({ left: +b.dataset.scroll * strip.clientWidth * 0.8 });
  strip.addEventListener("scroll", update, { passive: true });
  removeEventListener("resize", onStripResize);
  onStripResize = update;
  addEventListener("resize", onStripResize);
  update();
}
let onStripResize = () => {};

// ---------- Avisos ----------
async function renderAlerts() {
  document.title = t("alerts.docTitle");
  app.innerHTML = `
  <header class="topbar detail-bar">
    <a class="icon-btn" href="#/" aria-label="${t("back")}">${icon.back}</a>
    <div class="title"><h1>${t("alerts")}</h1><p class="sub">${t("alerts.subtitle")}</p></div>
  </header>
  <main id="alerts"><div class="card skeleton" aria-hidden="true"></div></main>`;
  const root = app.querySelector("#alerts");

  if (!alerts.supported()) {
    root.innerHTML = `<div class="panel"><p>${t("alerts.unsupported")}</p><p class="muted small">${t("alerts.unsupportedHint")}</p></div>${footer()}`;
    return;
  }
  if (alerts.needsInstall()) {
    root.innerHTML = `<div class="panel"><h3>${t("alerts.install")}</h3><p class="small">${t("alerts.installHint")}</p></div>${footer()}`;
    return;
  }

  const st = await alerts.load().catch(() => alerts.getState());
  const denied = Notification.permission === "denied";
  root.innerHTML = `
    ${denied ? `<p class="banner">${t("alerts.blockedWeb")}</p>` : ""}
    <section class="panel">
      <h3>${t("alerts.from")}</h3>
      <div class="seg seg-inline" role="radiogroup" aria-label="${t("alerts.minQuality")}">
        ${[
          [2, "fair"],
          [3, "good"],
          [4, "epic"],
        ]
          .map(
            ([v, k]) =>
              `<button role="radio" aria-checked="${st.minScore === v}" aria-selected="${st.minScore === v}" data-min="${v}">${ratingLabel(k)}</button>`,
          )
          .join("")}
      </div>
      <p class="muted small">${t("alerts.help")}</p>
    </section>
    <section class="panel">
      <h3>${t("alerts.spots")}</h3>
      <ul class="switch-list">
        ${SPOTS.map(
          (
            sp,
            i,
          ) => `${i === 0 || SPOTS[i - 1].region !== sp.region ? `<li class="switch-head eyebrow">${esc(sp.region)}</li>` : ""}<li><label for="al-${sp.id}"><span>${esc(sp.name)}</span>
          <input type="checkbox" role="switch" id="al-${sp.id}" data-spot="${sp.id}" ${st.spots.includes(sp.id) ? "checked" : ""}></label></li>`,
        ).join("")}
      </ul>
    </section>
    <div class="actions">
      <button class="btn" id="test" ${st.spots.length ? "" : "disabled"}>${t("alerts.test")}</button>
      <button class="btn ghost" id="off" ${st.spots.length ? "" : "disabled"}>${t("alerts.off")}</button>
    </div>
    ${footer()}`;

  const run = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(err.message);
    }
    renderAlerts();
  };
  root
    .querySelectorAll("[data-min]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          run(() => alerts.setMinScore(+b.dataset.min), st.spots.length ? t("toast.threshold") : null)),
    );
  root
    .querySelectorAll("[data-spot]")
    .forEach(
      (c) =>
        (c.onchange = () =>
          run(
            () => alerts.toggleSpot(c.dataset.spot),
            c.checked ? t("toast.spotOn", spotById[c.dataset.spot].name) : t("toast.spotOff"),
          )),
    );
  root.querySelector("#test").onclick = () => run(() => alerts.sendTest(), t("toast.testSent"));
  root.querySelector("#off").onclick = () => run(() => alerts.disableAll(), t("toast.allOff"));
}

// ---------- Eventos globales y rutas ----------
app.addEventListener("click", async (e) => {
  const help = e.target.closest("[data-help]");
  if (help) {
    e.preventDefault();
    showHelp(help.dataset.help);
    return;
  }
  const sh = e.target.closest("[data-share]");
  if (sh) {
    const meta = spotById[sh.dataset.share];
    if (!meta) return;
    const url = location.href;
    let text = `${meta.name} · Marea`;
    if (currentSpotData && currentSpotData.meta?.id === meta.id) {
      const { n, r, tide } = currentSpotData;
      const tideStr = tide?.h != null ? `${fmt(tide.h)} m ${tide.rising ? "↗" : "↘"}` : "–";
      text = t(
        "share.text",
        meta.name,
        fmt(n.h),
        fmt(n.T, 0),
        cardinal(n.dir),
        windPhrase(n.windType, n.wind),
        tideStr,
        ratingLabel(r.key),
        url,
      );
    }
    const shareData = {
      title: t("share.title", meta.name),
      text,
      url,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          toast(t("toast.linkCopied"));
        })
        .catch(() => {});
    } else {
      toast(t("toast.linkCopied"));
    }
    return;
  }
  const fav = e.target.closest("[data-fav]");
  if (fav) {
    e.preventDefault();
    toggleFav(fav.dataset.fav);
    const on = favs.has(fav.dataset.fav);
    fav.classList.toggle("on", on);
    fav.setAttribute("aria-pressed", on);
    fav.innerHTML = icon.star(on);
    if (filter === "fav" && !location.hash.startsWith("#/spot/")) drawList();
    return;
  }
  const al = e.target.closest("[data-alert]");
  if (al) {
    if (alerts.needsInstall()) {
      location.hash = "#/avisos";
      return;
    }
    al.disabled = true;
    try {
      const st = await alerts.toggleSpot(al.dataset.alert);
      toast(t(st.spots.includes(al.dataset.alert) ? "toast.alertOn" : "toast.alertOffSpot"));
    } catch (err) {
      toast(err.message);
    }
    al.outerHTML = alertButton(al.dataset.alert);
  }
});

function route(force = false) {
  const m = location.hash.match(/^#\/spot\/([\w-]+)/);
  window.scrollTo(0, 0);
  if (m) return renderSpot(m[1], force);
  if (location.hash === "#/avisos") return renderAlerts();
  if (location.hash === "#/mapa") return renderMap();
  return renderHome(force);
}

addEventListener("hashchange", () => route());
// Atajo de teclado: "/" lleva al buscador desde la lista.
addEventListener("keydown", (e) => {
  const field = app.querySelector("#spot-search");
  if (e.key === "/" && field && document.activeElement?.tagName !== "INPUT") {
    e.preventDefault();
    field.focus();
  }
});
// Refresco cada 10 min (no en avisos ni en el mapa, para no perder lo que se está mirando).
setInterval(() => {
  if (document.visibilityState === "visible" && !["#/avisos", "#/mapa"].includes(location.hash)) route(true);
}, 10 * 60e3);

if ("serviceWorker" in navigator) {
  // Cuando se activa una versión nueva de la app, recargar una vez para usarla.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloaded) {
        reloaded = true;
        location.reload();
      }
    });
  }
  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then(() => alerts.load())
    .then(() => {
      if (!location.hash.startsWith("#/spot/") && !["#/avisos", "#/mapa"].includes(location.hash)) {
        const bell = app.querySelector('a[href="#/avisos"]');
        if (bell)
          bell.outerHTML = `<a class="icon-btn ${alerts.getState().spots.length ? "on" : ""}" href="#/avisos" aria-label="${t("alerts")}">${icon.bell(alerts.getState().spots.length > 0)}</a>`;
      } else if (location.hash.startsWith("#/spot/")) {
        const btn = app.querySelector("[data-alert]");
        if (btn) btn.outerHTML = alertButton(btn.dataset.alert);
      }
    })
    .catch(() => {});
}

if (filter === "near") locate().then(() => route());
else route();
