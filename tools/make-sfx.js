#!/usr/bin/env node
'use strict';

// Synthesises the skill sounds into assets/sfx/.
//
// The rest of the pack arrived as finished wavs, but hero skills needed two
// cues that weren't in it, and a game where the audio for a new feature has to
// come from outside the repo is a game where that feature ships silent. Same
// reasoning as tools/png.js: PCM wav is a header and a list of samples, so
// generating one is smaller than any dependency that would do it for us.
//
//   node tools/make-sfx.js
//
// Rerunning is safe and produces identical bytes — everything below is
// deterministic, including the noise, which uses its own seeded generator
// rather than Math.random so a regenerated file doesn't show up as a diff.

const fs = require('fs');
const path = require('path');

const RATE = 44100;
const OUT = path.join(__dirname, '..', 'assets', 'sfx');

// ── wav container ──────────────────────────────────────────────────────────
// 16-bit signed mono PCM. Samples arrive as floats in -1..1 and are clipped
// rather than normalised: a clipped peak is a sound that's slightly too loud,
// but normalising would make every sound's volume depend on its own loudest
// sample, which is how a mix stops being tunable from one place (see SPEC in
// src/audio/AudioEngine.ts — that's where volume belongs).
function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);      // PCM chunk size
  header.writeUInt16LE(1, 20);       // format: PCM
  header.writeUInt16LE(1, 22);       // channels: mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);       // block align
  header.writeUInt16LE(16, 34);      // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  fs.writeFileSync(file, Buffer.concat([header, data]));
  console.log(`${path.basename(file)}  ${(header.length + data.length) / 1024 | 0}KB  ${(samples.length / RATE).toFixed(2)}s`);
}

const buffer = (seconds) => new Float32Array(Math.round(RATE * seconds));

// Deterministic white noise. A tiny LCG, so the generated file is byte-stable.
function noiseSource(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

// Exponential decay. `k` is how many time-constants fit in the sound: bigger is
// snappier. Percussive cues live or die on this curve far more than on pitch.
const decay = (t, dur, k = 5) => Math.exp((-k * t) / dur);

// Equal-power fade over the last few ms. Cutting a wav mid-cycle leaves a step
// in the waveform, which every speaker reproduces as an audible click.
function fadeOut(buf, ms = 8) {
  const n = Math.min(buf.length, Math.round((RATE * ms) / 1000));
  for (let i = 0; i < n; i++) buf[buf.length - n + i] *= 1 - i / n;
}

// ── skill: the cast ────────────────────────────────────────────────────────
//
// Fires under the player's thumb at the moment they spend a cooldown they have
// been watching refill, so it has to land as an EVENT — brighter and heavier
// than the shot click it plays over the top of. Three layers: a rising sweep
// (something winding up), a noise transient (the moment of release), and a low
// sine thump underneath (weight).
function castSound() {
  const dur = 0.38;
  const buf = buffer(dur);
  const noise = noiseSource(0x5ca1e);

  for (let i = 0; i < buf.length; i++) {
    const t = i / RATE;
    const u = t / dur;

    // Sweep 220 → 880Hz. Quadratic so most of the travel is in the first half,
    // which reads as accelerating rather than as a siren.
    const f = 220 + 660 * u * u;
    const sweep = Math.sin(2 * Math.PI * f * t) * decay(t, dur, 3.2) * 0.42;

    // Transient: 25ms of filtered noise. The one-pole low-pass keeps it as a
    // thump rather than a hiss.
    const env = decay(t, 0.05, 6);
    const n = t < 0.05 ? noise() * env * 0.35 : 0;

    // Body: a low sine that decays fastest of the three, so the sound has a
    // punch at the front and a tail that is all sweep.
    const body = Math.sin(2 * Math.PI * 96 * t) * decay(t, 0.18, 5) * 0.5;

    buf[i] = sweep + n + body;
  }

  // One-pole low-pass over the whole thing, to take the fizz off the noise.
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    prev += (buf[i] - prev) * 0.45;
    buf[i] = prev;
  }

  fadeOut(buf);
  return buf;
}

// ── skillReady: the cooldown finishing ─────────────────────────────────────
//
// Plays unprompted, every cooldown, for the whole run — so the design brief is
// almost entirely about restraint. It exists because the player's eyes are on
// the arena and not on the button; it must be recognisable at low volume and
// forgettable at any volume. Two short sine blips a fifth apart, no noise, no
// low end: nothing that competes with a hit or a death.
function readySound() {
  const dur = 0.26;
  const buf = buffer(dur);
  const notes = [
    { at: 0.0,  f: 784 },  // G5
    { at: 0.08, f: 1175 }, // D6 — rising, which is the half that reads as "available"
  ];

  for (const note of notes) {
    const start = Math.round(note.at * RATE);
    const len = Math.round(0.16 * RATE);
    for (let i = 0; i < len && start + i < buf.length; i++) {
      const t = i / RATE;
      // 4ms attack, so the blip has an edge without a click.
      const attack = Math.min(1, t / 0.004);
      buf[start + i] +=
        Math.sin(2 * Math.PI * note.f * t) * attack * decay(t, 0.16, 5) * 0.3;
    }
  }

  fadeOut(buf);
  return buf;
}

fs.mkdirSync(OUT, { recursive: true });
writeWav(path.join(OUT, 'skill.wav'), castSound());
writeWav(path.join(OUT, 'skillReady.wav'), readySound());
