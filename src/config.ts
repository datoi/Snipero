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

    // Ceiling on armour's damage reduction. Well below 1 so no loadout can ever
    // reach immunity — a build that cannot die has no run to play.
    maxResist: 0.55,

    // Fallback body colour. Every hero overrides it; this is what a world built
    // before applyMeta runs looks like.
    color: '#3ecf5f',

    // Constant bright rim on the player, whatever the hero colour is. The player
    // must be findable in one glance in a busy room, and hue alone cannot carry
    // that once heroes can be orange or blue like the enemies are.
    rimColor: '#ffffff',
  },

  // Weapon firing behaviour that isn't per-item. Only the burst pattern needs
  // any: `single` and `arc` are fully described by their stat block.
  weapon: {
    burstShots: 3,
    burstInterval: 0.09,   // tight enough to read as one burst, not three shots

    // Ceiling on volleys paid out in one frame. High enough that an uncapped
    // Attack Speed build fires its true rate on a 60Hz device; low enough that
    // a stalled frame can't dump a wall of arrows at once.
    maxVolleysPerFrame: 4,
  },

  // Heroes are pricier per level than gear and cap lower: you own one loadout
  // per slot but you play one hero, so levelling them is a long commitment
  // rather than something you top up between runs.
  hero: {
    powerPerLevel: 0.09,
    baseUpgradeCost: 140,
    upgradeGrowth: 1.34,
  },

  gear: {
    powerPerLevel: 0.1,    // each level widens an item's stat band by 10%
    baseUpgradeCost: 55,
    upgradeGrowth: 1.28,

    // Depth over which drops shift from "mostly commons" to "worth the trip".
    dropRampRooms: 24,
    // [shallow, deep] weight per rarity.
    dropWeights: {
      common: [70, 18],
      rare: [26, 34],
      epic: [4, 32],
      legendary: [0, 16],
    } as Record<'common' | 'rare' | 'epic' | 'legendary', [number, number]>,
  },
  projectile: {
    radius: 6,
    speed: 560,              // px/sec
    life: 2,                 // seconds before it despawns
  },

  progression: {
    baseXpToNext: 14,       // tuned so the first card lands inside room 1 — that's the hook

    // Multiplier on the XP needed for each successive level.
    //
    // This is the single most sensitive number in the run. It has to be read
    // against reward growth (`difficulty.rewardPerRoom`) and against how many
    // bodies a room spawns, because those are what pay for it. At 1.3 it
    // outran both by roughly 1.2x per room and the draft switched itself off
    // mid-run: a 30-room run delivered 19 of the 49 available card stacks and
    // was handing out 0.4 cards/room by room 20, while enemy HP kept
    // compounding. The player stopped getting stronger and the wave didn't.
    //
    // Tuned so cards keep arriving at roughly one per room deep into a run.
    xpGrowth: 1.12,

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

    // Damage ramps the longer you hold your ground, resetting the instant you
    // move. Every other card makes you stronger everywhere; this one pays you
    // for committing to the one decision the whole game is built on, and takes
    // it all back the moment you flinch.
    focus: { perStackPerSec: 0.22, rampSeconds: 3 },

    // Steering, in radians per second of course correction. Deliberately weak
    // per stack: shots that turn hard stop being a thing you aim and start
    // being a thing that happens, and positioning stops mattering.
    homing: { turnPerStack: 2.4 },

    // Contact damage returned to the attacker. Scales with how hard they hit,
    // so it answers the swarm that's actually hurting you rather than paying
    // out flat against everything.
    thorns: { reflectPerStack: 0.55 },

    // An absorb pool that refills out of combat. Effective HP that rewards
    // disengaging, which is the defensive skill this game otherwise never asks
    // for — hearts reward nothing but surviving.
    shield: { perStack: 26, refillDelay: 4, refillPerSec: 14 },

    // Kills detonate. Reuses the bomber's blast, so a big multishot volley into
    // a pack chains visibly — and it's the one damage source that doesn't care
    // about the auto-aim picking the nearest target.
    detonate: { damagePerStack: 16, radius: 78, fuse: 0.16 },

    // Damage dealt returned as health. Direct hits only, never damage-over-time:
    // burn ticks four times a second, and siphoning off them would make the
    // pairing self-sustaining rather than a trade.
    siphon: { fractionPerStack: 0.035 },

    // More gold, and a wider magnet so collecting it costs less exposure. Worth
    // taking only because the forge gives run gold somewhere to go.
    greed: { goldPerStack: 0.3, magnetPerStack: 55 },
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
      maxHp: 90,
      speed: 70,
      contactDamage: 12,
      color: '#e5484d',        // red
      xpReward: 4,
      goldReward: 3,
    },
    shooter: {
      radius: 18,
      maxHp: 62,
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
    // The bomber exists to sharpen the one tension the whole game is built on:
    // you can only shoot while standing still. Every other archetype punishes
    // standing still with damage you can out-heal; this one puts a countdown on
    // the tile you're standing on. Killing it early costs you firing time you'd
    // rather spend on the wave; killing it late means eating the blast; ignoring
    // it means it picks the moment. It is fast and frail on purpose — the answer
    // is always "deal with it now", the cost is always "not right now".
    bomber: {
      radius: 17,
      maxHp: 46,               // still frail on purpose: it dies fast enough that the
                               // cost of answering it is tempo, not damage
      speed: 128,              // outruns the player's 230 only in a straight line
      contactDamage: 0,        // the blast is the damage; touching it does nothing
      color: '#ff5cae',        // pink — reads as "not one of the others" at a glance
      xpReward: 9,
      goldReward: 7,

      triggerRange: 76,        // how close it gets before committing to detonate
      fuse: 0.62,              // telegraph once it commits — long enough to sprint out
      deathFuse: 0.28,         // shorter beat when shot: a kill is still a warning
      blastRadius: 104,
      blastDamage: 26,
    },
    charger: {
      radius: 24,
      maxHp: 145,
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

    // Incoming fire has to be unmistakable at a glance, and it wasn't: the old
    // amber (#ffb020) sat right next to the gold of a coin (#ffd45e), so the
    // thing you run *toward* and the thing you run *from* were the same colour
    // at the same size. Crimson separates them by hue, and the pale rim inverts
    // the coin's dark one so they differ in structure too — which is what still
    // reads when something is moving fast across a busy floor.
    color: '#ff2e63',
    rimColor: '#ffd9e2',
  },

  blast: {
    color: '#ff9d5c',
    // Damage at the very rim, as a fraction of full. Not zero: a blast that does
    // nothing at the edge trains players to stand exactly on the edge, which is
    // a worse habit than simply moving away.
    minDamageFraction: 0.35,
  },

  // Boss appears every Nth room. The room straight after each boss is a chest
  // room — a breather to spend the win on before the next wave.
  bossEvery: 4,

  // A run has a destination.
  //
  // Room counts are multiples of `bossEvery`, so the last room of a chapter is
  // naturally a boss room — the chapter boss is the existing rhythm landing on
  // the end, not a special case bolted onto it. Each chapter owns one boss
  // archetype, so "which chapter am I in" and "what am I fighting" are the same
  // fact, and clearing one is a distinct memory rather than a bigger number.
  //
  // Endless mode replays the deepest chapter's tables and simply never ends; it
  // is the score chase, not the game.
  chapters: [
    { title: 'The Undergrowth', rooms: 12, boss: 0 },
    { title: 'Ashfall Reach',   rooms: 16, boss: 1 },
    { title: 'The Deep Vault',  rooms: 20, boss: 2 },
  ],

  // How a run gets harder the deeper it goes.
  //
  // Without this the room table just loops: room 20 is exactly room 4 with a
  // twenty-levels-stronger player, so a run has no end condition and the whole
  // ability system stops mattering once you're ahead of the curve. Scaling is
  // compounding per room, which is the only shape that keeps pace with a player
  // whose damage is also multiplicative.
  difficulty: {
    // Compounding HP has to be read against how fast the player's damage can
    // actually compound, which is bounded by how many cards the draft delivers.
    // At 0.13 the wave grew x130 over 30 rooms while player damage grew x6:
    // a room-30 clear needed ~170 seconds of uninterrupted fire. Depth should
    // outrun a *lazy* build, not every possible one.
    enemyHpPerRoom: 0.085,
    enemyDamagePerRoom: 0.055, // slower than HP — deaths should come from swarm, not one-shots
    rewardPerRoom: 0.09,       // gold/XP keep pace so leveling never stalls out
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

  // Reward rooms. Three offers, one pick.
  shrine: {
    count: 3,
    radius: 26,
    openRange: 30,
    openTime: 0.4,
    y: 0.42,          // fraction of arena height; spread across the width

    // The pact: two cards for a permanent slice of max HP. Two rather than one
    // because a single card is what the free blessing already gives — a cost
    // has to buy something the free option can't.
    devilCards: 2,
    devilHpCost: 0.25,
    minMaxHp: 30,     // a pact can never leave you one-shottable

    // Priced against a boss payout, so it's affordable but not free — the point
    // is to make mid-run gold worth picking up under fire.
    forgeCost: 90,
  },

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
    maxHp: 1400,
    contactDamage: 22,
    xpReward: 60,
    goldReward: 80,
    introTime: 1.3,
    moveSpeed: 90,
    preferredRange: 260,   // distance it tries to hold while repositioning
    recover: 0.45,         // pause after an instant attack

    // One entry per boss archetype. A chapter picks one, so "chapter 2" means a
    // different fight rather than the same fight with a bigger health bar.
    //
    // Variety here is in the ATTACK GRAMMAR, not the numbers: the Warden makes
    // you dodge projectiles, the Bombardier makes you keep moving through ground
    // you can't stand on, and the Juggernaut makes you bait a charge into cover.
    // Three different questions, one state machine.
    //
    // Phases activate as HP fraction drops to/below each threshold. Deeper
    // phases add attacks and move/act faster.
    variants: [
      {
        title: 'The Warden',
        hpMult: 1, damageMult: 1,
        phases: [
          { threshold: 1.0, attacks: ['radial', 'volley'],           speedMult: 1.0,  gapTime: 1.0,  color: '#c0392b' },
          { threshold: 0.6, attacks: ['radial', 'volley', 'charge'], speedMult: 1.15, gapTime: 0.8,  color: '#e04836' },
          { threshold: 0.3, attacks: ['radial', 'volley', 'charge'], speedMult: 1.35, gapTime: 0.55, color: '#ff5a3c' },
        ],
      },
      {
        title: 'The Bombardier',
        // Frailer and slower, because its threat is the floor rather than its
        // body — you are rarely fighting it at close range.
        hpMult: 0.85, damageMult: 0.95,
        phases: [
          { threshold: 1.0, attacks: ['bombs', 'volley'],          speedMult: 0.9,  gapTime: 1.05, color: '#2f6f4f' },
          { threshold: 0.6, attacks: ['bombs', 'volley', 'radial'], speedMult: 1.0,  gapTime: 0.8,  color: '#39916a' },
          { threshold: 0.3, attacks: ['bombs', 'radial'],           speedMult: 1.1,  gapTime: 0.5,  color: '#4ecf94' },
        ],
      },
      {
        title: 'The Juggernaut',
        // Tanky and charge-heavy: the arena pillars are the counter, so this one
        // rewards a player who has learned to fight around cover.
        hpMult: 1.35, damageMult: 1.1,
        phases: [
          { threshold: 1.0, attacks: ['charge', 'volley'],           speedMult: 1.05, gapTime: 0.95, color: '#4a3f8f' },
          { threshold: 0.6, attacks: ['charge', 'radial'],           speedMult: 1.25, gapTime: 0.7,  color: '#6a52c9' },
          { threshold: 0.3, attacks: ['charge', 'radial', 'bombs'],  speedMult: 1.45, gapTime: 0.45, color: '#8a6bff' },
        ],
      },
    ] as {
      title: string;
      hpMult: number;
      damageMult: number;
      phases: { threshold: number; attacks: BossAttackId[]; speedMult: number; gapTime: number; color: string }[];
    }[],

    // Seeded around the player rather than aimed at them, and staggered so the
    // floor lights up in sequence instead of all at once — the player has to
    // keep moving through it rather than sidestep once.
    bombs: {
      count: 5, telegraph: 0.55, scatter: 150, radius: 92,
      damage: 16, fuse: 0.85, stagger: 0.22,
    },

    radial: { count: 16, telegraph: 0.7, projSpeed: 260, damage: 12, projRadius: 8 },
    volley: { shots: 5, interval: 0.14, telegraph: 0.5, projSpeed: 360, damage: 10, projRadius: 7 },
    charge: { telegraph: 0.7, speed: 680, duration: 0.55, recover: 0.5 },
  },

  door: {
    width: 96,
    height: 26,

    // Distance from the top of the screen.
    //
    // At 64 the door spanned y 51-77 and the HP readout occupies y 50-74, so
    // the exit sat directly behind the HUD and read as another status bar —
    // the banner said "go through the door" while the door was disguised as a
    // health meter.
    //
    // The top of the screen is a stack, and everything in it has to clear the
    // piece above:
    //     50-105   HUD (HP line, room/level line, XP bar)
    //    110-142   boss bar, when a boss is alive
    //    147-173   this door
    //    185+      room prompt banner
    // Costs ~100px of arena at the top, which the spawn ring and the player
    // start position both sit well clear of.
    marginTop: 160,
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
      // A single explosion, not a cluster of them — see shakeAtMost. Tuned well
    // below chargerSlam: blasts are common (every bomber, every Detonate kill,
    // five per boss bomb volley), and a common event should not hit as hard as
    // a rare one.
    blast: 4,
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
    // Cover is drawn as a block with height, not a flat rectangle: a dark side
    // face at the footprint, and a lit top face shifted up by `blockHeight`, so
    // the strip left showing at the bottom reads as the front of the block.
    //
    // Purely cosmetic — collision still uses the flat footprint, which is what
    // keeps every pathing and line-of-sight number valid. The visual leans on
    // the same trick Archero does: a fixed overhead camera where objects still
    // show a little of their front face.
    // One hue, three values. The side face being a *darker shade of the top*
    // rather than a different colour is what makes a block read as one object
    // — the first pass had a brown top on a blue-grey base and every piece of
    // cover looked like two unrelated things stacked.
    color: '#252a35',        // side face — in shadow, the part seen edge-on
    topColor: '#3b4354',     // top face — lit, the part the camera looks down at
    edgeColor: '#4d5768',    // highlight along the very top lip
    shadowColor: '#05070a',
    blockHeight: 9,          // px the top face is lifted; 0 = flat, as before

    // Soft contact shadow under every body, as a fraction of its radius. Bodies
    // without one look pasted onto the floor rather than standing on it.
    bodyShadow: 0.9,
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

  // How waves are composed once the authored opening is behind us.
  //
  // The room table below used to loop forever, so room 22 was room 2 with bigger
  // numbers — depth changed the arithmetic and nothing else. Past the opening,
  // waves are built by spending a threat budget instead, with the mix shifting
  // as the run goes deeper. Same knobs produce every future room, so adding an
  // archetype means adding a cost and a weight, not authoring N more rows.
  waves: {
    // Relative danger, NOT hit points — a charger costs more than its HP implies
    // because a dash the player has to read is worth more attention than a body
    // walking in a straight line.
    cost: { chaser: 1, shooter: 1.6, charger: 2.4, bomber: 2 } as Record<EnemyKind, number>,

    baseBudget: 6,
    budgetPerRoom: 0.55,

    minBodies: 3,
    maxBodies: 14,   // hard ceiling — past this it reads as lag, not difficulty

    // Rooms over which the mix travels from its shallow blend to its deep one.
    rampRooms: 20,

    // [shallow, deep] weight per archetype. Early rooms are a brawl; deep rooms
    // are a mixed-threat problem where standing still is punished from range
    // while something charges the spot you're standing in.
    weights: {
      chaser: [6, 3],
      shooter: [1, 4],
      charger: [0.5, 3],
      // Starts at zero on purpose. The bomber is the archetype that punishes
      // standing still, and a player still learning that they *have* to stand
      // still has no chance of reading it. It arrives once the basic loop is
      // second nature and then becomes a standing tax on camping.
      bomber: [0, 3],
    } as Record<EnemyKind, [number, number]>,
  },

  // The authored opening. Each of these introduces one archetype at a time;
  // past the last entry, waves come from the budget above rather than looping.
  rooms: [
    [{ kind: 'chaser', count: 4 }],
    [{ kind: 'chaser', count: 3 }, { kind: 'shooter', count: 2 }],
    [{ kind: 'shooter', count: 3 }, { kind: 'charger', count: 1 }],
    [{ kind: 'chaser', count: 4 }, { kind: 'shooter', count: 2 }, { kind: 'charger', count: 2 }],
  ] as { kind: EnemyKind; count: number }[][],
};
