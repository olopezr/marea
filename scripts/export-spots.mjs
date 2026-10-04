// Copia la lista de spots (public/js/spots.js) a las apps nativas: node scripts/export-spots.mjs
// test/native-spots.test.js comprueba que las copias están al día.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SPOTS } from "../public/js/spots.js";

export const TARGETS = ["ios/Marea/Resources/spots.json", "android/app/src/main/assets/spots.json"];
export const spotsJSON = () =>
  JSON.stringify(
    SPOTS.map(({ id, name, region, lat, lon, facing, tide, tz, webcam }) => {
      const s = { id, name, region, lat, lon, facing, tide, tz };
      if (webcam) s.webcam = webcam;
      return s;
    }),
    null,
    1,
  ) + "\n";

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const t of TARGETS) fs.writeFileSync(new URL(`../${t}`, import.meta.url), spotsJSON());
  console.log(`Spots copiados a ${TARGETS.join(" y ")}`);
}
