/**
 * Marea Landing Page Interactive Logic
 * Explora los 83 spots de surf de España con telemetría en tiempo real,
 * simulador interactivo de marea 24h, búsqueda dinámica y enlaces directos a la webapp.
 */

// Obtenemos los 83 spots cargados desde js/spots-data.js (o fallback)
let allSpots = Array.isArray(window.MAREA_SPOTS) ? window.MAREA_SPOTS : [];
let currentRegion = "all";
let currentQuery = "";

// La rejilla va paginada: cada tarjeta pesa 19 nodos, así que las 83 juntas se
// llevaban el 71% del DOM de la página y 5.587 px de alto.
const SPOTS_PER_PAGE = 12;
let currentPage = 1;
let selectedSpot = allSpots.find(s => s.id === "somo") || allSpots[0] || {};

// Respeta la preferencia de movimiento reducido del sistema operativo
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

// ==========================================================================
// 1. DOM INITIALIZATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  if (!allSpots.length && Array.isArray(window.MAREA_SPOTS)) {
    allSpots = window.MAREA_SPOTS;
  }
  if (!selectedSpot || !selectedSpot.id) {
    selectedSpot = allSpots.find(s => s.id === "somo") || allSpots[0];
  }

  initClock();
  initOceanCanvas();
  initNavToggle();
  renderSpotCards();
  if (selectedSpot) {
    updateSpotDetail(selectedSpot);
    updateHeroMockup(selectedSpot);
  }
  initTideSliders();
  initRegionTabs();
  initSearchInput();
  initPagination();
  initPwaGuideModal();
  initSharingButtons();

  // Intento de sincronización en vivo con la API de Render
  syncLiveTelemetry();
});

// Reloj dinámico en el marco del teléfono
function initClock() {
  const clockEl = document.getElementById("live-time");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    clockEl.textContent = `${h}:${m}`;
  };
  update();
  setInterval(update, 30000);
}

// ==========================================================================
// 2. RENDER DE LOS 83 SPOTS & BÚSQUEDA
// ==========================================================================

function filterSpots() {
  return allSpots.filter(spot => {
    // Filtro por región/zona
    const matchRegion = currentRegion === "all" || spot.zone === currentRegion;

    // Filtro por texto de búsqueda
    const q = currentQuery.trim().toLowerCase();
    const matchQuery = !q || 
      spot.name.toLowerCase().includes(q) || 
      spot.region.toLowerCase().includes(q) ||
      (spot.zone && spot.zone.toLowerCase().includes(q));

    return matchRegion && matchQuery;
  });
}

function renderSpotCards() {
  const grid = document.getElementById("spots-cards-grid");
  const counterEl = document.getElementById("spots-count-indicator");
  if (!grid) return;

  grid.innerHTML = "";
  const filtered = filterSpots();

  const totalPaginas = Math.max(1, Math.ceil(filtered.length / SPOTS_PER_PAGE));
  if (currentPage > totalPaginas) currentPage = totalPaginas;
  if (currentPage < 1) currentPage = 1;

  const desde = (currentPage - 1) * SPOTS_PER_PAGE;
  const visibles = filtered.slice(desde, desde + SPOTS_PER_PAGE);

  if (counterEl) {
    counterEl.textContent = textoContador(filtered.length, desde, visibles.length);
  }

  renderPagination(totalPaginas);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: rgba(13,37,45,0.4); border-radius: 16px; border: 1px dashed var(--border-subtle);">
        <p style="font-size: 1.1rem; color: #fff; margin-bottom: 8px;">No se encontraron spots para esa búsqueda.</p>
        <p style="font-size: 0.88rem; color: var(--ink-secondary);">Prueba buscando por provincia (ej. Cantabria, Asturias, A Coruña, Cádiz, Bizkaia, Lanzarote...)</p>
      </div>
    `;
    return;
  }

  visibles.forEach(spot => {
    const card = document.createElement("div");
    card.className = `spot-card ${selectedSpot && spot.id === selectedSpot.id ? "selected" : ""}`;
    card.dataset.id = spot.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    // Etiqueta de puntuación
    let scoreClass = "tag-fair";
    if (spot.score >= 4.0) scoreClass = "tag-epic";
    else if (spot.score >= 3.0) scoreClass = "tag-good";
    else if (spot.score < 1.5) scoreClass = "tag-flat";

    card.innerHTML = `
      <div class="card-top">
        <div>
          <span class="card-region">${spot.region} · ${spot.facingCardinal}</span>
          <h3 class="card-name">${spot.name}</h3>
        </div>
        <div class="card-score-badge ${scoreClass}">
          <span aria-hidden="true">★</span> ${spot.score.toFixed(1)}
        </div>
      </div>
      <div class="card-telemetry-row">
        <span class="card-wave"><span aria-hidden="true">🌊</span> ${spot.waveHeight || '–'} · ${spot.wavePeriod || '–'}</span>
        <span class="card-wind ${spot.windTag || ''}"><span aria-hidden="true">💨</span> ${spot.windSpeed || '–'}</span>
      </div>
      <div class="card-action-row">
        <span class="card-tide-info"><span aria-hidden="true">⏱️</span> ${spot.tidePref}</span>
        <a href="${spot.url}" target="_blank" rel="noopener noreferrer" class="card-direct-link" title="Abrir ${spot.name} directamente en Marea App">
          <span>Abrir</span>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 3h7v7M13 3L7 9"/>
          </svg>
        </a>
      </div>
    `;

    // Clic en la tarjeta selecciona y previsualiza en la página
    const selectHandler = (e) => {
      // Si hizo clic en el botón directo de enlace externo, dejamos que abra el enlace
      if (e.target.closest(".card-direct-link")) return;

      selectedSpot = spot;
      document.querySelectorAll(".spot-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      updateSpotDetail(spot);
      updateHeroMockup(spot);

      // Desplazamiento suave al detalle si estamos en móvil
      if (window.innerWidth < 768) {
        const detailEl = document.getElementById("spot-detail-container");
        if (detailEl) detailEl.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
      }
    };

    card.addEventListener("click", selectHandler);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectHandler(e);
      }
    });

    grid.appendChild(card);
  });
}

// Texto del contador: rango visible cuando hay más de una página
function textoContador(total, desde, visibles) {
  if (total === 0) {
    return currentQuery ? `Ningún spot para "${currentQuery}"` : "Ningún spot en esta zona";
  }

  const contexto = currentQuery
    ? ` para "${currentQuery}"`
    : currentRegion !== "all"
      ? " en esta zona"
      : "";

  if (total <= SPOTS_PER_PAGE) {
    return `Mostrando ${total} spot${total === 1 ? "" : "s"}${contexto}`;
  }

  return `Mostrando ${desde + 1}-${desde + visibles} de ${total} spots${contexto}`;
}

// Paginación: anterior, números de página y siguiente
function renderPagination(totalPaginas) {
  const pager = document.getElementById("spots-pagination");
  if (!pager) return;

  if (totalPaginas <= 1) {
    pager.hidden = true;
    pager.innerHTML = "";
    return;
  }

  pager.hidden = false;

  const flecha = (d) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  let html = `<button type="button" class="page-btn page-nav" data-nav="prev" aria-label="Página anterior"${currentPage === 1 ? " disabled" : ""}>${flecha("M10 3L5 8l5 5")}</button>`;

  // En pantallas estrechas los números no caben con objetivos táctiles decentes,
  // así que el CSS oculta los números y deja visible este indicador.
  html += `<span class="page-status">Página ${currentPage} de ${totalPaginas}</span>`;

  for (let i = 1; i <= totalPaginas; i++) {
    const actual = i === currentPage;
    html += `<button type="button" class="page-btn${actual ? " is-current" : ""}" data-page="${i}" aria-label="Página ${i}"${actual ? ' aria-current="page"' : ""}>${i}</button>`;
  }

  html += `<button type="button" class="page-btn page-nav" data-nav="next" aria-label="Página siguiente"${currentPage === totalPaginas ? " disabled" : ""}>${flecha("M6 3l5 5-5 5")}</button>`;

  pager.innerHTML = html;
}

// Cambiar de página vuelve a pintar la rejilla, así que recolocamos el foco en el
// control equivalente para que el teclado no se pierda al reconstruir la paginación
function goToPage(pagina, tipo) {
  currentPage = pagina;
  renderSpotCards();

  const pager = document.getElementById("spots-pagination");
  if (pager) {
    const selector =
      tipo === "prev" ? '[data-nav="prev"]' : tipo === "next" ? '[data-nav="next"]' : `[data-page="${pagina}"]`;
    let destino = pager.querySelector(selector);
    if (!destino || destino.disabled) {
      destino = pager.querySelector('[aria-current="page"]') || pager.querySelector('[data-page="1"]');
    }
    // preventScroll: el foco no debe arrastrar la página; de dónde queda la vista
    // lo decide el bloque de más abajo.
    if (destino) destino.focus({ preventScroll: true });
  }

  // Solo desplazamos si el arranque de la rejilla ha quedado por detrás de la
  // cabecera fija: si ya se ve entera, saltar sería un movimiento gratuito.
  const grid = document.getElementById("spots-cards-grid");
  if (!grid) return;

  const cabecera = document.querySelector(".site-header");
  const limite = cabecera ? cabecera.getBoundingClientRect().height : 0;
  if (grid.getBoundingClientRect().top < limite) {
    grid.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }
}

function initPagination() {
  const pager = document.getElementById("spots-pagination");
  if (!pager) return;

  pager.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;

    if (btn.dataset.nav === "prev") goToPage(currentPage - 1, "prev");
    else if (btn.dataset.nav === "next") goToPage(currentPage + 1, "next");
    else if (btn.dataset.page) goToPage(Number(btn.dataset.page), "page");
  });
}

function initSearchInput() {
  const searchInput = document.getElementById("spots-search-input");
  const clearBtn = document.getElementById("spots-search-clear");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    currentQuery = e.target.value;
    if (clearBtn) {
      clearBtn.style.display = currentQuery ? "block" : "none";
    }
    // Cambiar el filtro siempre devuelve a la primera página
    currentPage = 1;
    renderSpotCards();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      currentQuery = "";
      clearBtn.style.display = "none";
      searchInput.focus();
      currentPage = 1;
      renderSpotCards();
    });
  }
}

function initRegionTabs() {
  const tabs = document.querySelectorAll(".region-tabs .tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-pressed", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-pressed", "true");
      currentRegion = tab.dataset.region || "all";
      currentPage = 1;
      renderSpotCards();
    });
  });
}

// ==========================================================================
// 3. ACTUALIZACIÓN DEL DETALLE DEL SPOT Y ENLACE DIRECTO
// ==========================================================================

function updateSpotDetail(spot) {
  if (!spot) return;

  const elTag = document.getElementById("detail-tag");
  const elName = document.getElementById("detail-name");
  const elDesc = document.getElementById("detail-desc");
  const elStars = document.getElementById("detail-stars");
  const elScoreNum = document.getElementById("detail-score-num");
  const elScoreText = document.getElementById("detail-score-text");

  const elWaveH = document.getElementById("detail-wave-height");
  const elWaveP = document.getElementById("detail-wave-period");
  const elBuoy = document.getElementById("detail-buoy-dist");
  const elWindS = document.getElementById("detail-wind-speed");
  const elWindD = document.getElementById("detail-wind-dir");
  const elTideS = document.getElementById("detail-tide-state");
  const elTideC = document.getElementById("detail-tide-coef");
  const elAdvice = document.getElementById("detail-advice");
  const elAppLink = document.getElementById("detail-app-link");

  if (elTag) elTag.textContent = `${spot.region.toUpperCase()} · COSTA ESPAÑOLA`;
  if (elName) elName.textContent = `${spot.name} (${spot.region})`;
  if (elDesc) elDesc.textContent = `Orientación ${spot.facing}° (${spot.facingCardinal}) · Marea ideal: ${spot.tidePref}`;

  const score = spot.score != null ? spot.score : 3.5;
  const fullStars = "★".repeat(Math.min(5, Math.max(1, Math.round(score))));
  if (elStars) elStars.textContent = fullStars;
  if (elScoreNum) elScoreNum.textContent = score.toFixed(1);

  let statusClass = "tag-fair";
  let statusText = "Condiciones Aceptables";
  if (score >= 4.5) { statusClass = "tag-epic"; statusText = "Condiciones Épicas"; }
  else if (score >= 3.5) { statusClass = "tag-good"; statusText = "Buenas Condiciones"; }
  else if (score < 1.5) { statusClass = "tag-flat"; statusText = "Mar Plano / Poco Oleaje"; }

  if (elScoreText) {
    elScoreText.textContent = spot.ratingText || statusText;
    elScoreText.className = `score-status-pill ${statusClass}`;
  }

  if (elWaveH) elWaveH.textContent = spot.waveHeight || "1,4 m";
  if (elWaveP) elWaveP.textContent = `Periodo ${spot.wavePeriod || '10 s'} · Rumbo ${spot.waveDir || spot.facingCardinal}`;
  if (elBuoy) elBuoy.textContent = `Puerto / Boya: ${spot.port || spot.region}`;
  if (elWindS) elWindS.textContent = spot.windSpeed || "7 nudos";
  if (elWindD) {
    elWindD.textContent = `${spot.windLabel || 'Viento'} (${spot.facingCardinal})`;
    elWindD.className = `metric-detail ${spot.windTag || ''}`;
  }
  if (elTideS) elTideS.textContent = spot.tideState || "Media marea";
  if (elTideC) elTideC.textContent = `Marea recomendada: ${spot.tidePref}`;
  if (elAdvice) {
    elAdvice.textContent = `Spot situado en ${spot.region}. Consulta el detalle horario en directo en la app de Marea para ver la predicción de oleaje y boyas más cercanas.`;
  }

  // Actualizamos el enlace directo al spot específico en Render:
  if (elAppLink) {
    elAppLink.href = spot.url || `https://marea.onrender.com/#/spot/${spot.id}`;
    elAppLink.textContent = `Abrir ${spot.name} en la App ↗`;
  }
}

function updateHeroMockup(spot) {
  if (!spot) return;

  const elTitle = document.getElementById("hero-spot-title");
  const elSub = document.getElementById("hero-spot-subtitle");
  const elScore = document.getElementById("hero-score-val");
  const elBadge = document.getElementById("hero-score-badge");
  const elReason = document.getElementById("hero-spot-reason");
  const elWaveVal = document.getElementById("hero-wave-val");
  const elWaveSub = document.getElementById("hero-wave-sub");
  const elWindVal = document.getElementById("hero-wind-val");
  const elWindSub = document.getElementById("hero-wind-sub");
  const elTideVal = document.getElementById("hero-tide-val");
  const elTideSub = document.getElementById("hero-tide-sub");
  const elWinVal = document.getElementById("hero-window-val");

  if (elTitle) elTitle.textContent = `${spot.name} · ${spot.region}`;
  if (elSub) elSub.textContent = `Orientación ${spot.facingCardinal} · Marea óptima: ${spot.tidePref}`;

  const score = spot.score != null ? spot.score : 3.5;
  if (elScore) elScore.textContent = score.toFixed(1);

  let statusClass = "tag-fair";
  let statusText = "Aceptable";
  if (score >= 4.5) { statusClass = "tag-epic"; statusText = "Épico"; }
  else if (score >= 3.5) { statusClass = "tag-good"; statusText = "Bueno"; }
  else if (score < 1.5) { statusClass = "tag-flat"; statusText = "Plato"; }

  if (elBadge) {
    elBadge.textContent = spot.ratingText || statusText;
    elBadge.className = `score-label ${statusClass}`;
  }

  if (elReason) {
    elReason.textContent = `Oleaje y viento en tiempo real para ${spot.name}. Abre la app para ver el desglose hora a hora con curvas de marea del IHM.`;
  }

  if (elWaveVal) elWaveVal.textContent = spot.waveHeight || "1,4 m";
  if (elWaveSub) elWaveSub.textContent = `${spot.wavePeriod || '10 s'} · ${spot.waveDir || spot.facingCardinal}`;
  if (elWindVal) elWindVal.textContent = spot.windSpeed || "6 kn";
  if (elWindSub) {
    elWindSub.textContent = spot.windLabel || "Viento local";
    elWindSub.className = `box-sub ${spot.windTag || ''}`;
  }
  if (elTideVal) elTideVal.textContent = spot.tideState || "Media marea";
  if (elTideSub) elTideSub.textContent = `Ideal en ${spot.tidePref}`;
  if (elWinVal) elWinVal.textContent = "Ver en la App";
}

// ==========================================================================
// 4. SINCRONIZACIÓN EN VIVO DESDE LA API DE RENDER
// ==========================================================================

async function syncLiveTelemetry() {
  try {
    const res = await fetch("https://marea.onrender.com/api/spots", { mode: "cors" });
    if (!res.ok) return;
    const data = await res.json();

    if (data && Array.isArray(data.spots)) {
      const liveMap = new Map(data.spots.map(s => [s.id, s]));

      function cardinal(deg) {
        if (deg == null) return '-';
        const c = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
        return c[Math.round(((deg % 360) / 22.5)) % 16];
      }

      allSpots.forEach(s => {
        const live = liveMap.get(s.id);
        if (live) {
          if (live.score != null) s.score = Math.round(live.score * 10) / 10;
          if (live.now?.h != null) s.waveHeight = live.now.h.toFixed(1).replace('.', ',') + ' m';
          if (live.now?.T != null) s.wavePeriod = Math.round(live.now.T) + ' s';
          if (live.now?.dir != null) s.waveDir = cardinal(live.now.dir);
          if (live.now?.wind != null) s.windSpeed = Math.round(live.now.wind) + ' kn';
          if (live.now?.windType?.label) s.windLabel = live.now.windType.label;
          if (live.now?.windType?.key === 'off') s.windTag = 'tag-terral';
          if (live.tide?.h != null) {
            s.tideState = (live.tide.rising ? 'Subiendo ' : 'Bajando ') + live.tide.h.toFixed(1).replace('.', ',') + ' m';
          }
        }
      });

      // Indicador de estado en vivo
      const indicator = document.getElementById("spots-count-indicator");
      if (indicator) {
        indicator.textContent = `🟢 Conectado a boyas en vivo · ${allSpots.length} spots`;
      }

      renderSpotCards();
      if (selectedSpot) {
        const updated = allSpots.find(s => s.id === selectedSpot.id) || selectedSpot;
        updateSpotDetail(updated);
        updateHeroMockup(updated);
      }
    }
  } catch {
    // Si la llamada falla o CORS está bloqueado por el navegador,
    // el sistema continúa funcionando a la perfección con la base de datos precargada.
  }
}

// ==========================================================================
// 5. SIMULADORES DE CURVA DE MAREA
// ==========================================================================

function initTideSliders() {
  // A) Deslizador del mockup del teléfono
  const heroSlider = document.getElementById("hero-time-slider");
  const heroHourText = document.getElementById("slider-hour-display");
  const heroCursor = document.getElementById("hero-tide-cursor");
  const heroDot = document.getElementById("hero-tide-dot");

  if (heroSlider && heroHourText && heroCursor && heroDot) {
    heroSlider.addEventListener("input", (e) => {
      const hour = parseInt(e.target.value, 10);
      const strH = String(hour).padStart(2, "0");
      heroHourText.textContent = `${strH}:00 (Simulada)`;

      const x = (hour / 23) * 460;
      const y = 50 + 28 * Math.sin((hour / 23) * Math.PI * 3.8);

      heroCursor.setAttribute("x1", x);
      heroCursor.setAttribute("x2", x);
      heroDot.setAttribute("cx", x);
      heroDot.setAttribute("cy", y);
    });
  }

  // B) Simulador de marea 24h grande
  const bigSlider = document.getElementById("interactive-tide-range");
  const bigHourVal = document.getElementById("ctrl-hour-val");
  const bigHeightVal = document.getElementById("ctrl-height-val");
  const bigScoreVal = document.getElementById("ctrl-score-val");
  const bigPhase = document.getElementById("interactive-tide-phase");
  const bigCursorLine = document.getElementById("interactive-cursor-line");
  const bigCursorDot = document.getElementById("interactive-cursor-dot");

  if (bigSlider && bigHourVal && bigHeightVal && bigScoreVal && bigCursorLine && bigCursorDot) {
    bigSlider.addEventListener("input", (e) => {
      const hour = parseInt(e.target.value, 10);
      const strH = String(hour).padStart(2, "0");
      bigHourVal.textContent = `${strH}:00`;

      // Simulación sinusoidal semidiurna (0.5m a 3.9m)
      const tAngle = (hour / 12.4) * Math.PI * 2;
      const height = 2.2 + 1.6 * Math.cos(tAngle);
      const derivative = -1.6 * Math.sin(tAngle);

      bigHeightVal.textContent = `${height.toFixed(2)} m`;

      let phaseText = "Media marea";
      if (derivative > 0.5) phaseText = "Subiendo (Llenante)";
      else if (derivative < -0.5) phaseText = "Bajando (Vaciante)";
      else if (height > 3.0) phaseText = "Pleamar (Llena)";
      else if (height < 1.4) phaseText = "Bajamar (Seca)";

      if (bigPhase) bigPhase.textContent = phaseText;

      let dynamicScore = 4.9;
      if (height > 3.2) dynamicScore = 3.6;
      else if (height > 2.4) dynamicScore = 4.2;
      else if (height < 1.2) dynamicScore = 4.9;

      const stars = "★".repeat(Math.round(dynamicScore));
      bigScoreVal.textContent = `${stars} ${dynamicScore.toFixed(1)}`;

      const x = (hour / 23) * 600;
      const svgY = 190 - ((height - 0.5) / 3.4) * 160;

      bigCursorLine.setAttribute("x1", x);
      bigCursorLine.setAttribute("x2", x);
      bigCursorDot.setAttribute("cx", x);
      bigCursorDot.setAttribute("cy", svgY);
    });
  }
}

// ==========================================================================
// 6. MODAL DE AYUDA PWA
// ==========================================================================

function initPwaGuideModal() {
  const btnShow = document.getElementById("btn-show-pwa-guide");
  const btnClose = document.getElementById("btn-close-pwa-guide");
  const guideBox = document.getElementById("pwa-guide-box");

  if (btnShow && guideBox) {
    btnShow.addEventListener("click", () => {
      guideBox.style.display = guideBox.style.display === "none" ? "block" : "none";
      if (guideBox.style.display === "block") {
        guideBox.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
      }
    });
  }

  if (btnClose && guideBox) {
    btnClose.addEventListener("click", () => {
      guideBox.style.display = "none";
    });
  }
}

// ==========================================================================
// 7. COMPARTIR EN REDES Y PORTAPAPELES
// ==========================================================================

function initSharingButtons() {
  const shareUrl = "https://olopezr.github.io/marea/";
  const shareTitle = "Marea — Telemetría de surf y boyas en tiempo real para España";
  const shareText = "Mira esta app de surf para España: datos en directo de boyas de Puertos del Estado, mareas oficiales IHM y 83 spots calibrados sin anuncios:";

  const btnWa = document.getElementById("btn-share-wa");
  if (btnWa) {
    btnWa.addEventListener("click", () => {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`;
      window.open(waUrl, "_blank");
    });
  }

  const btnTg = document.getElementById("btn-share-tg");
  if (btnTg) {
    btnTg.addEventListener("click", () => {
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
      window.open(tgUrl, "_blank");
    });
  }

  const btnCopy = document.getElementById("btn-copy-url");
  const copyTextBtn = document.getElementById("copy-text-btn");
  const copyToast = document.getElementById("copy-toast");

  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (copyTextBtn) copyTextBtn.textContent = "¡Copiado!";
        if (copyToast) {
          copyToast.style.display = "inline-block";
          setTimeout(() => {
            copyToast.style.display = "none";
            if (copyTextBtn) copyTextBtn.textContent = "Copiar Enlace";
          }, 3000);
        }
      } catch {
        alert("Enlace: " + shareUrl);
      }
    });
  }

  const btnHeroShare = document.getElementById("btn-share-hero");
  if (btnHeroShare) {
    btnHeroShare.addEventListener("click", () => {
      if (navigator.share) {
        navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        }).catch(() => {});
      } else {
        const shareSection = document.getElementById("compartir");
        if (shareSection) shareSection.scrollIntoView({ behavior: scrollBehavior() });
      }
    });
  }
}

// ==========================================================================
// 8. CANVAS OCEÁNICO DE FONDO
// ==========================================================================

function initOceanCanvas() {
  const canvas = document.getElementById("ocean-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const particleCount = Math.min(35, Math.floor(width / 35));

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.4 + 0.1
    });
  }

  let step = 0;

  function render() {
    ctx.clearRect(0, 0, width, height);
    step += 0.015;

    for (let p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(86, 230, 245, ${p.alpha * (0.6 + 0.4 * Math.sin(step + p.x))})`;
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  const prefersReduced = prefersReducedMotion();
  if (!prefersReduced) {
    render();
  }
}

// ==========================================================================
// 9. MENÚ DE NAVEGACIÓN MÓVIL
// ==========================================================================

function initNavToggle() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("primary-nav");
  if (!toggle || !nav) return;

  const mobileQuery = window.matchMedia("(max-width: 1199px)");

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Cerrar el menú de navegación" : "Abrir el menú de navegación"
    );
  };

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-open"));
  });

  // Cualquier enlace del panel cierra el menú tras navegar
  nav.addEventListener("click", (e) => {
    if (e.target.closest(".nav-item")) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("is-open")) return;
    if (e.target.closest("#primary-nav") || e.target.closest("#nav-toggle")) return;
    setOpen(false);
  });

  // En escritorio el panel deja de existir: limpiamos el estado al cambiar de tamaño
  mobileQuery.addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
}
