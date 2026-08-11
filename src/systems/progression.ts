import { CONFIG } from '../config';
import { World } from '../engine/types';
import { ABILITIES, AbilityDef, AbilityId, Rarity, getAbility, isMaxed } from './abilities';
import { clearInput } from './movement';
import { haptic, sfx } from './sfx';

// Called when something the player killed dies: count it and award XP. Gold is
// NOT credited here — it drops on the floor as coins (see systems/pickups), so
// the kill and the payout are two separate beats.
export function grantKill(world: World, xpReward: number) {
  world.enemiesKilled += 1;
  addXp(world, xpReward);
}

function addXp(world: World, amount: number) {
  const p = world.player;
  p.xp += amount;

  let leveled = 0;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    // Never let a level cost the same as the one before it. Rounding a
    // compounding value can return the value itself at a small enough base
    // (round(1 * 1.12) === 1), which freezes the curve and makes every
    // subsequent level free — an infinite draft from one kill. Current tuning is
    // nowhere near that, but the failure is silent and total, so it's cheaper to
    // make it impossible than to remember the constraint when retuning.
    p.xpToNext = Math.max(p.xpToNext + 1, Math.round(p.xpToNext * CONFIG.progression.xpGrowth));
    leveled += 1;
  }

  if (leveled > 0) {
    sfx('levelUp');
    haptic('light');
    world.pendingDrafts += leveled;
    if (world.status === 'playing') enterDraft(world);
  }
}

// Put the run down mid-room, and pick it back up.
//
// The draft overlay used to be the only thing that stopped the clock, so there
// was no safe way to put the phone down: walking away mid-room meant coming back
// to a corpse. Pausing clears the stick for the same reason entering a draft
// does — the overlay takes the screen, so the release event never arrives.
export function pauseRun(world: World) {
  if (world.status !== 'playing') return;
  world.status = 'paused';
  clearInput(world);
}

export function resumeRun(world: World) {
  if (world.status !== 'paused') return;
  world.status = 'playing';
  clearInput(world); // don't resume walking on a stick the player isn't holding
}

// Pause the run and offer three cards.
export function enterDraft(world: World) {
  const options = rollThree(world);

  // Every card in the pool is maxed, so there is nothing to offer. The overlay
  // renders its cards from this list and has no other dismiss path, so showing
  // it empty is a hard softlock — the run freezes with nothing to tap. Drop the
  // queue and keep playing instead.
  if (options.length === 0) {
    world.pendingDrafts = 0;
    world.draftOptions = [];
    world.status = 'playing';
    return;
  }

  world.status = 'drafting';
  world.draftOptions = options;
  clearInput(world); // the Joystick is about to unmount mid-gesture
}

// Roll a hand by rarity rather than uniformly over the pool.
//
// A flat roll would bury the epics: there are far more commons, so the cards
// that actually define a build would show up least often. Rolling the rarity
// first and then picking within it decouples "how often does an epic appear"
// from "how many epics exist", which means new cards can be added to any tier
// without silently re-balancing the draft.
function rollThree(world: World): AbilityId[] {
  const p = world.player;
  const taken = new Set<AbilityId>();
  const out: AbilityId[] = [];

  // Cards already at their stack cap are out of the pool entirely — offering a
  // card that can't be taken is a dead slot in a hand of three.
  const available = ABILITIES.filter((a) => !isMaxed(p, a.id));

  while (out.length < 3 && taken.size < available.length) {
    const pick = rollOne(available, taken);
    if (!pick) break;
    taken.add(pick);
    out.push(pick);
  }

  return out;
}

const TIERS: Rarity[] = ['common', 'rare', 'epic'];

function rollOne(available: AbilityDef[], taken: Set<AbilityId>): AbilityId | null {
  const pool = available.filter((a) => !taken.has(a.id));
  if (pool.length === 0) return null;

  // Pick the TIER first, then a card uniformly inside it. Weighting each card
  // by its rarity instead would make a tier's frequency scale with how many
  // cards happen to be in it — adding a fourth epic would quietly make epics
  // more common, which is precisely the coupling this avoids.
  //
  // Only tiers that still have an unmaxed card are considered, so a run that
  // has exhausted the epics keeps drafting instead of rolling a dead tier.
  const live = TIERS.filter((r) => pool.some((a) => a.rarity === r));

  let total = 0;
  for (const r of live) total += weightOf(r);

  let roll = Math.random() * total;
  let tier = live[live.length - 1]; // float drift guard
  for (const r of live) {
    roll -= weightOf(r);
    if (roll <= 0) {
      tier = r;
      break;
    }
  }

  const inTier = pool.filter((a) => a.rarity === tier);
  return inTier[Math.floor(Math.random() * inTier.length)].id;
}

function weightOf(rarity: Rarity): number {
  return CONFIG.progression.rarityWeight[rarity] ?? 1;
}

// Apply the chosen card; either offer the next queued draft or resume the run.
//
// Both guards below exist because this is wired straight to a Pressable's
// onPress, and React will happily deliver two touches before it re-renders the
// overlay away — a two-finger tap on two different cards is the obvious vector.
// Without them, one level-up paid out two cards and drove pendingDrafts
// negative, which never suppressed anything because addXp re-enters the draft
// on level-up regardless of the counter. It just stayed negative all run.
export function chooseAbility(world: World, id: AbilityId) {
  if (world.status !== 'drafting') return;          // the hand is already spent
  if (!world.draftOptions.includes(id)) return;     // stale press from a previous hand

  const p = world.player;
  sfx('draftPick');
  getAbility(id).apply(p);
  p.stacks[id] = (p.stacks[id] ?? 0) + 1;
  world.pendingDrafts = Math.max(0, world.pendingDrafts - 1);

  if (world.pendingDrafts > 0) {
    enterDraft(world); // re-rolls, and handles an exhausted pool
  } else {
    world.draftOptions = [];
    world.status = 'playing';
  }
}
