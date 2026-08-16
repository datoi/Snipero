import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { World } from '../engine/types';
import { useFrameTick } from '../hooks/useGameLoop';
import { getSkill, requestSkill, skillCharge } from '../systems/skills';

// The one button in the game.
//
// Ticked at 10Hz, same reasoning as the HUD: this is a readout, not animation.
// A cooldown ring redrawn 60 times a second is not more informative than one
// redrawn 10 times, it just costs six times the layout passes — and this sits
// on top of the arena canvas, which needs every frame it can get.
//
// The fill is a plain View clipped by the button's own border radius rather
// than a real radial sweep. A true circular wipe needs SVG or Skia, and the
// renderer is deliberately swappable here (the game runs on either), so the one
// piece of UI chrome that would force a dependency gets the version that works
// on both. A column filling upward reads as "charging" perfectly well.
export function SkillButton({ world }: { world: World }) {
  useFrameTick(10);

  const p = world.player;
  const def = getSkill(p.skill);

  // A hero whose skill this build doesn't recognise gets no button at all,
  // rather than a dead one. See getSkill.
  if (!def) return null;

  const charge = skillCharge(p);
  const ready = charge >= 1;
  const active = p.skillTimer > 0;

  return (
    <Pressable
      onPress={() => requestSkill(world)}
      // Generous, because this is pressed with a thumb in the middle of dodging
      // something. The press is buffered by the simulation anyway, so an early
      // tap is honoured rather than dropped — see CONFIG.skills.bufferTime.
      hitSlop={16}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: ready ? p.color : 'rgba(255,255,255,0.22)' },
        // Held-down feedback matters more than usual here: when the skill is on
        // cooldown the press is otherwise completely silent, and a button that
        // does nothing AND looks like nothing reads as broken.
        pressed && styles.pressed,
        active && styles.active,
      ]}
    >
      {/* Cooldown, filling from the bottom. Sits behind the glyph. */}
      <View style={styles.fillWrap} pointerEvents="none">
        <View
          style={[
            styles.fill,
            { height: `${charge * 100}%`, backgroundColor: ready ? p.color : '#4a5163' },
          ]}
        />
      </View>

      <Text style={[styles.icon, !ready && styles.iconDim]}>{def.icon}</Text>

      {/* The number is for the wait, so it only exists during one. */}
      {!ready && <Text style={styles.count}>{Math.ceil(p.skillCd)}</Text>}
    </Pressable>
  );
}

const SIZE = 78;

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    // Bottom-right, thumb-reachable one-handed, and clear of the joystick's
    // usual resting half of the screen. Raised off the bottom edge to stay
    // above the home indicator on a gesture-nav phone.
    right: 24,
    bottom: 48,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    backgroundColor: 'rgba(12,15,22,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: { transform: [{ scale: 0.93 }] },
  active: { borderColor: '#ffffff' },

  fillWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  fill: { width: '100%', opacity: 0.28 },

  icon: { fontSize: 30 },
  iconDim: { opacity: 0.45 },
  count: {
    position: 'absolute',
    bottom: 6,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
