import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Picture, createPicture, useImage } from '@shopify/react-native-skia';

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

  // Every sprite in the game, in one texture. Decoding is asynchronous, so this
  // is null for the first handful of frames — drawScene treats that as "no art
  // yet" and paints the flat primitives the game shipped with, which means the
  // arena is playable and readable from frame one instead of blank.
  //
  // A hook is the only way to decode an image here, and hooks belong to
  // components, which is precisely why it is loaded in this file and handed
  // down: drawScene stays a pure function of world state, and the simulation
  // stays unaware that a renderer exists at all.
  const atlas = useImage(require('../../assets/art/atlas.png'));

  const picture = createPicture(
    (canvas) => drawScene(canvas, world, width, height, atlas),
    { x: 0, y: 0, width, height } // explicit bounds let Skia cull off-screen ops
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
