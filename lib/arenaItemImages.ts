import type { ImageSourcePropType } from 'react-native';

// ─── Arena shop art registry ─────────────────────────────────────────────────
//
// Drop transparent PNGs (1024×1024, no background) into `assets/arena/` named by
// the entry id, then UNCOMMENT the matching line below. Until then the UI falls
// back to the styled vector icons automatically — nothing breaks if a file is
// missing. See the generation prompts in the chat.
//
// Example after adding the file:
//   gun_smg: require('../assets/arena/gun_smg.png'),

export const ARENA_ITEM_IMAGES: Partial<Record<string, ImageSourcePropType>> = {
  // ── Guns ──
  gun_smg: require('../assets/arena/gun_smg.png'),
  gun_scatter: require('../assets/arena/gun_scatter.png'),
  gun_laser: require('../assets/arena/gun_laser.png'),
  gun_rocket: require('../assets/arena/gun_rocket.png'),
  gun_rail: require('../assets/arena/gun_rail.png'),
  // ── Items ──
  item_medkit: require('../assets/arena/item_medkit.png'),
  item_speed: require('../assets/arena/item_speed.png'),
  item_shield: require('../assets/arena/item_shield.png'),
  item_freeze: require('../assets/arena/item_freeze.png'),
  item_grenade: require('../assets/arena/item_grenade.png'),
};

export function getArenaItemImage(id: string): ImageSourcePropType | undefined {
  return ARENA_ITEM_IMAGES[id];
}
