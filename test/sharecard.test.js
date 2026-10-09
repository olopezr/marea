import { test } from "node:test";
import assert from "node:assert/strict";
import { cardModel, fitSize } from "../public/js/sharecard.js";

const helpers = {
  t: (k) => ({ "card.wind": "Viento", "card.tide": "Marea", "card.water": "Agua" })[k] ?? k,
  fmt: (x, d = 1) => x.toFixed(d).replace(".", ","),
  cardinal: () => "NO",
  windPhrase: (wt, kn) => `viento ${wt.key} de ${kn} kn`,
  ratingLabel: (k) => ({ good: "Bueno" })[k] ?? k,
  lang: "es",
  host: "marea.test",
  now: Date.UTC(2026, 9, 9, 8, 30),
};
const data = {
  meta: { name: "Somo", region: "Cantabria", tz: "Europe/Madrid" },
  s: { score: 3.4, buoy: { water: 17.6 } },
  n: { h: 1.5, T: 8, dir: 315, wind: 4, windType: { key: "off" } },
  r: { key: "good" },
  tide: { h: 2.31, rising: false },
};

test("cardModel reúne los textos de la tarjeta", () => {
  const m = cardModel(data, helpers);
  assert.equal(m.title, "Somo");
  assert.equal(m.subtitle, "Cantabria");
  assert.equal(m.rating, "Bueno");
  assert.equal(m.height, "1,5");
  assert.equal(m.line, "8 s · NO");
  assert.deepEqual(m.stats, [
    { label: "Viento", value: "viento off de 4 kn" },
    { label: "Marea", value: "2,3 m ↘" },
    { label: "Agua", value: "18 °C" },
  ]);
  assert.match(m.stamp, /10:30/); // hora del spot (Madrid, verano)
  assert.equal(m.host, "marea.test");
});

test("cardModel omite la marea y la temperatura del agua si no hay dato", () => {
  const m = cardModel({ ...data, tide: null, s: { score: 3.4 } }, helpers);
  assert.deepEqual(
    m.stats.map((x) => x.label),
    ["Viento"],
  );
});

test("fitSize reduce la letra hasta que el texto cabe y respeta el mínimo", () => {
  const ctx = {
    font: "",
    // 0,5 px de ancho por carácter y por píxel de letra
    measureText(text) {
      return { width: text.length * 0.5 * Number(/(\d+)px/.exec(this.font)[1]) };
    },
  };
  const font = (px) => `800 ${px}px X`;
  assert.equal(fitSize(ctx, "Somo", 880, 112, 52, font), 112); // cabe a tamaño completo
  const long = "Nazaré (Praia do Norte)"; // 23 caracteres
  const size = fitSize(ctx, long, 880, 112, 52, font);
  assert.ok(size < 112 && size >= 52);
  ctx.font = font(size);
  assert.ok(ctx.measureText(long).width <= 880);
  assert.equal(fitSize(ctx, "x".repeat(400), 880, 112, 52, font), 52); // no baja del mínimo
});
