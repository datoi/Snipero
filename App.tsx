import React, { useEffect, useRef, useState } from 'react';
import {
  AppState, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createWorld, resetWorld, resizeWorld } from './src/systems/world';
import { useGameLoop, useWorldValue } from './src/hooks/useGameLoop';
// RN-Views renderer: runs anywhere, including Expo Go. Slower — it rebuilds a
// few hundred Views per frame — but it needs no native modules, and Skia is the
// only dependency Expo Go cannot provide.
//
// Swap to './src/render/GameCanvasSkia' once you have a development build; the
// prop contract is identical and both drive their own repaint off the loop.
import { GameCanvas } from './src/render/GameCanvas';
import { Hud } from './src/ui/Hud';
import { Joystick } from './src/input/Joystick';
import { RARITY_COLOR, getAbility, stacksOf } from './src/systems/abilities';
import { chooseAbility, pauseRun, resumeRun } from './src/systems/progression';
import { MetaMenu } from './src/ui/MetaMenu';
import {
  MetaState,
  UpgradeId,
  applyMeta,
  buyUpgrade,
  defaultMeta,
  equipGear,
  grantGear,
  loadMeta,
  saveMeta,
  selectHero,
  unlockGear,
  unlockHero,
  upgradeGear,
  upgradeHero,
} from './src/systems/meta';
import { GearDef } from './src/systems/gear';
import { HeroDef } from './src/systems/heroes';
import { Vec2 } from './src/engine/vec';
import { World } from './src/engine/types';
import { CONFIG } from './src/config';
import { THEME } from './src/render/theme';
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
  const bankedRef = useRef(0); // gold already transferred out of this run

  const [screen, setScreen] = useState<Screen>('home');
  const [meta, setMeta] = useState<MetaState>(defaultMeta());
  const [metaLoaded, setMetaLoaded] = useState(false);

  // Load persisted meta once at startup. Until this resolves the menu shows a
  // loading state rather than a Start button: starting a run against the default
  // meta would silently drop every permanent upgrade the player has bought, and
  // dying in that window would then bank `defaultGold + earned` over the real
  // total — losing the bank to a race the player can't see.
  useEffect(() => {
    loadMeta().then((m) => {
      setMeta(m);
      setMetaLoaded(true);
    });
  }, []);

  // Keep the simulation on the same arena the renderer is drawing.
  useEffect(() => {
    resizeWorld(world, width, height);
  }, [world, width, height]);

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

  // App itself no longer re-renders per frame — the canvas and the HUD each
  // subscribe to the loop at their own cadence. These two are the only pieces of
  // world state the shell reacts to: the run status, and the identity of the
  // current draft hand (a fresh array every roll, so a queued second level-up
  // swaps the cards without the status ever leaving 'drafting').
  const status = useWorldValue(() => world.status);
  const draftOptions = useWorldValue(() => world.draftOptions);
  const roomIndex = useWorldValue(() => world.roomIndex);

  const player = world.player;

  // Bank whatever the run has earned but not yet handed over.
  //
  // Gold used to bank only on death, so backgrounding the app or having it
  // killed mid-run threw away everything earned that run — the one outcome a
  // player will not forgive. Banking on every room transition means the most
  // that can ever be lost is the room currently being fought.
  // The ledger is symmetric: `bankedRef` records what the wallet has already
  // been told about, and the difference is settled in EITHER direction.
  //
  // It used to only ever rise, which quietly made the Forge free. Banking keys
  // on roomIndex and loadRoom advances that on the way *into* a reward room, so
  // the bank always fires before the player can reach a shrine — then the Forge
  // decremented world.runGold, the next diff came out negative, and the early
  // return threw the spend away. The player kept gold they had spent, and the
  // one card whose entire job is giving run gold a use during the run cost
  // nothing at all.
  const bankRunGold = React.useCallback(() => {
    const delta = world.runGold - bankedRef.current;
    // Gear is drained rather than diffed: it's a list, not a running total, and
    // taking it off the world is what makes banking it idempotent.
    const foundGear = world.gearFound.splice(0);
    if (delta === 0 && foundGear.length === 0) return;

    bankedRef.current = world.runGold;
    setMeta((prev) => {
      // Math.max guards the wallet against ever going negative, which the spend
      // rules should already prevent — a shrine refuses anything unaffordable —
      // but a wallet is not the place to find out a rule was wrong.
      let next = delta !== 0
        ? { ...prev, gold: Math.max(0, prev.gold + delta) }
        : prev;
      for (const id of foundGear) next = grantGear(next, id);
      if (next !== prev) saveMeta(next);
      return next;
    });
  }, [world]);

  // Room cleared and walked out of — bank the takings.
  useEffect(() => {
    if (screen === 'game') bankRunGold();
  }, [screen, roomIndex, bankRunGold]);

  // Death banks the final room's share.
  useEffect(() => {
    if (screen === 'game' && status === 'dead') bankRunGold();
  }, [screen, status, bankRunGold]);

  // Leaving the app is the other way a run ends without a death screen. Pause
  // as well as bank: coming back to a phone that has been simulating the whole
  // time you were in another app is its own way to lose a run.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        bankRunGold();
        pauseRun(world);
      }
    });
    return () => sub.remove();
  }, [bankRunGold, world]);

  const startRun = (chapter: number, endless: boolean) => {
    resetWorld(world, chapter, endless);
    applyMeta(world.player, meta); // gear + talents onto the fresh player
    bankedRef.current = 0;
    setScreen('game');
  };

  // Beating a chapter unlocks the next one. Guarded on the chapter actually
  // being the frontier so replaying an old chapter can't push the counter past
  // what's been earned, and endless never counts at all.
  useEffect(() => {
    if (screen !== 'game' || status !== 'won') return;
    bankRunGold();
    if (world.endless) return;
    setMeta((prev) => {
      if (world.chapter !== prev.chaptersCleared) return prev;
      const next = { ...prev, chaptersCleared: prev.chaptersCleared + 1 };
      saveMeta(next);
      return next;
    });
  }, [screen, status, bankRunGold, world]);

  const handleBuy = (id: UpgradeId) => {
    setMeta((prev) => {
      const next = buyUpgrade(prev, id);
      if (next !== prev) saveMeta(next);
      return next;
    });
  };

  // Gear actions all share the same shape: hand the current meta to a pure
  // transform, persist only if it actually changed. The transforms already
  // refuse anything unaffordable, so the UI never has to guard twice.
  const heroAction = (fn: (m: MetaState, d: HeroDef) => MetaState) => (def: HeroDef) => {
    setMeta((prev) => {
      const next = fn(prev, def);
      if (next !== prev) saveMeta(next);
      return next;
    });
  };

  const gearAction = (fn: (m: MetaState, d: GearDef) => MetaState) => (def: GearDef) => {
    setMeta((prev) => {
      const next = fn(prev, def);
      if (next !== prev) saveMeta(next);
      return next;
    });
  };

  const heroHandlers = React.useMemo(
    () => ({
      onUnlock: heroAction(unlockHero),
      onUpgrade: heroAction(upgradeHero),
      onSelect: heroAction(selectHero),
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const gearHandlers = React.useMemo(
    () => ({
      onUnlock: gearAction(unlockGear),
      onUpgrade: gearAction(upgradeGear),
      onEquip: gearAction(equipGear),
    }),
    // gearAction closes over setMeta only, which is stable.
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

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
        <MetaMenu
          meta={meta}
          onBuy={handleBuy}
          onStart={startRun}
          ready={metaLoaded}
          gear={gearHandlers}
          heroes={heroHandlers}
        />
        <Pressable style={styles.muteBtn} onPress={toggleMute} hitSlop={12}>
          <Text style={styles.muteText}>{meta.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
        <StatusBar hidden />
      </View>
    );
  }

  // ── In-run ──
  return (
    <View style={styles.root}>
      <GameCanvas world={world} width={width} height={height} />

      <Hud world={world} />

      {/* Always mounted, disabled while an overlay owns the screen — unmounting
          it mid-gesture is what used to strand the last held direction. */}
      <Joystick onChange={handleInput} enabled={status === 'playing'} />

      {/* AFTER the joystick, deliberately.
          The stick is an absoluteFill covering the entire screen so a drag can
          start anywhere, which means anything painted before it is untappable —
          the pause button sat underneath and swallowed every press. Later in the
          tree wins the touch, so anything the player must be able to hit during
          play belongs below this line. */}
      {status === 'playing' && (
        <Pressable style={styles.pauseBtn} onPress={() => pauseRun(world)} hitSlop={12}>
          <Text style={styles.pauseIcon}>❚❚</Text>
        </Pressable>
      )}


      {/* Level-up card draft */}
      {status === 'drafting' && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Level Up!</Text>
          <Text style={styles.overlaySub}>Choose one</Text>
          {draftOptions.map((id) => {
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

      {/* Paused */}
      {status === 'paused' && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Paused</Text>
          <Text style={styles.overlaySub}>Room {world.roomIndex + 1}  ·  🪙 {world.runGold} banked</Text>
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.endBtn, styles.menuBtn]}
              onPress={() => { bankRunGold(); setScreen('home'); }}
            >
              <Text style={styles.menuText}>Quit run</Text>
            </Pressable>
            <Pressable style={[styles.endBtn, styles.againBtn]} onPress={() => resumeRun(world)}>
              <Text style={styles.againText}>Resume</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Chapter cleared — the only ending that isn't a death */}
      {status === 'won' && (
        <View style={styles.overlay}>
          <Text style={styles.wonTitle}>Chapter Clear!</Text>
          <Text style={styles.stat}>
            {CONFIG.chapters[world.chapter % CONFIG.chapters.length].title}
          </Text>
          <Text style={styles.stat}>Enemies slain: {world.enemiesKilled}</Text>
          <Text style={styles.goldEarned}>🪙 {world.runGold} earned</Text>
          <View style={styles.btnRow}>
            <Pressable style={[styles.endBtn, styles.againBtn]} onPress={() => setScreen('home')}>
              <Text style={styles.againText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Death / run-end screen */}
      {status === 'dead' && (
        <View style={styles.overlay}>
          <Text style={styles.deadTitle}>You Died</Text>
          <Text style={styles.stat}>Reached Room {world.roomIndex + 1}</Text>
          <Text style={styles.stat}>Enemies slain: {world.enemiesKilled}</Text>
          <Text style={styles.goldEarned}>🪙 {world.runGold} earned</Text>
          <View style={styles.btnRow}>
            <Pressable style={[styles.endBtn, styles.menuBtn]} onPress={() => setScreen('home')}>
              <Text style={styles.menuText}>Menu</Text>
            </Pressable>
            <Pressable
              style={[styles.endBtn, styles.againBtn]}
              onPress={() => startRun(world.chapter, world.endless)}
            >
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
  // Frame colour behind the arena panel — see src/render/theme.ts.
  root: { flex: 1, backgroundColor: THEME.wallColor },

  // Live run readouts (health, depth, boss bar, room prompt) live in src/ui/Hud.
  muteBtn: {
    position: 'absolute', top: 50, right: 20,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  muteText: { fontSize: 20 },

  // Mirrors muteBtn's placement on the home screen so the corner control is
  // always in the same spot whichever screen you're on.
  pauseBtn: {
    position: 'absolute', top: 50, right: 20,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  pauseIcon: { color: '#dfe4ec', fontSize: 15, fontWeight: '800', letterSpacing: 1 },

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

  wonTitle: { color: '#3ecf5f', fontSize: 34, fontWeight: '800', marginBottom: 18 },
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
