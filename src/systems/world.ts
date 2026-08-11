import { CONFIG } from '../config';
import { Enemy, EnemyKind, RoomType, World } from '../engine/types';
import { Vec2, vec } from '../engine/vec';
import { makeBoss, playBossIntro } from './boss';
import { makeShrines } from './shrine';
import { buildObstacles, resolveCircle } from './obstacles';
import { makeFx } from './fx';
import { makeStatus } from './status';
import { composeWave, enemyScale } from './difficulty';

// Build a fresh world with the player centered, then load the first room.
export function createWorld(w: number, h: number, chapter = 0, endless = false): World {
  const pc = CONFIG.player;
  const world: World = {
    player: {
      pos: vec(w / 2, h / 2),
      facing: vec(0, -1),
      radius: pc.radius,
      speed: pc.speed,
      hp: pc.maxHp,
      maxHp: pc.maxHp,
      damage: pc.damage,
      attackRate: pc.attackRate,
      range: pc.range,
      projectilesPerShot: pc.projectilesPerShot,
      spreadDeg: pc.spreadDeg,
      pierce: pc.pierce,
      // Behavioral modifiers all start at zero — a fresh run has no build yet.
      bounces: 0,
      sideShots: 0,
      rearShots: 0,
      critChance: 0,
      critMult: CONFIG.abilities.crit.mult,
      burn: 0,
      frost: 0,
      stacks: {},
      settleDelay: pc.settleDelay,
      resist: 0,
      shieldMax: 0,
      shield: 0,
      shieldTimer: 0,
      thorns: 0,
      focus: 0,
      homing: 0,
      detonate: 0,
      lifesteal: 0,
      goldBonus: 0,
      magnetBonus: 0,
      pattern: 'single',
      burstLeft: 0,
      burstTimer: 0,
      cooldown: 0,
      stillTime: 0,
      level: 1,
      xp: 0,
      xpToNext: CONFIG.progression.baseXpToNext,
    },
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    door: {
      pos: vec(w / 2, CONFIG.door.marginTop),
      width: CONFIG.door.width,
      height: CONFIG.door.height,
      open: false,
    },
    obstacles: [],
    pickups: [],
    blasts: [],
    gearFound: [],
    boss: null,
    shrines: [],
    roomIndex: 0,
    roomType: 'combat',
    chapter,
    endless,
    phase: 'fighting',
    status: 'playing',
    draftOptions: [],
    pendingDrafts: 0,
    enemiesKilled: 0,
    runGold: 0,
    fx: makeFx(),
    input: { axis: vec(0, 0), moving: false },
    bounds: { w, h },
    nextId: 1,
    time: 0,
  };

  loadRoom(world, 0);
  return world;
}

// Restart the run in place (keeps the same World reference the game loop holds).
export function resetWorld(world: World, chapter = 0, endless = false) {
  const { w, h } = world.bounds;
  Object.assign(world, createWorld(w, h, chapter, endless));
}

// Re-fit the world to a new viewport.
//
// bounds was written once at createWorld and never again, while the renderer was
// handed live dimensions — so any resize left the simulation playing on the old
// arena. Bodies spawned outside the visible canvas, the door sat off-screen, and
// restarting didn't help because resetWorld reuses bounds. Portrait lock covers
// phones but not iPad Split View, Android free-form/foldables, or web.
//
// Positions scale proportionally rather than clamping: clamping stacks every
// off-screen body onto the same edge, while scaling keeps the fight looking like
// the fight the player was already in.
export function resizeWorld(world: World, w: number, h: number) {
  const { w: ow, h: oh } = world.bounds;
  if (w <= 0 || h <= 0) return;
  if (ow === w && oh === h) return;

  const sx = w / ow;
  const sy = h / oh;
  const scale = (p: Vec2) => { p.x *= sx; p.y *= sy; };

  world.bounds = { w, h };

  scale(world.player.pos);
  for (const e of world.enemies) scale(e.pos);
  for (const p of world.projectiles) scale(p.pos);
  for (const p of world.enemyProjectiles) scale(p.pos);
  for (const p of world.pickups) scale(p.pos);
  for (const p of world.fx.particles) scale(p.pos);
  for (const n of world.fx.numbers) scale(n.pos);
  if (world.boss) scale(world.boss.pos);
  for (const s of world.shrines) scale(s.pos);

  // The door is positioned from config, not scaled — it must stay reachable and
  // centred whatever the aspect ratio does.
  world.door.pos.x = w / 2;
  world.door.pos.y = CONFIG.door.marginTop;

  // Cover is authored as fractions of the arena, so it has to be rebuilt rather
  // than scaled — a stretched layout would violate its own minimum lane widths.
  world.obstacles = buildObstacles(
    w, h, combatRoomsBefore(world.roomIndex), world.roomType !== 'combat'
  );

  // Rebuilt cover can land on top of a body, so put everything legal again.
  resolveCircle(world.player.pos, world.player.radius, world.obstacles, world.bounds);
  for (const e of world.enemies) resolveCircle(e.pos, e.radius, world.obstacles, world.bounds);
  for (const p of world.pickups) resolveCircle(p.pos, CONFIG.pickups.radius, world.obstacles, world.bounds);
  if (world.boss) resolveCircle(world.boss.pos, world.boss.radius, world.obstacles, world.bounds);
  for (const s of world.shrines) resolveCircle(s.pos, s.radius, world.obstacles, world.bounds);
}

// Create one enemy of the given archetype at a position, scaled to run depth.
export function spawnEnemy(world: World, kind: EnemyKind, x: number, y: number): Enemy {
  const c = CONFIG.enemies[kind];
  const s = enemyScale(world.roomIndex);
  const hp = Math.round(c.maxHp * s.hp);

  const e: Enemy = {
    id: world.nextId++,
    kind,
    pos: vec(x, y),
    radius: c.radius,
    hp,
    maxHp: hp,
    speed: c.speed,
    contactDamage: c.contactDamage * s.damage,
    color: c.color,
    xpReward: Math.round(c.xpReward * s.reward),
    goldReward: Math.round(c.goldReward * s.reward),
    alive: true,
    hitFlash: 0,
    attackTimer: kind === 'shooter' ? Math.random() * 1.0 : 0,
    projectileDamage:
      kind === 'shooter' ? CONFIG.enemies.shooter.projectileDamage * s.damage : 0,
    blastDamage:
      kind === 'bomber' ? CONFIG.enemies.bomber.blastDamage * s.damage : 0,
    state: 'idle',
    stateTimer: 0,
    chargeDir: vec(0, 0),
    slideDir: vec(0, 0),
    slideTimer: 0,
    slideFrom: vec(0, 0),
    slideTravel: 0,
    slideFails: 0,
    bestD: Infinity, // first frame sets the real baseline
    stuckTravel: 0,
    status: makeStatus(),
  };

  pushClearOfPlayer(e.pos, e.radius, world);
  resolveCircle(e.pos, e.radius, world.obstacles, world.bounds); // never spawn inside cover
  world.enemies.push(e);
  return e;
}

// Shove a spawn point far enough from the player to be reactable.
//
// The spawn ring's lowest point sits ~0.02*height from the player's start, so
// one enemy per room used to materialize already in contact — damage the player
// could not have avoided, on every room, on every screen size.
function pushClearOfPlayer(pos: Vec2, radius: number, world: World) {
  const p = world.player;
  const need = radius + p.radius + CONFIG.spawnClearance;

  let dx = pos.x - p.pos.x;
  let dy = pos.y - p.pos.y;
  let d = Math.hypot(dx, dy);
  if (d >= need) return;

  // Landed exactly on the player — no direction to push along, so pick one.
  if (d < 1e-6) { dx = 0; dy = -1; d = 1; }

  pos.x = p.pos.x + (dx / d) * need;
  pos.y = p.pos.y + (dy / d) * need;

  // Pushing outward can leave the arena; pull back inside before cover is
  // resolved, or resolveCircle will be handed an already-illegal position.
  const { w, h } = world.bounds;
  pos.x = Math.max(radius, Math.min(w - radius, pos.x));
  pos.y = Math.max(radius, Math.min(h - radius, pos.y));
}

// The run's rhythm: a stretch of combat, a boss, then a reward room to spend the
// win on before the next stretch starts.
export function roomTypeFor(index: number): RoomType {
  if ((index + 1) % CONFIG.bossEvery === 0) return 'boss';
  if (index > 0 && index % CONFIG.bossEvery === 0) return 'reward'; // straight after a boss
  return 'combat';
}

// Wave and cover tables are indexed by *combat* room, not by raw room index —
// counting the boss and reward rooms would permanently skip whichever table
// entries line up with them. Counted rather than derived, so it stays correct
// if the schedule above changes.
function combatRoomsBefore(index: number): number {
  let n = 0;
  for (let i = 0; i < index; i++) if (roomTypeFor(i) === 'combat') n++;
  return n;
}

// Load a room: clear leftovers, spawn its contents, reset the player position,
// and lock the door.
export function loadRoom(world: World, index: number) {
  const { w, h } = world.bounds;

  // The room being loaded IS the room we're in. This used to be the caller's
  // job, so `world.roomIndex` and the index actually loaded were kept in step by
  // convention — and everything that reads depth (difficulty scaling, drop
  // rarity, "is this the last room of the chapter") trusted the field, not the
  // argument. One caller forgetting is a run that silently plays the wrong room.
  world.roomIndex = index;

  const type = roomTypeFor(index);
  const combatIndex = combatRoomsBefore(index);

  world.enemies = [];
  world.projectiles = [];
  world.enemyProjectiles = [];
  // Equipment is never forfeited. Coins and hearts left on the floor are a real
  // choice — go back for them or move on — but walking out of a boss room a
  // second before a legendary reached you would be a story about the game
  // cheating, not a decision. Anything still lying there is claimed on the way
  // through the door.
  for (const p of world.pickups) {
    if (p.kind === 'gear' && p.gearId) world.gearFound.push(p.gearId);
  }

  world.pickups = []; // coins and hearts left behind ARE forfeit
  world.blasts = [];  // a burning fuse does not follow the player through the door
  world.boss = null;
  world.shrines = [];
  world.roomType = type;
  world.phase = 'fighting';
  world.door.open = false;
  world.fx = makeFx(); // don't carry the last room's sparks through the door

  // Cover comes first — spawn positions below are pushed out of whatever it covers.
  world.obstacles = buildObstacles(w, h, combatIndex, type !== 'combat');

  // Move the player down from the door so a fresh wave doesn't spawn on top.
  world.player.pos.x = w / 2;
  world.player.pos.y = h * 0.7;
  resolveCircle(world.player.pos, world.player.radius, world.obstacles, world.bounds);

  if (type === 'reward') {
    world.shrines = makeShrines(world, w, h);
    for (const s of world.shrines) {
      resolveCircle(s.pos, s.radius, world.obstacles, world.bounds);
    }
    return;
  }

  if (type === 'boss') {
    // One boss archetype per chapter, so the fight is the chapter's identity.
    world.boss = makeBoss(w, h, index, CONFIG.chapters[world.chapter % CONFIG.chapters.length].boss);
    playBossIntro();
    resolveCircle(world.boss.pos, world.boss.radius, world.obstacles, world.bounds);
    return;
  }

  // What this room is made of — authored for the opening, budget-composed after.
  const toSpawn = composeWave(index, combatIndex);

  toSpawn.forEach((kind, i) => {
    const angle = (i / toSpawn.length) * Math.PI * 2 - Math.PI / 2;
    const x = w / 2 + Math.cos(angle) * (w * 0.4);
    const y = h * 0.42 + Math.sin(angle) * (h * 0.26);
    spawnEnemy(world, kind, x, y);
  });
}
