import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { CONFIG } from '../config';
import { Vec2 } from '../engine/vec';

interface Props {
  // Called every time the stick moves or is released.
  onChange: (axis: Vec2, moving: boolean) => void;
  // False while an overlay owns the screen (drafting, dead). The component stays
  // mounted either way — see below.
  enabled: boolean;
}

// Floating virtual joystick built on React Native's core PanResponder — no
// native modules, so it works in any Expo Go. The base appears where the finger
// lands; the knob follows within a fixed radius. Axis comes from the gesture's
// own translation (dx/dy), and the base position lives in a ref to avoid stale
// closures inside the once-created responder.
export function Joystick({ onChange, enabled }: Props) {
  const R = CONFIG.joystick.radius;
  const [active, setActive] = useState(false);
  const [base, setBase] = useState<Vec2>({ x: 0, y: 0 });
  const [knob, setKnob] = useState<Vec2>({ x: 0, y: 0 });
  const originRef = useRef<Vec2>({ x: 0, y: 0 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { pageX, pageY } = evt.nativeEvent;
          originRef.current = { x: pageX, y: pageY };
          setBase({ x: pageX, y: pageY });
          setKnob({ x: pageX, y: pageY });
          setActive(true);
          onChange({ x: 0, y: 0 }, false);
        },
        onPanResponderMove: (_evt, g) => {
          const d = Math.hypot(g.dx, g.dy) || 1;
          const clamped = Math.min(d, R);
          const nx = (g.dx / d) * clamped;
          const ny = (g.dy / d) * clamped;
          setKnob({ x: originRef.current.x + nx, y: originRef.current.y + ny });

          const axis = { x: nx / R, y: ny / R };
          const moving = Math.hypot(axis.x, axis.y) > CONFIG.joystick.deadZone;
          onChange(axis, moving);
        },
        onPanResponderRelease: () => {
          setActive(false);
          onChange({ x: 0, y: 0 }, false); // released == stopped == shoot
        },
        onPanResponderTerminate: () => {
          setActive(false);
          onChange({ x: 0, y: 0 }, false);
        },
      }),
    // Created once. onChange/R close over stable references (worldRef/const).
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Drop the stick whenever play is interrupted. This component is deliberately
  // kept mounted for the whole run rather than being conditionally rendered:
  // unmounting it mid-gesture destroys the responder before it can deliver
  // onPanResponderRelease, so nothing ever reports the finger going up and the
  // last held direction stays latched. The simulation clears its own input at
  // the same boundary; this keeps the visual and the responder in step with it,
  // and lets a still-held finger resume driving movement when play comes back.
  useEffect(() => {
    if (!enabled) {
      setActive(false);
      onChange({ x: 0, y: 0 }, false);
    }
    // onChange is recreated every render by the parent; the responder above
    // already relies on it being interchangeable, so it stays out of the deps.
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={enabled ? 'auto' : 'none'}
      {...responder.panHandlers}
    >
      {enabled && active && (
        <>
          <View
            style={[
              styles.base,
              { left: base.x - R, top: base.y - R, width: R * 2, height: R * 2, borderRadius: R },
            ]}
          />
          <View style={[styles.knob, { left: knob.x - 26, top: knob.y - 26 }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  knob: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
});
