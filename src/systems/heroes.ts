import { CONFIG } from '../config';
import { Player } from '../engine/types';

// Heroes: who you are before the run starts.
//
// Gear changes what you're holding; a hero changes the rhythm you play at. The
// difference matters — swapping a bow for a scythe changes your range, but
// picking Vera changes how long you have to stand still before a shot leaves,
// which is the single number the entire game is built around. That is the bar a
// hero has to clear to be worth existing: not a stat spread, a different game.
//
// Each one is deliberately worse at something. A hero that is strictly better
// than the starter turns hero choice into hero *progression*, and the roster
// stops being a decision the moment you can afford the top one.

export type HeroId = 'rook' | 'vera' | 'bastion' | 'ember';

export interface HeroDef {
  id: HeroId;
  title: string;
  /** One line on how it plays, not what it buffs. */
  desc: string;
  color: string;
  unlockCost: number;
  starter?: boolean;
  /** Applied before gear and talents, so it sets the baseline they scale. */
  apply: (p: Player, power: number) => void;
}

export const MAX_HERO_LEVEL = 8;

// Same rule as gear: levels amplify a hero's upsides and never soften its
// downsides. The price is the identity — a maxed Vera is still fragile, which
// is what stops her from becoming Bastion with better feet.
export function heroPower(level: number): number {
  return 1 + CONFIG.hero.powerPerLevel * level;
}

export function heroUpgradeCost(level: number): number {
  const c = CONFIG.hero;
  return Math.round(c.baseUpgradeCost * Math.pow(c.upgradeGrowth, level));
}

// Scale a bonus by hero level; leave penalties alone.
const up = (bonus: number, power: number) => bonus * power;

export const HEROES: HeroDef[] = [
  {
    id: 'rook',
    title: 'Rook',
    desc: 'Steady and long-sighted. Nothing to learn, nothing to fear.',
    color: '#3ecf5f',
    unlockCost: 0,
    starter: true,
    apply: (p, power) => {
      p.range *= 1 + up(0.12, power);
      p.maxHp += Math.round(up(15, power));
      p.hp = p.maxHp;
    },
  },
  {
    id: 'vera',
    title: 'Vera',
    desc: 'Fires almost the instant she stops. Fast, and made of glass.',
    color: '#5ce0d0',
    unlockCost: 700,
    apply: (p, power) => {
      // The signature. settleDelay is the beat between planting your feet and
      // the first arrow; cutting it turns stop-and-shoot into hit-and-run, and
      // makes kiting a viable way to play rather than a way to lose DPS.
      p.settleDelay *= 0.25;
      p.speed *= 1 + up(0.1, power);
      p.attackRate *= 1 + up(0.06, power);
      p.maxHp = Math.round(p.maxHp * 0.75); // fixed penalty: she stays fragile
      p.hp = p.maxHp;
    },
  },
  {
    id: 'bastion',
    title: 'Bastion',
    desc: 'Starts every run behind a shield. Slow, and very hard to move.',
    color: '#60a5fa',
    unlockCost: 900,
    apply: (p, power) => {
      const shield = Math.round(up(40, power));
      p.shieldMax += shield;
      p.shield += shield;
      p.maxHp += Math.round(up(45, power));
      p.hp = p.maxHp;
      p.resist += up(0.08, power);
      p.speed *= 0.88; // fixed penalty
    },
  },
  {
    id: 'ember',
    title: 'Ember',
    desc: 'Every shot burns. Hits hardest over time, dies fastest up close.',
    color: '#ff7a3c',
    unlockCost: 1200,
    apply: (p, power) => {
      // Starts with a Blaze stack, so burn is the build from room one rather
      // than something the draft has to hand you.
      p.burn += 1;
      p.damage *= 1 + up(0.12, power);
      p.maxHp = Math.round(p.maxHp * 0.85); // fixed penalty
      p.hp = p.maxHp;
    },
  },
];

export const STARTER_HERO: HeroId = 'rook';

export function getHero(id: HeroId): HeroDef {
  return HEROES.find((hero) => hero.id === id) ?? HEROES[0];
}

export function applyHero(p: Player, id: HeroId, level: number) {
  const def = HEROES.find((hero) => hero.id === id);
  if (!def) return; // renamed or removed between builds; the base player stands

  // The body takes the roster colour, so the portrait you picked in the menu is
  // literally the thing you control. Setting it here rather than inside each
  // apply() keeps one source of truth — two copies of a colour is how the menu
  // and the arena end up disagreeing about who you are.
  p.color = def.color;

  def.apply(p, heroPower(level));
}
