// Servidor de Marea: sirve la PWA y la API /api. Sin frameworks: node:http.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spotById } from "../public/js/spots.js";
import { overview, detail } from "./conditions.js";
import { nearestReading } from "./sources/portus.js";
import * as push from "./push.js";
import { clientIp } from "./request.js";

const PORT = +process.env.PORT || 8080;
const PUBLIC = path.resolve(import.meta.dirname, "../public");
const started = Date.now();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://tiles.openfreemap.org",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

// La landing (GitHub Pages) lee la lista de spots en directo. Solo lectura y solo esos orígenes.
const CORS_ORIGINS = new Set(
  (process.env.CORS_ORIGINS ?? "https://olopezr.github.io")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

// Límite sencillo por IP para las rutas que escriben.
const hits = new Map();
function limited(ip, max = 30, windowMs = 10 * 60e3) {
  const now = Date.now();
  if (hits.size > 10_000) hits.clear(); // tope de memoria ante muchas IP distintas
  const h = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  h.push(now);
  hits.set(ip, h);
  return h.length > max;
}
setInterval(() => hits.clear(), 60 * 60e3).unref();

// Mensajes de error en inglés para las apps y navegadores en ese idioma (Accept-Language).
const EN_ERRORS = {
  "Spot no encontrado": "Spot not found",
  "Ruta no encontrada": "Route not found",
  "Método no permitido": "Method not allowed",
  "Demasiadas peticiones. Prueba dentro de unos minutos.": "Too many requests. Try again in a few minutes.",
  "No se pudieron obtener los datos del mar. Inténtalo de nuevo en unos minutos.":
    "Couldn't get the sea data. Try again in a few minutes.",
  "No hay previsión disponible para este spot ahora mismo": "There's no forecast for this spot right now",
  "Token de dispositivo no válido": "Invalid device token",
  "Suscripción no válida": "Invalid subscription",
  "No hay suscripción para este dispositivo": "There's no subscription for this device",
  "El servicio de notificaciones rechazó el envío": "The notification service rejected the message",
  "Cuerpo demasiado grande": "Request body too large",
  "JSON no válido": "Invalid JSON",
};
const wantsEnglish = (req) => /^en\b/i.test(req.headers["accept-language"] ?? "");

function send(req, res, status, body, headers = {}) {
  if (body?.error && wantsEnglish(req)) body = { ...body, error: EN_ERRORS[body.error] ?? body.error };
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const type = headers["Content-Type"] ?? "application/json; charset=utf-8";
  const h = { ...SECURITY, "Content-Type": type, ...headers };
  if (
    buf.length > 1024 &&
    /json|text|javascript|svg|manifest/.test(type) &&
    /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")
  ) {
    buf = zlib.gzipSync(buf);
    h["Content-Encoding"] = "gzip";
    h["Vary"] = "Accept-Encoding";
  }
  h["Content-Length"] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === "HEAD" ? undefined : buf);
}

function readJSON(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Cuerpo demasiado grande"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        reject(Object.assign(new Error("JSON no válido"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function api(req, res, url) {
  const p = url.pathname;
  const ip = clientIp(req);
  const origin = req.headers.origin;
  const cors = origin && CORS_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
  const cache = { "Cache-Control": "public, max-age=300", ...cors };

  if (req.method === "GET" && p === "/api/health")
    return send(req, res, 200, { ok: true, uptimeS: Math.round((Date.now() - started) / 1000) });
  if (req.method === "GET" && p === "/api/spots") return send(req, res, 200, await overview(), cache);
  // Solo la boya de un spot: la lista la pide por tarjeta, cuando aparece en pantalla.
  const mb = p.match(/^\/api\/spots\/([\w-]+)\/boya$/);
  if (req.method === "GET" && mb) {
    const spot = spotById[mb[1]];
    if (!spot) return send(req, res, 404, { error: "Spot no encontrado" });
    // La lista solo necesita la última lectura y la tendencia: el historial va en el detalle.
    const b = await nearestReading(spot).catch(() => null);
    if (b) delete b.history;
    return send(req, res, 200, { buoy: b }, cache);
  }
  const m = p.match(/^\/api\/spots\/([\w-]+)$/);
  if (req.method === "GET" && m) {
    const spot = spotById[m[1]];
    return spot ? send(req, res, 200, await detail(spot), cache) : send(req, res, 404, { error: "Spot no encontrado" });
  }
  if (req.method === "GET" && p === "/api/push/key") return send(req, res, 200, { publicKey: push.publicKey }, cors);

  if (req.method === "POST" && p.startsWith("/api/push/")) {
    if (limited(ip)) return send(req, res, 429, { error: "Demasiadas peticiones. Prueba dentro de unos minutos." });
    const body = await readJSON(req);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw Object.assign(new Error("JSON no válido"), { status: 400 });
    if (p === "/api/push/subscribe") return send(req, res, 200, push.subscribe(body));
    if (p === "/api/push/unsubscribe") return send(req, res, 200, push.unsubscribe(String(body.endpoint ?? "")));
    if (p === "/api/push/status") return send(req, res, 200, push.status(String(body.endpoint ?? "")));
    if (p === "/api/push/test") return send(req, res, 200, await push.sendTest(String(body.endpoint ?? "")));
  }
  return send(req, res, 404, { error: "Ruta no encontrada" });
}

function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return send(req, res, 400, "Petición no válida", { "Content-Type": "text/plain; charset=utf-8" });
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep))
    return send(req, res, 403, "Prohibido", { "Content-Type": "text/plain; charset=utf-8" });
  fs.readFile(file, (err, data) => {
    if (err) {
      const fallback = path.join(PUBLIC, "404.html");
      return send(req, res, 404, fs.existsSync(fallback) ? fs.readFileSync(fallback) : "No encontrado", {
        "Content-Type": "text/html; charset=utf-8",
      });
    }
    const ext = path.extname(file);
    // Iconos y fuentes: caché larga. Resto: revalidar siempre (el service worker da el modo sin conexión).
    const cacheControl = /^\/(icons|fonts)\//.test(rel) ? "public, max-age=604800" : "no-cache";
    send(req, res, 200, data, {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": cacheControl,
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else send(req, res, 405, { error: "Método no permitido" });
  } catch (err) {
    const status = err.status ?? 502;
    if (status >= 500) console.error(`[api] ${req.method} ${url.pathname}:`, err.message);
    if (!res.headersSent)
      send(req, res, status, {
        error:
          status >= 500 ? "No se pudieron obtener los datos del mar. Inténtalo de nuevo en unos minutos." : err.message,
      });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `El puerto ${PORT} ya está en uso, probablemente por otra copia de Marea. Párala con Ctrl+C en su terminal o arranca en otro puerto: PORT=8081 npm start`,
    );
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, () => console.log(`Marea escuchando en http://localhost:${PORT}`));
const enableScheduler = process.env.ENABLE_SCHEDULER !== "false" && process.env.ENABLE_SCHEDULER !== "0";
const scheduler = enableScheduler ? push.startScheduler() : null;

// Precarga la lista al arrancar y la refresca cada 10 min, para que nadie espere a las fuentes.
const warm = () => overview().catch((err) => console.warn("[precarga]", err.message));
if (process.env.NODE_ENV !== "test") {
  setTimeout(warm, 1000).unref();
  setInterval(warm, 10 * 60e3).unref();
}

// El plan gratuito de Render duerme el servicio tras 15 min sin visitas externas. Visitarse a sí mismo
// por la URL pública (pasa por el proxy de Render, así que cuenta) lo mantiene despierto.
const selfUrl = process.env.KEEP_AWAKE_URL ?? process.env.RENDER_EXTERNAL_URL;
if (selfUrl && process.env.NODE_ENV !== "test") {
  const ping = () =>
    fetch(new URL("/api/health", selfUrl), { signal: AbortSignal.timeout(30e3) }).catch((err) =>
      console.warn("[despierto]", err.message),
    );
  setInterval(ping, 10 * 60e3).unref();
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (scheduler) clearInterval(scheduler);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
