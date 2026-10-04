// Línea de tiempo y configuración de escenas a 124 BPM (30 segundos).
export const BPM = 124;
export const BEAT = 60 / BPM; // ~0.48387 s
export const BAR = 4 * BEAT;  // ~1.93548 s
export const W = 1920;
export const H = 1080;
export const DURATION = 30.0;

export const SCENES = {
  hook:   { start: 0.0,  end: 4.8 },  // Radar oceánico, telemetría y gancho
  drop:   { start: 4.8,  end: 9.6 },  // Caída de graves, logo neón y título Marea
  score:  { start: 9.6,  end: 15.0 }, // Algoritmo de puntuación (4.7 / 5) y factores
  buoys:  { start: 15.0, end: 20.0 }, // Boyas reales en vivo vs predicción de modelos
  tide:   { start: 20.0, end: 25.0 }, // Curva de marea oficial y ciclo solar / lunar
  climax: { start: 25.0, end: 30.0 }, // Multi-dispositivo, eslogan y cierre
};

export const MUSIC_CUES = {
  intro: 0.0,
  drop: SCENES.drop.start,
  leadIn: SCENES.score.start,
  buoyBreak: SCENES.buoys.start,
  tideBuild: SCENES.tide.start,
  finalDrop: SCENES.climax.start,
  outroSlam: SCENES.climax.end - 2.0,
};
