// Banda sonora sintetizada (sin muestras de terceros): 120 BPM en re mayor, progresión Bm9 – Gmaj9 – Dmaj9 – A,
// con mar de fondo, ritmo, bajo, marimba y pad, y efectos colocados en los momentos sonoros (cues) que
// registran las escenas. Uso directo: node music.mjs [cues.json] [salida.wav]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { BPM, BEAT, BAR, MUSIC, SCENES, DURATION } from "./js/timeline.js";

const SR = 48000;
const TAU = Math.PI * 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Aleatorio con semilla para que la música sea siempre la misma
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Biquad (RBJ). Devuelve una función por muestra; setFreq permite barridos.
function biquad(type, freq, q = 0.707) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = f => {
    const w = TAU * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let n0, n1, n2;
    if (type === "lp") { n0 = (1 - cs) / 2; n1 = 1 - cs; n2 = n0; }
    else if (type === "hp") { n0 = (1 + cs) / 2; n1 = -(1 + cs); n2 = n0; }
    else { n0 = al; n1 = 0; n2 = -al; } // paso banda
    const a0 = 1 + al;
    b0 = n0 / a0; b1 = n1 / a0; b2 = n2 / a0; a1 = -2 * cs / a0; a2 = (1 - al) / a0;
  };
  set(freq);
  const f = x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  f.setFreq = set;
  return f;
}

const polyblep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};

export function renderMusic({ duration = DURATION, cues = [], file }) {
  const N = Math.ceil(duration * SR);
  const bus = () => [new Float32Array(N), new Float32Array(N)];
  const dry = bus(), duck = bus(), send = bus();
  const rand = rng(2024);
  const white = () => rand() * 2 - 1;
  const at = t => Math.round(t * SR);
  // Escribe una muestra con paneo (−1 izquierda, 1 derecha) y envío a la reverb
  const put = (b, i, v, pan = 0, rev = 0) => {
    if (i < 0 || i >= N) return;
    const l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4);
    b[0][i] += v * l; b[1][i] += v * r;
    if (rev) { send[0][i] += v * l * rev; send[1][i] += v * r * rev; }
  };

  // ---------- Estructura ----------
  const DROP = MUSIC.dropAt, [BD0, BD1] = MUSIC.breakdown, [BU0, BU1] = MUSIC.build, DROP2 = MUSIC.drop2At, OUTRO = MUSIC.outroAt;
  const gap = t => (t >= DROP - 0.22 && t < DROP) || (t >= DROP2 - 0.22 && t < DROP2); // silencio antes de cada caída
  const section = t => t < DROP ? "intro" : t < BD0 ? "a" : t < BD1 ? "breakdown" : t < BU1 ? "build" : t < OUTRO ? "b" : "outro";
  const CHORDS = [
    { bass: 35, notes: [62, 66, 69, 73] }, // Bm9
    { bass: 31, notes: [62, 66, 69, 71] }, // Gmaj9 (6/9)
    { bass: 38, notes: [61, 64, 66, 69] }, // Dmaj9
    { bass: 33, notes: [61, 64, 69, 71] }, // A(add9)
  ];
  const chordAt = t => CHORDS[Math.floor(t / BAR) % 4];
  const bars = Math.ceil(duration / BAR);

  // ---------- Pad (sierras desafinadas, filtro que se abre con la energía) ----------
  const padCut = t => {
    const s = section(t);
    if (s === "intro") return 500 + 700 * (t / DROP) ** 2;
    if (s === "breakdown") return 900;
    if (s === "build") return 900 + 3600 * ((t - BU0) / (BU1 - BU0)) ** 2;
    if (s === "outro") return 2200 - 1500 * Math.min(1, (t - OUTRO) / 3);
    return 2600;
  };
  const padLevel = t => (section(t) === "intro" ? 0.55 + 0.45 * t / DROP : section(t) === "outro" ? 1.2 : 1) * (gap(t) ? 0 : 1);
  for (let bar = 0; bar < bars; bar++) {
    const ch = CHORDS[bar % 4], t0 = bar * BAR, t1 = t0 + BAR;
    ch.notes.forEach((m, ni) => {
      [-7, 0, 7].forEach((cents, vi) => {
        const f = mtof(m) * Math.pow(2, cents / 1200), dt = f / SR;
        const pan = (vi - 1) * 0.7, lp = biquad("lp", 2000, 0.8);
        let ph = (ni * 0.13 + vi * 0.31) % 1;
        const end = Math.min(N, at(t1 + (bar === bars - 1 ? 3 : 0.6)));
        for (let i = at(t0); i < end; i++) {
          const t = i / SR;
          if ((i & 63) === 0) lp.setFreq(padCut(t));
          const env = Math.min(1, (t - t0) / 0.35) * (t > t1 ? Math.max(0, 1 - (t - t1) / 0.6) : 1);
          ph += dt; if (ph >= 1) ph -= 1;
          const v = lp(2 * ph - 1 - polyblep(ph, dt)) * env * 0.032 * padLevel(t);
          put(duck, i, v, pan, 0.5);
        }
      });
    });
  }

  // ---------- Marimba (FM corta) con patrón sincopado de casa tropical ----------
  const pluck = (t, m, vel = 1, pan = 0, rev = 0.35, b = duck) => {
    const f = mtof(m), len = at(0.5);
    let ph = 0, ph2 = 0;
    for (let k = 0; k < len; k++) {
      const tt = k / SR;
      ph += f / SR; ph2 += 2 * f / SR;
      const idx = 1.6 * Math.exp(-tt / 0.045);
      const v = Math.sin(TAU * ph + idx * Math.sin(TAU * ph2)) * Math.exp(-tt / 0.17) * Math.min(1, tt / 0.002);
      put(b, at(t) + k, v * 0.11 * vel, pan, rev);
    }
  };
  const ARP = [0, 3, 6, 8, 11, 14], ORDER = [3, 1, 2, 0, 3, 2];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * BAR, s = section(t0 + 0.01);
    if (s === "intro" && t0 < 2 * BAR) continue;
    const ch = CHORDS[bar % 4];
    ARP.forEach((step, k) => {
      const t = t0 + step * BEAT / 4;
      if (t >= duration || gap(t) || t >= OUTRO) return;
      const vel = (s === "breakdown" ? 0.6 : s === "intro" ? 0.45 : 1) * (k === 0 ? 1.1 : 0.85 + 0.15 * rand());
      pluck(t, ch.notes[ORDER[k]] + 12, vel, k % 2 ? 0.35 : -0.35);
      if (s === "b" && k % 2 === 0) pluck(t + BEAT / 4, ch.notes[ORDER[(k + 2) % 6]] + 24, vel * 0.45, 0.6, 0.5);
    });
  }

  // ---------- Bajo ----------
  const BASS = [[0, 3, 0], [3, 2, 0], [6, 1, 12], [8, 3, 0], [11, 2, 0], [14, 2, 7]];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * BAR, s = section(t0 + 0.01);
    if (s === "intro" || s === "outro" || s === "breakdown") continue;
    const root = CHORDS[bar % 4].bass + 12;
    for (const [step, dur, iv] of BASS) {
      const t = t0 + step * BEAT / 4, len = dur * BEAT / 4;
      if (s === "build" && step % 8 !== 0) continue;
      const f = mtof(root + iv);
      let ph = 0;
      for (let k = 0, n = at(len + 0.04); k < n; k++) {
        const tt = k / SR;
        ph += f / SR;
        const env = Math.min(1, tt / 0.004) * (tt > len ? Math.max(0, 1 - (tt - len) / 0.04) : 1) * (0.75 + 0.25 * Math.exp(-tt / 0.08));
        const v = Math.tanh(1.8 * Math.sin(TAU * ph) + 0.3 * Math.sin(TAU * 2 * ph)) * env * 0.3;
        if (!gap(t + tt)) put(duck, at(t) + k, v, 0, 0);
      }
    }
  }

  // ---------- Batería ----------
  const kicks = [];
  const kick = (t, vel = 1) => {
    kicks.push(t);
    let ph = 0;
    for (let k = 0, n = at(0.45); k < n; k++) {
      const tt = k / SR, f = 46 + 110 * Math.exp(-tt / 0.03);
      ph += f / SR;
      const v = Math.sin(TAU * ph) * Math.exp(-tt / 0.26) * Math.min(1, tt / 0.001) + (tt < 0.004 ? white() * 0.3 * (1 - tt / 0.004) : 0);
      put(dry, at(t) + k, v * 0.78 * vel);
    }
  };
  const clap = (t, vel = 1) => {
    const bp = biquad("bp", 1250, 1.1), bp2 = biquad("bp", 2400, 1.4);
    for (let k = 0, n = at(0.3); k < n; k++) {
      const tt = k / SR;
      const bursts = [0, 0.009, 0.019].reduce((a, o) => a + (tt >= o ? Math.exp(-(tt - o) / 0.006) : 0), 0) * (tt < 0.03 ? 1 : 0);
      const env = bursts + (tt >= 0.02 ? Math.exp(-(tt - 0.02) / 0.11) * 0.75 : 0);
      const x = white();
      put(dry, at(t) + k, (bp(x) * 1.1 + bp2(x) * 0.5) * env * 0.42 * vel, 0, 0.35);
    }
  };
  const hat = (t, vel = 1, open = false, pan = 0.25) => {
    const hp = biquad("hp", 7500, 0.8);
    for (let k = 0, n = at(open ? 0.16 : 0.05); k < n; k++) {
      const tt = k / SR;
      put(dry, at(t) + k, hp(white()) * Math.exp(-tt / (open ? 0.055 : 0.014)) * 0.17 * vel, pan, 0.1);
    }
  };
  const shaker = (t, vel = 1) => {
    const hp = biquad("hp", 5200, 0.7);
    for (let k = 0, n = at(0.05); k < n; k++) {
      const tt = k / SR;
      put(dry, at(t) + k, hp(white()) * Math.min(1, tt / 0.006) * Math.exp(-tt / 0.018) * 0.06 * vel, -0.3);
    }
  };
  const SCENE_STARTS = Object.values(SCENES).map(s => s.start);
  for (let b = 0; b < duration / BEAT; b++) {
    const t = b * BEAT, s = section(t + 0.001), beatInBar = b % 4;
    if (gap(t) || t >= duration) continue;
    if (s === "a" || s === "b") {
      kick(t);
      if (beatInBar % 2 === 1) clap(t);
      hat(t + BEAT / 2, 0.9, beatInBar === 3);
      for (let q = 0; q < 4; q++) shaker(t + q * BEAT / 4, q === 2 ? 1 : 0.55 + 0.2 * rand());
      // Redoble de palmas en el último pulso antes de un cambio de escena
      if (SCENE_STARTS.some(st => Math.abs(st - (t + BEAT)) < 0.01) && beatInBar === 3) {
        clap(t + BEAT / 4, 0.55); clap(t + BEAT / 2, 0.7); clap(t + 3 * BEAT / 4, 0.85);
      }
    } else if (s === "breakdown") {
      if (beatInBar === 0) kick(t, 0.55);
      hat(t + BEAT / 2, 0.5);
    } else if (s === "build") {
      const p = (t - BU0) / (BU1 - BU0);
      kick(t, 0.6 + 0.4 * p);
      const div = p < 0.5 ? 2 : p < 0.85 ? 4 : 8;
      for (let q = 0; q < div; q++) clap(t + q * BEAT / div, 0.25 + 0.6 * p);
    }
  }

  // ---------- Mar de fondo ----------
  // Rumor en banda (140 Hz – 1,4 kHz) que crece y rompe cada ~7 s, más espuma aguda en las rompientes.
  // Sin graves profundos: el ruido marrón sin filtrar solo aporta retumbo y se come el margen de la mezcla.
  {
    const chain = () => { const hp = biquad("hp", 140, 0.7), lp = biquad("lp", 1400, 0.6), fo = biquad("bp", 3000, 0.7), fhp = biquad("hp", 1800, 0.7); return { roar: x => lp(hp(x)), foam: x => fo(fhp(x)) }; };
    const cl = chain(), cr = chain();
    const level = t => {
      const s = section(t);
      if (s === "intro") return 0.8 * Math.min(1, t / 1.0);
      if (s === "breakdown" || s === "build") return 0.5;
      if (s === "outro") return 0.55;
      return 0.2;
    };
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const swellAt = ph => 0.5 + 0.5 * Math.sin(TAU * t / 7.1 + ph) * (0.75 + 0.25 * Math.sin(TAU * t / 2.9 + ph));
      const sl = swellAt(0.6), sr = swellAt(1.1);
      const g = level(t) * Math.min(1, (duration - t) / 1.2);
      dry[0][i] += (cl.roar(white()) * 0.42 * (0.3 + 0.7 * sl) + cl.foam(white()) * 0.22 * sl ** 4) * g;
      dry[1][i] += (cr.roar(white()) * 0.42 * (0.3 + 0.7 * sr) + cr.foam(white()) * 0.22 * sr ** 4) * g;
    }
  }

  // ---------- Efectos ----------
  const noiseSweep = (t, dur, f0, f1, amp, pan = 0, rev = 0.3, shape = p => Math.sin(Math.PI * p)) => {
    const bp = biquad("bp", f0, 1.2);
    const tail = at(0.01); // sin cortes secos: un final abrupto suena a chasquido
    for (let k = 0, n = at(dur); k < n; k++) {
      const p = k / n;
      if ((k & 31) === 0) bp.setFreq(f0 * Math.pow(f1 / f0, p));
      put(dry, at(t) + k, bp(white()) * shape(p) * amp * Math.min(1, (n - k) / tail), pan, rev);
    }
  };
  const bell = (t, m, amp = 0.2, pan = 0, decay = 0.6, rev = 0.5) => {
    const f = mtof(m);
    for (let k = 0, n = at(decay * 3); k < n; k++) {
      const tt = k / SR;
      const v = (Math.sin(TAU * f * tt + 0.8 * Math.exp(-tt / 0.08) * Math.sin(TAU * f * 3.5 * tt)) + 0.25 * Math.sin(TAU * f * 2 * tt) * Math.exp(-tt / 0.2))
        * Math.exp(-tt / decay) * Math.min(1, tt / 0.002);
      put(dry, at(t) + k, v * amp, pan, rev);
    }
  };
  const boom = (t, amp = 1, len = 1.6) => {
    let ph = 0;
    const lp = biquad("lp", 9000, 0.7);
    for (let k = 0, n = at(len); k < n; k++) {
      const tt = k / SR, f = 32 + 40 * Math.exp(-tt / 0.18);
      ph += f / SR;
      if ((k & 31) === 0) lp.setFreq(300 + 8000 * Math.exp(-tt / 0.25));
      const v = Math.sin(TAU * ph) * Math.exp(-tt / (len * 0.45)) * 0.9 + lp(white()) * Math.exp(-tt / 0.5) * 0.35;
      put(dry, at(t) + k, v * amp, 0, 0.45);
    }
  };
  const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]; // re mayor pentatónica
  for (const c of cues) {
    const t = c.t, pan = Math.max(-0.8, Math.min(0.8, c.pan ?? 0));
    switch (c.type) {
      case "hit": {
        kick(t, 0.9);
        noiseSweep(t, 0.25, 3000, 900, 0.25, 0, 0.4, p => Math.exp(-p * 6));
        const ch = chordAt(0.01);
        ch.notes.forEach((m, i) => pluck(t, m + (c.n ?? 0) * 2 + 12, 0.9, (i - 1.5) * 0.4, 0.5, dry));
        break;
      }
      case "whoosh": noiseSweep(t - (c.big ? 0.35 : 0.2), c.big ? 0.8 : 0.45, c.big ? 300 : 500, c.big ? 5000 : 4000, c.soft ? 0.12 : c.big ? 0.45 : 0.25, pan, 0.3); break;
      case "tick": bell(t, 93 + Math.round((c.pitch ?? 1) * 2), c.soft ? 0.035 : 0.05, pan, 0.03, 0.15); break;
      case "pop": {
        let ph = 0;
        const f0 = 700 * (c.pitch ?? 1);
        for (let k = 0, n = at(0.12); k < n; k++) {
          const tt = k / SR, f = f0 * (0.55 + 0.45 * Math.exp(-tt / 0.02));
          ph += f / SR;
          put(dry, at(t) + k, Math.sin(TAU * ph) * Math.exp(-tt / 0.035) * 0.22, pan, 0.25);
        }
        break;
      }
      case "blip": bell(t, PENTA[Math.min(PENTA.length - 1, (c.n ?? 0) + 2)], c.soft ? 0.09 : 0.14, pan, 0.45); break;
      case "step": bell(t, PENTA[(c.n ?? 0) + 3], 0.16, -0.2, 0.5); pluck(t, PENTA[(c.n ?? 0) + 3] - 12, 0.8, 0, 0.3, dry); break;
      case "click": noiseSweep(t, 0.03, 3000, 1500, 0.3, pan, 0.05, p => Math.exp(-p * 8)); break;
      case "toggle": bell(t, 81 + (c.n ?? 0) * 2, 0.08, 0.3, 0.12, 0.2); bell(t + 0.06, 86 + (c.n ?? 0) * 2, 0.08, 0.3, 0.15, 0.2); break;
      case "lock": noiseSweep(t, 0.06, 1200, 500, 0.35, 0, 0.05, p => Math.exp(-p * 7)); break;
      case "ding": bell(t, 88, 0.2, 0.2, 0.9, 0.6); bell(t + 0.14, 93, 0.17, 0.2, 1.1, 0.6); break;
      case "shimmer": [0, 2, 4, 5, 7, 9].forEach((d, i) => bell(t + i * BEAT / 4, PENTA[d % PENTA.length] + 12, 0.07, (i % 2 ? 0.5 : -0.5), 0.5, 0.7)); break;
      case "sparkle": [0, 1, 2, 3, 4].forEach(i => bell(t + i * 0.06, PENTA[4 + i] + 12, 0.05, -0.4 + i * 0.2, 0.35, 0.6)); break;
      case "splash": {
        noiseSweep(t, 0.5, 1800, 700, 0.3, 0, 0.3, p => Math.exp(-p * 5));
        for (let d = 0; d < 7; d++) bell(t + 0.08 + rand() * 0.5, 96 + Math.floor(rand() * 8), 0.03, rand() * 1.4 - 0.7, 0.04, 0.2);
        break;
      }
      case "suck": noiseSweep(t, 0.78, 200, 7000, 0.35, 0, 0.1, p => p * p); break;
      case "impact":
        boom(t, c.small ? 0.4 : c.final ? 0.8 : 0.85, c.final ? 2.2 : c.small ? 0.8 : 1.6);
        if (!c.small) noiseSweep(t, c.final ? 2.0 : 1.4, 7000, 300, c.final ? 0.22 : 0.25, 0, 0.6, p => Math.exp(-p * 3));
        break;
    }
  }
  // Subidas antes de las caídas
  noiseSweep(DROP - 2.6, 2.38, 250, 6500, 0.22, 0, 0.3, p => p * p);
  noiseSweep(DROP2 - 3.4, 3.18, 200, 7000, 0.26, 0, 0.3, p => p * p);
  // Acorde final que se queda sonando con el logo
  CHORDS[0].notes.concat([74, 78]).forEach((m, i) => pluck(OUTRO + i * 0.035, m + 12, 0.8, (i - 2.5) * 0.3, 0.8, dry));

  // ---------- Sidechain: el bombo hace "respirar" pad, bajo y marimba ----------
  const duckGain = new Float32Array(N).fill(1);
  for (const kt of kicks) {
    for (let k = 0, n = at(0.45); k < n; k++) {
      const i = at(kt) + k;
      if (i >= N) break;
      const tt = k / SR, g = 1 - 0.62 * Math.exp(-tt / 0.13) * Math.min(1, tt / 0.004 + 0.3);
      if (g < duckGain[i]) duckGain[i] = g;
    }
  }
  for (let i = 0; i < N; i++) { dry[0][i] += duck[0][i] * duckGain[i]; dry[1][i] += duck[1][i] * duckGain[i]; }

  // ---------- Reverb (Freeverb) ----------
  const reverb = (input, spread) => {
    const out = new Float32Array(N), scale = SR / 44100;
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0, store: 0 }));
    const aps = [556, 441, 341, 225].map(d => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0 }));
    const fb = 0.86, damp = 0.3;
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * fb;
        if (++c.i >= c.buf.length) c.i = 0;
        y += o;
      }
      for (const a of aps) {
        const o = a.buf[a.i];
        a.buf[a.i] = y + o * 0.5;
        if (++a.i >= a.buf.length) a.i = 0;
        y = o - y;
      }
      out[n] = y;
    }
    return out;
  };
  const revL = reverb(send[0], 0), revR = reverb(send[1], 23);
  for (let i = 0; i < N; i++) { dry[0][i] += revL[i] * 1.3; dry[1][i] += revR[i] * 1.3; }

  // ---------- Máster ----------
  // Hueco antes de cada caída con rampas de 20 ms (un corte seco suena a chasquido), filtro de graves a 28 Hz
  // y fundidos de entrada y salida.
  const ramp = 0.02;
  const gapGain = t => {
    let g = 1;
    for (const d of [DROP, DROP2]) {
      const a = d - 0.22;
      if (t > a - ramp && t < d + ramp) g = Math.min(g, 1 - 0.75 * Math.min(1, (t - (a - ramp)) / ramp, (d + ramp - t) / ramp));
    }
    return g;
  };
  const hpL = biquad("hp", 28, 0.7), hpR = biquad("hp", 28, 0.7);
  for (let i = 0; i < N; i++) {
    const t = i / SR, g = gapGain(t) * Math.min(1, t / 0.05) * Math.min(1, (duration - t) / 0.6);
    dry[0][i] = hpL(dry[0][i]) * g;
    dry[1][i] = hpR(dry[1][i]) * g;
  }
  // Limitador con anticipación (se calcula sobre el búfer completo): ganancia que nunca deja pasar de −1 dBFS,
  // ataque anticipado de 2 ms y recuperación de 80 ms.
  const CEIL = 0.891, look = at(0.002), rel = Math.exp(-1 / (0.08 * SR));
  const need = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = Math.max(Math.abs(dry[0][i]), Math.abs(dry[1][i]));
    need[i] = p > CEIL ? CEIL / p : 1;
  }
  // Mínimo de need[i … i+look] (cola monótona, O(N)) y recuperación exponencial
  const win = new Float32Array(N), q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let j = 0; j < N + look; j++) {
    if (j < N) { while (qt > qh && need[q[qt - 1]] >= need[j]) qt--; q[qt++] = j; }
    const i = j - look;
    if (i < 0) continue;
    while (q[qh] < i) qh++;
    win[i] = need[q[qh]];
  }
  const gain = new Float32Array(N);
  let g = 1;
  for (let i = 0; i < N; i++) {
    g = win[i] < g ? win[i] : win[i] - (win[i] - g) * rel;
    gain[i] = g;
  }
  let peak = 0, sumSq = 0;
  for (let i = 0; i < N; i++) {
    for (const ch of dry) {
      const x = ch[i] * gain[i];
      ch[i] = x;
      peak = Math.max(peak, Math.abs(x));
      sumSq += x * x;
    }
  }
  const norm = 1; // la sonoridad final la ajusta normalizeLoudness() con ffmpeg
  const rms = Math.sqrt(sumSq / (2 * N));

  // WAV de 24 bits
  const data = Buffer.alloc(N * 2 * 3);
  for (let i = 0, o = 0; i < N; i++) {
    for (const ch of dry) {
      const v = Math.max(-1, Math.min(1, ch[i] * norm)) * 8388607;
      data.writeIntLE(Math.round(v), o, 3);
      o += 3;
    }
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 6, 28); head.writeUInt16LE(6, 32); head.writeUInt16LE(24, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return { file, peak: 20 * Math.log10(peak * norm), rmsDb: 20 * Math.log10(rms), bpm: BPM };
}

// Lleva el archivo a una sonoridad integrada objetivo (−14 LUFS, la de YouTube y la mayoría de plataformas)
// con loudnorm en modo lineal: primero mide y después aplica una ganancia fija, sin compresión añadida.
export function normalizeLoudness(file, { target = -14, truePeak = -1 } = {}) {
  const measure = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=I=${target}:TP=${truePeak}:LRA=11:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const start = measure.stderr.lastIndexOf("{");
  const m = JSON.parse(measure.stderr.slice(start, measure.stderr.indexOf("}", start) + 1));
  const out = file.replace(/\.wav$/, ".norm.wav");
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-af",
    `loudnorm=I=${target}:TP=${truePeak}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    "-ar", "48000", "-c:a", "pcm_s24le", out]);
  if (r.status !== 0) throw new Error("ffmpeg no pudo normalizar la música");
  fs.renameSync(out, file);
  return { before: +m.input_i, after: target };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const cuesFile = process.argv[2] ?? path.join(dir, "out", "cues.json");
  const cues = fs.existsSync(cuesFile) ? JSON.parse(fs.readFileSync(cuesFile, "utf8")) : [];
  const out = process.argv[3] ?? path.join(dir, "out", "music.wav");
  const t0 = Date.now();
  const r = renderMusic({ cues, file: out });
  const n = normalizeLoudness(out);
  console.log(`${path.relative(process.cwd(), r.file)}: pico ${r.peak.toFixed(1)} dBFS, RMS ${r.rmsDb.toFixed(1)} dBFS, ${n.before.toFixed(1)} → ${n.after} LUFS (${Date.now() - t0} ms)`);
}
