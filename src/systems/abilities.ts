import { CONFIG } from '../config';
import { Player } from '../engine/types';

// The draftable upgrade cards.
//
// The pool is split deliberately. Commons are arithmetic — they keep the
// numbers climbing so a run doesn't stall. Rares and epics are *behavioral*:
// they change how the player's shots move and what they leave behind, and they
// compound with each other. Multishot x Ricochet x Pierce is a build; three
// stacks of +20% damage is a total.
//
// That split is the whole point. A draft where every option is a stat is a
// draft with one correct answer, and a roguelite whose runs all converge on the
// same answer has no reason to be replayed.

export type AbilityId =
  | 'multishot'
  | 'pierce'
  | 'attackSpeed'
  | 'maxHp'
  | 'damageUp'
  | 'moveSpeed'
  | 'ricochet'
  | 'sideShot'
  | 'rearShot'
  | 'crit'
  | 'blaze'
  | 'frost'
  | 'focus'
  | 'reach'
  | 'greed'
  | 'homing'
  | 'thorns'
  | 'shield'
  | 'detonate'
  | 'siphon';

export type Rarity = 'common' | 'rare' | 'epic';

export interface AbilityDef {
  id: AbilityId;
  title: string;
  desc: string;
  color: string;
  rarity: Rarity;
  /**
   * How many times this card can be taken in one run.
   *
   * CAN BE `Infinity` — three commons are uncapped on purpose (see below).
   * Never loop to this value: `for (let i = 0; i < def.maxStacks; i++)` hangs.
   * Use `isMaxed(player, id)` to ask the question instead.
   */
  maxStacks: number;
  apply: (p: Player) => void; // mutates the player when drafted
}

// Border/label tint per rarity, so a card's weight reads before the text does.
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8b93a7',
  rare: '#4c9aff',
  epic: '#c05cf0',
};

const A = CONFIG.abilities;

export const ABILITIES: AbilityDef[] = [
  // ── Common: keep the numbers moving ──
  //
  // These three are deliberately UNCAPPED, and they are the only cards that are.
  //
  // A run has no last room, so the card pool cannot have a last card. With every
  // common capped, a deep run drained all 49 stacks and then kept levelling into
  // an empty draft: player power flatlined while enemy HP carried on compounding,
  // which is the same wall the XP curve used to build, just further out. Leaving
  // exactly three commons uncapped means the draft can always offer a real choice
  // of three — damage, rate, or survivability — rather than degenerating into a
  // one-card overlay.
  //
  // This does not make commons crowd out the good cards: rollOne picks the tier
  // first and only then a card inside it, so how often an epic appears is
  // unaffected by how many commons are live. That decoupling is exactly what it
  // was built for.
  //
  // Nor does it make the player immortal. Power compounds at 1.2 per stack and a
  // deep run draws roughly one card per room split three ways (~1.06x damage per
  // room), while enemy HP compounds at 1.085 per room — so the wave still wins
  // eventually. Vitality is flat +25 against damage that scales multiplicatively,
  // so it decays into a weak pick on its own, which is the intent.
  {
    id: 'damageUp',
    title: 'Power',
    desc: '+20% damage',
    color: '#ef4444',
    rarity: 'common',
    maxStacks: Infinity,
    apply: (p) => { p.damage *= 1.2; },
  },
  {
    id: 'attackSpeed',
    title: 'Attack Speed',
    desc: '+18% fire rate',
    color: '#f59e0b',
    rarity: 'common',
    maxStacks: Infinity,
    apply: (p) => { p.attackRate *= 1.18; },
  },
  {
    id: 'maxHp',
    title: 'Vitality',
    desc: '+25 max HP & heal 25',
    color: '#22c55e',
    rarity: 'common',
    maxStacks: Infinity,
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'moveSpeed',
    title: 'Swiftness',
    desc: '+12% move speed',
    color: '#06b6d4',
    rarity: 'common',
    maxStacks: 4,
    apply: (p) => { p.speed *= 1.12; },
  },
  {
    id: 'pierce',
    title: 'Piercing Shot',
    desc: 'Shots pass through +1 enemy',
    color: '#8b5cf6',
    rarity: 'common',
    maxStacks: 3,
    apply: (p) => { p.pierce += 1; },
  },

  {
    id: 'focus',
    title: 'Focus',
    desc: `+${Math.round(A.focus.perStackPerSec * 100)}% damage per second held still`,
    color: '#facc15',
    rarity: 'common',
    maxStacks: 5,
    apply: (p) => { p.focus += 1; },
  },
  {
    id: 'reach',
    title: 'Longshot',
    desc: '+18% attack range',
    color: '#94a3b8',
    rarity: 'common',
    maxStacks: 4,
    apply: (p) => { p.range *= 1.18; },
  },
  {
    id: 'greed',
    title: 'Greed',
    desc: `+${Math.round(A.greed.goldPerStack * 100)}% gold, wider pickup range`,
    color: '#ffd45e',
    rarity: 'common',
    maxStacks: 3,
    apply: (p) => {
      p.goldBonus += A.greed.goldPerStack;
      p.magnetBonus += A.greed.magnetPerStack;
    },
  },

  // ── Rare: change the shape of your fire ──
  {
    id: 'multishot',
    title: 'Multishot',
    desc: '+1 projectile per shot',
    color: '#3b82f6',
    rarity: 'rare',
    maxStacks: 3,
    apply: (p) => { p.projectilesPerShot += 1; },
  },
  {
    id: 'ricochet',
    title: 'Ricochet',
    desc: 'Shots bounce off walls +1 time',
    color: '#38bdf8',
    rarity: 'rare',
    maxStacks: 3,
    apply: (p) => { p.bounces += A.ricochet.bouncesPerStack; },
  },
  {
    id: 'sideShot',
    title: 'Side Arrows',
    desc: '+1 shot to each side',
    color: '#a3e635',
    rarity: 'rare',
    maxStacks: 2,
    apply: (p) => { p.sideShots += 1; },
  },
  {
    id: 'rearShot',
    title: 'Rear Arrow',
    desc: '+1 shot behind you',
    color: '#facc15',
    rarity: 'rare',
    maxStacks: 2,
    apply: (p) => { p.rearShots += 1; },
  },
  {
    id: 'crit',
    title: 'Deadeye',
    desc: `+${Math.round(A.crit.chancePerStack * 100)}% crit for ${A.crit.mult}x damage`,
    color: '#fb7185',
    rarity: 'rare',
    maxStacks: 4,
    apply: (p) => {
      p.critChance = Math.min(A.crit.maxChance, p.critChance + A.crit.chancePerStack);
    },
  },

  {
    id: 'homing',
    title: 'Seeker',
    desc: 'Shots curve toward enemies',
    color: '#5ce0d0',
    rarity: 'rare',
    maxStacks: 3,
    apply: (p) => { p.homing += 1; },
  },
  {
    id: 'thorns',
    title: 'Thorns',
    desc: 'Enemies that touch you take damage',
    color: '#a3e635',
    rarity: 'rare',
    maxStacks: 3,
    apply: (p) => { p.thorns += 1; },
  },
  {
    id: 'shield',
    title: 'Bulwark',
    desc: `+${A.shield.perStack} shield, refills out of combat`,
    color: '#60a5fa',
    rarity: 'rare',
    maxStacks: 4,
    apply: (p) => {
      p.shieldMax += A.shield.perStack;
      p.shield += A.shield.perStack; // arrives full, or the card does nothing yet
    },
  },

  // ── Epic: the cards a run gets built around ──
  {
    id: 'blaze',
    title: 'Blaze',
    desc: 'Shots set enemies on fire',
    color: '#ff7a3c',
    rarity: 'epic',
    maxStacks: 3,
    apply: (p) => { p.burn += 1; },
  },
  {
    id: 'frost',
    title: 'Frost',
    desc: 'Shots slow enemies',
    color: '#7dd3fc',
    rarity: 'epic',
    maxStacks: 3,
    apply: (p) => { p.frost += 1; },
  },
  {
    id: 'detonate',
    title: 'Detonate',
    desc: 'Kills explode',
    color: '#ff9d5c',
    rarity: 'epic',
    maxStacks: 3,
    apply: (p) => { p.detonate += 1; },
  },
  {
    id: 'siphon',
    title: 'Siphon',
    desc: `Heal ${Math.round(A.siphon.fractionPerStack * 100)}% of damage dealt`,
    color: '#e05cae',
    rarity: 'epic',
    maxStacks: 3,
    apply: (p) => { p.lifesteal += A.siphon.fractionPerStack; },
  },
];

const BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));

export function getAbility(id: AbilityId): AbilityDef {
  return BY_ID.get(id)!;
}

export function stacksOf(p: Player, id: AbilityId): number {
  return p.stacks[id] ?? 0;
}

export function isMaxed(p: Player, id: AbilityId): boolean {
  return stacksOf(p, id) >= getAbility(id).maxStacks;
}
