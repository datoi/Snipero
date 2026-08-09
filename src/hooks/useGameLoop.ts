import { useEffect, useReducer, useRef } from 'react';
import { World } from '../engine/types';
import { updateWorld } from '../systems/update';

// Drives the simulation with requestAnimationFrame and forces a re-render each
// frame so the view repaints. `runningRef` gates simulation: when false (e.g. on
// the home menu), the world is left frozen and no re-render is forced.
export function useGameLoop(
  world: World,
  runningRef: React.MutableRefObject<boolean>
) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
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
        tick();
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [world, runningRef]);
}
