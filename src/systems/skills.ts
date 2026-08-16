import { CONFIG } from '../config';
import { Player, World } from '../engine/types';
import { Vec2, dist, normalize, rotate, sub } from '../engine/vec';
import { spawnPlayerShot } from './shotSpawn';
import { spawnBlast } from './blastSpawn';
import { applyFrost, applyBurn } from './status';
import { addShake, emitFlash, emitRing } from './fx';
import { blocked, confine, resolveCircle } from './obstacles';
import { haptic, sfx } from './sfx';

// Hero skills: the one thing in this game the player actively does.
//
// Everything else is expressed through the stick. Move, or stand still and let
// the auto-aim work — that is the whole input surface, and it is a good one,
// but it means running away is *empty*. You are not fighting, not progressing,
// just waiting for permission to shoot again. On a phone, where a run is three
// minutes and half of it is spent kiting, that dead time is most of the game.
//
// So every skill here obeys one rule: IT CAN BE CAST WHILE MOVING. That is what
// the button is for. It is also why none of them is "press for damage" — each
// answers the specific trouble its own hero gets into, so what the player is
// actually deciding is *when* to spend it, and that decision is different for
// every hero on the roster.
//
// Two shapes of skill, and the difference is only in the table:
//
//   instant — resolves inside cast() and is over (Blink, Quake, Windfall, Salvo)
//   timed   — sets a duration, and something elsewhere asks skillActive()
//
// A timed skill is deliberately NOT implemented by a per-frame update hook.
// Three of the four change a rule that already has exactly one home — whether
// combat may fire while moving, whether a shot crits, how much damage gets
// through — and the honest way to express "this rule is different right now" is
// to ask at the point the rule lives. Only Pyre needs to *do* something each
// frame, and it says so by owning the one tick() below.

export type SkillId =
  | 'overwatch' | 'blink' | 'bulwark' | 'pyre'
  | 'mark' | 'windfall' | 'quake' | 'salvo';

export interface SkillDef {
  id: SkillId;
  title: string;
  /** What it does, in the language of what goes wrong without it. */
  desc: string;
  /** Single glyph for the button. Readable at a glance with a thumb over it. */
  icon: string;
  cooldown: number;
  /** Seconds the effect lasts. Absent for skills that resolve on the spot. */
  duration?: number;
  /** Fires once, on the press. */
  cast: (world: World, power: number) => void;
  /** Runs every frame while the effect is live. Only Pyre needs one. */
  tick?: (world: World, dt: number, power: number) => void;
}

const C = CONFIG.skills;

// Which way a cast points. The stick wins while it is being pushed, because a
// skill cast mid-run should go where the player is *heading* — `facing` is
// whatever the auto-aim last swung the body onto, which during a retreat is
// behind you, and blinking backwards into the pack you are fleeing is not a
// mistake a player would ever accept as their own.
function aimDir(world: World): Vec2 {
  const { input, player } = world;
  return input.moving ? normalize(input.axis) : player.facing;
}

/** Every living body, player-side targeting order. The boss is not in `enemies`. */
function targets(world: World): { pos: Vec2; radius: number }[] {
  const out: { pos: Vec2; radius: number }[] = [];
  for (const e of world.enemies) if (e.alive) out.push(e);
  if (world.boss && world.boss.alive) out.push(world.boss);
  return out;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'overwatch',
    title: 'Overwatch',
    desc: 'Keep firing while you run, for four seconds.',
    icon: '🎯',
    cooldown: C.overwatch.cooldown,
    duration: C.overwatch.duration,
    cast: (world) => {
      // Nothing to do here: combat.ts asks whether this is live. The skill IS
      // the timer, which is what makes it the clearest statement of the rule
      // every other skill on this list is bending.
      emitRing(world, world.player.pos, world.player.radius * 4, '#8fae54');
    },
  },

  {
    id: 'blink',
    title: 'Blink',
    desc: 'Jump clear, straight through whatever is in the way.',
    icon: '💨',
    cooldown: C.blink.cooldown,
    cast: (world, power) => {
      const p = world.player;
      const dir = aimDir(world);
      const from = { x: p.pos.x, y: p.pos.y };

      // Walk the jump backwards until it lands somewhere legal. Only the
      // DESTINATION is tested, never the path — passing through cover is the
      // whole point of the skill, and it is the one privilege in the game that
      // treats a wall as though it were not there.
      //
      // Stepping back rather than failing outright matters on a phone: a blink
      // aimed at a wall two feet away should carry you as far as it can, not
      // eat the cooldown and leave you standing in the same spot wondering
      // whether the button is broken.
      const full = C.blink.distance * power;
      const steps = 8;
      for (let i = steps; i >= 1; i--) {
        const d = (full * i) / steps;
        const x = from.x + dir.x * d;
        const y = from.y + dir.y * d;
        if (!blocked(x, y, p.radius, world.obstacles)) {
          p.pos.x = x;
          p.pos.y = y;
          break;
        }
      }
      confine(p.pos, p.radius, world);

      // Read the jump at both ends, or it looks like a rendering glitch.
      emitRing(world, from, p.radius * 3.5, '#3ecf8f');
      emitRing(world, p.pos, p.radius * 3.5, '#3ecf8f');
      emitFlash(world, p.pos, dir, p.radius * 2.4, '#b6ffe4');
    },
  },

  {
    id: 'bulwark',
    title: 'Bulwark',
    desc: 'Slam: shield back to full, everything shoved off you, and three seconds of armour.',
    icon: '🛡️',
    cooldown: C.bulwark.cooldown,
    duration: C.bulwark.duration,
    cast: (world, power) => {
      const p = world.player;
      const c = C.bulwark;

      p.shield = p.shieldMax; // he always has a pool; the hero's apply() built one

      // Shove, rather than damage. Bastion's problem is never that the room has
      // too much health, it is that he cannot walk out of a crowd — so the skill
      // buys distance, which is the thing his legs cannot.
      const push = c.knockback * power;
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const d = dist(p.pos, e.pos);
        if (d > c.radius) continue;

        const away = normalize(sub(e.pos, p.pos));
        e.pos.x += away.x * push;
        e.pos.y += away.y * push;
        // Never shove a body into geometry — a chaser wedged inside a crate is
        // a chaser the wall-following AI has to dig back out of.
        resolveCircle(e.pos, e.radius, world.obstacles, world.bounds);
      }

      emitRing(world, p.pos, c.radius * 2, '#4c8ff0');
      addShake(world, CONFIG.fx.shake.enemyDeath);
      haptic('heavy');
    },
  },

  {
    id: 'pyre',
    title: 'Pyre',
    desc: 'The ground around you burns for four seconds.',
    icon: '🔥',
    cooldown: C.pyre.cooldown,
    duration: C.pyre.duration,
    cast: (world) => {
      emitRing(world, world.player.pos, C.pyre.radius * 2, '#ff7a3c');
    },
    tick: (world, _dt, power) => {
      const p = world.player;
      const c = C.pyre;
      const stacks = c.stacks * power;

      // Refreshing the SAME Blaze burn the draft hands out, rather than dealing
      // damage of its own. Everything downstream — the tick rate, the orange
      // numbers, who gets the kill credit and therefore the loot — is already
      // built and already correct. A second damage-over-time path would be a
      // second set of all of it, drifting from this one immediately.
      for (const e of world.enemies) {
        if (e.alive && dist(p.pos, e.pos) <= c.radius + e.radius) {
          applyBurn(e.status, stacks);
        }
      }
      const b = world.boss;
      if (b && b.alive && dist(p.pos, b.pos) <= c.radius + b.radius) {
        applyBurn(b.status, stacks);
      }
    },
  },

  {
    id: 'mark',
    title: 'Mark',
    desc: 'Every shot lands critical for three and a half seconds.',
    icon: '🎲',
    cooldown: C.mark.cooldown,
    duration: C.mark.duration,
    cast: (world) => {
      emitRing(world, world.player.pos, world.player.radius * 4, '#d4b25a');
    },
  },

  {
    id: 'windfall',
    title: 'Windfall',
    desc: 'Every coin in the room comes to you, and you move faster while it does.',
    icon: '🧲',
    cooldown: C.windfall.cooldown,
    duration: C.windfall.duration,
    cast: (world) => {
      // Latch the magnet the pickups already own instead of teleporting the
      // loot in. They fly the same arc they always do, so the skill reads as a
      // very strong version of walking over them rather than as a different
      // mechanic that happens to pay the same.
      for (const pk of world.pickups) {
        pk.magnet = true;
        // A coin two seconds from rotting must survive the trip, or the skill
        // would visibly pull loot in and then delete it in front of the player.
        if (pk.life < C.windfall.duration) pk.life = C.windfall.duration + 1;
      }
      emitRing(world, world.player.pos, world.player.radius * 5, '#cfc6ae');
      sfx('coin');
    },
  },

  {
    id: 'quake',
    title: 'Quake',
    desc: 'Slam the floor. Heavy damage in a wide ring, and everything in it is chilled.',
    icon: '💥',
    cooldown: C.quake.cooldown,
    cast: (world, power) => {
      const p = world.player;
      const c = C.quake;

      // Scaled off the player's own damage so it keeps pace with the build. A
      // flat number here would be a room-two nuke and a room-thirty tickle.
      spawnBlast(world, p.pos, c.radius, p.damage * c.damageMult * power, c.fuse, false);

      // Chill, not knockback. Brack's damage comes from thorns — from being
      // hit — so shoving the wave off him would be his own skill dismantling
      // his build. Holding them still, next to him, is the version that agrees
      // with the hero.
      for (const e of world.enemies) {
        if (e.alive && dist(p.pos, e.pos) <= c.radius + e.radius) {
          applyFrost(e.status, c.frost * power);
        }
      }
      const b = world.boss;
      if (b && b.alive && dist(p.pos, b.pos) <= c.radius + b.radius) {
        applyFrost(b.status, c.frost * power);
      }

      addShake(world, CONFIG.fx.shake.enemyDeath);
      haptic('heavy');
    },
  },

  {
    id: 'salvo',
    title: 'Salvo',
    desc: 'One seeking shot at every enemy on the floor, at once.',
    icon: '✨',
    cooldown: C.salvo.cooldown,
    cast: (world, power) => {
      const p = world.player;
      const c = C.salvo;

      // No line-of-sight test, on purpose: ignoring cover is the one thing
      // Iris's build already does, so her skill does it completely.
      const all = targets(world);

      // Hard cap. "One per enemy" in a deep room with a thickened wave is
      // exactly the shape of a frame-rate bug, and this is a mobile game —
      // the extras fan off the nearest targets instead, which puts the same
      // damage on screen for a bounded number of draws.
      const list = all
        .map((t) => ({ t, d: dist(p.pos, t.pos) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, c.maxShots);

      for (const { t } of list) {
        spawnPlayerShot(world, normalize(sub(t.pos, p.pos)), {
          mult: c.damageMult * power,
          homing: c.homing,
        });
      }

      // Nothing to shoot at should still look like a cast, not a dead button —
      // but it must not eat the cooldown for free either, so it fires a token
      // spread and lets the cost stand.
      if (list.length === 0) {
        const dir = aimDir(world);
        for (let i = -1; i <= 1; i++) {
          spawnPlayerShot(world, rotate(dir, i * 0.25), {
            mult: c.damageMult * power,
            homing: c.homing,
          });
        }
      }

      emitRing(world, p.pos, p.radius * 4.5, '#9fb3c8');
    },
  },
];

const BY_ID = new Map<string, SkillDef>(SKILLS.map((s) => [s.id, s]));

/**
 * The skill a hero carries, or null.
 *
 * Null is a real answer, not an error: the id comes off a hero definition and
 * travels through a save, so a build that renamed one has to degrade to "this
 * hero has no button" rather than crash a run in progress.
 */
export function getSkill(id: string): SkillDef | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Is this specific skill running right now?
 *
 * Asked at the point each rule lives — combat.ts for the two that change how
 * shooting works, playerDamage.ts for the one that changes what gets through.
 * Naming the id at the call site is what keeps `skillTimer` honest: one timer
 * can only ever mean one thing, and the caller says which.
 */
export function skillActive(p: Player, id: SkillId): boolean {
  return p.skillTimer > 0 && p.skill === id;
}

/** 0..1, how much of the cooldown has refilled. 1 = ready. */
export function skillCharge(p: Player): number {
  if (p.skillCdMax <= 0) return 1;
  return Math.min(1, 1 - p.skillCd / p.skillCdMax);
}

/**
 * Ask for a cast. Called by the button, never by the simulation.
 *
 * Deliberately does NOT fire anything. The press only opens a window, which
 * updateSkills spends on the next tick if it can — so the "am I allowed to
 * cast" rules live in exactly one place and cannot be answered differently by
 * the UI than by the game.
 */
export function requestSkill(world: World) {
  world.input.skillHeld = CONFIG.skills.bufferTime;
}

export function updateSkills(world: World, dt: number) {
  const p = world.player;
  const def = getSkill(p.skill);
  if (!def) return;

  if (p.skillCd > 0) {
    p.skillCd -= dt;
    if (p.skillCd <= 0) {
      p.skillCd = 0;
      // The player's eyes are on the arena, not on the button. A cooldown that
      // finishes silently is one the player only discovers by looking away from
      // the fight, which is the moment they get hit.
      sfx('skillReady');
    }
  }

  // Timed effects tick down BEFORE a new cast can be honoured, so a skill can
  // never be re-cast on top of itself within the same frame it expires.
  if (p.skillTimer > 0) {
    p.skillTimer = Math.max(0, p.skillTimer - dt);
    if (def.tick) def.tick(world, dt, p.skillPower);
  }

  if (world.input.skillHeld > 0) {
    world.input.skillHeld -= dt;
    if (p.skillCd <= 0) {
      world.input.skillHeld = 0;
      p.skillCd = def.cooldown;
      p.skillCdMax = def.cooldown;
      p.skillTimer = def.duration ?? 0;
      def.cast(world, p.skillPower);
      sfx('skill');
      haptic('medium');
    }
  }
}
