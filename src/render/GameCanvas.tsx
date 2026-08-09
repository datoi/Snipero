import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Status, World } from '../engine/types';
import { CONFIG } from '../config';

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
      {/* Cover — drawn first so every actor sits on top of it */}
      {obstacles.map((o, i) => (
        <View
          key={`obs${i}`}
          style={{
            position: 'absolute',
            left: o.pos.x - o.w / 2,
            top: o.pos.y - o.h / 2,
            width: o.w,
            height: o.h,
            borderRadius: 6,
            backgroundColor: CONFIG.obstacles.color,
            borderTopWidth: 3,
            borderTopColor: CONFIG.obstacles.edgeColor,
          }}
        />
      ))}

      {/* Door at the top — grey when locked, glowing green when open */}
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
        }}
      />

      {/* Loot on the floor — under the actors so bodies always read on top.
          Each one floats on its own phase offset so a pile doesn't pulse as
          a single blob. */}
      {pickups.map((p) => {
        const bob = Math.sin(p.bob) * CONFIG.pickups.bobAmp;
        const heart = p.kind === 'heart';
        return (
          <View
            key={p.id}
            style={{
              position: 'absolute',
              left: p.pos.x - pr,
              top: p.pos.y - pr + bob,
              width: pr * 2,
              height: pr * 2,
              borderRadius: heart ? 4 : pr,
              backgroundColor: heart ? '#ef4444' : '#ffd45e',
              borderWidth: 2,
              borderColor: heart ? '#ff9d9d' : '#a87b1c',
              // Fade out over the last couple of seconds before it despawns.
              opacity: Math.min(1, p.life / 2),
              transform: heart ? [{ rotate: '45deg' }] : undefined,
            }}
          />
        );
      })}

      {/* Chest — gold and shut, dark and open once claimed */}
      {world.chest && (
        <View
          style={{
            position: 'absolute',
            left: world.chest.pos.x - world.chest.radius,
            top: world.chest.pos.y - world.chest.radius,
            width: world.chest.radius * 2,
            height: world.chest.radius * 2,
            borderRadius: 6,
            backgroundColor: world.chest.opened ? '#4a3a1a' : '#e0a92c',
            borderWidth: 3,
            borderColor: world.chest.opened ? '#6b5426' : '#fff0b8',
          }}
        />
      )}

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
                world.boss.hitFlash > 0 ? '#ffffff' : CONFIG.boss.phases[world.boss.phase].color,
              borderWidth: statusTint(world.boss.status) ? 4 : 0,
              borderColor: statusTint(world.boss.status) ?? undefined,
            }}
          />
        </>
      )}

      {enemies.map((e) => {
        const tint = statusTint(e.status);
        return (
        <React.Fragment key={e.id}>
          {/* charger telegraph: white ring while winding up */}
          {e.kind === 'charger' && e.state === 'windup' && (
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
              backgroundColor: e.hitFlash > 0 ? '#ffffff' : e.color,
              borderRadius: e.kind === 'shooter' ? e.radius : 4,
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
            backgroundColor: '#ffb020',
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

      {/* player */}
      <View
        style={{
          position: 'absolute',
          left: player.pos.x - player.radius,
          top: player.pos.y - player.radius,
          width: player.radius * 2,
          height: player.radius * 2,
          borderRadius: player.radius,
          backgroundColor: '#3ecf5f',
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
