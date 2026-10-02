import { test } from "node:test";
import assert from "node:assert/strict";
import { cached } from "../server/cache.js";

test("cached sirve el último dato bueno y no reintenta la fuente hasta pasado retryMs", async () => {
  let calls = 0, fail = false;
  const loader = async () => { calls++; if (fail) throw new Error("caída"); return calls; };
  assert.equal(await cached("k1", 0, loader), 1);
  fail = true;
  assert.equal(await cached("k1", 0, loader, { retryMs: 60e3 }), 1, "sirve el dato anterior");
  assert.equal(await cached("k1", 0, loader, { retryMs: 60e3 }), 1);
  assert.equal(calls, 2, "solo un intento fallido, sin repetir en cada llamada");
});

test("cached sin dato previo propaga el error sin volver a llamar durante retryMs", async () => {
  let calls = 0;
  const loader = async () => { calls++; throw new Error("caída"); };
  await assert.rejects(cached("k2", 1000, loader, { retryMs: 60e3 }), /caída/);
  await assert.rejects(cached("k2", 1000, loader, { retryMs: 60e3 }), /caída/);
  assert.equal(calls, 1);
});
