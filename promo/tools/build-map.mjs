// Genera assets/map.js: siluetas de España (península y Baleares, Canarias en recuadro) y países vecinos,
// una rejilla de puntos para el mapa y los parámetros de la proyección. Los spots no van aquí: la escena los
// proyecta al renderizar a partir de public/js/spots.js, así que el mapa siempre refleja la lista actual.
// Datos: Natural Earth 1:10m (dominio público) vía world-atlas.
import fs from "node:fs";
import * as topojson from "topojson-client";
import { geoMercator, geoPath, geoContains } from "d3-geo";

const topo = JSON.parse(fs.readFileSync(new URL("../node_modules/world-atlas/countries-10m.json", import.meta.url)));
const countries = topojson.feature(topo, topo.objects.countries).features;
const byId = id => countries.find(f => f.id === id);
const polysOf = f => (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates]);
const multi = coordinates => ({ type: "Feature", geometry: { type: "MultiPolygon", coordinates } });

const spain = byId("724");
const neighbours = ["620", "250", "020", "504", "012", "292"].map(byId).filter(Boolean); // Portugal, Francia, Andorra, Marruecos, Argelia, Gibraltar
const mainland = multi(polysOf(spain).filter(p => p[0][0][1] > 34.5 && p[0][0][0] > -10));
const canaries = multi(polysOf(spain).filter(p => p[0][0][1] < 30 && p[0][0][0] < -12));
const portugalMainland = multi(polysOf(byId("620")).filter(p => p[0][0][0] > -10 && p[0][0][1] > 36.5));

const W = 1920, H = 1080;
const box = [[780, 120], [1820, 860]];
const inset = [[800, 885], [1170, 1005]];
const proj = geoMercator().fitExtent(box, { type: "FeatureCollection", features: [mainland, portugalMainland] }).clipExtent([[0, 0], [W, H]]);
const projC = geoMercator().fitExtent(inset, canaries);
const path = geoPath(proj), pathC = geoPath(projC);
const round = d => d.replace(/(\d+\.\d)\d+/g, "$1");

const dots = [];
for (let y = 30; y < H - 20; y += 12) {
  for (let x = 640; x < W - 10; x += 12) {
    const ll = proj.invert([x, y]);
    if (geoContains(mainland, ll)) dots.push([x, y, 1]);
    else if (neighbours.some(f => geoContains(f, ll))) dots.push([x, y, 0]);
  }
}
for (let y = inset[0][1] - 12; y < inset[1][1] + 12; y += 6) {
  for (let x = inset[0][0] - 12; x < inset[1][0] + 12; x += 6) {
    if (geoContains(canaries, projC.invert([x, y]))) dots.push([x, y, 2]);
  }
}

const out = {
  W, H, box, inset,
  // Mercator de d3 sin rotación: x = tx + k·λ, y = ty − k·ln(tan(π/4 + φ/2)), con λ y φ en radianes.
  proj: { k: proj.scale(), t: proj.translate() },
  projC: { k: projC.scale(), t: projC.translate() },
  spain: round(path(mainland)),
  canaries: round(pathC(canaries)),
  context: neighbours.map(f => round(path(f) ?? "")).filter(Boolean),
  dots,
};
const file = new URL("../assets/map.js", import.meta.url);
fs.writeFileSync(file, `// Generado por tools/build-map.mjs a partir de Natural Earth (dominio público). No editar a mano.\nwindow.MAP = ${JSON.stringify(out)};\n`);
console.log(`map.js: ${dots.length} puntos, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
