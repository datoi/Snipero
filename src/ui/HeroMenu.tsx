import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HEROES, HeroDef, MAX_HERO_LEVEL, heroUpgradeCost } from '../systems/heroes';
import {
  MetaState,
  canUnlockHero,
  canUpgradeHero,
  heroLevel,
  ownsHero,
} from '../systems/meta';

interface Props {
  meta: MetaState;
  onUnlock: (def: HeroDef) => void;
  onUpgrade: (def: HeroDef) => void;
  onSelect: (def: HeroDef) => void;
}

// Roster. One card per hero, with the single action available on it — buy it,
// level it, or play as it. The description sells how it *plays* rather than
// listing its stats: the numbers are the least interesting thing about a
// character whose whole point is a different rhythm.
export function HeroMenu({ meta, onUnlock, onUpgrade, onSelect }: Props) {
  return (
    <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 16 }}>
      {HEROES.map((def) => {
        const owned = ownsHero(meta, def.id);
        const lvl = heroLevel(meta, def.id);
        const active = meta.hero === def.id;
        const maxed = lvl >= MAX_HERO_LEVEL;

        return (
          <View key={def.id} style={[styles.card, { borderColor: def.color }]}>
            <View style={[styles.portrait, { backgroundColor: def.color }]} />

            <View style={{ flex: 1 }}>
              <View style={styles.head}>
                <Text style={styles.title}>{owned ? def.title : '???'}</Text>
                {owned && <Text style={styles.lvl}>Lv {lvl}</Text>}
                {active && <Text style={styles.active}>PLAYING</Text>}
              </View>
              <Text style={styles.desc}>{def.desc}</Text>
            </View>

            <View style={styles.actions}>
              {!owned ? (
                <Pressable
                  disabled={!canUnlockHero(meta, def)}
                  onPress={() => onUnlock(def)}
                  style={[styles.btn, canUnlockHero(meta, def) ? styles.btnOk : styles.btnNo]}
                >
                  <Text style={styles.btnText}>🪙 {def.unlockCost}</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    disabled={active}
                    onPress={() => onSelect(def)}
                    style={[styles.btn, active ? styles.btnMax : styles.btnPick]}
                  >
                    <Text style={styles.btnText}>{active ? 'ACTIVE' : 'Play'}</Text>
                  </Pressable>
                  <Pressable
                    disabled={!canUpgradeHero(meta, def)}
                    onPress={() => onUpgrade(def)}
                    style={[
                      styles.btn,
                      maxed ? styles.btnMax : canUpgradeHero(meta, def) ? styles.btnOk : styles.btnNo,
                    ]}
                  >
                    <Text style={styles.btnText}>
                      {maxed ? 'MAX' : `🪙 ${heroUpgradeCost(lvl)}`}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { alignSelf: 'stretch' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1d212a', borderWidth: 2, borderRadius: 14,
    padding: 12, marginVertical: 6,
  },
  portrait: { width: 38, height: 38, borderRadius: 19, marginRight: 12 },

  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  lvl: {
    color: '#0b1220', fontSize: 11, fontWeight: '800', marginLeft: 8,
    backgroundColor: '#7cc4ff', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, overflow: 'hidden',
  },
  active: {
    color: '#08240f', fontSize: 10, fontWeight: '900', marginLeft: 6,
    backgroundColor: '#3ecf5f', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, overflow: 'hidden', letterSpacing: 0.5,
  },
  desc: { color: '#aab2c0', fontSize: 13, marginTop: 3 },

  actions: { marginLeft: 10, minWidth: 80 },
  btn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    alignItems: 'center', marginVertical: 2,
  },
  btnOk: { backgroundColor: '#3ecf5f' },
  btnNo: { backgroundColor: '#2a2f3a' },
  btnMax: { backgroundColor: '#39414f' },
  btnPick: { backgroundColor: '#4c9aff' },
  btnText: { color: '#08240f', fontSize: 13, fontWeight: '800' },
});
