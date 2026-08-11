import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import { Player } from '../engine/types';
import {
  GEAR,
  GearDef,
  GearId,
  GearSlot,
  MAX_GEAR_LEVEL,
  STARTER_GEAR,
  applyLoadout,
  getGear,
  unlockCost,
  upgradeCost,
} from './gear';
import {
  HEROES,
  HeroDef,
  HeroId,
  MAX_HERO_LEVEL,
  STARTER_HERO,
  applyHero,
  heroUpgradeCost,
} from './heroes';

// Permanent upgrades bought with gold between runs (mirrors the Unity TalentTree).
export type UpgradeId = 'maxHp' | 'damage' | 'attackSpeed' | 'moveSpeed';

export interface UpgradeDef {
  id: UpgradeId;
  title: string;
  desc: string;
  color: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  // Apply the full purchased level to a fresh run's player.
  apply: (p: Player, level: number) => void;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'maxHp',
    title: 'Max HP',
    desc: '+20 max HP per level',
    color: '#22c55e',
    maxLevel: 10,
    baseCost: 40,
    costGrowth: 1.35,
    apply: (p, lvl) => { p.maxHp += 20 * lvl; p.hp = p.maxHp; },
  },
  {
    id: 'damage',
    title: 'Power',
    desc: '+8% damage per level',
    color: '#ef4444',
    maxLevel: 10,
    baseCost: 50,
    costGrowth: 1.4,
    apply: (p, lvl) => { p.damage *= Math.pow(1.08, lvl); },
  },
  {
    id: 'attackSpeed',
    title: 'Attack Speed',
    desc: '+5% fire rate per level',
    color: '#f59e0b',
    maxLevel: 8,
    baseCost: 60,
    costGrowth: 1.45,
    apply: (p, lvl) => { p.attackRate *= Math.pow(1.05, lvl); },
  },
  {
    id: 'moveSpeed',
    title: 'Swiftness',
    desc: '+4% move speed per level',
    color: '#06b6d4',
    maxLevel: 8,
    baseCost: 45,
    costGrowth: 1.4,
    apply: (p, lvl) => { p.speed *= Math.pow(1.04, lvl); },
  },
];

export interface MetaState {
  gold: number;
  upgrades: Record<UpgradeId, number>; // level per upgrade
  muted: boolean;                      // sound + haptics off

  /** Owned equipment → its upgrade level. Absent key means "not unlocked". */
  owned: Partial<Record<GearId, number>>;
  /** What's currently worn in each slot. */
  equipped: Record<GearSlot, GearId>;

  /** How many chapters have been beaten. Gates which are selectable. */
  chaptersCleared: number;

  /** Owned heroes → their level. Absent key means "not unlocked". */
  heroes: Partial<Record<HeroId, number>>;
  /** Who you play as. */
  hero: HeroId;
}

export function defaultMeta(): MetaState {
  return {
    gold: 0,
    upgrades: { maxHp: 0, damage: 0, attackSpeed: 0, moveSpeed: 0 },
    muted: false,
    // Every slot starts filled. A run with an empty weapon slot is not a
    // interesting constraint, it's a bug report.
    owned: { bow: 0, tunic: 0, ringPower: 0 },
    equipped: { ...STARTER_GEAR },
    chaptersCleared: 0,
    heroes: { [STARTER_HERO]: 0 },
    hero: STARTER_HERO,
  };
}

export function ownsHero(meta: MetaState, id: HeroId): boolean {
  return meta.heroes[id] !== undefined;
}

export function heroLevel(meta: MetaState, id: HeroId): number {
  return meta.heroes[id] ?? 0;
}

export function canUnlockHero(meta: MetaState, def: HeroDef): boolean {
  return !ownsHero(meta, def.id) && meta.gold >= def.unlockCost;
}

export function unlockHero(meta: MetaState, def: HeroDef): MetaState {
  if (!canUnlockHero(meta, def)) return meta;
  return {
    ...meta,
    gold: meta.gold - def.unlockCost,
    heroes: { ...meta.heroes, [def.id]: 0 },
  };
}

export function canUpgradeHero(meta: MetaState, def: HeroDef): boolean {
  const lvl = heroLevel(meta, def.id);
  return ownsHero(meta, def.id) &&
    lvl < MAX_HERO_LEVEL &&
    meta.gold >= heroUpgradeCost(lvl);
}

export function upgradeHero(meta: MetaState, def: HeroDef): MetaState {
  if (!canUpgradeHero(meta, def)) return meta;
  const lvl = heroLevel(meta, def.id);
  return {
    ...meta,
    gold: meta.gold - heroUpgradeCost(lvl),
    heroes: { ...meta.heroes, [def.id]: lvl + 1 },
  };
}

export function selectHero(meta: MetaState, def: HeroDef): MetaState {
  if (!ownsHero(meta, def.id)) return meta;
  return { ...meta, hero: def.id };
}

export function ownsGear(meta: MetaState, id: GearId): boolean {
  return meta.owned[id] !== undefined;
}

export function gearLevel(meta: MetaState, id: GearId): number {
  return meta.owned[id] ?? 0;
}

export function canUnlock(meta: MetaState, def: GearDef): boolean {
  return !ownsGear(meta, def.id) && meta.gold >= unlockCost(def);
}

export function unlockGear(meta: MetaState, def: GearDef): MetaState {
  if (!canUnlock(meta, def)) return meta;
  return {
    ...meta,
    gold: meta.gold - unlockCost(def),
    owned: { ...meta.owned, [def.id]: 0 },
  };
}

export function canUpgradeGear(meta: MetaState, def: GearDef): boolean {
  const lvl = gearLevel(meta, def.id);
  return ownsGear(meta, def.id) &&
    lvl < MAX_GEAR_LEVEL &&
    meta.gold >= upgradeCost(def, lvl);
}

export function upgradeGear(meta: MetaState, def: GearDef): MetaState {
  if (!canUpgradeGear(meta, def)) return meta;
  const lvl = gearLevel(meta, def.id);
  return {
    ...meta,
    gold: meta.gold - upgradeCost(def, lvl),
    owned: { ...meta.owned, [def.id]: lvl + 1 },
  };
}

// Bank one dropped item. A duplicate is not a wasted drop — it becomes a level,
// and once the item is maxed it becomes gold, so a deep run always pays even
// when the whole table is already unlocked.
export function grantGear(meta: MetaState, id: string): MetaState {
  const def = GEAR.find((g) => g.id === id);
  if (!def) return meta; // unknown id from an older/newer build: ignore quietly

  const current = meta.owned[def.id];
  if (current === undefined) {
    return { ...meta, owned: { ...meta.owned, [def.id]: 0 } };
  }
  if (current < MAX_GEAR_LEVEL) {
    return { ...meta, owned: { ...meta.owned, [def.id]: current + 1 } };
  }
  return { ...meta, gold: meta.gold + unlockCost(def) };
}

export function equipGear(meta: MetaState, def: GearDef): MetaState {
  if (!ownsGear(meta, def.id)) return meta;
  return { ...meta, equipped: { ...meta.equipped, [def.slot]: def.id } };
}

export function getUpgrade(id: UpgradeId): UpgradeDef {
  return UPGRADES.find((u) => u.id === id)!;
}

export function levelOf(meta: MetaState, id: UpgradeId): number {
  return meta.upgrades[id] ?? 0;
}

// Cost to buy the NEXT level of an upgrade.
export function nextCost(meta: MetaState, id: UpgradeId): number {
  const def = getUpgrade(id);
  const lvl = levelOf(meta, id);
  return Math.round(def.baseCost * Math.pow(def.costGrowth, lvl));
}

export function isMaxed(meta: MetaState, id: UpgradeId): boolean {
  return levelOf(meta, id) >= getUpgrade(id).maxLevel;
}

export function canAfford(meta: MetaState, id: UpgradeId): boolean {
  return !isMaxed(meta, id) && meta.gold >= nextCost(meta, id);
}

// Returns a NEW meta with the purchase applied (immutable — plays nice with React state).
export function buyUpgrade(meta: MetaState, id: UpgradeId): MetaState {
  if (!canAfford(meta, id)) return meta;
  const cost = nextCost(meta, id);
  return {
    ...meta,
    gold: meta.gold - cost,
    upgrades: { ...meta.upgrades, [id]: levelOf(meta, id) + 1 },
  };
}

// Apply everything permanent to a fresh run's player: worn equipment first,
// then the talent tree. Order matters for the flat +HP pieces — talents add a
// percentage of nothing if they land before the gear that provides the base.
export function applyMeta(p: Player, meta: MetaState) {
  // Hero first: it sets the baseline everything else scales. Gear that adds
  // +70 max HP should be adding it to Bastion's frame, not to a stock one.
  applyHero(p, meta.hero, heroLevel(meta, meta.hero));

  applyLoadout(p, meta.equipped, (id) => gearLevel(meta, id));

  for (const def of UPGRADES) {
    const lvl = levelOf(meta, def.id);
    if (lvl > 0) def.apply(p, lvl);
  }

  // Gear can push crit past what the ability table would ever allow on its own,
  // so the ceiling the draft respects is enforced once, here, at the end.
  p.critChance = Math.min(p.critChance, CONFIG.abilities.crit.maxChance);
}

// ── Persistence ──
const KEY = 'archero_clone_meta_v1';

// Previous good save. Every successful write leaves the copy it replaced here,
// so a single corrupt or truncated record costs the last session rather than the
// entire bank. Without it, one unparseable byte silently reset a player to
// defaults and the very next save wrote those defaults over the top — a
// recoverable read failure turned into permanent loss.
const BACKUP_KEY = 'archero_clone_meta_v1_bak';

// Coerce a persisted number into a sane whole number, or fall back.
//
// `typeof x === 'number'` is not a validity check: NaN and Infinity both pass it
// and then poison every arithmetic path downstream. Gold especially — an
// Infinity bank makes every upgrade free, and a NaN one makes every purchase
// impossible, both without a single error being thrown.
function intOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

const MAX_GOLD = 1e12; // far past any legitimate bank; only bounds tampered saves

export async function loadMeta(): Promise<MetaState> {
  const primary = await readSlot(KEY);
  if (primary) return primary;

  // Primary is missing or unreadable. Fall back to the last known good copy
  // before conceding a fresh start.
  const backup = await readSlot(BACKUP_KEY);
  if (backup) return backup;

  return defaultMeta();
}

// Read and validate one slot. Returns null if it is absent or unusable, so the
// caller can decide whether to try the next one.
async function readSlot(key: string): Promise<MetaState | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MetaState>;

    // Validate field by field rather than spreading the parsed object over the
    // defaults. A spread trusts whatever is on disk: a hand-edited or corrupted
    // save with maxHp: 9999 was applied verbatim, and since applyMeta multiplies
    // by level it produced a player with 200,080 HP. The upgrade table already
    // declares every ceiling, so clamp to it — that's the same bound the shop
    // enforces, just applied on the way in as well as on the way out.
    const upgrades = defaultMeta().upgrades;
    for (const def of UPGRADES) {
      upgrades[def.id] = intOr(parsed.upgrades?.[def.id], 0, 0, def.maxLevel);
    }

    // Equipment. An unknown id is dropped rather than trusted: gear can be
    // renamed or removed between builds, and a save pointing at a weapon that
    // no longer exists must not leave a player with an empty hand.
    const base = defaultMeta();
    const owned: Partial<Record<GearId, number>> = { ...base.owned };
    if (parsed.owned && typeof parsed.owned === 'object') {
      for (const def of GEAR) {
        const lvl = (parsed.owned as Record<string, unknown>)[def.id];
        if (lvl === undefined) continue;
        owned[def.id] = intOr(lvl, 0, 0, MAX_GEAR_LEVEL);
      }
    }

    const equipped = { ...base.equipped };
    for (const slot of Object.keys(equipped) as GearSlot[]) {
      const id = (parsed.equipped as Record<string, unknown> | undefined)?.[slot];
      const def = GEAR.find((g) => g.id === id);
      // Must exist, sit in the slot it claims, and actually be owned.
      if (def && def.slot === slot && owned[def.id] !== undefined) {
        equipped[slot] = def.id;
      }
    }

    return {
      gold: intOr(parsed.gold, 0, 0, MAX_GOLD),
      upgrades,
      muted: parsed.muted === true,
      owned,
      equipped,
      chaptersCleared: intOr(parsed.chaptersCleared, 0, 0, CONFIG.chapters.length),
      ...readHeroes(parsed, base),
    };
  } catch {
    return null;
  }
}

// Heroes, validated the same way gear is: unknown ids dropped, levels clamped,
// and a selection that isn't owned falls back to the starter. A save pointing at
// a hero that no longer exists must never leave the player unable to start.
function readHeroes(parsed: Partial<MetaState>, base: MetaState) {
  const heroes: Partial<Record<HeroId, number>> = { ...base.heroes };
  if (parsed.heroes && typeof parsed.heroes === 'object') {
    for (const def of HEROES) {
      const lvl = (parsed.heroes as Record<string, unknown>)[def.id];
      if (lvl === undefined) continue;
      heroes[def.id] = intOr(lvl, 0, 0, MAX_HERO_LEVEL);
    }
  }

  const wanted = HEROES.find((hero) => hero.id === parsed.hero);
  const hero = wanted && heroes[wanted.id] !== undefined ? wanted.id : STARTER_HERO;

  return { heroes, hero };
}

export async function saveMeta(meta: MetaState): Promise<void> {
  try {
    // Demote the current record to backup before overwriting it, so there is
    // always one complete generation behind the live one. Order matters: if the
    // write below fails or is interrupted, the backup still holds a good save.
    const current = await AsyncStorage.getItem(KEY);
    if (current) await AsyncStorage.setItem(BACKUP_KEY, current);

    await AsyncStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // ignore write failures (out of space, etc.) — game continues in memory
  }
}
