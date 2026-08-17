import {
  BlendMode,
  ClipOp,
  PaintStyle,
  Skia,
  matchFont,
  type SkCanvas,
  type SkColor,
  type SkFont,
  type SkImage,
  type SkPaint,
} from '@shopify/react-native-skia';

import { CONFIG } from '../config';
import { Status, World } from '../engine/types';
import { Vec2 } from '../engine/vec';
import { bossPhases } from '../systems/boss';
import { shrineColor } from '../systems/shrine';
import { FRAMES } from './atlas.gen';
import {
  angleOf, bossKey, charKey, charSize, decorKey, floorKey, foeKey, wallKey, TILE_SIZE,
} from './sprites';
import { EDGE_FALLOFF, floorFor, themeFor } from './theme';
import { backdropFor, backdropLayout, backdropScroll } from './backdrop';
import { gateLayout, glowAlpha } from './gate';
import { bodyAnim } from './anim';

// Outline color for a body carrying a debuff — burn reads over slow, since it's
// the one actively killing. Returns null when the body is clean.
// Kept in sync with the same function in GameCanvas.tsx.
function statusTint(s: Status): string | null {
  if (s.burnTime > 0) return '#ff7a3c';
  if (s.slowTime > 0) return '#7dd3fc';
  return null;
}

// Immediate-mode Skia painting of the whole world. Pure: it reads world state
// and issues draw calls, and touches nothing else — the simulation stays
// completely unaware that a renderer exists.
//
// Everything here is written to avoid per-frame allocation. At a busy moment
// this runs a few hundred draw calls 60x/sec, so an object allocated per call
// is an object allocated ~20,000 times a second.

// ── Cached native resources ──
// SkPaint is a native object. Skia copies paint state into the display list at
// record time, so one mutable paint can be re-tinted between draws instead of
// allocating a fresh one per shape.
const fillPaint = Skia.Paint();
fillPaint.setAntiAlias(true);

const strokePaint = Skia.Paint();
strokePaint.setAntiAlias(true);
strokePaint.setStyle(PaintStyle.Stroke);

// The palette is a small fixed set of hex strings. Skia.Color parses the string
// every call, so the results are interned once and reused forever.
const colorCache = new Map<string, SkColor>();
function color(hex: string): SkColor {
  let c = colorCache.get(hex);
  if (c === undefined) {
    c = Skia.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

// Damage numbers scale with hit size, spanning roughly 15..26pt. One font per
// integer size (a dozen at most) is cheaper than mutating a shared font, and
// avoids any question of whether a recorded draw op captured the size in time.
const fontCache = new Map<number, SkFont>();
function font(size: number): SkFont {
  const key = Math.round(size);
  let f = fontCache.get(key);
  if (f === undefined) {
    f = matchFont({ fontSize: key, fontWeight: '800' });
    fontCache.set(key, f);
  }
  return f;
}

// setColor resets alpha to the color's own, so alpha is always applied after.
function fill(hex: string, alpha = 1) {
  fillPaint.setColor(color(hex));
  if (alpha < 1) fillPaint.setAlphaf(alpha);
}

function stroke(hex: string, width: number, alpha = 1) {
  strokePaint.setColor(color(hex));
  if (alpha < 1) strokePaint.setAlphaf(alpha);
  strokePaint.setStrokeWidth(width);
}

// SkRect/SkRRect are plain interfaces in RN Skia, so these literals cost a
// short-lived JS object and never cross into native allocation.
function rect(canvas: SkCanvas, x: number, y: number, w: number, h: number) {
  canvas.drawRect({ x, y, width: w, height: h }, fillPaint);
}

function roundRect(canvas: SkCanvas, x: number, y: number, w: number, h: number, r: number) {
  canvas.drawRRect({ rect: { x, y, width: w, height: h }, rx: r, ry: r }, fillPaint);
}

function strokeRoundRect(
  canvas: SkCanvas, x: number, y: number, w: number, h: number, r: number
) {
  canvas.drawRRect({ rect: { x, y, width: w, height: h }, rx: r, ry: r }, strokePaint);
}

// ── Sprites ────────────────────────────────────────────────────────────────
//
// Every sprite lives in one atlas texture (assets/art/atlas.png) and is drawn as
// a sub-rect of it. One texture rather than 108 files because this whole
// function is recorded into a single SkPicture, and every texture swap inside
// that recording is a batch Skia cannot merge — so the file-per-sprite shape
// that suits React Native's <Image> is the worst possible shape here.
//
// `atlas` is null until the image finishes decoding, which is a handful of real
// frames at startup. Everything below therefore has a flat-primitive fallback:
// the arena is playable and readable from frame one and simply gains its art a
// moment later, rather than showing an empty canvas.
const spritePaint = Skia.Paint();
spritePaint.setAntiAlias(true);

// Painting the whole silhouette one flat colour is what a hit flash is, and a
// blend-mode colour filter is how Skia says it. Filters are native objects, so
// the small fixed set of colours the game flashes is built once and kept.
const tintCache = new Map<string, SkPaint>();
function tinted(hex: string): SkPaint {
  let p = tintCache.get(hex);
  if (p === undefined) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColorFilter(Skia.ColorFilter.MakeBlend(color(hex), BlendMode.SrcIn));
    tintCache.set(hex, p);
  }
  return p;
}

/** Draw an atlas sprite into a square centred on (cx, cy). Returns false if the
 *  atlas isn't ready or the key is unknown, so callers can fall back. */
function sprite(
  canvas: SkCanvas,
  atlas: SkImage | null,
  key: string | null,
  cx: number,
  cy: number,
  size: number,
  opts?: { facing?: Vec2; flash?: string; rotate?: number; alpha?: number },
): boolean {
  if (!atlas || !key) return false;
  const f = FRAMES[key];
  if (!f) return false;

  const paint = opts?.flash ? tinted(opts.flash) : spritePaint;
  paint.setAlphaf(opts?.alpha ?? 1);

  // A heading is shorthand for "this is an overhead sprite, turn it"; decor
  // passes a fixed `rotate` instead.
  const deg = opts?.facing ? angleOf(opts.facing) : opts?.rotate ?? 0;

  const half = size / 2;
  if (deg !== 0) {
    canvas.save();
    canvas.translate(cx, cy);
    canvas.rotate(deg, 0, 0);
    canvas.drawImageRect(
      atlas,
      { x: f.x, y: f.y, width: f.w, height: f.h },
      { x: -half, y: -half, width: size, height: size },
      paint,
    );
    canvas.restore();
  } else {
    canvas.drawImageRect(
      atlas,
      { x: f.x, y: f.y, width: f.w, height: f.h },
      { x: cx - half, y: cy - half, width: size, height: size },
      paint,
    );
  }
  return true;
}

export function drawScene(
  canvas: SkCanvas,
  world: World,
  width: number,
  height: number,
  atlas: SkImage | null = null,
  backdrop: SkImage | null = null,
) {
  const {
    player, enemies, projectiles, enemyProjectiles, obstacles, decor, pickups, fx,
  } = world;
  const pr = CONFIG.pickups.radius;
  const theme = themeFor(world.chapter);

  // Camera layer — screen shake translates the world, so the damage flash below
  // stays pinned to the screen and never exposes an edge.
  canvas.save();
  canvas.translate(fx.shakeX, fx.shakeY);

  // ── Floor ──
  //
  // The theme's measured average colour goes down first, then the real tile over
  // it. That ordering is not belt-and-braces: the flat colour is what the arena
  // looks like for the few frames before the atlas finishes decoding, and it is
  // also what covers the ragged last row and column where the tile grid runs off
  // the edge of a screen whose size is not a multiple of 64.
  //
  // Tiled with a loop rather than a repeating image shader because the tile is a
  // sub-rect of the atlas, and an image shader repeats the whole texture. ~100
  // rect draws on one already-bound texture is nothing next to a texture swap.
  fill(theme.floorColor);
  rect(canvas, 0, 0, width, height);

  // The painted backdrop takes the ground when it has decoded, and the tiled
  // floor below is what the arena falls back to until then — which is the same
  // contract the flat colour above already has, one layer further up. Drawing
  // both would be the tile grid rendered purely to be covered.
  const bd = backdropFor(world.chapter);
  const painted = bd !== null && backdrop !== null;

  if (bd !== null && backdrop !== null) {
    const src = { x: 0, y: 0, width: backdrop.width(), height: backdrop.height() };
    spritePaint.setAlphaf(1);
    for (const r of backdropLayout(bd, width, height, backdropScroll(world.time))) {
      canvas.drawImageRect(
        backdrop,
        src,
        { x: r.x, y: r.y, width: r.w, height: r.h },
        spritePaint,
      );
    }
    // Same readability rule the tiles get, its own value because this art
    // carries more contrast. See CONFIG.background.dim.
    fill('#000000', CONFIG.background.dim);
    rect(canvas, 0, 0, width, height);
  }

  const floor = FRAMES[floorKey(floorFor(theme, world.roomType))];
  if (!painted && atlas && floor) {
    spritePaint.setAlphaf(1);
    for (let y = 0; y < height; y += TILE_SIZE) {
      for (let x = 0; x < width; x += TILE_SIZE) {
        canvas.drawImageRect(
          atlas,
          { x: floor.x, y: floor.y, width: floor.w, height: floor.h },
          { x, y, width: TILE_SIZE, height: TILE_SIZE },
          spritePaint,
        );
      }
    }
    // Knock the tileset back so the floor stays quieter than anything moving on
    // it — the same dim the Views renderer applies, for the same reason.
    fill('#000000', theme.floorDim);
    rect(canvas, 0, 0, width, height);
  }

  // ── The exit gate ──
  //
  // Drawn with the ground rather than with the actors: it is architecture, so
  // anything alive should pass in front of it. Built from the room's own cover
  // colours — see render/gate.ts for why it exists at all.
  {
    const g = gateLayout(world.door);
    fill(theme.cover.side);
    for (const r of g.posts) rect(canvas, r.x, r.y, r.w, r.h);
    fill(theme.cover.edge, 0.55);
    for (const r of g.caps) rect(canvas, r.x, r.y, r.w, r.h);

    // The threshold takes the glow colour the moment the room opens, so the
    // line you step over is itself the signal — no separate indicator to read.
    fill(world.door.open ? theme.gateGlow : theme.cover.side, world.door.open ? 0.85 : 1);
    rect(canvas, g.sill.x, g.sill.y, g.sill.w, g.sill.h);

    for (let i = 0; i < g.glow.length; i++) {
      const r = g.glow[i];
      fill(theme.gateGlow, glowAlpha(i));
      rect(canvas, r.x, r.y, r.w, r.h);
    }
  }

  // Light falling off at the walls the camera cannot show — see EDGE_FALLOFF.
  for (let i = 0; i < EDGE_FALLOFF.bands; i++) {
    const b = EDGE_FALLOFF.start + i * EDGE_FALLOFF.step;
    const a = EDGE_FALLOFF.alpha - i * EDGE_FALLOFF.fade;
    if (a <= 0) break;
    fill('#000000', a);
    rect(canvas, 0, 0, width, b);
    rect(canvas, 0, height - b, width, b);
    rect(canvas, 0, 0, b, height);
    rect(canvas, width - b, 0, b, height);
  }

  // ── Litter — oil, glass, leaves. Under everything, including cover ──
  for (const d of decor) {
    if (!d.flat) continue;
    sprite(canvas, atlas, decorKey(d.id), d.pos.x, d.pos.y, d.size, {
      rotate: d.rot,
      alpha: 0.38,
    });
  }

  // ── Cover — drawn first so every actor sits on top of it ──
  //
  // Three layers make a flat rectangle read as a block with height: a shadow it
  // casts on the floor, a dark side face at the footprint, and a lit top face
  // lifted by blockHeight. Only the bottom strip of the side face survives, and
  // that strip is what the eye reads as the front of the block.
  //
  // Cosmetic only — collision still uses the flat footprint, which is what keeps
  // every pathing and line-of-sight number valid.
  const oc = CONFIG.obstacles;
  for (const o of obstacles) {
    const x = o.pos.x - o.w / 2;
    const y = o.pos.y - o.h / 2;

    fill(oc.shadowColor, 0.5);
    roundRect(canvas, x + 2, y + 4, o.w, o.h, 6);

    fill(theme.cover.side);
    roundRect(canvas, x, y, o.w, o.h, 6);

    // Top face, made of the room's own wall. Bands run the LONG way, so a wide
    // block reads as a length of wall rather than a stack of panels on its side.
    const ty = y - oc.blockHeight;
    fill(theme.cover.side);
    roundRect(canvas, x, ty, o.w, o.h, 6);

    const wall = FRAMES[wallKey(theme.cover.material, o.w >= o.h)];
    if (atlas && wall) {
      // Clipped rather than drawn tile-by-tile to the exact edge: a block is
      // rarely a whole number of tiles across, and clipping is one op where
      // per-tile rect maths is one op plus an off-by-one waiting to happen.
      canvas.save();
      canvas.clipRRect({ rect: { x, y: ty, width: o.w, height: o.h }, rx: 6, ry: 6 }, ClipOp.Intersect, true);
      spritePaint.setAlphaf(1);
      for (let ry = 0; ry < o.h; ry += TILE_SIZE) {
        for (let rx = 0; rx < o.w; rx += TILE_SIZE) {
          canvas.drawImageRect(
            atlas,
            { x: wall.x, y: wall.y, width: wall.w, height: wall.h },
            { x: x + rx, y: ty + ry, width: TILE_SIZE, height: TILE_SIZE },
            spritePaint,
          );
        }
      }
      fill('#000000', theme.cover.dim);
      rect(canvas, x, ty, o.w, o.h);
      canvas.restore();
    }

    fill(theme.cover.edge);
    roundRect(canvas, x, ty, o.w, 2, 2);
  }

  // Whatever is stacked on that cover — crates, boulders, shipping boxes. The
  // block underneath keeps the silhouette you aim around; this is only what it
  // is made of.
  for (const d of decor) {
    if (d.flat) continue;
    sprite(canvas, atlas, decorKey(d.id), d.pos.x, d.pos.y, d.size, { rotate: d.rot });
  }

  // Contact shadow under a body. Squashed vertically because the camera looks
  // down at an angle, and offset the same way every other shadow is — one light
  // direction for the whole scene, or it stops reading as a single space.
  const bodyShadow = (cx: number, cy: number, radius: number, drop: number) => {
    const rx = radius * oc.bodyShadow;
    fill(oc.shadowColor, 0.45);
    canvas.drawOval({ x: cx - rx, y: cy - rx * 0.5 + drop, width: rx * 2, height: rx }, fillPaint);
  };

  // ── Loot — under the actors so bodies always read on top ──
  for (const p of pickups) {
    const bob = Math.sin(p.bob) * CONFIG.pickups.bobAmp;
    const cx = p.pos.x;
    const cy = p.pos.y + bob;
    // Fade out over the last couple of seconds before it despawns.
    const alpha = Math.min(1, p.life / 2);

    if (p.kind === 'gear') {
      // A rotating diamond with a bright rim: the only pickup that isn't a
      // resource, so it has to read as "go and get that" from across the arena.
      const r = pr * 1.5;
      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate((p.bob * 40) % 360, 0, 0);
      fill('#ffe9a8', alpha);
      roundRect(canvas, -r, -r, r * 2, r * 2, 5);
      fill('#8b5cf6', alpha);
      roundRect(canvas, -r + 3, -r + 3, r * 2 - 6, r * 2 - 6, 4);
      canvas.restore();
      stroke('#ffffff', 2, alpha * 0.8);
      canvas.drawCircle(cx, cy, r + 5, strokePaint);
    } else if (p.kind === 'heart') {
      // Rotated square, matching the old View's 45deg transform.
      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate(45, 0, 0);
      fill('#ef4444', alpha);
      roundRect(canvas, -pr, -pr, pr * 2, pr * 2, 4);
      stroke('#ff9d9d', 2, alpha);
      strokeRoundRect(canvas, -pr + 1, -pr + 1, pr * 2 - 2, pr * 2 - 2, 3);
      canvas.restore();
    } else {
      fill('#ffd45e', alpha);
      canvas.drawCircle(cx, cy, pr, fillPaint);
      stroke('#a87b1c', 2, alpha);
      canvas.drawCircle(cx, cy, pr - 1, strokePaint);
    }
  }

  // ── Shrines — three offers, one pick ──
  // The one taken stays lit; the others fade out, so the moment of choosing is
  // visible rather than the losers simply vanishing between frames.
  for (const s of world.shrines) {
    const r = s.radius;
    const tint = shrineColor(s.kind);
    const alpha = s.dissolving ? 0.22 : 1;
    const affordable = s.goldCost <= world.runGold;

    fill(s.claimed ? '#4a3a1a' : tint, affordable ? alpha : alpha * 0.45);
    roundRect(canvas, s.pos.x - r, s.pos.y - r, r * 2, r * 2, 6);
    stroke(s.claimed ? '#6b5426' : '#ffffff', 3, alpha);
    strokeRoundRect(canvas, s.pos.x - r + 1.5, s.pos.y - r + 1.5, r * 2 - 3, r * 2 - 3, 5);

    // Price tag: gold under a forge, a heart-cost under a pact.
    if (!s.claimed && !s.dissolving && (s.goldCost > 0 || s.hpCostFrac > 0)) {
      const label = s.goldCost > 0
        ? `${s.goldCost}`
        : `-${Math.round(s.hpCostFrac * 100)}%`;
      const f = font(13);
      fill(s.goldCost > 0 && !affordable ? '#ff6b6b' : '#ffffff', alpha);
      canvas.drawText(label, s.pos.x - f.measureText(label).width / 2, s.pos.y + r + 16, fillPaint, f);
    }
  }

  // ── Boss ──
  if (world.boss && world.boss.alive) {
    const b = world.boss;
    bodyShadow(b.pos.x, b.pos.y, b.radius, 8);

    // Rings go on the ground under the body. They used to be borders on the
    // body itself, which worked while it was a rounded rectangle — a sprite has
    // its own outline, and a second one stacked on top only muddies it.
    const tint = statusTint(b.status);
    if (tint) {
      stroke(tint, 4);
      canvas.drawCircle(b.pos.x, b.pos.y, b.radius + 3, strokePaint);
    }
    if (b.state === 'windup') {
      stroke('#ffffff', 4);
      canvas.drawCircle(b.pos.x, b.pos.y, b.radius + 10, strokePaint);
    }

    // The sprite is baked once per phase, so the colour that says "this fight
    // just got faster" survives without flattening the body.
    const bAnim = bodyAnim(b.pos, b.facing, b.gait, b.recoil, b.hitFlash, b.radius);
    const drawn = sprite(
      canvas, atlas, bossKey(b.variant, b.phase),
      bAnim.x, bAnim.y, charSize(b.radius, 1.05) * bAnim.scale,
      { rotate: bAnim.rotate, flash: b.hitFlash > 0 ? '#ffffff' : undefined },
    );
    if (!drawn) {
      fill(b.hitFlash > 0 ? '#ffffff' : bossPhases(b)[b.phase].color);
      roundRect(canvas, b.pos.x - b.radius, b.pos.y - b.radius, b.radius * 2, b.radius * 2, 10);
    }
  }

  // ── Blast telegraphs — under the actors, so bodies stay readable on top ──
  // The ring closes in on the radius it will actually hit, which is the only
  // honest way to draw a countdown: what you see is where the damage lands.
  for (const b of world.blasts) {
    const t = 1 - Math.max(0, b.fuse / b.maxFuse); // 0 at spawn, 1 at detonation
    fill(CONFIG.blast.color, 0.13 + 0.22 * t);
    canvas.drawCircle(b.pos.x, b.pos.y, b.radius, fillPaint);
    stroke(CONFIG.blast.color, 2 + 3 * t, 0.5 + 0.5 * t);
    canvas.drawCircle(b.pos.x, b.pos.y, b.radius * (0.25 + 0.75 * t), strokePaint);
  }

  // ── Enemies ──
  for (const e of enemies) {
    bodyShadow(e.pos.x, e.pos.y, e.radius, 5);

    const tint = statusTint(e.status);
    if (tint) {
      stroke(tint, 3);
      canvas.drawCircle(e.pos.x, e.pos.y, e.radius + 2, strokePaint);
    }
    if ((e.kind === 'charger' || e.kind === 'bomber') && e.state === 'windup') {
      stroke('#ffffff', 3);
      canvas.drawCircle(e.pos.x, e.pos.y, e.radius + 6, strokePaint);
    }

    // A lit bomber flashes between its own colour and the blast colour, so the
    // thing about to explode is the loudest object on screen.
    const lit = e.kind === 'bomber' && e.state === 'windup' &&
      Math.floor(e.stateTimer * 12) % 2 === 0;
    const flash = e.hitFlash > 0 ? '#ffffff' : lit ? CONFIG.blast.color : undefined;

    const a = bodyAnim(e.pos, e.facing, e.gait, e.recoil, e.hitFlash, e.radius);
    const drawn = sprite(
      canvas, atlas, foeKey(e.kind), a.x, a.y, charSize(e.radius) * a.scale,
      { rotate: a.rotate, flash },
    );
    if (!drawn) {
      fill(flash ?? e.color);
      if (e.kind === 'shooter' || e.kind === 'bomber') {
        canvas.drawCircle(e.pos.x, e.pos.y, e.radius, fillPaint);
      } else {
        roundRect(canvas, e.pos.x - e.radius, e.pos.y - e.radius, e.radius * 2, e.radius * 2, 4);
      }
    }

    // Health bar. Deliberately drawn after the body and never rotated with it.
    const barX = e.pos.x - e.radius;
    const barY = e.pos.y - e.radius - 11;
    fill('#000000');
    rect(canvas, barX, barY, e.radius * 2, 4);
    fill('#3ecf5f');
    rect(canvas, barX, barY, e.radius * 2 * Math.max(0, e.hp / e.maxHp), 4);
  }

  // ── Projectiles ──
  // Enemy fire: crimson core, pale rim. Deliberately the inverse of a coin's
  // gold-with-dark-rim, so the two never read the same in peripheral vision.
  for (const p of enemyProjectiles) {
    fill(CONFIG.enemyProjectile.color);
    canvas.drawCircle(p.pos.x, p.pos.y, p.radius, fillPaint);
    stroke(CONFIG.enemyProjectile.rimColor, 2);
    canvas.drawCircle(p.pos.x, p.pos.y, p.radius - 1, strokePaint);
  }

  // Player shots, stretched along their own velocity. A round shot at 560px/sec
  // is four unrelated circles in four frames; a streak is one thing travelling,
  // and it is the only motion cue a projectile gets.
  fill('#ffffff');
  for (const p of projectiles) {
    const len = p.radius * 2 * CONFIG.fx.tracerStretch;
    canvas.save();
    canvas.translate(p.pos.x, p.pos.y);
    canvas.rotate(angleOf(p.vel), 0, 0);
    roundRect(canvas, -len / 2, -p.radius, len, p.radius * 2, p.radius);
    canvas.restore();
  }

  // ── Player ──
  //
  // A pool of shadow with a bright ring around it, drawn flat on the ground.
  // This is what says "that's me", and it has to work on grass, on rust-orange
  // brick and on pale concrete — which is exactly why it is NOT tinted with the
  // hero's colour. Rook is olive and the Undergrowth is green: an accent-
  // coloured marker camouflaged the one body on screen the player cannot afford
  // to lose. Darkening the floor under the hero works everywhere, because the
  // sprite is always lighter than the hole it is standing in.
  fill(oc.shadowColor, 0.38);
  canvas.drawCircle(player.pos.x, player.pos.y, player.radius + 5, fillPaint);
  stroke(CONFIG.player.rimColor, 3);
  canvas.drawCircle(player.pos.x, player.pos.y, player.radius + 5, strokePaint);

  // Shield reads as a second ring outside it, thinning as it is spent, so the
  // buffer is visible without another bar competing with the HUD.
  if (player.shieldMax > 0 && player.shield > 0) {
    stroke('#60a5fa', 2 + 3 * (player.shield / player.shieldMax), 0.85);
    canvas.drawCircle(player.pos.x, player.pos.y, player.radius + 10, strokePaint);
  }
  bodyShadow(player.pos.x, player.pos.y, player.radius, 6);

  // The equipped weapon sets the hero's pose at run start; the reload is the one
  // moment it changes mid-fight, and showing it is what turns the Repeater's
  // long gap from "why did I stop shooting" into a thing the hero is visibly
  // doing.
  const reloading =
    player.pattern === 'burst' && player.burstLeft === 0 && player.cooldown > 0.25;
  const pAnim = bodyAnim(player.pos, player.facing, player.gait, player.recoil, 0, player.radius);
  const drawnHero = sprite(
    canvas,
    atlas,
    charKey(player.set, reloading ? 'reload' : player.pose),
    pAnim.x,
    pAnim.y,
    charSize(player.radius) * pAnim.scale,
    { rotate: pAnim.rotate },
  );
  if (!drawnHero) {
    fill(player.color);
    canvas.drawCircle(player.pos.x, player.pos.y, player.radius, fillPaint);
  }

  // ── Flourishes — muzzle blooms, impact rings, bodies falling over ──
  //
  // After the cast, so a flash sits in front of the gun that made it and a
  // corpse tumbles over the floor rather than under it.
  for (const q of fx.pops) {
    const t = q.life / q.maxLife; // 1 at spawn, 0 at death

    if (q.kind === 'corpse') {
      // Shrinks as it fades, so a body reads as sinking out of the room rather
      // than as a sprite someone turned the opacity down on.
      const size = charSize(q.size) * (1 - CONFIG.fx.corpse.sink * (1 - t));
      sprite(canvas, atlas, foeKey(q.sprite ?? ''), q.pos.x, q.pos.y, size, {
        rotate: q.rot,
        alpha: t,
      });
      continue;
    }

    if (q.kind === 'ring') {
      // Expands as it fades: the impact travelling outward, which is the one
      // thing a static hit spark cannot say.
      stroke(q.color, 2, t * 0.9);
      canvas.drawCircle(q.pos.x, q.pos.y, q.size * (0.35 + 0.65 * (1 - t)), strokePaint);
      continue;
    }

    // flash: a bloom at the barrel, stretched along the shot and gone in three
    // frames. Longer than that and a high fire rate becomes a strobe.
    const w = q.size * (0.5 + 0.5 * t);
    const h = q.size * 0.5 * t;
    fill(q.color, t);
    canvas.save();
    canvas.translate(q.pos.x, q.pos.y);
    canvas.rotate(q.rot, 0, 0);
    roundRect(canvas, -w / 2, -h / 2, w, h, h / 2);
    canvas.restore();
  }

  // ── Particles — sparks, stone chips, death bursts ──
  for (const p of fx.particles) {
    const alpha = p.life / p.maxLife;
    fill(p.color, alpha);
    if (p.round) {
      canvas.drawCircle(p.pos.x, p.pos.y, p.size / 2, fillPaint);
    } else {
      rect(canvas, p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size);
    }
  }

  // ── Floating damage numbers ──
  for (const n of fx.numbers) {
    const text = String(n.amount);
    const f = font(n.size);
    // hold, then fade late
    const alpha = Math.min(1, (n.life / n.maxLife) * 1.8);
    // The old Text sat in an 80px-wide centered box; centering on the measured
    // glyph run puts it in the same place without the layout box.
    const x = n.pos.x - f.measureText(text).width / 2;
    const y = n.pos.y;

    // Dark rim keeps the number legible over any body color. A stroked pass
    // behind the fill is the Skia equivalent of the old textShadow.
    stroke('#000000', 3, alpha * 0.85);
    canvas.drawText(text, x, y, strokePaint, f);
    fill(n.color, alpha);
    canvas.drawText(text, x, y, fillPaint, f);
  }

  canvas.restore();

  // ── Damage flash — outside the camera layer so shake can't drag it off ──
  if (fx.flash > 0) {
    fill('#ff2d2d', fx.flash);
    rect(canvas, 0, 0, width, height);
  }
}
