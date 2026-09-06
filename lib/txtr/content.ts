// ─── Txtr — content & data layer ─────────────────────────────────────────────
// Unlockable cars, traffic colors, difficulty modes and achievements — ported
// from extraFiles/js/content.js. The conversation threads that shipped with the
// web build belonged to the typing layer, which this port does not include.

export interface Car {
  id: string;
  name: string;
  price: number;
  body: string;
  shade: string;
  roof: string;
  sparkle?: boolean;
  rainbow?: boolean;
}

export interface TrafficPalette {
  body: string;
  shade: string;
  roof: string;
}

export interface Difficulty {
  id: DifficultyId;
  name: string;
  spawnBase: number;
  ramp: number;
  doubleChance: number;
  startSpeed: number;
  /**
   * How hard coin pressure bites in this mode. The gentler modes escalate
   * *faster* once you start hoarding, so no difficulty is a safe farm.
   */
  pressureScale: number;
  label: string;
}

export type DifficultyId = 'chill' | 'normal' | 'mayhem';

export interface AchievementContext {
  stats: {
    runs: number;
    totalCoins: number;
    daysPlayed: number;
    carsOwned: number;
  };
  run: {
    nearMisses: number;
    bestMult: number;
    topMph: number;
    distance: number;
    score: number;
  };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (c: AchievementContext) => boolean;
}

/* --- Unlockable cars (cosmetic) ------------------------------------------- */
/* body = main flat color, shade = darker cel-shade tone, roof = cabin color.
   price in coins; the default car is free. Purely cosmetic — no balance edge. */
export const CARS: Car[] = [
  { id: 'cherry', name: 'Cherry Bomb', price: 0, body: '#ff4d5e', shade: '#c81e3a', roof: '#ffd0d6' },
  { id: 'lemon', name: 'Lemon Drop', price: 150, body: '#ffd23f', shade: '#e0a400', roof: '#fff3c4' },
  { id: 'mint', name: 'Mint Condition', price: 150, body: '#2ec4b6', shade: '#1a8f86', roof: '#c9fff8' },
  { id: 'bubble', name: 'Bubblegum', price: 250, body: '#ff79c6', shade: '#d63c97', roof: '#ffd6ef' },
  { id: 'grape', name: 'Grape Ape', price: 250, body: '#9b5de5', shade: '#6c33b5', roof: '#e4ccff' },
  { id: 'tang', name: 'Tangerine Rush', price: 400, body: '#ff8c32', shade: '#d4600c', roof: '#ffe0c2' },
  { id: 'toxic', name: 'Toxic Avenger', price: 600, body: '#7cff5e', shade: '#3ba81f', roof: '#dcffd0' },
  { id: 'ocean', name: 'Deep Ocean', price: 600, body: '#3a86ff', shade: '#1b53c0', roof: '#cfe0ff' },
  { id: 'mono', name: 'Midnight', price: 900, body: '#3a3a48', shade: '#16161f', roof: '#7a7a8c' },
  { id: 'cloud', name: 'Cloud Nine', price: 900, body: '#f4f4f8', shade: '#c4c4d0', roof: '#ffffff' },
  { id: 'gold', name: 'Gold Standard', price: 2000, body: '#ffd23f', shade: '#b8860b', roof: '#fff6c8', sparkle: true },
  { id: 'rainbow', name: 'Hot Streak', price: 3500, body: '#ff4d5e', shade: '#c81e3a', roof: '#fff3c4', rainbow: true },
];

export const findCar = (id: string): Car => CARS.find((c) => c.id === id) ?? CARS[0];

/* --- Traffic colors (oncoming cars) --------------------------------------- */
export const TRAFFIC_PALETTE: TrafficPalette[] = [
  { body: '#ffd23f', shade: '#d4a017', roof: '#fff3c4' },
  { body: '#3a86ff', shade: '#1b53c0', roof: '#cfe0ff' },
  { body: '#2ec4b6', shade: '#1a8f86', roof: '#c9fff8' },
  { body: '#ff8c32', shade: '#d4600c', roof: '#ffe0c2' },
  { body: '#9b5de5', shade: '#6c33b5', roof: '#e4ccff' },
  { body: '#ff79c6', shade: '#d63c97', roof: '#ffd6ef' },
  { body: '#f4f4f8', shade: '#b8b8c6', roof: '#ffffff' },
  { body: '#52b788', shade: '#2d6a4f', roof: '#d8f3dc' },
];

/* --- Difficulty modes ----------------------------------------------------- */
/* spawnBase: seconds between traffic waves at base speed (higher = easier).
   ramp: speed gain per second. doubleChance: chance of 2-wide blocks. */
export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  chill: {
    id: 'chill',
    name: 'Chill',
    spawnBase: 1.26,
    ramp: 0.2,
    doubleChance: 0.24,
    startSpeed: 27,
    pressureScale: 1.65,
    label: 'Lighter traffic — until you get greedy',
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    spawnBase: 1.02,
    ramp: 0.32,
    doubleChance: 0.46,
    startSpeed: 31,
    pressureScale: 1,
    label: 'Rush hour, swerving traffic',
  },
  mayhem: {
    id: 'mayhem',
    name: 'Mayhem',
    spawnBase: 0.86,
    ramp: 0.46,
    doubleChance: 0.68,
    startSpeed: 37,
    pressureScale: 0.9,
    label: 'Dense, reckless traffic. Good luck',
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['chill', 'normal', 'mayhem'];

/* --- Achievements --------------------------------------------------------- */
/* check(ctx) receives { stats, run } and returns true when earned.
   stats = lifetime totals; run = the just-finished run summary. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstrun', name: "Learner's Permit", desc: 'Finish your first run.', check: (c) => c.stats.runs >= 1 },
  { id: 'closecall', name: 'Close Call', desc: 'Pull off 8 near misses in one run.', check: (c) => c.run.nearMisses >= 8 },
  { id: 'daredevil', name: 'Daredevil', desc: 'Pull off 25 near misses in one run.', check: (c) => c.run.nearMisses >= 25 },
  { id: 'comboking', name: 'Combo Royalty', desc: 'Reach a x15 multiplier.', check: (c) => c.run.bestMult >= 15 },
  { id: 'speed', name: 'Speed Demon', desc: 'Break 140 mph.', check: (c) => c.run.topMph >= 140 },
  { id: 'marathon', name: 'Long Haul', desc: 'Drive 4000 m in one run.', check: (c) => c.run.distance >= 4000 },
  { id: 'rich', name: 'Coin Hoarder', desc: 'Collect 1000 coins total.', check: (c) => c.stats.totalCoins >= 1000 },
  { id: 'collector', name: 'Full Garage', desc: 'Own every car.', check: (c) => c.stats.carsOwned >= CARS.length },
  { id: 'highroller', name: 'High Roller', desc: 'Score 25,000 in one run.', check: (c) => c.run.score >= 25000 },
  { id: 'regular', name: 'Daily Driver', desc: 'Play on 3 different days.', check: (c) => c.stats.daysPlayed >= 3 },
];
