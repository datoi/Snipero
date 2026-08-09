import { World } from '../engine/types';
import { normalize } from '../engine/vec';
import { confine, moveCircle } from './obstacles';

// Drop any held stick input. The simulation has to own this, because the
// Joystick can be torn down mid-gesture: when an overlay takes over the screen
// the component unmounts, so its release handler never fires and whatever
// direction was held stays latched in world.input forever. The hero then walks
// off on its own the moment play resumes — and, since the attack timer only
// advances while standing still, cannot fire a shot until the player touches
// the stick again. Any transition out of 'playing' must call this.
export function clearInput(world: World) {
  world.input.moving = false;
  world.input.axis.x = 0;
  world.input.axis.y = 0;
  world.player.stillTime = 0;
}

// PlayerMotor equivalent: move while the joystick is pushed, hard-stop otherwise.
export function updatePlayerMovement(world: World, dt: number) {
  const { player, input } = world;
  if (!input.moving) return; // standing still — no movement (enables stop-to-shoot)

  player.facing = normalize(input.axis);

  // Slide along cover instead of catching on it — pushing diagonally into a wall
  // should still carry you along its face.
  moveCircle(
    player.pos,
    player.radius,
    input.axis.x * player.speed * dt,
    input.axis.y * player.speed * dt,
    world.obstacles
  );

  confine(player.pos, player.radius, world); // keep on screen and out of cover
}
