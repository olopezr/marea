// Qué boyas "ven" el mismo mar que cada playa: node scripts/buoy-sight.mjs
// Para cada playa y cada boya candidata se comprueba, con el modelo de elevación de Open-Meteo
// (0 = mar), si la línea entre el punto mar adentro de la playa y la boya cruza tierra (un cabo, una
// isla). Si la cruza, esa boya mide otro mar y no se usa para la playa. La geografía no cambia: el
// resultado se guarda en server/data/buoy-sight.json y solo hay que repetirlo al añadir playas o boyas.
// Open-Meteo cuenta cada punto como una llamada: se agrupan de 100 en 100 y se espacian las peticiones.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPOTS } from "../public/js/spots.js";
import { km, bearing, angDiff } from "../public/js/surf.js";
import { offshorePoint } from "../server/sources/openmeteo.js";

const OUT = fileURLToPath(new URL("../server/data/buoy-sight.json", import.meta.url));
const buoys = (
  await fetch("https://portus.puertos.es/portussvr/api/estaciones/rt/WAVE?locale=es").then((r) => r.json())
)
  .filter((s) => s.boya && s.red?.tipoRed !== "PROPAGACION")
  .map((s) => ({ id: s.id, lat: s.latitud, lon: s.longitud }));

const pairs = [];
for (const s of SPOTS) {
  const from = offshorePoint(s);
  for (const b of buoys) {
    const d = km(s, b);
    // Solo las boyas candidatas: a menos de 100 km (más lejos solo se usan las de aguas profundas, que
    // no se filtran) y por delante o a lo largo de la costa de la playa (hasta 110°).
    if (d > 100 || d < 10 || angDiff(bearing(s, b), s.facing) > 110) continue;
    const n = Math.min(20, Math.max(3, Math.ceil(d / 5))); // un punto cada ~5 km
    const pts = Array.from({ length: n - 1 }, (_, i) => ({
      lat: from.lat + ((b.lat - from.lat) * (i + 1)) / n,
      lon: from.lon + ((b.lon - from.lon) * (i + 1)) / n,
    }));
    pairs.push({ spot: s.id, buoy: b.id, pts });
  }
}
const all = pairs.flatMap((p) => p.pts);
console.log(`${pairs.length} pares playa-boya, ${all.length} puntos`);
// Las elevaciones ya consultadas se guardan para poder reanudar si Open-Meteo corta por límite de llamadas.
const CACHE = path.join(os.tmpdir(), "marea-elevaciones.json");
const known = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const key = (p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
const missing = [...new Map(all.filter((p) => !(key(p) in known)).map((p) => [key(p), p])).values()];
console.log(`${missing.length} por consultar (${all.length - missing.length} ya guardadas)`);
for (let i = 0; i < missing.length; i += 100) {
  const ch = missing.slice(i, i + 100);
  const u = `https://api.open-meteo.com/v1/elevation?latitude=${ch.map((p) => p.lat.toFixed(4)).join(",")}&longitude=${ch.map((p) => p.lon.toFixed(4)).join(",")}`;
  for (let tries = 0; ; tries++) {
    const r = await fetch(u);
    if (r.ok) {
      (await r.json()).elevation.forEach((v, j) => {
        known[key(ch[j])] = v;
      });
      fs.writeFileSync(CACHE, JSON.stringify(known));
      break;
    }
    if (tries > 70) throw new Error(`Open-Meteo ${r.status}`); // el límite por hora puede tardar en levantarse
    await new Promise((res) => setTimeout(res, 65_000));
  }
  await new Promise((res) => setTimeout(res, 11_000));
  process.stdout.write(`\r${Math.min(i + 100, missing.length)}/${missing.length}`);
}
const elev = all.map((p) => known[key(p)]);
let k = 0;
const blocked = {};
for (const p of pairs) {
  const e = elev.slice(k, k + p.pts.length);
  k += p.pts.length;
  if (e.some((v) => v > 0)) (blocked[p.spot] ??= []).push(p.buoy);
}
fs.writeFileSync(
  OUT,
  JSON.stringify({ generado: new Date().toISOString().slice(0, 10), bloqueadas: blocked }, null, 1) + "\n",
);
console.log(
  `\nGuardado en server/data/buoy-sight.json (${Object.keys(blocked).length} playas con boyas tapadas por tierra)`,
);
