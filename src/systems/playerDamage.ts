import { CONFIG } from '../config';
import { World } from '../engine/types';
import { addFlash, addShake } from './fx';
import { haptic, sfx } from './sfx';

// The single path by which the PLAYER loses HP.
//
// The enemies got this treatment when burn ticks created a second kill site; the
// player never did, so four separate places subtracted from hp with their own
// clamp — contact, enemy shots, blasts, boss contact. Armour's damage reduction
// would have had to be copied into all four, and the fifth site added later
// would have quietly ignored it. Shields, i-frames and dodge chance all want
// this same chokepoint.
//
// Separate module from damage.ts on purpose. damage.ts owns *deaths* — loot, XP,
// and the bomber's detonation — so it imports blast.ts; blast.ts needs to hurt
// the player, so putting this in damage.ts would close an import cycle. They are
// also genuinely different jobs: nothing pays out when the player is hit.
export function damagePlayer(
  world: World,
  amount: number,
  opts: { continuous?: boolean } = {}
) {
  const p = world.player;
  if (amount <= 0 || p.hp <= 0) return;

  // Armour. Hard-capped so stacking resistance can never reach immunity.
  const resist = Math.min(CONFIG.player.maxResist, p.resist);
  let incoming = amount * (1 - resist);

  // Any hit stops the shield refilling, including a graze that the shield fully
  // absorbs — otherwise standing in a swarm that never breaks through would
  // count as "out of combat" and the pool would top up mid-fight.
  p.shieldTimer = CONFIG.abilities.shield.refillDelay;

  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, incoming);
    p.shield -= absorbed;
    incoming -= absorbed;
    if (incoming <= 0) {
      // Fully absorbed: acknowledge it without the full hit treatment, so the
      // shield reads as a buffer rather than as taking damage.
      addFlash(world, CONFIG.fx.flash.contact);
      return;
    }
  }

  p.hp -= incoming;
  if (p.hp < 0) p.hp = 0;

  // Contact damage ticks every frame, so it gets a soft sustained flash rather
  // than a punch — 60 hit-sounds a second is a buzzsaw, not feedback.
  if (opts.continuous) {
    addFlash(world, CONFIG.fx.flash.contact);
    return;
  }

  addFlash(world, CONFIG.fx.flash.playerHit);
  addShake(world, CONFIG.fx.shake.playerHit);
  sfx('playerHit');
  haptic('medium');
}

// Shield regeneration. Its own pass rather than a line inside updateStatus,
// because the timer has to keep running while the player is doing nothing at
// all — including standing in a corner deciding whether to go back in.
export function updatePlayerDefense(world: World, dt: number) {
  const p = world.player;
  if (p.shieldMax <= 0) return;

  if (p.shieldTimer > 0) {
    p.shieldTimer -= dt;
    return;
  }
  if (p.shield < p.shieldMax) {
    p.shield = Math.min(p.shieldMax, p.shield + CONFIG.abilities.shield.refillPerSec * dt);
  }
}
