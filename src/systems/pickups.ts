import { CONFIG } from '../config';
import { Pickup, PickupKind, World } from '../engine/types';
import { Vec2, dist, normalize, sub } from '../engine/vec';
import { emitNumber } from './fx';
import { resolveCircle } from './obstacles';
import { sfx } from './sfx';

// Loot on the floor. Drops pop outward from the kill, settle, then home in once
// the player gets close enough. Nothing here blocks on cover — a coin sliding
// over a rock reads fine, and making loot pathfind would be all cost, no payoff.

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function push(world: World, kind: PickupKind, at: Vec2, value: number) {
  const c = CONFIG.pickups;
  const a = rand(0, Math.PI * 2);
  const sp = rand(c.popSpeed[0], c.popSpeed[1]);

  const p: Pickup = {
    id: world.nextId++,
    kind,
    pos: { x: at.x, y: at.y },
    vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
    value,
    life: c.life,
    magnet: false,
    bob: rand(0, Math.PI * 2),
  };
  // Never drop loot inside a rock — it would be unreachable.
  resolveCircle(p.pos, c.radius, world.obstacles, world.bounds);
  world.pickups.push(p);
}

// Split a gold reward across n coins. The remainder is spread one-per-coin
// rather than dropped, so what the coins are worth always sums to exactly the
// reward — no gold quietly evaporating into integer division.
function dropCoins(world: World, at: Vec2, gold: number, n: number) {
  if (gold <= 0 || n <= 0) return;
  const each = Math.floor(gold / n);
  let rem = gold - each * n;

  for (let i = 0; i < n; i++) {
    const v = each + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    if (v > 0) push(world, 'coin', at, v);
  }
}

// A normal kill: a small shower of coins, and sometimes a heart.
export function dropLoot(world: World, at: Vec2, gold: number) {
  const c = CONFIG.pickups;
  const n = Math.min(
    c.maxCoinsPerDrop,
    Math.max(1, Math.round(rand(c.coinsPerDrop[0], c.coinsPerDrop[1])))
  );
  dropCoins(world, at, gold, n);

  if (Math.random() < c.heartChance) push(world, 'heart', at, c.heartHeal);
}

// The boss pays out properly: a pile of gold and guaranteed healing, since the
// next room starts immediately after.
export function dropBossLoot(world: World, at: Vec2, gold: number) {
  const c = CONFIG.pickups;
  dropCoins(world, at, gold, c.bossCoins);
  for (let i = 0; i < c.bossHearts; i++) push(world, 'heart', at, c.bossHeartHeal);
}

// A chest's contents. Same shape as the boss payout, but the caller sets the
// terms since chest rewards are tuned separately from combat rewards.
export function dropChestLoot(
  world: World,
  at: Vec2,
  gold: number,
  hearts: number,
  heartHeal: number
) {
  dropCoins(world, at, gold, CONFIG.pickups.bossCoins);
  for (let i = 0; i < hearts; i++) push(world, 'heart', at, heartHeal);
}

// Sweep everything still on the floor toward the player. Called the moment a
// room is cleared, so nobody has to comb an empty arena for one stray coin.
export function vacuumPickups(world: World) {
  for (const p of world.pickups) p.magnet = true;
}

export function updatePickups(world: World, dt: number) {
  const c = CONFIG.pickups;
  const player = world.player;
  if (world.pickups.length === 0) return;

  const drag = Math.exp(-c.drag * dt);

  for (const p of world.pickups) {
    p.life -= dt;
    p.bob += c.bobSpeed * dt;

    const d = dist(p.pos, player.pos);
    const canClaim = claimable(world, p);

    // Latching is one-way: once loot has noticed you it keeps coming, even if
    // you step back out of range. Losing a coin you already earned feels bad.
    // An unusable heart doesn't latch at all — it should read as still sitting
    // there waiting, not as something that chased you down and did nothing.
    if (!p.magnet && canClaim && d <= c.magnetRadius) p.magnet = true;

    if (p.magnet) {
      const dir = normalize(sub(player.pos, p.pos));
      // Ease into full homing speed so the latch doesn't look like a teleport.
      const t = Math.min(1, c.magnetAccel * dt);
      p.vel.x += (dir.x * c.magnetSpeed - p.vel.x) * t;
      p.vel.y += (dir.y * c.magnetSpeed - p.vel.y) * t;
    } else {
      p.vel.x *= drag;
      p.vel.y *= drag;
    }

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;

    if (canClaim && d <= c.collectRadius) collect(world, p);
  }

  world.pickups = world.pickups.filter((p) => p.life > 0);
}

// Is this worth anything to the player right now? Hearts are the only in-run
// healing there is, and walking over one at full HP used to silently destroy it
// for zero benefit — no number, no sound, no way to leave it for later. Leaving
// it on the floor turns a punishment for being healthy into a resource you get
// to come back for.
function claimable(world: World, p: Pickup): boolean {
  if (p.kind !== 'heart') return true;
  return world.player.hp < world.player.maxHp;
}

function collect(world: World, p: Pickup) {
  p.life = 0; // marked spent; filtered out at the end of the tick

  if (p.kind === 'coin') {
    world.runGold += p.value;
    sfx('coin');
    emitNumber(world, p.pos, p.value, CONFIG.fx.number.goldColor);
    return;
  }

  // Heart: `claimable` guarantees there is at least 1 HP of room, so the clamp
  // here only trims the overheal rather than ever zeroing the whole pickup.
  const player = world.player;
  const healed = Math.min(p.value, player.maxHp - player.hp);
  player.hp += healed;
  sfx('heart');
  emitNumber(world, p.pos, healed, CONFIG.fx.number.healColor);
}
