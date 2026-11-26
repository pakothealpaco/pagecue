/**
 * Composes the video's background music from scratch (no samples, so no licence questions): a soft
 * pad, a gentle plucked arpeggio and a quiet sub bass, 96 BPM, Cmaj9 – Am9 – Fmaj7 – G6.
 * Writes docs/video/build/music-raw.wav; video-cut.mjs adds the room (reverb) and the level.
 *
 *   node scripts/video-music.mjs [seconds]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(resolve(here, '../..'), 'docs/video/build/music-raw.wav');
const RATE = 44100;
const LENGTH = Number(process.argv[2] ?? 36);
const BEAT = 60 / 96;
const BAR = BEAT * 4;
const N = Math.ceil(LENGTH * RATE);
const left = new Float32Array(N);
const right = new Float32Array(N);

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// Two bars per chord. MIDI notes: pad voicing, then the arpeggio's notes, then the bass root.
const chords = [
  { pad: [48, 55, 62, 64, 71], arp: [64, 67, 71, 74, 76, 74, 71, 67], bass: 36 }, // Cmaj9
  { pad: [45, 52, 59, 60, 67], arp: [60, 64, 67, 71, 72, 71, 67, 64], bass: 33 }, // Am9
  { pad: [41, 48, 57, 60, 64], arp: [57, 60, 64, 67, 69, 67, 64, 60], bass: 29 }, // Fmaj7
  { pad: [43, 50, 59, 62, 64], arp: [59, 62, 64, 67, 71, 67, 64, 62], bass: 31 }, // G6
];

function add(buffer, start, samples, gain) {
  const at = Math.floor(start * RATE);
  for (let i = 0; i < samples.length && at + i < N; i++) buffer[at + i] += samples[i] * gain;
}

/** A warm pad note: a few detuned soft waves, slow attack and release, gently filtered. */
function padNote(freq, seconds) {
  const n = Math.floor(seconds * RATE);
  const s = new Float32Array(n);
  const attack = 1.4 * RATE;
  const release = 1.6 * RATE;
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let v = 0;
    for (const d of [-0.12, 0, 0.11]) {
      const f = freq * 2 ** (d / 12);
      v += Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t) + 0.06 * Math.sin(6 * Math.PI * f * t);
    }
    low += 0.08 * (v - low);
    const env = Math.min(1, i / attack) * Math.min(1, (n - i) / release);
    s[i] = low * env * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.2 * t));
  }
  return s;
}

/** A soft plucked note (Karplus–Strong), like a muted felt piano or a kalimba. */
function pluck(freq, seconds, seed) {
  const n = Math.floor(seconds * RATE);
  const period = Math.round(RATE / freq);
  const ring = new Float32Array(period);
  let x = seed;
  for (let i = 0; i < period; i++) {
    x = (x * 16807) % 2147483647;
    ring[i] = (x / 2147483647) * 2 - 1;
  }
  // Soften the attack: a smoothed noise burst sounds felted, not metallic.
  for (let k = 0; k < 3; k++) for (let i = 1; i < period; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
  const s = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const next = (p + 1) % period;
    const v = 0.4985 * (ring[p] + ring[next]);
    s[i] = ring[p];
    ring[p] = v;
    p = next;
  }
  const fade = 0.02 * RATE;
  for (let i = 0; i < Math.min(fade, n); i++) s[n - 1 - i] *= i / fade;
  return s;
}

function bassNote(freq, seconds) {
  const n = Math.floor(seconds * RATE);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.04) * Math.exp(-t * 1.1);
    s[i] = (Math.sin(2 * Math.PI * freq * t) + 0.15 * Math.sin(4 * Math.PI * freq * t)) * env;
  }
  return s;
}

const span = 2 * BAR;
let seed = 7;
for (let c = 0, start = 0; start < LENGTH; c++, start += span) {
  const chord = chords[c % chords.length];
  // The pad overlaps the next chord a little, so changes are seamless.
  for (const [k, note] of chord.pad.entries()) {
    const s = padNote(hz(note), span + 1.2);
    add(left, start, s, k % 2 ? 0.05 : 0.065);
    add(right, start, s, k % 2 ? 0.065 : 0.05);
  }
  // The arpeggio enters on the second chord; eighth notes, a little uneven in loudness, like a hand.
  if (c >= 1) {
    for (let i = 0; i < 16; i++) {
      const t = start + i * (BEAT / 2);
      if (t >= LENGTH - 2.5) break;
      const s = pluck(hz(chord.arp[i % 8]), 1.8, (seed += 101));
      const pan = 0.5 + 0.25 * Math.sin(i * 0.9);
      const gain = 0.16 * (i % 4 === 0 ? 1 : 0.72);
      add(left, t, s, gain * (1 - pan) * 2);
      add(right, t, s, gain * pan * 2);
    }
  }
  // A quiet sub bass on the first beat of each bar, from the third chord on.
  if (c >= 2) {
    for (const t of [start, start + BAR]) {
      if (t >= LENGTH - 2) break;
      const s = bassNote(hz(chord.bass), BAR);
      add(left, t, s, 0.22);
      add(right, t, s, 0.22);
    }
  }
}

// Fade in and out, then write a 16-bit stereo WAV.
const fadeIn = 1.5 * RATE;
const fadeOut = 3 * RATE;
let peak = 0;
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut);
  left[i] *= g;
  right[i] *= g;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const norm = 0.8 / peak;
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] * norm)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(out, Buffer.concat([header, data]));
console.log(`Wrote ${out} (${LENGTH} s)`);
