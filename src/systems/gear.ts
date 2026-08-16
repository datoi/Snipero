import { CONFIG } from '../config';
import { Player, ShotPattern } from '../engine/types';
// Type-only, so the loadout table can name a pose and an icon without dragging
// the renderer's `require` table into the simulation's module graph.
import type { Pose, WeaponIcon } from '../render/sprites';

// Equipment: the between-runs progression that gives a finished run a point.
//
// Three slots, because three is enough to make a loadout a decision without
// making the menu a spreadsheet: a WEAPON that changes how you shoot, ARMOUR
// that changes how long you last, and a RING that pushes one stat hard.
//
// The weapon is the important one. Armour and rings move numbers; a weapon
// changes the moment-to-moment feel of every single shot, which is the
// difference between "my character got stronger" and "I'm playing differently
// this run". Everything else here exists to give the weapon a home.
//
// ── A note on the ids ──────────────────────────────────────────────────────
// They read fantasy — `bow`, `staff`, `scythe` — because that is what these
// weapons were before the game had art, and a GearId is what a save file stores.
// Renaming them would hand every existing player a wiped loadout in exchange for
// tidier source, which is a bad trade. The titles and the sprites are what the
// player sees, and those say what the hero is actually holding.

export type GearSlot = 'weapon' | 'armor' | 'ring';
export type GearRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type GearId =
  // weapons
  | 'bow' | 'staff' | 'scythe' | 'crossbow'
  // armor
  | 'tunic' | 'plate' | 'cloak'
  // rings
  | 'ringPower' | 'ringFocus' | 'ringHaste';

// What an item does at power 1.0. Multipliers are relative to the base player;
// flat values are added. Anything omitted is simply not touched by that item,
// which keeps each definition to the lines that matter.
export interface GearStats {
  damageMult?: number;
  attackRateMult?: number;
  rangeMult?: number;
  speedMult?: number;
  maxHpAdd?: number;
  resistAdd?: number;     // fraction of incoming damage ignored
  critChanceAdd?: number;
  pierceAdd?: number;
  projectilesAdd?: number;
  spreadDeg?: number;     // weapons only: overrides the fan width
  pattern?: ShotPattern;  // weapons only
}

export interface GearDef {
  id: GearId;
  slot: GearSlot;
  title: string;
  desc: string;
  color: string;
  rarity: GearRarity;
  /** Owned from the start — every slot needs one so a run is never unarmed. */
  starter?: boolean;
  stats: GearStats;

  /**
   * Weapons only: how the hero holds it, and the loose sprite for the menu.
   *
   * The pose is doing real work, not decoration. A weapon that changes your
   * range and your rate but leaves the hero looking identical makes the loadout
   * screen the only place the choice is visible; a different silhouette in your
   * hands means you can tell what you equipped while you are playing.
   */
  pose?: Pose;
  icon?: WeaponIcon;
}

// Rarity is a power band AND a price band. It is deliberately not a
// strictly-better ladder: the scythe trades most of its range away, and the
// crossbow trades safety for burst, so a legendary is a different problem to
// solve rather than an automatic replacement.
const RARITY_POWER: Record<GearRarity, number> = {
  common: 1,
  rare: 1.18,
  epic: 1.4,
  legendary: 1.7,
};

const RARITY_UNLOCK: Record<GearRarity, number> = {
  common: 0,
  rare: 320,
  epic: 900,
  legendary: 2200,
};

export const GEAR_RARITY_COLOR: Record<GearRarity, string> = {
  common: '#8b93a7',
  rare: '#4c9aff',
  epic: '#c05cf0',
  legendary: '#ffa93c',
};

export const GEAR: GearDef[] = [
  // ── Weapons ──
  //
  // Each one gets a different pose, so the four of them are four distinct
  // silhouettes on the field: hands forward, long barrel, bulky two-handed,
  // one-handed sidearm.
  {
    id: 'bow', slot: 'weapon', rarity: 'common', starter: true,
    title: 'Service Pistol', desc: 'Balanced. One round, no surprises.',
    color: '#9ad14f',
    pose: 'gun', icon: 'pistol',
    stats: { pattern: 'single', damageMult: 1.15 },
  },
  {
    id: 'staff', slot: 'weapon', rarity: 'rare',
    title: 'Marksman Rifle', desc: 'Slow, heavy rounds that pass through a body.',
    color: '#7c6cf0',
    pose: 'silencer', icon: 'silenced',
    stats: {
      pattern: 'single',
      damageMult: 1.9, attackRateMult: 0.62, rangeMult: 1.1, pierceAdd: 1,
    },
  },
  {
    id: 'scythe', slot: 'weapon', rarity: 'epic',
    title: 'Scattergun', desc: 'A short, wide spray. Lethal up close, blind at range.',
    color: '#e0457b',
    pose: 'hold', icon: 'rifle',
    stats: {
      pattern: 'arc',
      // Three projectiles per shot at half the reach, fired slowly. The volume
      // is the payoff; the range and the rate are the price. Damage per pellet
      // stays ordinary so it doesn't also win the trade it's meant to lose.
      damageMult: 1.15, projectilesAdd: 2, spreadDeg: 30,
      rangeMult: 0.5, attackRateMult: 0.42,
    },
  },
  {
    id: 'crossbow', slot: 'weapon', rarity: 'legendary',
    title: 'Repeater', desc: 'Three rounds in a burst, then a long reload.',
    color: '#f0a93c',
    pose: 'machine', icon: 'rifle',
    stats: {
      pattern: 'burst',
      // Burst DPS is (shots x damage x rate). Tuned a little above the pistol,
      // and paid for in exposure: the whole burst needs you standing still, so
      // the reload is where a bomber gets to reach you.
      damageMult: 1.25, attackRateMult: 0.34,
    },
  },

  // ── Armour ──
  {
    id: 'tunic', slot: 'armor', rarity: 'common', starter: true,
    title: 'Field Vest', desc: '+30 max HP.',
    color: '#b98a55',
    stats: { maxHpAdd: 30 },
  },
  {
    id: 'plate', slot: 'armor', rarity: 'epic',
    title: 'Riot Plate', desc: '+70 max HP, ignore 12% of damage. Heavy.',
    color: '#9fb3c8',
    stats: { maxHpAdd: 70, resistAdd: 0.12, speedMult: 0.94 },
  },
  {
    id: 'cloak', slot: 'armor', rarity: 'rare',
    title: 'Scout Rig', desc: '+20 max HP and noticeably quicker.',
    color: '#4fd1c5',
    stats: { maxHpAdd: 20, speedMult: 1.12 },
  },

  // ── Rings ──
  {
    id: 'ringPower', slot: 'ring', rarity: 'common', starter: true,
    title: 'Power Cell', desc: '+12% damage.',
    color: '#ef4444',
    stats: { damageMult: 1.12 },
  },
  {
    id: 'ringFocus', slot: 'ring', rarity: 'epic',
    title: 'Targeting Chip', desc: '+18% crit chance and a longer reach.',
    color: '#ffe066',
    stats: { critChanceAdd: 0.18, rangeMult: 1.15 },
  },
  {
    id: 'ringHaste', slot: 'ring', rarity: 'rare',
    title: 'Quickdraw Rig', desc: '+15% fire rate.',
    color: '#f59e0b',
    stats: { attackRateMult: 1.15 },
  },
];

export function getGear(id: GearId): GearDef {
  return GEAR.find((g) => g.id === id)!;
}

export function gearForSlot(slot: GearSlot): GearDef[] {
  return GEAR.filter((g) => g.slot === slot);
}

export const STARTER_GEAR: Record<GearSlot, GearId> = {
  weapon: 'bow',
  armor: 'tunic',
  ring: 'ringPower',
};

// ── Levels and cost ──

export const MAX_GEAR_LEVEL = 10;

// An item's strength: its rarity band, widened by the levels put into it.
// Levelling a common past a fresh epic is deliberately possible — it gives gold
// somewhere to go on the loadout you already like, instead of forcing a swap.
export function gearPower(rarity: GearRarity, level: number): number {
  return RARITY_POWER[rarity] * (1 + CONFIG.gear.powerPerLevel * level);
}

export function unlockCost(def: GearDef): number {
  return RARITY_UNLOCK[def.rarity];
}

// Rising cost per level, scaled by rarity so a legendary is a long-term project.
export function upgradeCost(def: GearDef, level: number): number {
  const c = CONFIG.gear;
  return Math.round(
    c.baseUpgradeCost * RARITY_POWER[def.rarity] * Math.pow(c.upgradeGrowth, level)
  );
}

// ── Drops ──

// What a boss or a chest hands over. Weighted by depth: the shallow end mostly
// pays commons (which is fine — a common you can level is still progress), and
// the odds of something that changes your loadout climb the deeper you get.
//
// Deliberately ignorant of what the player already owns. The run has no business
// reading the save, and a duplicate is not a wasted drop — the meta turns it
// into a level, which is what makes a long run pay off even once the table is
// fully unlocked.
export function rollGearDrop(roomIndex: number): GearId {
  const t = Math.min(1, roomIndex / CONFIG.gear.dropRampRooms);
  const w = CONFIG.gear.dropWeights;

  const weights: [GearRarity, number][] = (
    Object.keys(w) as GearRarity[]
  ).map((r) => {
    const [shallow, deep] = w[r];
    return [r, shallow + (deep - shallow) * t];
  });

  let total = 0;
  for (const [, weight] of weights) total += weight;

  let roll = Math.random() * total;
  let rarity: GearRarity = 'common';
  for (const [r, weight] of weights) {
    roll -= weight;
    if (roll <= 0) { rarity = r; break; }
  }

  const pool = GEAR.filter((g) => g.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ── Applying a loadout ──

// Fold one item's stats into the player. Multipliers scale with power; flat adds
// scale with power too, so a levelled +HP piece keeps pace with a levelled
// damage piece rather than falling off a cliff.
function applyItem(p: Player, def: GearDef, level: number) {
  const s = def.stats;
  const power = gearPower(def.rarity, level);

  // Power amplifies an item's UPSIDES and never touches its downsides.
  //
  // Scaling the whole multiplier looks symmetrical and is quietly wrong: the
  // scythe's x0.55 range became x0.37 at epic, so the rarer version of the
  // weapon was blind at ranges the common one handled, and levelling it made
  // that worse. A downside is the item's identity — the price you agreed to pay
  // — not a stat that should grow. Bonuses grow; the price stays fixed.
  //
  // Every item therefore needs at least one bonus stat, or its levels buy
  // nothing. That's a constraint on the table below, not on this function.
  const mult = (m: number | undefined) => {
    if (m === undefined) return 1;
    return m >= 1 ? 1 + (m - 1) * power : m;
  };

  p.damage *= mult(s.damageMult);
  p.attackRate *= mult(s.attackRateMult);
  p.range *= mult(s.rangeMult);
  p.speed *= mult(s.speedMult);

  if (s.maxHpAdd) {
    const add = Math.round(s.maxHpAdd * power);
    p.maxHp += add;
    p.hp += add;
  }
  if (s.resistAdd) p.resist += s.resistAdd * power;
  if (s.critChanceAdd) p.critChance += s.critChanceAdd * power;
  if (s.pierceAdd) p.pierce += s.pierceAdd;
  if (s.projectilesAdd) p.projectilesPerShot += s.projectilesAdd;
  if (s.spreadDeg !== undefined) p.spreadDeg = s.spreadDeg;
  if (s.pattern) p.pattern = s.pattern;

  // How the hero holds it. Carried on the player rather than looked up by the
  // renderer, because the run has no idea what a loadout is by the time it
  // starts — only what the loadout did to it.
  if (def.pose) p.pose = def.pose;
}

// Apply a whole loadout. Called once at run start, before talents.
export function applyLoadout(
  p: Player,
  equipped: Record<GearSlot, GearId>,
  levelOf: (id: GearId) => number
) {
  for (const slot of ['weapon', 'armor', 'ring'] as GearSlot[]) {
    const id = equipped[slot];
    const def = GEAR.find((g) => g.id === id);
    if (!def || def.slot !== slot) continue; // tampered or renamed save
    applyItem(p, def, levelOf(id));
  }
}
