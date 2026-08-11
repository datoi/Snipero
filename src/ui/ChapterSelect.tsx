import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CONFIG } from '../config';
import { MetaState } from '../systems/meta';

interface Props {
  meta: MetaState;
  ready: boolean;
  onStart: (chapter: number, endless: boolean) => void;
}

// Where a run is chosen. Chapters unlock in order, and Endless only appears once
// the last one has been beaten — it is the thing you do when the game is over,
// not an alternative to playing it.
export function ChapterSelect({ meta, ready, onStart }: Props) {
  const chapters = CONFIG.chapters;
  const allCleared = meta.chaptersCleared >= chapters.length;

  return (
    <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 16 }}>
      {chapters.map((ch, i) => {
        // One ahead of what you've cleared is always available: beating chapter 1
        // unlocks chapter 2 and nothing further.
        const unlocked = i <= meta.chaptersCleared;
        const cleared = i < meta.chaptersCleared;
        const boss = CONFIG.boss.variants[ch.boss % CONFIG.boss.variants.length];

        return (
          <Pressable
            key={ch.title}
            disabled={!unlocked || !ready}
            onPress={() => onStart(i, false)}
            style={[
              styles.card,
              { borderColor: unlocked ? boss.phases[0].color : '#2a2f3a' },
              !unlocked && styles.locked,
            ]}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.head}>
                <Text style={[styles.title, !unlocked && styles.dim]}>
                  {unlocked ? ch.title : '???'}
                </Text>
                {cleared && <Text style={styles.clearedTag}>CLEARED</Text>}
              </View>
              <Text style={[styles.sub, !unlocked && styles.dim]}>
                {unlocked
                  ? `${ch.rooms} rooms  ·  ${boss.title}`
                  : `Beat ${chapters[i - 1].title} to unlock`}
              </Text>
            </View>
            <Text style={[styles.go, !unlocked && styles.dim]}>{unlocked ? '▶' : '🔒'}</Text>
          </Pressable>
        );
      })}

      {allCleared && (
        <Pressable
          disabled={!ready}
          onPress={() => onStart(chapters.length - 1, true)}
          style={[styles.card, styles.endless]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Endless</Text>
            <Text style={styles.sub}>No last room. How deep can you get?</Text>
          </View>
          <Text style={styles.go}>∞</Text>
        </Pressable>
      )}

      {!ready && <Text style={styles.loading}>Loading save…</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { alignSelf: 'stretch' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1d212a', borderWidth: 2, borderRadius: 14,
    padding: 16, marginVertical: 7,
  },
  locked: { opacity: 0.55 },
  endless: { borderColor: '#ffd45e' },

  head: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  sub: { color: '#aab2c0', fontSize: 13, marginTop: 3 },
  dim: { color: '#6b7280' },
  clearedTag: {
    color: '#08240f', fontSize: 10, fontWeight: '900', marginLeft: 8,
    backgroundColor: '#3ecf5f', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, overflow: 'hidden', letterSpacing: 0.5,
  },
  go: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginLeft: 12 },
  loading: { color: '#9aa0aa', fontSize: 13, textAlign: 'center', marginTop: 8 },
});
