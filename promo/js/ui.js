// Pantallas de la app dentro del móvil. Repiten el marcado de public/js/app.js con sus mismas clases,
// así que se ven con public/css/app.css exactamente como la app real.
import { rating, RATINGS, cardinal, hhmm, fmt } from "/js/surf.js";
import { tideChartHTML } from "/js/tidechart.js";
import { el } from "./core.js";
import { TZ, NOW, SOMO, NOW_SOMO as N, LIST, HOURS, WEEK, WEEK_HOURS, TIDE_DAY, SUN, SPOTS, ALERTS, NOTIFY, spotById } from "./data.js";

export const icon = {
  star: on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  bell: on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" class="logo-bg"/><path d="M4 19c3-4 6-4 8 0s5 4 8 0 6-4 8 0" fill="none" class="logo-wave" stroke-width="2.6" stroke-linecap="round"/></svg>`,
};
export const arrow = deg => deg == null ? "" :
  `<svg class="arrow" viewBox="0 0 24 24" style="transform:rotate(${deg + 180}deg)" aria-hidden="true"><path d="M12 3l6 9h-4v9h-4v-9H6z"/></svg>`;
export const scoreBar = s =>
  `<span class="score">${[0, 1, 2, 3, 4].map(i => `<i style="--f:${Math.max(0, Math.min(1, s - i))}"></i>`).join("")}</span>`;
const tideWord = type => (type === "high" ? "Pleamar" : "Bajamar");
const t = ms => hhmm(ms, TZ);

// ---------- Marco del móvil ----------
const statusIcons = `<span class="icons">
  <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
  <svg viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.4l1.2-1.3A10.9 10.9 0 0 0 8 .4C5.1.4 2.5 1.5.5 3.3l1.2 1.3A9.1 9.1 0 0 1 8 2.2zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.3 7.3 0 0 0 8 4c-1.9 0-3.6.7-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4zM8 9.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/></svg>
  <svg viewBox="0 0 27 13"><rect x=".6" y=".6" width="22.8" height="11.8" rx="3.4" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.1"/><rect x="2.3" y="2.3" width="17.5" height="8.4" rx="2"/><path d="M25 4.4v4.2c.8-.3 1.4-1.2 1.4-2.1S25.8 4.7 25 4.4z" fill-opacity=".5"/></svg></span>`;

export function phone({ kind = "ios", theme = "dark", views = {}, time = "9:41" } = {}) {
  const dev = el("div", "p-device");
  const body = el("div", `p-phone ${kind === "android" ? "p-android" : ""}`);
  const screen = el("div", `p-screen theme-${theme}`);
  screen.innerHTML = `<div class="p-status"><span>${time}</span>${statusIcons}</div><div class="p-island"></div>`;
  const out = { dev, body, screen, views: {} };
  for (const [name, html] of Object.entries(views)) {
    const v = el("div", `p-view v-${name}`, html);
    screen.append(v);
    out.views[name] = v;
  }
  screen.insertAdjacentHTML("beforeend", `<div class="p-home"></div><div class="p-gloss"></div>`);
  body.append(screen);
  dev.append(body);
  return out;
}

// ---------- Lista ----------
export function cardHTML(c, { fav = false } = {}) {
  const r = rating(c.score), tz = c.tz ?? TZ;
  const [bn, bh, bT, bdir, bpred, bt] = c.buoy;
  return `<article class="card" data-id="${c.id}">
    <header>
      <div><h2>${c.spot.name}</h2><p class="sub">${c.spot.region}</p></div>
      <button class="fav ${fav ? "on" : ""}" aria-label="Favorito">${icon.star(fav)}</button>
    </header>
    <div class="rating r-${r.key}"><span class="chip">${r.label}</span>${scoreBar(c.score)}</div>
    <dl class="metrics">
      <div><dt>Ola</dt><dd><b>${fmt(c.h)}</b> m</dd></div>
      <div><dt>Periodo</dt><dd><b>${fmt(c.T, 0)}</b> s ${arrow(c.dir)}</dd></div>
      <div><dt>Viento</dt><dd><b>${fmt(c.wind, 0)}</b> kn <span class="wt wt-${c.wt[0]}">${c.wt[1]}</span></dd></div>
      <div><dt>Marea</dt><dd>${c.rising ? "↗ Sube" : "↘ Baja"}<span class="muted small next">${tideWord(c.next[0])} ${hhmm(c.nextT, tz)}</span></dd></div>
    </dl>
    <p class="buoy-line small"><span class="dot-live"></span>Boya ${bn}: <b>${fmt(bh)} m</b> · ${fmt(bT, 0)} s ${cardinal(bdir)} <span class="muted">· prev. ${fmt(bpred)} m</span> <span class="muted">· ${bt}</span></p>
  </article>`;
}

export function listView({ favs = ["somo"] } = {}) {
  const best = LIST[0];
  return `<div class="p-scroll">
    <header class="topbar">
      <div class="brand">${icon.logo}<span>Marea</span></div>
      <div class="top-actions"><span class="updated muted">Ahora mismo</span>
        <a class="icon-btn on">${icon.bell(true)}</a><button class="icon-btn">${icon.refresh}</button></div>
    </header>
    <div class="seg"><button aria-selected="true">Todos</button><button aria-selected="false">Favoritos</button><button aria-selected="false">Cerca de mí</button></div>
    <div class="search">${icon.search}<input type="search" placeholder="Buscar playa o zona" readonly></div>
    <main><div class="list">
      <p class="lede">Ahora mismo lo mejor está en <a>${best.spot.name}</a>: ${fmt(best.h)} m a ${fmt(best.T, 0)} s, viento terral de ${fmt(best.wind, 0)} kn.</p>
      ${LIST.map(c => cardHTML(c, { fav: favs.includes(c.id) })).join("")}
    </div></main>
  </div>`;
}

// ---------- Detalle ----------
const tile = (label, value, sub, cls = "") => `<div class="tile ${cls}"><span class="eyebrow">${label}</span><strong>${value}</strong><span class="muted small">${sub}</span></div>`;
export const TILES = {
  swell: tile("Mar de fondo", `${fmt(N.sh)} m · ${fmt(N.sT, 0)} s`, `${arrow(N.sDir)} ${cardinal(N.sDir)}`, "t-swell"),
  wind: tile("Viento", `${fmt(N.wind, 0)} kn ${arrow(N.windDir)}`, `Rachas ${fmt(N.gust, 0)} kn · ${cardinal(N.windDir)}`, "t-wind"),
  tide: tile("Marea", `${fmt(N.tideH)} m ↘`, `Bajamar ${t(N.nextTide.t)} · Coef. ${N.coef}`, "t-tide"),
  ideal: tile("Marea ideal", "Baja", `Próxima bajamar a las ${t(N.nextTide.t)}`, "t-ideal"),
  water: tile("Agua", `${fmt(N.water)} °C`, "Neopreno 3/2", "t-water"),
  air: tile("Aire", `${fmt(N.air, 0)} °C`, "Medida en una estación cercana", "t-air"),
  uv: tile("Índice UV", `${N.uv} · Moderado`, `Máx. ${N.uvMax} a las 14h · crema solar y gorra`, "t-uv"),
  light: tile("Luz solar", t(SUN.rise), `Puesta ${t(SUN.set)}`, "t-light"),
};

export function heroHTML() {
  const r = rating(N.score);
  return `<section class="hero r-${r.key}">
    <p class="eyebrow">Previsión ahora · ${t(NOW)}</p>
    <div class="hero-row"><div><p class="hero-label">${r.label}</p>${scoreBar(N.score)}</div><p class="hero-wave"><b>${fmt(N.h)}</b><span>m</span></p></div>
    <p class="hero-line">${fmt(N.T, 0)} s del ${cardinal(N.dir)} · viento terral de ${fmt(N.wind, 0)} kn</p>
  </section>`;
}

export function buoyPanelHTML() {
  const b = N.buoy, m = N.station;
  return `<section class="panel buoy">
    <div class="panel-head"><h3>Medido en el mar</h3><span class="live"><span class="dot-live"></span>${t(b.t)}</span></div>
    <div class="buoy-grid">
      <div><span class="eyebrow">Ola</span><strong>${fmt(b.h)} m</strong></div>
      <div><span class="eyebrow">Periodo pico</span><strong>${fmt(b.Tp, 0)} s</strong></div>
      <div><span class="eyebrow">Dirección</span><strong>${arrow(b.dir)} ${cardinal(b.dir)}</strong></div>
      <div><span class="eyebrow">Agua</span><strong>${fmt(b.water)} °C</strong></div>
      <div><span class="eyebrow">Viento</span><strong>${fmt(m.wind, 0)} kn ${arrow(m.windDir)}</strong><span class="muted small">Rachas ${fmt(m.gust, 0)} kn</span></div>
      <div><span class="eyebrow">Presión</span><strong>${fmt(m.pressure, 0)} hPa</strong></div>
    </div>
    <p class="muted small">Datos de Puertos del Estado: boya ${b.name} (${b.distKm} km), viento en ${m.name} (${m.distKm} km). La boya está en aguas profundas: en la orilla las olas suelen llegar más pequeñas.</p>
    <p class="small buoy-pred"><b>${Math.abs(b.h - b.predicted) < 0.2
      ? `La boya mide lo mismo que preveía el modelo (${fmt(b.predicted)} m).`
      : `La boya mide ${fmt(Math.abs(b.h - b.predicted))} m ${b.h > b.predicted ? "más" : "menos"} de lo que preveía el modelo (${fmt(b.predicted)} m).`}</b></p>
  </section>`;
}

export const hourCellHTML = h => {
  const r = rating(h.score);
  return `<div class="hour"><span class="muted small">${t(h.t).slice(0, 2)}h</span><i class="q q-${r.key}"></i><b>${fmt(h.h)}</b><span class="small">${fmt(h.T, 0)} s</span><span class="small wind">${arrow(h.windDir)}${fmt(h.wind, 0)}</span></div>`;
};

export function weekHTML() {
  const head = `<div class="day week-head"><span></span><span class="cells">${WEEK_HOURS.map((h, i) => `<span>${i % 2 === 0 ? `${String(h).padStart(2, "0")}h` : ""}</span>`).join("")}</span><span>Ola máx.</span><span>Mejor</span></div>`;
  return head + WEEK.map(d => `<div class="day"><span class="dname">${d.label}</span>
      <span class="cells">${d.cells.map((k, i) => `<i class="q q-${k}${d.today && i < 1 ? " past" : ""}"></i>`).join("")}</span>
      <span class="small"><b>${fmt(d.maxH)} m</b></span><span class="small muted">${d.best}</span></div>`).join("");
}
export const legendHTML = () => `<div class="legend small">${RATINGS.map(x => `<span><i class="q q-${x.key}"></i>${x.label}</span>`).join("")}</div>`;

export function weekPanelHTML() {
  return `<section class="panel p-week"><h3>7 días</h3>
    <p class="muted small">Cada bloque es una hora de luz, coloreado según la calidad. A la derecha, la ola máxima del día y su mejor hora.</p>
    <div class="week">${weekHTML()}</div>${legendHTML()}</section>`;
}

export function tidePanelHTML() {
  return `<section class="panel tide-panel">
    <div class="panel-head"><h3>Marea de hoy</h3><span class="muted small hint">Desliza sobre la curva</span></div>
    ${tideChartHTML(TIDE_DAY, SUN, TZ)}
  </section>`;
}

export function detailView({ alertOn = false } = {}) {
  return `<div class="p-fixedbar"><header class="topbar detail-bar">
      <a class="icon-btn">${icon.back}</a>
      <div class="title"><h1>${SOMO.name}</h1><p class="sub">${SOMO.region} · playa orientada al ${cardinal(SOMO.facing)}</p></div>
      <button class="fav on">${icon.star(true)}</button>
    </header></div>
    <div class="p-scroll" style="padding-top:122px"><main>
      ${heroHTML()}
      <button class="alert-btn ${alertOn ? "on" : ""}">${icon.bell(alertOn)}<span>${alertOn ? "Avisos activados" : "Activar avisos"}</span></button>
      ${buoyPanelHTML()}
      <section class="tiles">${Object.values(TILES).join("")}</section>
      ${tidePanelHTML()}
      <section class="panel p-hours"><div class="panel-head"><h3>Próximas 24 horas</h3></div>
        <div class="hours-wrap"><div class="hours">${HOURS.map(hourCellHTML).join("")}</div></div></section>
      ${weekPanelHTML()}
    </main></div>`;
}

// ---------- Avisos ----------
export function alertsView() {
  const cantabria = SPOTS.filter(s => s.region === "Cantabria").slice(0, 8);
  return `<div class="p-fixedbar"><header class="topbar detail-bar">
      <a class="icon-btn">${icon.back}</a>
      <div class="title"><h1>Avisos</h1><p class="sub">Te avisamos cuando tus spots se ponen buenos</p></div>
    </header></div>
    <div class="p-scroll" style="padding-top:122px"><main>
      <section class="panel">
        <h3>Avisar a partir de</h3>
        <div class="seg seg-inline p-minscore">${[[2, "Aceptable"], [3, "Bueno"], [4, "Muy bueno"]].map(([v, l]) => `<button data-min="${v}" aria-selected="${v === 3}">${l}</button>`).join("")}</div>
        <p class="muted small">Revisamos la previsión cada hora entre las 7:00 y las 22:00 y te mandamos como mucho un aviso por spot y día, con la mejor hora de hoy o de mañana.</p>
      </section>
      <section class="panel"><h3>Spots</h3>
        <ul class="switch-list">${cantabria.map(sp => `<li><label><span>${sp.name}<span class="muted small"> · ${sp.region}</span></span>
          <span class="p-switch" data-spot="${sp.id}"><i></i></span></label></li>`).join("")}</ul>
      </section>
    </main></div>`;
}

// ---------- Pantalla de bloqueo con el aviso ----------
export function lockView() {
  return `<div class="p-lock">
    <svg class="p-lock-waves" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-20 640c60-50 120-50 160 0s100 50 160 0 100-50 120-20V870H-20Z" fill="#0f4350"/>
      <path d="M-20 700c70-60 130-60 175 0s105 60 160 0 80-40 100-20V870H-20Z" fill="#155867"/>
      <path d="M-20 700c70-60 130-60 175 0s105 60 160 0 80-40 100-20" fill="none" stroke="#ff7a4d" stroke-width="5" stroke-linecap="round"/>
    </svg>
    <div class="p-lock-date">${NOTIFY.date}</div>
    <div class="p-lock-time">${NOTIFY.time}</div>
    <div class="p-lock-btns"><i></i><i></i></div>
    ${notifHTML()}
  </div>`;
}

export const notifHTML = () => `<div class="p-notif">
    <div class="p-notif-icon"><img src="/icons/icon-180.png" alt=""></div>
    <div class="p-notif-body"><div class="p-notif-head"><b>${NOTIFY.title}</b><span>ahora</span></div><p>${NOTIFY.body}</p></div>
  </div>`;

export { spotById, ALERTS };
