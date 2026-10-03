import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TARGETS, spotsJSON } from "../scripts/export-spots.mjs";

test("las apps nativas tienen la lista de spots al día (node scripts/export-spots.mjs)", () => {
  for (const t of TARGETS) assert.equal(fs.readFileSync(new URL(`../${t}`, import.meta.url), "utf8"), spotsJSON(), t);
});
