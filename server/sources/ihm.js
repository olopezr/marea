// Predicción oficial de mareas del Instituto Hidrográfico de la Marina (IHM).
// La API da las horas en UTC y las alturas sobre el cero hidrográfico del puerto
// (contrastado con el mareógrafo de Santander de Puertos del Estado: bajamar del 1/10/2026
// predicha a las 12:12 con 0,93 m y medida a las 12:13 UTC con 0,89 m).
import fs from "node:fs/promises";
import path from "node:path";
import { cached, limiter } from "../cache.js";
import { DATA_DIR } from "../config.js";
import { km } from "../../public/js/surf.js";

const API = "https://ideihm.covam.es/api-ihm/getmarea";
// Como mucho 4 peticiones simultáneas al IHM, con un reintento.
const fetchJSON = limiter(4);

export function ports() {
  return cached("ihm:ports", 7 * 24 * 3600e3, async () => {
    const d = await fetchJSON(`${API}?request=getlist&format=json`);
    return d.estaciones.puertos.map((p) => ({ id: p.id, name: p.puerto, lat: +p.lat, lon: +p.lon }));
  });
}

// El IHM publica mareas del Atlántico, el Cantábrico, el Estrecho y Canarias, no del Mediterráneo
// (allí la marea es de pocos centímetros). Más allá de MAX_PORT_KM no hay puerto que represente al spot.
export const MAX_PORT_KM = 60;

export async function nearestPort(spot, maxKm = MAX_PORT_KM) {
  const list = await ports();
  const best = list.map((p) => ({ ...p, distKm: km(spot, p) })).sort((a, b) => a.distKm - b.distKm)[0];
  return best && best.distKm <= maxKm ? best : null;
}

const monthKey = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Las predicciones de un mes no cambian: se guardan en disco y cada mes y puerto se pide una sola vez
// (el IHM tarda más de 1 s por petición). Se renuevan pasados 30 días por si el IHM las revisa.
const DISK = path.join(DATA_DIR, "ihm");
const DISK_MAX_AGE = 30 * 24 * 3600e3;

async function fromDisk(file) {
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > DISK_MAX_AGE) return null;
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function month(port, yyyymm) {
  return cached(
    `ihm:${port.id}:${yyyymm}`,
    24 * 3600e3,
    async () => {
      const file = path.join(DISK, `${port.id}-${yyyymm}.json`);
      const saved = await fromDisk(file);
      if (saved) return saved;
      const d = await fetchJSON(`${API}?request=gettide&id=${port.id}&month=${yyyymm}&format=json`);
      const ext = d.mareas.datos.marea.map((m) => ({
        t: Date.parse(`${m.fecha}T${m.hora}:00Z`),
        h: +m.altura,
        type: m.tipo === "pleamar" ? "high" : "low",
      }));
      await fs.mkdir(DISK, { recursive: true });
      await fs.writeFile(file, JSON.stringify(ext)).catch(() => {});
      return ext;
    },
    { staleMs: 30 * 24 * 3600e3 },
  );
}

// Extremos entre `from` y `to` (ms), con uno de margen a cada lado para interpolar en los bordes.
export async function extremes(port, from, to) {
  const months = new Set();
  for (let t = from; t <= to + 86400e3; t += 86400e3) months.add(monthKey(t));
  const all = (await Promise.all([...months].map((m) => month(port, m)))).flat().sort((a, b) => a.t - b.t);
  const i0 = Math.max(0, all.findIndex((e) => e.t >= from) - 1);
  const i1 = all.findLastIndex((e) => e.t <= to) + 2;
  return all.slice(i0, i1);
}

// Estadísticas del puerto a partir de tres meses de predicciones (cubren varios ciclos de vivas y muertas):
// - carrera media: referencia del coeficiente (una marea de carrera media tiene coeficiente 70);
// - nivel medio: media de pleamares y bajamares, sobre el cero hidrográfico del puerto.
function stats(port, now = Date.now()) {
  return cached(`ihm:stats:${port.id}:${monthKey(now)}`, 30 * 24 * 3600e3, async () => {
    const keys = [-31, 0, 31].map((d) => monthKey(now + d * 86400e3));
    const ext = (await Promise.all(keys.map((k) => month(port, k)))).flat().sort((a, b) => a.t - b.t);
    let sum = 0,
      n = 0;
    for (let i = 1; i < ext.length; i++) {
      if (ext[i].type !== ext[i - 1].type) {
        sum += Math.abs(ext[i].h - ext[i - 1].h);
        n++;
      }
    }
    if (!n) throw new Error("sin datos del puerto");
    return { meanRange: sum / n, meanLevel: ext.reduce((a, e) => a + e.h, 0) / ext.length };
  });
}

export const meanRange = async (port, now) => (await stats(port, now)).meanRange;
export const meanLevel = async (port, now) => (await stats(port, now)).meanLevel;
