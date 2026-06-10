// Client-side catalog for the 5 Vorld viewer item drops. Used purely for
// consistent UI (icon / colour / label). The authoritative game effect lives in
// the backend (`Services/ArenaItemDrops.ts`); names here mirror the Vorld
// `itemName` values so incoming drops resolve to the right visual.

export type ArenaItemKind = 'buff' | 'sabotage';

export interface ArenaItemUi {
  id: string;
  name: string;
  kind: ArenaItemKind;
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  color: string;
}

export const ARENA_ITEMS_UI: ArenaItemUi[] = [
  { id: 'rocket_drop', name: 'Rocket Drop', kind: 'buff', icon: 'rocket-launch', color: '#ff5530' },
  { id: 'nano_shield', name: 'Nano Shield', kind: 'buff', icon: 'shield', color: '#3b82f6' },
  { id: 'medkit', name: 'Medkit', kind: 'buff', icon: 'medical-bag', color: '#22c55e' },
  { id: 'cryo_freeze', name: 'Cryo Freeze', kind: 'sabotage', icon: 'snowflake', color: '#7dd3fc' },
  { id: 'emp_jam', name: 'EMP Jam', kind: 'sabotage', icon: 'flash-off', color: '#a855f7' },
];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function lookupArenaItemUi(nameOrId: string): ArenaItemUi | null {
  const target = norm(nameOrId);
  if (!target) return null;
  return (
    ARENA_ITEMS_UI.find((it) => norm(it.name) === target) ??
    ARENA_ITEMS_UI.find((it) => norm(it.id) === target) ??
    null
  );
}
