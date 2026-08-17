import { CONFIG } from '../config';
import type { Door } from '../engine/types';

// The exit, drawn as a thing in the world rather than a thing on the screen.
//
// This replaces the grey-to-green bar the arena used to wear. That bar was HUD
// pretending to be scenery, and once the ground became a painted backdrop it
// read as exactly that — a UI widget lying on the grass.
//
// It also replaces the assumption that took its place, which was that the
// backdrop would always paint a doorway of its own. The current arena art has
// no door anywhere in it: the top edge is open grass between two buildings. So
// the exit needs a mark the game draws itself, and the mark has to survive any
// backdrop that turns up next — including one with a painted door, where this
// still reads as the gate standing in front of it.
//
// Built out of the room's own material. The posts take the same side/edge
// colours the theme gives cover, so the gate looks like it was built by
// whoever built the walls rather than dropped in from the menu. That is the
// whole difference between scenery and interface.
//
// Geometry lives here rather than in either renderer for the same reason
// backdropLayout does: the Views canvas and the Skia canvas must not be able to
// disagree about where the way out is.

export interface GateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GateLayout {
  /** The two pillars flanking the opening — the dark, vertical faces. */
  posts: GateRect[];
  /** Lit lip down the inner edge of each pillar. Gives them height. */
  caps: GateRect[];
  /** Threshold across the floor of the opening: the line you step over. */
  sill: GateRect;
  /**
   * Stacked bands fading upward through the opening. Empty while the room is
   * still being fought — this is the whole "it is open now" signal, and it has
   * to be absent before it can mean anything.
   */
  glow: GateRect[];
}

/**
 * Lay the gate out around the exit zone.
 *
 * Everything is derived from `door`, which is the ACTUAL trigger (see
 * CONFIG.door). Drawing anything that is not derived from it would let the mark
 * and the thing it marks drift apart — and with an invisible trigger, a gate
 * drawn even slightly wide of it is worse than no gate, because the player
 * would be walking confidently at the wrong spot.
 */
export function gateLayout(door: Door): GateLayout {
  const c = CONFIG.door.gate;

  const halfW = door.width / 2;
  const left = door.pos.x - halfW;
  const right = door.pos.x + halfW;
  // The floor of the opening: the far edge of the band the player must cross.
  const sillY = door.pos.y + door.height / 2;

  const posts: GateRect[] = [
    { x: left - c.postW, y: 0, w: c.postW, h: sillY },
    { x: right, y: 0, w: c.postW, h: sillY },
  ];

  // Lip on the INNER edge of each pillar, facing the gap. Lighting the inside
  // rather than the top is what makes the two posts read as a way through
  // instead of as two separate blocks.
  const caps: GateRect[] = [
    { x: left - c.capW, y: 0, w: c.capW, h: sillY },
    { x: right, y: 0, w: c.capW, h: sillY },
  ];

  const sill: GateRect = { x: left, y: sillY - c.sillH, w: door.width, h: c.sillH };

  // Bands climbing from the sill toward the top of the screen, each one
  // shorter and fainter than the last (the renderer fades them). Flat steps
  // rather than a real gradient: a gradient needs a native dependency the Views
  // renderer deliberately does not have, and at this size five steps and a
  // smooth ramp are indistinguishable.
  const glow: GateRect[] = [];
  if (door.open) {
    for (let i = 0; i < c.glowBands; i++) {
      const t = i / c.glowBands;
      const h = c.sillH + i * c.glowStep;
      const inset = halfW * c.glowTaper * t;
      glow.push({
        x: left + inset,
        y: sillY - h,
        w: door.width - inset * 2,
        h,
      });
    }
  }

  return { posts, caps, sill, glow };
}

/** Alpha for glow band `i`, fading out as the bands climb. */
export function glowAlpha(i: number): number {
  const c = CONFIG.door.gate;
  return c.glowAlpha * (1 - i / c.glowBands);
}
