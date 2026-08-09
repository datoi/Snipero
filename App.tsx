import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createWorld, resetWorld } from './src/systems/world';
import { useGameLoop } from './src/hooks/useGameLoop';
import { GameCanvas } from './src/render/GameCanvas';
import { Joystick } from './src/input/Joystick';
import { RARITY_COLOR, getAbility, stacksOf } from './src/systems/abilities';
import { chooseAbility } from './src/systems/progression';
import { MetaMenu } from './src/ui/MetaMenu';
import {
  MetaState,
  UpgradeId,
  applyMeta,
  buyUpgrade,
  defaultMeta,
  loadMeta,
  saveMeta,
} from './src/systems/meta';
import { Vec2 } from './src/engine/vec';
import { World } from './src/engine/types';
import { enemyScale } from './src/systems/difficulty';
import { setMuted, startAudio, stopAudio } from './src/audio/AudioEngine';

type Screen = 'home' | 'game';

export default function App() {
  const { width, height } = useWindowDimensions();

  // Built lazily, exactly once. Passing `createWorld(...)` directly to useRef
  // would rebuild the entire world — enemy spawns, obstacle layout, collision
  // resolution — on *every* render, and the game loop re-renders every frame.
  // useRef discards the extra worlds, but the allocation work still happens
  // 60x/sec and lands straight in the GC.
  const worldRef = useRef<World | null>(null);
  if (worldRef.current === null) worldRef.current = createWorld(width, height);
  const world = worldRef.current;

  const runningRef = useRef(false);
  const bankedRef = useRef(false); // ensures each run's gold is banked exactly once

  const [screen, setScreen] = useState<Screen>('home');
  const [meta, setMeta] = useState<MetaState>(defaultMeta());

  // Load persisted meta once at startup.
  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  // Bring the audio engine up once, and tear it down on unmount so the native
  // players are released rather than leaked across a reload.
  useEffect(() => {
    startAudio();
    return stopAudio;
  }, []);

  // The engine holds mute itself — gameplay calls sfx() unconditionally and the
  // backend decides whether anything is audible.
  useEffect(() => {
    setMuted(meta.muted);
  }, [meta.muted]);

  runningRef.current = screen === 'game';
  useGameLoop(world, runningRef);

  const player = world.player;

  // Bank the run's gold once, the moment the player dies.
  useEffect(() => {
    if (screen === 'game' && world.status === 'dead' && !bankedRef.current) {
      bankedRef.current = true;
      const earned = world.runGold;
      setMeta((prev) => {
        const next = { ...prev, gold: prev.gold + earned };
        saveMeta(next);
        return next;
      });
    }
  }, [screen, world.status]);

  const startRun = () => {
    resetWorld(world);
    applyMeta(world.player, meta); // apply permanent upgrades to the fresh player
    bankedRef.current = false;
    setScreen('game');
  };

  const handleBuy = (id: UpgradeId) => {
    setMeta((prev) => {
      const next = buyUpgrade(prev, id);
      if (next !== prev) saveMeta(next);
      return next;
    });
  };

  const handleInput = (axis: Vec2, moving: boolean) => {
    world.input.axis = axis;
    world.input.moving = moving;
  };

  const toggleMute = () => {
    setMeta((prev) => {
      const next = { ...prev, muted: !prev.muted };
      saveMeta(next);
      return next;
    });
  };

  // ── Home / meta menu ──
  if (screen === 'home') {
    return (
      <View style={styles.root}>
        <MetaMenu meta={meta} onBuy={handleBuy} onStart={startRun} />
        <Pressable style={styles.muteBtn} onPress={toggleMute} hitSlop={12}>
          <Text style={styles.muteText}>{meta.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
        <StatusBar hidden />
      </View>
    );
  }

  // ── In-run ──
  const xpPct = Math.max(0, Math.min(1, player.xp / player.xpToNext));
  // Enemy HP multiplier for this depth — the player should be able to see the
  // run getting harder, not just feel their damage stop being enough.
  const threat = enemyScale(world.roomIndex).hp;

  return (
    <View style={styles.root}>
      <GameCanvas world={world} width={width} height={height} />

      {/* HUD */}
      <View style={styles.hud} pointerEvents="none">
        <Text style={styles.hudText}>HP {Math.ceil(player.hp)} / {player.maxHp}</Text>
        <Text style={styles.hudSub}>
          Room {world.roomIndex + 1}  ·  Lv {player.level}  ·  🪙 {world.runGold}
          {threat > 1 && <Text style={styles.threat}>  ·  ×{threat.toFixed(1)} threat</Text>}
        </Text>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${xpPct * 100}%` }]} />
        </View>
      </View>

      {/* Boss health bar */}
      {world.boss && (
        <View style={styles.bossBarWrap} pointerEvents="none">
          <Text style={styles.bossLabel}>BOSS</Text>
          <View style={styles.bossTrack}>
            <View
              style={[styles.bossFill, { width: `${Math.max(0, (world.boss.hp / world.boss.maxHp) * 100)}%` }]}
            />
          </View>
        </View>
      )}

      {/* Room prompt — the chest is the point of a chest room, so it takes
          priority over the generic "go through the door" line. */}
      {world.status === 'playing' && world.phase === 'cleared' && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>
            {world.chest && !world.chest.paid
              ? 'Treasure room — walk into the chest'
              : 'Room cleared — go through the door ↑'}
          </Text>
        </View>
      )}

      {/* Always mounted, disabled while an overlay owns the screen — unmounting
          it mid-gesture is what used to strand the last held direction. */}
      <Joystick onChange={handleInput} enabled={world.status === 'playing'} />

      {/* Overlays below are rendered after the stick, so they take the touches. */}

      {/* Level-up card draft */}
      {world.status === 'drafting' && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Level Up!</Text>
          <Text style={styles.overlaySub}>Choose one</Text>
          {world.draftOptions.map((id) => {
            const a = getAbility(id);
            const owned = stacksOf(player, id);
            // The border carries rarity, the chip carries the card's own color.
            // Two channels, so "how rare is this" reads before you've read a word.
            const rarity = RARITY_COLOR[a.rarity];
            return (
              <Pressable
                key={id}
                style={[styles.card, { borderColor: rarity }]}
                onPress={() => chooseAbility(world, id)}
              >
                <View style={[styles.cardChip, { backgroundColor: a.color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{a.title}</Text>
                    {owned > 0 && (
                      <Text style={styles.cardStack}>Lv {owned + 1}</Text>
                    )}
                  </View>
                  <Text style={styles.cardDesc}>{a.desc}</Text>
                  <Text style={[styles.cardRarity, { color: rarity }]}>
                    {a.rarity.toUpperCase()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Death / run-end screen */}
      {world.status === 'dead' && (
        <View style={styles.overlay}>
          <Text style={styles.deadTitle}>You Died</Text>
          <Text style={styles.stat}>Reached Room {world.roomIndex + 1}</Text>
          <Text style={styles.stat}>Enemies slain: {world.enemiesKilled}</Text>
          <Text style={styles.goldEarned}>🪙 {world.runGold} earned</Text>
          <View style={styles.btnRow}>
            <Pressable style={[styles.endBtn, styles.menuBtn]} onPress={() => setScreen('home')}>
              <Text style={styles.menuText}>Menu</Text>
            </Pressable>
            <Pressable style={[styles.endBtn, styles.againBtn]} onPress={startRun}>
              <Text style={styles.againText}>Play Again</Text>
            </Pressable>
          </View>
        </View>
      )}

      <StatusBar hidden />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15171c' },

  hud: { position: 'absolute', top: 50, left: 20, right: 20 },
  hudText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  hudSub: { color: '#9aa0aa', fontSize: 14, marginTop: 2 },
  threat: { color: '#ff8a7a', fontWeight: '700' },

  muteBtn: {
    position: 'absolute', top: 50, right: 20,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  muteText: { fontSize: 20 },
  xpTrack: {
    marginTop: 6, height: 6, width: 180, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
  },
  xpFill: { height: 6, backgroundColor: '#7cc4ff' },

  bossBarWrap: { position: 'absolute', top: 46, left: 20, right: 20, alignItems: 'center' },
  bossLabel: { color: '#ff8a7a', fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  bossTrack: {
    height: 12, width: '100%', borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  bossFill: { height: 12, backgroundColor: '#ff5a3c' },

  banner: { position: 'absolute', top: 118, left: 0, right: 0, alignItems: 'center' },
  bannerText: {
    color: '#b6ffcf', fontSize: 15, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, overflow: 'hidden',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,14,0.86)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  overlayTitle: { color: '#ffffff', fontSize: 30, fontWeight: '800' },
  overlaySub: { color: '#9aa0aa', fontSize: 15, marginTop: 4, marginBottom: 22 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', maxWidth: 360,
    backgroundColor: '#1d212a', borderWidth: 2, borderRadius: 14,
    padding: 16, marginVertical: 8,
  },
  cardChip: { width: 34, height: 34, borderRadius: 8, marginRight: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  cardStack: {
    color: '#0b1220', fontSize: 12, fontWeight: '800', marginLeft: 8,
    backgroundColor: '#7cc4ff', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, overflow: 'hidden',
  },
  cardDesc: { color: '#aab2c0', fontSize: 14, marginTop: 2 },
  cardRarity: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  deadTitle: { color: '#e5484d', fontSize: 34, fontWeight: '800', marginBottom: 18 },
  stat: { color: '#dfe4ec', fontSize: 17, marginVertical: 3 },
  goldEarned: { color: '#ffd45e', fontSize: 20, fontWeight: '800', marginTop: 10 },
  btnRow: { flexDirection: 'row', marginTop: 26 },
  endBtn: { paddingHorizontal: 26, paddingVertical: 14, borderRadius: 12, marginHorizontal: 8 },
  menuBtn: { backgroundColor: '#2a2f3a' },
  menuText: { color: '#dfe4ec', fontSize: 17, fontWeight: '700' },
  againBtn: { backgroundColor: '#3ecf5f' },
  againText: { color: '#08240f', fontSize: 17, fontWeight: '800' },
});
