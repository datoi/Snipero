#!/usr/bin/env node
//
// Turns the raw Kenney "Top-down Shooter" pack into the sprites the game ships.
//
// Run:  node tools/extract-art.js
// In:   assets/kenney_top-down-shooter/   (gitignored — re-download from
//                                          https://kenney.nl/assets, CC0)
// Out:  assets/art/                       (committed)
//
// This script exists so the mapping is a FACT rather than a memory. The raw pack
// is 600 files of which the game uses ~90, and "which tile was the crate?" is
// exactly the question nobody can answer six months later by looking at
// crate.png. Every crop below is addressed by its tilesheet grid cell, so the
// answer is in the source.
//
// Three transforms happen here, and each one is here rather than at runtime for
// a reason:
//
//   PAD    Character poses are ragged frames — a pistol pose is 49px wide and a
//          silencer pose 54px, both anchored at the body's left edge. Rotating
//          those about their frame centre swings the body around the gun. Every
//          pose is re-centred on its BODY here, onto one square canvas, so the
//          renderer can rotate about the sprite centre and be right.
//
//   TINT   Enemies and bosses reuse the same nine character sets the heroes do,
//          recoloured to the palette the game already teaches (red chaser,
//          orange shooter, purple charger, pink bomber). Doing it at bake time
//          keeps the shading; React Native's `tintColor` would flatten each
//          sprite to a solid silhouette, which is what the hit-flash wants and
//          the body never does.
//
//   SCALE  The three weapon icons are 19x10 sprites meant to be held, not shown.
//          Nearest-neighbour x4 keeps the hard pixel edges the pack is drawn in.
//
const fs = require('fs');
const path = require('path');
const { decode, encode, crop, blit, blank, scale } = require('./png');

const PACK = path.join(__dirname, '..', 'assets', 'kenney_top-down-shooter');
const OUT = path.join(__dirname, '..', 'assets', 'art');

if (!fs.existsSync(PACK)) {
  console.error(`Raw pack not found at ${PACK}\nDownload "Top-down Shooter" from https://kenney.nl/assets and unzip it there.`);
  process.exit(1);
}

const TILE = 64; // the tilesheet's grid; every terrain/prop crop is a multiple
const sheet = decode(path.join(PACK, 'Tilesheet', 'tilesheet_complete.png'));

// Every sprite is written twice: once as its own PNG, and once into a shared
// atlas at the end. The two renderers want opposite things — React Native's
// <Image> takes one file per sprite and cannot slice, while Skia wants a single
// texture it can draw sub-rects out of — and generating both from one pass is
// what stops them from ever disagreeing about what a sprite is.
const written = new Map();

function write(rel, img) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  encode(img, file);
  written.set(rel.replace(/\.png$/, ''), img);
  count++;
}
let count = 0;

// Cut `cols x rows` grid cells starting at (col,row) of the tilesheet.
const cell = (col, row, cols = 1, rows = 1) =>
  crop(sheet, col * TILE, row * TILE, cols * TILE, rows * TILE);

// ── Terrain ───────────────────────────────────────────────────────────────
//
// Only tiles that repeat against themselves without a visible seam are here:
// the arena tiles one image across the whole floor, so a tile whose right edge
// doesn't meet its own left edge draws a grid over the entire room.
const TERRAIN = {
  'floor/grass.png': [0, 0],       // green with tufts
  'floor/dirt.png': [4, 0],        // packed earth
  'floor/concrete.png': [2, 10],   // pale speckled slabs, seam every tile
  'floor/terracotta.png': [12, 0], // orange checker
  'floor/brick-red.png': [14, 2],  // scorched brick
  'floor/brick-tan.png': [14, 3],  // warm brick
  'floor/brick-brown.png': [14, 1],
  'floor/snow.png': [11, 0],
  // Painted lane markings on dark tarmac. The pack's genuinely flat greys are
  // seamless and useless: a floor with no texture at all stops reading as ground
  // and starts reading as a hole the arena is drawn on top of.
  'floor/asphalt.png': [7, 1],

  // ── Interior ──
  //
  // The pack's largest section is a walled-room tileset — dark deck plate with
  // coloured trim, meant to be autotiled into buildings. Most of it only makes
  // sense as an edge piece, but a handful of cells are complete patterns that
  // meet their own edges, and those are floors of a kind the outdoor tiles
  // cannot be: they read as somewhere BUILT rather than somewhere open.
  //
  // Plate is the quiet one (studs on a dark deck); panel is the loud one (a grid
  // of framed bays). Both tile at 64, so the grid they draw lines up with the
  // grid everything else in the arena is placed on.
  'floor/plate-rust.png': [7, 6],
  'floor/plate-brass.png': [16, 6],
  'floor/plate-steel.png': [16, 12],
  'floor/panel-rust.png': [6, 7],
  'floor/panel-brass.png': [15, 7],
  'floor/panel-steel.png': [15, 13],
  'floor/panel-concrete.png': [6, 13],
};

// ── Wall materials ────────────────────────────────────────────────────────
//
// Banded plate, from the same room tileset. These go on COVER: a block textured
// with the wall the room is built from reads as part of the building, where a
// flat-coloured one reads as a counter someone left in the middle of the floor.
//
// Horizontal and vertical bands are both kept, and the renderer picks by the
// block's own proportions — bands running the long way make a low wall look like
// a wall, and bands running across it make it look like a stack of crates.
const WALLS = {
  'wall/band-rust.png': [2, 4],
  'wall/band-brass.png': [11, 4],
  'wall/band-steel.png': [11, 10],
  'wall/bandv-rust.png': [2, 5],
  'wall/bandv-brass.png': [11, 5],
  'wall/bandv-steel.png': [11, 11],
};
for (const [name, [c, r]] of Object.entries(WALLS)) write(name, cell(c, r));
for (const [name, [c, r]] of Object.entries(TERRAIN)) write(name, cell(c, r));

// ── Props ─────────────────────────────────────────────────────────────────
// Things that sit ON cover: the block underneath keeps its readable silhouette
// and these say what it's made of.
const PROPS = {
  'prop/crate.png': [20, 4],
  'prop/crate-small.png': [21, 4],
  'prop/crate-tilt.png': [20, 5],
  'prop/crate-pale.png': [24, 4],
  'prop/box-blue.png': [22, 4],
  'prop/box-green.png': [22, 5],
  'prop/barrel.png': [23, 4],
  'prop/drum-orange.png': [18, 11],
  'prop/drum-steel.png': [19, 11],
  'prop/rock-a.png': [20, 8],
  'prop/rock-b.png': [21, 8],
  'prop/rock-c.png': [22, 8],
  'prop/bush-green-small.png': [18, 8],
  'prop/bush-orange-small.png': [19, 8],
  'prop/bush-green-mid.png': [20, 6],
  'prop/bush-orange-mid.png': [23, 6],
  'prop/plant.png': [25, 4],
};
for (const [name, [c, r]] of Object.entries(PROPS)) write(name, cell(c, r));

// The two big bushes are authored across four cells each.
write('prop/bush-green.png', cell(18, 6, 2, 2));
write('prop/bush-orange.png', cell(21, 6, 2, 2));

// ── Decals ────────────────────────────────────────────────────────────────
// Flat litter for the floor itself. Strictly things you would walk over — a
// rock lying under the player's feet reads as a bug, an oil stain does not.
const DECALS = {
  'decal/oil.png': [22, 11],
  'decal/spill.png': [21, 11],
  'decal/shards-a.png': [18, 9],
  'decal/shards-b.png': [20, 9],
  'decal/plank.png': [21, 9],
  'decal/planks.png': [22, 9],
  'decal/rubble.png': [21, 10],
  'decal/scrap-a.png': [18, 10],
  'decal/scrap-b.png': [19, 10],
  'decal/leaves.png': [23, 7],
};
for (const [name, [c, r]] of Object.entries(DECALS)) write(name, cell(c, r));

// ── Weapons ───────────────────────────────────────────────────────────────
for (const [name, file] of Object.entries({
  'weapon/pistol.png': 'weapon_gun.png',
  'weapon/rifle.png': 'weapon_machine.png',
  'weapon/silenced.png': 'weapon_silencer.png',
})) {
  write(name, scale(decode(path.join(PACK, 'PNG', file)), 4));
}

// ── Characters ────────────────────────────────────────────────────────────
//
// Nine sets, six poses each. Kenney's frames are all anchored at the body's
// left edge and grow rightward as the weapon gets longer, so the body sits at
// the same place in every pose of a set — which is what makes re-centring on
// the `stand` pose's width correct for all six.
const SETS = {
  hitman: 'Hitman 1/hitman1',
  manBlue: 'Man Blue/manBlue',
  manBrown: 'Man Brown/manBrown',
  manOld: 'Man Old/manOld',
  robot: 'Robot 1/robot1',
  soldier: 'Soldier 1/soldier1',
  survivor: 'Survivor 1/survivor1',
  womanGreen: 'Woman Green/womanGreen',
  zombie: 'Zombie 1/zoimbie1', // the pack really does misspell it
};
const POSES = ['stand', 'hold', 'gun', 'machine', 'reload', 'silencer'];

// One square canvas for every character sprite in the game, so the renderer has
// a single number to scale against. 80 is the smallest power-of-8 that fits the
// widest pose (a 57px silencer frame) once the body is centred.
const CANVAS = 80;

function pose(set, name) {
  return decode(path.join(PACK, 'PNG', `${SETS[set]}_${name}.png`));
}

// Re-centre a pose on the body and pad it to CANVAS x CANVAS.
function centred(set, name, bodyW) {
  const img = pose(set, name);
  const x = Math.round(CANVAS / 2 - bodyW / 2);
  const y = Math.round(CANVAS / 2 - img.h / 2);
  if (x < 0 || y < 0 || x + img.w > CANVAS || y + img.h > CANVAS) {
    throw new Error(`${set}_${name} (${img.w}x${img.h}) does not fit a ${CANVAS}px canvas`);
  }
  const out = blank(CANVAS, CANVAS);
  blit(out, img, x, y);
  return out;
}

const bodyWidth = {};
for (const set of Object.keys(SETS)) bodyWidth[set] = pose(set, 'stand').w;

for (const set of Object.keys(SETS)) {
  for (const name of POSES) {
    write(`char/${set}-${name}.png`, centred(set, name, bodyWidth[set]));
  }
}

// ── Recolours ─────────────────────────────────────────────────────────────
//
// Map luminance onto a hue: shadows keep their darkness, midtones become the
// tint exactly, highlights ride toward white. A flat multiply would drag the
// black outline to the tint and lose the silhouette; a flat replace would lose
// the shading. MID is where the pack's body colours actually sit.
//
// LIFT is how far a highlight is allowed to travel toward white, and it is the
// number that decides whether a recoloured body reads as a CHARACTER or as a
// blob. At 0.8 the hitman's pale face — the brightest region on the sprite, and
// a big one — went almost to cream, so the orange shooter arrived on screen as
// a brown smudge with a beige circle on it. Kenney's art is flat-shaded with a
// small tonal range, so it needs very little lift to keep its form; almost all
// of the "shading" a viewer perceives is the black outline, which lives at the
// other end of the curve entirely.
const MID = 0.6;
const LIFT = 0.4;

function tint(img, hex) {
  const tr = parseInt(hex.slice(1, 3), 16);
  const tg = parseInt(hex.slice(3, 5), 16);
  const tb = parseInt(hex.slice(5, 7), 16);
  const out = { w: img.w, h: img.h, data: Buffer.from(img.data) };
  for (let i = 0; i < img.w * img.h; i++) {
    if (out.data[i * 4 + 3] === 0) continue;
    const l =
      (0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) / 255;
    const shade = (t) =>
      l <= MID
        ? t * (l / MID)
        : t + (255 - t) * ((l - MID) / (1 - MID)) * LIFT;
    out.data[i * 4] = Math.round(shade(tr));
    out.data[i * 4 + 1] = Math.round(shade(tg));
    out.data[i * 4 + 2] = Math.round(shade(tb));
  }
  return out;
}

// Enemies. Colour comes from CONFIG.enemies[kind].color — the palette the game
// has been teaching since before it had art, and the one the damage numbers and
// the HUD still speak. The pose is the tell: arms out = walks at you, weapon up
// = shoots you, both hands full = about to be a problem.
const FOES = {
  chaser: ['zombie', 'hold', '#e5484d'],
  shooter: ['hitman', 'gun', '#f2a20c'],
  charger: ['robot', 'machine', '#b05cf0'],
  bomber: ['survivor', 'reload', '#ff5cae'],
};
for (const [name, [set, p, hex]] of Object.entries(FOES)) {
  write(`foe/${name}.png`, tint(centred(set, p, bodyWidth[set]), hex));
}

// Bosses. One sprite per phase, because the phase colour is real feedback —
// it's how the player knows the fight just got faster — and baking it beats
// tinting at runtime for the same reason the foes are baked.
const BOSSES = {
  warden: ['soldier', 'machine', ['#c0392b', '#e04836', '#ff5a3c']],
  bombardier: ['manBrown', 'silencer', ['#2f6f4f', '#39916a', '#4ecf94']],
  juggernaut: ['robot', 'gun', ['#4a3f8f', '#6a52c9', '#8a6bff']],
};
for (const [name, [set, p, phases]] of Object.entries(BOSSES)) {
  const base = centred(set, p, bodyWidth[set]);
  phases.forEach((hex, i) => write(`boss/${name}-${i}.png`, tint(base, hex)));
}

// ── Atlas ─────────────────────────────────────────────────────────────────
//
// One texture holding every sprite, plus a generated frame table. Skia records
// the whole frame into a single SkPicture, and every texture swap inside that is
// a state change it cannot batch away — so 108 images means 108 of them per
// frame, where one atlas means none.
//
// Shelf packing: sort by height, fill a row left to right, start a new row when
// the width runs out. Crude, and completely adequate — these are ~100 sprites of
// four distinct sizes, which is the case shelf packing is nearly optimal for.
const ATLAS_W = 1024;
const PAD = 2; // transparent gutter, so filtered sampling can't pull in a neighbour

function packAtlas() {
  const items = [...written.entries()]
    .map(([name, img]) => ({ name, img }))
    .sort((a, b) => b.img.h - a.img.h || a.name.localeCompare(b.name));

  const frames = {};
  let x = PAD, y = PAD, shelf = 0;
  for (const it of items) {
    if (x + it.img.w + PAD > ATLAS_W) {
      x = PAD;
      y += shelf + PAD;
      shelf = 0;
    }
    frames[it.name] = { x, y, w: it.img.w, h: it.img.h };
    x += it.img.w + PAD;
    shelf = Math.max(shelf, it.img.h);
  }
  const height = y + shelf + PAD;

  const sheet = blank(ATLAS_W, height);
  for (const it of items) {
    const f = frames[it.name];
    blit(sheet, it.img, f.x, f.y);
  }
  encode(sheet, path.join(OUT, 'atlas.png'));
  return { frames, height };
}

const { frames, height } = packAtlas();

// The frame table, as source. Generated rather than hand-maintained because it
// is derived data: the packer decides where a sprite lands, so a human editing
// these numbers is a human introducing a bug the type system cannot see.
const table = Object.keys(frames)
  .sort()
  .map((k) => `  '${k}': { x: ${frames[k].x}, y: ${frames[k].y}, w: ${frames[k].w}, h: ${frames[k].h} },`)
  .join('\n');

fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'render', 'atlas.gen.ts'),
  `// GENERATED by tools/extract-art.js — do not edit.
//
// Where each sprite sits inside assets/art/atlas.png. Keys are the sprite's path
// under assets/art/ without the extension, which is the same name the per-file
// renderer uses, so the two can never drift apart.
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ATLAS_SIZE = { w: ${ATLAS_W}, h: ${height} };

export const FRAMES: Record<string, Frame> = {
${table}
};
`
);

console.log(
  `wrote ${count} files + atlas ${ATLAS_W}x${height} to assets/art/  (character canvas ${CANVAS}px)`
);
