import { CONFIG } from '../config';
import { Player } from '../engine/types';
import type { SkillId } from './skills';
// Type-only: the roster names a character set, but nothing here should pull the
// renderer's `require` table into the simulation's module graph.
import type { CharSet } from '../render/sprites';

// Heroes: who you are before the run starts.
//
// Gear changes what you're holding; a hero changes the rhythm you play at. The
// difference matters — swapping a pistol for a rifle changes your range, but
// picking Vera changes how long you have to stand still before a shot leaves,
// which is the single number the entire game is built around. That is the bar a
// hero has to clear to be worth existing: not a stat spread, a different game.
//
// Each one is deliberately worse at something. A hero that is strictly better
// than the starter turns hero choice into hero *progression*, and the roster
// stops being a decision the moment you can afford the top one.
//
// Every hero also owns one of the nine character sets outright, so "who am I
// playing" is answered by the body on screen rather than by the colour of a
// circle. That is the reason the roster is eight and not twelve: the ninth set
// is the enemy cast, and a hero who looks like something you shoot at is a hero
// who gets lost in a crowded room.

export type HeroId =
  | 'rook' | 'vera' | 'bastion' | 'ember'
  | 'kestrel' | 'nomad' | 'brack' | 'iris';

export interface HeroDef {
  id: HeroId;
  title: string;
  /** One line on how it plays, not what it buffs. */
  desc: string;
  /** Which character sprite this hero wears. One set each, never shared. */
  set: CharSet;
  /** Accent colour, taken off the sprite so the menu and the arena agree. */
  color: string;
  unlockCost: number;
  starter?: boolean;
  /**
   * The button this hero brings. See systems/skills.ts.
   *
   * Every hero has exactly one, and no two share. The passive spread below says
   * what a hero is good and bad at; the skill is the answer to the trouble that
   * spread gets them into, which is why they are chosen together rather than
   * drawn from a common pool.
   */
  skill: SkillId;
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
    set: 'soldier',
    color: '#8fae54',
    unlockCost: 0,
    starter: true,
    skill: 'overwatch',
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
    set: 'womanGreen',
    color: '#3ecf8f',
    unlockCost: 700,
    skill: 'blink',
    apply: (p, power) => {
      // The signature. settleDelay is the beat between planting your feet and
      // the first shot; cutting it turns stop-and-shoot into hit-and-run, and
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
    set: 'manBlue',
    color: '#4c8ff0',
    unlockCost: 900,
    skill: 'bulwark',
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
    set: 'survivor',
    color: '#ff7a3c',
    unlockCost: 1200,
    skill: 'pyre',
    apply: (p, power) => {
      // Starts with a Blaze stack, so burn is the build from room one rather
      // than something the draft has to hand you.
      p.burn += 1;
      p.damage *= 1 + up(0.12, power);
      p.maxHp = Math.round(p.maxHp * 0.85); // fixed penalty
      p.hp = p.maxHp;
    },
  },

  // ── The second half of the roster ────────────────────────────────────────
  // Each of these takes one behaviour the draft can hand out and makes it the
  // thing you start with, so the run is built around it instead of hoping for
  // it. That is a real choice and not a power creep: every one of them pays for
  // the head start with a stat the starter never has to think about.
  {
    id: 'kestrel',
    title: 'Kestrel',
    desc: 'Rarely shoots. When she connects, things stop existing.',
    set: 'hitman',
    color: '#d4b25a',
    unlockCost: 1500,
    skill: 'mark',
    apply: (p, power) => {
      // Swingy on purpose. Average DPS lands near the starter's; the variance is
      // the point, and it changes what a room feels like — a Kestrel who whiffs
      // three rolls in a boss phase is genuinely in trouble.
      p.critChance += up(0.3, power);
      p.critMult += up(0.6, power);
      p.attackRate *= 0.62; // fixed penalty: the shots are rare either way
      p.maxHp = Math.round(p.maxHp * 0.9);
      p.hp = p.maxHp;
    },
  },
  {
    id: 'nomad',
    title: 'Nomad',
    desc: 'Loot flies to him from halfway across the room. Hits like a tourist.',
    set: 'manOld',
    color: '#cfc6ae',
    unlockCost: 1800,
    skill: 'windfall',
    apply: (p, power) => {
      // The economy hero. Gold has real uses mid-run now — the Forge sells a
      // card for it — so a build that collects twice as much of it under half
      // the exposure is a strategy, not a convenience.
      p.magnetBonus += up(120, power);
      p.goldBonus += up(0.6, power);
      p.speed *= 1 + up(0.08, power);
      p.damage *= 0.78; // fixed penalty: he is not here to kill things quickly
    },
  },
  {
    id: 'brack',
    title: 'Brack',
    desc: 'Wants to be touched. Enormous, furious, and blind past arm’s reach.',
    set: 'manBrown',
    color: '#b5763f',
    unlockCost: 2100,
    skill: 'quake',
    apply: (p, power) => {
      // Inverts the whole game: the auto-aim rewards distance, so a hero who
      // can only see close targets has to walk INTO the wave and let it hit him.
      // Thorns turn that into the damage source, which is why the range cut can
      // be this brutal without the hero being unplayable.
      p.thorns += up(3, power);
      p.maxHp += Math.round(up(90, power));
      p.hp = p.maxHp;
      p.resist += up(0.1, power);
      p.range *= 0.6;   // fixed penalty
      p.speed *= 0.92;
    },
  },
  {
    id: 'iris',
    title: 'Iris',
    desc: 'Her shots find their own way there, and keep going. None of them hurt much.',
    set: 'robot',
    color: '#9fb3c8',
    unlockCost: 2500,
    skill: 'salvo',
    apply: (p, power) => {
      // Homing plus pierce means cover stops mattering to her offence, which is
      // the one thing no other hero gets to ignore. Paid for per-shot: she needs
      // the volume, so multishot and attack speed are what her draft is hunting.
      p.homing += 2;
      p.pierce += 1;
      p.attackRate *= 1 + up(0.15, power);
      p.damage *= 0.7;  // fixed penalty
      p.maxHp = Math.round(p.maxHp * 0.9);
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

  // The body takes the roster's sprite and accent colour, so the portrait you
  // picked in the menu is literally the thing you control. Setting them here
  // rather than inside each apply() keeps one source of truth — two copies of a
  // colour is how the menu and the arena end up disagreeing about who you are.
  p.color = def.color;
  p.set = def.set;

  // The skill comes with the hero and starts READY. A run that opens with the
  // button greyed out teaches the player it is scenery — the first room is
  // exactly where they should be finding out what it does.
  const power = heroPower(level);
  p.skill = def.skill;
  p.skillCd = 0;
  p.skillCdMax = 0;
  p.skillTimer = 0;
  // Levels scale what the skill DOES and never how often it comes back; see the
  // note on CONFIG.skills.
  p.skillPower = power;

  def.apply(p, power);
}
