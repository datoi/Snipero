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
import { bossPhases } from '../systems/boss';
import { shrineColor } from '../systems/shrine';

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

  // Frame posts either side. A plain filled rectangle reads as a status bar —
  // which is exactly how it was being read while it sat behind the HUD — so the
  // door gets a silhouette no HUD element has.
  fill('#2a2f3a');
  roundRect(canvas, dx - 8, dy - 6, 8, door.height + 12, 3);
  roundRect(canvas, dx + door.width, dy - 6, 8, door.height + 12, 3);

  fill(door.open ? '#3ecf5f' : '#3a3f4a');
  roundRect(canvas, dx, dy, door.width, door.height, 6);

  if (door.open) {
    stroke('#b6ffcf', 3);
    strokeRoundRect(canvas, dx + 1.5, dy + 1.5, door.width - 3, door.height - 3, 5);
    // Arrow through the opening: the banner already says "go through the door",
    // and the door should say the same thing without words.
    stroke('#eafff1', 3);
    const cx = door.pos.x;
    const cy = door.pos.y;
    canvas.drawLine(cx, cy + 7, cx, cy - 7, strokePaint);
    canvas.drawLine(cx - 6, cy - 1, cx, cy - 7, strokePaint);
    canvas.drawLine(cx + 6, cy - 1, cx, cy - 7, strokePaint);
  }

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
    if (b.state === 'windup') {
      stroke('#ffffff', 4);
      canvas.drawCircle(b.pos.x, b.pos.y, b.radius + 10, strokePaint);
    }
    // Blown out to white for a few frames after every hit.
    fill(b.hitFlash > 0 ? '#ffffff' : bossPhases(b)[b.phase].color);
    roundRect(canvas, b.pos.x - b.radius, b.pos.y - b.radius, b.radius * 2, b.radius * 2, 10);

    const tint = statusTint(b.status);
    if (tint) {
      stroke(tint, 4);
      strokeRoundRect(
        canvas, b.pos.x - b.radius + 2, b.pos.y - b.radius + 2, b.radius * 2 - 4, b.radius * 2 - 4, 8
      );
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
    if ((e.kind === 'charger' || e.kind === 'bomber') && e.state === 'windup') {
      stroke('#ffffff', 3);
      canvas.drawCircle(e.pos.x, e.pos.y, e.radius + 6, strokePaint);
    }

    // A lit bomber flashes between its own colour and the blast colour, so the
    // thing about to explode is the loudest object on screen.
    const lit = e.kind === 'bomber' && e.state === 'windup' &&
      Math.floor(e.stateTimer * 12) % 2 === 0;

    fill(e.hitFlash > 0 ? '#ffffff' : lit ? CONFIG.blast.color : e.color);
    if (e.kind === 'shooter' || e.kind === 'bomber') {
      canvas.drawCircle(e.pos.x, e.pos.y, e.radius, fillPaint);
    } else {
      roundRect(canvas, e.pos.x - e.radius, e.pos.y - e.radius, e.radius * 2, e.radius * 2, 4);
    }

    const tint = statusTint(e.status);
    if (tint) {
      stroke(tint, 3);
      if (e.kind === 'shooter' || e.kind === 'bomber') {
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
  // Enemy fire: crimson core, pale rim. Deliberately the inverse of a coin's
  // gold-with-dark-rim, so the two never read the same in peripheral vision.
  for (const p of enemyProjectiles) {
    fill(CONFIG.enemyProjectile.color);
    canvas.drawCircle(p.pos.x, p.pos.y, p.radius, fillPaint);
    stroke(CONFIG.enemyProjectile.rimColor, 2);
    canvas.drawCircle(p.pos.x, p.pos.y, p.radius - 1, strokePaint);
  }

  fill('#ffffff');
  for (const p of projectiles) canvas.drawCircle(p.pos.x, p.pos.y, p.radius, fillPaint);

  // ── Player ──
  // Shield reads as a ring around the hero that thins as it is spent, so the
  // buffer is visible without another bar competing with the HUD.
  if (player.shieldMax > 0 && player.shield > 0) {
    stroke('#60a5fa', 2 + 3 * (player.shield / player.shieldMax), 0.85);
    canvas.drawCircle(player.pos.x, player.pos.y, player.radius + 6, strokePaint);
  }
  // Body takes the hero's colour; the white rim is constant. Heroes can be
  // orange or blue — the same range as the enemies — so hue alone can't carry
  // "that's me". The rim is what does, and no enemy has one.
  fill(player.color);
  canvas.drawCircle(player.pos.x, player.pos.y, player.radius, fillPaint);
  stroke(CONFIG.player.rimColor, 2.5);
  canvas.drawCircle(player.pos.x, player.pos.y, player.radius - 1, strokePaint);

  fill('#0b1220');
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
