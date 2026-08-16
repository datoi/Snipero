import { World } from '../engine/types';
import { clearInput, updatePlayerMovement } from './movement';
import { updateCombat, updateProjectiles } from './combat';
import { updateEnemies, updateEnemyProjectiles } from './enemies';
import { updateBoss } from './boss';
import { updateRooms } from './rooms';
import { updateFx } from './fx';
import { updatePickups } from './pickups';
import { updateShrines } from './shrine';
import { updatePlayerDefense } from './playerDamage';
import { updateBlasts } from './blast';
import { updateStatus } from './status';
import { updateSkills } from './skills';

// The per-frame tick. When the run is paused (drafting a card) or over (dead),
// the simulation freezes — the UI overlay drives what happens next.
export function updateWorld(world: World, dt: number) {
  // Cosmetics tick even while paused or dead, so a death burst plays out
  // instead of hanging in mid-air behind the overlay.
  updateFx(world, dt);

  if (world.status !== 'playing') return;

  world.time += dt;

  // Before movement and combat, both of which ask whether a skill is running.
  // Casting first means a skill takes effect on the frame it was pressed rather
  // than the one after — at 60fps that is 16ms, and it is the difference between
  // a button that feels connected to the thumb and one that feels laggy.
  updateSkills(world, dt);
  updatePlayerMovement(world, dt);
  updateCombat(world, dt);       // may enter 'drafting' on level-up
  updateProjectiles(world, dt);  // applies burn/slow on hit
  updateStatus(world, dt);       // burn ticks + slow decay — before movement reads it
  updatePlayerDefense(world, dt); // shield refills once out of combat
  updateEnemies(world, dt);
  updateBoss(world, dt);         // boss state machine + attacks (if a boss room)
  updateEnemyProjectiles(world, dt);
  updateBlasts(world, dt);       // detonations resolve before the room-clear check
  updateShrines(world, dt);      // reward room: pick one of three offers
  updatePickups(world, dt);      // loot pop, magnet, collection
  updateRooms(world);            // room-clear → door → next room

  if (world.player.hp <= 0) {
    world.player.hp = 0;
    world.status = 'dead';
    clearInput(world); // the death overlay unmounts the Joystick mid-gesture
  }
}
