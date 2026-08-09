import { World } from '../engine/types';
import { loadRoom } from './world';
import { vacuumPickups } from './pickups';
import { sfx } from './sfx';

// Room-by-room progression (mirrors the Unity RoomManager loop):
//   fighting → all enemies dead → open door → player walks through → next room.
export function updateRooms(world: World) {
  if (world.phase === 'fighting') {
    // A chest room spawns nothing, so the generic "no enemies left" test is true
    // on its very first frame — the exit opened before the player had touched
    // the reward, which made the whole room walk-past-able. The chest is that
    // room's clear condition, exactly as the wave is a combat room's.
    if (world.chest && !world.chest.paid) return;

    // Cleared when no enemies remain AND the boss (if any) is dead.
    if (world.enemies.length === 0 && world.boss === null) {
      world.phase = 'cleared';
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
    world.roomIndex += 1;
    loadRoom(world, world.roomIndex); // resets phase to 'fighting', locks the door
  }
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
