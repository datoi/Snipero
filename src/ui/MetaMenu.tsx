import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  MetaState,
  UPGRADES,
  UpgradeId,
  canAfford,
  isMaxed,
  levelOf,
  nextCost,
} from '../systems/meta';
import { GearDef } from '../systems/gear';
import { GearMenu } from './GearMenu';
import { ChapterSelect } from './ChapterSelect';
import { HeroMenu } from './HeroMenu';
import { HeroDef } from '../systems/heroes';

type Tab = 'play' | 'hero' | 'gear' | 'talents';

interface Props {
  meta: MetaState;
  onBuy: (id: UpgradeId) => void;
  onStart: (chapter: number, endless: boolean) => void;
  /** False until the save has been read. See `ready` handling below. */
  ready: boolean;
  gear: {
    onUnlock: (def: GearDef) => void;
    onUpgrade: (def: GearDef) => void;
    onEquip: (def: GearDef) => void;
  };
  heroes: {
    onUnlock: (def: HeroDef) => void;
    onUpgrade: (def: HeroDef) => void;
    onSelect: (def: HeroDef) => void;
  };
}

// The between-runs home screen: gold, the two things gold buys, and the button
// that starts a run.
//
// Gear and talents are separate tabs rather than one long list because they
// answer different questions. Gear is "what am I taking in?" and changes how the
// run plays; talents are "what am I permanently a bit better at?". Stacked
// together the talents drowned the loadout, which is the more interesting choice.
export function MetaMenu({ meta, onBuy, onStart, ready, gear, heroes }: Props) {
  const [tab, setTab] = useState<Tab>('play');

  return (
    <View style={styles.root}>
      <Text style={styles.title}>ARROW ROGUE</Text>
      <Text style={styles.gold}>🪙 {meta.gold}</Text>

      <View style={styles.mainTabs}>
        {(['play', 'hero', 'gear', 'talents'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.mainTab, tab === t && styles.mainTabActive]}
          >
            <Text style={[styles.mainTabText, tab === t && styles.mainTabTextActive]}>
              {t === 'play' ? 'Play' : t === 'hero' ? 'Hero' : t === 'gear' ? 'Gear' : 'Talents'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'play' ? (
        <ChapterSelect meta={meta} ready={ready} onStart={onStart} />
      ) : tab === 'hero' ? (
        <HeroMenu
          meta={meta}
          onUnlock={heroes.onUnlock}
          onUpgrade={heroes.onUpgrade}
          onSelect={heroes.onSelect}
        />
      ) : tab === 'gear' ? (
        <GearMenu
          meta={meta}
          onUnlock={gear.onUnlock}
          onUpgrade={gear.onUpgrade}
          onEquip={gear.onEquip}
        />
      ) : (
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 12 }}>
        {UPGRADES.map((u) => {
          const lvl = levelOf(meta, u.id);
          const maxed = isMaxed(meta, u.id);
          const afford = canAfford(meta, u.id);
          const cost = nextCost(meta, u.id);
          return (
            <View key={u.id} style={[styles.card, { borderColor: u.color }]}>
              <View style={[styles.chip, { backgroundColor: u.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {u.title} <Text style={styles.lvl}>Lv {lvl}/{u.maxLevel}</Text>
                </Text>
                <Text style={styles.cardDesc}>{u.desc}</Text>
              </View>
              <Pressable
                disabled={maxed || !afford}
                onPress={() => onBuy(u.id)}
                style={[
                  styles.buy,
                  maxed ? styles.buyMax : afford ? styles.buyOk : styles.buyNo,
                ]}
              >
                <Text style={styles.buyText}>{maxed ? 'MAX' : `🪙 ${cost}`}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      )}

      {/* A run now starts from a chapter, so the single Start button is gone.
          The "held until the save loads" guard moved with it into ChapterSelect:
          starting against default meta would drop every permanent upgrade, and
          dying in that window would bank over the real total. */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15171c', paddingTop: 70, paddingHorizontal: 20, alignItems: 'center' },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  gold: { color: '#ffd45e', fontSize: 26, fontWeight: '800', marginTop: 12 },
  section: { color: '#9aa0aa', fontSize: 14, marginTop: 18, marginBottom: 8, alignSelf: 'flex-start' },

  mainTabs: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 16, marginBottom: 10 },
  mainTab: {
    flex: 1, paddingVertical: 10, borderRadius: 12, marginHorizontal: 2,
    backgroundColor: '#1d212a', alignItems: 'center',
  },
  mainTabActive: { backgroundColor: '#3ecf5f' },
  mainTabText: { color: '#9aa0aa', fontSize: 13, fontWeight: '800' },
  mainTabTextActive: { color: '#08240f' },
  list: { alignSelf: 'stretch' },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1d212a', borderWidth: 2, borderRadius: 14,
    padding: 14, marginVertical: 7,
  },
  chip: { width: 30, height: 30, borderRadius: 8, marginRight: 12 },
  cardTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  lvl: { color: '#8b93a1', fontSize: 13, fontWeight: '600' },
  cardDesc: { color: '#aab2c0', fontSize: 13, marginTop: 2 },

  buy: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginLeft: 10, minWidth: 74, alignItems: 'center' },
  buyOk: { backgroundColor: '#3ecf5f' },
  buyNo: { backgroundColor: '#2a2f3a' },
  buyMax: { backgroundColor: '#3a3f4a' },
  buyText: { color: '#0b1a10', fontSize: 14, fontWeight: '800' },

  start: {
    backgroundColor: '#3ecf5f', paddingVertical: 16, paddingHorizontal: 40,
    borderRadius: 14, marginTop: 14, marginBottom: 24,
  },
  startWaiting: { backgroundColor: '#2a2f3a' },
  startText: { color: '#08240f', fontSize: 20, fontWeight: '900' },
});
