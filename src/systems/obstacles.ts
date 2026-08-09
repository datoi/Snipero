import { CONFIG } from '../config';
import { Obstacle, World } from '../engine/types';
import { Vec2 } from '../engine/vec';

// Cover geometry. Everything here is circle-vs-AABB — the player, enemies, the
// boss and every projectile are circles, and obstacles are axis-aligned boxes.
//
// Three jobs:
//   1. moveCircle  — walk a body, sliding along walls instead of sticking.
//   2. resolveCircle — shove a body out of a box it's already inside (spawning).
//   3. segmentBlocked — does a straight line cross cover? (shots + line of sight)

const halfW = (o: Obstacle) => o.w / 2;
const halfH = (o: Obstacle) => o.h / 2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Resolution pushes bodies to *strictly* outside a box, not merely tangent to
// it. Landing exactly on the surface leaves float noise to decide whether the
// body reads as overlapping, and if it does, every position beside it reads as
// overlapping too — so a body resolved onto a face can never slide along it.
//
// That was a hard softlock, not a cosmetic wobble: a chaser walking straight
// into the flat face of the centre wall wedged there permanently, and since the
// auto-aim still locked onto it through the wall, the room could never be
// cleared and the run could never end.
const SKIN = 0.5;

// ── Build a room's cover from the normalized layout table ──

// Layouts are stored as fractions of the arena so they lay out correctly on any
// phone. Boss rooms use a deliberately sparse layout — the boss needs lanes to
// charge down, and too much cover turns the fight into a stalemate.
export function buildObstacles(w: number, h: number, index: number, isBossRoom: boolean): Obstacle[] {
  const oc = CONFIG.obstacles;
  const layout = isBossRoom ? oc.bossLayout : oc.layouts[index % oc.layouts.length];

  const out: Obstacle[] = [];
  for (const l of layout) {
    const o: Obstacle = { pos: { x: l.x * w, y: l.y * h }, w: l.w * w, h: l.h * h };
    snapToArenaEdge(o, w, h);
    // Never let cover grow over the doorway — the exit has to stay walkable.
    if (!blocksDoor(o, w)) out.push(o);
  }
  return out;
}

// A block that stops just short of the arena edge leaves a slot too narrow to
// walk through — and anything shoved into that slot gets pushed back out of the
// arena. Close the gap by snapping the block flush to the edge, so every lane
// the layout leaves is one a body can actually fit down.
function snapToArenaEdge(o: Obstacle, w: number, h: number) {
  const gap = CONFIG.obstacles.minLaneWidth;
  let left = o.pos.x - halfW(o);
  let right = o.pos.x + halfW(o);
  let top = o.pos.y - halfH(o);
  let bottom = o.pos.y + halfH(o);

  if (left > 0 && left < gap) left = 0;
  if (right < w && w - right < gap) right = w;
  if (top > 0 && top < gap) top = 0;
  if (bottom < h && h - bottom < gap) bottom = h;

  o.pos.x = (left + right) / 2;
  o.w = right - left;
  o.pos.y = (top + bottom) / 2;
  o.h = bottom - top;
}

// The doorway plus the approach lane below it, kept clear of cover.
function blocksDoor(o: Obstacle, w: number): boolean {
  const d = CONFIG.door;
  const laneHalfW = d.width / 2 + CONFIG.obstacles.doorClearance;
  const laneBottom = d.marginTop + d.height / 2 + CONFIG.obstacles.doorClearance;
  return (
    Math.abs(o.pos.x - w / 2) < laneHalfW + halfW(o) &&
    o.pos.y - halfH(o) < laneBottom
  );
}

// ── Overlap tests ──

// Closest point on the box to p, written into the shared scratch object.
const scratch = { x: 0, y: 0 };
function closestPoint(p: Vec2, o: Obstacle) {
  scratch.x = clamp(p.x, o.pos.x - halfW(o), o.pos.x + halfW(o));
  scratch.y = clamp(p.y, o.pos.y - halfH(o), o.pos.y + halfH(o));
}

export function circleHits(p: Vec2, radius: number, o: Obstacle): boolean {
  closestPoint(p, o);
  const dx = p.x - scratch.x;
  const dy = p.y - scratch.y;
  return dx * dx + dy * dy < radius * radius;
}

// Would a circle at (x, y) be inside any cover?
export function blocked(x: number, y: number, radius: number, obstacles: Obstacle[]): boolean {
  const at = { x, y };
  for (const o of obstacles) if (circleHits(at, radius, o)) return true;
  return false;
}

// ── Movement ──

// Move a body by (dx, dy), sliding along whatever it runs into: try the full
// step, then x-only, then y-only. That's what makes a body brush past a wall
// diagonally instead of gluing itself to the face of it. Mutates pos.
// Returns true if the body was stopped outright (both axes rejected).
export function moveCircle(
  pos: Vec2,
  radius: number,
  dx: number,
  dy: number,
  obstacles: Obstacle[]
): boolean {
  if (obstacles.length === 0) {
    pos.x += dx;
    pos.y += dy;
    return false;
  }

  if (!blocked(pos.x + dx, pos.y + dy, radius, obstacles)) {
    pos.x += dx;
    pos.y += dy;
    return false;
  }
  // Diagonal is blocked — keep whichever single axis is still free.
  let moved = false;
  if (dx !== 0 && !blocked(pos.x + dx, pos.y, radius, obstacles)) {
    pos.x += dx;
    moved = true;
  }
  if (dy !== 0 && !blocked(pos.x, pos.y + dy, radius, obstacles)) {
    pos.y += dy;
    moved = true;
  }
  return !moved;
}

// Push a body out of any cover it's overlapping. Used after spawning and after
// the screen-bounds clamp, so nothing ends up permanently stuck inside a box.
//
// `bounds` matters more than it looks: layouts snap flush to the arena edge, so
// the *shortest* way out of a block can be straight off the screen. A caller
// that then clamps the body back on screen would drop it right back inside the
// block it just escaped. With bounds supplied, only escapes that land somewhere
// legal are considered.
export function resolveCircle(
  pos: Vec2,
  radius: number,
  obstacles: Obstacle[],
  bounds?: { w: number; h: number }
) {
  const inBounds = (x: number, y: number) =>
    !bounds ||
    (x >= radius && x <= bounds.w - radius && y >= radius && y <= bounds.h - radius);

  // Escaping one block can nudge a body straight into its neighbour, so keep
  // passing until the position settles. Layouts are small; this converges in
  // one or two passes unless a body genuinely doesn't fit in the gap.
  for (let pass = 0; pass < 4; pass++) {
    if (!resolvePass(pos, radius, obstacles, inBounds)) break;
  }
}

// One sweep over every obstacle. Returns true if the body had to be moved.
function resolvePass(
  pos: Vec2,
  radius: number,
  obstacles: Obstacle[],
  inBounds: (x: number, y: number) => boolean
): boolean {
  let moved = false;

  for (const o of obstacles) {
    closestPoint(pos, o);
    const dx = pos.x - scratch.x;
    const dy = pos.y - scratch.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    moved = true;

    if (d2 > 1e-6) {
      // Outside the box but overlapping: push straight out along the contact
      // normal, as long as that doesn't shove the body off the arena.
      const d = Math.sqrt(d2);
      const nx = scratch.x + (dx / d) * (radius + SKIN);
      const ny = scratch.y + (dy / d) * (radius + SKIN);
      if (inBounds(nx, ny)) {
        pos.x = nx;
        pos.y = ny;
        continue;
      }
      // Otherwise fall through and pick a face that stays on screen.
    }

    // Leave by the shortest face that lands somewhere legal.
    const out = radius + SKIN;
    const exits = [
      { d: pos.x - (o.pos.x - halfW(o)), x: o.pos.x - halfW(o) - out, y: pos.y },
      { d: o.pos.x + halfW(o) - pos.x, x: o.pos.x + halfW(o) + out, y: pos.y },
      { d: pos.y - (o.pos.y - halfH(o)), x: pos.x, y: o.pos.y - halfH(o) - out },
      { d: o.pos.y + halfH(o) - pos.y, x: pos.x, y: o.pos.y + halfH(o) + out },
    ].sort((a, b) => a.d - b.d);

    const pick = exits.find((e) => inBounds(e.x, e.y)) ?? exits[0];
    pos.x = pick.x;
    pos.y = pick.y;
  }

  return moved;
}

// Keep a body on screen and out of cover. Screen bounds are re-applied last so
// staying on screen always wins — a push-out must never eject a body off the
// edge of the arena.
export function confine(pos: Vec2, radius: number, world: World) {
  const { w, h } = world.bounds;
  pos.x = clamp(pos.x, radius, w - radius);
  pos.y = clamp(pos.y, radius, h - radius);
  resolveCircle(pos, radius, world.obstacles, world.bounds);
  pos.x = clamp(pos.x, radius, w - radius);
  pos.y = clamp(pos.y, radius, h - radius);
}

// The obstacle a body is closest to touching. Used to work out which face a
// wedged enemy is grinding against so it can slide along it.
export function nearestObstacle(p: Vec2, obstacles: Obstacle[]): Obstacle | null {
  let best: Obstacle | null = null;
  let bestD2 = Infinity;
  for (const o of obstacles) {
    closestPoint(p, o);
    const dx = p.x - scratch.x;
    const dy = p.y - scratch.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = o;
    }
  }
  return best;
}

// ── Line of sight ──

// Slab test: does segment a→b cross this box? `pad` inflates the box, which is
// how a shot with a radius is tested against cover.
function segmentHitsBox(a: Vec2, b: Vec2, o: Obstacle, pad: number): boolean {
  const minX = o.pos.x - halfW(o) - pad;
  const maxX = o.pos.x + halfW(o) + pad;
  const minY = o.pos.y - halfH(o) - pad;
  const maxY = o.pos.y + halfH(o) + pad;

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  let t0 = 0;
  let t1 = 1;

  // One axis at a time, narrowing the slice of the segment still inside the box.
  for (let axis = 0; axis < 2; axis++) {
    const start = axis === 0 ? a.x : a.y;
    const delta = axis === 0 ? dx : dy;
    const lo = axis === 0 ? minX : minY;
    const hi = axis === 0 ? maxX : maxY;

    if (Math.abs(delta) < 1e-6) {
      if (start < lo || start > hi) return false; // parallel and outside the slab
      continue;
    }
    let near = (lo - start) / delta;
    let far = (hi - start) / delta;
    if (near > far) [near, far] = [far, near];
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return false;
  }
  return true;
}

// Is the straight line from a to b interrupted by cover?
export function segmentBlocked(a: Vec2, b: Vec2, obstacles: Obstacle[], pad = 0): boolean {
  for (const o of obstacles) if (segmentHitsBox(a, b, o, pad)) return true;
  return false;
}

// Can a shooter (or the auto-aim) actually see the target from here?
//
// `pad` must match the radius of whatever is going to travel down this line.
// A zero-pad check asks "can an infinitely thin ray get through", which a real
// projectile with a radius cannot answer yes to — any lane passing within one
// projectile radius of a corner reports clear here and is then eaten by the
// same cover in updateProjectiles. Two tests, one line, opposite answers.
export function hasLineOfSight(a: Vec2, b: Vec2, world: World, pad = 0): boolean {
  return !segmentBlocked(a, b, world.obstacles, pad);
}
