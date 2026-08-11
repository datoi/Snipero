import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { World } from '../engine/types';
import { useFrameTick } from '../hooks/useGameLoop';
import { enemyScale } from '../systems/difficulty';
import { chapterRooms } from '../systems/rooms';
import { shrinesResolved } from '../systems/shrine';

// Live run readouts: health, depth, level, gold, XP, boss health, room prompt.
//
// Split out of App and ticked at 10Hz on purpose. None of this is animation —
// it's numbers a player reads, and a number that updates 60 times a second is
// not more readable than one that updates 10 times, it just costs 6x the layout
// passes. Text is the most expensive node type in this tree (measure + shape +
// Yoga), so it is the one place where throttling buys the most.
//
// The arena canvas is unaffected: it subscribes to the same loop at full rate.
export function Hud({ world }: { world: World }) {
  useFrameTick(10);

  const { player } = world;
  const xpPct = Math.max(0, Math.min(1, player.xp / player.xpToNext));

  // Enemy HP multiplier for this depth — the player should be able to see the
  // run getting harder, not just feel their damage stop being enough.
  const threat = enemyScale(world.roomIndex).hp;

  return (
    <>
      <View style={styles.hud} pointerEvents="none">
        <Text style={styles.hudText}>
          HP {Math.ceil(player.hp)} / {player.maxHp}
        </Text>
        <Text style={styles.hudSub}>
          Room {world.roomIndex + 1}
          {world.endless ? '' : ` / ${chapterRooms(world)}`}
          {'  ·  '}Lv {player.level}  ·  🪙 {world.runGold}
          {threat > 1 && <Text style={styles.threat}>  ·  ×{threat.toFixed(1)} threat</Text>}
        </Text>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${xpPct * 100}%` }]} />
        </View>
      </View>

      {world.boss && (
        <View style={styles.bossBarWrap} pointerEvents="none">
          <Text style={styles.bossLabel}>BOSS</Text>
          <View style={styles.bossTrack}>
            <View
              style={[
                styles.bossFill,
                { width: `${Math.max(0, (world.boss.hp / world.boss.maxHp) * 100)}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Room prompt — the chest is the point of a chest room, so it takes
          priority over the generic "go through the door" line. */}
      {world.status === 'playing' && world.phase === 'cleared' && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>
            {world.shrines.length > 0 && !shrinesResolved(world)
              ? 'Choose one — the others vanish'
              : 'Room cleared — go through the door ↑'}
          </Text>
          {/* Loot left behind is destroyed by the next room load, silently.
              Naming the count turns an invisible loss into a choice. */}
          {world.pickups.length > 0 && (
            <Text style={styles.bannerWarn}>
              {world.pickups.length} {world.pickups.length === 1 ? 'pickup' : 'pickups'} still on the floor
            </Text>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', top: 50, left: 20, right: 20 },
  hudText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  hudSub: { color: '#9aa0aa', fontSize: 14, marginTop: 2 },
  threat: { color: '#ff8a7a', fontWeight: '700' },

  xpTrack: {
    marginTop: 6, height: 6, width: 180, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
  },
  xpFill: { height: 6, backgroundColor: '#7cc4ff' },

  // Below the HUD block, not on top of it. At top:46 the boss track landed on
  // the HP readout and clipped the room/level line — in every boss room, which
  // is one room in four. The HUD stack measures ~55px from top:50 (HP line, sub
  // line, XP bar), so 112 clears it with a margin.
  //
  // It cannot collide with the room banner below: the banner only renders once
  // the room is cleared, and a room is only cleared once the boss is gone.
  bossBarWrap: { position: 'absolute', top: 112, left: 20, right: 20, alignItems: 'center' },
  bossLabel: { color: '#ff8a7a', fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  bossTrack: {
    height: 12, width: '100%', borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  bossFill: { height: 12, backgroundColor: '#ff5a3c' },

  banner: { position: 'absolute', top: 158, left: 0, right: 0, alignItems: 'center' },
  bannerText: {
    color: '#b6ffcf', fontSize: 15, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, overflow: 'hidden',
  },
  bannerWarn: {
    color: '#ffd45e', fontSize: 13, fontWeight: '700', marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, overflow: 'hidden',
  },
});
