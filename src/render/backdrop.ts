import { CONFIG } from '../config';

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
// The art is 832x1248, an aspect of 1.5. A phone arena is nearer 420x900, an
// aspect of 2.14 — considerably taller and narrower. Scaled to the arena's
// WIDTH the image is only 630px tall against 900px of arena, so fitting the
// width alone cannot cover the room. Something has to give, and which thing
// gives depends entirely on whether the ground is moving:
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
// edge meets its own bottom edge every 630px, and a photo-style backdrop that
// was not authored to wrap will show that join as a hard line marching down
// the arena. This one was not, which is the practical reason the game ships
// with scrollSpeed at 0 rather than merely a design preference.

export type BackdropId = 'foundry';

// Metro resolves `require` at bundle time, so the path must be a literal —
// same constraint that shapes sprites.ts, and the same answer: one table.
//
// Typed as `number` — a Metro module id, which is what require() actually
// hands back — rather than the wider ImageSourcePropType that sprites.ts uses.
// Both consumers need that narrower type: Skia's useImage takes the module id
// and rejects the union, while <Image source> accepts it happily. Widening it
// here would mean one of the two renderers could not use this table.
const BACKDROP: Record<BackdropId, number> = {
  foundry: require('../../assets/lucid-origin_Genre_Perspective_Orthographic_top-down_view_flat_no_distortion_high-definition_-0.jpg'),
};

// Intrinsic pixel size of each image above.
//
// Stated rather than measured, because both renderers need the aspect ratio
// BEFORE the image has decoded — the Skia canvas computes its whole frame as a
// pure function and has nowhere to wait — and because a layout that changes
// shape the moment decoding finishes is a visible jump on the first frame of
// every run. Keep in step with the file; a wrong number here shows up as art
// that is subtly stretched rather than as an error.
const SIZE: Record<BackdropId, { w: number; h: number }> = {
  foundry: { w: 832, h: 1248 },
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
  return 'foundry';
}

export function backdropSource(id: BackdropId): number {
  return BACKDROP[id];
}

export interface BackdropRect {
  x: number;
  y: number;
  w: number;
  h: number;
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

  // Overscan, so screen shake cannot drag an edge of the ground into view.
  //
  // The whole arena is translated by fx.shakeX/Y while a hit lands, and a
  // backdrop sized exactly to the arena would show a strip of backstop along
  // whichever edge the shake pulled away from — most visible on a boss death,
  // which is the single loudest shake in the game and the worst possible moment
  // for the floor to flicker. Derived from the shake ceiling rather than
  // written as its own number, because two numbers that must agree are two
  // numbers that will eventually disagree.
  const over = CONFIG.fx.shake.max;

  if (!backdropScrolling()) {
    // Cover: the larger of the two scales, so neither axis is left short.
    const scale = Math.max((width + over * 2) / src.w, (height + over * 2) / src.h);
    const w = src.w * scale;
    const h = src.h * scale;
    return [{ x: (width - w) / 2, y: (height - h) / 2, w, h }];
  }

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
