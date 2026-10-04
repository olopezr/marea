// Sintetizador algorítmico de audio para promo-v2 (30 s, 124 BPM, 48 kHz estéreo).
// Genera banda sonora electrónica cinemática (kick 808, bajo sidechain, pads, arpegio y efectos).
import fs from "node:fs";
import { BPM, BEAT, BAR, DURATION, SCENES } from "./timeline.js";

const SR = 48000;
const TAU = Math.PI * 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed = 1337) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function biquad(type, freq, q = 0.707) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = f => {
    const w = TAU * Math.min(Math.max(f, 20), SR * 0.45) / SR;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let n0, n1, n2;
    if (type === "lp") { n0 = (1 - cs) / 2; n1 = 1 - cs; n2 = n0; }
    else if (type === "hp") { n0 = (1 + cs) / 2; n1 = -(1 + cs); n2 = n0; }
    else { n0 = al; n1 = 0; n2 = -al; }
    const a0 = 1 + al;
    b0 = n0 / a0; b1 = n1 / a0; b2 = n2 / a0; a1 = -2 * cs / a0; a2 = (1 - al) / a0;
  };
  set(freq);
  const fn = x => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  fn.setFreq = set;
  return fn;
}

const polyblep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};

export function renderSoundtrack(outFile) {
  const N = Math.ceil((DURATION + 1.5) * SR); // margen de reverb final
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  const rand = rng(42);
  const at = t => Math.round(t * SR);

  const put = (i, v, pan = 0) => {
    if (i < 0 || i >= N) return;
    const l = Math.cos((pan + 1) * Math.PI / 4);
    const r = Math.sin((pan + 1) * Math.PI / 4);
    left[i] += v * l;
    right[i] += v * r;
  };

  // --- Estructura armónica (F#m – Dmaj7 – Bm9 – A) ---
  const CHORDS = [
    { bass: 30, notes: [54, 57, 61, 64] }, // F#m7
    { bass: 26, notes: [50, 54, 57, 61] }, // Dmaj7
    { bass: 35, notes: [59, 62, 66, 69] }, // Bm7
    { bass: 33, notes: [57, 61, 64, 69] }, // A(add9)
  ];

  // 1. KICK (808 contundente con caída de tono)
  const renderKick = (t0, punch = 1) => {
    const len = at(0.42);
    const startIdx = at(t0);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = 45 + 110 * Math.exp(-t * 28);
      const phase = TAU * (45 * t + (110 / 28) * (1 - Math.exp(-t * 28)));
      const env = Math.exp(-t * 9.5) * (1 - Math.exp(-t * 120));
      const click = i < 60 ? (rand() * 2 - 1) * 0.45 * Math.exp(-i / 15) : 0;
      const sample = Math.tanh((Math.sin(phase) * 1.2 + click) * 1.3) * env * 0.65 * punch;
      put(startIdx + i, sample, 0);
    }
  };

  // 2. SNARE / CLAP
  const renderSnare = (t0, vol = 1) => {
    const len = at(0.3);
    const startIdx = at(t0);
    const hp = biquad("hp", 800, 0.9);
    const lp = biquad("lp", 7500, 0.7);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const tone = Math.sin(TAU * 190 * t) * Math.exp(-t * 25) * 0.35;
      const noise = lp(hp(rand() * 2 - 1)) * Math.exp(-t * 16);
      const clapPuffs = (i < at(0.012) ? 0.3 : 0) + (i > at(0.015) && i < at(0.027) ? 0.4 : 0);
      const sample = (noise + tone + clapPuffs * noise) * 0.42 * vol;
      put(startIdx + i, sample, (rand() - 0.5) * 0.25);
    }
  };

  // 3. HI-HAT
  const renderHiHat = (t0, open = false, vol = 1) => {
    const dur = open ? 0.18 : 0.05;
    const len = at(dur);
    const startIdx = at(t0);
    const hp = biquad("hp", 7000, 1.2);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = Math.exp(-t * (open ? 18 : 75));
      const sample = hp(rand() * 2 - 1) * env * 0.16 * vol;
      put(startIdx + i, sample, (rand() - 0.5) * 0.4);
    }
  };

  // 4. BASSLINE (Sintetizador analógico con saturación)
  const renderBassNote = (t0, dur, midi) => {
    const len = at(dur);
    const startIdx = at(t0);
    const f0 = mtof(midi);
    const dt0 = f0 / SR;
    const lp = biquad("lp", 850, 1.4);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      phase += dt0;
      if (phase >= 1) phase -= 1;
      const saw = 2 * phase - 1 - polyblep(phase, dt0);
      const sub = Math.sin(TAU * phase * 0.5); // sub-octava
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 2.2);
      // Sidechain ducking al inicio de cada pulso
      const duck = Math.min(1, Math.pow(t / 0.14, 1.6));
      const raw = (saw * 0.65 + sub * 0.75) * env;
      const sample = Math.tanh(lp(raw) * 1.5) * 0.38 * duck;
      put(startIdx + i, sample, 0);
    }
  };

  // 5. CHORD PADS (Lush, detuned, stereo)
  const renderPadChord = (t0, dur, notes) => {
    const len = at(dur);
    const startIdx = at(t0);
    notes.forEach((m, ni) => {
      [-6, 6].forEach((detune, di) => {
        const freq = mtof(m) * Math.pow(2, detune / 1200);
        const dt = freq / SR;
        const pan = ((ni / (notes.length - 1)) * 2 - 1) * 0.6 + (di ? 0.15 : -0.15);
        let ph = (ni * 0.17 + di * 0.41) % 1;
        const lp = biquad("lp", 2200, 0.8);
        for (let i = 0; i < len; i++) {
          const t = i / SR;
          ph += dt; if (ph >= 1) ph -= 1;
          const saw = 2 * ph - 1 - polyblep(ph, dt);
          const attack = Math.min(1, t / 0.25);
          const release = Math.max(0, 1 - (t - (dur - 0.3)) / 0.3);
          const env = attack * (t > dur - 0.3 ? release : 1);
          // Suave ducking rítmico en cada pulso de compás
          const beatPhase = (t % BEAT) / BEAT;
          const duck = 0.55 + 0.45 * Math.min(1, beatPhase / 0.35);
          const sample = lp(saw) * env * duck * 0.065;
          put(startIdx + i, sample, pan);
        }
      });
    });
  };

  // 6. ARP LEAD (Cascada cristalina en notas de la escala)
  const renderArpNote = (t0, midi, pan = 0) => {
    const len = at(0.24);
    const startIdx = at(t0);
    const freq = mtof(midi);
    const dt = freq / SR;
    let ph = 0;
    const lp = biquad("lp", 3400, 1.2);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      ph += dt; if (ph >= 1) ph -= 1;
      const tri = Math.abs(2 * ph - 1) * 2 - 1;
      const sin = Math.sin(TAU * ph);
      const env = Math.exp(-t * 11) * Math.min(1, t / 0.005);
      const sample = lp(tri * 0.6 + sin * 0.4) * env * 0.18;
      put(startIdx + i, sample, pan);
      // Eco ping-pong
      if (i > at(0.12)) {
        put(startIdx + i, sample * 0.4, -pan);
      }
    }
  };

  // 7. EFECTOS ESPECIALES CINEMÁTICOS
  const renderSubDrop = (t0) => {
    const len = at(1.8);
    const startIdx = at(t0);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = 110 * Math.exp(-t * 2.8) + 32;
      const phase = TAU * (32 * t - (110 / 2.8) * Math.exp(-t * 2.8));
      const env = Math.exp(-t * 1.6);
      put(startIdx + i, Math.sin(phase) * env * 0.6, 0);
    }
  };

  const renderRiser = (t0, dur = 2.0) => {
    const len = at(dur);
    const startIdx = at(t0);
    const bp = biquad("bp", 300, 2.5);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const progress = t / dur;
      bp.setFreq(300 + 4500 * Math.pow(progress, 2.2));
      const n = rand() * 2 - 1;
      const tone = Math.sin(TAU * (200 + 1200 * Math.pow(progress, 2)) * t);
      const env = Math.pow(progress, 2.5);
      const sample = (bp(n) * 0.8 + tone * 0.2) * env * 0.35;
      put(startIdx + i, sample, progress * 1.6 - 0.8);
    }
  };

  const renderSonarPing = (t0, freq = 980) => {
    const len = at(1.4);
    const startIdx = at(t0);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const sample = Math.sin(TAU * freq * t) * Math.exp(-t * 5.2) * 0.28;
      put(startIdx + i, sample, 0.35);
      if (i > at(0.18)) put(startIdx + i, sample * 0.4, -0.35);
    }
  };

  // --- COMPOSICIÓN SECUENCIAL (30 Segundos) ---

  // 0.0 - 4.8s: INTRO MISTERIOSA & RADAR SONAR
  renderSubDrop(0.0);
  renderSonarPing(0.2, 880);
  renderSonarPing(1.4, 1100);
  renderSonarPing(2.6, 1320);
  renderSonarPing(3.8, 1760);
  renderRiser(2.8, 2.0); // Riser hacia el Drop

  // Acorde Pad ambiental en intro
  renderPadChord(0.0, 4.8, CHORDS[0].notes);

  // 4.8s: THE DROP (Impacto principal)
  renderSubDrop(4.8);

  // Sección ritmica 4.8s a 29.0s
  const totalBeats = Math.floor((DURATION - 4.8) / BEAT);
  for (let b = 0; b < totalBeats; b++) {
    const t = 4.8 + b * BEAT;
    if (t >= 28.5) break;

    const barIdx = Math.floor((t - 4.8) / BAR);
    const chord = CHORDS[barIdx % CHORDS.length];
    const beatInBar = Math.floor(((t - 4.8) % BAR) / BEAT);

    // Kicks: Four-on-the-floor en drop (4.8 - 9.6) y climax (20.0 - 28.0)
    const isBreakdown = (t >= 15.0 && t < 17.5);
    if (!isBreakdown) {
      if (beatInBar === 0 || beatInBar === 2 || (t >= 9.6 && (beatInBar === 1 || beatInBar === 3))) {
        renderKick(t, 1.0);
      }
    }

    // Snare / Clap en tiempos 1 y 3 (segundo y cuarto tiempo)
    if ((beatInBar === 1 || beatInBar === 3) && !isBreakdown) {
      renderSnare(t, 0.95);
    }

    // Hi-hats en corcheas y semicorcheas
    renderHiHat(t, false, 0.7);
    renderHiHat(t + BEAT * 0.5, true, 0.85);

    // Bassline
    if (beatInBar === 0 || beatInBar === 2) {
      renderBassNote(t, BEAT * 0.9, chord.bass);
    } else if (beatInBar === 1 || beatInBar === 3) {
      renderBassNote(t, BEAT * 0.8, chord.bass + 12);
    }

    // Arpegio melódico brillante
    if (t >= 9.6 && t < 28.5) {
      const scale = [chord.notes[0], chord.notes[1], chord.notes[2], chord.notes[3], chord.notes[2] + 12];
      const noteA = scale[b % scale.length] + 12;
      const noteB = scale[(b + 2) % scale.length] + 12;
      renderArpNote(t, noteA, -0.4);
      renderArpNote(t + BEAT * 0.5, noteB, 0.4);
    }
  }

  // Pads continuos a partir del drop
  for (let bar = 0; bar < 12; bar++) {
    const t0 = 4.8 + bar * BAR;
    if (t0 >= 28.0) break;
    const ch = CHORDS[bar % CHORDS.length];
    renderPadChord(t0, BAR, ch.notes);
  }

  // Risers de transición
  renderRiser(13.2, 1.8);
  renderRiser(23.2, 1.8);

  // Cierre final con sub-impacto y cola de reverberación
  renderKick(28.0, 1.2);
  renderSubDrop(28.0);
  renderSonarPing(28.2, 880);

  // --- Normalización y exportación WAV a 16 bits ---
  let peak = 0;
  for (let i = 0; i < N; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = peak > 0 ? 0.92 / peak : 1.0;

  const numChannels = 2;
  const bytesPerSample = 2;
  const byteRate = SR * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = N * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // Cabecera RIFF WAV
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < N; i++) {
    const sl = Math.max(-1, Math.min(1, left[i] * gain));
    const sr = Math.max(-1, Math.min(1, right[i] * gain));
    buffer.writeInt16LE(Math.round(sl < 0 ? sl * 32768 : sl * 32767), offset);
    buffer.writeInt16LE(Math.round(sr < 0 ? sr * 32768 : sr * 32767), offset + 2);
    offset += 4;
  }

  fs.mkdirSync(outFile.substring(0, outFile.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(outFile, buffer);
  console.log(`Audio generado: ${outFile} (${(N / SR).toFixed(2)} s, pico: ${peak.toFixed(3)})`);
}

// Ejecución directa si se invoca con node
if (process.argv[1] && process.argv[1].endsWith("synth.mjs")) {
  const target = process.argv[2] || "promo-v2/out/soundtrack.wav";
  renderSoundtrack(target);
}
