import { CONFIG } from '../config';
import { Boss, Enemy, World } from '../engine/types';
import { Vec2 } from '../engine/vec';
import { emitDeath, emitHit, emitNumber, flashHit } from './fx';
import { dropBossLoot, dropLoot } from './pickups';
import { grantKill } from './progression';
import { spawnBlast } from './blastSpawn';
import { bossPhases } from './boss';
import { bossScale } from './difficulty';
import { haptic, sfx } from './sfx';

// The single path by which anything loses HP and dies.
//
// This used to live inline inside the projectile loop, which was fine while a
// projectile was the only thing that could kill. Burn ticks changed that: a
// second kill site would have meant a second copy of the loot/XP/FX payout, and
// the two would have drifted the first time either was touched. Damage over
// time that doesn't drop gold is exactly the kind of bug that survives for
// months because it only shows up when the last hit happens to be a burn tick.

export interface HitOpts {
  /** Travel direction of whatever landed the hit — sparks spray back along it. */
  dir?: Vec2;
  /** Tint override for the damage number (crit, burn). */
  color?: string;
  /** Skip the spark burst. Burn ticks 4x/sec; sparks on each would be a blizzard. */
  quiet?: boolean;
  /** Rolled critical — earns the louder, brighter impact sound. */
  crit?: boolean;
}

export function damageEnemy(world: World, e: Enemy, amount: number, opts: HitOpts = {}) {
  if (!e.alive || amount <= 0) return;

  // Clamp to what's actually left, so a 900-damage hit on a 40 HP body doesn't
  // siphon back 900 damage worth of health.
  const dealt = Math.min(amount, e.hp);
  e.hp -= amount;
  flashHit(e);
  siphon(world, dealt, opts);

  if (opts.quiet) {
    emitNumber(world, e.pos, amount, opts.color);
  } else {
    emitHit(world, e.pos, amount, opts.dir, false, opts.color);
    sfx(opts.crit ? 'crit' : 'hit');
  }

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    sfx('enemyDeath');
    emitDeath(world, e.pos, e.color);
    dropLoot(world, e.pos, e.goldReward);
    grantKill(world, e.xpReward);

    // A bomber killed is a bomber detonated. Shooting one at point-blank range
    // has to hurt, or "stand still and shoot everything" would answer the one
    // archetype built to punish exactly that. The short fuse keeps it fair: the
    // kill is still a warning, not a hit the player never had a chance to read.
    if (e.kind === 'bomber') {
      spawnBlast(
        world, e.pos,
        CONFIG.enemies.bomber.blastRadius,
        e.blastDamage,
        CONFIG.enemies.bomber.deathFuse
      );
    }

    detonateOnKill(world, e.pos);
  }
}

// Siphon: a slice of damage dealt comes back as health.
//
// Direct hits only. Burn ticks four times a second and would turn Blaze +
// Siphon into a self-sustaining engine rather than a trade — `quiet` is exactly
// the flag that marks damage-over-time, so it's the right thing to test.
function siphon(world: World, dealt: number, opts: HitOpts) {
  const p = world.player;
  if (p.lifesteal <= 0 || opts.quiet || dealt <= 0) return;
  if (p.hp >= p.maxHp) return;

  const healed = Math.min(dealt * p.lifesteal, p.maxHp - p.hp);
  if (healed <= 0) return;
  p.hp += healed;
}

// Detonate: kills leave a blast behind, which is how a big volley into a pack
// chains. Spawned NOT hostile, so it hurts enemies and never the player: this
// is a card the draft can force on you, and one that could kill you would make
// taking it a mistake rather than a build.
//
// It still gets a short fuse. An instant chain would resolve every kill in the
// same frame, which reads as one flash rather than a cascade.
function detonateOnKill(world: World, at: Vec2) {
  const p = world.player;
  if (p.detonate <= 0) return;

  const c = CONFIG.abilities.detonate;
  spawnBlast(world, at, c.radius, c.damagePerStack * p.detonate,
    CONFIG.abilities.detonate.fuse, false);
}

export function damageBoss(world: World, b: Boss, amount: number, opts: HitOpts = {}) {
  if (!b.alive || amount <= 0) return;

  b.hp -= amount;
  flashHit(b);

  if (opts.quiet) {
    emitNumber(world, b.pos, amount, opts.color ?? CONFIG.fx.number.bossColor);
  } else {
    emitHit(world, b.pos, amount, opts.dir, true, opts.color);
    sfx(opts.crit ? 'crit' : 'hit');
  }

  if (b.hp <= 0) {
    b.hp = 0;
    b.alive = false;
    sfx('bossDeath');
    haptic('heavy');
    // Three staggered bursts so the kill lands harder than a normal death.
    emitDeath(world, b.pos, bossPhases(b)[b.phase].color, CONFIG.fx.shake.bossDeath);
    emitDeath(world, b.pos, '#ffd45e', 0);
    emitDeath(world, b.pos, '#ffffff', 0);
    // Rewards track depth the same way the boss's own stats do, or a late boss
    // would cost far more to kill than it pays.
    const reward = bossScale(world.roomIndex).reward;
    dropBossLoot(world, b.pos, Math.round(CONFIG.boss.goldReward * reward));
    world.boss = null;
    grantKill(world, Math.round(CONFIG.boss.xpReward * reward));
  }
}
