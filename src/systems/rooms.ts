import { CONFIG } from '../config';
import { World } from '../engine/types';
import { loadRoom } from './world';
import { clearInput } from './movement';
import { vacuumPickups } from './pickups';
import { shrinesResolved } from './shrine';
import { sfx } from './sfx';

// Room-by-room progression (mirrors the Unity RoomManager loop):
//   fighting → all enemies dead → open door → player walks through → next room.
export function updateRooms(world: World) {
  if (world.phase === 'fighting') {
    // A reward room spawns nothing, so the generic "no enemies left" test is
    // true on its very first frame — the exit opened before the player had made
    // their pick, which made the whole room walk-past-able. Choosing an offer is
    // that room's clear condition, exactly as the wave is a combat room's.
    if (!shrinesResolved(world)) return;

    // Cleared when no enemies remain AND the boss (if any) is dead.
    if (world.enemies.length === 0 && world.boss === null) {
      world.phase = 'cleared';

      // The last room of a chapter has no door to open — clearing it is the end
      // of the run, and the only ending that isn't a death. Endless has no last
      // room by definition, so it never takes this branch.
      if (isFinalRoom(world)) {
        // Sweep the floor first: winning must not cost the player the loot they
        // were standing next to when the boss died.
        vacuumPickups(world);
        for (const p of world.pickups) {
          if (p.kind === 'gear' && p.gearId) world.gearFound.push(p.gearId);
        }
        world.runGold += world.pickups
          .filter((p) => p.kind === 'coin')
          .reduce((sum, p) => sum + p.value, 0);
        world.pickups = [];

        world.status = 'won';
        clearInput(world);
        sfx('chestOpen');
        return;
      }

      world.door.open = true;
      sfx('doorOpen');
      // Sweep the floor toward the player rather than making them comb an
      // empty arena for one stray coin before they're allowed to move on.
      vacuumPickups(world);
    }
    return;
  }

  // phase === 'cleared': advance when the player steps into the open doorway.
  if (world.door.open && playerInDoor(world)) {
    loadRoom(world, world.roomIndex + 1); // advances roomIndex, relocks the door
  }
}

// How many rooms this run is, and whether we're standing in the last one.
export function chapterRooms(world: World): number {
  const chapters = CONFIG.chapters;
  return chapters[world.chapter % chapters.length].rooms;
}

export function isFinalRoom(world: World): boolean {
  return !world.endless && world.roomIndex >= chapterRooms(world) - 1;
}

function playerInDoor(world: World): boolean {
  const { player, door } = world;
  const halfW = door.width / 2;
  const halfH = door.height / 2;
  return (
    Math.abs(player.pos.x - door.pos.x) <= halfW + player.radius &&
    Math.abs(player.pos.y - door.pos.y) <= halfH + player.radius
  );
}
