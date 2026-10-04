import { test } from "node:test";
import assert from "node:assert/strict";
import {
  angDiff,
  cardinal,
  windType,
  waveParts,
  rate,
  rating,
  tideExtremes,
  curveFromExtremes,
  tideAt,
  tideNorm,
  localToUtc,
  hhmm,
  startOfLocalDay,
  dayLabel,
  fmt,
} from "../public/js/surf.js";

test("angDiff da la distancia angular más corta", () => {
  assert.equal(angDiff(350, 10), 20);
  assert.equal(angDiff(10, 350), 20);
  assert.equal(angDiff(0, 180), 180);
  assert.equal(angDiff(-90, 270), 0);
});

test("cardinal usa la rosa de 16 rumbos en español", () => {
  assert.equal(cardinal(0), "N");
  assert.equal(cardinal(315), "NO");
  assert.equal(cardinal(359), "N");
  assert.equal(cardinal(225), "SO");
  assert.equal(cardinal(null), "–");
});

test("windType clasifica el viento según la orientación de la playa", () => {
  // Playa orientada al norte (mira a 0°).
  assert.equal(windType(3, 180, 0).key, "calm");
  assert.equal(windType(10, 180, 0).key, "off"); // viene de tierra
  assert.equal(windType(10, 90, 0).key, "cross");
  assert.equal(windType(10, 10, 0).key, "on"); // viene del mar
  assert.equal(windType(null, 10, 0).key, "na");
});

test("waveParts usa el periodo del mar de fondo cuando domina", () => {
  assert.deepEqual(waveParts({ h: 2, T: 7, dir: 300, sh: 1.6, sT: 13, sDir: 320 }), { h: 2, T: 13, dir: 320 });
  assert.deepEqual(waveParts({ h: 2, T: 7, dir: 300, sh: 0.4, sT: 13, sDir: 320 }), { h: 2, T: 7, dir: 300 });
});

test("rate premia mar de fondo largo con terral y castiga viento de mar", () => {
  const base = { h: 1.6, T: 13, dir: 330, facing: 345 };
  const offshore = rate({ ...base, wind: 8, windDir: 165 });
  const onshore = rate({ ...base, wind: 20, windDir: 345 });
  assert.ok(offshore >= 4, `terral debería ser muy bueno, fue ${offshore}`);
  assert.ok(onshore < 2, `viento de mar fuerte debería ser pobre, fue ${onshore}`);
  assert.ok(rate({ ...base, h: 0.2, wind: 2, windDir: 165 }) < 1, "sin ola es plato");
  assert.ok(
    rate({ ...base, dir: 160, wind: 2, windDir: 165 }) < rate({ ...base, wind: 2, windDir: 165 }),
    "swell que no entra en la playa puntúa menos",
  );
  assert.equal(rate({ h: null, T: 10, facing: 0 }), 0);
});

test("rate se mantiene entre 0 y 5", () => {
  for (const h of [0, 0.5, 1, 2, 3, 5, 9])
    for (const T of [4, 8, 12, 18])
      for (const wind of [0, 10, 40]) {
        const s = rate({ h, T, dir: 0, wind, windDir: 0, facing: 0, tideNorm: 0.9, tidePref: "low" });
        assert.ok(s >= 0 && s <= 5);
      }
});

test("rating asigna etiquetas por tramos", () => {
  assert.equal(rating(0).key, "flat");
  assert.equal(rating(1.5).key, "poor");
  assert.equal(rating(2).key, "fair");
  assert.equal(rating(3.9).key, "good");
  assert.equal(rating(5).key, "epic");
});

test("tideExtremes encuentra pleamar y bajamar con precisión sub-horaria", () => {
  const H = 3600e3,
    period = 12.42;
  const times = Array.from({ length: 30 }, (_, i) => i * H);
  const levels = times.map((t) => 2 * Math.cos((2 * Math.PI * (t / H - 3.3)) / period));
  const ext = tideExtremes(times, levels);
  assert.equal(ext[0].type, "high");
  assert.ok(Math.abs(ext[0].t / H - 3.3) < 0.1, `pleamar a las ${ext[0].t / H} h`);
  assert.ok(Math.abs(ext[0].h - 2) < 0.05);
  assert.equal(ext[1].type, "low");
  assert.ok(Math.abs(ext[1].t / H - (3.3 + period / 2)) < 0.1);
});

test("curveFromExtremes pasa por los extremos y es monótona entre ellos", () => {
  const ext = [
    { t: 0, h: 1, type: "low" },
    { t: 6 * 3600e3, h: 4, type: "high" },
    { t: 12 * 3600e3, h: 1, type: "low" },
  ];
  const { times, levels } = curveFromExtremes(ext, 0, 12 * 3600e3, 3600e3);
  assert.equal(levels[0], 1);
  assert.equal(levels[6], 4);
  for (let i = 1; i <= 6; i++) assert.ok(levels[i] >= levels[i - 1]);
  assert.equal(tideAt(times, levels, 3 * 3600e3).rising, true);
  assert.ok(Math.abs(tideAt(times, levels, 3 * 3600e3).h - 2.5) < 1e-9, "a media marea está a mitad de altura");
  assert.ok(tideNorm(times, levels, 6 * 3600e3) > 0.99);
});

test("localToUtc convierte hora oficial, incluido el cambio de hora y Canarias", () => {
  // Verano peninsular (UTC+2) e invierno (UTC+1).
  assert.equal(new Date(localToUtc("2026-10-02", "06:49", "Europe/Madrid")).toISOString(), "2026-10-02T04:49:00.000Z");
  assert.equal(new Date(localToUtc("2026-12-02", "06:49", "Europe/Madrid")).toISOString(), "2026-12-02T05:49:00.000Z");
  // El 25 de octubre de 2026 a las 03:00 se vuelve a las 02:00.
  assert.equal(new Date(localToUtc("2026-10-25", "12:00", "Europe/Madrid")).toISOString(), "2026-10-25T11:00:00.000Z");
  assert.equal(new Date(localToUtc("2026-10-24", "12:00", "Europe/Madrid")).toISOString(), "2026-10-24T10:00:00.000Z");
  // Canarias va una hora por detrás.
  assert.equal(
    new Date(localToUtc("2026-10-02", "04:49", "Atlantic/Canary")).toISOString(),
    "2026-10-02T03:49:00.000Z",
  );
});

test("formato en la zona horaria del spot", () => {
  const t = Date.UTC(2026, 9, 2, 4, 49);
  assert.equal(hhmm(t, "Europe/Madrid"), "06:49");
  assert.equal(hhmm(t, "Atlantic/Canary"), "05:49");
  assert.equal(new Date(startOfLocalDay(t, "Europe/Madrid")).toISOString(), "2026-10-01T22:00:00.000Z");
  assert.match(dayLabel(t, "Europe/Madrid"), /^Vie 2$/);
  assert.equal(fmt(1.25), "1,3");
  assert.equal(fmt(null), "–");
});

test("withCoefficients da 70 a una marea de carrera media y escala con la carrera", async () => {
  const { withCoefficients, coefficientAt, coefLabel } = await import("../public/js/surf.js");
  const H = 3600e3;
  const ext = [
    { t: 0, h: 1, type: "low" },
    { t: 6 * H, h: 4, type: "high" },
    { t: 12 * H, h: 1, type: "low" },
    { t: 18 * H, h: 2.5, type: "high" },
    { t: 24 * H, h: 1, type: "low" },
  ];
  const out = withCoefficients(ext, 3); // carrera media del puerto: 3 m
  assert.equal(out[1].coef, 70, "carrera 3 m = media");
  assert.equal(out[3].coef, 35, "carrera 1,5 m = la mitad");
  assert.equal(out[0].coef, undefined, "las bajamares no llevan coeficiente");
  assert.equal(coefficientAt(out, 7 * H), 70);
  assert.equal(coefficientAt(out, 17 * H), 35);
  assert.equal(
    withCoefficients(
      [
        { t: 0, h: 9, type: "high" },
        { t: 1, h: 0, type: "low" },
      ],
      3,
    )[0].coef,
    120,
    "se limita a 120",
  );
  assert.deepEqual(withCoefficients(ext, null), ext, "sin carrera media no hay coeficientes");
  assert.equal(coefLabel(100), "vivas fuertes");
  assert.equal(coefLabel(40), "mareas muertas");
});

test("sunTimes calcula salida, puesta y crepúsculo civil (dawn/dusk)", async () => {
  const { sunTimes } = await import("../public/js/surf.js");
  const t = Date.UTC(2026, 9, 4, 12, 0); // 4 de octubre de 2026
  // Somo: lat 43.45, lon -3.74
  const st = sunTimes(t, 43.45, -3.74);
  assert.ok(st.rise > 0);
  assert.ok(st.set > st.rise);
  assert.ok(st.dawn < st.rise, "el amanecer civil (primera luz) es antes de la salida");
  assert.ok(st.dusk > st.set, "el anochecer civil (última luz) es después de la puesta");
  const diffDawn = (st.rise - st.dawn) / 60e3;
  assert.ok(diffDawn >= 25 && diffDawn <= 40, `el crepúsculo dura ~30 min, fue ${diffDawn} min`);
});

test("moonPhase calcula iluminación, fase y mareas vivas/muertas", async () => {
  const { moonPhase } = await import("../public/js/surf.js");
  // 6 de enero de 2000 fue luna nueva exacta
  const mNew = moonPhase(947182440000);
  assert.equal(mNew.key, "new");
  assert.equal(mNew.emoji, "🌑");
  assert.ok(mNew.illumination <= 5);
  assert.equal(mNew.isSpringTide, true);
  assert.equal(mNew.tideType, "springTide");

  // ~14.76 días después: luna llena
  const mFull = moonPhase(947182440000 + 14.765 * 86400e3);
  assert.equal(mFull.key, "full");
  assert.equal(mFull.emoji, "🌕");
  assert.ok(mFull.illumination >= 95);
  assert.equal(mFull.isSpringTide, true);
  assert.equal(mFull.tideType, "springTide");

  // ~7.38 días después: cuarto creciente (mareas muertas)
  const mQuarter = moonPhase(947182440000 + 7.38 * 86400e3);
  assert.equal(mQuarter.key, "firstQuarter");
  assert.equal(mQuarter.emoji, "🌓");
  assert.equal(mQuarter.isNeapTide, true);
  assert.equal(mQuarter.tideType, "neapTide");
});
