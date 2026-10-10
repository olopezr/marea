import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRule, ruleFromForm } from "../public/js/rules.js";

test("normalizeRule quita los valores por defecto", () => {
  assert.equal(normalizeRule({ hMin: 0, hMax: 10, windMax: 60, wind: "any", tide: "any", ahead: 24 }), null);
  assert.deepEqual(normalizeRule({ hMin: 1, hMax: 10, wind: "any" }), { hMin: 1 });
});

test("normalizeRule ajusta rangos y redondea", () => {
  assert.deepEqual(normalizeRule({ hMin: -3, hMax: 99 }), null);
  assert.deepEqual(normalizeRule({ hMin: 1.26, hMax: 2.04 }), { hMin: 1.3, hMax: 2 });
  assert.deepEqual(normalizeRule({ windMax: 12.6, ahead: 100 }), { windMax: 13, ahead: 48 });
  assert.equal(normalizeRule({ ahead: 2 }), null, "la antelación sola no es una regla (el servidor la descarta)");
  assert.deepEqual(normalizeRule({ windMax: 20, ahead: 2 }), { windMax: 20, ahead: 6 });
  assert.deepEqual(normalizeRule({ windMax: 0 }), { windMax: 0 });
});

test("normalizeRule intercambia hMin y hMax si vienen al revés", () => {
  assert.deepEqual(normalizeRule({ hMin: 2.5, hMax: 1 }), { hMin: 1, hMax: 2.5 });
});

test("normalizeRule descarta valores no válidos", () => {
  assert.equal(normalizeRule(null), null);
  assert.equal(normalizeRule("x"), null);
  assert.equal(normalizeRule({ hMin: "abc", windMax: NaN, wind: "on", tide: "x", ahead: null }), null);
  assert.deepEqual(normalizeRule({ wind: "off", tide: "mid" }), { wind: "off", tide: "mid" });
});

test("ruleFromForm convierte los campos del formulario (cadenas) en una regla", () => {
  assert.deepEqual(ruleFromForm({ hMin: "1,5", hMax: "", windMax: "15", wind: true, tide: "low", ahead: "36" }), {
    hMin: 1.5,
    windMax: 15,
    wind: "off",
    tide: "low",
    ahead: 36,
  });
  assert.equal(ruleFromForm({ hMin: "", hMax: "", windMax: "", wind: false, tide: "any", ahead: "24" }), null);
});
