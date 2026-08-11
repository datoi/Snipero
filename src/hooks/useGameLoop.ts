import { useEffect, useReducer, useRef } from 'react';
import { World } from '../engine/types';
import { updateWorld } from '../systems/update';

// The frame bus.
//
// The loop used to force a React re-render of the entire app every frame. That
// dragged the HUD, the overlays and every arena node through reconciliation
// 60x/sec for a scene whose only genuinely per-frame need is one canvas repaint
// — and since every node was built with inline style literals, nothing could
// memoize and Yoga re-laid-out the whole tree for a scene that has no layout.
//
// Now the loop owns the clock and nothing else. It advances the simulation
// against the mutable world and tells its subscribers; each subscriber decides
// how often it actually wants to hear. The canvas repaints every frame, the HUD
// settles for 10Hz, and overlays wake only when the value they care about flips.
//
// Module-level rather than a context: there is exactly one loop and one world
// for the lifetime of the app, and threading a provider through for it would be
// ceremony around a singleton. Same reasoning as the sfx sinks.
type FrameListener = (t: number) => void;
const listeners = new Set<FrameListener>();

export function subscribeFrame(fn: FrameListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Drives the simulation with requestAnimationFrame. `runningRef` gates it: when
// false (e.g. on the home menu) the world is left frozen and no frame is emitted,
// so nothing downstream repaints either.
export function useGameLoop(
  world: World,
  runningRef: React.MutableRefObject<boolean>
) {
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    lastRef.current = 0;

    const frame = (t: number) => {
      if (lastRef.current === 0) lastRef.current = t;
      let dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      if (dt > 0.05) dt = 0.05; // clamp huge gaps

      if (runningRef.current) {
        updateWorld(world, dt);
        // Copied before iterating: a listener that unsubscribes on its own frame
        // would otherwise mutate the set mid-iteration.
        for (const fn of Array.from(listeners)) fn(t);
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [world, runningRef]);
}

// Re-render the calling component from the game loop at up to `hz`.
//
// This is a deliberate opt-in: a component that wants to show live simulation
// state asks for a cadence, and pays for exactly that. Nothing else in the tree
// is disturbed.
export function useFrameTick(hz: number) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const lastRef = useRef(0);

  useEffect(() => {
    // 2ms of slack, so a 60Hz request clears the ~16.67ms frame gap every time
    // rather than dropping every other frame to float jitter.
    const minGap = 1000 / hz - 2;
    return subscribeFrame((t) => {
      if (t - lastRef.current < minGap) return;
      lastRef.current = t;
      force();
    });
  }, [hz]);
}

// Track one value derived from the world, re-rendering only when it changes.
//
// For state like run status or the current draft hand, where the UI has to react
// the instant it flips but has no reason to re-render on the frames between. The
// value is read fresh during render, so it can never be a frame stale — which
// matters on restart, where a cached 'dead' would flash the death overlay over a
// brand new run.
export function useWorldValue<T>(read: () => T): T {
  const readRef = useRef(read);
  readRef.current = read;

  const current = read();
  const seenRef = useRef(current);
  seenRef.current = current;

  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(
    () =>
      subscribeFrame(() => {
        if (readRef.current() !== seenRef.current) force();
      }),
    []
  );

  return current;
}
