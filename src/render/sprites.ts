import type { ImageSourcePropType } from 'react-native';
import type { EnemyKind } from '../engine/types';
import type { Vec2 } from '../engine/vec';

// Every sprite in the game, and the only file that names one.
//
// Metro resolves `require` at bundle time, so the argument must be a literal
// string — you cannot build a path from a variable. That single constraint is
// why this file exists: without it, every screen that wants a portrait grows its
// own require, and "which sprite is the charger?" becomes a question you answer
// by grepping. Here it's a table.
//
// The images themselves are baked by tools/extract-art.js out of the raw Kenney
// "Top-down Shooter" pack (CC0). That script — not this one — is where the
// mapping back to the original tilesheet lives.

// ── Characters ─────────────────────────────────────────────────────────────
//
// Nine character sets, six poses each. Heroes wear them as drawn; enemies and
// bosses get recoloured copies under foe/ and boss/, so the same nine bodies
// carry the whole cast without any two sides looking alike.
export type CharSet =
  | 'hitman' | 'manBlue' | 'manBrown' | 'manOld' | 'robot'
  | 'soldier' | 'survivor' | 'womanGreen' | 'zombie';

// What the hands are doing. `stand` is empty-handed (menu portraits); the rest
// each hold a different silhouette of weapon, which is how the equipped gun
// reads at a glance without drawing a separate weapon sprite on top.
export type Pose = 'stand' | 'hold' | 'gun' | 'machine' | 'reload' | 'silencer';

const CHAR: Record<CharSet, Record<Pose, ImageSourcePropType>> = {
  hitman: {
    stand: require('../../assets/art/char/hitman-stand.png'),
    hold: require('../../assets/art/char/hitman-hold.png'),
    gun: require('../../assets/art/char/hitman-gun.png'),
    machine: require('../../assets/art/char/hitman-machine.png'),
    reload: require('../../assets/art/char/hitman-reload.png'),
    silencer: require('../../assets/art/char/hitman-silencer.png'),
  },
  manBlue: {
    stand: require('../../assets/art/char/manBlue-stand.png'),
    hold: require('../../assets/art/char/manBlue-hold.png'),
    gun: require('../../assets/art/char/manBlue-gun.png'),
    machine: require('../../assets/art/char/manBlue-machine.png'),
    reload: require('../../assets/art/char/manBlue-reload.png'),
    silencer: require('../../assets/art/char/manBlue-silencer.png'),
  },
  manBrown: {
    stand: require('../../assets/art/char/manBrown-stand.png'),
    hold: require('../../assets/art/char/manBrown-hold.png'),
    gun: require('../../assets/art/char/manBrown-gun.png'),
    machine: require('../../assets/art/char/manBrown-machine.png'),
    reload: require('../../assets/art/char/manBrown-reload.png'),
    silencer: require('../../assets/art/char/manBrown-silencer.png'),
  },
  manOld: {
    stand: require('../../assets/art/char/manOld-stand.png'),
    hold: require('../../assets/art/char/manOld-hold.png'),
    gun: require('../../assets/art/char/manOld-gun.png'),
    machine: require('../../assets/art/char/manOld-machine.png'),
    reload: require('../../assets/art/char/manOld-reload.png'),
    silencer: require('../../assets/art/char/manOld-silencer.png'),
  },
  robot: {
    stand: require('../../assets/art/char/robot-stand.png'),
    hold: require('../../assets/art/char/robot-hold.png'),
    gun: require('../../assets/art/char/robot-gun.png'),
    machine: require('../../assets/art/char/robot-machine.png'),
    reload: require('../../assets/art/char/robot-reload.png'),
    silencer: require('../../assets/art/char/robot-silencer.png'),
  },
  soldier: {
    stand: require('../../assets/art/char/soldier-stand.png'),
    hold: require('../../assets/art/char/soldier-hold.png'),
    gun: require('../../assets/art/char/soldier-gun.png'),
    machine: require('../../assets/art/char/soldier-machine.png'),
    reload: require('../../assets/art/char/soldier-reload.png'),
    silencer: require('../../assets/art/char/soldier-silencer.png'),
  },
  survivor: {
    stand: require('../../assets/art/char/survivor-stand.png'),
    hold: require('../../assets/art/char/survivor-hold.png'),
    gun: require('../../assets/art/char/survivor-gun.png'),
    machine: require('../../assets/art/char/survivor-machine.png'),
    reload: require('../../assets/art/char/survivor-reload.png'),
    silencer: require('../../assets/art/char/survivor-silencer.png'),
  },
  womanGreen: {
    stand: require('../../assets/art/char/womanGreen-stand.png'),
    hold: require('../../assets/art/char/womanGreen-hold.png'),
    gun: require('../../assets/art/char/womanGreen-gun.png'),
    machine: require('../../assets/art/char/womanGreen-machine.png'),
    reload: require('../../assets/art/char/womanGreen-reload.png'),
    silencer: require('../../assets/art/char/womanGreen-silencer.png'),
  },
  zombie: {
    stand: require('../../assets/art/char/zombie-stand.png'),
    hold: require('../../assets/art/char/zombie-hold.png'),
    gun: require('../../assets/art/char/zombie-gun.png'),
    machine: require('../../assets/art/char/zombie-machine.png'),
    reload: require('../../assets/art/char/zombie-reload.png'),
    silencer: require('../../assets/art/char/zombie-silencer.png'),
  },
};

// Both arguments arrive as plain strings from the simulation (see Player.set),
// so neither is trusted: a save written by a build with a hero that no longer
// exists must draw *something* rather than crash the canvas.
const FALLBACK_SET: CharSet = 'soldier';
const FALLBACK_POSE: Pose = 'stand';

// ── Two renderers, one name ───────────────────────────────────────────────
//
// React Native's <Image> wants a file per sprite; Skia wants one atlas it can
// draw sub-rects out of. Rather than let each renderer decide for itself which
// sprite a hero is wearing, every lookup resolves ONCE here and both the file
// and the atlas key come out of that single answer. The alternative is two
// copies of the fallback rules, which is two chances for the Skia canvas to
// disagree with the Views canvas about what the player looks like.
function resolveChar(set: string, pose: string): { set: CharSet; pose: Pose } {
  const s = set in CHAR ? (set as CharSet) : FALLBACK_SET;
  const p = pose in CHAR[s] ? (pose as Pose) : FALLBACK_POSE;
  return { set: s, pose: p };
}

export function charSprite(set: string, pose: string): ImageSourcePropType {
  const r = resolveChar(set, pose);
  return CHAR[r.set][r.pose];
}

export function charKey(set: string, pose: string): string {
  const r = resolveChar(set, pose);
  return `char/${r.set}-${r.pose}`;
}

/**
 * Rotation, in degrees, for a body drawn from directly overhead.
 *
 * Every character sprite is drawn facing east, so a body's heading IS its
 * rotation — and each is baked with its body on the canvas centre, which is what
 * lets a plain rotate spin the body on the spot rather than swinging it around
 * the end of its own gun. Shared by both renderers so the fact lives once.
 */
export function angleOf(facing: Vec2): number {
  return Math.atan2(facing.y, facing.x) * (180 / Math.PI);
}

// ── Sizing ─────────────────────────────────────────────────────────────────
//
// Every character sprite is baked onto one square canvas with its BODY centred,
// so the renderer can rotate about the sprite's own centre and have the body
// turn on the spot while the weapon swings around it. The canvas is mostly
// empty — a long silenced rifle needs the room — so the drawn size has to be
// derived from the body, not from the frame.
const CHAR_CANVAS = 80; // must match CANVAS in tools/extract-art.js
const CHAR_BODY = 34;   // shoulder-to-shoulder, in canvas pixels

/**
 * Side length to draw a character sprite at so its body matches a collision
 * radius. Slightly overdrawn: a sprite scaled to exactly the hitbox looks
 * smaller than the circle it replaced, because the body's shading falls off
 * before its edge.
 */
export function charSize(radius: number, k = 1.15): number {
  return radius * 2 * (CHAR_CANVAS / CHAR_BODY) * k;
}

// ── Enemies ────────────────────────────────────────────────────────────────
// Recoloured to the palette the game has taught since before it had art — red
// chaser, orange shooter, purple charger, pink bomber — so a player who learned
// the shapes does not have to relearn the cast.
const FOE: Record<EnemyKind, ImageSourcePropType> = {
  chaser: require('../../assets/art/foe/chaser.png'),
  shooter: require('../../assets/art/foe/shooter.png'),
  charger: require('../../assets/art/foe/charger.png'),
  bomber: require('../../assets/art/foe/bomber.png'),
};

// Takes a plain string, not EnemyKind: corpses carry the archetype as an id the
// same way Player.set does, and a save or a build that names one this table has
// never heard of must still draw something.
const FALLBACK_FOE: EnemyKind = 'chaser';

export function foeSprite(kind: string): ImageSourcePropType {
  return FOE[(kind in FOE ? kind : FALLBACK_FOE) as EnemyKind];
}

export function foeKey(kind: string): string {
  return `foe/${kind}`;
}

// ── Bosses ─────────────────────────────────────────────────────────────────
// One sprite per phase. The phase colour is real feedback — it is how a player
// knows the fight just sped up — so it is baked three times rather than tinted
// at runtime, where React Native's `tintColor` would flatten the whole body to
// a silhouette.
// Parallel to BOSS below, and to CONFIG.boss.variants beside it.
const BOSS_NAMES = ['warden', 'bombardier', 'juggernaut'];

const BOSS: ImageSourcePropType[][] = [
  [
    require('../../assets/art/boss/warden-0.png'),
    require('../../assets/art/boss/warden-1.png'),
    require('../../assets/art/boss/warden-2.png'),
  ],
  [
    require('../../assets/art/boss/bombardier-0.png'),
    require('../../assets/art/boss/bombardier-1.png'),
    require('../../assets/art/boss/bombardier-2.png'),
  ],
  [
    require('../../assets/art/boss/juggernaut-0.png'),
    require('../../assets/art/boss/juggernaut-1.png'),
    require('../../assets/art/boss/juggernaut-2.png'),
  ],
];

// Indices come from CONFIG.boss.variants and the phase table inside it, both of
// which are edited by hand — so both are wrapped rather than trusted.
function resolveBoss(variant: number, phase: number) {
  const v = ((variant % BOSS.length) + BOSS.length) % BOSS.length;
  return { v, p: Math.min(Math.max(phase, 0), BOSS[v].length - 1) };
}

export function bossSprite(variant: number, phase: number): ImageSourcePropType {
  const r = resolveBoss(variant, phase);
  return BOSS[r.v][r.p];
}

export function bossKey(variant: number, phase: number): string {
  const r = resolveBoss(variant, phase);
  return `boss/${BOSS_NAMES[r.v]}-${r.p}`;
}

// ── Weapons ────────────────────────────────────────────────────────────────
// Held weapons are part of the character pose; these are the loose sprites, for
// the loadout screen where there is no character to hold them.
export type WeaponIcon = 'pistol' | 'rifle' | 'silenced';

export const WEAPON_ICON: Record<WeaponIcon, ImageSourcePropType> = {
  pistol: require('../../assets/art/weapon/pistol.png'),
  rifle: require('../../assets/art/weapon/rifle.png'),
  silenced: require('../../assets/art/weapon/silenced.png'),
};

// ── Terrain ────────────────────────────────────────────────────────────────
// Repeating floors. Each one is verified to meet its own edges, because the
// arena tiles a single image across the whole room and a tile that doesn't
// wrap draws a grid over the entire floor.
export type FloorId =
  | 'grass' | 'dirt' | 'concrete' | 'terracotta'
  | 'brick-red' | 'brick-tan' | 'brick-brown' | 'snow' | 'asphalt'
  // Interior decking, from the pack's walled-room tileset. 'plate' is a quiet
  // studded deck; 'panel' is a grid of framed bays. Both are 64px, so the
  // pattern they draw lines up with the grid cover is placed on.
  | 'plate-rust' | 'plate-brass' | 'plate-steel'
  | 'panel-rust' | 'panel-brass' | 'panel-steel' | 'panel-concrete';

export const FLOOR: Record<FloorId, ImageSourcePropType> = {
  grass: require('../../assets/art/floor/grass.png'),
  dirt: require('../../assets/art/floor/dirt.png'),
  concrete: require('../../assets/art/floor/concrete.png'),
  terracotta: require('../../assets/art/floor/terracotta.png'),
  'brick-red': require('../../assets/art/floor/brick-red.png'),
  'brick-tan': require('../../assets/art/floor/brick-tan.png'),
  'brick-brown': require('../../assets/art/floor/brick-brown.png'),
  snow: require('../../assets/art/floor/snow.png'),
  asphalt: require('../../assets/art/floor/asphalt.png'),
  'plate-rust': require('../../assets/art/floor/plate-rust.png'),
  'plate-brass': require('../../assets/art/floor/plate-brass.png'),
  'plate-steel': require('../../assets/art/floor/plate-steel.png'),
  'panel-rust': require('../../assets/art/floor/panel-rust.png'),
  'panel-brass': require('../../assets/art/floor/panel-brass.png'),
  'panel-steel': require('../../assets/art/floor/panel-steel.png'),
  'panel-concrete': require('../../assets/art/floor/panel-concrete.png'),
};

// ── Wall materials ─────────────────────────────────────────────────────────
//
// What cover is BUILT from. A block textured with the room's own wall reads as
// part of the building; a flat-coloured one reads as furniture someone left in
// the middle of the floor, which is what the arena used to look like.
//
// Each material comes in two directions. The renderer picks by the block's own
// proportions: bands running the LONG way make a low block read as a length of
// wall, and bands running across it make it read as a stack of panels. One
// texture used both ways gives every piece of cover the same stripe direction
// regardless of shape, which is what makes a room look wallpapered.
export type WallId = 'rust' | 'brass' | 'steel';

export const WALL: Record<WallId, { along: ImageSourcePropType; across: ImageSourcePropType }> = {
  rust: {
    along: require('../../assets/art/wall/band-rust.png'),
    across: require('../../assets/art/wall/bandv-rust.png'),
  },
  brass: {
    along: require('../../assets/art/wall/band-brass.png'),
    across: require('../../assets/art/wall/bandv-brass.png'),
  },
  steel: {
    along: require('../../assets/art/wall/band-steel.png'),
    across: require('../../assets/art/wall/bandv-steel.png'),
  },
};

/** Atlas key for the same, for the Skia renderer. */
export function wallKey(id: WallId, along: boolean): string {
  return `wall/band${along ? '' : 'v'}-${id}`;
}

/** How many pixels one repeat of a floor texture covers. */
export const TILE_SIZE = 64;

// ── Props ──────────────────────────────────────────────────────────────────
//
// Things that sit ON TOP of cover. Cover keeps its solid, readable silhouette —
// you have to be able to tell in one glance where a shot can go — and the prop
// is what says whether the thing you are hiding behind is a crate or a boulder.
export type PropId =
  | 'crate' | 'crate-small' | 'crate-tilt' | 'crate-pale'
  | 'box-blue' | 'box-green' | 'barrel' | 'drum-orange' | 'drum-steel'
  | 'rock-a' | 'rock-b' | 'rock-c'
  | 'bush-green' | 'bush-orange' | 'bush-green-mid' | 'bush-orange-mid'
  | 'bush-green-small' | 'bush-orange-small' | 'plant';

export const PROP: Record<PropId, ImageSourcePropType> = {
  crate: require('../../assets/art/prop/crate.png'),
  'crate-small': require('../../assets/art/prop/crate-small.png'),
  'crate-tilt': require('../../assets/art/prop/crate-tilt.png'),
  'crate-pale': require('../../assets/art/prop/crate-pale.png'),
  'box-blue': require('../../assets/art/prop/box-blue.png'),
  'box-green': require('../../assets/art/prop/box-green.png'),
  barrel: require('../../assets/art/prop/barrel.png'),
  'drum-orange': require('../../assets/art/prop/drum-orange.png'),
  'drum-steel': require('../../assets/art/prop/drum-steel.png'),
  'rock-a': require('../../assets/art/prop/rock-a.png'),
  'rock-b': require('../../assets/art/prop/rock-b.png'),
  'rock-c': require('../../assets/art/prop/rock-c.png'),
  'bush-green': require('../../assets/art/prop/bush-green.png'),
  'bush-orange': require('../../assets/art/prop/bush-orange.png'),
  'bush-green-mid': require('../../assets/art/prop/bush-green-mid.png'),
  'bush-orange-mid': require('../../assets/art/prop/bush-orange-mid.png'),
  'bush-green-small': require('../../assets/art/prop/bush-green-small.png'),
  'bush-orange-small': require('../../assets/art/prop/bush-orange-small.png'),
  plant: require('../../assets/art/prop/plant.png'),
};

// ── Decals ─────────────────────────────────────────────────────────────────
//
// Litter for the bare floor. Strictly flat things: a boulder under the player's
// feet reads as a collision bug, an oil stain reads as a room somebody has used.
export type DecalId =
  | 'oil' | 'spill' | 'shards-a' | 'shards-b'
  | 'plank' | 'planks' | 'rubble' | 'scrap-a' | 'scrap-b' | 'leaves';

export const DECAL: Record<DecalId, ImageSourcePropType> = {
  oil: require('../../assets/art/decal/oil.png'),
  spill: require('../../assets/art/decal/spill.png'),
  'shards-a': require('../../assets/art/decal/shards-a.png'),
  'shards-b': require('../../assets/art/decal/shards-b.png'),
  plank: require('../../assets/art/decal/plank.png'),
  planks: require('../../assets/art/decal/planks.png'),
  rubble: require('../../assets/art/decal/rubble.png'),
  'scrap-a': require('../../assets/art/decal/scrap-a.png'),
  'scrap-b': require('../../assets/art/decal/scrap-b.png'),
  leaves: require('../../assets/art/decal/leaves.png'),
};

/**
 * Resolve a decor id written by the simulation.
 *
 * The world stores decor as plain string ids so `engine/` never has to know
 * that a renderer exists — the same trick `Pickup.gearId` already uses. That
 * makes an unknown id possible (a room laid out by an older build, a theme
 * edited between saves), so the lookup answers null rather than crashing: a
 * missing bush is a room that looks plainer, not a room that doesn't draw.
 */
export function decorSprite(id: string): ImageSourcePropType | null {
  return (PROP as Record<string, ImageSourcePropType>)[id]
    ?? (DECAL as Record<string, ImageSourcePropType>)[id]
    ?? null;
}

/** The same lookup, answering an atlas key. Null for the same reasons. */
export function decorKey(id: string): string | null {
  if (id in PROP) return `prop/${id}`;
  if (id in DECAL) return `decal/${id}`;
  return null;
}

export function floorKey(id: FloorId): string {
  return `floor/${id}`;
}
