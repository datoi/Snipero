import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Picture, createPicture } from '@shopify/react-native-skia';

import { World } from '../engine/types';
import { useFrameTick } from '../hooks/useGameLoop';
import { drawScene } from './drawScene';

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE renderer. Requires a development build — Skia is a native module and is
// not bundled in Expo Go, so `expo start` against Expo Go will not run this.
// Use the `development` profile in eas.json.
//
// To fall back to the Expo Go renderer, change the import in App.tsx:
//   import { GameCanvas } from './src/render/GameCanvas';       // Views, Expo Go
//   import { GameCanvas } from './src/render/GameCanvasSkia';   // Skia, dev build
// The prop contract is identical and both drive their own repaint.
// ─────────────────────────────────────────────────────────────────────────────
//
// Why this exists: the View renderer rebuilds a tree of RN Views — one per
// particle, projectile, body and health bar — every frame, pushing a few
// hundred nodes through reconciliation, the shadow tree and a full Yoga layout
// pass 60x/sec, for a scene that has no layout to compute. Here the whole frame
// is recorded into one SkPicture behind a single element, so React walks one
// node per frame no matter how busy the arena gets.
export function GameCanvas({
  world,
  width,
  height,
}: {
  world: World;
  width: number;
  height: number;
}) {
  // The canvas drives its own repaint straight off the loop, so showing live
  // simulation state costs a re-render of this leaf and nothing else. The scene
  // graph underneath is a single Picture node either way.
  useFrameTick(60);

  const picture = createPicture(
    (canvas) => drawScene(canvas, world, width, height),
    { x: 0, y: 0, width, height } // explicit bounds let Skia cull off-screen ops
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
