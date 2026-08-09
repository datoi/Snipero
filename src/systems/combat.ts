import { CONFIG } from '../config';
import { Projectile, World } from '../engine/types';
import { Vec2, dist, normalize, rotate, sub } from '../engine/vec';
import { blocked, hasLineOfSight, segmentBlocked } from './obstacles';
import { emitMuzzle, emitWallSpark } from './fx';
import { damageBoss, damageEnemy } from './damage';
import { applyBurn, applyFrost } from './status';
import { sfx } from './sfx';
import { normalize as norm } from '../engine/vec';

const A = CONFIG.abilities;

// Anything the auto-aim can lock onto. The boss isn't in `world.enemies`, so
// targeting has to reach for it separately — miss that and a boss room with no
// minions leaves the player with no target at all, unable to fire a single shot.
type Targetable = { pos: Vec2; radius: number };

// Targeting: nearest living target (Archero's baseline auto-aim rule), but only
// one the shot can actually reach. "Reach" is tested with the projectile's own
// radius, so the targeting check and the collision check in updateProjectiles
// agree — a lane that threads within 6px of a corner is not a lane.
//
// When nothing is reachable the player holds fire rather than emptying the
// quiver into a wall. Firing anyway looks identical to fighting, so a room
// where every enemy is behind cover reads as broken instead of as "move". The
// silence is the tell: no muzzle flash means reposition.
//
// Ricochet is the deliberate exception. A build that has bought wall bounces
// *can* put damage on something it cannot see, so it keeps the hidden-target
// fallback — which is exactly the identity that card should have.
function findTarget(world: World): Targetable | null {
  const from = world.player.pos;
  const pad = CONFIG.projectile.radius;

  let visible: Targetable | null = null;
  let visibleD = Infinity;
  let nearest: Targetable | null = null;
  let nearestD = Infinity;

  const consider = (t: Targetable) => {
    const d = dist(from, t.pos);
    if (d < nearestD) {
      nearestD = d;
      nearest = t;
    }
    if (d < visibleD && hasLineOfSight(from, t.pos, world, pad)) {
      visibleD = d;
      visible = t;
    }
  };

  for (const e of world.enemies) if (e.alive) consider(e);
  if (world.boss && world.boss.alive) consider(world.boss);

  if (visible) return visible;
  return world.player.bounces > 0 ? nearest : null;
}

// PlayerCombat equivalent: the attack timer ONLY advances while standing still.
export function updateCombat(world: World, dt: number) {
  const p = world.player;
  p.cooldown -= dt;

  if (world.input.moving) {
    p.stillTime = 0; // moving: reset, never fire
    return;
  }

  p.stillTime += dt;
  if (p.stillTime < CONFIG.player.settleDelay) return;

  if (p.cooldown <= 0) {
    const target = findTarget(world);
    if (!target) return;
    if (dist(p.pos, target.pos) > p.range) return; // out of range: hold fire
    fireShot(world, target);
    p.cooldown = 1 / p.attackRate;
  }
}

// Fire one "shot" — the forward spread, plus whatever side and rear arrows the
// build has bought. Side/rear fire is what turns "point at the nearest thing"
// into real positioning: with rear arrows a chaser behind you is no longer a
// reason to stop shooting the pack in front.
function fireShot(world: World, target: Targetable) {
  const p = world.player;
  const baseDir = normalize(sub(target.pos, p.pos));
  const spread = (p.spreadDeg * Math.PI) / 180;

  // Forward spread (multishot).
  //
  // The fan is aimed, not just angled: its width is capped so the OUTERMOST
  // arrow still lands on the target it was fired at. A fixed angle looks fine
  // and is quietly a trap — with an even projectile count no arrow travels down
  // the centre line, so the fan straddles the target and at range every single
  // arrow misses. At 249px a ±7° fan puts each shot 30px off centre against a
  // 24px hitbox: Multishot 2 did strictly *less* single-target damage than
  // Multishot 1, which is the exact opposite of what the card promises.
  //
  // Capping by distance keeps the wide arc where it reads — up close, against a
  // crowd — and tightens it to a stream at range, where the fan was only ever
  // throwing damage away.
  const n = Math.max(1, p.projectilesPerShot);
  const aimSpread = n > 1 ? Math.min(spread, aimCone(p, target, n)) : spread;
  const start = -(aimSpread * (n - 1)) / 2;
  for (let i = 0; i < n; i++) spawnShot(world, rotate(baseDir, start + aimSpread * i));

  // Side arrows: one pair per stack, fanned around ±90° so extra pairs read as
  // a widening arc rather than stacking invisibly on the same line.
  if (p.sideShots > 0) {
    const side = (A.sideShot.angleDeg * Math.PI) / 180;
    for (let i = 0; i < p.sideShots; i++) {
      const off = (i - (p.sideShots - 1) / 2) * spread;
      spawnShot(world, rotate(baseDir, side + off));
      spawnShot(world, rotate(baseDir, -side - off));
    }
  }

  // Rear arrows, fanned the same way.
  if (p.rearShots > 0) {
    const rear = (A.rearShot.angleDeg * Math.PI) / 180;
    for (let i = 0; i < p.rearShots; i++) {
      const off = (i - (p.rearShots - 1) / 2) * spread;
      spawnShot(world, rotate(baseDir, rear + off));
    }
  }

  // One shot sound per volley, not per projectile — multishot would otherwise
  // fire five overlapping copies of the same click.
  sfx('shot');
  emitMuzzle(world, { x: p.pos.x + baseDir.x * p.radius, y: p.pos.y + baseDir.y * p.radius }, baseDir);
}

// Widest total fan angle that still keeps every arrow inside the target's
// hitbox at its current distance. `0.8` keeps the outer arrows off the very edge
// so a target drifting a few px doesn't shed the whole volley.
function aimCone(p: { pos: Vec2 }, target: Targetable, n: number): number {
  const d = Math.max(1, dist(p.pos, target.pos));
  const halfHit = (target.radius + CONFIG.projectile.radius) * 0.8;
  return (2 * Math.atan2(halfHit, d)) / (n - 1);
}

// Crit is rolled per projectile rather than per shot, so multishot genuinely
// buys more chances to spike — the two cards are meant to reinforce each other.
function spawnShot(world: World, dir: Vec2) {
  const p = world.player;
  const crit = p.critChance > 0 && Math.random() < p.critChance;

  world.projectiles.push({
    id: world.nextId++,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: dir.x * CONFIG.projectile.speed, y: dir.y * CONFIG.projectile.speed },
    radius: CONFIG.projectile.radius,
    damage: crit ? p.damage * p.critMult : p.damage,
    life: CONFIG.projectile.life,
    pierce: p.pierce,
    hitIds: [],
    alive: true,
    bounces: p.bounces,
    burn: p.burn,
    frost: p.frost,
    crit,
  });
}

// Reflect a shot that ran into cover. The step is rewound to where it started,
// then each axis is retested on its own to work out which face was hit — a
// cheap stand-in for a real contact normal that's exact for axis-aligned boxes,
// which is all cover ever is.
function bounceOffCover(pr: Projectile, from: Vec2, dt: number, world: World): boolean {
  const r = pr.radius;
  const obs = world.obstacles;

  const xBlocked = blocked(from.x + pr.vel.x * dt, from.y, r, obs);
  const yBlocked = blocked(from.x, from.y + pr.vel.y * dt, r, obs);

  if (xBlocked && !yBlocked) pr.vel.x = -pr.vel.x;
  else if (yBlocked && !xBlocked) pr.vel.y = -pr.vel.y;
  else { pr.vel.x = -pr.vel.x; pr.vel.y = -pr.vel.y; } // corner, or dead-on into a face

  pr.pos.x = from.x + pr.vel.x * dt;
  pr.pos.y = from.y + pr.vel.y * dt;

  // If it's still inside geometry after reflecting it's wedged somewhere the
  // axis test can't resolve. Kill it rather than let it rattle forever.
  if (blocked(pr.pos.x, pr.pos.y, r, obs)) return false;

  pr.bounces -= 1;
  pr.hitIds.length = 0; // a bounced shot may hit the same target again
  return true;
}

// Bounce off the arena edge. Only shots with ricochet get this — everything
// else keeps the old behaviour of flying off and despawning.
function bounceOffArena(pr: Projectile, world: World): boolean {
  const r = pr.radius;
  const { w, h } = world.bounds;
  let hit = false;

  if (pr.pos.x < r) { pr.pos.x = r; pr.vel.x = -pr.vel.x; hit = true; }
  else if (pr.pos.x > w - r) { pr.pos.x = w - r; pr.vel.x = -pr.vel.x; hit = true; }

  if (pr.pos.y < r) { pr.pos.y = r; pr.vel.y = -pr.vel.y; hit = true; }
  else if (pr.pos.y > h - r) { pr.pos.y = h - r; pr.vel.y = -pr.vel.y; hit = true; }

  if (hit) {
    pr.bounces -= 1;
    pr.hitIds.length = 0;
  }
  return hit;
}

// Move projectiles, expire them, and resolve hits (with piercing + ricochet).
export function updateProjectiles(world: World, dt: number) {
  const { bounds } = world;
  const critColor = CONFIG.fx.number.critColor;

  for (const pr of world.projectiles) {
    if (!pr.alive) continue;

    // Remember where the step started so cover can be tested as a segment —
    // a fast shot must not tunnel through a thin wall between two frames.
    const from = { x: pr.pos.x, y: pr.pos.y };
    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
    pr.life -= dt;

    if (pr.life <= 0) {
      pr.alive = false;
      continue;
    }

    if (pr.bounces > 0) {
      bounceOffArena(pr, world);
    } else {
      const off = 60;
      if (
        pr.pos.x < -off || pr.pos.x > bounds.w + off ||
        pr.pos.y < -off || pr.pos.y > bounds.h + off
      ) {
        pr.alive = false;
        continue;
      }
    }

    for (const e of world.enemies) {
      if (!e.alive || pr.hitIds.includes(e.id)) continue;
      if (dist(pr.pos, e.pos) <= pr.radius + e.radius) {
        pr.hitIds.push(e.id);
        if (pr.burn > 0) applyBurn(e.status, pr.burn);
        if (pr.frost > 0) applyFrost(e.status, pr.frost);
        damageEnemy(world, e, pr.damage, {
          dir: norm(pr.vel),
          color: pr.crit ? critColor : undefined,
          crit: pr.crit,
        });
        if (pr.pierce <= 0) {
          pr.alive = false;
          break;
        }
        pr.pierce -= 1; // pass through this one, keep going
      }
    }

    // Boss hit (uses -1 as its marker in hitIds so a shot hits it at most once).
    const boss = world.boss;
    if (pr.alive && boss && boss.alive && !pr.hitIds.includes(-1)) {
      if (dist(pr.pos, boss.pos) <= pr.radius + boss.radius) {
        pr.hitIds.push(-1);
        if (pr.burn > 0) applyBurn(boss.status, pr.burn);
        if (pr.frost > 0) applyFrost(boss.status, pr.frost);
        damageBoss(world, boss, pr.damage, {
          dir: norm(pr.vel),
          color: pr.crit ? critColor : undefined,
          crit: pr.crit,
        });
        if (pr.pierce <= 0) pr.alive = false;
        else pr.pierce -= 1;
      }
    }

    // Cover. Checked after enemies so an enemy hugging a wall still takes the
    // hit. Ricochet turns this into a bounce; without it, cover eats the shot.
    if (pr.alive && segmentBlocked(from, pr.pos, world.obstacles, pr.radius)) {
      if (pr.bounces > 0 && bounceOffCover(pr, from, dt, world)) {
        emitWallSpark(world, pr.pos, norm(pr.vel));
      } else {
        pr.alive = false;
        emitWallSpark(world, pr.pos, norm(pr.vel)); // stone chips: the shot was eaten
      }
    }
  }

  world.projectiles = world.projectiles.filter((p) => p.alive);
}
