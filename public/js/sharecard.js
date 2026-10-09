// Tarjeta de condiciones para compartir: se dibuja en un canvas (sin dependencias) y sale como imagen PNG.
export const CARD = { w: 1080, h: 1350 };

// Textos y datos de la tarjeta, sin dibujar nada: así se puede probar sin navegador.
export function cardModel(
  { meta, s, n, r, tide },
  { t, fmt, cardinal, windPhrase, ratingLabel, lang, host = "", now = Date.now() },
) {
  const water = s.buoy?.water ?? n.water;
  const stats = [
    { label: t("card.wind"), value: windPhrase(n.windType, n.wind) },
    tide?.h != null && { label: t("card.tide"), value: `${fmt(tide.h)} m ${tide.rising ? "↗" : "↘"}` },
    water != null && { label: t("card.water"), value: `${fmt(water, 0)} °C` },
  ].filter(Boolean);
  const stamp = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: meta.tz,
  }).format(now);
  return {
    title: meta.name,
    subtitle: meta.region,
    rating: ratingLabel(r.key),
    ratingKey: r.key,
    score: s.score,
    height: fmt(n.h),
    line: `${fmt(n.T, 0)} s · ${cardinal(n.dir)}`,
    stats,
    stamp,
    host,
  };
}

// Mayor tamaño de letra, entre `min` y `start`, con el que `text` cabe en `maxWidth`.
export function fitSize(ctx, text, maxWidth, start, min, font) {
  let size = start;
  for (; size > min; size -= 4) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return min;
}

const F = {
  display: (px) => `800 ${px}px "Archivo", "Arial Narrow", sans-serif`,
  body: (px, w = 400) => `${w} ${px}px "Figtree", system-ui, sans-serif`,
  mono: (px) => `700 ${px}px "JetBrains Mono", ui-monospace, monospace`,
};

function pill(ctx, x, y, w, h, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Dibuja la tarjeta y la devuelve como PNG. `color` es el color de la calidad (--q-*).
export async function renderCard(model, color = "#7c9a26") {
  await Promise.all([F.display(40), F.body(40), F.body(40, 600), F.mono(40)].map((f) => document.fonts.load(f))).catch(
    () => {},
  );
  const canvas = document.createElement("canvas");
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const ctx = canvas.getContext("2d");
  const M = 72;
  const W = CARD.w - 2 * M;

  const bg = ctx.createLinearGradient(0, 0, 0, CARD.h);
  bg.addColorStop(0, "#0f3a47");
  bg.addColorStop(1, "#06161b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD.w, CARD.h);

  // Olas de adorno al pie.
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 6;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let x = 0; x <= CARD.w; x += 8) {
      const y = CARD.h - 90 + k * 26 + Math.sin((x / CARD.w) * Math.PI * 4 + k) * 14;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = F.display(36);
  ctx.textAlign = "left";
  ctx.fillText("MAREA", M, 110);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = F.body(30);
  ctx.textAlign = "right";
  ctx.fillText(model.stamp, CARD.w - M, 110);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  const size = fitSize(ctx, model.title, W, 112, 52, F.display);
  ctx.font = F.display(size);
  ctx.fillText(model.title, M, 250);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = F.body(40);
  ctx.fillText(model.subtitle, M, 312);

  // Calidad: etiqueta de color y cinco barras con la puntuación.
  ctx.font = F.display(40);
  const label = model.rating.toUpperCase();
  const lw = ctx.measureText(label).width + 64;
  pill(ctx, M, 370, lw, 76, color);
  ctx.fillStyle = "#06161b";
  ctx.fillText(label, M + 32, 424);
  for (let i = 0; i < 5; i++) {
    const x = M + lw + 36 + i * 64;
    pill(ctx, x, 396, 52, 24, "rgba(255,255,255,0.15)");
    const f = Math.max(0, Math.min(1, model.score - i));
    if (f > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, 396, 52 * f, 24, 12);
      ctx.clip();
      pill(ctx, x, 396, 52, 24, color);
      ctx.restore();
    }
  }

  // Altura de ola, grande.
  ctx.fillStyle = "#ffffff";
  ctx.font = F.display(330);
  ctx.fillText(model.height, M, 790);
  const hw = ctx.measureText(model.height).width;
  ctx.font = F.display(110);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("m", M + hw + 24, 790);
  ctx.fillStyle = "#ffffff";
  ctx.font = F.mono(64);
  ctx.fillText(model.line, M, 880);

  // Resto de datos.
  let y = 930;
  for (const st of model.stats) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = F.body(28, 600);
    ctx.fillText(st.label.toUpperCase(), M, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = F.body(
      fitSize(ctx, st.value, W, 54, 30, (px) => F.body(px, 600)),
      600,
    );
    ctx.fillText(st.value, M, y + 58);
    y += 116;
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = F.body(30);
  ctx.fillText(model.host, M, CARD.h - 50);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen"))), "image/png"),
  );
}
