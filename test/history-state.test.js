import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryState } from "../public/js/history-state.js";

test("empieza cerrado en cualquier spot", () => {
  assert.equal(createHistoryState().isOpen("somo"), false);
});

test("abrir y cerrar se recuerda para el mismo spot (sobrevive al refresco)", () => {
  const s = createHistoryState();
  s.set("somo", true);
  assert.equal(s.isOpen("somo"), true);
  s.set("somo", false);
  assert.equal(s.isOpen("somo"), false);
});

test("al abrir otro spot el anterior se olvida", () => {
  const s = createHistoryState();
  s.set("somo", true);
  s.set("laredo", true);
  assert.equal(s.isOpen("somo"), false);
  assert.equal(s.isOpen("laredo"), true);
});

test("cerrar un spot no afecta al abierto de otro", () => {
  const s = createHistoryState();
  s.set("somo", true);
  s.set("laredo", false);
  assert.equal(s.isOpen("somo"), true);
});

test("reset deja todo cerrado", () => {
  const s = createHistoryState();
  s.set("somo", true);
  s.reset();
  assert.equal(s.isOpen("somo"), false);
});
