import { World } from '../engine/types';
import { Vec2 } from '../engine/vec';

// Spawning a blast, separated from resolving one.
//
// `blast.ts` has to hurt things, so it imports both damage paths. `damage.ts`
// has to spawn blasts (a bomber detonates when killed, and so does anything the
// player killed while holding Detonate). Those two facts together are an import
// cycle, and this file is the smallest thing that breaks it: pushing a record
// onto an array needs no dependencies at all.
export function spawnBlast(
  world: World,
  at: Vec2,
  radius: number,
  damage: number,
  fuse: number,
  /** True = hurts the player (bombers, boss bombs). False = hurts enemies. */
  hostile = true
) {
  world.blasts.push({
    id: world.nextId++,
    pos: { x: at.x, y: at.y },
    radius,
    damage,
    fuse,
    maxFuse: fuse,
    hostile,
    done: false,
  });
}
