import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "../server/request.js";

const req = (headers, remoteAddress = "10.0.0.1") => ({ headers, socket: { remoteAddress } });

test("la IP del cliente no se puede falsear con X-Forwarded-For", () => {
  assert.equal(clientIp(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" })), "203.0.113.7");
  // Sin Cloudflare: el último valor, el que añade el proxy, no el primero que escribe el cliente.
  assert.equal(clientIp(req({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" })), "198.51.100.9");
  assert.equal(clientIp(req({})), "10.0.0.1");
});
