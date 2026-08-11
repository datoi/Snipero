import { CONFIG } from '../config';
import { EnemyKind } from '../engine/types';

// How hard is room N?
//
// Pure functions of the room index, with no imports beyond config, so both the
// enemy spawner and the boss factory can ask without either having to import
// the other. (They can't: world.ts already pulls makeBoss out of boss.ts, so
// anything boss.ts reaches back for would close a cycle.)
//
// The curves compound rather than adding, because the player's own power is
// multiplicative — Power stacks multiply damage, so a linear enemy curve gets
// outrun within a couple of loops and the run stops being able to end.

export function enemyScale(roomIndex: number) {
  const d = CONFIG.difficulty;
  return {
    hp: Math.pow(1 + d.enemyHpPerRoom, roomIndex),
    damage: Math.pow(1 + d.enemyDamagePerRoom, roomIndex),
    reward: Math.pow(1 + d.rewardPerRoom, roomIndex),
  };
}

// ── Wave composition ──

// What does room N actually put in front of the player?
//
// The authored table is the opening only. It introduces one archetype at a time,
// and that teaching order matters more than variety does: a player who meets a
// charger before they have ever seen a chaser has no idea what the windup means.
// Everything past it is composed from a threat budget, so depth changes what the
// room *is* rather than only how much HP it has.
export function composeWave(roomIndex: number, combatIndex: number): EnemyKind[] {
  const rooms = CONFIG.rooms;

  if (combatIndex < rooms.length) {
    const out: EnemyKind[] = [];
    for (const entry of rooms[combatIndex]) {
      for (let i = 0; i < entry.count; i++) out.push(entry.kind);
    }
    // Depth still thickens the authored waves, drawn from that room's own
    // composition so the extras reinforce what the room is teaching.
    const d = CONFIG.difficulty;
    const extras = Math.min(d.maxExtraEnemies, Math.floor(roomIndex / d.extraEnemyEveryRooms));
    const spec = rooms[combatIndex];
    for (let i = 0; i < extras; i++) out.push(spec[i % spec.length].kind);
    return out;
  }

  return generateWave(roomIndex);
}

// Spend a depth-scaled threat budget on bodies, with the archetype mix sliding
// from shallow to deep. Rolling per body rather than picking a template is what
// stops two runs at the same depth from being the same room.
function generateWave(roomIndex: number): EnemyKind[] {
  const c = CONFIG.waves;
  const t = Math.min(1, roomIndex / c.rampRooms);

  const kinds = Object.keys(c.weights) as EnemyKind[];
  const weightAt = (k: EnemyKind) => {
    const [shallow, deep] = c.weights[k];
    return shallow + (deep - shallow) * t;
  };

  let budget = c.baseBudget + roomIndex * c.budgetPerRoom;
  const out: EnemyKind[] = [];

  while (out.length < c.maxBodies) {
    // Only roll among what's still affordable, so the loop always terminates
    // rather than spinning on a kind the remaining budget can never buy.
    const affordable = kinds.filter((k) => c.cost[k] <= budget);
    if (affordable.length === 0) break;

    let total = 0;
    for (const k of affordable) total += weightAt(k);

    let roll = Math.random() * total;
    let pick = affordable[affordable.length - 1]; // float drift guard
    for (const k of affordable) {
      roll -= weightAt(k);
      if (roll <= 0) { pick = k; break; }
    }

    budget -= c.cost[pick];
    out.push(pick);
  }

  // A room that rolled almost nothing is a dead room, not an easy one.
  while (out.length < c.minBodies) out.push('chaser');
  return out;
}

// Bosses scale per *boss*, not per room — the third boss should feel like a
// third boss, not merely like "room 12".
export function bossScale(roomIndex: number) {
  const d = CONFIG.difficulty;
  const n = Math.floor(roomIndex / CONFIG.bossEvery); // 0 for the first boss
  return {
    hp: Math.pow(1 + d.bossHpPerBoss, n),
    damage: Math.pow(1 + d.bossDamagePerBoss, n),
    reward: Math.pow(1 + d.rewardPerRoom, roomIndex),
  };
}
