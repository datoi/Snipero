import { BossAttackId, EnemyKind } from './engine/types';

// Central tuning knobs — the TypeScript equivalent of Unity's ScriptableObject
// data assets. Change these numbers to re-balance; no logic edits needed.
export const CONFIG = {
  player: {
    // Bodies are small relative to the arena, and deliberately.
    //
    // The whole game is about reading a room while standing still: where the
    // gaps are, which lane a charger is about to take, whether there is space
    // behind you. A hero that fills a tenth of the screen leaves nothing to
    // read — the arena stops being a space and becomes a corridor. Every body
    // radius in this file was cut by roughly a quarter for that reason, so the
    // ratios between them are unchanged and only the scale moved.
    radius: 13,
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

    // Fallback appearance, matching the starter hero. Every hero and every
    // weapon overrides these, but this is a real frame and not a theoretical
    // one: createWorld draws before the save has finished loading, so a
    // mismatched default is a hero that visibly flickers into someone else.
    color: '#8fae54',
    set: 'soldier',
    pose: 'gun',

    // The ring drawn on the ground under the player. Constant, and deliberately
    // not the hero's colour: every body in the arena is now one of the same nine
    // character sprites, so neither shape nor hue can say "that's me" on its
    // own, and an accent-tinted marker camouflages whichever hero happens to
    // match the floor. Nothing else in the game draws a ring like this.
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

  // ── Hero skills ────────────────────────────────────────────────────────────
  //
  // The one button in the game. Everything else the player does is expressed
  // through the stick — move, or stop and let the auto-aim work — which means
  // the entire moment-to-moment decision is *when to stand still*. That is a
  // good core, and it has one hole: while you are running, you are doing
  // nothing. Kiting a room contributes zero damage and zero progress; it is
  // dead time the player spends waiting to be allowed to play again.
  //
  // Skills exist to fill that hole, so the rule they all obey is: A SKILL CAN
  // BE CAST WHILE MOVING. That single constraint is what makes the button worth
  // a thumb. It is also why none of them are simply "deal damage" — each one
  // answers the specific trouble its hero gets into, so the interesting question
  // is *when* you spend it, not whether it is strong.
  //
  // Magnitudes scale with hero level (see skillPower); cooldowns never do.
  // Cooldown reduction compounds with everything else a hero gets and would
  // eventually make the button free, which turns a decision into a rotation.
  skills: {
    // Cast while the cooldown ring is still filling and nothing happens. That
    // silence is a bad tell on a phone, where a thumb often lands early, so a
    // press inside this window is remembered and fires the instant it comes up.
    // Long enough to forgive an eager tap, short enough that it can never spend
    // the skill on a fight the player has already walked away from.
    bufferTime: 0.35,

    // Rook — Overwatch. Keep firing while running, for a few seconds.
    //
    // The starter's skill is deliberately the plainest statement of the rule
    // above: it hands you the thing the game otherwise forbids. A player who
    // learns nothing else learns "the button is how I act while moving".
    overwatch: { cooldown: 12, duration: 4 },

    // Vera — Blink. Jump a fixed distance, straight through cover.
    //
    // She is the fragile one, so hers is the escape. Passing through walls is
    // the privilege that makes it worth a slot over just running: it is the only
    // thing in the game that treats cover as though it were not there.
    blink: { cooldown: 6, distance: 190 },

    // Bastion — Bulwark. Slam: refill the shield, shove everything back, and
    // take much less for a moment.
    //
    // He is slow, so he cannot solve being surrounded by leaving. This lets him
    // solve it by not needing to.
    bulwark: { cooldown: 14, duration: 3, resist: 0.35, knockback: 130, radius: 150 },

    // Ember — Pyre. Set the ground around her alight for a few seconds.
    //
    // She dies fastest up close, so hers makes up close the wrong place to be —
    // for them. Re-applies the same Blaze burn the draft hands out, so it reads
    // and pays out exactly like a burn the player already understands.
    //
    // `stacks` was 4 and had to come down hard. Burn is applied per body and
    // keeps ticking while she runs, so it was compounding twice: measured
    // against a three-body pack it more than doubled her damage in a stand-up
    // fight (+122%) and more than tripled it while kiting (+236%), which is not
    // a skill, it's a different hero. At 2 it lands beside Quake instead.
    pyre: { cooldown: 10, duration: 3.5, radius: 132, stacks: 2 },

    // Kestrel — Mark. Every shot crits, briefly.
    //
    // Her whole design is variance: high crit, terrible fire rate, and runs that
    // swing on rolls she does not control. This is the one moment she does — it
    // does not raise her average, it lets her choose where the spike lands.
    mark: { cooldown: 12, duration: 3.5 },

    // Nomad — Windfall. Every scrap of loot in the room comes to him.
    //
    // The HUD already warns that pickups are about to be destroyed by the next
    // room; for the economy hero, that warning becomes a button. Reuses the
    // magnet the pickups already have, so loot flies in on the same arc it
    // always does rather than teleporting.
    windfall: { cooldown: 9, speedBoost: 0.35, duration: 2.5 },

    // Brack — Quake. Slam the floor: heavy damage in a wide ring, and everything
    // caught in it is chilled.
    //
    // Note it SLOWS rather than shoves. Brack's damage comes from thorns — from
    // being hit — so knocking the wave off him would be his skill undoing his
    // build. Freezing them in place next to him is the version that agrees with
    // the hero.
    // damageMult was 5.5, which measured +63% to his damage in a fight — high
    // for a hero whose passive is already a survivability wall. 3.8 keeps the
    // slam feeling like the reason to be standing in the middle of a crowd
    // without making it the only thing he does.
    quake: { cooldown: 9, radius: 168, damageMult: 3.8, frost: 3, fuse: 0.12 },

    // Iris — Salvo. One homing shot at every enemy on the floor, at once.
    //
    // Cover is the one thing her build already ignores, so hers ignores it
    // completely: the volley does not check line of sight. Capped hard, because
    // "one per enemy" in a deep room is exactly the shape of a frame-rate bug.
    salvo: { cooldown: 10, damageMult: 1.5, homing: 6, maxShots: 12 },
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
  // ── The painted ground ─────────────────────────────────────────────────────
  //
  // The arena's backdrop art, and how (or whether) it moves. See
  // src/render/backdrop.ts, which owns the image and the layout maths.
  //
  // scrollSpeed is 0 — the ground is STATIC — and that is a deliberate default
  // rather than an unfinished one, for two reasons:
  //
  //   The game is not a scroller. The arena is a fixed room the size of the
  //   screen, the camera never translates, and the exit is a door you walk UP
  //   to. Ground sliding downward asserts that the hero is travelling, while
  //   the hero is in fact standing still in a room — and cover, which is static
  //   in world space and casts a shadow onto that ground, would visibly float.
  //
  //   The art does not tile. Scrolling repeats the image vertically every
  //   ~630px, and this one was not authored to meet its own top edge, so the
  //   join would march down the screen as a hard line.
  //
  // Both are fixable and neither is fatal: raise scrollSpeed to something small
  // (5-15 px/sec reads as atmosphere rather than travel) and the whole looping
  // path in backdrop.ts is already live. Above roughly 15 the shadows under
  // cover start to read as wrong.
  background: {
    /** px/sec the ground travels downward. 0 = static. */
    scrollSpeed: 0,

    /**
     * Multiplier on that speed, kept separate so the base speed can stay the
     * "real" rate while this dials the ground's apparent distance. Negative
     * scrolls upward; 0 pins it regardless of scrollSpeed.
     */
    parallax: 1,

    /**
     * How much black to lay over the backdrop, 0..1.
     *
     * Its own value rather than the theme's `floorDim` because this art carries
     * far more contrast than a 64px deck plate does, and the rule it has to
     * satisfy is the same one: the ground must stay quieter than the things
     * moving on it. A floor that competes with a projectile for attention is a
     * floor that gets someone killed.
     */
    dim: 0.45,
  },

  projectile: {
    radius: 5,
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
    // being slowed. Comfortably longer than a legitimate traverse — the layout
    // table's tallest face is well under 100px now that cover is authored as
    // many small blocks — but short enough to catch a body wobbling against a
    // corner, which covers ground at a crawl and would otherwise sit there for
    // half a minute. Deliberately left generous rather than retuned down with
    // the block sizes: the cost of being slow to notice a wedged body is a few
    // seconds, and the cost of being too eager is a wave that keeps abandoning
    // a chase it was winning.
    stuckTravelBudget: 250,

    // How far the player must pull away before a body re-baselines its "closest
    // I've been" mark. Without this, a player kiting backwards keeps every
    // enemy permanently failing the watchdog, and the whole wave detours
    // instead of chasing.
    stuckRebase: 60,

    chaser: {
      radius: 15,
      maxHp: 90,
      speed: 70,
      contactDamage: 12,
      color: '#e5484d',        // red
      xpReward: 4,
      goldReward: 3,
    },
    shooter: {
      radius: 13,
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
      projectileRadius: 6,
    },
    // The bomber exists to sharpen the one tension the whole game is built on:
    // you can only shoot while standing still. Every other archetype punishes
    // standing still with damage you can out-heal; this one puts a countdown on
    // the tile you're standing on. Killing it early costs you firing time you'd
    // rather spend on the wave; killing it late means eating the blast; ignoring
    // it means it picks the moment. It is fast and frail on purpose — the answer
    // is always "deal with it now", the cost is always "not right now".
    bomber: {
      radius: 12,
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
      radius: 18,
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
  // Titles name the place, and the place is one building: three wings of a
  // facility you are fighting your way down through. Kept in step with the
  // palettes in src/render/theme.ts — a chapter called Cold Storage that turns
  // out to be rust-orange is worse than one called nothing at all.
  chapters: [
    { title: 'The Foundry',  rooms: 12, boss: 0 },
    { title: 'The Warrens',  rooms: 16, boss: 1 },
    { title: 'Cold Storage', rooms: 20, boss: 2 },
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
    radius: 22,
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
    radius: 22,
    openRange: 30,     // extra distance past the radii at which it pops open
    openTime: 0.4,     // beat between the lid opening and the reward landing
    gold: 45,
    hearts: 2,
    heartHeal: 20,
  },

  boss: {
    radius: 34,
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

    radial: { count: 16, telegraph: 0.7, projSpeed: 260, damage: 12, projRadius: 7 },
    volley: { shots: 5, interval: 0.14, telegraph: 0.5, projSpeed: 360, damage: 10, projRadius: 6 },
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
    radius: 9,
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

    // ── Animation ──
    //
    // The cast is a set of static sprites — one frame per pose, no walk cycle,
    // no death frames. Everything that moves in this game therefore has to be
    // generated, and these are the numbers that do it. They are the difference
    // between bodies that slide around like counters on a board and bodies that
    // look like they are walking, shooting and dying.

    // How far the body rocks side to side as it walks, and how often.
    //
    // The gait clock advances with DISTANCE COVERED rather than with time, so
    // `gaitPerPx` is radians per pixel travelled: a frosted enemy waddles slower
    // because it is walking slower, and a body wedged against a wall stops
    // walking rather than marching on the spot. A time-based cycle gets both of
    // those wrong, and the second one badly — a stuck enemy jogging in place is
    // the exact tell that an animation is faked.
    gaitPerPx: 0.075,
    gaitRollDeg: 5.5,    // peak lean, degrees
    gaitBob: 0.045,      // peak scale change, as a fraction

    // Kick when a shot leaves, as a fraction of body radius, and how long it
    // takes to settle. Short: this fires several times a second at a high
    // attack rate, and anything slower reads as the hero flinching.
    recoilTime: 0.09,
    recoilPush: 0.42,

    // Squash on being hit, on top of the white flash. Rides hitFlashTime.
    hitSquash: 0.22,

    // Muzzle flash and impact ring, both drawn as shapes rather than sprites —
    // the pack has no VFX art at all, and a bloom and a ring are two draws.
    flashLife: 0.06,
    flashSize: 1.55,     // multiples of body radius
    flashColor: '#ffe9a8',
    ringLife: 0.22,
    ringColor: '#ffd7b0',

    // A dead body falls over rather than vanishing. This is the single biggest
    // animation win available with static art: a kill used to be a sprite
    // blinking out of existence between two frames.
    corpse: {
      life: 0.55,
      spin: 220,         // deg/sec, randomised in sign
      drift: 70,         // px/sec along its own heading at the moment of death
      drag: 3.4,
      sink: 0.45,        // how far it shrinks over its life, as a fraction
    },

    // How far a shot is stretched along its own velocity. A round projectile at
    // 560px/sec lands four unrelated circles in four frames; a streak reads as
    // one thing travelling, and it is the only motion cue a projectile gets.
    tracerStretch: 2.6,

    // Hard cap on flourishes, same policy as particles: oldest dropped first.
    maxPops: 40,

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
    // Cover's three faces are COLOURED per chapter, in src/render/theme.ts —
    // wood in the Undergrowth, stone in Ashfall, steel in the Vault. Only the
    // shadow lives here, because a shadow is the absence of the scene's one
    // light source rather than a property of the thing casting it, and it has to
    // match the contact shadow under every body.
    shadowColor: '#05070a',

    // Small. A tall lift turns the side face into a slab of its own and the
    // block stops reading as one object — the point is a hint of thickness, not
    // a wall drawn in perspective.
    blockHeight: 6,

    // Soft contact shadow under every body, as a fraction of its radius. Bodies
    // without one look pasted onto the floor rather than standing on it.
    bodyShadow: 0.9,
    doorClearance: 30,   // px of walkable margin kept around the exit door
    // Narrowest lane a layout may leave against the arena edge. Anything tighter
    // than a body can fit down gets snapped flush to the wall instead.
    //
    // This has to clear the LARGEST body that needs to path, not the player's.
    // Sized too tightly it lets the table leave lanes a charger physically
    // cannot enter, and a charger that picks that side wedges in the gap
    // permanently — no amount of wall-following gets a body down a lane
    // narrower than the body. This is charger diameter plus threading room, so
    // it moves whenever the charger's radius does. Raise it if a wider enemy is
    // ever added.
    minLaneWidth: 42,

    // Positions are fractions of the arena (x/y = center, w/h = size), so a
    // layout reads the same on every screen size.
    //
    // MANY SMALL BLOCKS, not a few big ones. A handful of slabs divides a room
    // into two or three places to stand, and once you have picked one the room
    // is over. A field of crate-sized cover gives every position a different set
    // of firing lanes, which is what makes moving worth doing — and it is the
    // shape the auto-aim's line-of-sight rule was built for, since a shot that
    // just misses one corner is a decision rather than an accident.
    //
    // Sizes are tuned so one block is roughly one prop: a block that wants three
    // crates stacked on it reads as a shelf, and a block the size of a crate
    // reads as a crate.
    layouts: [
      // Room 1 — scattered crates. Nothing to hide behind for long.
      [
        { x: 0.20, y: 0.40, w: 0.11, h: 0.05 },
        { x: 0.80, y: 0.40, w: 0.11, h: 0.05 },
        { x: 0.50, y: 0.50, w: 0.08, h: 0.045 },
        { x: 0.34, y: 0.62, w: 0.09, h: 0.05 },
        { x: 0.66, y: 0.62, w: 0.09, h: 0.05 },
        { x: 0.12, y: 0.72, w: 0.09, h: 0.05 },
        { x: 0.88, y: 0.72, w: 0.09, h: 0.05 },
      ],
      // Room 2 — a broken centre line with flanking pillars.
      [
        { x: 0.50, y: 0.31, w: 0.09, h: 0.04 },
        { x: 0.38, y: 0.42, w: 0.10, h: 0.05 },
        { x: 0.62, y: 0.42, w: 0.10, h: 0.05 },
        { x: 0.15, y: 0.52, w: 0.07, h: 0.09 },
        { x: 0.85, y: 0.52, w: 0.07, h: 0.09 },
        { x: 0.30, y: 0.70, w: 0.09, h: 0.05 },
        { x: 0.70, y: 0.70, w: 0.09, h: 0.05 },
        { x: 0.50, y: 0.79, w: 0.10, h: 0.045 },
      ],
      // Room 3 — pillars. Hard cover against shooters, and charger bait.
      [
        { x: 0.26, y: 0.36, w: 0.06, h: 0.08 },
        { x: 0.74, y: 0.36, w: 0.06, h: 0.08 },
        { x: 0.50, y: 0.48, w: 0.06, h: 0.08 },
        { x: 0.14, y: 0.60, w: 0.06, h: 0.08 },
        { x: 0.86, y: 0.60, w: 0.06, h: 0.08 },
        { x: 0.32, y: 0.73, w: 0.10, h: 0.045 },
        { x: 0.68, y: 0.73, w: 0.10, h: 0.045 },
      ],
      // Room 4 — cluttered, for the big mixed wave.
      [
        { x: 0.50, y: 0.45, w: 0.07, h: 0.09 },
        { x: 0.22, y: 0.34, w: 0.10, h: 0.045 },
        { x: 0.78, y: 0.34, w: 0.10, h: 0.045 },
        { x: 0.13, y: 0.52, w: 0.08, h: 0.05 },
        { x: 0.87, y: 0.52, w: 0.08, h: 0.05 },
        { x: 0.30, y: 0.64, w: 0.08, h: 0.05 },
        { x: 0.70, y: 0.64, w: 0.08, h: 0.05 },
        { x: 0.22, y: 0.79, w: 0.09, h: 0.05 },
        { x: 0.78, y: 0.79, w: 0.09, h: 0.05 },
      ],
      // Room 5 — offset scatter, so no two lanes are mirrored.
      [
        { x: 0.18, y: 0.38, w: 0.09, h: 0.05 },
        { x: 0.42, y: 0.47, w: 0.09, h: 0.05 },
        { x: 0.66, y: 0.37, w: 0.09, h: 0.05 },
        { x: 0.88, y: 0.49, w: 0.08, h: 0.05 },
        { x: 0.12, y: 0.61, w: 0.08, h: 0.05 },
        { x: 0.36, y: 0.71, w: 0.09, h: 0.05 },
        { x: 0.60, y: 0.63, w: 0.09, h: 0.05 },
        { x: 0.82, y: 0.73, w: 0.09, h: 0.05 },
      ],
      // Room 6 — a corridor down the middle. Easy to hold, awful to be flanked in.
      [
        { x: 0.32, y: 0.37, w: 0.06, h: 0.10 },
        { x: 0.68, y: 0.37, w: 0.06, h: 0.10 },
        { x: 0.32, y: 0.59, w: 0.06, h: 0.10 },
        { x: 0.68, y: 0.59, w: 0.06, h: 0.10 },
        { x: 0.10, y: 0.47, w: 0.07, h: 0.05 },
        { x: 0.90, y: 0.47, w: 0.07, h: 0.05 },
        { x: 0.50, y: 0.74, w: 0.12, h: 0.045 },
      ],
    ] as { x: number; y: number; w: number; h: number }[][],

    // Boss rooms stay open — the boss needs lanes to charge down, and heavy
    // cover would let the player trivially wall off every attack.
    bossLayout: [
      { x: 0.14, y: 0.58, w: 0.08, h: 0.05 },
      { x: 0.86, y: 0.58, w: 0.08, h: 0.05 },
      { x: 0.30, y: 0.77, w: 0.08, h: 0.045 },
      { x: 0.70, y: 0.77, w: 0.08, h: 0.045 },
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
