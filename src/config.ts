import { BossAttackId, EnemyKind } from './engine/types';

// Central tuning knobs — the TypeScript equivalent of Unity's ScriptableObject
// data assets. Change these numbers to re-balance; no logic edits needed.
export const CONFIG = {
  player: {
    radius: 18,
    speed: 230,              // px/sec
    maxHp: 100,
    damage: 20,              // base projectile damage
    attackRate: 3,           // shots/sec
    range: 340,              // px — won't fire at enemies farther than this
    projectilesPerShot: 1,
    spreadDeg: 14,           // angle between multishot projectiles
    pierce: 0,
    settleDelay: 0.08,       // must stand still this long before the first shot
  },
  projectile: {
    radius: 6,
    speed: 560,              // px/sec
    life: 2,                 // seconds before it despawns
  },

  progression: {
    baseXpToNext: 8,         // XP needed for level 2

    // How often each rarity shows up in a draft. Commons are the filler that
    // keeps damage climbing; epics are the cards a run gets *built* around, so
    // they stay scarce enough that landing one feels like a fork in the road.
    rarityWeight: { common: 62, rare: 30, epic: 8 } as Record<string, number>,
  },

  // Per-stack strength of the behavioral cards. Kept together so the whole
  // build system can be re-balanced without hunting through the ability table.
  abilities: {
    ricochet: { bouncesPerStack: 1 },
    sideShot: { angleDeg: 90 },
    rearShot: { angleDeg: 180 },

    // Crit is deliberately swingy rather than a flat DPS bump — the spikes are
    // what make it feel different from just taking Power again.
    crit: { chancePerStack: 0.12, mult: 2.2, maxChance: 0.75 },

    // Burn ignores armor-style scaling entirely: it's flat DPS, which makes it
    // strongest against the boss and weakest against trash. That's the point —
    // it gives the epic a role that raw damage doesn't fill.
    blaze: { dpsPerStack: 9, duration: 3, tickInterval: 0.25 },

    // Frost buys space instead of dealing damage. Since the player can only
    // shoot while standing still, slowing the wave down *is* offense.
    frost: { slowPerStack: 0.18, maxSlow: 0.6, duration: 2 },
  },

  // One config block per enemy archetype.
  enemies: {
    // How long an enemy commits to a wall-follow direction once cover blocks
    // its approach. Long enough to round a corner; short enough that it goes
    // back to chasing the moment the way is clear.
    slideCommit: 0.5,

    // A commitment that covers no ground gets reversed, and each consecutive
    // failure widens the next window by another `slideCommit`. Capped, because
    // past a few seconds the body is no longer pathing — it's wandering.
    maxSlideBackoff: 4,

    // How far a body may walk without ever getting closer to the player before
    // it's treated as stuck and forced to try the other way round.
    //
    // Measured in distance rather than seconds on purpose: a frosted body covers
    // far less ground per second, and a time limit would declare it stuck for
    // being slowed. Comfortably longer than a legitimate traverse — the tallest
    // face in the layout table is ~170px and the long way round a box is ~210px
    // — but short enough to catch a body wobbling against a corner, which covers
    // ground at a crawl and would otherwise sit there for half a minute.
    stuckTravelBudget: 250,

    // How far the player must pull away before a body re-baselines its "closest
    // I've been" mark. Without this, a player kiting backwards keeps every
    // enemy permanently failing the watchdog, and the whole wave detours
    // instead of chasing.
    stuckRebase: 60,

    chaser: {
      radius: 20,
      maxHp: 60,
      speed: 70,
      contactDamage: 12,
      color: '#e5484d',        // red
      xpReward: 4,
      goldReward: 3,
    },
    shooter: {
      radius: 18,
      maxHp: 40,
      speed: 55,
      contactDamage: 8,
      color: '#f2a20c',        // orange
      xpReward: 6,
      goldReward: 5,
      preferredRange: 250,     // tries to hold this distance from the player
      attackCooldown: 1.5,     // seconds between shots
      projectileSpeed: 320,
      projectileDamage: 10,
      projectileRadius: 7,
    },
    charger: {
      radius: 24,
      maxHp: 95,
      speed: 55,               // slow creep while winding up
      contactDamage: 18,
      color: '#b05cf0',        // purple
      xpReward: 12,
      goldReward: 10,
      triggerRange: 320,       // starts a charge when player is within this
      windup: 0.7,             // telegraph time before dashing
      chargeSpeed: 640,        // dash speed
      chargeDuration: 0.45,    // how long the dash lasts
      cooldown: 1.4,           // rest before it can charge again
    },
  },

  enemyProjectile: {
    life: 3.5,
  },

  // Boss appears every Nth room. The room straight after each boss is a chest
  // room — a breather to spend the win on before the next wave.
  bossEvery: 4,

  // How a run gets harder the deeper it goes.
  //
  // Without this the room table just loops: room 20 is exactly room 4 with a
  // twenty-levels-stronger player, so a run has no end condition and the whole
  // ability system stops mattering once you're ahead of the curve. Scaling is
  // compounding per room, which is the only shape that keeps pace with a player
  // whose damage is also multiplicative.
  difficulty: {
    enemyHpPerRoom: 0.13,      // compounding, so depth outruns flat damage cards
    enemyDamagePerRoom: 0.055, // slower than HP — deaths should come from swarm, not one-shots
    rewardPerRoom: 0.07,       // gold/XP keep pace so leveling never stalls out
    bossHpPerBoss: 0.5,        // each boss is a real step up, not a reskin
    bossDamagePerBoss: 0.12,

    // Extra bodies on top of the room's table entry, so waves thicken as well
    // as toughen. Capped — past a point more enemies is just more lag.
    extraEnemyEveryRooms: 3,
    maxExtraEnemies: 6,
  },

  // Minimum gap between the player's spawn point and any enemy's, on top of
  // both radii. The spawn ring's lowest point sits almost exactly on the player
  // start, so without this one enemy per room lands already touching them —
  // free damage before the player has had a single frame to react.
  spawnClearance: 90,

  chest: {
    radius: 26,
    openRange: 30,     // extra distance past the radii at which it pops open
    openTime: 0.4,     // beat between the lid opening and the reward landing
    gold: 45,
    hearts: 2,
    heartHeal: 20,
  },

  boss: {
    radius: 46,
    maxHp: 900,
    contactDamage: 22,
    xpReward: 60,
    goldReward: 80,
    introTime: 1.3,
    moveSpeed: 90,
    preferredRange: 260,   // distance it tries to hold while repositioning
    recover: 0.45,         // pause after an instant attack

    // Phases activate as HP fraction drops to/below each threshold. Deeper
    // phases add attacks and move/act faster.
    phases: [
      { threshold: 1.0, attacks: ['radial', 'volley'],           speedMult: 1.0,  gapTime: 1.0,  color: '#c0392b' },
      { threshold: 0.6, attacks: ['radial', 'volley', 'charge'], speedMult: 1.15, gapTime: 0.8,  color: '#e04836' },
      { threshold: 0.3, attacks: ['radial', 'volley', 'charge'], speedMult: 1.35, gapTime: 0.55, color: '#ff5a3c' },
    ] as { threshold: number; attacks: BossAttackId[]; speedMult: number; gapTime: number; color: string }[],

    radial: { count: 16, telegraph: 0.7, projSpeed: 260, damage: 12, projRadius: 8 },
    volley: { shots: 5, interval: 0.14, telegraph: 0.5, projSpeed: 360, damage: 10, projRadius: 7 },
    charge: { telegraph: 0.7, speed: 680, duration: 0.55, recover: 0.5 },
  },

  door: {
    width: 96,
    height: 26,
    marginTop: 64,   // distance from the top of the screen
  },

  joystick: {
    radius: 70,          // max knob travel in px
    deadZone: 0.15,      // below this magnitude = treated as standing still
  },

  // Loot. Kills drop gold on the floor rather than crediting it instantly, so
  // clearing a room is only half the job — you still have to go collect it,
  // which drags the player out of whatever safe corner they were holding.
  pickups: {
    radius: 11,
    life: 14,            // seconds on the floor before it fades
    popSpeed: [60, 170], // outward scatter when it drops
    drag: 3.2,           // per-second damping on that pop
    bobAmp: 3,           // px of idle float, cosmetic
    bobSpeed: 5,

    magnetRadius: 105,   // player gets this close → it starts homing
    magnetSpeed: 620,    // homing speed
    magnetAccel: 5.5,    // eases up to full speed instead of snapping
    collectRadius: 22,   // distance at which it's actually claimed

    // Gold is split into coins so a big reward reads as a shower, not one blob.
    coinsPerDrop: [1, 3],
    maxCoinsPerDrop: 8,

    // Hearts are the pressure valve — the only in-run healing that exists.
    heartChance: 0.11,   // per enemy kill
    heartHeal: 12,
    bossHearts: 3,
    bossHeartHeal: 20,
    bossCoins: 10,
  },

  // Presentation only. These numbers change how the game *reads*, never how it
  // plays — nothing under `fx` is consulted by a single gameplay system.
  fx: {
    maxParticles: 140,   // hard cap; oldest are dropped first

    // Damage numbers need their own cap, and a tighter one: each is a text node,
    // the most expensive thing this renderer draws. A maxed multishot build puts
    // out ~80 projectiles/sec, so an uncapped list is the one FX pool that can
    // actually outgrow the particles it sits next to.
    maxNumbers: 48,
    particleDrag: 4.5,   // per-second velocity damping
    hitFlashTime: 0.11,  // how long a struck body stays white

    // Floating damage numbers: launched upward, decelerating as they fade.
    number: {
      life: 0.7,
      riseSpeed: 105,    // initial upward speed
      gravity: 150,      // pulls the rise to a stop
      drift: 34,         // random horizontal spread so stacked hits separate
      size: 15,          // font size at base damage
      maxSize: 26,       // font size cap for big hits
      color: '#ffffff',
      bossColor: '#ff9f5e',   // damage dealt to the boss
      goldColor: '#ffd45e',   // gold collected
      healColor: '#4ade80',   // HP restored
      critColor: '#ffe066',   // critical hit — reads hotter than a normal hit
      burnColor: '#ff7a3c',   // burn tick
    },

    hitSpark:  { count: 4,  speed: [70, 190],  life: 0.22, size: 3, color: '#ffe9a8' },
    death:     { count: 11, speed: [90, 280],  life: 0.5,  size: 4 },
    wallSpark: { count: 3,  speed: [50, 150],  life: 0.2,  size: 3, color: '#8b93a7' },
    muzzle:    { count: 2,  speed: [90, 170],  life: 0.1,  size: 2, color: '#ffffff' },

    // Screen shake, in px of camera offset. `decay` is px/sec of falloff.
    shake: {
      decay: 26,
      max: 20,           // ceiling so stacked events can't wreck the screen
      playerHit: 7,
      enemyDeath: 2.5,
      chargerSlam: 6,
      bossSlam: 14,
      bossRadial: 5,
      bossDeath: 20,
    },

    // Red full-screen flash when the player takes damage.
    flash: {
      decay: 3.4,        // opacity/sec falloff
      playerHit: 0.34,
      contact: 0.16,     // contact damage is continuous — keep this subtle
    },
  },

  // Cover. Blocks movement and shots for both sides, so standing still to fire
  // now means finding an angle rather than just finding a gap in the bullets.
  obstacles: {
    color: '#333947',
    edgeColor: '#454c5e',
    doorClearance: 30,   // px of walkable margin kept around the exit door
    // Narrowest lane a layout may leave against the arena edge. Anything tighter
    // than a body can fit down gets snapped flush to the wall instead.
    //
    // This has to clear the LARGEST body that needs to path, not the player's.
    // Sized at 44 (player diameter 36 + threading room) it let the table leave
    // 47px lanes, which a charger — 48px across — physically cannot enter. Room
    // 4's right-hand block did exactly that, and a charger that picked that side
    // wedged in the gap permanently, because no amount of wall-following gets a
    // body down a lane narrower than the body. 52 = charger diameter (48) plus
    // threading room. Raise this if a wider enemy is ever added.
    minLaneWidth: 52,

    // Positions are fractions of the arena (x/y = center, w/h = size), so a
    // layout reads the same on every screen size. Index matches `rooms` below,
    // so room N always pairs the same wave with the same cover.
    layouts: [
      // Room 1 — two low blocks to break up a straight chase.
      [
        { x: 0.22, y: 0.45, w: 0.16, h: 0.09 },
        { x: 0.78, y: 0.45, w: 0.16, h: 0.09 },
      ],
      // Room 2 — a center wall the shooters will camp behind.
      [
        { x: 0.50, y: 0.42, w: 0.30, h: 0.08 },
        { x: 0.15, y: 0.68, w: 0.12, h: 0.15 },
        { x: 0.85, y: 0.68, w: 0.12, h: 0.15 },
      ],
      // Room 3 — tall pillars: hard cover against shooters, charger bait.
      [
        { x: 0.30, y: 0.34, w: 0.09, h: 0.18 },
        { x: 0.70, y: 0.34, w: 0.09, h: 0.18 },
        { x: 0.50, y: 0.63, w: 0.22, h: 0.07 },
      ],
      // Room 4 — a cluttered arena for the big mixed wave.
      [
        { x: 0.50, y: 0.50, w: 0.10, h: 0.20 },
        { x: 0.19, y: 0.31, w: 0.14, h: 0.07 },
        { x: 0.81, y: 0.31, w: 0.14, h: 0.07 },
        { x: 0.19, y: 0.73, w: 0.14, h: 0.07 },
        { x: 0.81, y: 0.73, w: 0.14, h: 0.07 },
      ],
    ] as { x: number; y: number; w: number; h: number }[][],

    // Boss rooms stay open — the boss needs lanes to charge down, and heavy
    // cover would let the player trivially wall off every attack.
    bossLayout: [
      { x: 0.17, y: 0.60, w: 0.10, h: 0.09 },
      { x: 0.83, y: 0.60, w: 0.10, h: 0.09 },
    ] as { x: number; y: number; w: number; h: number }[],
  },

  // Room-by-room progression. Each room is a list of {kind, count}. Rooms get
  // harder; after the last one it loops (roomIndex keeps climbing for the label).
  rooms: [
    [{ kind: 'chaser', count: 4 }],
    [{ kind: 'chaser', count: 3 }, { kind: 'shooter', count: 2 }],
    [{ kind: 'shooter', count: 3 }, { kind: 'charger', count: 1 }],
    [{ kind: 'chaser', count: 4 }, { kind: 'shooter', count: 2 }, { kind: 'charger', count: 2 }],
  ] as { kind: EnemyKind; count: number }[][],
};
