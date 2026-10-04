/**
 * Marea Landing Page Interactive Logic
 * Handles spot exploration, real-time tide slider simulations,
 * canvas ocean dynamics, and social sharing.
 */

// 1. DATASET OF EMBLEMATIC SPOTS IN SPAIN
const SPOTS_DATA = [
  {
    id: "somo",
    name: "Somo",
    beach: "Playa de Somo",
    region: "cantabrico",
    regionLabel: "Cantabria · Ribamontán al Mar",
    facing: "NNO (340°)",
    tidePref: "Media marea subiendo",
    buoy: "Boya IEO Santander (a 14 km)",
    waveHeight: "2,2 m",
    wavePeriod: "13 s",
    waveDir: "NO (305°)",
    windSpeed: "7 kn",
    windDir: "Terral Sur (Offshore)",
    windTag: "tag-terral",
    tideState: "Bajamar 0,7 m",
    tideCoef: "Coeficiente 82 (Vivas)",
    score: 4.8,
    statusText: "Condiciones Épicas",
    statusClass: "tag-epic",
    bestWindow: "10:00 - 13:30",
    advice: "El pico de Somo aguanta tamaño con el banco de arena actual. Sesión limpia con viento sur suave durante toda la mañana."
  },
  {
    id: "mundaka",
    name: "Mundaka",
    beach: "Barra de Mundaka",
    region: "euskadi",
    regionLabel: "País Vasco · Urdaibai (Bizkaia)",
    facing: "NNE (020°)",
    tidePref: "Bajamar a media marea",
    buoy: "Boya Bilbao-Vizcaya (a 18 km)",
    waveHeight: "2,6 m",
    wavePeriod: "14 s",
    waveDir: "NO (315°)",
    windSpeed: "6 kn",
    windDir: "Terral SO (Offshore puro)",
    windTag: "tag-terral",
    tideState: "Bajamar seca 0,5 m",
    tideCoef: "Coeficiente 86 (Mareas vivas)",
    score: 5.0,
    statusText: "Legendario",
    statusClass: "tag-epic",
    bestWindow: "11:30 - 14:45",
    advice: "La barra izquierda más famosa de Europa funcionando a la perfección con periodo largo y coeficiente alto."
  },
  {
    id: "rodiles",
    name: "Rodiles",
    beach: "Playa y Ría de Rodiles",
    region: "cantabrico",
    regionLabel: "Asturias · Villaviciosa",
    facing: "N (005°)",
    tidePref: "Bajamar seca",
    buoy: "Boya Cabo Peñas (a 22 km)",
    waveHeight: "1,9 m",
    wavePeriod: "12 s",
    waveDir: "NO (310°)",
    windSpeed: "5 kn",
    windDir: "Terral Sur (Valle)",
    windTag: "tag-terral",
    tideState: "Bajamar 0,6 m",
    tideCoef: "Coeficiente 80",
    score: 4.7,
    statusText: "Excelente",
    statusClass: "tag-epic",
    bestWindow: "09:30 - 12:30",
    advice: "La izquierda de la desembocadura rompe tubular sobre el banco de arena. Ideal entrar con marea baja."
  },
  {
    id: "zarautz",
    name: "Zarautz",
    beach: "Playa de Zarautz",
    region: "euskadi",
    regionLabel: "País Vasco · Gipuzkoa",
    facing: "NNO (335°)",
    tidePref: "Media marea a pleamar",
    buoy: "Boya Pasaia (a 24 km)",
    waveHeight: "1,6 m",
    wavePeriod: "11 s",
    waveDir: "NO (320°)",
    windSpeed: "8 kn",
    windDir: "Terral ONO suave",
    windTag: "tag-terral",
    tideState: "Media subiendo 2,1 m",
    tideCoef: "Coeficiente 76",
    score: 4.3,
    statusText: "Muy Bueno",
    statusClass: "tag-good",
    bestWindow: "14:00 - 17:30",
    advice: "Múltiples picos a lo largo del arenal. Zona del restaurante Arguiñano y el centro ofreciendo derechas consistentes."
  },
  {
    id: "elpalmar",
    name: "El Palmar",
    beach: "Playa de El Palmar",
    region: "sur",
    regionLabel: "Andalucía · Vejer (Cádiz)",
    facing: "SO (225°)",
    tidePref: "Todas las mareas",
    buoy: "Boya de Cádiz (a 28 km)",
    waveHeight: "1,4 m",
    wavePeriod: "11 s",
    waveDir: "Oeste (260°)",
    windSpeed: "9 kn",
    windDir: "Levante Offshore ESE",
    windTag: "tag-terral",
    tideState: "Media marea 1,5 m",
    tideCoef: "Coeficiente 74",
    score: 4.6,
    statusText: "Épico",
    statusClass: "tag-epic",
    bestWindow: "08:30 - 12:00",
    advice: "El levante suave abre paredes muy limpias en los picos de la torre. Periodo atlántico empujando bien."
  },
  {
    id: "pantin",
    name: "Pantín",
    beach: "Playa de Pantín",
    region: "galicia",
    regionLabel: "Galicia · Valdoviño (A Coruña)",
    facing: "NO (315°)",
    tidePref: "Todas las mareas",
    buoy: "Boya Estaca de Bares (a 31 km)",
    waveHeight: "2,4 m",
    wavePeriod: "13 s",
    waveDir: "NO (300°)",
    windSpeed: "10 kn",
    windDir: "Terral SE",
    windTag: "tag-terral",
    tideState: "Bajamar 0,8 m",
    tideCoef: "Coeficiente 82",
    score: 4.5,
    statusText: "Muy Bueno",
    statusClass: "tag-good",
    bestWindow: "10:30 - 15:00",
    advice: "La fábrica de olas gallega. Mucha consistencia y potencia en la orilla derecha protegida por las rocas."
  },
  {
    id: "salinas",
    name: "Salinas",
    beach: "Playa de Salinas y El Espartal",
    region: "cantabrico",
    regionLabel: "Asturias · Castrillón",
    facing: "NNO (330°)",
    tidePref: "Media marea a baja",
    buoy: "Boya Cabo Peñas (a 12 km)",
    waveHeight: "1,8 m",
    wavePeriod: "12 s",
    waveDir: "NO (315°)",
    windSpeed: "6 kn",
    windDir: "Terral SO",
    windTag: "tag-terral",
    tideState: "Bajamar 0,7 m",
    tideCoef: "Coeficiente 78",
    score: 4.3,
    statusText: "Bueno",
    statusClass: "tag-good",
    bestWindow: "09:00 - 12:30",
    advice: "Buenas secciones en la zona del balneario. Viento terral matutino manteniendo el mar liso."
  },
  {
    id: "famara",
    name: "Famara",
    beach: "Playa de Famara",
    region: "islas",
    regionLabel: "Canarias · Teguise (Lanzarote)",
    facing: "NNO (325°)",
    tidePref: "Media marea",
    buoy: "Boya Gran Canaria (a 45 km)",
    waveHeight: "1,7 m",
    wavePeriod: "12 s",
    waveDir: "NNO (330°)",
    windSpeed: "11 kn",
    windDir: "Alisio ENE suave",
    windTag: "tag-terral",
    tideState: "Media subiendo 1,6 m",
    tideCoef: "Coeficiente 75",
    score: 4.4,
    statusText: "Muy Bueno",
    statusClass: "tag-good",
    bestWindow: "08:00 - 11:30",
    advice: "El risco de Famara amortigua el alisio temprano. Olas rápidas y tuberas con fondo de arena y lajas."
  }
];

let selectedSpot = SPOTS_DATA[0];

// ==========================================================================
// 2. DOM INITIALIZATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initOceanCanvas();
  renderSpotCards("all");
  updateSpotDetail(selectedSpot);
  updateHeroMockup(selectedSpot);
  initTideSliders();
  initRegionTabs();
  initPwaGuideModal();
  initSharingButtons();
});

// Real-time clock inside mockup
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
// 3. RENDER SPOTS & INTERACTIVE SELECTION
// ==========================================================================

function renderSpotCards(filterRegion) {
  const grid = document.getElementById("spots-cards-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = filterRegion === "all" 
    ? SPOTS_DATA 
    : SPOTS_DATA.filter(s => s.region === filterRegion);

  filtered.forEach(spot => {
    const card = document.createElement("div");
    card.className = `spot-card ${spot.id === selectedSpot.id ? "selected" : ""}`;
    card.dataset.id = spot.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Ver telemetría de ${spot.name}`);

    card.innerHTML = `
      <div class="card-top">
        <div>
          <span class="card-region">${spot.regionLabel.split("·")[0].trim()}</span>
          <h4 class="card-name">${spot.name}</h4>
        </div>
        <div class="card-score-badge ${spot.statusClass}">
          <span>★</span> ${spot.score.toFixed(1)}
        </div>
      </div>
      <div class="card-telemetry-row">
        <span class="card-wave">🌊 ${spot.waveHeight} · ${spot.wavePeriod}</span>
        <span class="card-wind ${spot.windTag}">💨 ${spot.windSpeed}</span>
      </div>
    `;

    const selectHandler = () => {
      selectedSpot = spot;
      document.querySelectorAll(".spot-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      updateSpotDetail(spot);
      updateHeroMockup(spot);
    };

    card.addEventListener("click", selectHandler);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectHandler();
      }
    });

    grid.appendChild(card);
  });
}

function initRegionTabs() {
  const tabs = document.querySelectorAll(".region-tabs .tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderSpotCards(tab.dataset.region);
    });
  });
}

function updateSpotDetail(spot) {
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

  if (elTag) elTag.textContent = spot.regionLabel.toUpperCase();
  if (elName) elName.textContent = `${spot.name} · ${spot.beach}`;
  if (elDesc) elDesc.textContent = `Orientación ${spot.facing} · Marea óptima: ${spot.tidePref}`;
  
  const fullStars = "★".repeat(Math.round(spot.score));
  if (elStars) elStars.textContent = fullStars;
  if (elScoreNum) elScoreNum.textContent = spot.score.toFixed(1);
  if (elScoreText) {
    elScoreText.textContent = spot.statusText;
    elScoreText.className = `score-status-pill ${spot.statusClass}`;
  }

  if (elWaveH) elWaveH.textContent = spot.waveHeight;
  if (elWaveP) elWaveP.textContent = `Periodo ${spot.wavePeriod} · Rumbo ${spot.waveDir}`;
  if (elBuoy) elBuoy.textContent = spot.buoy;
  if (elWindS) elWindS.textContent = spot.windSpeed;
  if (elWindD) {
    elWindD.textContent = spot.windDir;
    elWindD.className = `metric-detail ${spot.windTag}`;
  }
  if (elTideS) elTideS.textContent = spot.tideState;
  if (elTideC) elTideC.textContent = spot.tideCoef;
  if (elAdvice) elAdvice.textContent = spot.advice;
}

function updateHeroMockup(spot) {
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

  if (elTitle) elTitle.textContent = `${spot.name} · ${spot.regionLabel.split("·")[0].trim()}`;
  if (elSub) elSub.textContent = `${spot.beach} · ${spot.buoy}`;
  if (elScore) elScore.textContent = spot.score.toFixed(1);
  if (elBadge) {
    elBadge.textContent = spot.statusText;
    elBadge.className = `score-label ${spot.statusClass}`;
  }
  if (elReason) elReason.textContent = spot.advice;
  if (elWaveVal) elWaveVal.textContent = spot.waveHeight;
  if (elWaveSub) elWaveSub.textContent = `${spot.wavePeriod} · ${spot.waveDir}`;
  if (elWindVal) elWindVal.textContent = spot.windSpeed;
  if (elWindSub) {
    elWindSub.textContent = spot.windDir;
    elWindSub.className = `box-sub ${spot.windTag}`;
  }
  if (elTideVal) elTideVal.textContent = spot.tideState;
  if (elTideSub) elTideSub.textContent = spot.tideCoef;
  if (elWinVal) elWinVal.textContent = spot.bestWindow;
}

// ==========================================================================
// 4. INTERACTIVE TIDE SLIDERS
// ==========================================================================

function initTideSliders() {
  // A) Hero mockup slider
  const heroSlider = document.getElementById("hero-time-slider");
  const heroHourText = document.getElementById("slider-hour-display");
  const heroCursor = document.getElementById("hero-tide-cursor");
  const heroDot = document.getElementById("hero-tide-dot");

  if (heroSlider && heroHourText && heroCursor && heroDot) {
    heroSlider.addEventListener("input", (e) => {
      const hour = parseInt(e.target.value, 10);
      const strH = String(hour).padStart(2, "0");
      heroHourText.textContent = `${strH}:00 (Simulada)`;

      // Map hour (0-23) to SVG X coordinate (0 to 460)
      const x = (hour / 23) * 460;
      // Sinusoidal wave height calculation
      const y = 50 + 28 * Math.sin((hour / 23) * Math.PI * 3.8);

      heroCursor.setAttribute("x1", x);
      heroCursor.setAttribute("x2", x);
      heroDot.setAttribute("cx", x);
      heroDot.setAttribute("cy", y);
    });
  }

  // B) Big feature tide slider
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

      // Calculate realistic semi-diurnal tide in northern Spain (0.5m to 3.9m)
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

      // Quality score based on tide (Rodiles likes low to mid-low)
      let dynamicScore = 4.9;
      if (height > 3.2) dynamicScore = 3.6;
      else if (height > 2.4) dynamicScore = 4.2;
      else if (height < 1.2) dynamicScore = 4.9;

      const stars = "★".repeat(Math.round(dynamicScore));
      bigScoreVal.textContent = `${stars} ${dynamicScore.toFixed(1)}`;

      // SVG cursor positioning (0-600 width, 0-200 height)
      const x = (hour / 23) * 600;
      // Invert Y because SVG 0 is top
      const svgY = 190 - ((height - 0.5) / 3.4) * 160;

      bigCursorLine.setAttribute("x1", x);
      bigCursorLine.setAttribute("x2", x);
      bigCursorDot.setAttribute("cx", x);
      bigCursorDot.setAttribute("cy", svgY);
    });
  }
}

// ==========================================================================
// 5. PWA GUIDE MODAL TOGGLE
// ==========================================================================

function initPwaGuideModal() {
  const btnShow = document.getElementById("btn-show-pwa-guide");
  const btnClose = document.getElementById("btn-close-pwa-guide");
  const guideBox = document.getElementById("pwa-guide-box");

  if (btnShow && guideBox) {
    btnShow.addEventListener("click", () => {
      guideBox.style.display = guideBox.style.display === "none" ? "block" : "none";
      if (guideBox.style.display === "block") {
        guideBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
// 6. SOCIAL SHARING & DISTRIBUTION
// ==========================================================================

function initSharingButtons() {
  const shareUrl = window.location.href.split("#")[0];
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
        if (shareSection) shareSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  }
}

// ==========================================================================
// 7. BACKGROUND OCEAN CANVAS (SUBTLE WAVE MOTION)
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

    // Draw subtle glowing oceanic particles
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

  // Only animate if reduced motion is not preferred
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReduced) {
    render();
  }
}
