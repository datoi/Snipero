import { CONFIG } from '../config';
import type { World } from '../engine/types';

// The arena's painted ground, and the maths for where it goes.
//
// This is an alternative to the tiled Kenney floor, not a layer on top of it:
// when a backdrop is present the renderers draw this INSTEAD of the tile grid,
// because two grounds stacked is just the top one with a wasted draw call
// underneath. The tiled floor stays as the fallback and is still what you see
// while this image is decoding — see the note on async loading below.
//
// ── Why the layout has two modes ───────────────────────────────────────────
//
// The art is 832x1248, an aspect of 1.5, while a phone screen wants nearer 2.06
// once the overscan below is accounted for. Scaled to the screen's WIDTH the
// image is too short to cover it. Something has to give, and which thing gives
// depends entirely on whether the ground is moving:
//
//   STATIC (scrollSpeed 0) — COVER. Scale until the image covers the arena,
//   keep its aspect, centre it, and let the overflow crop. One draw, and no
//   seam anywhere, because no edge of the image is ever on screen.
//
//   SCROLLING (scrollSpeed > 0) — FIT WIDTH, REPEAT DOWN. The full width is
//   visible and the image is repeated vertically from a wrapped offset, which
//   is the endless loop: as the offset grows, each copy walks down the screen
//   and a new one enters from above. Cover cannot be used here — a cropped
//   image has no repeat length, so there is nothing to loop.
//
// The second mode is the one that needs a VERTICALLY TILEABLE image: its top
// edge meets its own bottom edge every screen-width, and a painted backdrop
// that was not authored to wrap will show that join as a hard line marching
// down the arena. This one was not — its top and bottom edges are both dressed
// with structures and foliage — which is the practical reason the game ships
// with scrollSpeed at 0 rather than merely a design preference.
//
// ── What the aspect mismatch costs ─────────────────────────────────────────
//
// At 1.5 against a screen wanting 2.06, cover throws away 34% of the image's
// WIDTH on a typical phone. What it throws away is specifically the left and
// right stone walls, which are the strongest part of this art's framing — the
// visible slice runs from roughly x 141 to x 691 of 832, and both walls sit
// outside it.
//
// The code is doing the only sound thing available to it: preserve the aspect,
// cover the screen, seams nowhere. The mismatch is in the source. Art authored
// at 1:2 — 1024x2048 — would lose about 3% instead of 34%, and the walls would
// survive.

// Geometry and the size table live in backdropFit, which holds no requires so
// the simulation can share them. This file adds the images themselves.
import {
  BACKDROP_SIZE as SIZE,
  containRect,
  type BackdropId,
  type Rect as BackdropRect,
} from './backdropFit';

export type { BackdropId, BackdropRect };

// Metro resolves `require` at bundle time, so the path must be a literal —
// same constraint that shapes sprites.ts, and the same answer: one table.
//
// Typed as `number` — a Metro module id, which is what require() actually
// hands back — rather than the wider ImageSourcePropType that sprites.ts uses.
// Both consumers need that narrower type: Skia's useImage takes the module id
// and rejects the union, while <Image source> accepts it happily. Widening it
// here would mean one of the two renderers could not use this table.
const BACKDROP: Record<BackdropId, number> = {
  arena: require('../../assets/gemini-2.5-flash-image_Prompt_Outpaint_seamlessly_in_all_four_directions_top_bottom_left_and_right_arou-0.jpg'),
};

/**
 * Which backdrop a chapter uses, or null for the tiled floor.
 *
 * One image today, so every chapter shares it. Going per-chapter is a table
 * here plus one extra `useImage` in GameCanvasSkia — hooks cannot be called
 * conditionally, so that renderer has to load every backdrop it might use, and
 * pick between the decoded results rather than between the requires.
 */
export function backdropFor(_chapter: number): BackdropId | null {
  return 'arena';
}

export function backdropSource(id: BackdropId): number {
  return BACKDROP[id];
}

/**
 * How far the ground has travelled, in px, at a given moment in the run.
 *
 * A pure function of `world.time` and config — it owns no clock of its own, for
 * the same reason render/anim.ts doesn't: two renderers asking on the same
 * frame must get the same answer, and a paused game should stop rather than
 * drift on behind the overlay. `world.time` only advances while playing, so
 * both of those fall out for free.
 *
 * Positive scrolls DOWNWARD.
 */
export function backdropScroll(time: number): number {
  const c = CONFIG.background;
  return time * c.scrollSpeed * c.parallax;
}

/** True when the ground is actually moving, which is what selects the mode. */
export function backdropScrolling(): boolean {
  const c = CONFIG.background;
  return c.scrollSpeed !== 0 && c.parallax !== 0;
}

/**
 * Where to draw the backdrop, as one or more rects in arena coordinates.
 *
 * Returns a LIST so the two modes above are one code path for the callers: a
 * static cover is a list of one, and a scroll is however many copies it takes
 * to cover the arena from the current offset. Neither renderer has to know
 * which mode it is in, which is what stops the Views canvas and the Skia canvas
 * from disagreeing about where the ground is.
 */
export function backdropLayout(
  id: BackdropId,
  width: number,
  height: number,
  scrollY: number,
): BackdropRect[] {
  const src = SIZE[id];

  if (!backdropScrolling()) {
    // Contain: the whole image, always. Shared with the simulation, which
    // derives the arena from this exact rect — see backdropFit.containRect.
    // Calling it rather than repeating the maths is the point: if these two
    // disagreed by a pixel, the invisible wall would part company with the
    // painted one.
    return [containRect(id, width, height)];
  }

  // Scrolling overscans by the shake ceiling. Only this mode needs it: a
  // scrolling ground is drawn edge to edge, so any slack at the sides would
  // show. The static mode above has bars by design and nothing to protect.
  const over = CONFIG.fx.shake.max;

  // Scrolling fits the arena's width — plus the same overscan, since a shake
  // moves sideways too. The vertical ends are already covered: the first copy
  // starts a full image above the top edge.
  const w = width + over * 2;
  const h = w * (src.h / src.w);

  // Wrap into [0, h). The double modulo is for a negative scrollY: a parallax
  // set to a negative multiplier scrolls the ground upward, and JS's % keeps
  // the sign of the left operand, which would put the first copy off screen.
  const off = ((scrollY % h) + h) % h;

  // Walk far enough above the top edge that the overscan margin is covered too,
  // then lay copies down until the arena is filled.
  //
  // The `while` is not decoration. Starting at `off - h` alone looks correct and
  // fails once per wrap: as `off` approaches h the first copy's top rises to
  // exactly y=0, leaving nothing above it, and a shake pulling the camera down
  // at that instant exposes a band of backstop across the top of the screen.
  // Once per loop, for a couple of frames — the kind of flicker that is nearly
  // impossible to catch by eye and trivial to catch by asserting on it.
  let y = off - h;
  while (y > -over) y -= h;

  // Bounded by the arena's height rather than a fixed count of two, so an image
  // shorter than the screen still fills it instead of leaving a gap.
  const out: BackdropRect[] = [];
  for (; y < height + over; y += h) out.push({ x: -over, y, w, h });
  return out;
}

/**
 * Where the backdrop's copies sit this frame, for a given world.
 *
 * THE ONLY WAY EITHER RENDERER SHOULD ASK. The backdrop is screen space — it
 * fills the letterbox margin as well as the arena — and the moment those became
 * two different rectangles, `backdropLayout` grew a way to be called wrongly
 * that type-checks perfectly: hand it `world.bounds` instead of `world.screen`
 * and the art is laid out to the PLAYFIELD, covering about two thirds of the
 * display and leaving the rest bare black with the player standing in it.
 *
 * That shipped, and it shipped in only one of the two renderers, which is the
 * tell — the same fact was being derived twice. This wrapper exists so the
 * choice is made once, here, rather than at each call site.
 */
export function backdropRectsFor(world: World, id: BackdropId): BackdropRect[] {
  return backdropLayout(id, world.screen.w, world.screen.h, backdropScroll(world.time));
}
