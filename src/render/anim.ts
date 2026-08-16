import { CONFIG } from '../config';
import { Vec2 } from '../engine/vec';
import { angleOf } from './sprites';

// Motion for bodies that have no animation frames.
//
// The whole cast is static art — one image per pose, no walk cycle, no death
// frames — so every bit of life on screen has to be generated from state the
// simulation already keeps. That turns out to be enough, because the three
// things a player actually reads are all events the game already knows about:
// am I walking, did I just fire, was I just hit.
//
// Deliberately a pure function of that state and nothing else. It holds no
// timers of its own, so two renderers calling it on the same frame get the same
// answer, and a paused game freezes mid-animation instead of drifting.

export interface BodyAnim {
  /** Degrees: the body's heading, plus the lean of its current step. */
  rotate: number;
  /** Uniform scale. 1 is at rest. */
  scale: number;
  /** Where to draw the body, after recoil has pushed it off its position. */
  x: number;
  y: number;
}

/**
 * @param gait      distance-driven walk clock (see CONFIG.fx.gaitPerPx)
 * @param recoil    seconds left of the firing kick
 * @param hitFlash  seconds left of the white flash, reused for the hit punch
 */
export function bodyAnim(
  pos: Vec2,
  facing: Vec2,
  gait: number,
  recoil: number,
  hitFlash: number,
  radius: number,
): BodyAnim {
  const c = CONFIG.fx;

  // Walk. The body leans into each step and rises slightly at mid-stride, so a
  // moving sprite rocks instead of sliding. The bob runs at twice the roll's
  // frequency because a stride has two steps in it — matching them makes the
  // body limp.
  const roll = Math.sin(gait) * c.gaitRollDeg;
  let scale = 1 + Math.sin(gait * 2) * c.gaitBob;

  // Hit. A short punch outward on top of the white flash — the flash says "that
  // landed" and the scale says "that hurt". Riding hitFlashTime rather than
  // owning a timer keeps the two exactly in step.
  if (hitFlash > 0) {
    scale += c.hitSquash * Math.min(1, hitFlash / c.hitFlashTime);
  }

  // Fire. Kicked back along the barrel, easing out — the push is biggest on the
  // frame the shot leaves and gone a tenth of a second later.
  let x = pos.x;
  let y = pos.y;
  if (recoil > 0) {
    const t = Math.min(1, recoil / c.recoilTime);
    const push = radius * c.recoilPush * t * t;
    x -= facing.x * push;
    y -= facing.y * push;
  }

  return { rotate: angleOf(facing) + roll, scale, x, y };
}
