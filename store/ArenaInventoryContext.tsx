import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Locally-persisted Arena inventory: owned guns (permanent), consumable items
// (counts), and which gun is equipped. Points are still charged via
// PointsContext; this just tracks what the player owns. The equipped gun + item
// counts are sent to the server as the match loadout; the server consumes items
// live and reports usage back, which we persist via consumeItems().

const STORAGE_KEY = 'eob.arena.inventory.v2';
const LEGACY_KEY = 'eob.arena.inventory';

export interface ArenaInventory {
  guns: string[];
  items: Record<string, number>;
  equippedGun: string | null;
}

interface ArenaInventoryValue extends ArenaInventory {
  loading: boolean;
  isGunOwned: (id: string) => boolean;
  itemCount: (id: string) => number;
  owns: (id: string) => boolean;
  addGun: (id: string) => Promise<void>;
  addItem: (id: string) => Promise<void>;
  equipGun: (id: string) => Promise<void>;
  consumeItems: (used: Record<string, number>) => Promise<void>;
  reload: () => Promise<void>;
}

const ArenaInventoryContext = createContext<ArenaInventoryValue | null>(null);

const canUseSecureStore = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

const EMPTY: ArenaInventory = { guns: [], items: {}, equippedGun: null };

async function readInventory(): Promise<ArenaInventory> {
  try {
    if (!(await canUseSecureStore())) return { ...EMPTY };
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArenaInventory>;
      return {
        guns: Array.isArray(parsed.guns) ? parsed.guns.filter((x): x is string => typeof x === 'string') : [],
        items: parsed.items && typeof parsed.items === 'object' ? sanitizeCounts(parsed.items) : {},
        equippedGun: typeof parsed.equippedGun === 'string' ? parsed.equippedGun : null,
      };
    }
    // migrate from the old flat owned-id list
    const legacy = await SecureStore.getItemAsync(LEGACY_KEY);
    if (legacy) {
      const ids = JSON.parse(legacy) as unknown;
      if (Array.isArray(ids)) {
        const guns = ids.filter((x): x is string => typeof x === 'string' && x.startsWith('gun_'));
        const items: Record<string, number> = {};
        ids.filter((x): x is string => typeof x === 'string' && x.startsWith('item_')).forEach((id) => { items[id] = 1; });
        const migrated: ArenaInventory = { guns, items, equippedGun: guns[0] ?? null };
        await writeInventory(migrated);
        return migrated;
      }
    }
    return { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function sanitizeCounts(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && v > 0) out[k] = Math.floor(v);
  }
  return out;
}

async function writeInventory(inv: ArenaInventory): Promise<void> {
  try {
    if (!(await canUseSecureStore())) return;
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(inv));
  } catch {
    // best-effort
  }
}

export function ArenaInventoryProvider({ children }: { children: React.ReactNode }) {
  const [inv, setInv] = useState<ArenaInventory>(EMPTY);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((next: ArenaInventory) => {
    setInv(next);
    void writeInventory(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await readInventory();
    setInv(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isGunOwned = useCallback((id: string) => inv.guns.includes(id), [inv.guns]);
  const itemCount = useCallback((id: string) => inv.items[id] ?? 0, [inv.items]);
  const owns = useCallback((id: string) => inv.guns.includes(id) || (inv.items[id] ?? 0) > 0, [inv.guns, inv.items]);

  const addGun = useCallback(async (id: string) => {
    setInv((prev) => {
      if (prev.guns.includes(id)) return prev;
      const next = { ...prev, guns: [...prev.guns, id], equippedGun: prev.equippedGun ?? id };
      void writeInventory(next);
      return next;
    });
  }, []);

  const addItem = useCallback(async (id: string) => {
    setInv((prev) => {
      const next = { ...prev, items: { ...prev.items, [id]: (prev.items[id] ?? 0) + 1 } };
      void writeInventory(next);
      return next;
    });
  }, []);

  const equipGun = useCallback(async (id: string) => {
    setInv((prev) => {
      if (!prev.guns.includes(id)) return prev;
      const next = { ...prev, equippedGun: id };
      void writeInventory(next);
      return next;
    });
  }, []);

  const consumeItems = useCallback(async (used: Record<string, number>) => {
    if (!used || Object.keys(used).length === 0) return;
    setInv((prev) => {
      const items = { ...prev.items };
      for (const [id, n] of Object.entries(used)) {
        const left = (items[id] ?? 0) - (n ?? 0);
        if (left > 0) items[id] = left;
        else delete items[id];
      }
      const next = { ...prev, items };
      void writeInventory(next);
      return next;
    });
  }, []);

  const value = useMemo<ArenaInventoryValue>(
    () => ({
      guns: inv.guns,
      items: inv.items,
      equippedGun: inv.equippedGun,
      loading,
      isGunOwned,
      itemCount,
      owns,
      addGun,
      addItem,
      equipGun,
      consumeItems,
      reload,
    }),
    [inv, loading, isGunOwned, itemCount, owns, addGun, addItem, equipGun, consumeItems, reload],
  );

  return <ArenaInventoryContext.Provider value={value}>{children}</ArenaInventoryContext.Provider>;
}

export function useArenaInventory(): ArenaInventoryValue {
  const ctx = useContext(ArenaInventoryContext);
  if (!ctx) throw new Error('useArenaInventory must be used within ArenaInventoryProvider');
  return ctx;
}
