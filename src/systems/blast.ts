import { CONFIG } from '../config';
import { Blast, World } from '../engine/types';
import { dist } from '../engine/vec';
import { emitDeath, shakeAtMost } from './fx';
import { damageBoss, damageEnemy } from './damage';
import { damagePlayer } from './playerDamage';
import { segmentBlocked } from './obstacles';
import { haptic, sfx } from './sfx';

// Delayed area detonations. One primitive, spawned by anything that wants to put
// damage on the floor a moment from now: bombers, boss bombs, and the player's
// Detonate card. `spawnBlast` lives in blastSpawn.ts so that this file is free
// to import both damage paths — see the note there.
//
// A blast belongs to one side and never hurts both. A bomber whose blast also
// cleared the wave around it would make the archetype a liability for its own
// team; a Detonate chain that killed the player would turn a card they may be
// forced to draft into a trap.

export function updateBlasts(world: World, dt: number) {
  if (world.blasts.length === 0) return;

  for (const b of world.blasts) {
    if (b.done) continue;

    b.fuse -= dt;
    if (b.fuse > 0) continue;
    b.done = true;

    if (b.hostile) hitPlayer(world, b);
    else hitEnemies(world, b);

    sfx('bossDeath'); // the heaviest boom in the pack until a dedicated one exists
    shakeAtMost(world, CONFIG.fx.shake.blast);
    emitDeath(world, b.pos, CONFIG.blast.color, 0);
  }

  world.blasts = world.blasts.filter((b) => !b.done);
}

function hitPlayer(world: World, b: Blast) {
  const p = world.player;
  const d = dist(b.pos, p.pos);

  // Cover stops a blast. Standing behind a rock has to be worth something, or
  // the only counter-play is distance and the arena layout stops mattering the
  // moment a bomber is on the board.
  const reach = b.radius + p.radius;
  if (d > reach || segmentBlocked(b.pos, p.pos, world.obstacles, 0)) return;

  damagePlayer(world, b.damage * falloff(d, reach));
  haptic('heavy'); // heavier than the standard hit buzz damagePlayer gives
}

function hitEnemies(world: World, b: Blast) {
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const reach = b.radius + e.radius;
    const d = dist(b.pos, e.pos);
    if (d > reach || segmentBlocked(b.pos, e.pos, world.obstacles, 0)) continue;

    // `quiet` because a five-body chain reaction firing five impact sounds and
    // five spark bursts is noise, not feedback — the blast already sold itself.
    damageEnemy(world, e, b.damage * falloff(d, reach), {
      quiet: true,
      color: CONFIG.blast.color,
    });
  }

  const boss = world.boss;
  if (!boss || !boss.alive) return;
  const reach = b.radius + boss.radius;
  const d = dist(b.pos, boss.pos);
  if (d > reach || segmentBlocked(b.pos, boss.pos, world.obstacles, 0)) return;

  damageBoss(world, boss, b.damage * falloff(d, reach), {
    quiet: true,
    color: CONFIG.blast.color,
  });
}

// Falls off toward the rim, so being clipped by the edge is a warning and being
// caught dead centre is the punishment. Never reaches zero: a blast that does
// nothing at the edge trains players to stand exactly on the edge, which is a
// worse habit than simply moving away.
function falloff(d: number, reach: number): number {
  const min = CONFIG.blast.minDamageFraction;
  return min + (1 - min) * (1 - Math.min(1, d / reach));
}
