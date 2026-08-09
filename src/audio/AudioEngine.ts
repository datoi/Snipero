import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { HapticId, SfxId, setHapticSink, setSfxSink } from '../systems/sfx';

// The playback backend. Everything React-Native-facing about audio lives here;
// the simulation only ever sees the pure sink in systems/sfx.ts.
//
// Two problems any game SFX layer has to solve, both handled below:
//
//  Overlap — a single player can't play over itself. Calling play() again just
//  restarts it, so rapid fire turns into one stuttering click. Each sound gets
//  a small round-robin pool instead.
//
//  Density — at 3 shots/sec with multishot and pierce, hit events can fire
//  dozens of times a second. Playing all of them is not louder, it's mud. Each
//  sound has a minimum gap, and requests inside that window are dropped.

// Metro needs literal require() paths — these cannot be built from a variable.
const SOURCES: Record<SfxId, number> = {
  shot: require('../../assets/sfx/shot.wav'),
  hit: require('../../assets/sfx/hit.wav'),
  crit: require('../../assets/sfx/crit.wav'),
  enemyDeath: require('../../assets/sfx/enemyDeath.wav'),
  playerHit: require('../../assets/sfx/playerHit.wav'),
  levelUp: require('../../assets/sfx/levelUp.wav'),
  draftPick: require('../../assets/sfx/draftPick.wav'),
  coin: require('../../assets/sfx/coin.wav'),
  heart: require('../../assets/sfx/heart.wav'),
  doorOpen: require('../../assets/sfx/doorOpen.wav'),
  chestOpen: require('../../assets/sfx/chestOpen.wav'),
  bossIntro: require('../../assets/sfx/bossIntro.wav'),
  bossDeath: require('../../assets/sfx/bossDeath.wav'),
  telegraph: require('../../assets/sfx/telegraph.wav'),
};

// volume: relative mix. pool: how many can overlap. gap: min seconds between
// retriggers. The mix is the tuning surface — loud events earn their volume by
// being rare, and the constant chatter (shot, hit, coin) sits well underneath.
interface SoundSpec {
  volume: number;
  pool: number;
  gap: number;
}

const SPEC: Record<SfxId, SoundSpec> = {
  shot: { volume: 0.3, pool: 4, gap: 0.045 },
  hit: { volume: 0.38, pool: 4, gap: 0.04 },
  crit: { volume: 0.55, pool: 2, gap: 0.07 },
  enemyDeath: { volume: 0.5, pool: 3, gap: 0.05 },
  playerHit: { volume: 0.7, pool: 2, gap: 0.15 },
  levelUp: { volume: 0.6, pool: 1, gap: 0.3 },
  draftPick: { volume: 0.5, pool: 1, gap: 0.08 },
  coin: { volume: 0.28, pool: 3, gap: 0.05 },
  heart: { volume: 0.5, pool: 1, gap: 0.12 },
  doorOpen: { volume: 0.45, pool: 1, gap: 0.5 },
  chestOpen: { volume: 0.55, pool: 1, gap: 0.5 },
  bossIntro: { volume: 0.7, pool: 1, gap: 1.0 },
  bossDeath: { volume: 0.75, pool: 1, gap: 1.0 },
  telegraph: { volume: 0.32, pool: 3, gap: 0.09 },
};

interface Voice {
  players: AudioPlayer[];
  next: number;
  lastAt: number; // seconds, from performance.now()
}

let voices: Partial<Record<SfxId, Voice>> = {};
let started = false;
let muted = false;

const now = () => Date.now() / 1000;

export function startAudio() {
  if (started) return;
  started = true;

  for (const key of Object.keys(SOURCES) as SfxId[]) {
    const spec = SPEC[key];
    const players: AudioPlayer[] = [];
    try {
      for (let i = 0; i < spec.pool; i++) {
        const p = createAudioPlayer(SOURCES[key]);
        p.volume = spec.volume;
        players.push(p);
      }
    } catch {
      // A sound that fails to load is simply never heard. Audio must not be
      // able to take the game down with it.
      continue;
    }
    voices[key] = { players, next: 0, lastAt: 0 };
  }

  setSfxSink(play);
  setHapticSink(vibrate);
}

export function stopAudio() {
  setSfxSink(null);
  setHapticSink(null);
  for (const v of Object.values(voices)) {
    for (const p of v!.players) {
      try { p.remove(); } catch { /* already gone */ }
    }
  }
  voices = {};
  started = false;
}

export function setMuted(next: boolean) {
  muted = next;
}

export function isMuted() {
  return muted;
}

function play(id: SfxId) {
  if (muted) return;
  const v = voices[id];
  if (!v || v.players.length === 0) return;

  const t = now();
  if (t - v.lastAt < SPEC[id].gap) return; // inside the density window — drop it
  v.lastAt = t;

  const p = v.players[v.next];
  v.next = (v.next + 1) % v.players.length;

  try {
    p.seekTo(0);
    p.play();
  } catch {
    // Playback failures are cosmetic by definition; swallow and move on.
  }
}

function vibrate(id: HapticId) {
  if (muted) return;
  const style =
    id === 'heavy'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : id === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  // Fire-and-forget: on a device without a taptic engine this simply resolves.
  Haptics.impactAsync(style).catch(() => {});
}
