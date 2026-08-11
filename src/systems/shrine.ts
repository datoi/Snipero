import { CONFIG } from '../config';
import { Shrine, ShrineId, World } from '../engine/types';
import { dist, vec } from '../engine/vec';
import { addShake, emitDeath, emitNumber } from './fx';
import { dropChestLoot } from './pickups';
import { enterDraft } from './progression';
import { haptic, sfx } from './sfx';

// Reward rooms: no enemies, three offers, one pick.
//
// This slot used to hold a single chest, which made the room a corridor with a
// prize at the end — you walked over it, took the only thing there, and left.
// Three offers turn the same room into the run's other decision point: the
// draft asks "how do I want to fight?", this asks "what am I short of?".
//
// The offers are deliberately not comparable on one axis. Gold, health, and
// cards are three different currencies, and which one is worth most depends
// entirely on the state you walked in with — which is what makes the choice
// interesting rather than a strictly-ordered list.

interface ShrineDef {
  id: ShrineId;
  title: string;
  color: string;
  goldCost?: number;
  hpCostFrac?: number;
  /** Offers the player cannot use are never rolled — a dead option isn't a choice. */
  usable?: (world: World) => boolean;
  claim: (world: World, s: Shrine) => void;
}

const SHRINES: ShrineDef[] = [
  {
    id: 'chest',
    title: 'Chest',
    color: '#e0a92c',
    claim: (world, s) => {
      const c = CONFIG.chest;
      dropChestLoot(world, s.pos, c.gold, c.hearts, c.heartHeal);
    },
  },
  {
    id: 'angel',
    title: 'Blessing',
    color: '#8fd0ff',
    claim: (world) => queueCards(world, 1),
  },
  {
    id: 'devil',
    title: 'Pact',
    color: '#c0392b',
    hpCostFrac: CONFIG.shrine.devilHpCost,
    // Only offered when the cost is survivable. A pact that kills you the moment
    // you take it isn't a risk, it's a trap.
    usable: (world) =>
      world.player.hp > world.player.maxHp * CONFIG.shrine.devilHpCost * 1.5,
    claim: (world) => queueCards(world, CONFIG.shrine.devilCards),
  },
  {
    id: 'font',
    title: 'Font',
    color: '#4ade80',
    // Pointless at full health, so it doesn't take a slot from something useful.
    usable: (world) => world.player.hp < world.player.maxHp * 0.95,
    claim: (world, s) => {
      const p = world.player;
      const healed = p.maxHp - p.hp;
      p.hp = p.maxHp;
      emitNumber(world, s.pos, healed, CONFIG.fx.number.healColor);
      sfx('heart');
    },
  },
  {
    id: 'forge',
    title: 'Forge',
    color: '#f0a93c',
    goldCost: CONFIG.shrine.forgeCost,
    // Gives the gold on the floor a use before the run is over, which is the
    // only thing that makes collecting it mid-fight a real decision.
    usable: (world) => world.runGold >= CONFIG.shrine.forgeCost,
    claim: (world) => queueCards(world, 1),
  },
];

function queueCards(world: World, n: number) {
  world.pendingDrafts += n;
  if (world.status === 'playing') enterDraft(world);
}

export function getShrine(id: ShrineId): ShrineDef {
  return SHRINES.find((s) => s.id === id)!;
}

// Roll the room's offers. Always three, always distinct, never one the player
// cannot act on.
export function makeShrines(world: World, w: number, h: number): Shrine[] {
  const pool = SHRINES.filter((d) => !d.usable || d.usable(world));

  // Shuffle, then take the first three. `chest` is a guaranteed fallback because
  // it has no `usable` guard, so the pool can never be empty.
  const picked = pool.slice();
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  const chosen = picked.slice(0, Math.min(CONFIG.shrine.count, picked.length));

  const c = CONFIG.shrine;
  const gap = w / (chosen.length + 1);

  return chosen.map((d, i) => ({
    id: world.nextId++,
    kind: d.id,
    pos: vec(gap * (i + 1), h * c.y),
    radius: c.radius,
    goldCost: d.goldCost ?? 0,
    hpCostFrac: d.hpCostFrac ?? 0,
    claimed: false,
    openTimer: 0,
    paid: false,
    dissolving: false,
  }));
}

export function shrinesResolved(world: World): boolean {
  return world.shrines.length === 0 || world.shrines.some((s) => s.paid);
}

export function updateShrines(world: World, dt: number) {
  if (world.shrines.length === 0) return;

  const taken = world.shrines.find((s) => s.claimed);

  if (!taken) {
    const reach = CONFIG.shrine.radius + world.player.radius + CONFIG.shrine.openRange;
    for (const s of world.shrines) {
      if (dist(s.pos, world.player.pos) > reach) continue;
      if (s.goldCost > world.runGold) continue; // can't afford it; walk on by

      s.claimed = true;
      s.openTimer = CONFIG.shrine.openTime;
      for (const other of world.shrines) if (other !== s) other.dissolving = true;

      sfx('chestOpen');
      haptic('light');
      addShake(world, 4);
      emitDeath(world, s.pos, shrineColor(s.kind), 0);
      break;
    }
    return;
  }

  // Claimed: hold for a beat so the pick registers, then pay out exactly once.
  if (taken.paid) return;
  taken.openTimer -= dt;
  if (taken.openTimer > 0) return;

  taken.paid = true;

  // Charge before granting. A pact that hands over the cards and then kills you
  // still leaves you holding the cards, which is not what "pact" means.
  if (taken.goldCost > 0) world.runGold -= taken.goldCost;
  if (taken.hpCostFrac > 0) {
    const p = world.player;
    const cost = Math.round(p.maxHp * taken.hpCostFrac);
    // Costs MAX health, not current — the price stays paid for the whole run
    // rather than being undone by the next heart.
    p.maxHp = Math.max(CONFIG.shrine.minMaxHp, p.maxHp - cost);
    p.hp = Math.min(p.hp, p.maxHp);
    emitNumber(world, p.pos, cost, '#ff5a5a');
  }

  getShrine(taken.kind).claim(world, taken);
}

export function shrineColor(kind: ShrineId): string {
  return getShrine(kind).color;
}

export function shrineTitle(kind: ShrineId): string {
  return getShrine(kind).title;
}
