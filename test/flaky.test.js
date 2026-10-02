import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

// PORTUS responde 503 a la primera petición de cada lectura.
installFetch({ flaky: true });
const { detail } = await import("../server/conditions.js");
const { spotById } = await import("../public/js/spots.js");

test("si PORTUS falla una vez, se reintenta y el spot conserva su boya", async () => {
  const somo = await detail(spotById.somo);
  assert.ok(somo.buoy, "la boya aparece tras el reintento");
  assert.equal(somo.buoy.h, 2.5);
});
