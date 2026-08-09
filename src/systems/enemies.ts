import { CONFIG } from '../config';
import { Enemy, World } from '../engine/types';
import { Vec2, dist, normalize, sub } from '../engine/vec';
import { blocked, confine, hasLineOfSight, moveCircle, segmentBlocked } from './obstacles';
import { addFlash, addShake, emitHit, emitWallSpark } from './fx';
import { slowFactor } from './status';
import { haptic, sfx } from './sfx';

// Frost bites here. Because the player can only shoot while standing still,
// slowing the wave down is not a defensive effect — it directly buys firing
// time, which is why Frost is priced as an epic.
const speedOf = (e: Enemy) => e.speed * slowFactor(e.status);

// Dispatch each enemy to its archetype behavior, then apply contact damage.
export function updateEnemies(world: World, dt: number) {
  const p = world.player;

  for (const e of world.enemies) {
    if (!e.alive) continue;

    if (e.slideTimer > 0) e.slideTimer -= dt;
    trackProgress(e, p.pos, dt);

    switch (e.kind) {
      case 'shooter':
        updateShooter(world, e, dt);
        break;
      case 'charger':
        updateCharger(world, e, dt);
        break;
      default:
        updateChaser(world, e, dt);
        break;
    }

    // Keep enemies on screen and out of cover.
    confine(e.pos, e.radius, world);

    // Contact damage to the player. This ticks every frame, so it gets a soft
    // sustained flash rather than the punchy per-hit treatment.
    if (dist(e.pos, p.pos) <= e.radius + p.radius) {
      p.hp -= e.contactDamage * dt;
      if (p.hp < 0) p.hp = 0;
      addFlash(world, CONFIG.fx.flash.contact);
    }
  }

  world.enemies = world.enemies.filter((e) => e.alive);
}

// ── Chaser: walk straight at the player. ──
function updateChaser(world: World, e: Enemy, dt: number) {
  const p = world.player;
  const d = dist(e.pos, p.pos);
  if (d > e.radius + p.radius + 1) {
    const dir = normalize(sub(p.pos, e.pos));
    const sp = speedOf(e);
    step(world, e, dir.x * sp * dt, dir.y * sp * dt);
  }
}

// ── Shooter: hold a preferred distance and fire projectiles on a cooldown. ──
function updateShooter(world: World, e: Enemy, dt: number) {
  const p = world.player;
  const c = CONFIG.enemies.shooter;
  const d = dist(e.pos, p.pos);
  const dir = normalize(sub(p.pos, e.pos));

  // Tested with the shot's own radius so "I can see you" and "my shot gets
  // there" are the same question. Computed once and used for both movement and
  // firing — the two decisions have to agree or the archetype deadlocks.
  const los = hasLineOfSight(e.pos, p.pos, world, c.projectileRadius);

  const sp = speedOf(e);
  if (!los) {
    // No firing lane. Range discipline is meaningless when the shot can't land,
    // so close in and let step()'s wall-follow carry it around the blocking
    // face. Deciding movement on distance alone is what let a shooter park
    // behind cover inside its preferred band and stand there forever: it never
    // wanted to move, so it never entered step(), so the anti-stuck logic that
    // fixed the chasers never ran for it. A shooter that cannot shoot must move.
    step(world, e, dir.x * sp * dt, dir.y * sp * dt);
  } else if (d > c.preferredRange) {
    // too far — close in
    step(world, e, dir.x * sp * dt, dir.y * sp * dt);
  } else if (d < c.preferredRange * 0.6) {
    // too close — back away
    step(world, e, -dir.x * sp * dt, -dir.y * sp * dt);
  }

  e.attackTimer -= dt;
  if (e.attackTimer <= 0) {
    // Don't fire into a wall — hold the shot until the player is actually
    // exposed, so ducking behind cover reliably shuts a shooter down.
    if (los) {
      fireEnemyProjectile(world, e, dir);
      e.attackTimer = c.attackCooldown;
    } else {
      e.attackTimer = c.attackCooldown * 0.25; // re-check soon rather than every frame
    }
  }
}

// ── Charger: creep, telegraph (windup), then dash in a locked direction. ──
function updateCharger(world: World, e: Enemy, dt: number) {
  const p = world.player;
  const c = CONFIG.enemies.charger;
  const d = dist(e.pos, p.pos);
  e.stateTimer -= dt;

  if (e.state === 'idle') {
    // Creep toward the player while the cooldown ticks down.
    if (d > e.radius + p.radius + 1) {
      const dir = normalize(sub(p.pos, e.pos));
      const sp = speedOf(e);
      step(world, e, dir.x * sp * dt, dir.y * sp * dt);
    }
    // Only commit to a charge down a clear lane — otherwise it just eats a wall.
    if (e.stateTimer <= 0 && d < c.triggerRange && hasLineOfSight(e.pos, p.pos, world)) {
      e.state = 'windup';
      e.stateTimer = c.windup;
      sfx('telegraph'); // the audio half of the charge tell
    }
  } else if (e.state === 'windup') {
    // Freeze and telegraph; lock the dash direction at the end of the windup.
    if (e.stateTimer <= 0) {
      e.chargeDir = normalize(sub(p.pos, e.pos));
      e.state = 'charging';
      e.stateTimer = c.chargeDuration;
    }
  } else {
    // Charging: fly along the locked direction until the dash times out — or
    // until it slams into cover, which cuts the dash short and leaves it
    // sitting in its recovery. Baiting a charger into a wall is the payoff.
    const dash = c.chargeSpeed * slowFactor(e.status);
    const hitWall = moveCircle(
      e.pos,
      e.radius,
      e.chargeDir.x * dash * dt,
      e.chargeDir.y * dash * dt,
      world.obstacles
    );
    if (hitWall || e.stateTimer <= 0) {
      if (hitWall) {
        // Sell the slam — this is the moment the player baited.
        emitWallSpark(world, e.pos, e.chargeDir);
        addShake(world, CONFIG.fx.shake.chargerSlam);
      }
      e.state = 'idle';
      e.stateTimer = c.cooldown;
    }
  }
}

// Move an enemy with wall sliding. If cover is stopping it from actually
// closing on the player, slide along the blocking face until it can get around.
//
// The subtlety is in detecting "stuck". moveCircle reports success if *either*
// axis moved, so a body walking dead-on into a flat face slides a fraction of a
// pixel sideways every frame and looks like it's making progress — while in
// fact it converges on the centre of the face and stays there forever. That was
// a hard softlock: a chaser pinned to the centre wall could not be reached, and
// since the auto-aim still locked onto it through cover, the room could never
// be cleared. Measuring progress along the *intended* direction is what catches
// it; a raw "did I move at all" test never will.
// A commitment counts as working if it converted at least this share of the
// distance it *tried* to cover into actual displacement. A body trapped in a
// pocket scores near zero here: it walks a long way and ends up where it began.
const SLIDE_EFFICIENCY = 0.5;

// Watchdog: is this body actually getting anywhere? Tracked against its own best
// approach rather than per-window, because the per-window audit is blind to a
// body that alternates between wedged and briefly-free — each window looks fine
// in isolation while the body goes nowhere for half a minute.
function trackProgress(e: Enemy, playerPos: Vec2, dt: number) {
  const d = dist(e.pos, playerPos);

  if (d < e.bestD - 1) {
    // Genuine ground gained: the body is past whatever was in its way, so the
    // next thing it wedges on is a new problem. Dropping slideDir here is what
    // makes the direction persist for exactly as long as it's needed — the next
    // wedge scores fresh, and every wedge in between resumes the same side
    // instead of re-rolling the tie and walking back the way it came.
    e.bestD = d;
    e.stuckTravel = 0;
    e.slideFails = 0;
    e.slideDir.x = 0;
    e.slideDir.y = 0;
    return;
  }

  // The player has pulled well clear — that's their movement, not this body
  // failing, so re-baseline instead of counting it as being stuck.
  if (d > e.bestD + CONFIG.enemies.stuckRebase) {
    e.bestD = d;
    e.stuckTravel = 0;
    return;
  }

  e.stuckTravel += speedOf(e) * dt;
}

function step(world: World, e: Enemy, dx: number, dy: number) {
  const fromX = e.pos.x;
  const fromY = e.pos.y;
  moveCircle(e.pos, e.radius, dx, dy, world.obstacles);

  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;

  const progress = ((e.pos.x - fromX) * dx + (e.pos.y - fromY) * dy) / len;
  if (progress >= len * 0.5) {
    endSlide(e); // closing normally — drop any wall-follow commitment
    return;
  }

  // Wedged. Pick a direction to skirt the obstacle, then hold it: at a corner
  // the two candidates score almost identically, so re-deciding every frame
  // makes the body dither in place instead of rounding the box.
  if (e.slideTimer <= 0) {
    const committed = e.slideTravel > 0;
    const netDisp = Math.hypot(e.pos.x - e.slideFrom.x, e.pos.y - e.slideFrom.y);

    const pocket = committed && netDisp < e.slideTravel * SLIDE_EFFICIENCY;
    const circling = e.stuckTravel > CONFIG.enemies.stuckTravelBudget;
    const hasDir = e.slideDir.x !== 0 || e.slideDir.y !== 0;

    if (hasDir && (pocket || circling)) {
      // This side is wrong: either the window walked without displacing the body
      // (a pocket), or it has covered half the arena without ever getting nearer
      // (circling the box). Reverse, and hold the new direction longer each time
      // it fails again, since escaping takes more room than the window that
      // trapped it.
      e.slideFails += 1;
      e.slideDir.x = -e.slideDir.x;
      e.slideDir.y = -e.slideDir.y;
      e.stuckTravel = 0; // give the new side a clean budget to prove itself
    } else if (!hasDir) {
      // No side chosen yet — the body has gained ground since it last wedged, so
      // this is a fresh obstacle. Score the two ways round and take the better.
      pickSlideDir(world, e, dx / len, dy / len);
    }
    // Otherwise: keep the current side. A long traverse along a tall face never
    // reduces distance-to-player, so any goal-distance test will call it a
    // failure for its entire duration — re-deciding here turned a 116px climb
    // into an endless up-down oscillation. Only a pocket or a full circuit is
    // evidence the side is wrong.
    // Otherwise the current direction IS converting travel into ground, so it
    // is kept. Deliberately no re-scoring here: re-scoring on a timer is what
    // produced the orbit. The probes tie against a flat face at the player's
    // own latitude, so every expiry flipped the winner — the body slid left,
    // the comparison flipped, it slid back right, forever, covering 3000px to
    // gain 70. A wall-follow only terminates if it commits to one side and
    // holds it until it either rounds the corner (progress resumes above and
    // endSlide fires) or proves that side is blind.

    e.slideFrom.x = e.pos.x;
    e.slideFrom.y = e.pos.y;
    e.slideTravel = 0;
    e.slideTimer =
      CONFIG.enemies.slideCommit *
      (1 + Math.min(e.slideFails, CONFIG.enemies.maxSlideBackoff));
  }

  e.slideTravel += len;
  moveCircle(e.pos, e.radius, e.slideDir.x * len, e.slideDir.y * len, world.obstacles);
}

// Choose which way to skirt the blocking face, given the unit direction the body
// actually wanted to travel.
function pickSlideDir(world: World, e: Enemy, ux: number, uy: number) {
  const px = -uy;
  const py = ux;
  const probe = e.radius * 2;
  const p = world.player;

  const ax = e.pos.x + px * probe;
  const ay = e.pos.y + py * probe;
  const bx = e.pos.x - px * probe;
  const by = e.pos.y - py * probe;

  const aFree = !blocked(ax, ay, e.radius, world.obstacles);
  const bFree = !blocked(bx, by, e.radius, world.obstacles);

  let useA: boolean;
  if (aFree !== bFree) useA = aFree; // only one way out — take it
  else {
    // Both open (or both shut): commit to whichever ends up nearer the player.
    const da = (ax - p.pos.x) ** 2 + (ay - p.pos.y) ** 2;
    const db = (bx - p.pos.x) ** 2 + (by - p.pos.y) ** 2;
    useA = da <= db;
  }

  e.slideDir.x = useA ? px : -px;
  e.slideDir.y = useA ? py : -py;
}

// Drop the current wall-follow commitment, so the next wedge starts from a fresh
// probe. Deliberately does NOT clear slideFails: one frame of clean movement is
// not evidence the body is unstuck, and wiping the count here is exactly what
// let an oscillating body reset its own history forever. Only real ground gained
// clears that, in trackProgress.
function endSlide(e: Enemy) {
  e.slideTimer = 0;
  e.slideTravel = 0;
}

function fireEnemyProjectile(world: World, e: Enemy, dir: { x: number; y: number }) {
  const c = CONFIG.enemies.shooter;
  world.enemyProjectiles.push({
    id: world.nextId++,
    pos: { x: e.pos.x, y: e.pos.y },
    vel: { x: dir.x * c.projectileSpeed, y: dir.y * c.projectileSpeed },
    radius: c.projectileRadius,
    damage: e.projectileDamage, // depth-scaled at spawn
    life: CONFIG.enemyProjectile.life,
    pierce: 0,
    hitIds: [],
    alive: true,
    // Enemy shots carry none of the player's build modifiers.
    bounces: 0,
    burn: 0,
    frost: 0,
    crit: false,
  });
}

// Move enemy shots, expire them, and damage the player on contact.
export function updateEnemyProjectiles(world: World, dt: number) {
  const p = world.player;
  const { bounds } = world;

  for (const pr of world.enemyProjectiles) {
    if (!pr.alive) continue;

    // Test the whole step as a segment, so a fast shot can't tunnel through
    // a thin wall between two frames.
    const from = { x: pr.pos.x, y: pr.pos.y };
    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
    pr.life -= dt;

    const off = 60;
    if (
      pr.life <= 0 ||
      pr.pos.x < -off || pr.pos.x > bounds.w + off ||
      pr.pos.y < -off || pr.pos.y > bounds.h + off
    ) {
      pr.alive = false;
      continue;
    }

    if (segmentBlocked(from, pr.pos, world.obstacles, pr.radius)) {
      pr.alive = false;
      emitWallSpark(world, pr.pos, normalize(pr.vel));
      continue;
    }

    if (dist(pr.pos, p.pos) <= pr.radius + p.radius) {
      p.hp -= pr.damage;
      if (p.hp < 0) p.hp = 0;
      pr.alive = false;
      emitHit(world, pr.pos, pr.damage, normalize(pr.vel));
      addShake(world, CONFIG.fx.shake.playerHit);
      addFlash(world, CONFIG.fx.flash.playerHit);
      sfx('playerHit');
      haptic('medium');
    }
  }

  world.enemyProjectiles = world.enemyProjectiles.filter((pr) => pr.alive);
}
