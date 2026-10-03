import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, fixName } from "../server/sources/portus.js";

test("fixName cierra paréntesis, quita espacios y pone tildes conocidas", () => {
  assert.equal(fixName("Somo (Ribamontan al Mar"), "Somo (Ribamontán al Mar)");
  assert.equal(fixName("Playa de las Americas (Arona)"), "Playa de las Américas (Arona)");
  assert.equal(fixName("Laida (Ibarraguelua)"), "Laida (Ibarranguelua)");
  assert.equal(fixName("  Gijon  2 "), "Gijón 2");
  assert.equal(fixName("Liencres (Piélagos)"), "Liencres (Piélagos)");
});

test("cleanName deja solo el lugar en nombres de PORTUS reales", () => {
  const cases = {
    "Estacion Meteorologica de Bilbao Espigón 2 (APB-5)": "Bilbao Espigón 2",
    "Estacion Meteorologica del Puerto Exterior ": "Puerto Exterior de Ferrol",
    "Estacion Meteorológica del Pto. Deportivo": "puerto deportivo de Avilés",
    "Estación Meteorólogica de Raíces": "Raíces",
    "Estación Meteo. Málaga Dique Levante Sur": "Málaga Dique Levante Sur",
    "Estac. Meteo. Sagunto Norte": "Sagunto Norte",
    "E. Meteorológica de Alicante Parque del Mar": "Alicante Parque del Mar",
    "Est. Meteorológica de Pta. Carnero": "Pta. Carnero",
    "Estacion Meteo. Barcelona Adosado Bocana Norte": "Barcelona Adosado Bocana Norte",
    "Boya de Cabo de Peñas": "Cabo de Peñas",
    "Boya Costera de Bilbao II": "Bilbao II",
    "Boya de Muros-CETMAR-INTECMAR-MG": "Muros",
    "Mareografo de Gijon 2": "Gijón 2",
    "Mareógrafo de San Cibrao": "San Cibrao",
    "Mareografo de Villagarcia 2": "Villagarcía 2",
    "Plataforma de Rande-CETMAR-INTECMAR-MG": "Rande",
  };
  for (const [raw, clean] of Object.entries(cases)) assert.equal(cleanName(raw), clean, raw);
});
