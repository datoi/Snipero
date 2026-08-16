import { CONFIG } from '../config';
import { Fx, World } from '../engine/types';
import { Vec2 } from '../engine/vec';

// Cosmetic feedback: particles, floating damage numbers, screen shake, hit
// flashes. Every function here is fire-and-forget — no gameplay system reads
// any of it back, so this whole file could be deleted and the game would still
// play identically. It would just stop telling you what's happening.

export function makeFx(): Fx {
  return { particles: [], numbers: [], shake: 0, shakeX: 0, shakeY: 0, flash: 0 };
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// ── Emitters ──

interface BurstOpts {
  count: number;
  speed: readonly [number, number] | number[];
  life: number;
  size: number;
  color: string;
  /** Bias the spray into a cone around this direction; omit for a full circle. */
  dir?: Vec2;
  spread?: number; // radians of cone half-width
  round?: boolean;
}

function burst(world: World, at: Vec2, o: BurstOpts) {
  const f = world.fx;
  const base = o.dir ? Math.atan2(o.dir.y, o.dir.x) : 0;
  const half = o.spread ?? Math.PI;

  for (let i = 0; i < o.count; i++) {
    const a = o.dir ? base + rand(-half, half) : rand(0, Math.PI * 2);
    const sp = rand(o.speed[0], o.speed[1]);
    const life = o.life * rand(0.75, 1.25);
    f.particles.push({
      id: world.nextId++,
      pos: { x: at.x, y: at.y },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
      life,
      maxLife: life,
      size: o.size * rand(0.8, 1.4),
      color: o.color,
      round: o.round ?? true,
    });
  }

  // Cap the pool so a chaotic boss phase can't spiral into hundreds of Views.
  const over = f.particles.length - CONFIG.fx.maxParticles;
  if (over > 0) f.particles.splice(0, over);
}

// A shot landing: sparks kicked back along the incoming direction, plus the number.
// `color` overrides the default tint (crits, elemental hits).
export function emitHit(
  world: World, at: Vec2, amount: number, dir?: Vec2, boss = false, color?: string
) {
  const c = CONFIG.fx;
  burst(world, at, {
    ...c.hitSpark,
    // Spray back toward the shooter rather than straight through the target.
    dir: dir ? { x: -dir.x, y: -dir.y } : undefined,
    spread: 1.1,
  });
  emitNumber(world, at, amount, color ?? (boss ? c.number.bossColor : c.number.color));
}

export function emitNumber(world: World, at: Vec2, amount: number, color = CONFIG.fx.number.color) {
  const n = CONFIG.fx.number;
  const f = world.fx;
  // Bigger hits read bigger — scaled off the base damage, then capped.
  const size = Math.min(n.maxSize, n.size * (0.85 + amount / CONFIG.player.damage / 3));

  f.numbers.push({
    id: world.nextId++,
    pos: { x: at.x + rand(-8, 8), y: at.y - 6 },
    vel: { x: rand(-n.drift, n.drift), y: -n.riseSpeed },
    life: n.life,
    maxLife: n.life,
    amount: Math.max(1, Math.round(amount)),
    size,
    color,
  });

  // Same policy as particles: drop the oldest. In a burst the newest numbers are
  // the ones still worth reading, and the oldest are already half faded.
  const over = f.numbers.length - CONFIG.fx.maxNumbers;
  if (over > 0) f.numbers.splice(0, over);
}

// Something died: a full-circle burst in its own color, plus a nudge of shake.
export function emitDeath(world: World, at: Vec2, color: string, shake = CONFIG.fx.shake.enemyDeath) {
  burst(world, at, { ...CONFIG.fx.death, color });
  addShake(world, shake);
}

// A shot eaten by cover. `dir` is the shot's travel direction, so sparks bounce back.
export function emitWallSpark(world: World, at: Vec2, dir: Vec2) {
  burst(world, at, {
    ...CONFIG.fx.wallSpark,
    dir: { x: -dir.x, y: -dir.y },
    spread: 1.0,
    round: false, // chips of stone, not sparks
  });
}

export function emitMuzzle(world: World, at: Vec2, dir: Vec2) {
  burst(world, at, { ...CONFIG.fx.muzzle, dir, spread: 0.35 });
}

export function addShake(world: World, mag: number) {
  const f = world.fx;
  f.shake = Math.min(CONFIG.fx.shake.max, f.shake + mag);
}

// Shake for something that can happen several times in the same instant.
//
// Explosions are the case: a boss drops five bombs, and Detonate leaves one
// behind every kill, so a good volley into a pack fires a whole cluster within
// a frame or two. Adding each one pinned the screen to the maximum and held it
// there — the reason a single blast felt like an earthquake was not its own
// magnitude, it was four more arriving underneath it.
//
// Loudest wins instead of summing, so a cluster shakes like one explosion
// rather than like all of them.
export function shakeAtMost(world: World, mag: number) {
  const f = world.fx;
  if (mag > f.shake) f.shake = Math.min(CONFIG.fx.shake.max, mag);
}

export function addFlash(world: World, amount: number) {
  const f = world.fx;
  if (amount > f.flash) f.flash = amount; // strongest hit wins; don't stack to solid red
}

// ── Per-frame ──

export function updateFx(world: World, dt: number) {
  const f = world.fx;
  const c = CONFIG.fx;

  const drag = Math.exp(-c.particleDrag * dt);
  for (const p of f.particles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= drag;
    p.vel.y *= drag;
    p.life -= dt;
  }
  if (f.particles.length) f.particles = f.particles.filter((p) => p.life > 0);

  for (const n of f.numbers) {
    n.pos.x += n.vel.x * dt;
    n.pos.y += n.vel.y * dt;
    n.vel.y += c.number.gravity * dt; // decelerate the rise, then ease back down
    n.life -= dt;
  }
  if (f.numbers.length) f.numbers = f.numbers.filter((n) => n.life > 0);

  // Shake decays linearly and re-randomizes the offset each frame.
  if (f.shake > 0) {
    f.shake = Math.max(0, f.shake - c.shake.decay * dt);
    f.shakeX = rand(-f.shake, f.shake);
    f.shakeY = rand(-f.shake, f.shake);
  } else {
    f.shakeX = 0;
    f.shakeY = 0;
  }

  if (f.flash > 0) f.flash = Math.max(0, f.flash - c.flash.decay * dt);

  // Tick down the white flash on anything that was struck.
  for (const e of world.enemies) if (e.hitFlash > 0) e.hitFlash -= dt;
  if (world.boss && world.boss.hitFlash > 0) world.boss.hitFlash -= dt;
}

// Mark a body as just-struck. Kept here so callers don't reach for the constant.
export function flashHit(target: { hitFlash: number }) {
  target.hitFlash = CONFIG.fx.hitFlashTime;
}
