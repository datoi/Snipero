import { CONFIG } from '../config';
import { World } from '../engine/types';
import { normalize } from '../engine/vec';
import { confine, moveCircle } from './obstacles';
import { skillActive } from './skills';

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
  // A buffered skill press dies with the interruption too. Spending it on the
  // far side of a pause — into a room the player has not looked at yet — is the
  // same class of bug as the latched direction above.
  world.input.skillHeld = 0;
}

// PlayerMotor equivalent: move while the joystick is pushed, hard-stop otherwise.
export function updatePlayerMovement(world: World, dt: number) {
  const { player, input } = world;
  if (!input.moving) return; // standing still — no movement (enables stop-to-shoot)

  const dir = normalize(input.axis);
  player.facing = dir;
  // The player's own heading, recorded separately because combat is about to
  // overwrite `facing` with the auto-aim the moment they stop. A fresh object
  // rather than a second reference to `dir`: aliasing the two would make any
  // future in-place write to one silently move the other.
  player.moveFacing = { x: dir.x, y: dir.y };

  const fromX = player.pos.x;
  const fromY = player.pos.y;

  // Windfall hurries the collection it just started, so the loot and the hero
  // meet in the middle rather than the player standing still watching it arrive.
  const speed = skillActive(player, 'windfall')
    ? player.speed * (1 + CONFIG.skills.windfall.speedBoost)
    : player.speed;

  // Slide along cover instead of catching on it — pushing diagonally into a wall
  // should still carry you along its face.
  moveCircle(
    player.pos,
    player.radius,
    input.axis.x * speed * dt,
    input.axis.y * speed * dt,
    world.obstacles
  );

  confine(player.pos, player.radius, world); // keep on screen and out of cover

  // Walk cadence, advanced by ground actually covered — see CONFIG.fx.gaitPerPx.
  // Measured AFTER confine so walking into a wall stops the animation instead of
  // marching on the spot, which is the tell that gives a fake walk cycle away.
  player.gait +=
    Math.hypot(player.pos.x - fromX, player.pos.y - fromY) * CONFIG.fx.gaitPerPx;
}
