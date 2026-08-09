import { CONFIG } from '../config';

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
