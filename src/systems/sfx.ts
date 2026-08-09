// Audio and haptics, as seen by the simulation.
//
// This file deliberately imports nothing. Gameplay calls `sfx('hit')` and moves
// on; whether anything is listening is not its problem. The actual player lives
// in src/audio/AudioEngine.ts and registers itself at startup.
//
// Two reasons it's split this way:
//
//  1. The simulation stays pure. Every system under src/systems can be
//     transpiled and run headlessly in Node — which is how the invariant suite
//     and the softlock traces work. One `import 'expo-audio'` inside combat.ts
//     would end that, and it would end it silently, at the point where the
//     tests are most worth having.
//
//  2. Audio can never affect gameplay. Nothing here returns a value or throws,
//     so a missing file, a muted player, or an engine that failed to load
//     changes exactly nothing about how a run plays out. Same contract the fx
//     system has: fire-and-forget, deletable, never read back.

export type SfxId =
  | 'shot'
  | 'hit'
  | 'crit'
  | 'enemyDeath'
  | 'playerHit'
  | 'levelUp'
  | 'draftPick'
  | 'coin'
  | 'heart'
  | 'doorOpen'
  | 'chestOpen'
  | 'bossIntro'
  | 'bossDeath'
  | 'telegraph';

export type HapticId = 'light' | 'medium' | 'heavy';

type SfxSink = (id: SfxId) => void;
type HapticSink = (id: HapticId) => void;

let sfxSink: SfxSink | null = null;
let hapticSink: HapticSink | null = null;

export function setSfxSink(sink: SfxSink | null) {
  sfxSink = sink;
}

export function setHapticSink(sink: HapticSink | null) {
  hapticSink = sink;
}

export function sfx(id: SfxId) {
  if (sfxSink) sfxSink(id);
}

export function haptic(id: HapticId) {
  if (hapticSink) hapticSink(id);
}
