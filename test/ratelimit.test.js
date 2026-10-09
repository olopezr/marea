import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../server/ratelimit.js";
import { clientIp } from "../server/request.js";

test("el límite caduca por ventana y es independiente por clave", () => {
  let t = 0;
  const limited = createLimiter(2, 1000, () => t);
  assert.equal(limited("a"), false);
  assert.equal(limited("a"), false);
  assert.equal(limited("a"), true);
  assert.equal(limited("b"), false);
  t = 1500;
  assert.equal(limited("a"), false);
});

test("al superar el tope se descartan las claves más antiguas, no todas", () => {
  const limited = createLimiter(1, 60e3);
  for (let i = 0; i < 12_000; i++) limited(`ip-${i}`);
  assert.equal(limited("ip-11999"), true);
});

test("TRUST_PROXY=false ignora las cabeceras del proxy", () => {
  const req = {
    headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" },
    socket: { remoteAddress: "10.0.0.1" },
  };
  assert.equal(clientIp(req, false), "10.0.0.1");
  assert.equal(clientIp(req, true), "203.0.113.7");
});
