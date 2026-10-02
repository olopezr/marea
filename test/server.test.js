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
    env: { ...process.env, NODE_ENV: "test", PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "marea-srv-")), VAPID_SUBJECT: "mailto:test@example.com" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", d => String(d).includes("escuchando") && resolve());
    proc.on("exit", code => reject(new Error(`el servidor terminó con código ${code}`)));
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
  const bad = await fetch(`${base}/api/push/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: { endpoint: "x" } }) });
  assert.equal(bad.status, 400);
  const notJson = await fetch(`${base}/api/push/status`, { method: "POST", body: "{nope" });
  assert.equal(notJson.status, 400);
  const huge = await fetch(`${base}/api/push/status`, { method: "POST", body: JSON.stringify({ endpoint: "x".repeat(20000) }) }).catch(() => ({ status: 413 }));
  assert.equal(huge.status, 413);
});
