import { CONFIG } from '../config';
import { Boss, World } from '../engine/types';
import { dist, normalize, rotate, sub, vec } from '../engine/vec';
import { confine, moveCircle } from './obstacles';
import { spawnBlast } from './blastSpawn';
import { addShake, emitWallSpark } from './fx';
import { damagePlayer } from './playerDamage';
import { makeStatus, slowFactor } from './status';
import { bossScale } from './difficulty';
import { haptic, sfx } from './sfx';

// Create a boss for a boss room, scaled to how many bosses came before it.
export function makeBoss(w: number, h: number, roomIndex: number, variant = 0): Boss {
  const c = CONFIG.boss;
  const v = c.variants[variant % c.variants.length];
  const s = bossScale(roomIndex);
  const hp = Math.round(c.maxHp * s.hp * v.hpMult);
  return {
    pos: vec(w / 2, h * 0.25),
    radius: c.radius,
    hp,
    maxHp: hp,
    contactDamage: c.contactDamage * s.damage * v.damageMult,
    dmgMult: s.damage * v.damageMult,
    variant: variant % c.variants.length,
    phase: 0,
    state: 'intro',
    stateTimer: c.introTime,
    currentAttack: null,
    atkTimer: 0,
    atkShotsLeft: 0,
    chargeDir: vec(0, 0),
    hitFlash: 0,
    alive: true,
    status: makeStatus(),
  };
}

// Which fight this boss is running. Exported so the renderer can tint it and the
// HUD can name it without either reaching into the config table itself.
export function bossVariant(b: Boss) {
  const vs = CONFIG.boss.variants;
  return vs[b.variant % vs.length];
}

export function bossPhases(b: Boss) {
  return bossVariant(b).phases;
}

// Announce the boss the moment the room loads, while the intro telegraph plays.
export function playBossIntro() {
  sfx('bossIntro');
  haptic('heavy');
}

// Boss state machine: intro → idle(reposition) → windup(telegraph) →
// attacking → recover → idle … with phases that escalate as HP drops.
export function updateBoss(world: World, dt: number) {
  const b = world.boss;
  if (!b || !b.alive) return;
  const c = CONFIG.boss;
  const p = world.player;

  // Update phase from current HP fraction (only ever deepens).
  const frac = b.hp / b.maxHp;
  let target = 0;
  const phases = bossPhases(b);
  for (let i = 0; i < phases.length; i++) if (frac <= phases[i].threshold) target = i;
  b.phase = target;
  const phase = phases[b.phase];

  b.stateTimer -= dt;

  switch (b.state) {
    case 'intro':
      if (b.stateTimer <= 0) toIdle(b, phase.gapTime);
      break;

    case 'idle':
      reposition(b, world, c.moveSpeed * phase.speedMult * slowFactor(b.status), dt);
      if (b.stateTimer <= 0) startWindup(b, phase.attacks);
      break;

    case 'windup':
      // stand and telegraph; the attack fires when the windup ends
      if (b.stateTimer <= 0) beginAttack(world, b);
      break;

    case 'attacking':
      runAttack(world, b, dt);
      break;

    case 'recover':
      if (b.stateTimer <= 0) toIdle(b, phase.gapTime);
      break;
  }

  // Keep on screen and out of cover.
  confine(b.pos, b.radius, world);

  // Contact damage.
  if (dist(b.pos, p.pos) <= b.radius + p.radius) {
    damagePlayer(world, b.contactDamage * dt, { continuous: true });
  }
}

function toIdle(b: Boss, gap: number) {
  b.state = 'idle';
  b.stateTimer = gap;
  b.currentAttack = null;
}

// Hold a preferred distance from the player between attacks.
function reposition(b: Boss, world: World, speed: number, dt: number) {
  const p = world.player;
  const d = dist(b.pos, p.pos);
  const dir = normalize(sub(p.pos, b.pos));
  const pref = CONFIG.boss.preferredRange;
  if (d > pref + 30) {
    moveCircle(b.pos, b.radius, dir.x * speed * dt, dir.y * speed * dt, world.obstacles);
  } else if (d < pref - 30) {
    moveCircle(b.pos, b.radius, -dir.x * speed * dt, -dir.y * speed * dt, world.obstacles);
  }
}

function startWindup(b: Boss, attacks: Boss['currentAttack'][] | readonly string[]) {
  const c = CONFIG.boss;
  const atk = attacks[Math.floor(Math.random() * attacks.length)] as Boss['currentAttack'];
  b.currentAttack = atk;
  const telegraph =
    atk === 'radial' ? c.radial.telegraph
    : atk === 'volley' ? c.volley.telegraph
    : atk === 'bombs' ? c.bombs.telegraph
    : c.charge.telegraph;
  b.state = 'windup';
  b.stateTimer = telegraph;
  sfx('telegraph');
}

// Fire the telegraphed attack once the windup completes.
function beginAttack(world: World, b: Boss) {
  const c = CONFIG.boss;

  if (b.currentAttack === 'bombs') {
    // Seed the floor with delayed detonations around the player rather than at
    // them. Every other boss attack asks "can you dodge this?"; this one asks
    // "where will you be in a second?", which is a different question and the
    // reason the fight stops being one pattern read four times.
    const bc = c.bombs;
    const p = world.player;
    for (let i = 0; i < bc.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * bc.scatter;
      spawnBlast(
        world,
        { x: p.pos.x + Math.cos(a) * dist, y: p.pos.y + Math.sin(a) * dist },
        bc.radius,
        bc.damage * b.dmgMult,
        bc.fuse + i * bc.stagger,
      );
    }
    b.state = 'recover';
    b.stateTimer = c.recover;
  } else if (b.currentAttack === 'radial') {
    const rc = c.radial;
    for (let i = 0; i < rc.count; i++) {
      const dir = rotate(vec(0, -1), (i / rc.count) * Math.PI * 2);
      pushBossShot(world, b, dir, rc.projSpeed, rc.damage, rc.projRadius);
    }
    addShake(world, CONFIG.fx.shake.bossRadial); // the telegraph pays off
    b.state = 'recover';
    b.stateTimer = c.recover;
  } else if (b.currentAttack === 'volley') {
    b.state = 'attacking';
    b.atkShotsLeft = c.volley.shots;
    b.atkTimer = 0; // fire first shot immediately
  } else {
    // charge: lock direction at the player and dash
    b.chargeDir = normalize(sub(world.player.pos, b.pos));
    b.state = 'attacking';
    b.atkTimer = c.charge.duration;
  }
}

function runAttack(world: World, b: Boss, dt: number) {
  const c = CONFIG.boss;

  if (b.currentAttack === 'volley') {
    b.atkTimer -= dt;
    if (b.atkTimer <= 0 && b.atkShotsLeft > 0) {
      const dir = normalize(sub(world.player.pos, b.pos));
      pushBossShot(world, b, dir, c.volley.projSpeed, c.volley.damage, c.volley.projRadius);
      b.atkShotsLeft -= 1;
      b.atkTimer = c.volley.interval;
      if (b.atkShotsLeft <= 0) {
        b.state = 'recover';
        b.stateTimer = c.recover;
      }
    }
  } else if (b.currentAttack === 'charge') {
    // Slamming into one of the arena pillars ends the dash early and drops the
    // boss straight into recovery — the window to punish it.
    const dash = c.charge.speed * slowFactor(b.status);
    const hitWall = moveCircle(
      b.pos,
      b.radius,
      b.chargeDir.x * dash * dt,
      b.chargeDir.y * dash * dt,
      world.obstacles
    );
    b.atkTimer -= dt;
    if (hitWall || b.atkTimer <= 0) {
      if (hitWall) {
        emitWallSpark(world, b.pos, b.chargeDir);
        addShake(world, CONFIG.fx.shake.bossSlam);
      }
      b.state = 'recover';
      b.stateTimer = c.charge.recover;
    }
  } else {
    b.state = 'recover';
    b.stateTimer = c.recover;
  }
}

// Boss shots reuse the enemy-projectile system (orange dots that damage the player).
function pushBossShot(
  world: World,
  b: Boss,
  dir: { x: number; y: number },
  speed: number,
  damage: number,
  radius: number
) {
  world.enemyProjectiles.push({
    id: world.nextId++,
    pos: { x: b.pos.x, y: b.pos.y },
    vel: { x: dir.x * speed, y: dir.y * speed },
    radius,
    damage: damage * b.dmgMult,
    life: CONFIG.enemyProjectile.life,
    pierce: 0,
    hitIds: [],
    alive: true,
    // Boss shots carry none of the player's build modifiers.
    bounces: 0,
    burn: 0,
    frost: 0,
    crit: false,
    homing: 0,
  });
}
