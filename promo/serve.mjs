// Servidor estático para la animación: public/ en "/" (fuentes, estilos y módulos de la app) y promo/ en "/promo/".
// Uso directo para previsualizar: node serve.mjs  →  http://127.0.0.1:8098/promo/index.html?play
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".wav": "audio/wav" };

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p === "/") { res.writeHead(302, { location: "/promo/index.html?play" }); return res.end(); }
    const file = path.normalize(p.startsWith("/promo/") ? path.join(REPO, p) : path.join(REPO, "public", p));
    if (!file.startsWith(REPO + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("No encontrado"); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () =>
    resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve(+process.env.PORT || 8098);
  console.log(`Vídeo en ${url}/promo/index.html?play`);
}
