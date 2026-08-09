import { CONFIG } from '../config';
import { Boss, Enemy, World } from '../engine/types';
import { Vec2 } from '../engine/vec';
import { emitDeath, emitHit, emitNumber, flashHit } from './fx';
import { dropBossLoot, dropLoot } from './pickups';
import { grantKill } from './progression';
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

  e.hp -= amount;
  flashHit(e);

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
  }
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
    emitDeath(world, b.pos, CONFIG.boss.phases[b.phase].color, CONFIG.fx.shake.bossDeath);
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
