import { CONFIG } from '../config';
import { Decor, Obstacle, RoomType } from '../engine/types';
// The one place a system reads the renderer, and deliberately so: WHICH props a
// chapter is dressed in is art direction and belongs beside the floor and the
// cover palette, while WHERE they go depends on the cover layout, which only the
// simulation knows. theme.ts holds no images — sprites.ts does — so this costs
// nothing at bundle time.
import { themeFor } from '../render/theme';
import { blocked } from './obstacles';

// Scenery. Nothing here collides, nothing here is read by a single gameplay
// system, and the whole module could be deleted without changing one number.
//
// It exists because an arena of flat colour and grey rectangles reads as a
// prototype no matter how good the fight in it is. Cover keeps its solid,
// readable silhouette — you have to be able to tell in a glance where a shot can
// go — and these are what make the block you are hiding behind a stack of
// crates, or a boulder, or a pallet of shipping boxes.
//
// Two kinds, drawn in two different layers:
//   flat  — litter that lies ON the floor: oil, glass, leaves. Under everything.
//   prop  — objects that sit ON a piece of cover. Over the block, under the cast.
// A boulder drawn flat on the ground that the player then walks straight through
// reads as a collision bug, which is why the split is a field and not a guess.

// Deterministic noise, seeded per room.
//
// A room is dressed on load AND again on every resize, because cover is authored
// as fractions of the arena and has to be rebuilt rather than stretched. If the
// scatter were random, rotating the phone would shuffle every crate in the room
// while the player watched. Seeding on (chapter, room) makes a room look like
// itself for as long as you are standing in it.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How many props a block gets, and how big. The short side sets the scale, so a
// long low wall gets a row of crates rather than one stretched one.
//
// The fill is high on purpose. Cover is now authored as many crate-sized blocks
// rather than a few slabs, and at a lower fill each one got a small prop
// floating in the middle of a bare rectangle — the block read as a plinth with
// an ornament on it. Filling the face means the block IS the crate.
const PROP_FILL = 0.94;
const PROP_MIN = 20;
const PROP_MAX = 56;

// Litter is sparse on purpose: it is texture, not content, and a floor covered
// in debris is a floor you cannot read a projectile against.
const DECALS_PER_ROOM = 5;
const DECAL_MIN = 30;
const DECAL_MAX = 58;

export function buildDecor(
  w: number,
  h: number,
  obstacles: Obstacle[],
  chapter: number,
  roomIndex: number,
  roomType: RoomType
): Decor[] {
  const theme = themeFor(chapter);
  const rand = seeded(chapter * 7919 + roomIndex * 104729 + 17);
  const out: Decor[] = [];

  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length) % list.length];

  // ── Litter on the bare floor ──
  // Placed before the props so the same seed always produces the same litter for
  // a room whatever its cover turned out to be.
  for (let i = 0; i < DECALS_PER_ROOM; i++) {
    const size = DECAL_MIN + rand() * (DECAL_MAX - DECAL_MIN);
    const x = size / 2 + rand() * (w - size);
    // Kept below the HUD stack. The top ~160px of the arena is chrome — health,
    // boss bar, the exit door — and litter drawn up there reads as UI noise.
    const top = CONFIG.door.marginTop + 40;
    const y = top + rand() * (h - top - size / 2);

    // A decal entirely underneath a block is invisible; one that pokes out from
    // under it looks deliberate. Testing the centre gets both for free.
    if (blocked(x, y, 4, obstacles)) continue;

    out.push({ id: pick(theme.decals), pos: { x, y }, size, rot: rand() * 360, flat: true });
  }

  // Reward rooms are the breather — three offers on a clean floor. Cluttering
  // the one room whose entire job is "read these three things and choose" is how
  // a decoration budget starts costing the player a decision.
  if (roomType === 'reward') return out;

  // ── Objects on top of cover ──
  const lift = CONFIG.obstacles.blockHeight;
  for (const o of obstacles) {
    const short = Math.min(o.w, o.h);
    const size = Math.max(PROP_MIN, Math.min(PROP_MAX, short * PROP_FILL));
    const cols = Math.max(1, Math.floor(o.w / size));
    const rows = Math.max(1, Math.floor(o.h / size));

    // Cells span the block exactly, so props sit centred on the face however
    // the layout table sized it rather than trailing off one end.
    const cw = o.w / cols;
    const ch = o.h / rows;

    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const jx = (rand() - 0.5) * (cw - size) * 0.6;
        const jy = (rand() - 0.5) * (ch - size) * 0.6;
        out.push({
          id: pick(theme.props),
          pos: {
            x: o.pos.x - o.w / 2 + (cx + 0.5) * cw + jx,
            // The top face is the one the camera looks down at, and it is drawn
            // lifted by blockHeight. Anything standing on the block has to be
            // lifted with it or it looks embedded in the block's front.
            y: o.pos.y - o.h / 2 + (cy + 0.5) * ch + jy - lift,
          },
          size,
          // Small angles only. A crate rotated 40 degrees stops reading as part
          // of a stack and starts reading as one that fell off.
          rot: (rand() - 0.5) * 24,
          flat: false,
        });
      }
    }
  }

  return out;
}
