// Catalog for the Arena armory (normal, non-reactive gameplay shop). Players buy
// guns and effect-items with their points; purchases are stored locally
// (see store/ArenaInventoryContext). Wiring these into live matches comes later.

export type ShopCategory = 'gun' | 'item';
export type ShopTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface ShopStat {
  label: string;
  /** 0–100, drives the stat bar fill. */
  value: number;
}

export interface ShopEntry {
  id: string;
  name: string;
  category: ShopCategory;
  cost: number;
  /** Short effect blurb shown on the tile and lobby loadout. */
  effect: string;
  /** Longer flavour/description shown in the detail sidebar. */
  description: string;
  /** Stat bars shown in the detail sidebar. */
  stats: ShopStat[];
  /** MaterialCommunityIcons glyph name (fallback when no image art exists). */
  icon: string;
  color: string;
  comingSoon?: boolean;
}

// Prices: min 15, mostly <= 50, max 100.
export const ARENA_GUNS: ShopEntry[] = [
  {
    id: 'gun_smg', name: 'Rapid SMG', category: 'gun', cost: 25, icon: 'pistol', color: '#FFE600',
    effect: 'Rapid fire · low damage',
    description: 'Spray-and-pray bullet hose. Shreds enemies up close with a blistering fire rate.',
    stats: [{ label: 'Damage', value: 35 }, { label: 'Fire Rate', value: 92 }, { label: 'Range', value: 45 }, { label: 'Mobility', value: 80 }],
  },
  {
    id: 'gun_scatter', name: 'Scatter Gun', category: 'gun', cost: 40, icon: 'ammunition', color: '#f97316',
    effect: 'Wide 3-pellet spread',
    description: 'Point-blank devastation. Three pellets per shot make it brutal in tight corners.',
    stats: [{ label: 'Damage', value: 75 }, { label: 'Fire Rate', value: 40 }, { label: 'Range', value: 25 }, { label: 'Mobility', value: 60 }],
  },
  {
    id: 'gun_laser', name: 'Laser Rifle', category: 'gun', cost: 60, icon: 'flash', color: '#19f0ff',
    effect: 'Fast piercing beams',
    description: 'Pinpoint energy beams that travel fast and far with almost no fall-off.',
    stats: [{ label: 'Damage', value: 55 }, { label: 'Fire Rate', value: 75 }, { label: 'Range', value: 85 }, { label: 'Mobility', value: 65 }],
  },
  {
    id: 'gun_rocket', name: 'Rocket Launcher', category: 'gun', cost: 80, icon: 'rocket-launch', color: '#ef4444',
    effect: 'Splash damage on impact',
    description: 'Lob explosive rockets that deal heavy splash damage across an area on impact.',
    stats: [{ label: 'Damage', value: 95 }, { label: 'Fire Rate', value: 25 }, { label: 'Range', value: 60 }, { label: 'Mobility', value: 40 }],
  },
  {
    id: 'gun_rail', name: 'Rail Sniper', category: 'gun', cost: 100, icon: 'crosshairs', color: '#a855f7',
    effect: 'High damage · slow rate',
    description: 'One shot, one kill. Charge a hyper-velocity slug clean across the whole arena.',
    stats: [{ label: 'Damage', value: 100 }, { label: 'Fire Rate', value: 20 }, { label: 'Range', value: 100 }, { label: 'Mobility', value: 45 }],
  },
];

export const ARENA_SHOP_ITEMS: ShopEntry[] = [
  {
    id: 'item_medkit', name: 'Med Kit', category: 'item', cost: 15, icon: 'medical-bag', color: '#22c55e',
    effect: 'Instantly heal +40 HP',
    description: 'Slap-on med patch. Instantly restores 40 HP the moment you need it most.',
    stats: [{ label: 'Healing', value: 80 }, { label: 'Instant', value: 100 }, { label: 'Charges', value: 30 }],
  },
  {
    id: 'item_speed', name: 'Adrenaline', category: 'item', cost: 20, icon: 'lightning-bolt', color: '#84cc16',
    effect: 'Speed boost for 6s',
    description: 'Adrenaline rush. Surge to +50% movement speed for 6 seconds to flank or escape.',
    stats: [{ label: 'Speed', value: 70 }, { label: 'Duration', value: 60 }, { label: 'Charges', value: 30 }],
  },
  {
    id: 'item_shield', name: 'Nano Shield', category: 'item', cost: 35, icon: 'shield', color: '#3b82f6',
    effect: 'Absorbs 50 damage',
    description: 'Nano-weave barrier that soaks up the next 50 damage before it touches your HP.',
    stats: [{ label: 'Absorb', value: 75 }, { label: 'Duration', value: 55 }, { label: 'Charges', value: 30 }],
  },
  {
    id: 'item_freeze', name: 'Cryo Grenade', category: 'item', cost: 45, icon: 'snowflake', color: '#7dd3fc',
    effect: 'Slow the enemy for 4s',
    description: 'Cryo burst that chills the enemy, cutting their movement speed for 4 seconds.',
    stats: [{ label: 'Slow', value: 70 }, { label: 'Duration', value: 60 }, { label: 'Radius', value: 50 }],
  },
  {
    id: 'item_grenade', name: 'Frag Bomb', category: 'item', cost: 50, icon: 'bomb', color: '#f59e0b',
    effect: 'Throwable area blast',
    description: 'Classic frag grenade — toss it into a fight and watch the whole area light up.',
    stats: [{ label: 'Damage', value: 80 }, { label: 'Radius', value: 65 }, { label: 'Charges', value: 30 }],
  },
];

export const ALL_SHOP_ENTRIES: ShopEntry[] = [...ARENA_GUNS, ...ARENA_SHOP_ITEMS];

export function findShopEntry(id: string): ShopEntry | null {
  return ALL_SHOP_ENTRIES.find((e) => e.id === id) ?? null;
}

// ─── Rarity tiers (derived from cost) ────────────────────────────────────────

export interface TierStyle {
  label: string;
  main: string;
  glow: string;
}

export const TIER_STYLE: Record<ShopTier, TierStyle> = {
  common: { label: 'COMMON', main: '#b8ad94', glow: '#7a715c' },
  rare: { label: 'RARE', main: '#2dd4bf', glow: '#0f9e8c' },
  epic: { label: 'EPIC', main: '#b07cff', glow: '#8b5cf6' },
  legendary: { label: 'LEGENDARY', main: '#ffb02e', glow: '#e0851a' },
};

export function tierForCost(cost: number): ShopTier {
  if (cost <= 20) return 'common';
  if (cost <= 40) return 'rare';
  if (cost <= 70) return 'epic';
  return 'legendary';
}

// ─── In-game weapon display (maps engine weapon ids to gun art / names) ──────

export const WEAPON_TO_GUN_ID: Record<string, string> = {
  smg: 'gun_smg',
  scatter: 'gun_scatter',
  laser: 'gun_laser',
  rocket: 'gun_rocket',
  rail: 'gun_rail',
};

export const WEAPON_NAME: Record<string, string> = {
  blaster: 'BLASTER',
  shotgun: 'SHOTGUN',
  rocket: 'ROCKET',
  smg: 'RAPID SMG',
  scatter: 'SCATTER GUN',
  laser: 'LASER RIFLE',
  rail: 'RAIL SNIPER',
};
