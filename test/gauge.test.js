import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./fixtures.js";

// Mareógrafo cuyas lecturas no se parecen a la marea del puerto.
installFetch({ gaugeWild: true });
const { detail } = await import("../server/conditions.js");
const { spotById } = await import("../public/js/spots.js");

test("un mareógrafo cuyas lecturas no encajan con la marea del puerto no se dibuja", async () => {
  const d = await detail(spotById.somo);
  assert.equal(d.tideDay.observed, null);
  assert.ok(d.tideDay.points.length > 0, "la predicción sigue ahí");
});
