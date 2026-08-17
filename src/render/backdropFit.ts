import { CONFIG } from '../config';

// Where the backdrop image sits on screen, and where the arena sits inside it.
//
// Split out of backdrop.ts and deliberately free of any `require`: the
// simulation needs this geometry — the playfield is now defined by the painted
// floor — and world.ts must not pull a table of image imports into its module
// graph to get it. Same split, and the same reason, as shotSpawn.ts.
//
// ── Contain, not cover ─────────────────────────────────────────────────────
//
// The whole image is shown. Every pixel of it, always, on every device.
//
// It used to be covered — scaled up until it filled the display, with the
// overflow cropped — which is the standard answer and was the wrong one here.
// This art frames itself: stone walls down both sides, an arch at the top, a
// bank of foliage at the bottom. Covering a 2.17:1 phone with a 1.5:1 picture
// threw away 34% of its width, and what it threw away was exactly those walls.
// The frame is the part worth seeing, so the frame is what has to survive.
//
// The cost is bars. An image narrower in proportion than the screen cannot fill
// it without either stretching (never) or cropping (the thing we are undoing),
// so the leftover is painted flat. In practice the bars land where the HUD and
// the skill button already are — see the vertical bias below — so what is
// actually left over is much smaller than the arithmetic suggests.

export type BackdropId = 'arena';

/**
 * Intrinsic pixel size of each backdrop image.
 *
 * Stated rather than measured, because both renderers need the aspect BEFORE
 * the image has decoded — the Skia canvas computes its frame as a pure function
 * and has nowhere to wait — and now the SIMULATION needs it too, at
 * createWorld, long before any renderer exists. A layout that changed shape on
 * decode would move the arena out from under the player.
 *
 * Keep in step with the file. Wrong numbers here show up as art that is subtly
 * stretched and an arena that does not line up with the painted floor.
 */
export const BACKDROP_SIZE: Record<BackdropId, { w: number; h: number }> = {
  arena: { w: 768, h: 1344 },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Fit the whole image on screen, and choose where the leftover goes.
 *
 * Scale is the SMALLER of the two ratios, which is what makes it contain rather
 * than cover: whichever axis runs out first decides, and the other one is left
 * with slack.
 *
 * The slack is not simply centred. It is biased downward until the painted
 * floor clears the HUD stack, because the alternative is the top of the arena
 * sitting behind the health readout — which is exactly the complaint that moved
 * the exit out from behind the HUD several changes ago. Clamped so the image
 * can never be pushed past the bottom of the screen, which is what stops a
 * short device from trading one hidden edge for another.
 */
export function containRect(id: BackdropId, screenW: number, screenH: number): Rect {
  const src = BACKDROP_SIZE[id];
  const scale = Math.min(screenW / src.w, screenH / src.h);
  const w = src.w * scale;
  const h = src.h * scale;

  const slack = Math.max(0, screenH - h);
  const wanted = CONFIG.field.topChrome - CONFIG.field.floor.top * h;

  return {
    x: (screenW - w) / 2,
    y: Math.max(0, Math.min(slack, wanted)),
    w,
    h,
  };
}

/**
 * The playable floor inside a backdrop rect.
 *
 * The arena is no longer a rectangle of some chosen aspect dropped onto the
 * screen — it is the patch of ground the artist actually painted, named as
 * fractions of the image in CONFIG.field.floor. Two things fall out of that for
 * free, and both are worth more than the aspect number they replace:
 *
 *   The walls are where the arena ends, so the boundary the player runs into is
 *   the boundary they can see. Nothing else in the game had that.
 *
 *   The arena is the same SHAPE on every device without anyone choosing a
 *   number, because the image is mapped by one uniform scale. Only the size
 *   changes with the screen, exactly as before.
 */
export function arenaWithin(rect: Rect): Rect {
  const f = CONFIG.field.floor;
  return {
    x: rect.x + rect.w * f.left,
    y: rect.y + rect.h * f.top,
    w: rect.w * (f.right - f.left),
    h: rect.h * (f.bottom - f.top),
  };
}
