// Guion del vídeo. Tiempos en segundos sobre una base de 120 BPM: un pulso = 0,5 s y un compás = 2 s,
// así los cortes caen a tempo con la música. Lo importan la animación (navegador) y la música (Node).
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;
export const W = 1920, H = 1080;

export const SCENES = {
  hook:     { start: 0,  end: 6 },   // ¿Hay olas hoy? + el lío de webs
  logo:     { start: 6,  end: 10 },  // Caída: logo y lema
  map:      { start: 10, end: 16 },  // Todos los spots en el mapa
  rating:   { start: 16, end: 22 },  // Valoración de 0 a 5
  forecast: { start: 22, end: 28 },  // Previsión por horas y 7 días
  tide:     { start: 28, end: 36 },  // Curva de marea deslizable (pausa musical)
  buoys:    { start: 36, end: 42 },  // Medidas reales (segunda caída)
  alerts:   { start: 42, end: 48 },  // Avisos push
  extras:   { start: 48, end: 52 },  // Y además…
  end:      { start: 52, end: 60 },  // Plataformas y cierre
};
export const DURATION = 60;

// Secciones de la música (en compases) para que la mezcla siga la energía de las escenas.
export const MUSIC = {
  dropAt: SCENES.logo.start,          // entra el ritmo completo
  breakdown: [SCENES.tide.start, SCENES.tide.start + 4],      // ritmo mínimo mientras se dibuja la marea
  build: [SCENES.tide.start + 4, SCENES.buoys.start],         // subida hacia la segunda caída
  drop2At: SCENES.buoys.start,
  outroAt: SCENES.end.start + 4,      // acorde final con el logo
};
