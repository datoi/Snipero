import { CONFIG } from '../config';
import { Player, World } from '../engine/types';
import { Vec2 } from '../engine/vec';

// Building a player projectile, separated from deciding to fire one.
//
// Same split, and the same reason, as blastSpawn.ts. `combat.ts` owns the
// auto-aim and the attack clock; a hero skill also needs to put shots in the
// air (see Salvo), and having it call into combat.ts would close an import
// cycle the moment combat.ts wanted to ask whether a skill was active.
//
// The alternative — letting skills.ts push its own projectile record — is worse
// than the cycle. A shot carries thirteen fields, six of which are the build
// that launched it: miss `frost` in a second copy and Iris's ultimate silently
// stops applying the player's own Frost stacks, which is the kind of bug that
// only shows up in a specific build fifteen rooms deep.

export interface ShotOpts {
  /** Scales the damage this shot lands. Skills use it; the basic attack doesn't. */
  mult?: number;
  /** Steering stacks, overriding whatever the build carries. */
  homing?: number;
  /** Force a critical rather than rolling for one (Kestrel's Mark). */
  crit?: boolean;
}

/**
 * How much Focus is currently paying.
 *
 * Read at spawn time rather than baked into p.damage, because the ramp has to
 * be able to fall back to nothing the instant the player moves — and a shot
 * already in flight keeps whatever it launched with, same as every other
 * modifier.
 */
function focusMult(p: Player): number {
  if (p.focus <= 0) return 1;
  const c = CONFIG.abilities.focus;
  const held = Math.min(p.stillTime, c.rampSeconds);
  return 1 + p.focus * c.perStackPerSec * held;
}

export function spawnPlayerShot(world: World, dir: Vec2, opts: ShotOpts = {}) {
  const p = world.player;

  // Crit is rolled per projectile rather than per shot, so multishot genuinely
  // buys more chances to spike — the two cards are meant to reinforce each other.
  const crit = opts.crit || (p.critChance > 0 && Math.random() < p.critChance);
  const dmg = p.damage * focusMult(p) * (opts.mult ?? 1);

  world.projectiles.push({
    id: world.nextId++,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: dir.x * CONFIG.projectile.speed, y: dir.y * CONFIG.projectile.speed },
    radius: CONFIG.projectile.radius,
    damage: crit ? dmg * p.critMult : dmg,
    life: CONFIG.projectile.life,
    pierce: p.pierce,
    hitIds: [],
    alive: true,
    bounces: p.bounces,
    burn: p.burn,
    frost: p.frost,
    crit,
    homing: opts.homing ?? p.homing,
  });
}
