import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  GEAR_RARITY_COLOR,
  GearDef,
  GearSlot,
  MAX_GEAR_LEVEL,
  gearForSlot,
  unlockCost,
  upgradeCost,
} from '../systems/gear';
import {
  MetaState,
  canUnlock,
  canUpgradeGear,
  gearLevel,
  ownsGear,
} from '../systems/meta';

interface Props {
  meta: MetaState;
  onUnlock: (def: GearDef) => void;
  onUpgrade: (def: GearDef) => void;
  onEquip: (def: GearDef) => void;
}

const SLOTS: { id: GearSlot; label: string }[] = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'armor', label: 'Armour' },
  { id: 'ring', label: 'Ring' },
];

// Loadout screen: one slot at a time, every item in that slot listed with the
// single action available on it — buy it, level it, or wear it. Showing all
// three slots at once turned into a wall of cards where nothing was obviously
// actionable; a slot tab keeps the question to "what am I holding?".
export function GearMenu({ meta, onUnlock, onUpgrade, onEquip }: Props) {
  const [slot, setSlot] = useState<GearSlot>('weapon');
  const items = gearForSlot(slot);

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {SLOTS.map((s) => {
          const active = s.id === slot;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSlot(s.id)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 12 }}>
        {items.map((def) => {
          const owned = ownsGear(meta, def.id);
          const lvl = gearLevel(meta, def.id);
          const worn = meta.equipped[def.slot] === def.id;
          const rarity = GEAR_RARITY_COLOR[def.rarity];
          const maxed = lvl >= MAX_GEAR_LEVEL;

          return (
            <View key={def.id} style={[styles.card, { borderColor: rarity }]}>
              <View style={[styles.chip, { backgroundColor: def.color }]} />

              <View style={{ flex: 1 }}>
                <View style={styles.head}>
                  <Text style={styles.title}>{def.title}</Text>
                  {owned && <Text style={styles.lvl}>Lv {lvl}</Text>}
                  {worn && <Text style={styles.worn}>EQUIPPED</Text>}
                </View>
                <Text style={styles.desc}>{def.desc}</Text>
                <Text style={[styles.rarity, { color: rarity }]}>
                  {def.rarity.toUpperCase()}
                </Text>
              </View>

              <View style={styles.actions}>
                {!owned ? (
                  <Pressable
                    disabled={!canUnlock(meta, def)}
                    onPress={() => onUnlock(def)}
                    style={[styles.btn, canUnlock(meta, def) ? styles.btnOk : styles.btnNo]}
                  >
                    <Text style={styles.btnText}>🪙 {unlockCost(def)}</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      disabled={worn}
                      onPress={() => onEquip(def)}
                      style={[styles.btn, worn ? styles.btnMax : styles.btnEquip]}
                    >
                      <Text style={styles.btnText}>{worn ? 'WORN' : 'Equip'}</Text>
                    </Pressable>
                    <Pressable
                      disabled={!canUpgradeGear(meta, def)}
                      onPress={() => onUpgrade(def)}
                      style={[
                        styles.btn,
                        maxed ? styles.btnMax : canUpgradeGear(meta, def) ? styles.btnOk : styles.btnNo,
                      ]}
                    >
                      <Text style={styles.btnText}>
                        {maxed ? 'MAX' : `🪙 ${upgradeCost(def, lvl)}`}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignSelf: 'stretch' },

  tabs: { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 10 },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: 10, marginHorizontal: 3,
    backgroundColor: '#1d212a', alignItems: 'center',
  },
  tabActive: { backgroundColor: '#33405a' },
  tabText: { color: '#9aa0aa', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#ffffff' },

  list: { alignSelf: 'stretch' },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1d212a', borderWidth: 2, borderRadius: 14,
    padding: 12, marginVertical: 6,
  },
  chip: { width: 30, height: 30, borderRadius: 8, marginRight: 12 },

  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  lvl: {
    color: '#0b1220', fontSize: 11, fontWeight: '800', marginLeft: 8,
    backgroundColor: '#7cc4ff', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, overflow: 'hidden',
  },
  worn: {
    color: '#08240f', fontSize: 10, fontWeight: '900', marginLeft: 6,
    backgroundColor: '#3ecf5f', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, overflow: 'hidden', letterSpacing: 0.5,
  },
  desc: { color: '#aab2c0', fontSize: 13, marginTop: 2 },
  rarity: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginTop: 3 },

  actions: { marginLeft: 10, alignItems: 'stretch', minWidth: 78 },
  btn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    alignItems: 'center', marginVertical: 2,
  },
  btnOk: { backgroundColor: '#3ecf5f' },
  btnNo: { backgroundColor: '#2a2f3a' },
  btnMax: { backgroundColor: '#39414f' },
  btnEquip: { backgroundColor: '#4c9aff' },
  btnText: { color: '#08240f', fontSize: 13, fontWeight: '800' },
});
