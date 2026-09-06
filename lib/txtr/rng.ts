// ─── Txtr — math & RNG ───────────────────────────────────────────────────────
// Ported from extraFiles/js/game.js. The web build kept a module-level `rng`
// that swapped to a seeded generator in Daily mode; here the generator is
// passed explicitly so the engine stays pure and testable.

export type Rng = () => number;

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Deterministic 32-bit PRNG — the Daily Challenge uses this so every player
 *  gets the exact same run on a given day. */
export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

export const randInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(rand(rng, min, max + 1));

export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

export const dailySeed = (): number => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
