// Type-only. A theme names sprites; it does not load them, and nothing that
// merely wants to read a theme should end up bundling 100 `require` calls.
import type { DecalId, FloorId, PropId, WallId } from './sprites';

// What a chapter looks like.
//
// Every visual the arena draws goes through here, so re-skinning a chapter is a
// change to this file and nothing else. The renderers read a theme and never
// name an image; sprites.ts owns the images and never decides where one goes.
//
// ── The world these describe ───────────────────────────────────────────────
//
// One building, three wings. Every arena is an interior: a deck plate floor with
// walls built out of the same material, lit from above, with the light falling
// off toward the edges of the room.
//
// That is a deliberate replacement for the first attempt, which was open ground
// — grass, then packed earth — with cover sitting on it. Open ground was the
// wrong idea twice over. It gave the arena nothing to be the inside OF, so every
// room read as a patch of field with furniture on it; and it forced cover to be
// a flat coloured slab, because there is no such thing as a wall in a meadow. A
// built interior fixes both at once: the floor says where you are, and cover is
// made of the room, so a block reads as a length of wall instead of a counter
// someone abandoned.
//
// ── Reading the fields ─────────────────────────────────────────────────────
// Floors are ids into sprites.FLOOR. Textures are TILED, never stretched: cover
// is authored at arbitrary sizes, so a single sprite scaled to fit would show
// different pixel density on a tall thin pillar than on a wide low block.
export interface ArenaTheme {
  /** Repeating floor for combat rooms — where most of a run is spent. */
  floor: FloorId;
  /** Boss rooms get their own ground, so the fight has a stage. */
  bossFloor: FloorId;
  /** Reward rooms: the breather. Warmer, and quieter than anything you fight on. */
  rewardFloor: FloorId;

  /**
   * How much black to lay over the floor, 0..1.
   *
   * The pack is authored bright, for games with bright UI. This one is dark, and
   * the arena has to stay quieter than the things moving on it — a floor that
   * competes with a projectile for attention is a floor that gets someone
   * killed. Dimming beats recolouring the source art: it keeps the texture's
   * detail and lets one tileset suit any palette. Per-theme because a panelled
   * floor carries far more contrast of its own than a studded deck does.
   */
  floorDim: number;

  /**
   * The floor tile's average colour once `floorDim` has been applied.
   *
   * Only for renderers that cannot tile an image — the Skia canvas paints its
   * whole frame from a pure function and has nowhere to hold a decoded texture
   * until the atlas finishes loading. Keep it in step with `floor` by eye; it is
   * a fallback, not a second opinion, and a room drawn in it should look like
   * the same room with the detail off.
   */
  floorColor: string;

  /**
   * Cover: what the room is built from.
   *
   * `material` is tiled across the block's top face, so a piece of cover is made
   * of the same wall as the room around it. `side` is the dark face left showing
   * at the bottom, and `edge` is the lit lip along the top — those two are what
   * give a flat rectangle height, and they are colours rather than textures
   * because they are a lighting effect, not a material.
   *
   * Cover is never drawn as a flat rectangle and never patterned beyond this. It
   * is a gameplay element, not scenery: you read it to decide where a shot can
   * go, and you read it while three things are moving. A block lit from one
   * direction resolves in a glance.
   */
  cover: { material: WallId; dim: number; side: string; edge: string };

  /**
   * What sits on top of cover. Picked from per block, so a room of identical
   * blocks becomes a room of crates, or drums, or shipping boxes — without the
   * silhouette the player actually aims around changing at all.
   */
  props: PropId[];

  /** Flat litter for the bare floor. Only things you could walk over. */
  decals: DecalId[];

}

// App chrome, and the frame behind the arena. Deliberately NOT per-chapter: it
// is the app's shell, not the room's, and a menu background that changes colour
// with the chapter reads as a bug.
export const SHELL_COLOR = '#0e1015';

/** Flat colour under the floor texture, for the frame it never quite reaches. */
export const FLOOR_BACKSTOP = '#15171c';

/**
 * How far the light falls off at the walls, and how dark it gets there.
 *
 * OFF — `alpha: 0`, which makes the renderers skip it entirely.
 *
 * It existed because the arena used to be a rectangle cropped out of an
 * infinite tiled floor, and darkening the last few dozen pixels was what made
 * it read as an enclosed room. Neither half of that is true any more: the arena
 * is a letterboxed field inside a painted courtyard, and the backdrop draws its
 * own walls. All the falloff added was a second hard-edged rectangle inside the
 * first, which is what it looked like on a device.
 *
 * Kept as a knob rather than deleted — the loops break immediately at 0, so it
 * costs nothing, and a tiled-floor chapter would want it back.
 */
export const EDGE_FALLOFF = { bands: 5, step: 7, start: 6, alpha: 0, fade: 0.03 };

export const THEMES: ArenaTheme[] = [
  // Chapter 1 — The Foundry. Rust and hot metal.
  {
    floor: 'plate-rust',
    bossFloor: 'panel-rust',
    rewardFloor: 'plate-brass',
    floorDim: 0.42,
    floorColor: '#352e29',
    cover: { material: 'rust', dim: 0.16, side: '#241a12', edge: '#c07434' },
    props: [
      'crate', 'crate-small', 'crate-tilt', 'barrel',
      'drum-orange', 'box-blue', 'rock-a',
    ],
    decals: ['oil', 'spill', 'scrap-a', 'scrap-b', 'rubble'],
  },

  // Chapter 2 — The Warrens. Older, warmer, timber and brass.
  {
    // Panelled rather than studded like the Foundry, so the middle chapter is a
    // different room and not the first one in a different colour. Deck plate is
    // saved for its boss floor, which is then the one place in the wing that
    // looks like where you came from.
    floor: 'panel-brass',
    bossFloor: 'plate-brass',
    rewardFloor: 'brick-tan',
    floorDim: 0.5,
    floorColor: '#4f3923',
    cover: { material: 'brass', dim: 0.16, side: '#251c14', edge: '#c19a63' },
    props: [
      'crate', 'crate-pale', 'crate-tilt', 'box-green',
      'barrel', 'crate-small', 'plant',
    ],
    decals: ['plank', 'planks', 'rubble', 'scrap-a', 'leaves'],
  },

  // Chapter 3 — Cold Storage. Steel bays, and nothing warm anywhere in it.
  {
    floor: 'panel-steel',
    bossFloor: 'plate-steel',
    rewardFloor: 'panel-concrete',
    floorDim: 0.5,
    floorColor: '#404c4d',
    cover: { material: 'steel', dim: 0.18, side: '#1b2124', edge: '#93a9ad' },
    props: [
      'box-blue', 'box-green', 'crate-pale', 'drum-steel',
      'crate-small', 'rock-c',
    ],
    decals: ['shards-a', 'shards-b', 'oil', 'scrap-a', 'scrap-b'],
  },
];

// Endless replays the deepest chapter, and a hand-edited chapter table is the
// kind of thing that grows an entry before this one does — so wrap rather than
// index, the same way every other chapter lookup in the codebase does.
export function themeFor(chapter: number): ArenaTheme {
  return THEMES[chapter % THEMES.length];
}

/** The ground for one room, given which kind of room it is. */
export function floorFor(theme: ArenaTheme, roomType: 'combat' | 'boss' | 'reward'): FloorId {
  if (roomType === 'boss') return theme.bossFloor;
  if (roomType === 'reward') return theme.rewardFloor;
  return theme.floor;
}
