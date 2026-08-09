import AsyncStorage from '@react-native-async-storage/async-storage';
import { Player } from '../engine/types';

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
}

export function defaultMeta(): MetaState {
  return {
    gold: 0,
    upgrades: { maxHp: 0, damage: 0, attackSpeed: 0, moveSpeed: 0 },
    muted: false,
  };
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

// Apply all purchased upgrades to a fresh run's player.
export function applyMeta(p: Player, meta: MetaState) {
  for (const def of UPGRADES) {
    const lvl = levelOf(meta, def.id);
    if (lvl > 0) def.apply(p, lvl);
  }
}

// ── Persistence ──
const KEY = 'archero_clone_meta_v1';

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
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultMeta();
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

    return {
      gold: intOr(parsed.gold, 0, 0, MAX_GOLD),
      upgrades,
      muted: parsed.muted === true,
    };
  } catch {
    return defaultMeta();
  }
}

export async function saveMeta(meta: MetaState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // ignore write failures (out of space, etc.) — game continues in memory
  }
}
