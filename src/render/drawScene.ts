import {
  PaintStyle,
  Skia,
  matchFont,
  type SkCanvas,
  type SkColor,
  type SkFont,
} from '@shopify/react-native-skia';

import { CONFIG } from '../config';
import { Status, World } from '../engine/types';

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

export function drawScene(canvas: SkCanvas, world: World, width: number, height: number) {
  const { player, enemies, projectiles, enemyProjectiles, door, obstacles, pickups, fx } = world;
  const pr = CONFIG.pickups.radius;

  // Camera layer — screen shake translates the world, so the damage flash below
  // stays pinned to the screen and never exposes an edge.
  canvas.save();
  canvas.translate(fx.shakeX, fx.shakeY);

  // ── Cover — drawn first so every actor sits on top of it ──
  for (const o of obstacles) {
    const x = o.pos.x - o.w / 2;
    const y = o.pos.y - o.h / 2;
    // Lit top edge: the highlight is the full body, with the face drawn over
    // it 3px lower. Cheaper than clipping and reads the same.
    fill(CONFIG.obstacles.edgeColor);
    roundRect(canvas, x, y, o.w, o.h, 6);
    fill(CONFIG.obstacles.color);
    roundRect(canvas, x, y + 3, o.w, o.h - 3, 6);
  }

  // ── Door — grey when locked, glowing green when open ──
  const dx = door.pos.x - door.width / 2;
  const dy = door.pos.y - door.height / 2;
  fill(door.open ? '#3ecf5f' : '#3a3f4a');
  roundRect(canvas, dx, dy, door.width, door.height, 6);
  if (door.open) {
    stroke('#b6ffcf', 3);
    strokeRoundRect(canvas, dx + 1.5, dy + 1.5, door.width - 3, door.height - 3, 5);
  }

  // ── Loot — under the actors so bodies always read on top ──
  for (const p of pickups) {
    const bob = Math.sin(p.bob) * CONFIG.pickups.bobAmp;
    const cx = p.pos.x;
    const cy = p.pos.y + bob;
    // Fade out over the last couple of seconds before it despawns.
    const alpha = Math.min(1, p.life / 2);

    if (p.kind === 'heart') {
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

  // ── Chest — gold and shut, dark and open once claimed ──
  if (world.chest) {
    const c = world.chest;
    const r = c.radius;
    fill(c.opened ? '#4a3a1a' : '#e0a92c');
    roundRect(canvas, c.pos.x - r, c.pos.y - r, r * 2, r * 2, 6);
    stroke(c.opened ? '#6b5426' : '#fff0b8', 3);
    strokeRoundRect(canvas, c.pos.x - r + 1.5, c.pos.y - r + 1.5, r * 2 - 3, r * 2 - 3, 5);
  }

  // ── Boss ──
  if (world.boss && world.boss.alive) {
    const b = world.boss;
    if (b.state === 'windup') {
      stroke('#ffffff', 4);
      canvas.drawCircle(b.pos.x, b.pos.y, b.radius + 10, strokePaint);
    }
    // Blown out to white for a few frames after every hit.
    fill(b.hitFlash > 0 ? '#ffffff' : CONFIG.boss.phases[b.phase].color);
    roundRect(canvas, b.pos.x - b.radius, b.pos.y - b.radius, b.radius * 2, b.radius * 2, 10);

    const tint = statusTint(b.status);
    if (tint) {
      stroke(tint, 4);
      strokeRoundRect(
        canvas, b.pos.x - b.radius + 2, b.pos.y - b.radius + 2, b.radius * 2 - 4, b.radius * 2 - 4, 8
      );
    }
  }

  // ── Enemies ──
  for (const e of enemies) {
    if (e.kind === 'charger' && e.state === 'windup') {
      stroke('#ffffff', 3);
      canvas.drawCircle(e.pos.x, e.pos.y, e.radius + 6, strokePaint);
    }

    fill(e.hitFlash > 0 ? '#ffffff' : e.color);
    if (e.kind === 'shooter') {
      canvas.drawCircle(e.pos.x, e.pos.y, e.radius, fillPaint);
    } else {
      roundRect(canvas, e.pos.x - e.radius, e.pos.y - e.radius, e.radius * 2, e.radius * 2, 4);
    }

    const tint = statusTint(e.status);
    if (tint) {
      stroke(tint, 3);
      if (e.kind === 'shooter') {
        canvas.drawCircle(e.pos.x, e.pos.y, e.radius - 1.5, strokePaint);
      } else {
        strokeRoundRect(
          canvas, e.pos.x - e.radius + 1.5, e.pos.y - e.radius + 1.5, e.radius * 2 - 3, e.radius * 2 - 3, 3
        );
      }
    }

    // Health bar.
    const barX = e.pos.x - e.radius;
    const barY = e.pos.y - e.radius - 9;
    fill('#000000');
    rect(canvas, barX, barY, e.radius * 2, 4);
    fill('#3ecf5f');
    rect(canvas, barX, barY, e.radius * 2 * Math.max(0, e.hp / e.maxHp), 4);
  }

  // ── Projectiles ──
  fill('#ffb020');
  for (const p of enemyProjectiles) canvas.drawCircle(p.pos.x, p.pos.y, p.radius, fillPaint);

  fill('#ffffff');
  for (const p of projectiles) canvas.drawCircle(p.pos.x, p.pos.y, p.radius, fillPaint);

  // ── Player ──
  fill('#3ecf5f');
  canvas.drawCircle(player.pos.x, player.pos.y, player.radius, fillPaint);
  fill('#0b3d1e');
  canvas.drawCircle(
    player.pos.x + player.facing.x * player.radius,
    player.pos.y + player.facing.y * player.radius,
    4,
    fillPaint
  );

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
