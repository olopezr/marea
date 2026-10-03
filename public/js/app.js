import { SPOTS, spotById } from "./spots.js";
import { getOverview, getSpot, getBuoy } from "./api.js";
import * as alerts from "./alerts.js";
import { rating, RATINGS, cardinal, hhmm, hourOf, km, fmt } from "./surf.js";
import { tideChartHTML, bindTideChart } from "./tidechart.js";

const app = document.getElementById("app");

// ---------- Preferencias del usuario (solo en este dispositivo) ----------
const local = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const favs = new Set(local.get("marea:favs", []));
let filter = local.get("marea:filter", "all");
let query = ""; // búsqueda en la lista; se conserva al volver de un spot
let home = null; // última respuesta de la lista, para filtrar sin volver a pedir datos
let position = null;

function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  local.set("marea:favs", [...favs]);
}

// ---------- Piezas de interfaz ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const arrow = deg => deg == null ? "" :
  `<svg class="arrow" viewBox="0 0 24 24" style="transform:rotate(${deg + 180}deg)" aria-hidden="true"><path d="M12 3l6 9h-4v9h-4v-9H6z"/></svg>`;

const icon = {
  star: on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  bell: on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" class="logo-bg"/><path d="M4 19c3-4 6-4 8 0s5 4 8 0 6-4 8 0" fill="none" class="logo-wave" stroke-width="2.6" stroke-linecap="round"/></svg>`,
};

const scoreBar = s =>
  `<span class="score" aria-label="${fmt(s)} de 5">${[0, 1, 2, 3, 4].map(i => `<i style="--f:${Math.max(0, Math.min(1, s - i))}"></i>`).join("")}</span>`;

const ago = ts => {
  const m = Math.round((Date.now() - ts) / 60e3);
  return m < 1 ? "ahora mismo" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
};

const windPhrase = (wt, kn) => wt.key === "calm" ? "sin apenas viento" : `viento ${wt.label.toLowerCase()} de ${fmt(kn, 0)} kn`;
const tideWord = t => (t.type === "high" ? "Pleamar" : "Bajamar");
// Cuándo llega la próxima marea favorable para el spot. Lo que cae después de hoy se indica como "mañana".
function idealTideText(pref, ext, now, dayEnd, tz) {
  if (pref === "all") return "Funciona con cualquier marea";
  const tomorrow = t => (t >= dayEnd ? "mañana " : "");
  if (pref === "mid") {
    const t = ext.slice(1).map((e, i) => (ext[i].t + e.t) / 2).find(x => x > now);
    return t ? `Próxima media marea ${tomorrow(t)}hacia las ${hhmm(t, tz)}` : "Sin datos de marea suficientes";
  }
  const e = ext.find(x => x.type === pref && x.t > now);
  return e ? `Próxima ${pref === "low" ? "bajamar" : "pleamar"} ${tomorrow(e.t)}a las ${hhmm(e.t, tz)}` : "Sin datos de marea suficientes";
}

// Índice UV en la escala de la OMS.
const uvLabel = uv => { const i = Math.round(uv); return i < 3 ? "Bajo" : i < 6 ? "Moderado" : i < 8 ? "Alto" : i < 11 ? "Muy alto" : "Extremo"; };
const uvAdvice = uv => { const i = Math.round(uv); return i < 3 ? "sin protección especial" : i < 8 ? "crema solar y gorra" : "evita el sol de mediodía"; };
const wetsuit = c => c == null ? "" : c < 15 ? "Neopreno 5/4 y escarpines" : c < 17 ? "Neopreno 4/3" : c < 20 ? "Neopreno 3/2" : "Neopreno corto";

const footer = () => `
  <footer class="foot muted">
    <p>Previsión: Open-Meteo, Puertos del Estado y MET Norway. Mareas: Instituto Hidrográfico de la Marina. Boyas y mareógrafos: Puertos del Estado. No usar para navegación.</p>
    <nav class="legal"><a href="/legal/fuentes.html">Fuentes de datos</a><a href="/legal/privacidad.html">Privacidad</a><a href="/legal/aviso-legal.html">Aviso legal</a></nav>
  </footer>`;

// Avisos sobre el estado de los datos: guardados (sin conexión o servidor sin datos) y fuente de respaldo.
function dataBanners(res) {
  const out = [];
  if (res.stale) {
    out.push(navigator.onLine === false
      ? `<p class="banner">Sin conexión. Mostrando los datos guardados ${ago(res.ts)}.</p>`
      : `<p class="banner">No se han podido actualizar los datos ahora mismo. Mostrando los guardados ${ago(res.ts)}.</p>`);
  }
  if (res.data.forecastSource === "portus") {
    out.push(`<p class="banner">Open-Meteo no responde ahora mismo: la previsión es la del modelo de Puertos del Estado, que llega a 3 días.</p>`);
  }
  return out.join("");
}

const skeletonCards = (n = 4) => Array.from({ length: n }, () => `<div class="card skeleton" aria-hidden="true"></div>`).join("");
const errorBox = msg => `<div class="empty"><p>No se pudieron cargar los datos.</p><p class="muted small">${esc(msg)}. Comprueba la conexión y toca actualizar.</p></div>`;

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

// ---------- Lista de spots ----------
// Línea de la boya en cada tarjeta. Se pide solo cuando la tarjeta aparece en pantalla
// y como mucho 3 a la vez, para no lanzar todas las peticiones de golpe.
function buoyLineHTML(b, tz) {
  if (!b) return `<span class="muted">Sin boya operativa cerca</span>`;
  const off = b.buoy.fallback;
  return `<span class="dot-live${off ? " off" : ""}" aria-hidden="true"></span>${off ? `<span class="sr-only">Aviso: no es la boya más cercana. </span>` : ""}Boya ${esc(b.buoy.name)}${off ? ` (a ${b.buoy.distKm} km)` : ""}: <b>${fmt(b.h)} m</b>${b.Tp != null ? ` · ${fmt(b.Tp, 0)} s` : ""}${b.dir != null ? ` ${cardinal(b.dir)}` : ""}${b.predicted ? ` <span class="muted">· prev. ${fmt(b.predicted.h)} m</span>` : ""} <span class="muted">· ${hhmm(b.t, tz)}</span>`;
}

let buoyObserver = null;
const buoyQueue = [];
let buoyActive = 0;
function pumpBuoys() {
  while (buoyActive < 3 && buoyQueue.length) {
    const { el, id, tz } = buoyQueue.shift();
    buoyActive++;
    getBuoy(id)
      .then(res => { el.innerHTML = buoyLineHTML(res.data.buoy, tz); })
      .catch(() => { el.innerHTML = `<span class="muted">Boya no disponible ahora</span>`; })
      .finally(() => { buoyActive--; pumpBuoys(); });
  }
}
function watchBuoyLines(rows) {
  buoyObserver?.disconnect();
  buoyQueue.length = 0;
  const tzOf = Object.fromEntries(rows.map(r => [r.s.id, r.s.tz]));
  const load = el => { buoyQueue.push({ el, id: el.dataset.buoy, tz: tzOf[el.dataset.buoy] }); pumpBuoys(); };
  const lines = app.querySelectorAll("[data-buoy]");
  if (!("IntersectionObserver" in window)) { lines.forEach(load); return; }
  buoyObserver = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { buoyObserver.unobserve(e.target); load(e.target); }
  }, { rootMargin: "200px 0px" });
  lines.forEach(el => buoyObserver.observe(el));
}

function card(s, dist) {
  const r = rating(s.score), n = s.now, t = s.tide;
  return `
  <article class="card">
    <a class="card-link" href="#/spot/${s.id}" aria-label="Ver ${esc(s.name)}"></a>
    <header>
      <div>
        <h2>${esc(s.name)}</h2>
        <p class="sub">${esc(s.region)}${dist != null ? ` · ${Math.round(dist)} km` : ""}</p>
      </div>
      <button class="fav ${favs.has(s.id) ? "on" : ""}" data-fav="${s.id}" aria-pressed="${favs.has(s.id)}" aria-label="Favorito">${icon.star(favs.has(s.id))}</button>
    </header>
    <div class="rating r-${r.key}"><span class="chip">${r.label}</span>${scoreBar(s.score)}</div>
    <dl class="metrics">
      <div><dt>Ola</dt><dd><b>${fmt(n.h)}</b> m</dd></div>
      <div><dt>Periodo</dt><dd><b>${fmt(n.T, 0)}</b> s ${arrow(n.dir)}</dd></div>
      <div><dt>Viento</dt><dd><b>${fmt(n.wind, 0)}</b> kn <span class="wt wt-${n.windType.key}">${n.windType.label}</span></dd></div>
      <div><dt>Marea</dt><dd>${t.rising == null ? "–" : t.rising ? "↗ Sube" : "↘ Baja"}${t.next ? `<span class="muted small next">${tideWord(t.next)} ${hhmm(t.next.t, s.tz)}</span>` : ""}</dd></div>
    </dl>
    <p class="buoy-line small" data-buoy="${s.id}"><span class="muted">Boya: cargando…</span></p>
  </article>`;
}

function homeShell() {
  const st = alerts.getState();
  return `
  <header class="topbar">
    <div class="brand">${icon.logo}<span>Marea</span></div>
    <div class="top-actions">
      <span class="updated muted">Cargando…</span>
      <a class="icon-btn ${st.spots.length ? "on" : ""}" href="#/avisos" aria-label="Avisos">${icon.bell(st.spots.length > 0)}</a>
      <button class="icon-btn" id="refresh" aria-label="Actualizar datos">${icon.refresh}</button>
    </div>
  </header>
  <div class="seg" role="tablist" aria-label="Filtrar spots">
    ${[["all", "Todos"], ["fav", "Favoritos"], ["near", "Cerca de mí"]].map(([k, l]) =>
      `<button role="tab" aria-selected="${filter === k}" data-filter="${k}">${l}</button>`).join("")}
  </div>
  <div class="search" role="search">
    ${icon.search}
    <input id="spot-search" type="search" placeholder="Buscar playa o zona" aria-label="Buscar playa o zona"
      autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(query)}">
    <button type="button" class="search-clear" aria-label="Borrar la búsqueda" ${query ? "" : "hidden"}>×</button>
  </div>
  <main><div class="list">${skeletonCards()}</div></main>
  ${footer()}`;
}

// Búsqueda sin distinguir mayúsculas ni tildes ("cicer" encuentra "La Cícer"); cada palabra debe aparecer.
const normalize = str => str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const matches = (s, q) => {
  const hay = normalize(`${s.name} ${s.region}`);
  return normalize(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
};

function drawList() {
  if (!home) return;
  const { res, rows } = home;
  const q = query.trim();
  let shown = filter === "fav" ? rows.filter(r => favs.has(r.s.id)) : rows;
  if (q) shown = shown.filter(r => matches(r.s, q));
  shown = filter === "near" && position ? [...shown].sort((a, b) => a.dist - b.dist) : [...shown].sort((a, b) => b.s.score - a.s.score);

  let empty = `<div class="empty"><p>Aún no tienes favoritos.</p><p class="muted small">Toca la estrella de un spot para tenerlo aquí.</p></div>`;
  if (q) {
    const elsewhere = filter === "fav" ? rows.filter(r => matches(r.s, q)).length : 0;
    empty = `<div class="empty"><p>Ningún spot coincide con «${esc(q)}».</p>
      ${elsewhere ? `<p><button class="btn ghost" type="button" data-search-all>Ver ${elsewhere} ${elsewhere === 1 ? "resultado" : "resultados"} en Todos</button></p>`
        : `<p class="muted small">Prueba con el nombre de la playa o la zona, por ejemplo «Cantabria» o «Lanzarote».</p>`}</div>`;
  }

  const best = rows.reduce((a, b) => (b.s.score > a.s.score ? b : a)).s;
  app.querySelector(".list").innerHTML =
    dataBanners(res) +
    (filter === "all" && !q ? `<p class="lede">Ahora mismo lo mejor está en <a href="#/spot/${best.id}">${esc(best.name)}</a>: ${fmt(best.now.h)} m a ${fmt(best.now.T, 0)} s, ${windPhrase(best.now.windType, best.now.wind)}.</p>` : "") +
    (q && shown.length ? `<p class="lede">${shown.length} ${shown.length === 1 ? "spot" : "spots"} para «${esc(q)}»</p>` : "") +
    (filter === "near" && !position ? `<p class="banner">Permite el acceso a tu ubicación para ordenar los spots por cercanía.</p>` : "") +
    (shown.length ? shown.map(r => card(r.s, r.dist)).join("") : empty);
  watchBuoyLines(rows);
  app.querySelector("[data-search-all]")?.addEventListener("click", () => {
    filter = "all"; local.set("marea:filter", filter); renderHome();
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
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); }
    if (e.key === "Enter") {
      // Con un único resultado, Enter abre directamente ese spot.
      const only = app.querySelectorAll(".card-link");
      if (only.length === 1) location.hash = only[0].getAttribute("href");
      input.blur();
    }
  });
  clear.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); });
}

async function renderHome(force = false) {
  document.title = "Marea";
  app.innerHTML = homeShell();
  app.querySelector("#refresh").onclick = e => { e.currentTarget.classList.add("spin"); renderHome(true); };
  app.querySelectorAll("[data-filter]").forEach(b => (b.onclick = () => {
    filter = b.dataset.filter; local.set("marea:filter", filter);
    if (filter === "near" && !position) locate().then(() => renderHome());
    else renderHome();
  }));

  bindSearch();

  let res;
  try { res = await getOverview(force); }
  catch (err) { app.querySelector(".list").innerHTML = errorBox(err.message); return; }

  home = { res, rows: res.data.spots.map(s => ({ s, dist: position ? km(position, s) : null })) };
  app.querySelector(".updated").textContent = ago(res.data.updatedAt).replace(/^./, c => c.toUpperCase());
  drawList();
}

function locate() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve();
    navigator.geolocation.getCurrentPosition(
      p => { position = { lat: p.coords.latitude, lon: p.coords.longitude }; resolve(); },
      () => resolve(),
      { timeout: 8000, maximumAge: 600e3 },
    );
  });
}

// ---------- Detalle de un spot ----------
const tile = (label, value, sub) =>
  `<div class="tile"><span class="eyebrow">${label}</span><strong>${value}</strong><span class="muted small">${sub}</span></div>`;

function hourCell(h, tz) {
  const r = rating(h.score);
  return `<div class="hour">
    <span class="muted small">${hhmm(h.t, tz).slice(0, 2)}h</span>
    <i class="q q-${r.key}" title="${r.label}"></i>
    <b>${fmt(h.h)}</b>
    <span class="small">${fmt(h.T, 0)} s</span>
    <span class="small wind">${arrow(h.windDir)}${fmt(h.wind, 0)}</span>
  </div>`;
}

// Todas las filas comparten las mismas columnas horarias (la misma hora queda en la misma columna cada día),
// con las horas encima y cabeceras para la ola máxima y la mejor hora. Las horas ya pasadas de hoy, atenuadas.
function weekRows(days, tz, todayFrom) {
  const hours = days.flatMap(d => d.cells.map(c => hourOf(c.t, tz)));
  const cols = hours.length ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i) : [];
  const now = Date.now();
  const head = `<div class="day week-head" aria-hidden="true"><span></span>
      <span class="cells">${cols.map(h => `<span>${(h - cols[0]) % 2 === 0 ? `${String(h).padStart(2, "0")}h` : ""}</span>`).join("")}</span>
      <span>Ola máx.</span><span>Mejor</span></div>`;
  return head + days.map((d, i) => {
    const today = i === 0 && d.rise < todayFrom + 86400e3;
    return `<div class="day">
      <span class="dname">${today ? "Hoy" : esc(d.label)}</span>
      <span class="cells">${cols.map(h => {
        const c = d.cells.find(x => hourOf(x.t, tz) === h);
        return c ? `<i class="q q-${rating(c.score).key}${today && c.t + 3600e3 <= now ? " past" : ""}" title="${hhmm(c.t, tz)} · ${rating(c.score).label}"></i>` : `<i class="q-none"></i>`;
      }).join("")}</span>
      <span class="small"><b>${fmt(d.maxH)} m</b></span>
      <span class="small muted">${d.best.score >= 1 ? hhmm(d.best.t, tz).slice(0, 2) + "h" : "–"}</span>
    </div>`;
  }).join("");
}

// Dónde está la playa: mapa de OpenStreetMap y coordenadas.
const coords = (lat, lon) => `${fmt(Math.abs(lat), 4)}° ${lat >= 0 ? "N" : "S"} · ${fmt(Math.abs(lon), 4)}° ${lon >= 0 ? "E" : "O"}`;
function locationPanel(s) {
  const d = 0.02, bbox = [s.lon - d * 1.4, s.lat - d, s.lon + d * 1.4, s.lat + d].map(x => x.toFixed(4)).join(",");
  // Ruta hasta la playa (abre Google Maps o su app en el móvil).
  const link = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
  return `<section class="panel location">
    <h3>Ubicación</h3>
    <iframe class="map" title="Mapa de ${esc(s.name)}" loading="lazy" referrerpolicy="no-referrer"
      src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik&amp;marker=${s.lat},${s.lon}"></iframe>
    <div class="location-row"><span class="coords">${coords(s.lat, s.lon)}</span><a href="${link}" target="_blank" rel="noopener">Cómo llegar</a></div>
  </section>`;
}

// Medido frente a lo previsto por el modelo de Puertos del Estado en la misma posición de la boya.
function buoyForecastBlock(b, diff) {
  if (!b.predicted) return `<p class="muted small">Puertos del Estado no publica predicción para esta boya.</p>`;
  const verdict = Math.abs(diff) < 0.2
    ? `La boya mide lo mismo que preveía el modelo (${fmt(b.predicted.h)} m).`
    : `La boya mide ${fmt(Math.abs(diff))} m ${diff > 0 ? "más" : "menos"} de lo que preveía el modelo (${fmt(b.predicted.h)} m).`;
  return `<p class="small buoy-pred"><b>${verdict}</b></p>`;
}

function buoyPanel(b, s) {
  const m = s.meteo;
  if (!b && !m) return `<section class="panel"><h3>Medido en el mar</h3><p class="muted small">No hay boyas ni estaciones de Puertos del Estado operativas cerca de este spot. Se muestra solo la previsión.</p></section>`;
  const diff = b?.predicted ? b.h - b.predicted.h : null;
  const latest = Math.max(b?.t ?? 0, m?.wind?.t ?? 0, m?.air?.t ?? 0, m?.pressure?.t ?? 0);
  const sources = [
    b && `boya ${esc(b.buoy.name)} (${b.buoy.distKm} km)`,
    m?.wind && `viento en ${esc(m.wind.station.name)} (${m.wind.station.distKm} km)`,
    !m?.wind && (m?.air || m?.pressure) && `estación ${esc((m.air ?? m.pressure).station.name)} (${(m.air ?? m.pressure).station.distKm} km)`,
  ].filter(Boolean);
  return `<section class="panel buoy">
    <div class="panel-head"><h3>Medido en el mar</h3><span class="live"><span class="dot-live${b?.buoy.fallback ? " off" : ""}" aria-hidden="true"></span>${hhmm(latest, s.tz)}</span></div>
    <div class="buoy-grid">
      ${b ? `<div><span class="eyebrow">Ola</span><strong>${fmt(b.h)} m</strong></div>
      <div><span class="eyebrow">Periodo pico</span><strong>${fmt(b.Tp, 0)} s</strong></div>
      <div><span class="eyebrow">Dirección</span>${b.dir != null ? `<strong>${arrow(b.dir)} ${cardinal(b.dir)}</strong>` : `<strong title="Esta boya no mide dirección">-</strong>`}</div>` : ""}
      ${b?.water != null ? `<div><span class="eyebrow">Agua</span><strong>${fmt(b.water)} °C</strong></div>` : ""}
      ${m?.wind ? `<div><span class="eyebrow">Viento</span><strong>${fmt(m.wind.wind, 0)} kn ${arrow(m.wind.windDir)}</strong>${m.wind.gust != null ? `<span class="muted small">Rachas ${fmt(m.wind.gust, 0)} kn</span>` : ""}</div>` : ""}
      ${m?.air ? `<div><span class="eyebrow">Aire</span><strong>${fmt(m.air.air)} °C</strong></div>` : ""}
      ${m?.pressure ? `<div><span class="eyebrow">Presión</span><strong>${fmt(m.pressure.pressure, 0)} hPa</strong></div>` : ""}
    </div>
    ${b?.buoy.far ? `<p class="small far-note"><span class="dot-live off" aria-hidden="true"></span>No hay ninguna boya a menos de 100 km. Esta es la de aguas profundas más cercana, a ${b.buoy.distKm} km: indica el mar de fondo que llega a la zona, no el oleaje en la playa.</p>`
      : b?.buoy.fallback ? `<p class="small far-note"><span class="dot-live off" aria-hidden="true"></span>${b.buoy.closest ? `La boya más cercana a esta playa, ${esc(b.buoy.closest.name)} (a ${b.buoy.closest.distKm} km), no envía datos ahora.` : "La boya más cercana a esta playa no envía datos ahora."} Se muestra la siguiente, ${esc(b.buoy.name)} (a ${b.buoy.distKm} km): puede no reflejar bien las condiciones de esta playa.</p>` : ""}
    <p class="muted small">Datos de Puertos del Estado: ${sources.join(", ")}.${b?.buoy.deep && !b.buoy.far ? " La boya está en aguas profundas: en la orilla las olas suelen llegar más pequeñas." : ""}</p>
    ${b ? buoyForecastBlock(b, diff) : ""}
  </section>`;
}

function alertButton(id) {
  if (!alerts.supported()) return "";
  const on = alerts.getState().spots.includes(id);
  return `<button class="alert-btn ${on ? "on" : ""}" data-alert="${id}" aria-pressed="${on}">${icon.bell(on)}<span>${on ? "Avisos activados" : "Activar avisos"}</span></button>`;
}

async function renderSpot(id, force = false) {
  const meta = spotById[id];
  if (!meta) { location.hash = "#/"; return; }
  document.title = `${meta.name} · Marea`;
  app.innerHTML = `
  <header class="topbar detail-bar">
    <a class="icon-btn" href="#/" aria-label="Volver a la lista">${icon.back}</a>
    <div class="title"><h1>${esc(meta.name)}</h1><p class="sub">${esc(meta.region)} · playa orientada al ${cardinal(meta.facing)}</p></div>
    <button class="fav ${favs.has(id) ? "on" : ""}" data-fav="${id}" aria-pressed="${favs.has(id)}" aria-label="Favorito">${icon.star(favs.has(id))}</button>
  </header>
  <main id="detail">${skeletonCards(2)}</main>`;

  let res;
  try { res = await getSpot(id, force); }
  catch (err) { app.querySelector("#detail").innerHTML = errorBox(err.message); return; }
  const s = res.data, tz = s.tz, now = Date.now(), n = s.now, r = rating(s.score), t = s.tide;
  const water = s.buoy?.water ?? n.water;

  app.querySelector("#detail").innerHTML = `
    ${dataBanners(res)}
    <section class="hero r-${r.key}">
      <p class="eyebrow">Previsión ahora · ${hhmm(now, tz)}</p>
      <div class="hero-row">
        <div><p class="hero-label">${r.label}</p>${scoreBar(s.score)}</div>
        <p class="hero-wave"><b>${fmt(n.h)}</b><span>m</span></p>
      </div>
      <p class="hero-line">${fmt(n.T, 0)} s del ${cardinal(n.dir)} · ${windPhrase(n.windType, n.wind)}</p>
    </section>

    ${alertButton(id)}
    ${buoyPanel(s.buoy, s)}

    <section class="tiles">
      ${tile("Mar de fondo", `${fmt(n.sh)} m · ${fmt(n.sT, 0)} s`, `${arrow(n.sDir)} ${cardinal(n.sDir)}`)}
      ${tile("Viento", `${fmt(n.wind, 0)} kn ${arrow(n.windDir)}`, `${n.gust != null ? `Rachas ${fmt(n.gust, 0)} kn · ` : ""}${cardinal(n.windDir)}`)}
      ${tile("Marea", t.h != null ? `${fmt(t.h)} m ${t.rising ? "↗" : "↘"}` : "–", `${t.next ? `${tideWord(t.next)} ${hhmm(t.next.t, tz)}` : ""}${t.coef != null ? ` · Coef. ${t.coef}` : ""}`)}
      ${tile("Marea ideal", ({ low: "Baja", mid: "Media", high: "Alta", all: "Cualquiera" })[s.tidePref], idealTideText(s.tidePref, s.tideDay.ext, now, s.tideDay.to, tz))}
      ${tile("Agua", `${fmt(water)} °C`, wetsuit(water))}
      ${tile("Aire", `${fmt(s.meteo?.air?.air ?? n.air, 0)} °C`, s.meteo?.air ? "Medida en una estación cercana" : "Previsión")}
      ${tile("Índice UV", s.uv?.now != null ? `${Math.round(s.uv.now)} · ${uvLabel(s.uv.now)}` : "–",
        s.uv ? `Máx. ${Math.round(s.uv.max)} a las ${hhmm(s.uv.maxT, tz).slice(0, 2)}h · ${uvAdvice(s.uv.max)}` : "Sin previsión ahora mismo")}
      ${tile("Primera luz", s.sun ? hhmm(s.sun.rise, tz) : "–", s.sun ? `Puesta ${hhmm(s.sun.set, tz)}` : "")}
    </section>

    <section class="panel tide-panel">
      <div class="panel-head"><h3>Marea de hoy</h3><span class="muted small hint">Desliza sobre la curva</span></div>
      ${tideChartHTML(s.tideDay, s.sun, tz)}
      <p class="muted small">${t.reason === "no-port" ? "El Instituto Hidrográfico de la Marina no publica mareas de esta zona (en el Mediterráneo la marea es de pocos centímetros). Es una estimación del modelo de Open-Meteo." : t.source === "ihm"
        ? `Predicción oficial del Instituto Hidrográfico de la Marina para ${esc(t.port.name)} (a ${t.port.distKm} km), alturas sobre el cero hidrográfico del puerto.${s.tideDay.surge ? ` Efecto del viento y la presión en el nivel del mar: previsión de Puertos del Estado para ${esc(s.tideDay.surge.beach)}.` : ""}${s.tideDay.observed ? ` Nivel medido por el mareógrafo de ${esc(s.tideDay.observed.gauge)}${s.tideDay.observed.samePort ? "" : `, en un puerto vecino a ${s.tideDay.observed.distKm} km (la marea es prácticamente la misma)`}.` : ""} El coeficiente es una estimación a partir de la carrera de cada marea.`
        : "Estimación del modelo de Open-Meteo: el servicio oficial de mareas no responde ahora mismo y puede desviarse."}</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>Próximas 24 horas</h3>
        <div class="scroll-btns">
          <button type="button" data-scroll="-1" aria-label="Horas anteriores"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" data-scroll="1" aria-label="Horas siguientes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <div class="hours-wrap"><div class="hours" tabindex="0" aria-label="Previsión por horas">${s.hours.map(h => hourCell(h, tz)).join("")}</div></div>
    </section>

    <section class="panel">
      <h3>${s.days.length} días</h3>
      <p class="muted small">Cada bloque es una hora de luz, coloreado según la calidad. Las horas que ya han pasado hoy aparecen atenuadas. A la derecha, la ola máxima del día y su mejor hora.</p>
      <div class="week">${weekRows(s.days, tz, s.tideDay.from)}</div>
      <div class="legend small">${RATINGS.map(x => `<span><i class="q q-${x.key}"></i>${x.label}</span>`).join("")}</div>
    </section>

    ${locationPanel(s)}

    <p class="muted small updated-line">Actualizado ${ago(s.updatedAt)}.</p>
    ${footer()}`;
  bindHourStrip();
  const tidePanel = app.querySelector(".tide-panel");
  if (tidePanel && s.tideDay.points.length >= 4) bindTideChart(tidePanel, s.tideDay, tz, now);
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
  document.title = "Avisos · Marea";
  app.innerHTML = `
  <header class="topbar detail-bar">
    <a class="icon-btn" href="#/" aria-label="Volver a la lista">${icon.back}</a>
    <div class="title"><h1>Avisos</h1><p class="sub">Te avisamos cuando tus spots se ponen buenos</p></div>
  </header>
  <main id="alerts"><div class="card skeleton" aria-hidden="true"></div></main>`;
  const root = app.querySelector("#alerts");

  if (!alerts.supported()) {
    root.innerHTML = `<div class="panel"><p>Este navegador no admite notificaciones web.</p><p class="muted small">Prueba con Chrome, Edge o Firefox en Android, o instala Marea en un iPhone con iOS 16.4 o posterior.</p></div>${footer()}`;
    return;
  }
  if (alerts.needsInstall()) {
    root.innerHTML = `<div class="panel"><h3>Instala Marea para recibir avisos</h3><p class="small">En iPhone las notificaciones solo funcionan con la app instalada. Toca <b>Compartir</b> y después <b>Añadir a pantalla de inicio</b>. Luego abre Marea desde el icono y vuelve aquí.</p></div>${footer()}`;
    return;
  }

  const st = await alerts.load().catch(() => alerts.getState());
  const denied = Notification.permission === "denied";
  root.innerHTML = `
    ${denied ? `<p class="banner">Las notificaciones están bloqueadas para Marea. Actívalas en los ajustes del navegador para recibir avisos.</p>` : ""}
    <section class="panel">
      <h3>Avisar a partir de</h3>
      <div class="seg seg-inline" role="radiogroup" aria-label="Calidad mínima">
        ${[[2, "Aceptable"], [3, "Bueno"], [4, "Muy bueno"]].map(([v, l]) =>
          `<button role="radio" aria-checked="${st.minScore === v}" aria-selected="${st.minScore === v}" data-min="${v}">${l}</button>`).join("")}
      </div>
      <p class="muted small">Revisamos la previsión cada hora entre las 7:00 y las 22:00 y te mandamos como mucho un aviso por spot y día, con la mejor hora de hoy o de mañana.</p>
    </section>
    <section class="panel">
      <h3>Spots</h3>
      <ul class="switch-list">
        ${SPOTS.map((sp, i) => `${i === 0 || SPOTS[i - 1].region !== sp.region ? `<li class="switch-head eyebrow">${esc(sp.region)}</li>` : ""}<li><label for="al-${sp.id}"><span>${esc(sp.name)}</span>
          <input type="checkbox" role="switch" id="al-${sp.id}" data-spot="${sp.id}" ${st.spots.includes(sp.id) ? "checked" : ""}></label></li>`).join("")}
      </ul>
    </section>
    <div class="actions">
      <button class="btn" id="test" ${st.spots.length ? "" : "disabled"}>Enviar un aviso de prueba</button>
      <button class="btn ghost" id="off" ${st.spots.length ? "" : "disabled"}>Desactivar todos los avisos</button>
    </div>
    ${footer()}`;

  const run = async (fn, okMsg) => {
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (err) { toast(err.message); }
    renderAlerts();
  };
  root.querySelectorAll("[data-min]").forEach(b => (b.onclick = () =>
    run(() => alerts.setMinScore(+b.dataset.min), st.spots.length ? "Umbral guardado" : null)));
  root.querySelectorAll("[data-spot]").forEach(c => (c.onchange = () =>
    run(() => alerts.toggleSpot(c.dataset.spot), c.checked ? `Avisos activados para ${spotById[c.dataset.spot].name}` : "Avisos desactivados para ese spot")));
  root.querySelector("#test").onclick = () => run(() => alerts.sendTest(), "Aviso de prueba enviado");
  root.querySelector("#off").onclick = () => run(() => alerts.disableAll(), "Avisos desactivados");
}

// ---------- Eventos globales y rutas ----------
app.addEventListener("click", async e => {
  const fav = e.target.closest("[data-fav]");
  if (fav) {
    e.preventDefault();
    toggleFav(fav.dataset.fav);
    const on = favs.has(fav.dataset.fav);
    fav.classList.toggle("on", on); fav.setAttribute("aria-pressed", on); fav.innerHTML = icon.star(on);
    if (filter === "fav" && !location.hash.startsWith("#/spot/")) drawList();
    return;
  }
  const al = e.target.closest("[data-alert]");
  if (al) {
    if (alerts.needsInstall()) { location.hash = "#/avisos"; return; }
    al.disabled = true;
    try {
      const st = await alerts.toggleSpot(al.dataset.alert);
      const on = st.spots.includes(al.dataset.alert);
      toast(on ? "Te avisaremos cuando tus spots estén en buenas condiciones" : "Avisos desactivados para este spot");
    } catch (err) { toast(err.message); }
    al.outerHTML = alertButton(al.dataset.alert);
  }
});

function route(force = false) {
  const m = location.hash.match(/^#\/spot\/([\w-]+)/);
  window.scrollTo(0, 0);
  if (m) return renderSpot(m[1], force);
  if (location.hash === "#/avisos") return renderAlerts();
  return renderHome(force);
}

addEventListener("hashchange", () => route());
// Atajo de teclado: "/" lleva al buscador desde la lista.
addEventListener("keydown", e => {
  const field = app.querySelector("#spot-search");
  if (e.key === "/" && field && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); field.focus(); }
});
setInterval(() => { if (document.visibilityState === "visible" && !location.hash.startsWith("#/avisos")) route(true); }, 10 * 60e3);

if ("serviceWorker" in navigator) {
  // Cuando se activa una versión nueva de la app, recargar una vez para usarla.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(() => alerts.load()).then(() => {
    if (!location.hash.startsWith("#/spot/") && location.hash !== "#/avisos") {
      const bell = app.querySelector('a[href="#/avisos"]');
      if (bell) bell.outerHTML = `<a class="icon-btn ${alerts.getState().spots.length ? "on" : ""}" href="#/avisos" aria-label="Avisos">${icon.bell(alerts.getState().spots.length > 0)}</a>`;
    } else if (location.hash.startsWith("#/spot/")) {
      const btn = app.querySelector("[data-alert]");
      if (btn) btn.outerHTML = alertButton(btn.dataset.alert);
    }
  }).catch(() => {});
}

if (filter === "near") locate().then(() => route()); else route();
