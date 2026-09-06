// ─── Txtr — game engine (pure) ───────────────────────────────────────────────
// A direct port of the simulation half of extraFiles/js/game.js: perspective
// projection, the update loop, spawning, collisions, combo/scoring, pickups and
// particles. No React, no React Native, no DOM — the screen owns presentation
// and drains `world.events` each frame.
//
// The web build's typing layer (scripted reply threads, the send timer and the
// per-character scoring) is not part of this port; the combo now rides on coins
// and near misses alone.

import {
  BOOST_SURGE,
  BOOST_TOP_BONUS,
  BRAKE_DECEL,
  BRAKE_FLOOR,
  CAM_DEPTH,
  CENTER_LANE,
  COAST_RATE,
  COLLIDE_LANE,
  COMBO_TIME,
  CONE_CHANCE,
  CONE_PRESSURE,
  CONE_SPEED_PENALTY,
  CONGESTION_RELIEF,
  DEPTH_PER_SPEED,
  FAST_RATIO,
  HORIZON_RATIO,
  MAX_TRAFFIC,
  MIN_SPAWN_GAP,
  SLALOM_CHANCE,
  THROTTLE_ACCEL,
  THROTTLE_TOP,
  TRUCK_CHANCE,
  TRUCK_PRESSURE,
  LANE_CHANGE_SPEED,
  LANE_CLEARANCE,
  LANE_COUNT,
  LANE_SPREAD,
  ROAD_ASPECT,
  MAX_PARTICLES,
  MULT_MAX,
  MULT_STEP,
  NEARMISS_LANE,
  PLAYER_DEPTH,
  PRESSURE_COINS,
  PRESSURE_DOUBLE,
  PRESSURE_RAMP,
  PRESSURE_SPAWN,
  PRESSURE_STEPS,
  SPAWN_DEPTH,
  SWERVE_BASE_CHANCE,
  SWERVE_COOLDOWN_MAX,
  SWERVE_COOLDOWN_MIN,
  SWERVE_MIN_DEPTH,
  SWERVE_PRESSURE_CHANCE,
  TRAFFIC_SPEED_MAX,
  TRAFFIC_SPEED_MIN,
  TRIPLE_CHANCE,
  TRIPLE_PRESSURE,
} from './constants';
import {
  DIFFICULTIES,
  TRAFFIC_PALETTE,
  type Difficulty,
  type DifficultyId,
  type TrafficPalette,
} from './content';
import { clamp, lerp, pick, rand, randInt, type Rng } from './rng';

/* --- Types ---------------------------------------------------------------- */

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover';

export type PickupKind = 'coin' | 'shield' | 'magnet' | 'boost';

/** What is sitting in the road: normal traffic, a slow wide truck, or cones. */
export type TrafficKind = 'car' | 'truck' | 'cone';

export interface TrafficCar {
  kind: TrafficKind;
  /** Fractional while a car is mid-lane-change. */
  lane: number;
  /** The lane this car is driving toward. */
  laneTarget: number;
  depth: number;
  pal: TrafficPalette;
  bob: number;
  passed: boolean;
  /** Relative closing speed — some cars dawdle, some come at you fast. */
  speedFactor: number;
  /** Seconds until this car considers changing lanes again. */
  swerveTimer: number;
  /** -1..1 lean while merging, drawn as a body tilt. */
  bank: number;
}

export interface Pickup {
  kind: PickupKind;
  lane: number;
  depth: number;
  spin: number;
  dead: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  max: number;
  color: string;
  grav: number;
}

export type PopupStyle = 'coin' | 'perfect' | 'near' | 'ok';
export type BannerStyle = 'gold' | 'shield' | 'magnet' | 'boost' | 'plain';

export type SfxCue =
  | 'laneShift'
  | 'coin'
  | 'combo'
  | 'nearMiss'
  | 'powerup'
  | 'shieldBreak'
  | 'achievement'
  | 'uiClick'
  | 'uiBack'
  | 'purchase'
  | 'denied'
  | 'crash';

export type TxtrEvent =
  | { kind: 'popup'; text: string; x: number; y: number; style: PopupStyle }
  | { kind: 'banner'; main: string; sub?: string; style: BannerStyle }
  | { kind: 'sfx'; cue: SfxCue; level?: number }
  | { kind: 'crash' };

export interface RunSummary {
  nearMisses: number;
  bestMult: number;
  topMph: number;
}

export interface World {
  state: GameState;
  width: number;
  height: number;
  time: number;
  scroll: number;
  /** Actual road speed — what the pedals move. */
  speed: number;
  /** The self-escalating baseline the pedals push against. */
  cruise: number;
  /** speed / cruise, for the gauge and speed-scaled rewards. */
  speedRatio: number;
  /** Pedal state, written by the screen every frame. */
  throttle: boolean;
  brake: boolean;
  baseSpeed: number;
  score: number;
  distance: number;
  coins: number;
  currentLane: number;
  targetLane: number;
  safeLane: number;
  traffic: TrafficCar[];
  pickups: Pickup[];
  particles: Particle[];
  /** Distance banked toward the next wave, in depth units. */
  spawnMeter: number;
  /** Road distance until the next wave. */
  spawnGap: number;
  combo: number;
  mult: number;
  comboTimer: number;
  shield: boolean;
  invuln: number;
  magnet: number;
  boost: number;
  shake: number;
  slowmo: number;
  flashT: number;
  difficulty: Difficulty;
  daily: boolean;
  /** 0..1 — how hard the road is pushing back, driven by coins banked. */
  pressure: number;
  /** Index into PRESSURE_STEPS of the last milestone announced. */
  pressureStep: number;
  rng: Rng;
  /** Cosmetic randomness stays on Math.random even in Daily mode (as in the web build). */
  cosmeticRng: Rng;
  run: RunSummary;
  events: TxtrEvent[];
}

/* --- Projection (true perspective) ---------------------------------------- */

export interface Projection {
  x: number;
  y: number;
  scale: number;
  laneUnit: number;
  horizonY: number;
}

export function project(width: number, height: number, depth: number, lane: number): Projection {
  const horizonY = height * HORIZON_RATIO;
  const scale = CAM_DEPTH / (depth + CAM_DEPTH); // 1 at camera, ->0 at distance
  const y = horizonY + (height - horizonY) * scale;
  const spreadRef = Math.min(width, height * ROAD_ASPECT);
  const laneUnit = scale * LANE_SPREAD * spreadRef;
  const x = width / 2 + (lane - CENTER_LANE) * laneUnit;
  return { x, y, scale, laneUnit, horizonY };
}

export const projectWorld = (w: World, depth: number, lane: number): Projection =>
  project(w.width, w.height, depth, lane);

export const mphOf = (speed: number): number => Math.round(38 + speed * 1.42);

/**
 * Spacing to the next wave, in depth units. Derived from the difficulty's
 * seconds-per-wave at its own start speed, so the feel at cruise matches the
 * original pacing while the pedals change how fast you eat through it.
 */
function nextSpawnGap(w: World): number {
  const heat = w.pressure * w.difficulty.pressureScale;
  const base = w.difficulty.spawnBase * w.difficulty.startSpeed * DEPTH_PER_SPEED;
  const gap = base * (1 - clamp(heat, 0, 1.8) * PRESSURE_SPAWN);
  return Math.max(MIN_SPAWN_GAP, gap) * rand(w.rng, 0.88, 1.12);
}

const startingGap = (difficulty: Difficulty): number =>
  Math.max(MIN_SPAWN_GAP, difficulty.spawnBase * difficulty.startSpeed * DEPTH_PER_SPEED);

/* --- Construction --------------------------------------------------------- */

export function createWorld(width: number, height: number, difficulty: Difficulty): World {
  return {
    state: 'menu',
    width,
    height,
    time: 0,
    scroll: 0,
    speed: difficulty.startSpeed,
    cruise: difficulty.startSpeed,
    speedRatio: 1,
    throttle: false,
    brake: false,
    baseSpeed: difficulty.startSpeed,
    score: 0,
    distance: 0,
    coins: 0,
    currentLane: CENTER_LANE,
    targetLane: CENTER_LANE,
    safeLane: CENTER_LANE,
    traffic: [],
    pickups: [],
    particles: [],
    spawnMeter: 0,
    spawnGap: startingGap(difficulty),
    combo: 0,
    mult: 1,
    comboTimer: 0,
    shield: false,
    invuln: 0,
    magnet: 0,
    boost: 0,
    shake: 0,
    slowmo: 0,
    flashT: 0,
    difficulty,
    daily: false,
    pressure: 0,
    pressureStep: 0,
    rng: Math.random,
    cosmeticRng: Math.random,
    run: { nearMisses: 0, bestMult: 0, topMph: 0 },
    events: [],
  };
}

export function setViewport(w: World, width: number, height: number): void {
  w.width = width;
  w.height = height;
}

export interface StartRunOptions {
  difficultyId: DifficultyId;
  daily: boolean;
  rng: Rng;
}

/** Resets every per-run field. Mirrors startGame() in the web build. */
export function startRun(w: World, opts: StartRunOptions): void {
  const difficulty = DIFFICULTIES[opts.difficultyId] ?? DIFFICULTIES.normal;
  w.difficulty = difficulty;
  w.daily = opts.daily;
  w.rng = opts.rng;
  w.cosmeticRng = Math.random;
  w.baseSpeed = difficulty.startSpeed;

  w.state = 'playing';
  w.time = 0;
  w.scroll = 0;
  w.speed = w.baseSpeed;
  w.cruise = w.baseSpeed;
  w.speedRatio = 1;
  w.throttle = false;
  w.brake = false;
  w.score = 0;
  w.distance = 0;
  w.coins = 0;
  w.currentLane = CENTER_LANE;
  w.targetLane = CENTER_LANE;
  w.safeLane = CENTER_LANE;
  w.traffic = [];
  w.pickups = [];
  w.particles = [];
  w.spawnMeter = 0;
  w.spawnGap = startingGap(w.difficulty);
  w.combo = 0;
  w.mult = 1;
  w.comboTimer = 0;
  w.shield = false;
  w.invuln = 0;
  w.magnet = 0;
  w.boost = 0;
  w.shake = 0;
  w.slowmo = 0;
  w.flashT = 0;
  w.pressure = 0;
  w.pressureStep = 0;
  w.run = { nearMisses: 0, bestMult: 0, topMph: 0 };
  w.events.length = 0;
}

/** Clears the wreck and puts the world back to how it looks on first load: an
 *  empty road, no shake, no flash, no leftover debris. */
export function resetToMenu(w: World): void {
  w.state = 'menu';
  w.time = 0;
  w.scroll = 0;
  w.speed = w.difficulty.startSpeed;
  w.cruise = w.difficulty.startSpeed;
  w.speedRatio = 1;
  w.throttle = false;
  w.brake = false;
  w.baseSpeed = w.difficulty.startSpeed;
  w.score = 0;
  w.distance = 0;
  w.coins = 0;
  w.currentLane = CENTER_LANE;
  w.targetLane = CENTER_LANE;
  w.safeLane = CENTER_LANE;
  w.traffic = [];
  w.pickups = [];
  w.particles = [];
  w.spawnMeter = 0;
  w.spawnGap = startingGap(w.difficulty);
  w.combo = 0;
  w.mult = 1;
  w.comboTimer = 0;
  w.shield = false;
  w.invuln = 0;
  w.magnet = 0;
  w.boost = 0;
  w.shake = 0;
  w.slowmo = 0;
  w.flashT = 0;
  w.pressure = 0;
  w.pressureStep = 0;
  w.run = { nearMisses: 0, bestMult: 0, topMph: 0 };
  w.events.length = 0;
}

/** Lets a finished wreck settle: the screen shake, the white flash and the
 *  debris keep easing out after the run ends (the simulation itself is frozen).
 *  Without this the crash's shake and flash would stay pinned at full strength
 *  for as long as the game-over panel is up. */
export function settle(w: World, dt: number): void {
  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 26);
  if (w.flashT > 0) w.flashT = Math.max(0, w.flashT - dt * 2.2);
  if (w.particles.length > 0) {
    for (const pt of w.particles) {
      pt.life -= dt;
      pt.x += pt.vx * 120 * dt;
      pt.y += pt.vy * 120 * dt;
      pt.vy += pt.grav * dt;
    }
    w.particles = w.particles.filter((p) => p.life > 0);
  }
}

/* --- Juice ---------------------------------------------------------------- */

export function flash(w: World, alpha = 0.5): void {
  w.flashT = alpha;
}

export function addShake(w: World, amount: number): void {
  w.shake = Math.min(28, w.shake + amount);
}

export function spawnParticles(
  w: World,
  x: number,
  y: number,
  colors: string[],
  count: number,
  power: number,
): void {
  for (let i = 0; i < count; i += 1) {
    if (w.particles.length >= MAX_PARTICLES) w.particles.shift();
    const r = w.cosmeticRng;
    w.particles.push({
      x,
      y,
      vx: (r() * 2 - 1) * power,
      vy: (r() * 1.6 - 2.2) * power,
      size: 2 + r() * 6,
      life: 0.4 + r() * 0.5,
      max: 0.9,
      color: colors[(r() * colors.length) | 0],
      grav: 9 + r() * 6,
    });
  }
}

const popup = (w: World, text: string, x: number, y: number, style: PopupStyle): void => {
  w.events.push({ kind: 'popup', text, x, y, style });
};

const banner = (w: World, main: string, sub: string | undefined, style: BannerStyle): void => {
  w.events.push({ kind: 'banner', main, sub, style });
};

const sfx = (w: World, cue: SfxCue, level?: number): void => {
  w.events.push({ kind: 'sfx', cue, level });
};

/* --- Combo / scoring ------------------------------------------------------ */

function recomputeMult(w: World): void {
  w.mult = clamp(1 + w.combo * MULT_STEP, 1, MULT_MAX);
}

export function addCombo(w: World, n = 1): void {
  w.combo += n;
  w.comboTimer = COMBO_TIME;
  recomputeMult(w);
  if (w.mult > w.run.bestMult) w.run.bestMult = w.mult;
  if (w.combo > 0 && w.combo % 5 === 0) {
    sfx(w, 'combo', w.combo);
    banner(w, `x${w.mult.toFixed(1)} MULTIPLIER`, `${w.combo} combo!`, 'gold');
  }
}

export function breakCombo(w: World): void {
  if (w.combo === 0) return;
  w.combo = 0;
  w.mult = 1;
  w.comboTimer = 0;
}

export function addScore(w: World, base: number): number {
  const gained = Math.round(base * w.mult * (w.boost > 0 ? 2 : 1));
  w.score += gained;
  return gained;
}

/* --- Spawning ------------------------------------------------------------- */

function makePickup(w: World, lane: number, kind: PickupKind): Pickup {
  return { kind, lane, depth: SPAWN_DEPTH + 1, spin: rand(w.rng, 0, Math.PI * 2), dead: false };
}

/** Every block width that can be laid down while still leaving the safe lane open. */
function patternsFor(w: World, wide: number): number[][] {
  const patterns: number[][] = [];
  for (let start = 0; start <= LANE_COUNT - wide; start += 1) {
    const lanes = Array.from({ length: wide }, (_, k) => start + k);
    if (!lanes.includes(w.safeLane)) patterns.push(lanes);
  }
  return patterns;
}

export function spawnWave(w: World): void {
  const rng = w.rng;

  // Slow trucks fall back into the spawn zone and later waves pile in behind
  // them. Look at what is already sitting up there before adding more, or the
  // road can end up genuinely impassable.
  const busy = new Set<number>();
  for (const t of w.traffic) {
    if (t.depth > SPAWN_DEPTH - 3 && t.depth < SPAWN_DEPTH + 5.5) {
      busy.add(Math.round(t.laneTarget));
      busy.add(Math.round(t.lane));
    }
  }
  // Too congested already — let it thin out rather than stacking another wave.
  if (busy.size >= LANE_COUNT - 1) return;
  if (w.traffic.length >= MAX_TRAFFIC) return;

  const drift = pick(rng, [-1, 0, 1]);
  w.safeLane = clamp(w.safeLane + drift, 0, LANE_COUNT - 1);
  // The safe lane has to be genuinely clear, not just clear of *this* wave.
  if (busy.has(w.safeLane)) {
    const free: number[] = [];
    for (let l = 0; l < LANE_COUNT; l += 1) if (!busy.has(l)) free.push(l);
    if (!free.length) return;
    free.sort((a, b) => Math.abs(a - w.safeLane) - Math.abs(b - w.safeLane));
    w.safeLane = free[0];
  }

  // Wider roadblocks as pressure builds; 3-wide only once you are deep in it.
  const heat = w.pressure * w.difficulty.pressureScale;
  const doubleChance = clamp(w.difficulty.doubleChance + heat * PRESSURE_DOUBLE, 0, 0.95);
  let wide = 1;
  if (w.speed > 44 && rng() < doubleChance) wide = 2;
  if (wide === 2 && w.pressure >= TRIPLE_PRESSURE && rng() < TRIPLE_CHANCE) wide = 3;

  // Fall back to a narrower block when the safe lane leaves no room for a wide
  // one, so a hard roll never degenerates into an unfair (or empty) wave.
  let patterns = patternsFor(w, wide);
  while (patterns.length === 0 && wide > 1) {
    wide -= 1;
    patterns = patternsFor(w, wide);
  }
  const blocked = pick(rng, patterns) || [w.safeLane === 0 ? 2 : 0];
  const open: number[] = [];
  for (let l = 0; l < LANE_COUNT; l += 1) if (!blocked.includes(l)) open.push(l);

  const truckChance = TRUCK_CHANCE + heat * TRUCK_PRESSURE;
  for (const lane of blocked) {
    // Trucks are slow, wide and never merge — rolling walls you have to plan around.
    const isTruck = rng() < truckChance;
    w.traffic.push({
      kind: isTruck ? 'truck' : 'car',
      lane,
      laneTarget: lane,
      depth: SPAWN_DEPTH + rand(rng, 0, 2.5),
      pal: pick(rng, TRAFFIC_PALETTE),
      bob: rand(rng, 0, Math.PI * 2),
      passed: false,
      speedFactor: isTruck
        ? rand(rng, TRAFFIC_SPEED_MIN * 0.82, TRAFFIC_SPEED_MIN)
        : rand(rng, TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX),
      swerveTimer: rand(rng, SWERVE_COOLDOWN_MIN, SWERVE_COOLDOWN_MAX),
      bank: 0,
    });
  }

  // Cone clusters: not fatal, but clipping them costs speed and your combo.
  // They never take the safe lane, so a clean line always exists.
  if (open.length > 1 && rng() < CONE_CHANCE + heat * CONE_PRESSURE) {
    const coneLanes = open.filter((l) => l !== w.safeLane);
    if (coneLanes.length) {
      const lane = pick(rng, coneLanes);
      const count = randInt(rng, 2, 3);
      for (let i = 0; i < count; i += 1) {
        w.traffic.push({
          kind: 'cone',
          lane,
          laneTarget: lane,
          depth: SPAWN_DEPTH + 1 + i * 0.7,
          pal: TRAFFIC_PALETTE[3],
          bob: rand(rng, 0, Math.PI * 2),
          passed: false,
          speedFactor: 1,
          swerveTimer: Number.POSITIVE_INFINITY,
          bank: 0,
        });
      }
      open.splice(open.indexOf(lane), 1);
    }
  }

  // reward lane: coins or (rarely) a power-up
  if (open.length) {
    const lane = pick(rng, open);
    const roll = rng();
    if (roll < 0.018) {
      w.pickups.push(makePickup(w, lane, 'shield'));
    } else if (roll < 0.032) {
      w.pickups.push(makePickup(w, lane, 'magnet'));
    } else if (roll < 0.05) {
      w.pickups.push(makePickup(w, lane, 'boost'));
    } else {
      // Long coin chains thin out as the road heats up — but running hot pulls
      // richer ones, so the throttle pays for the risk it creates.
      const chainChance = 0.5 - w.pressure * 0.16 + (w.speedRatio > FAST_RATIO ? 0.22 : 0);
      const bonus = w.speedRatio > FAST_RATIO ? 1 : 0;
      const chain = rng() < chainChance ? randInt(rng, 2, 4) + bonus : 1;
      // A slalom run weaves across lanes: more coins, but you have to work for them.
      const slalom = chain > 2 && rng() < SLALOM_CHANCE;
      for (let i = 0; i < chain; i += 1) {
        const weave = slalom && i > 0 ? (i % 2 === 1 ? 1 : -1) : 0;
        w.pickups.push({
          kind: 'coin',
          lane: clamp(lane + weave, 0, LANE_COUNT - 1),
          depth: SPAWN_DEPTH + 1 + i * 0.85,
          spin: rand(rng, 0, Math.PI * 2),
          dead: false,
        });
      }
    }
  }
}

/* --- Traffic AI ----------------------------------------------------------- */

/** True when `lane` has room for `car` to merge into at its current depth. */
function laneHasRoom(w: World, car: TrafficCar, lane: number): boolean {
  for (const other of w.traffic) {
    if (other === car) continue;
    if (Math.abs(other.depth - car.depth) > LANE_CLEARANCE) continue;
    if (Math.abs(other.laneTarget - lane) < 0.9 || Math.abs(other.lane - lane) < 0.9) return false;
  }
  return true;
}

/**
 * A merge is only allowed if some lane in the same depth band stays open —
 * traffic may crowd you, but it may never wall the road off completely.
 */
function leavesAnEscape(w: World, car: TrafficCar, lane: number): boolean {
  for (let l = 0; l < LANE_COUNT; l += 1) {
    let blockedLane = false;
    for (const other of w.traffic) {
      if (Math.abs(other.depth - car.depth) > LANE_CLEARANCE) continue;
      const at = other === car ? lane : other.laneTarget;
      if (Math.abs(at - l) < 0.9) {
        blockedLane = true;
        break;
      }
    }
    if (!blockedLane) return true;
  }
  return false;
}

/**
 * The guarantee that the road is always driveable. Cars close at their own
 * speeds, so cars from different waves can drift into a band that blocks every
 * lane. When that happens the car nearest the player's line eases off and drops
 * back, opening a hole — it reads as a driver lifting off, and it means a clean
 * line always exists by the time you get there.
 */
function relieveCongestion(w: World, dt: number): void {
  // Scan well ahead of the player so blocks are resolved long before arrival.
  for (let d = 1.2; d <= 12; d += 1.2) {
    let inBand: TrafficCar[] | null = null;
    for (const t of w.traffic) {
      if (Math.abs(t.depth - d) >= 1.35) continue;
      (inBand ??= []).push(t);
    }
    if (!inBand || inBand.length < LANE_COUNT) continue;

    let hasGap = false;
    for (let l = 0; l < LANE_COUNT; l += 1) {
      let blocked = false;
      for (const t of inBand) {
        if (Math.abs(t.lane - l) < 0.85) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        hasGap = true;
        break;
      }
    }
    if (hasGap) continue;

    let yielder = inBand[0];
    for (const t of inBand) {
      if (Math.abs(t.lane - w.currentLane) < Math.abs(yielder.lane - w.currentLane)) yielder = t;
    }
    yielder.depth += CONGESTION_RELIEF * dt;
  }
}

function driveTraffic(w: World, car: TrafficCar, dt: number): void {
  if (car.lane !== car.laneTarget) {
    const step = LANE_CHANGE_SPEED * dt;
    const delta = car.laneTarget - car.lane;
    car.lane = Math.abs(delta) <= step ? car.laneTarget : car.lane + Math.sign(delta) * step;
    car.bank = clamp(delta * 0.8, -1, 1);
    return;
  }
  car.bank *= Math.max(0, 1 - dt * 4);
  // Trucks hold their lane and cones are bolted to the tarmac.
  if (car.kind !== 'car') return;
  // Only cars still far up the road pick a new lane, so you always get warning.
  if (car.depth <= SWERVE_MIN_DEPTH) return;
  car.swerveTimer -= dt;
  if (car.swerveTimer > 0) return;
  car.swerveTimer = rand(w.rng, SWERVE_COOLDOWN_MIN, SWERVE_COOLDOWN_MAX);
  const chance = SWERVE_BASE_CHANCE + w.pressure * SWERVE_PRESSURE_CHANCE;
  if (w.rng() >= chance) return;
  const dir = w.rng() < 0.5 ? -1 : 1;
  const target = clamp(car.laneTarget + dir, 0, LANE_COUNT - 1);
  if (target === car.laneTarget) return;
  if (!laneHasRoom(w, car, target)) return;
  if (!leavesAnEscape(w, car, target)) return;
  car.laneTarget = target;
}

/* --- Collisions / pickups ------------------------------------------------- */

function onNearMiss(w: World, car: TrafficCar): void {
  w.run.nearMisses += 1;
  addCombo(w, 1);
  // Shaving past at speed is worth more than crawling past.
  const fast = w.speedRatio > FAST_RATIO;
  const gained = addScore(w, 120 * (fast ? 1.6 : 1));
  sfx(w, 'nearMiss');
  const p = projectWorld(w, PLAYER_DEPTH, car.lane);
  popup(w, fast ? `FLYING BY +${gained}` : `NEAR MISS +${gained}`, p.x, p.y - p.laneUnit, 'near');
  spawnParticles(w, p.x, p.y, ['#ffffff', '#ffd23f'], fast ? 12 : 8, 2.2);
}

/** Cones do not end the run — they scrub your speed and kill the combo. */
function onConeHit(w: World, cone: TrafficCar): void {
  breakCombo(w);
  w.speed = Math.max(w.cruise * BRAKE_FLOOR, w.speed * (1 - CONE_SPEED_PENALTY));
  addShake(w, 9);
  flash(w, 0.22);
  sfx(w, 'shieldBreak');
  const p = projectWorld(w, PLAYER_DEPTH, cone.lane);
  popup(w, 'CONES!', p.x, p.y - p.laneUnit, 'ok');
  spawnParticles(w, p.x, p.y, ['#ff8c32', '#ffffff', '#ffd23f'], 14, 2.6);
}

function collectPickup(w: World, p: Pickup): void {
  p.dead = true;
  const proj = projectWorld(w, Math.max(p.depth, 0), p.lane);
  if (p.kind === 'coin') {
    w.coins += 1;
    addCombo(w, 1);
    const gained = addScore(w, 25);
    sfx(w, 'coin');
    popup(w, `+${gained}`, proj.x, proj.y - proj.laneUnit, 'coin');
    spawnParticles(w, proj.x, proj.y, ['#ffe680', '#ffd23f', '#fff7cc'], 8, 2.2);
  } else {
    sfx(w, 'powerup');
    flash(w, 0.32);
    spawnParticles(w, proj.x, proj.y, ['#ffffff', '#8de1ff'], 16, 2.6);
    if (p.kind === 'shield') {
      w.shield = true;
      banner(w, 'SHIELD UP', 'Survive one hit', 'shield');
    }
    if (p.kind === 'magnet') {
      w.magnet = 7;
      banner(w, 'COIN MAGNET', '7 seconds', 'magnet');
    }
    if (p.kind === 'boost') {
      w.boost = 7;
      // Not just double score any more: it kicks you forward and lifts the
      // speed ceiling, so the gas pedal does more while it lasts.
      w.speed = Math.min(w.speed + BOOST_SURGE, w.cruise * (THROTTLE_TOP + BOOST_TOP_BONUS));
      banner(w, 'NITRO · x2', 'Higher top speed', 'boost');
    }
  }
}

function crash(w: World, car: TrafficCar): void {
  w.state = 'gameover';
  sfx(w, 'crash');
  addShake(w, 26);
  flash(w, 0.7);
  const p = projectWorld(w, Math.max(car.depth, 0), car.lane);
  spawnParticles(w, p.x, p.y, ['#ff5566', '#ffd23f', '#ffffff', '#8de1ff'], 46, 4.2);
  w.events.push({ kind: 'crash' });
}

/* --- Input ---------------------------------------------------------------- */

export function moveLane(w: World, dir: number): boolean {
  if (w.state !== 'playing') return false;
  const next = clamp(w.targetLane + dir, 0, LANE_COUNT - 1);
  if (next === w.targetLane) return false;
  w.targetLane = next;
  sfx(w, 'laneShift');
  return true;
}

/* --- Update --------------------------------------------------------------- */

export function update(w: World, dtRaw: number): void {
  // slow-mo handling
  if (w.slowmo > 0) w.slowmo = Math.max(0, w.slowmo - dtRaw);
  const dt = dtRaw * (w.slowmo > 0 ? 0.35 : 1);

  // Pressure: every coin banked makes the rest of the run harder.
  w.pressure = clamp(w.coins / PRESSURE_COINS, 0, 1);
  while (
    w.pressureStep < PRESSURE_STEPS.length &&
    w.pressure >= PRESSURE_STEPS[w.pressureStep]
  ) {
    w.pressureStep += 1;
    const last = w.pressureStep === PRESSURE_STEPS.length;
    banner(
      w,
      last ? 'RED LINE' : 'HEAT RISING',
      last ? 'Traffic is done being polite' : `Speed up · ${w.coins} coins`,
      last ? 'boost' : 'gold',
    );
    sfx(w, 'combo', w.pressureStep * 5);
  }

  w.time += dt;
  w.scroll += w.speed * dt;
  w.distance += w.speed * dt * 1.25;
  // The road's own pace keeps climbing no matter what the driver does…
  const heat = w.pressure * w.difficulty.pressureScale;
  w.cruise += dt * (w.difficulty.ramp + heat * PRESSURE_RAMP);

  // …and the pedals ride above or below it. Both up, the car coasts back to
  // cruise; the ✦ boost lifts the ceiling so flooring it goes even harder.
  const ceiling = w.cruise * (THROTTLE_TOP + (w.boost > 0 ? BOOST_TOP_BONUS : 0));
  const floorSpeed = w.cruise * BRAKE_FLOOR;
  let target = w.cruise;
  let rate = COAST_RATE;
  if (w.throttle && !w.brake) {
    target = ceiling;
    rate = THROTTLE_ACCEL;
  } else if (w.brake && !w.throttle) {
    target = floorSpeed;
    rate = BRAKE_DECEL;
  }
  if (w.speed < target) w.speed = Math.min(target, w.speed + rate * dt);
  else if (w.speed > target) w.speed = Math.max(target, w.speed - rate * dt);
  w.speed = clamp(w.speed, floorSpeed, ceiling);
  w.speedRatio = w.speed / w.cruise;

  w.score += Math.floor(w.speed * dt * 3);
  w.currentLane = lerp(w.currentLane, w.targetLane, 1 - Math.exp(-13 * dt));

  // timers
  if (w.invuln > 0) w.invuln = Math.max(0, w.invuln - dt);
  if (w.magnet > 0) w.magnet = Math.max(0, w.magnet - dt);
  if (w.boost > 0) w.boost = Math.max(0, w.boost - dt);
  if (w.comboTimer > 0) {
    w.comboTimer -= dt;
    if (w.comboTimer <= 0) breakCombo(w);
  }

  // run records
  const mph = mphOf(w.speed);
  if (mph > w.run.topMph) w.run.topMph = mph;

  // spawn
  const closing = w.speed * DEPTH_PER_SPEED * dt;

  // Obstacles are spaced along the *road*, not on a clock — this is what makes
  // the throttle a real gamble: go faster and they arrive proportionally sooner.
  w.spawnMeter += closing;
  if (w.spawnMeter >= w.spawnGap) {
    w.spawnMeter -= w.spawnGap;
    spawnWave(w);
    w.spawnGap = nextSpawnGap(w);
  }

  // move traffic + collisions / near-miss
  for (const car of w.traffic) {
    // each car closes at its own rate and steers itself between lanes
    car.depth -= closing * car.speedFactor;
    driveTraffic(w, car, dt);
    if (!car.passed && car.depth <= PLAYER_DEPTH) {
      car.passed = true;
      const laneDist = Math.abs(w.currentLane - car.lane);
      if (car.kind === 'cone') {
        // clipped, not crashed
        if (laneDist < COLLIDE_LANE * 0.8 && w.invuln <= 0) onConeHit(w, car);
        continue;
      }
      // A truck's tail is wider than a car's.
      const hitWidth = car.kind === 'truck' ? COLLIDE_LANE * 1.15 : COLLIDE_LANE;
      if (laneDist < hitWidth) {
        if (w.invuln > 0) {
          /* phasing through */
        } else if (w.shield) {
          w.shield = false;
          w.invuln = 1.3;
          sfx(w, 'shieldBreak');
          flash(w, 0.6);
          addShake(w, 14);
          const p = projectWorld(w, PLAYER_DEPTH, car.lane);
          spawnParticles(w, p.x, p.y, ['#8de1ff', '#ffffff', '#3a86ff'], 26, 3.4);
          banner(w, 'SHIELD DOWN', 'Lucky.', 'shield');
        } else {
          crash(w, car);
          return;
        }
      } else if (laneDist < NEARMISS_LANE) {
        onNearMiss(w, car);
      }
    }
  }

  // move pickups
  for (const p of w.pickups) {
    p.depth -= closing;
    const magnetActive = w.magnet > 0 && p.kind === 'coin';
    if (!p.dead) {
      const reach = magnetActive ? 6 : p.kind === 'coin' ? 0.6 : 0.7;
      if (
        p.depth <= PLAYER_DEPTH + (magnetActive ? 3 : 0.3) &&
        Math.abs(w.currentLane - p.lane) < reach
      ) {
        collectPickup(w, p);
      }
    }
  }

  relieveCongestion(w, dt);

  w.traffic = w.traffic.filter((c) => c.depth > -2);
  w.pickups = w.pickups.filter((p) => p.depth > -2 && !p.dead);

  // particles
  for (const pt of w.particles) {
    pt.life -= dt;
    pt.x += pt.vx * 120 * dt;
    pt.y += pt.vy * 120 * dt;
    pt.vy += pt.grav * dt;
  }
  w.particles = w.particles.filter((p) => p.life > 0);

  w.shake = Math.max(0, w.shake - dt * 26);
  w.flashT = Math.max(0, w.flashT - dt * 2.2);
}
