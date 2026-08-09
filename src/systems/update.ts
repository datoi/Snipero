import { World } from '../engine/types';
import { clearInput, updatePlayerMovement } from './movement';
import { updateCombat, updateProjectiles } from './combat';
import { updateEnemies, updateEnemyProjectiles } from './enemies';
import { updateBoss } from './boss';
import { updateRooms } from './rooms';
import { updateFx } from './fx';
import { updatePickups } from './pickups';
import { updateChest } from './chest';
import { updateStatus } from './status';

// The per-frame tick. When the run is paused (drafting a card) or over (dead),
// the simulation freezes — the UI overlay drives what happens next.
export function updateWorld(world: World, dt: number) {
  // Cosmetics tick even while paused or dead, so a death burst plays out
  // instead of hanging in mid-air behind the overlay.
  updateFx(world, dt);

  if (world.status !== 'playing') return;

  world.time += dt;

  updatePlayerMovement(world, dt);
  updateCombat(world, dt);       // may enter 'drafting' on level-up
  updateProjectiles(world, dt);  // applies burn/slow on hit
  updateStatus(world, dt);       // burn ticks + slow decay — before movement reads it
  updateEnemies(world, dt);
  updateBoss(world, dt);         // boss state machine + attacks (if a boss room)
  updateEnemyProjectiles(world, dt);
  updateChest(world, dt);        // chest room: walk in, open, pay out
  updatePickups(world, dt);      // loot pop, magnet, collection
  updateRooms(world);            // room-clear → door → next room

  if (world.player.hp <= 0) {
    world.player.hp = 0;
    world.status = 'dead';
    clearInput(world); // the death overlay unmounts the Joystick mid-gesture
  }
}
