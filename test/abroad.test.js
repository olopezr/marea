import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

installFetch();
const { nearestReading } = await import("../server/sources/portus.js");
const { spotById, isSpain } = await import("../public/js/spots.js");

// A unos 150 km al sur de la boya de prueba (43,6 N, 3,7 O), con el mar hacia el norte.
const at = (tz) => ({ id: `test-${tz}`, lat: 42.25, lon: -3.7, facing: 0, tz });

test("isSpain distingue los spots de España de los de Portugal y Francia", () => {
  assert.equal(isSpain(spotById.somo), true);
  assert.equal(isSpain(spotById.famara), true); // Canarias
  assert.equal(isSpain(spotById.guincho), false);
  assert.equal(isSpain(spotById.hossegor), false);
});

test("en España una boya profunda lejana sirve de referencia", async () => {
  const r = await nearestReading(at("Europe/Madrid"));
  assert.ok(r, "con la zona horaria de España se usa la boya lejana");
  assert.equal(r.buoy.far, true);
});

test("fuera de España no se usa una boya lejana: mide otro mar", async () => {
  assert.equal(await nearestReading(at("Europe/Lisbon")), null);
  assert.equal(await nearestReading(at("Europe/Paris")), null);
});
