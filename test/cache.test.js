import { test } from "node:test";
import assert from "node:assert/strict";
import { cached, clearMemoryCache } from "../server/cache.js";

test("cached sirve el último dato bueno y no reintenta la fuente hasta pasado retryMs", async () => {
  let calls = 0,
    fail = false;
  const loader = async () => {
    calls++;
    if (fail) throw new Error("caída");
    return calls;
  };
  assert.equal(await cached("k1", 0, loader), 1);
  fail = true;
  assert.equal(await cached("k1", 0, loader, { retryMs: 60e3 }), 1, "sirve el dato anterior");
  assert.equal(await cached("k1", 0, loader, { retryMs: 60e3 }), 1);
  assert.equal(calls, 2, "solo un intento fallido, sin repetir en cada llamada");
});

test("cached sin dato previo propaga el error sin volver a llamar durante retryMs", async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    throw new Error("caída");
  };
  await assert.rejects(cached("k2", 1000, loader, { retryMs: 60e3 }), /caída/);
  await assert.rejects(cached("k2", 1000, loader, { retryMs: 60e3 }), /caída/);
  assert.equal(calls, 1);
});

test("cached recupera el valor persistido en SQLite tras limpiar la memoria", async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    return { weather: "waves", temp: 21 };
  };
  const val1 = await cached("persist:key", 60e3, loader);
  assert.deepEqual(val1, { weather: "waves", temp: 21 });
  assert.equal(calls, 1);

  // Simula un reinicio del proceso borrando la caché en memoria RAM
  clearMemoryCache();

  // Debe recuperar el valor desde SQLite sin llamar de nuevo a loader()
  const val2 = await cached("persist:key", 60e3, loader);
  assert.deepEqual(val2, { weather: "waves", temp: 21 });
  assert.equal(calls, 1, "no debe volver a llamar a la fuente si está en disco");
});
