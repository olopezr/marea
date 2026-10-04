import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

// IHM caído y boya a la deriva (a ~40 km de su posición).
installFetch({ ihmFail: true, buoy: { lat: 43.95, lon: -3.7 } });
const { overview, detail } = await import("../server/conditions.js");
const { spotById } = await import("../public/js/spots.js");

test("si el IHM no responde se usa la marea del modelo y se indica", async () => {
  const somo = (await overview()).spots.find((s) => s.id === "somo");
  assert.equal(somo.tide.source, "model");
  assert.equal(somo.tide.port, null);
  assert.ok(somo.tide.next, "sigue habiendo próxima pleamar o bajamar");
});

test("una boya fuera de su posición no se muestra", async () => {
  const somo = await detail(spotById.somo);
  assert.equal(somo.buoy, null);
});
