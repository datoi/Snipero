import { Vec2 } from './vec';
import { AbilityId } from '../systems/abilities';

// The enemy archetypes (mirrors the Unity EnemyArchetype enum).
export type EnemyKind = 'chaser' | 'shooter' | 'charger' | 'bomber';

// Shared AI state machine. Named for the charger because it was the first to
// need one, but the bomber runs the same three beats — approach, telegraph,
// commit — so it reuses the states rather than carrying a second enum and a
// second timer for the identical shape.
export type EnemyState = 'idle' | 'windup' | 'charging';

// Overall run state. Everything except 'playing' freezes the simulation; only
// cosmetics keep ticking, so a death burst finishes behind the overlay.
export type RunStatus = 'playing' | 'drafting' | 'paused' | 'dead' | 'won';

// ── Status effects ──
// Debuffs a player shot can leave on a body. Shared by Enemy and Boss so the
// tick loop and every "how fast does this thing move" check has one shape to
// deal with rather than two near-identical ones.
export interface Status {
  burnTime: number;   // seconds of burn remaining
  burnDps: number;    // damage per second while it lasts
  burnTick: number;   // seconds until the next discrete burn tick
  slowTime: number;   // seconds of slow remaining
  slowMult: number;   // movement multiplier while slowed (1 = unaffected)
}

// How a weapon delivers its shot.
//   single — one volley per cooldown (bow, staff)
//   arc    — the same volley, fanned wide and short (scythe)
//   burst  — several volleys in quick succession, then a long reload (repeater)
// `arc` needs no firing logic of its own: it is `single` with a wider fan and
// more projectiles, which the existing spread code already handles. Only burst
// changes the shape of time, so only burst gets state.
export type ShotPattern = 'single' | 'arc' | 'burst';

// The player hero.
export interface Player {
  pos: Vec2;
  facing: Vec2;
  radius: number;
  speed: number;        // px/sec
  hp: number;
  maxHp: number;

  /** Body colour, set by the chosen hero. The rim stays constant so "that's me"
   *  still reads instantly whatever colour the hero is. */
  color: string;

  // Combat stats (modified live by drafted ability cards).
  damage: number;
  attackRate: number;   // shots per second
  range: number;        // px — auto-aim range
  projectilesPerShot: number;
  spreadDeg: number;    // angle between multishot projectiles
  pierce: number;       // how many extra enemies a shot passes through

  // Behavioral modifiers from drafted cards. These change *how* the player
  // shoots rather than how big the numbers are — they're what makes one run
  // play differently from the next, so they all stack and compound.
  bounces: number;      // ricochet: wall bounces before a shot dies
  sideShots: number;    // extra projectiles fired at ±90°
  rearShots: number;    // extra projectiles fired backward
  critChance: number;   // 0..1 chance a shot rolls critical
  critMult: number;     // damage multiplier on a crit
  burn: number;         // blaze stacks applied on hit (0 = no burn)
  frost: number;        // frost stacks applied on hit (0 = no slow)

  // How many times each card has been taken. Drives stack caps and the "Lv N"
  // readout on the draft cards.
  stacks: Partial<Record<AbilityId, number>>;

  // Fraction of incoming damage ignored (armour). Applied in one place, so a
  // future shield or dodge stat has an obvious home next to it.
  resist: number;

  // ── Defensive layers, all resolved in damagePlayer ──
  shieldMax: number;    // 0 = no shield card taken
  shield: number;       // current absorb pool
  shieldTimer: number;  // seconds of not-being-hit before it starts refilling
  thorns: number;       // damage returned to whatever touched you

  // ── Offensive behaviours ──
  // Ramping damage while standing still. This one exists to push on the game's
  // central tension rather than to add a number: holding your ground is already
  // how you shoot, and this makes holding it *longer* worth something.
  focus: number;        // stacks; 0 = no ramp
  homing: number;       // stacks of projectile steering
  detonate: number;     // stacks; kills leave a blast behind
  lifesteal: number;    // fraction of damage dealt returned as HP
  goldBonus: number;    // multiplier on gold picked up
  magnetBonus: number;  // extra pickup radius, in px

  // How the equipped weapon delivers a shot. Stat multipliers make a weapon
  // stronger; this is what makes one feel different from another.
  pattern: ShotPattern;
  burstLeft: number;    // shots remaining in the current burst
  burstTimer: number;   // seconds until the next shot of that burst

  // Beat between planting your feet and the first shot. Per-player rather than a
  // constant because it is the number a hero is most worth changing — it sets
  // the whole rhythm of stop-and-shoot.
  settleDelay: number;

  cooldown: number;     // seconds until next shot is allowed
  stillTime: number;    // how long the player has been standing still

  // Progression.
  level: number;
  xp: number;
  xpToNext: number;
}

// One enemy. Fields for all archetypes live here; each kind uses the ones it needs.
export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number; // damage/sec while touching the player
  color: string;
  xpReward: number;
  goldReward: number;
  alive: boolean;
  hitFlash: number;      // cosmetic: seconds of white flash left after a hit

  attackTimer: number;      // shooter: seconds until next shot
  projectileDamage: number; // shooter: damage per shot, already depth-scaled
  blastDamage: number;      // bomber: detonation damage, already depth-scaled

  state: EnemyState;     // charger/bomber: current AI state
  stateTimer: number;    // time left in the current state (or cooldown)
  chargeDir: Vec2;       // charger: locked direction during a dash

  // Wall-following. When cover blocks the approach, a direction is chosen once
  // and held — re-deciding every frame makes a body dither at a corner where
  // the two candidate directions are near-equally good, and never round it.
  // A commitment is also *audited* when it expires: a direction that spent the
  // whole window without converting attempted travel into actual displacement
  // was the wrong way round the box, and gets reversed. Judging it by ground
  // covered rather than by distance to the player keeps the test immune to the
  // player's own movement and to frost slowing the body down.
  slideDir: Vec2;
  slideTimer: number;    // seconds left on the current commitment
  slideFrom: Vec2;       // where the body stood when this commitment began
  slideTravel: number;   // distance it has *tried* to cover since then
  slideFails: number;    // consecutive fruitless commitments; each one widens the next window

  // Long-horizon stuck watchdog. The per-window audit above only sees one
  // commitment at a time, and a body that alternates between "wedged" and
  // "briefly free" clears that state before it ever accumulates — which is how
  // a charger could sit in a corner for 25s while every individual window
  // looked healthy. These two persist across that oscillation.
  bestD: number;         // closest it has got to the player since the last re-baseline
  stuckTravel: number;   // distance it could have walked since bestD last improved

  status: Status;        // burn / slow left on it by player shots
}

// A projectile (used for both the player's shots and enemy shots).
export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  life: number;      // seconds remaining
  pierce: number;    // remaining enemies it can pass through (player shots)
  hitIds: number[];  // enemy ids already hit, so it doesn't re-hit them
  alive: boolean;

  // Modifiers baked in when the shot was fired, so a projectile already in
  // flight keeps the build that launched it even if the player levels mid-air.
  bounces: number;   // remaining wall bounces (ricochet)
  burn: number;      // blaze stacks to apply on hit
  frost: number;     // frost stacks to apply on hit
  crit: boolean;     // rolled critical — drives the bigger, tinted number
  homing: number;    // stacks of steering; 0 = flies straight
}

// ── Room structure ──
// A run is combat rooms punctuated by a boss, then a breather to spend the
// win on. Without the breather every room is the same beat at a louder volume.
export type RoomType = 'combat' | 'boss' | 'reward';

// What a shrine gives you, and what it takes.
//   chest  — gold, healing and a piece of equipment. The safe pick.
//   angel  — a free ability card.
//   devil  — two cards, paid for out of your maximum health.
//   font   — heal to full. Worthless when you're healthy, priceless when not.
//   forge  — a card, bought with the gold you picked up this run.
export type ShrineId = 'chest' | 'angel' | 'devil' | 'font' | 'forge';

// One offer in a reward room. Three spawn; taking one dissolves the rest, so
// the room is a decision rather than a lap of the arena collecting everything.
export interface Shrine {
  id: number;
  kind: ShrineId;
  pos: Vec2;
  radius: number;
  goldCost: number;      // 0 for the free ones
  hpCostFrac: number;    // fraction of MAX hp, charged on claim
  claimed: boolean;
  openTimer: number;     // beat between claiming and the payout landing
  paid: boolean;         // guards the payout so it can only ever fire once
  dissolving: boolean;   // a sibling was taken; this one is fading out
}

// ── Blasts ──
// A delayed area detonation: it lands, telegraphs, then hurts whatever is inside
// its radius. Deliberately not owned by the bomber that usually spawns it — the
// fuse/telegraph/damage shape is the same for a boss bomb or a destructible
// barrel, and a second copy of it would drift from this one immediately.
//
// The fuse is the whole point. An instant explosion on death would punish the
// player for a kill the auto-aim chose for them; a telegraphed one turns it into
// a readable "back off now".
export interface Blast {
  id: number;
  pos: Vec2;
  radius: number;
  damage: number;
  fuse: number;      // seconds until detonation
  maxFuse: number;   // for the telegraph ramp
  hostile: boolean;  // true = hurts the player; false = hurts enemies
  done: boolean;     // detonated; filtered out at the end of the tick
}

// ── Drops ──
export type PickupKind = 'coin' | 'heart' | 'gear';

// A reward that pops out of a corpse and has to be walked over to be claimed.
// Gold is no longer credited on kill — it's on the floor until you go get it,
// which is what pulls the player out of a safe corner.
export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec2;
  vel: Vec2;        // outward pop, damped over time
  value: number;    // gold amount, or HP healed
  life: number;     // seconds before it despawns
  magnet: boolean;  // latched onto the player and homing in
  bob: number;      // phase offset so a pile doesn't bob in lockstep

  /** Which item this is, for 'gear' drops. Untyped here to keep engine/ free of
   *  a systems/ import; the id is validated against the table when it's banked. */
  gearId?: string;
}

// ── Presentation FX ──
// Purely cosmetic state. Nothing here feeds back into the simulation, so it can
// be tuned or stripped without touching a single balance number.

export interface Particle {
  id: number;
  pos: Vec2;
  vel: Vec2;
  life: number;      // seconds remaining
  maxLife: number;   // for fading
  size: number;
  color: string;
  round: boolean;    // circle vs square chip
}

// A floating "-24" that rises off whatever just got hit.
export interface DamageNumber {
  id: number;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  amount: number;
  size: number;
  color: string;
}

export interface Fx {
  particles: Particle[];
  numbers: DamageNumber[];
  shake: number;     // remaining shake magnitude, px
  shakeX: number;    // this frame's camera offset
  shakeY: number;
  flash: number;     // red full-screen flash on player damage, 0..1
}

// A solid, axis-aligned block of cover. Blocks movement AND projectiles, for the
// player and enemies alike. Stored by center + size so it matches how Door works.
export interface Obstacle {
  pos: Vec2;   // center
  w: number;
  h: number;
}

// The exit door for a room. Opens once the room is cleared.
export interface Door {
  pos: Vec2;     // center
  width: number;
  height: number;
  open: boolean;
}

// ── Boss ──
export type BossAttackId = 'radial' | 'volley' | 'charge' | 'bombs';
export type BossState = 'intro' | 'idle' | 'windup' | 'attacking' | 'recover';

export interface Boss {
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  contactDamage: number;
  phase: number;                     // index into the phase table (rises as HP drops)
  state: BossState;
  stateTimer: number;
  currentAttack: BossAttackId | null;
  atkTimer: number;                  // scratch: time to next volley shot
  atkShotsLeft: number;              // scratch: volley shots remaining
  chargeDir: Vec2;                   // scratch: locked dash direction
  hitFlash: number;                  // cosmetic: white flash after a hit
  alive: boolean;
  status: Status;                    // burn / slow left on it by player shots
  dmgMult: number;                   // depth scaling applied to its attacks
  variant: number;                   // index into CONFIG.boss.variants — which fight this is
}

// Live input written by the Joystick each frame.
export interface InputState {
  axis: Vec2;    // range roughly -1..1
  moving: boolean;
}

export type RoomPhase = 'fighting' | 'cleared';

// The whole game world — one mutable object updated in place each frame.
export interface World {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];       // player's shots
  enemyProjectiles: Projectile[];  // enemies' shots
  door: Door;
  obstacles: Obstacle[];           // cover for the current room
  pickups: Pickup[];               // dropped loot waiting to be collected
  blasts: Blast[];                 // fuses burning down toward a detonation
  boss: Boss | null;
  shrines: Shrine[];               // set only in a reward room
  roomIndex: number;
  roomType: RoomType;

  // Which chapter this run is playing, and whether it has an end at all.
  // Endless reuses the deepest chapter's tables and simply never stops.
  chapter: number;
  endless: boolean;
  phase: RoomPhase;

  // Run + progression state.
  status: RunStatus;
  draftOptions: AbilityId[];       // the 3 cards currently offered
  pendingDrafts: number;           // queued level-ups awaiting a pick
  enemiesKilled: number;
  runGold: number;                 // gold earned this run (banked at run end)
  gearFound: string[];             // equipment picked up this run, awaiting banking

  fx: Fx;                          // cosmetic only — never read by game logic
  input: InputState;
  bounds: { w: number; h: number };
  nextId: number;
  time: number;
}
