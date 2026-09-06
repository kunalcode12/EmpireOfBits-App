// ─── Txtr — persistent profile ───────────────────────────────────────────────
// The web build kept this in localStorage; here it lives in expo-secure-store
// under its own namespaced key, written best-effort exactly like
// store/ArenaInventoryContext.tsx. Everything degrades to an in-memory profile
// if the store is unavailable.

import * as SecureStore from 'expo-secure-store';

import { LEADERBOARD_LIMIT, STORE_KEY } from './constants';
import {
  ACHIEVEMENTS,
  CARS,
  DIFFICULTIES,
  type Achievement,
  type DifficultyId,
} from './content';
import { todayStr } from './rng';
import type { RunSummary, World } from './engine';

/** Compact on purpose — SecureStore on Android is unhappy with large values. */
export interface LeaderEntry {
  /** score */ s: number;
  /** difficulty id */ m: DifficultyId;
  /** daily flag */ d: 0 | 1;
  /** timestamp */ t: number;
}

export interface TxtrStats {
  runs: number;
  totalCoins: number;
  daysPlayed: number;
  lastDay: string;
  bestMult: number;
  topMph: number;
  bestDistance: number;
}

export interface TxtrProfile {
  best: number;
  /** Coins earned but not yet credited to the backend (a failed award retries). */
  pendingAward: number;
  ownedCars: string[];
  selectedCar: string;
  achievements: string[];
  leaderboard: LeaderEntry[];
  daily: { date: string; best: number };
  stats: TxtrStats;
  muted: boolean;
  difficulty: DifficultyId;
}

export function defaultProfile(): TxtrProfile {
  return {
    best: 0,
    pendingAward: 0,
    ownedCars: ['cherry'],
    selectedCar: 'cherry',
    achievements: [],
    leaderboard: [],
    daily: { date: '', best: 0 },
    stats: {
      runs: 0,
      totalCoins: 0,
      daysPlayed: 0,
      lastDay: '',
      bestMult: 0,
      topMph: 0,
      bestDistance: 0,
    },
    muted: false,
    difficulty: 'normal',
  };
}

const canUseSecureStore = async (): Promise<boolean> => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function sanitize(raw: Partial<TxtrProfile> | null | undefined): TxtrProfile {
  const p = defaultProfile();
  if (!raw || typeof raw !== 'object') return p;

  p.best = Math.max(0, Math.floor(num(raw.best, 0)));
  p.pendingAward = Math.max(0, Math.floor(num(raw.pendingAward, 0)));
  p.muted = raw.muted === true;
  p.difficulty = (raw.difficulty && DIFFICULTIES[raw.difficulty] ? raw.difficulty : 'normal') as DifficultyId;

  if (Array.isArray(raw.ownedCars)) {
    const owned = raw.ownedCars.filter(
      (id): id is string => typeof id === 'string' && CARS.some((c) => c.id === id),
    );
    if (owned.length) p.ownedCars = Array.from(new Set(owned));
  }
  if (!p.ownedCars.includes('cherry')) p.ownedCars.unshift('cherry');
  p.selectedCar = CARS.some((c) => c.id === raw.selectedCar) ? (raw.selectedCar as string) : 'cherry';
  if (!p.ownedCars.includes(p.selectedCar)) p.selectedCar = 'cherry';

  if (Array.isArray(raw.achievements)) {
    p.achievements = raw.achievements.filter(
      (id): id is string => typeof id === 'string' && ACHIEVEMENTS.some((a) => a.id === id),
    );
  }

  if (Array.isArray(raw.leaderboard)) {
    p.leaderboard = raw.leaderboard
      .filter((e): e is LeaderEntry => !!e && typeof e === 'object')
      .map(
        (e): LeaderEntry => ({
          s: Math.max(0, Math.floor(num(e.s, 0))),
          m: (DIFFICULTIES[e.m] ? e.m : 'normal') as DifficultyId,
          d: e.d === 1 ? 1 : 0,
          t: num(e.t, 0),
        }),
      )
      .sort((a, b) => b.s - a.s)
      .slice(0, LEADERBOARD_LIMIT);
  }

  if (raw.daily && typeof raw.daily === 'object') {
    p.daily = { date: str(raw.daily.date, ''), best: Math.max(0, Math.floor(num(raw.daily.best, 0))) };
  }

  if (raw.stats && typeof raw.stats === 'object') {
    const s = raw.stats;
    p.stats = {
      runs: Math.max(0, Math.floor(num(s.runs, 0))),
      totalCoins: Math.max(0, Math.floor(num(s.totalCoins, 0))),
      daysPlayed: Math.max(0, Math.floor(num(s.daysPlayed, 0))),
      lastDay: str(s.lastDay, ''),
      bestMult: num(s.bestMult, 0),
      topMph: num(s.topMph, 0),
      bestDistance: num(s.bestDistance, 0),
    };
  }

  return p;
}

export async function loadProfile(): Promise<TxtrProfile> {
  try {
    if (!(await canUseSecureStore())) return defaultProfile();
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return defaultProfile();
    return sanitize(JSON.parse(raw) as Partial<TxtrProfile>);
  } catch {
    return defaultProfile();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: TxtrProfile | null = null;

async function writeNow(profile: TxtrProfile): Promise<void> {
  try {
    if (!(await canUseSecureStore())) return;
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(profile));
  } catch {
    // best-effort — the in-memory profile still works for this session
  }
}

/** Debounced write; several rapid updates (a garage spree) collapse into one. */
export function saveProfile(profile: TxtrProfile): void {
  pending = profile;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (p) void writeNow(p);
  }, 350);
}

/** Flush any debounced write immediately (called when leaving the game). */
export function flushProfile(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const p = pending;
  pending = null;
  if (p) void writeNow(p);
}

/* --- Run finalisation ----------------------------------------------------- */

export interface FinalizeResult {
  profile: TxtrProfile;
  newBest: boolean;
  unlocked: Achievement[];
}

/**
 * Banks a finished run into the profile: lifetime stats, best score, daily best,
 * leaderboard and newly-earned achievements. The coins themselves are credited
 * to the player's backend points balance by the screen — `pendingAward` holds
 * them until that call succeeds.
 */
export function finalizeRun(prev: TxtrProfile, world: World): FinalizeResult {
  const profile: TxtrProfile = {
    ...prev,
    ownedCars: [...prev.ownedCars],
    achievements: [...prev.achievements],
    leaderboard: [...prev.leaderboard],
    daily: { ...prev.daily },
    stats: { ...prev.stats },
  };
  const run: RunSummary = world.run;

  const s = profile.stats;
  s.runs += 1;
  s.totalCoins += world.coins;
  if (run.topMph > s.topMph) s.topMph = run.topMph;
  if (run.bestMult > s.bestMult) s.bestMult = run.bestMult;
  if (world.distance > s.bestDistance) s.bestDistance = world.distance;
  const today = todayStr();
  if (s.lastDay !== today) {
    s.daysPlayed += 1;
    s.lastDay = today;
  }

  const newBest = world.score > profile.best;
  if (newBest) profile.best = world.score;

  if (world.daily) {
    if (profile.daily.date !== today) {
      profile.daily.date = today;
      profile.daily.best = 0;
    }
    if (world.score > profile.daily.best) profile.daily.best = world.score;
  }

  profile.leaderboard.push({
    s: world.score,
    m: world.difficulty.id,
    d: world.daily ? 1 : 0,
    t: Date.now(),
  });
  profile.leaderboard.sort((a, b) => b.s - a.s);
  profile.leaderboard = profile.leaderboard.slice(0, LEADERBOARD_LIMIT);

  const ctx = {
    stats: {
      runs: s.runs,
      totalCoins: s.totalCoins,
      daysPlayed: s.daysPlayed,
      carsOwned: profile.ownedCars.length,
    },
    run: {
      nearMisses: run.nearMisses,
      bestMult: run.bestMult,
      topMph: run.topMph,
      distance: world.distance,
      score: world.score,
    },
  };
  const unlocked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!profile.achievements.includes(a.id) && a.check(ctx)) {
      profile.achievements.push(a.id);
      unlocked.push(a);
    }
  }

  saveProfile(profile);
  return { profile, newBest, unlocked };
}

/* --- Garage --------------------------------------------------------------- */

export function equipCar(prev: TxtrProfile, id: string): TxtrProfile | null {
  if (!prev.ownedCars.includes(id) || prev.selectedCar === id) return null;
  const next: TxtrProfile = { ...prev, selectedCar: id };
  saveProfile(next);
  return next;
}

/**
 * Records a purchase locally. The price itself is charged against the player's
 * backend points balance by the caller — ownership is the only local state.
 */
export function grantCar(prev: TxtrProfile, id: string): TxtrProfile | null {
  const car = CARS.find((c) => c.id === id);
  if (!car || prev.ownedCars.includes(id)) return null;
  const next: TxtrProfile = {
    ...prev,
    ownedCars: [...prev.ownedCars, id],
    selectedCar: id,
  };
  saveProfile(next);
  return next;
}

/* --- Pending point awards -------------------------------------------------- */

/** Remembers coins owed to the backend before the credit call is attempted. */
export function addPendingAward(prev: TxtrProfile, amount: number): TxtrProfile {
  if (amount <= 0) return prev;
  const next: TxtrProfile = { ...prev, pendingAward: prev.pendingAward + Math.floor(amount) };
  saveProfile(next);
  return next;
}

/** Clears an award once the backend has accepted it. */
export function settlePendingAward(prev: TxtrProfile, amount: number): TxtrProfile {
  const next: TxtrProfile = {
    ...prev,
    pendingAward: Math.max(0, prev.pendingAward - Math.floor(amount)),
  };
  saveProfile(next);
  return next;
}

export function setMuted(prev: TxtrProfile, muted: boolean): TxtrProfile {
  const next: TxtrProfile = { ...prev, muted };
  saveProfile(next);
  return next;
}

export function setDifficulty(prev: TxtrProfile, difficulty: DifficultyId): TxtrProfile {
  const next: TxtrProfile = { ...prev, difficulty };
  saveProfile(next);
  return next;
}
