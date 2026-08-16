import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Status, World } from '../engine/types';
import { useFrameTick } from '../hooks/useGameLoop';
import { shrineColor } from '../systems/shrine';
import { CONFIG } from '../config';
import {
  FLOOR, WALL, angleOf, charSize, charSprite, decorSprite, foeSprite, bossSprite,
} from './sprites';
import { EDGE_FALLOFF, FLOOR_BACKSTOP, floorFor, themeFor } from './theme';
import { backdropFor, backdropLayout, backdropScroll, backdropSource } from './backdrop';
import { BodyAnim, bodyAnim } from './anim';

// Outline color for a body carrying a debuff — burn reads over slow, since it's
// the one actively killing. Returns null when the body is clean.
function statusTint(s: Status): string | null {
  if (s.burnTime > 0) return '#ff7a3c';
  if (s.slowTime > 0) return '#7dd3fc';
  return null;
}

// One body, turned to face where it's going.
//
// `flash` paints the whole silhouette a flat colour, which is the one thing
// React Native's tintColor is good at and exactly what a hit needs — the body
// blows out to white for a few frames and the shape stays readable underneath.
function Body({
  source, anim, size, flash,
}: {
  source: React.ComponentProps<typeof Image>['source'];
  anim: BodyAnim;
  size: number;
  flash?: string;
}) {
  return (
    <Image
      source={source}
      style={{
        position: 'absolute',
        left: anim.x - size / 2,
        top: anim.y - size / 2,
        width: size,
        height: size,
        transform: [{ rotate: `${anim.rotate}deg` }, { scale: anim.scale }],
        tintColor: flash,
      }}
    />
  );
}

// Soft contact shadow. Squashed vertically because the camera looks down at an
// angle, and offset the same way every other shadow is — one light direction for
// the whole scene, or it stops reading as a single space.
function Shadow({ x, y, radius, drop }: { x: number; y: number; radius: number; drop: number }) {
  const r = radius * CONFIG.obstacles.bodyShadow;
  return (
    <View
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r * 0.5 + drop,
        width: r * 2,
        height: r,
        borderRadius: r,
        backgroundColor: CONFIG.obstacles.shadowColor,
        opacity: 0.45,
      }}
    />
  );
}

// A ring drawn flat on the ground under a body. Carries everything that used to
// be a border on the body itself: who the player is, what a body is suffering
// from, and what is about to happen. A border can't do that job any more —
// sprites have their own outlines, and stacking a second one on top just makes
// the silhouette muddy.
function Ring({
  x, y, radius, color, width = 3, opacity = 1,
}: {
  x: number; y: number; radius: number; color: string; width?: number; opacity?: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        borderWidth: width,
        borderColor: color,
        opacity,
      }}
    />
  );
}

// Renders the world with plain React Native Views and Images (no Skia / native
// modules) so it runs in any Expo Go.
//
// A Skia renderer with the same prop contract lives in GameCanvasSkia.tsx — it
// draws the whole frame into one canvas instead of a few hundred Views, but
// needs a development build. Both draw the same scene from the same sprites;
// the difference is that Skia reads them out of one packed atlas while this one
// takes a file per sprite, since <Image> cannot slice. sprites.ts resolves both
// from a single lookup so the two can never disagree about what a hero wears.
export function GameCanvas({ world }: { world: World; width: number; height: number }) {
  // Same contract as the Skia renderer: the canvas asks the loop for its own
  // repaint rather than riding a re-render of the whole app.
  useFrameTick(60);

  const {
    player, enemies, projectiles, enemyProjectiles, door, obstacles, decor, pickups, fx,
  } = world;
  const pr = CONFIG.pickups.radius;
  const oc = CONFIG.obstacles;

  const theme = themeFor(world.chapter);
  const floor = FLOOR[floorFor(theme, world.roomType)];

  // The painted ground, and where its copies sit this frame. Derived from
  // world.time rather than a timer of this component's own, so the ground
  // freezes with the rest of the game behind a pause overlay.
  const backdropId = backdropFor(world.chapter);
  const backdropRects = backdropId
    ? backdropLayout(backdropId, world.bounds.w, world.bounds.h, backdropScroll(world.time))
    : [];

  // Which hands the hero is drawing with. The equipped weapon sets the pose at
  // run start; the reload is the one moment it changes mid-fight, and showing it
  // is what turns the Repeater's long gap from "why did I stop shooting" into a
  // thing the hero is visibly doing.
  const reloading =
    player.pattern === 'burst' && player.burstLeft === 0 && player.cooldown > 0.25;
  const heroSprite = charSprite(player.set, reloading ? 'reload' : player.pose);
  const heroSize = charSize(player.radius);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {/* Camera layer — screen shake translates the whole world, so the red
        damage flash below stays pinned to the screen and never shows an edge. */}
    <View
      style={[
        StyleSheet.absoluteFill,
        { transform: [{ translateX: fx.shakeX }, { translateY: fx.shakeY }] },
      ]}
    >
      {/* Floor — the chapter's ground, and the lowest layer the arena draws.
          Deliberately NOT `overflow: hidden`. The backdrop is drawn larger than
          the arena so a screen shake cannot pull an edge into view, and this
          wrapper is inside the shake transform: clipping here would move the
          crop along with the camera and throw away exactly the overscan that
          margin exists to provide. Nothing needs the clip — the arena is the
          size of the screen, so the overflow lands off-surface, and the HUD is
          a later sibling that paints over this regardless. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: FLOOR_BACKSTOP }]}>
        {backdropId ? (
          // Painted ground. One rect when static, several when scrolling —
          // see backdropLayout, which both renderers share so they cannot
          // disagree about where the ground is.
          backdropRects.map((r, i) => (
            <Image
              key={i}
              source={backdropSource(backdropId)}
              // Every rect is already computed at the image's own aspect, so
              // stretching to it is exact. `cover` would re-fit inside the
              // rect and quietly undo the layout.
              resizeMode="stretch"
              style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h }}
            />
          ))
        ) : (
          // Explicit size, not absoluteFill. On iOS `resizeMode="repeat"` only
          // tiles across dimensions it actually knows: given absolute insets
          // alone it drew a single tile in the corner and left the rest of the
          // arena black.
          <Image
            source={floor}
            resizeMode="repeat"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: world.bounds.w,
              height: world.bounds.h,
            }}
          />
        )}
        {/* Knock the ground back so it stays quieter than anything moving on
            it. See ArenaTheme.floorDim and CONFIG.background.dim. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#000000',
              opacity: backdropId ? CONFIG.background.dim : theme.floorDim,
            },
          ]}
        />
      </View>

      {/* Light falling off at the walls the camera cannot show. Four stacked
          bands per edge rather than a gradient, because a gradient needs a
          native dependency and five flat steps are indistinguishable from one
          at this size. See EDGE_FALLOFF. */}
      {Array.from({ length: EDGE_FALLOFF.bands }, (_, i) => {
        const b = EDGE_FALLOFF.start + i * EDGE_FALLOFF.step;
        const opacity = EDGE_FALLOFF.alpha - i * EDGE_FALLOFF.fade;
        if (opacity <= 0) return null;
        const { w, h } = world.bounds;
        const edge = { position: 'absolute' as const, backgroundColor: '#000000', opacity };
        return (
          <React.Fragment key={`edge${i}`}>
            <View style={[edge, { left: 0, top: 0, width: w, height: b }]} />
            <View style={[edge, { left: 0, top: h - b, width: w, height: b }]} />
            <View style={[edge, { left: 0, top: 0, width: b, height: h }]} />
            <View style={[edge, { left: w - b, top: 0, width: b, height: h }]} />
          </React.Fragment>
        );
      })}

      {/* Litter — oil, glass, leaves. Under everything, including cover: it is
          texture on the ground, and anything that reads as an object down here
          reads as an object the player should be able to walk around. */}
      {decor.map((d, i) => {
        if (!d.flat) return null;
        const src = decorSprite(d.id);
        if (!src) return null;
        return (
          <Image
            key={`flat${i}`}
            source={src}
            style={{
              position: 'absolute',
              left: d.pos.x - d.size / 2,
              top: d.pos.y - d.size / 2,
              width: d.size,
              height: d.size,
              opacity: 0.38,
              transform: [{ rotate: `${d.rot}deg` }],
            }}
          />
        );
      })}

      {/* Cover — drawn first so every actor sits on top of it.
          Three layers give it height: a shadow it casts on the floor, the face
          itself, and a lit top edge. Flat rectangles read as holes in the floor;
          these read as things standing on it. */}
      {obstacles.map((o, i) => {
        const left = o.pos.x - o.w / 2;
        const top = o.pos.y - o.h / 2;
        return (
          <React.Fragment key={`obs${i}`}>
            {/* Cast shadow on the floor, offset down-right from a light that is
                always up-left. One light direction for everything, or the scene
                stops reading as a single space. */}
            <View
              style={{
                position: 'absolute',
                left: left + 2,
                top: top + 4,
                width: o.w,
                height: o.h,
                borderRadius: 6,
                backgroundColor: oc.shadowColor,
                opacity: 0.5,
              }}
            />
            {/* Side face: the full footprint. Only its bottom `blockHeight` px
                end up visible once the top face is drawn over it. */}
            <View
              style={{
                position: 'absolute',
                left,
                top,
                width: o.w,
                height: o.h,
                borderRadius: 6,
                backgroundColor: theme.cover.side,
              }}
            />
            {/* Top face, lifted. This is the surface the camera looks down at,
                and it is made of the room's own wall — which is what stops a
                piece of cover reading as furniture dropped on the floor.
                Bands run the LONG way: a wide block gets horizontal banding and
                a tall one vertical, so a low wall reads as a length of wall
                rather than as a stack of panels lying on its side. */}
            <View
              style={{
                position: 'absolute',
                left,
                top: top - oc.blockHeight,
                width: o.w,
                height: o.h,
                borderRadius: 6,
                overflow: 'hidden',
                backgroundColor: theme.cover.side,
                borderTopWidth: 2,
                borderTopColor: theme.cover.edge,
              }}
            >
              {/* Explicit size for the same reason the floor needs it —
                  `repeat` tiles only across dimensions it actually knows, and
                  with absolute insets alone it fills part of the block and
                  leaves the rest bare. */}
              <Image
                source={WALL[theme.cover.material][o.w >= o.h ? 'along' : 'across']}
                resizeMode="repeat"
                style={{ position: 'absolute', left: 0, top: 0, width: o.w, height: o.h }}
              />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: '#000000', opacity: theme.cover.dim },
                ]}
              />
            </View>
          </React.Fragment>
        );
      })}

      {/* Whatever is stacked on the cover — crates, boulders, shipping boxes.
          The block underneath keeps the silhouette you aim around; this is only
          what it is made of. */}
      {decor.map((d, i) => {
        if (d.flat) return null;
        const src = decorSprite(d.id);
        if (!src) return null;
        return (
          <Image
            key={`prop${i}`}
            source={src}
            style={{
              position: 'absolute',
              left: d.pos.x - d.size / 2,
              top: d.pos.y - d.size / 2,
              width: d.size,
              height: d.size,
              transform: [{ rotate: `${d.rot}deg` }],
            }}
          />
        );
      })}

      {/* Door at the top — grey when locked, glowing green when open.
          Frame posts give it a silhouette no HUD element has; a plain filled
          bar read as a status meter when it sat near the HP readout. */}
      {[-8, door.width].map((offset) => (
        <View
          key={`post${offset}`}
          style={{
            position: 'absolute',
            left: door.pos.x - door.width / 2 + offset,
            top: door.pos.y - door.height / 2 - 6,
            width: 8,
            height: door.height + 12,
            borderRadius: 3,
            backgroundColor: '#2a2f3a',
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: door.pos.x - door.width / 2,
          top: door.pos.y - door.height / 2,
          width: door.width,
          height: door.height,
          borderRadius: 6,
          backgroundColor: door.open ? '#3ecf5f' : '#3a3f4a',
          borderWidth: door.open ? 3 : 0,
          borderColor: '#b6ffcf',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {door.open && <Text style={{ color: '#eafff1', fontSize: 16, fontWeight: '900' }}>↑</Text>}
      </View>

      {/* Loot on the floor — under the actors so bodies always read on top.
          Each one floats on its own phase offset so a pile doesn't pulse as
          a single blob. */}
      {pickups.map((p) => {
        const bob = Math.sin(p.bob) * CONFIG.pickups.bobAmp;
        const heart = p.kind === 'heart';
        const gear = p.kind === 'gear';
        // Equipment is bigger and rimmed white — the only pickup that isn't a
        // resource, so it has to read as "go and get that" across the arena.
        const r = gear ? pr * 1.5 : pr;
        return (
          <View
            key={p.id}
            style={{
              position: 'absolute',
              left: p.pos.x - r,
              top: p.pos.y - r + bob,
              width: r * 2,
              height: r * 2,
              borderRadius: gear ? 5 : heart ? 4 : r,
              backgroundColor: gear ? '#8b5cf6' : heart ? '#ef4444' : '#ffd45e',
              borderWidth: gear ? 3 : 2,
              borderColor: gear ? '#ffe9a8' : heart ? '#ff9d9d' : '#a87b1c',
              // Fade out over the last couple of seconds before it despawns.
              // Gear never despawns, so its life is Infinity and this is 1.
              opacity: Math.min(1, p.life / 2),
              transform: heart || gear ? [{ rotate: '45deg' }] : undefined,
            }}
          />
        );
      })}

      {/* Shrines — three offers, one pick. The losers fade rather than vanish. */}
      {world.shrines.map((s) => {
        const affordable = s.goldCost <= world.runGold;
        return (
          <View
            key={s.id}
            style={{
              position: 'absolute',
              left: s.pos.x - s.radius,
              top: s.pos.y - s.radius,
              width: s.radius * 2,
              height: s.radius * 2,
              borderRadius: 6,
              backgroundColor: s.claimed ? '#4a3a1a' : shrineColor(s.kind),
              borderWidth: 3,
              borderColor: s.claimed ? '#6b5426' : '#ffffff',
              opacity: (s.dissolving ? 0.22 : 1) * (affordable ? 1 : 0.45),
            }}
          />
        );
      })}

      {/* Boss */}
      {world.boss && world.boss.alive && (() => {
        const b = world.boss;
        const tint = statusTint(b.status);
        return (
          <React.Fragment>
            <Shadow x={b.pos.x} y={b.pos.y} radius={b.radius} drop={8} />
            {tint && <Ring x={b.pos.x} y={b.pos.y} radius={b.radius + 3} color={tint} width={4} />}
            {/* telegraph ring while winding up an attack */}
            {b.state === 'windup' && (
              <Ring x={b.pos.x} y={b.pos.y} radius={b.radius + 10} color="#ffffff" width={4} />
            )}
            {/* The sprite is baked once per phase, so the colour that says "this
                fight just got faster" survives without flattening the body. */}
            <Body
              source={bossSprite(b.variant, b.phase)}
              anim={bodyAnim(b.pos, b.facing, b.gait, b.recoil, b.hitFlash, b.radius)}
              size={charSize(b.radius, 1.05)}
              flash={b.hitFlash > 0 ? '#ffffff' : undefined}
            />
          </React.Fragment>
        );
      })()}

      {/* blast telegraphs — under the actors so bodies stay readable on top */}
      {world.blasts.map((b) => {
        const t = 1 - Math.max(0, b.fuse / b.maxFuse);
        return (
          <View
            key={`blast${b.id}`}
            style={{
              position: 'absolute',
              left: b.pos.x - b.radius,
              top: b.pos.y - b.radius,
              width: b.radius * 2,
              height: b.radius * 2,
              borderRadius: b.radius,
              backgroundColor: CONFIG.blast.color,
              opacity: 0.13 + 0.3 * t,
              borderWidth: 2 + 3 * t,
              borderColor: '#ffd7b0',
            }}
          />
        );
      })}

      {enemies.map((e) => {
        const tint = statusTint(e.status);
        // A lit bomber flashes so the thing about to explode is the loudest
        // object on screen.
        const lit = e.kind === 'bomber' && e.state === 'windup' &&
          Math.floor(e.stateTimer * 12) % 2 === 0;
        return (
        <React.Fragment key={e.id}>
          <Shadow x={e.pos.x} y={e.pos.y} radius={e.radius} drop={5} />
          {tint && <Ring x={e.pos.x} y={e.pos.y} radius={e.radius + 2} color={tint} />}
          {/* charger / bomber telegraph: white ring while winding up */}
          {(e.kind === 'charger' || e.kind === 'bomber') && e.state === 'windup' && (
            <Ring x={e.pos.x} y={e.pos.y} radius={e.radius + 6} color="#ffffff" />
          )}
          <Body
            source={foeSprite(e.kind)}
            anim={bodyAnim(e.pos, e.facing, e.gait, e.recoil, e.hitFlash, e.radius)}
            size={charSize(e.radius)}
            flash={e.hitFlash > 0 ? '#ffffff' : lit ? CONFIG.blast.color : undefined}
          />
          {/* health bar — deliberately outside Body, so it stays level while the
              thing it belongs to turns */}
          <View
            style={{
              position: 'absolute',
              left: e.pos.x - e.radius,
              top: e.pos.y - e.radius - 11,
              width: e.radius * 2,
              height: 4,
              backgroundColor: '#000000',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: e.pos.x - e.radius,
              top: e.pos.y - e.radius - 11,
              width: e.radius * 2 * Math.max(0, e.hp / e.maxHp),
              height: 4,
              backgroundColor: '#3ecf5f',
            }}
          />
        </React.Fragment>
        );
      })}

      {/* enemy shots (crimson) */}
      {enemyProjectiles.map((p) => (
        <View
          key={p.id}
          style={{
            position: 'absolute',
            left: p.pos.x - p.radius,
            top: p.pos.y - p.radius,
            width: p.radius * 2,
            height: p.radius * 2,
            borderRadius: p.radius,
            // Crimson core with a pale rim — the inverse of a coin's gold body
            // and dark rim, so incoming fire and loot never read the same.
            backgroundColor: CONFIG.enemyProjectile.color,
            borderWidth: 2,
            borderColor: CONFIG.enemyProjectile.rimColor,
          }}
        />
      ))}

      {/* Player shots. Stretched along their own velocity rather than drawn as
          dots: a round shot at 560px/sec is four unrelated circles in four
          frames, and a streak is one thing travelling. The elongation is the
          only motion cue a projectile gets. */}
      {projectiles.map((p) => {
        const len = p.radius * 2 * CONFIG.fx.tracerStretch;
        return (
          <View
            key={p.id}
            style={{
              position: 'absolute',
              left: p.pos.x - len / 2,
              top: p.pos.y - p.radius,
              width: len,
              height: p.radius * 2,
              borderRadius: p.radius,
              backgroundColor: '#ffffff',
              transform: [{ rotate: `${angleOf(p.vel)}deg` }],
            }}
          />
        );
      })}

      {/* Player.
          A pool of shadow with a bright ring around it, drawn flat on the
          ground. This is what says "that's me", and it has to work on grass,
          on rust-orange brick and on pale concrete — which is exactly why it is
          NOT tinted with the hero's colour. Rook is olive and the Undergrowth is
          green: an accent-coloured marker camouflaged the one body on screen the
          player cannot afford to lose. Darkening the floor under the hero works
          on every floor in the game, because the sprite is always lighter than
          the hole it is standing in. */}
      <View
        style={{
          position: 'absolute',
          left: player.pos.x - player.radius - 5,
          top: player.pos.y - player.radius - 5,
          width: (player.radius + 5) * 2,
          height: (player.radius + 5) * 2,
          borderRadius: player.radius + 5,
          backgroundColor: CONFIG.obstacles.shadowColor,
          opacity: 0.38,
        }}
      />
      <Ring
        x={player.pos.x}
        y={player.pos.y}
        radius={player.radius + 5}
        color={CONFIG.player.rimColor}
        width={3}
      />
      {/* Shield reads as a second ring outside it, thinning as it is spent, so
          the buffer is visible without another bar competing with the HUD. */}
      {player.shieldMax > 0 && player.shield > 0 && (
        <Ring
          x={player.pos.x}
          y={player.pos.y}
          radius={player.radius + 10}
          color="#60a5fa"
          width={2 + 3 * (player.shield / player.shieldMax)}
          opacity={0.85}
        />
      )}
      <Shadow x={player.pos.x} y={player.pos.y} radius={player.radius} drop={6} />
      <Body
        source={heroSprite}
        anim={bodyAnim(player.pos, player.facing, player.gait, player.recoil, 0, player.radius)}
        size={heroSize}
      />

      {/* Flourishes — muzzle blooms, impact rings, and bodies falling over.
          Drawn after the cast so a flash sits in front of the gun that made it
          and a corpse tumbles over the floor rather than under it. */}
      {fx.pops.map((q) => {
        const t = q.life / q.maxLife; // 1 at spawn, 0 at death

        if (q.kind === 'corpse') {
          const src = foeSprite(q.sprite ?? '');
          // Shrinks as it fades, so a body reads as sinking out of the room
          // rather than as a sprite someone turned the opacity down on.
          const size = charSize(q.size) * (1 - CONFIG.fx.corpse.sink * (1 - t));
          return (
            <Image
              key={`pop${q.id}`}
              source={src}
              style={{
                position: 'absolute',
                left: q.pos.x - size / 2,
                top: q.pos.y - size / 2,
                width: size,
                height: size,
                opacity: t,
                transform: [{ rotate: `${q.rot}deg` }],
              }}
            />
          );
        }

        if (q.kind === 'ring') {
          // Expands as it fades. Reads as the impact travelling outward, which
          // is the one thing a static hit spark cannot say.
          const r = q.size * (0.35 + 0.65 * (1 - t));
          return (
            <View
              key={`pop${q.id}`}
              style={{
                position: 'absolute',
                left: q.pos.x - r,
                top: q.pos.y - r,
                width: r * 2,
                height: r * 2,
                borderRadius: r,
                borderWidth: 2,
                borderColor: q.color,
                opacity: t * 0.9,
              }}
            />
          );
        }

        // flash: a bloom at the barrel, stretched along the shot and gone in
        // three frames. Longer than that and a high fire rate becomes a strobe.
        const w = q.size * (0.5 + 0.5 * t);
        const h = q.size * 0.5 * t;
        return (
          <View
            key={`pop${q.id}`}
            style={{
              position: 'absolute',
              left: q.pos.x - w / 2,
              top: q.pos.y - h / 2,
              width: w,
              height: h,
              borderRadius: h / 2,
              backgroundColor: q.color,
              opacity: t,
              transform: [{ rotate: `${q.rot}deg` }],
            }}
          />
        );
      })}

      {/* Particles — sparks, stone chips, death bursts. Fade out over their life. */}
      {fx.particles.map((p) => (
        <View
          key={p.id}
          style={{
            position: 'absolute',
            left: p.pos.x - p.size / 2,
            top: p.pos.y - p.size / 2,
            width: p.size,
            height: p.size,
            borderRadius: p.round ? p.size / 2 : 1,
            backgroundColor: p.color,
            opacity: p.life / p.maxLife,
          }}
        />
      ))}

      {/* Floating damage numbers */}
      {fx.numbers.map((n) => (
        <Text
          key={n.id}
          style={{
            position: 'absolute',
            left: n.pos.x - 40,
            top: n.pos.y - n.size,
            width: 80,
            textAlign: 'center',
            fontSize: n.size,
            fontWeight: '800',
            color: n.color,
            opacity: Math.min(1, (n.life / n.maxLife) * 1.8), // hold, then fade late
            // A dark rim keeps the number legible over any body color.
            textShadowColor: 'rgba(0,0,0,0.85)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
          }}
        >
          {n.amount}
        </Text>
      ))}
    </View>

    {/* Damage flash — outside the camera layer so it can't be shaken off-screen */}
    {fx.flash > 0 && (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#ff2d2d', opacity: fx.flash }]} />
    )}
    </View>
  );
}
