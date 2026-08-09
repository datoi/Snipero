import { CONFIG } from '../config';
import { Chest, World } from '../engine/types';
import { dist, vec } from '../engine/vec';
import { addShake, emitDeath } from './fx';
import { dropChestLoot } from './pickups';
import { enterDraft } from './progression';
import { haptic, sfx } from './sfx';

// Chest rooms: no enemies, one reward. Walking into the chest pops it, and a
// beat later it pays out gold, healing, and a free ability pick — reusing the
// level-up draft, so the reward is a choice rather than a number going up.

export function makeChest(w: number, h: number): Chest {
  return {
    pos: vec(w / 2, h * 0.42),
    radius: CONFIG.chest.radius,
    opened: false,
    openTimer: 0,
    paid: false,
  };
}

export function updateChest(world: World, dt: number) {
  const chest = world.chest;
  if (!chest || chest.paid) return;

  const c = CONFIG.chest;

  if (!chest.opened) {
    const reach = chest.radius + world.player.radius + c.openRange;
    if (dist(chest.pos, world.player.pos) <= reach) {
      chest.opened = true;
      chest.openTimer = c.openTime;
      sfx('chestOpen');
      haptic('light');
      addShake(world, 4);
      emitDeath(world, chest.pos, '#ffd45e', 0); // lid burst
    }
    return;
  }

  // Opened: hold for a beat, then pay out exactly once.
  chest.openTimer -= dt;
  if (chest.openTimer > 0) return;

  chest.paid = true;
  dropChestLoot(world, chest.pos, c.gold, c.hearts, c.heartHeal);

  // A free pick from the ability pool. Queue it the same way a level-up does,
  // so a level-up landing on the same frame still gets its own card.
  world.pendingDrafts += 1;
  if (world.status === 'playing') enterDraft(world);
}
