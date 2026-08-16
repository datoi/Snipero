import type { ImageSourcePropType } from 'react-native';

// Where art gets plugged in.
//
// Every visual the arena draws goes through here, so swapping a tileset is a
// change to this file and nothing else. Until textures exist, each field is
// undefined and the renderers fall back to the flat shapes the game shipped
// with — which means art can arrive one piece at a time instead of as a big
// bang, and a missing file degrades to "looks plain" rather than "crashes".
//
// ── Adding art ────────────────────────────────────────────────────────────
// 1. Drop the images somewhere under assets/, e.g. assets/art/floor.png
// 2. Uncomment the matching line below and point it at the file.
// 3. That's it. `require` paths are resolved by Metro at bundle time, so they
//    must be literal strings — you cannot build one from a variable.
//
// Textures are TILED, not stretched. Cover is authored at arbitrary sizes, so a
// single sprite scaled to fit would show different pixel density on a tall thin
// pillar than on a wide low block. A repeating tile looks consistent at any
// size, which is why tile size matters more than image size when picking a pack.

export interface ArenaTheme {
  /** Repeating floor texture for the whole arena. */
  floor?: ImageSourcePropType;
  /** Repeating texture for cover. Wants to read as solid at a glance. */
  obstacle?: ImageSourcePropType;

  /**
   * How much black to lay over each texture, 0..1.
   *
   * Asset packs are authored bright, for games with bright UI. This one is dark,
   * and the arena has to stay quieter than the things moving on it — a floor
   * that competes with a projectile for attention is a floor that gets someone
   * killed. Dimming beats recolouring the source art: it keeps the texture's
   * detail and lets one tileset suit any palette.
   */
  floorDim: number;
  obstacleDim: number;

  /** Flat colours used when the matching texture is absent. */
  floorColor: string;
  /** Slightly lifted panel so the play area reads as a room, not a void. */
  floorPanelColor: string;
  /** Frame around the arena — gives the space an edge to be inside of. */
  wallColor: string;
}

// Kenney "Top-down Shooter" (CC0). Only the tiles actually used are committed,
// under assets/art/; the raw 600-file pack is gitignored and re-downloadable
// from https://kenney.nl/assets.
//   floor-stone.png = tile_272, a stone panel that tiles into a flagstone floor
//   crate.png       = tile_129, a crate lid that tiles into stacked cover
export const THEME: ArenaTheme = {
  floor: require('../../assets/art/floor-stone.png'),
  obstacle: require('../../assets/art/crate.png'),

  floorDim: 0.72,
  obstacleDim: 0.4,

  floorColor: '#15171c',
  floorPanelColor: '#191d25',
  wallColor: '#0e1015',
};

/** How many pixels one repeat of a texture covers. Most 2D packs ship 16/32/64. */
export const TILE_SIZE = 64;
