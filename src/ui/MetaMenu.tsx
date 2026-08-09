import React from 'react';
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

interface Props {
  meta: MetaState;
  onBuy: (id: UpgradeId) => void;
  onStart: () => void;
}

// The between-runs home screen: shows gold, permanent upgrades to buy, and a
// button to start a run (mirrors the Unity Meta menu scene).
export function MetaMenu({ meta, onBuy, onStart }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>ARROW ROGUE</Text>
      <Text style={styles.gold}>🪙 {meta.gold}</Text>
      <Text style={styles.section}>Permanent Upgrades</Text>

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

      <Pressable style={styles.start} onPress={onStart}>
        <Text style={styles.startText}>Start Run ▶</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15171c', paddingTop: 70, paddingHorizontal: 20, alignItems: 'center' },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  gold: { color: '#ffd45e', fontSize: 26, fontWeight: '800', marginTop: 12 },
  section: { color: '#9aa0aa', fontSize: 14, marginTop: 18, marginBottom: 8, alignSelf: 'flex-start' },
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
  startText: { color: '#08240f', fontSize: 20, fontWeight: '900' },
});
