import { CONFIG } from '../config';
import { Enemy, EnemyKind, RoomType, World } from '../engine/types';
import { Vec2, vec } from '../engine/vec';
import { makeBoss, playBossIntro } from './boss';
import { makeChest } from './chest';
import { buildObstacles, resolveCircle } from './obstacles';
import { makeFx } from './fx';
import { makeStatus } from './status';
import { enemyScale } from './difficulty';

// Build a fresh world with the player centered, then load the first room.
export function createWorld(w: number, h: number): World {
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
    boss: null,
    chest: null,
    roomIndex: 0,
    roomType: 'combat',
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
export function resetWorld(world: World) {
  const { w, h } = world.bounds;
  Object.assign(world, createWorld(w, h));
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

// The run's rhythm: a stretch of combat, a boss, then a chest room to spend the
// win on before the next stretch starts.
export function roomTypeFor(index: number): RoomType {
  if ((index + 1) % CONFIG.bossEvery === 0) return 'boss';
  if (index > 0 && index % CONFIG.bossEvery === 0) return 'chest'; // straight after a boss
  return 'combat';
}

// Wave and cover tables are indexed by *combat* room, not by raw room index —
// counting the boss and chest rooms would permanently skip whichever table
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
  const rooms = CONFIG.rooms;

  const type = roomTypeFor(index);
  const combatIndex = combatRoomsBefore(index);
  const spec = rooms[combatIndex % rooms.length]; // loop waves once past the last

  world.enemies = [];
  world.projectiles = [];
  world.enemyProjectiles = [];
  world.pickups = []; // anything not collected before the door is forfeit
  world.boss = null;
  world.chest = null;
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

  if (type === 'chest') {
    world.chest = makeChest(w, h);
    resolveCircle(world.chest.pos, world.chest.radius, world.obstacles, world.bounds);
    return;
  }

  if (type === 'boss') {
    world.boss = makeBoss(w, h, index);
    playBossIntro();
    resolveCircle(world.boss.pos, world.boss.radius, world.obstacles, world.bounds);
    return;
  }

  // Flatten {kind,count} into a spawn list and place them in a ring.
  const toSpawn: EnemyKind[] = [];
  for (const entry of spec) {
    for (let i = 0; i < entry.count; i++) toSpawn.push(entry.kind);
  }

  // Thicken the wave with depth. Drawn from the room's own composition so the
  // extras reinforce whatever that room is about rather than diluting it.
  const d = CONFIG.difficulty;
  const extras = Math.min(d.maxExtraEnemies, Math.floor(index / d.extraEnemyEveryRooms));
  for (let i = 0; i < extras; i++) toSpawn.push(spec[i % spec.length].kind);

  toSpawn.forEach((kind, i) => {
    const angle = (i / toSpawn.length) * Math.PI * 2 - Math.PI / 2;
    const x = w / 2 + Math.cos(angle) * (w * 0.4);
    const y = h * 0.42 + Math.sin(angle) * (h * 0.26);
    spawnEnemy(world, kind, x, y);
  });
}
