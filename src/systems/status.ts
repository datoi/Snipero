import { CONFIG } from '../config';
import { Status, World } from '../engine/types';
import { damageBoss, damageEnemy } from './damage';

// Burn and slow — the two debuffs player shots can leave behind.
//
// Both refresh rather than extend: re-applying resets the clock and keeps the
// stronger effect. Stacking duration instead would mean a player who out-DPSes
// the timer builds an unkillable-length burn on a boss, and the fight stops
// being about positioning.

export function makeStatus(): Status {
  return { burnTime: 0, burnDps: 0, burnTick: 0, slowTime: 0, slowMult: 1 };
}

export function applyBurn(s: Status, stacks: number) {
  const c = CONFIG.abilities.blaze;
  const dps = c.dpsPerStack * stacks;
  if (s.burnTime <= 0) s.burnTick = c.tickInterval; // fresh burn: full beat before the first tick
  s.burnDps = Math.max(s.burnDps, dps);
  s.burnTime = c.duration;
}

export function applyFrost(s: Status, stacks: number) {
  const c = CONFIG.abilities.frost;
  // Clamped so frost can slow a wave to a crawl but never freeze it solid —
  // an enemy that can't close is an enemy the player can ignore.
  const mult = Math.max(1 - c.maxSlow, 1 - c.slowPerStack * stacks);
  s.slowMult = Math.min(s.slowMult, mult);
  s.slowTime = c.duration;
}

/** Movement multiplier for a body — 1 when it isn't slowed. */
export function slowFactor(s: Status): number {
  return s.slowTime > 0 ? s.slowMult : 1;
}

export function isBurning(s: Status): boolean {
  return s.burnTime > 0;
}

export function updateStatus(world: World, dt: number) {
  const burnColor = CONFIG.fx.number.burnColor;
  const interval = CONFIG.abilities.blaze.tickInterval;

  for (const e of world.enemies) {
    if (!e.alive) continue;
    const s = e.status;

    if (s.slowTime > 0) {
      s.slowTime -= dt;
      if (s.slowTime <= 0) s.slowMult = 1;
    }

    if (s.burnTime > 0) {
      s.burnTime -= dt;
      s.burnTick -= dt;
      if (s.burnTick <= 0) {
        // Reset rather than accumulate: a long frame must not queue up a burst
        // of back-to-back ticks once the game catches up.
        s.burnTick = interval;
        damageEnemy(world, e, s.burnDps * interval, { quiet: true, color: burnColor });
      }
      if (s.burnTime <= 0) s.burnDps = 0;
    }
  }

  const b = world.boss;
  if (b && b.alive) {
    const s = b.status;

    if (s.slowTime > 0) {
      s.slowTime -= dt;
      if (s.slowTime <= 0) s.slowMult = 1;
    }

    if (s.burnTime > 0) {
      s.burnTime -= dt;
      s.burnTick -= dt;
      if (s.burnTick <= 0) {
        s.burnTick = interval;
        damageBoss(world, b, s.burnDps * interval, { quiet: true, color: burnColor });
      }
      if (s.burnTime <= 0) s.burnDps = 0;
    }
  }
}
