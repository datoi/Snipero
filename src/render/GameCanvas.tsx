import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Status, World } from '../engine/types';
import { useFrameTick } from '../hooks/useGameLoop';
import { bossPhases } from '../systems/boss';
import { shrineColor } from '../systems/shrine';
import { CONFIG } from '../config';
import { THEME } from './theme';

// Outline color for a body carrying a debuff — burn reads over slow, since it's
// the one actively killing. Returns null when the body is clean.
function statusTint(s: Status): string | null {
  if (s.burnTime > 0) return '#ff7a3c';
  if (s.slowTime > 0) return '#7dd3fc';
  return null;
}

// Renders the world with plain React Native Views (no Skia / native modules) so
// it runs in any Expo Go. Placeholder primitives:
//   green circle = hero, colored squares = enemies (red chaser / orange shooter
//   / purple charger), white dots = your shots, orange dots = enemy shots.
//
// A Skia renderer with the same prop contract lives in GameCanvasSkia.tsx — it
// draws the whole frame in one canvas instead of a few hundred Views, but needs
// a development build. Swap the import in App.tsx to use it.
export function GameCanvas({ world }: { world: World; width: number; height: number }) {
  // Same contract as the Skia renderer: the canvas asks the loop for its own
  // repaint rather than riding a re-render of the whole app.
  useFrameTick(60);

  const { player, enemies, projectiles, enemyProjectiles, door, obstacles, pickups, fx } = world;
  const pr = CONFIG.pickups.radius;

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
      {/* Floor. A tiled texture when the theme has one, otherwise a panel a
          shade lighter than the frame — enough for the arena to read as a room
          you are standing in rather than an unbounded void. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: THEME.floorPanelColor },
        ]}
      >
        {THEME.floor && (
          <>
            <Image
              source={THEME.floor}
              resizeMode="repeat"
              style={StyleSheet.absoluteFill}
            />
            {/* Knock the tileset back so the floor stays quieter than anything
                moving on it. See ArenaTheme.floorDim. */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: '#000000', opacity: THEME.floorDim },
              ]}
            />
          </>
        )}
      </View>

      {/* Cover — drawn first so every actor sits on top of it.
          Three layers give it height: a shadow it casts on the floor, the face
          itself, and a lit top edge. Flat rectangles read as holes in the floor;
          these read as things standing on it. */}
      {obstacles.map((o, i) => {
        const oc = CONFIG.obstacles;
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
                left: left + 4,
                top: top + 7,
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
                backgroundColor: oc.color,
              }}
            />
            {/* Top face, lifted. This is the surface the camera looks down at. */}
            <View
              style={{
                position: 'absolute',
                left,
                top: top - oc.blockHeight,
                width: o.w,
                height: o.h,
                borderRadius: 6,
                overflow: 'hidden',
                backgroundColor: oc.topColor,
                borderTopWidth: 2,
                borderTopColor: oc.edgeColor,
              }}
            >
              {THEME.obstacle && (
                <>
                  <Image
                    source={THEME.obstacle}
                    resizeMode="repeat"
                    style={StyleSheet.absoluteFill}
                  />
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: '#000000', opacity: THEME.obstacleDim },
                    ]}
                  />
                </>
              )}
            </View>
          </React.Fragment>
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
      {world.boss && world.boss.alive && (
        <>
          {/* telegraph ring while winding up an attack */}
          {world.boss.state === 'windup' && (
            <View
              style={{
                position: 'absolute',
                left: world.boss.pos.x - world.boss.radius - 10,
                top: world.boss.pos.y - world.boss.radius - 10,
                width: (world.boss.radius + 10) * 2,
                height: (world.boss.radius + 10) * 2,
                borderRadius: world.boss.radius + 10,
                borderWidth: 4,
                borderColor: '#ffffff',
              }}
            />
          )}
          <View
            style={{
              position: 'absolute',
              left: world.boss.pos.x - world.boss.radius,
              top: world.boss.pos.y - world.boss.radius,
              width: world.boss.radius * 2,
              height: world.boss.radius * 2,
              borderRadius: 10,
              // Blown out to white for a few frames after every hit.
              backgroundColor:
                world.boss.hitFlash > 0 ? '#ffffff' : bossPhases(world.boss)[world.boss.phase].color,
              borderWidth: statusTint(world.boss.status) ? 4 : 0,
              borderColor: statusTint(world.boss.status) ?? undefined,
            }}
          />
        </>
      )}

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
          {/* Contact shadow. Squashed vertically because the camera looks down
              at an angle, and offset the same way every other shadow is. */}
          <View
            style={{
              position: 'absolute',
              left: e.pos.x - e.radius * CONFIG.obstacles.bodyShadow,
              top: e.pos.y - e.radius * CONFIG.obstacles.bodyShadow * 0.5 + 5,
              width: e.radius * 2 * CONFIG.obstacles.bodyShadow,
              height: e.radius * CONFIG.obstacles.bodyShadow,
              borderRadius: e.radius,
              backgroundColor: CONFIG.obstacles.shadowColor,
              opacity: 0.45,
            }}
          />
          {/* charger / bomber telegraph: white ring while winding up */}
          {(e.kind === 'charger' || e.kind === 'bomber') && e.state === 'windup' && (
            <View
              style={{
                position: 'absolute',
                left: e.pos.x - e.radius - 6,
                top: e.pos.y - e.radius - 6,
                width: (e.radius + 6) * 2,
                height: (e.radius + 6) * 2,
                borderRadius: e.radius + 6,
                borderWidth: 3,
                borderColor: '#ffffff',
              }}
            />
          )}
          {/* body */}
          <View
            style={{
              position: 'absolute',
              left: e.pos.x - e.radius,
              top: e.pos.y - e.radius,
              width: e.radius * 2,
              height: e.radius * 2,
              backgroundColor: e.hitFlash > 0 ? '#ffffff' : lit ? CONFIG.blast.color : e.color,
              borderRadius: e.kind === 'shooter' || e.kind === 'bomber' ? e.radius : 4,
              borderWidth: tint ? 3 : 0,
              borderColor: tint ?? undefined,
            }}
          />
          {/* health bar */}
          <View
            style={{
              position: 'absolute',
              left: e.pos.x - e.radius,
              top: e.pos.y - e.radius - 9,
              width: e.radius * 2,
              height: 4,
              backgroundColor: '#000000',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: e.pos.x - e.radius,
              top: e.pos.y - e.radius - 9,
              width: e.radius * 2 * Math.max(0, e.hp / e.maxHp),
              height: 4,
              backgroundColor: '#3ecf5f',
            }}
          />
        </React.Fragment>
        );
      })}

      {/* enemy shots (orange) */}
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

      {/* player shots (white) */}
      {projectiles.map((p) => (
        <View
          key={p.id}
          style={{
            position: 'absolute',
            left: p.pos.x - p.radius,
            top: p.pos.y - p.radius,
            width: p.radius * 2,
            height: p.radius * 2,
            borderRadius: p.radius,
            backgroundColor: '#ffffff',
          }}
        />
      ))}

      {/* player — contact shadow first, same light direction as everything else */}
      <View
        style={{
          position: 'absolute',
          left: player.pos.x - player.radius * CONFIG.obstacles.bodyShadow,
          top: player.pos.y - player.radius * CONFIG.obstacles.bodyShadow * 0.5 + 6,
          width: player.radius * 2 * CONFIG.obstacles.bodyShadow,
          height: player.radius * CONFIG.obstacles.bodyShadow,
          borderRadius: player.radius,
          backgroundColor: CONFIG.obstacles.shadowColor,
          opacity: 0.5,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: player.pos.x - player.radius,
          top: player.pos.y - player.radius,
          width: player.radius * 2,
          height: player.radius * 2,
          borderRadius: player.radius,
          // Hero colour with a constant white rim: heroes span the same hues as
          // the enemies, so the rim is what says "that's me", not the colour.
          backgroundColor: player.color,
          borderWidth: 2.5,
          borderColor: CONFIG.player.rimColor,
        }}
      />
      {/* facing dot */}
      <View
        style={{
          position: 'absolute',
          left: player.pos.x + player.facing.x * player.radius - 4,
          top: player.pos.y + player.facing.y * player.radius - 4,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#0b3d1e',
        }}
      />

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
