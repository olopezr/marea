import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "marea-srv-")),
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => String(d).includes("escuchando") && resolve());
    proc.on("exit", (code) => reject(new Error(`el servidor terminó con código ${code}`)));
  });
});
after(() => proc.kill());

test("health responde", async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("sirve la app con cabeceras de seguridad", async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(await r.text(), /<title>Marea<\/title>/);
});

test("las páginas legales existen", async () => {
  for (const p of ["/legal/privacidad.html", "/legal/aviso-legal.html", "/legal/fuentes.html", "/offline.html"]) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
});

test("no permite salir de la carpeta pública", async () => {
  const r = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok([403, 404].includes(r.status));
  assert.doesNotMatch(await r.text(), /"web-push"/);
});

test("404 para rutas desconocidas", async () => {
  assert.equal((await fetch(`${base}/no-existe`)).status, 404);
  assert.equal((await fetch(`${base}/api/spots/no-existe`)).status, 404);
  assert.equal((await fetch(`${base}/api/spots/no-existe/boya`)).status, 404);
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
});

test("la clave pública VAPID está disponible", async () => {
  const { publicKey } = await (await fetch(`${base}/api/push/key`)).json();
  assert.match(publicKey, /^[A-Za-z0-9_-]{80,}$/);
});

test("rechaza suscripciones mal formadas y cuerpos enormes", async () => {
  const bad = await fetch(`${base}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: { endpoint: "x" } }),
  });
  assert.equal(bad.status, 400);
  const notJson = await fetch(`${base}/api/push/status`, { method: "POST", body: "{nope" });
  assert.equal(notJson.status, 400);
  const huge = await fetch(`${base}/api/push/status`, {
    method: "POST",
    body: JSON.stringify({ endpoint: "x".repeat(20000) }),
  }).catch(() => ({ status: 413 }));
  assert.equal(huge.status, 413);
});

test("HSTS, URL mal formada y cuerpo que no es un objeto", async () => {
  assert.match((await fetch(`${base}/`)).headers.get("strict-transport-security"), /max-age=/);
  assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 400);
  const r = await fetch(`${base}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "null",
  });
  assert.equal(r.status, 400);
});

test("CORS solo para la landing y solo en la API de lectura", async () => {
  const ok = await fetch(`${base}/api/push/key`, { headers: { Origin: "https://olopezr.github.io" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://olopezr.github.io");
  const other = await fetch(`${base}/api/push/key`, { headers: { Origin: "https://evil.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("rutas de recorrido de carpetas y bytes nulos no filtran archivos", async () => {
  for (const p of [
    "/..%2f..%2fserver%2findex.js",
    "/%2e%2e/%2e%2e/package.json",
    "/js/..%2f..%2f..%2f.env",
    "/%00.html",
    "/js/%",
  ]) {
    const r = await fetch(base + p);
    assert.ok([400, 403, 404].includes(r.status), `${p} → ${r.status}`);
    assert.doesNotMatch(await r.text(), /"web-push"|createServer|VAPID_PRIVATE/, p);
  }
});

test("un cuerpo demasiado grande recibe 413 y un JSON roto 400", async () => {
  const big = await fetch(`${base}/api/push/status`, { method: "POST", body: "a".repeat(20_000) });
  assert.equal(big.status, 413);
  const bad = await fetch(`${base}/api/push/status`, { method: "POST", body: "{no" });
  assert.equal(bad.status, 400);
  const arr = await fetch(`${base}/api/push/status`, { method: "POST", body: "[1]" });
  assert.equal(arr.status, 400);
});

test("subscribe rechaza endpoints que no son de servicios push y tipos inesperados", async () => {
  const post = (body) => fetch(`${base}/api/push/subscribe`, { method: "POST", body: JSON.stringify(body) });
  for (const endpoint of [
    "http://fcm.googleapis.com/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://fcm.googleapis.com:8443/x",
    42,
  ]) {
    const r = await post({ subscription: { endpoint, keys: { p256dh: "a", auth: "b" } }, spots: ["somo"] });
    assert.equal(r.status, 400, String(endpoint));
  }
  assert.equal((await post({ device: { platform: "ios", token: { a: 1 } } })).status, 400);
  assert.equal((await post({ device: { platform: "__proto__", token: "x" } })).status, 400);
});

test("la CSP no permite scripts ni estilos en línea (solo atributos style)", async () => {
  const csp = (await fetch(`${base}/`)).headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.match(csp, /style-src-elem 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("health informa de los fallos de las fuentes", async () => {
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(typeof h.sourceErrors, "object");
});
