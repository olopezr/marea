import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

// La boya buena está marcada como no disponible; hay otra más cercana averiada y sin datos.
installFetch({ buoyFlag: false, brokenNearby: true });
const { detail } = await import("../server/conditions.js");
const { spotById } = await import("../public/js/spots.js");

test("se usa una boya que transmite aunque PORTUS la marque como no disponible", async () => {
  const somo = await detail(spotById.somo);
  assert.equal(somo.buoy.buoy.name, "Prueba");
  assert.equal(somo.buoy.h, 2.5);
});

test("una boya más cercana pero sin datos se salta", async () => {
  const somo = await detail(spotById.somo);
  assert.notEqual(somo.buoy.buoy.name, "Rota");
});
