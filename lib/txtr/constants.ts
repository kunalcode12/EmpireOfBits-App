// ─── Txtr — tunables & theme ─────────────────────────────────────────────────
// Every gameplay number here is copied verbatim from the original web build
// (extraFiles/js/game.js). Do not "tune" these — the whole feel of the game is
// balanced around them. Render-only budgets live at the bottom.

/* --- World / projection --------------------------------------------------- */
export const LANE_COUNT = 5;
export const CENTER_LANE = (LANE_COUNT - 1) / 2; // 2
export const CAM_DEPTH = 1.0; // perspective strength
export const PLAYER_DEPTH = 0.6; // keeps the car clear of the bottom edge
export const SPAWN_DEPTH = 14; // where traffic / coins appear
export const ROAD_FAR = 30; // road drawn beyond spawn
export const HALF_LANES = 2.3; // road edge in lane-units
export const LANE_SPREAD = 0.215; // screen px per lane-unit per scale per width
export const HORIZON_RATIO = 0.3;
// Lane width is measured against `min(width, height * ROAD_ASPECT)` rather than
// raw width. In portrait that is always the width (so the original geometry is
// untouched); in landscape it stops a five-lane road from stretching across an
// ultra-wide screen and keeps the cars readably large instead of hair-thin.
export const ROAD_ASPECT = 1.25;
export const DEPTH_PER_SPEED = 0.15; // world closing speed -> depth/sec

/* --- Collision / combo ---------------------------------------------------- */
export const COLLIDE_LANE = 0.55;
export const NEARMISS_LANE = 1.35;
export const COMBO_TIME = 6.0;
export const MULT_STEP = 0.15;
export const MULT_MAX = 12;

/* --- Escalating pressure -------------------------------------------------- */
// Coins are real currency now, so the run has to fight back: every coin banked
// raises "pressure", which speeds the road up, tightens the spawn interval,
// widens the roadblocks and makes traffic swerve more often. Greed costs.
export const PRESSURE_COINS = 55; // coins collected for full pressure
export const PRESSURE_RAMP = 0.42; // extra speed gain per second at full pressure
export const PRESSURE_SPAWN = 0.36; // spawn interval shrink at full pressure
export const PRESSURE_DOUBLE = 0.34; // extra 2-wide chance at full pressure
export const TRIPLE_PRESSURE = 0.6; // pressure before 3-wide blocks appear
export const TRIPLE_CHANCE = 0.34; // roll for a 3-wide block once unlocked
export const PRESSURE_STEPS = [0.25, 0.5, 0.75, 1] as const;

/* --- Throttle & brake ----------------------------------------------------- */
// The road sets a "cruise" speed that climbs on its own; the pedals let you ride
// above or below it. Flooring it scores faster and pulls richer coin chains, but
// obstacles are spaced along the road, so they arrive proportionally sooner.
export const THROTTLE_TOP = 1.55; // top speed as a multiple of cruise
export const BRAKE_FLOOR = 0.52; // slowest you can crawl, relative to cruise
export const THROTTLE_ACCEL = 30; // speed units gained per second on the gas
export const BRAKE_DECEL = 46; // speed units shed per second on the brake
export const COAST_RATE = 14; // drift back toward cruise with both pedals up
export const BOOST_TOP_BONUS = 0.4; // ✦ pickup lifts the ceiling this much more
export const BOOST_SURGE = 9; // and gives an instant kick when collected
export const FAST_RATIO = 1.18; // "you are pushing it" threshold

/* --- Obstacle spacing (measured along the road, not in seconds) ------------ */
export const MIN_SPAWN_GAP = 3.4; // depth units between waves, hard floor
export const CONE_CHANCE = 0.22; // chance a wave also drops a cone cluster
export const CONE_PRESSURE = 0.16;
export const TRUCK_CHANCE = 0.16; // chance a blocker is a slow, wide truck
export const TRUCK_PRESSURE = 0.22;
export const CONE_SPEED_PENALTY = 0.24; // speed lost when you clip cones
export const SLALOM_CHANCE = 0.3; // coin runs that weave across lanes

/* --- Autonomous traffic --------------------------------------------------- */
// Traffic no longer rides a fixed rail: each car drifts at its own speed and
// changes lanes on its own — but only while far enough away to be dodgeable.
export const SWERVE_MIN_DEPTH = 4.5; // no lane changes closer than this
export const SWERVE_BASE_CHANCE = 0.3;
export const SWERVE_PRESSURE_CHANCE = 0.45;
export const SWERVE_COOLDOWN_MIN = 0.9;
export const SWERVE_COOLDOWN_MAX = 2.4;
export const LANE_CHANGE_SPEED = 1.1; // lanes per second
// Relative closing-speed spread. Wide enough that traffic visibly moves at its
// own pace, tight enough that cars from different waves don't converge into an
// impassable wall on the way down the road.
export const TRAFFIC_SPEED_MIN = 0.9;
export const TRAFFIC_SPEED_MAX = 1.14;
/** Hard ceiling on cars in flight — the density backstop. */
export const MAX_TRAFFIC = 16;
/** Depth units per second a boxed-in car drops back to reopen a blocked band.
 *  Fast enough that a hole exists before the player can reach the band. */
export const CONGESTION_RELIEF = 11;
export const LANE_CLEARANCE = 2.4; // depth gap needed to merge into a lane

/* --- Persistence ---------------------------------------------------------- */
export const STORE_KEY = 'eob.txtr.profile.v1';
export const LEADERBOARD_LIMIT = 20;
export const LEADERBOARD_SHOWN = 8;

/* --- Renderer budgets (mobile only; never affects gameplay) --------------- */
// Objects past this depth project to < ~4px and are skipped by the original
// canvas renderer anyway (drawCar early-outs at W < 4), so culling here is
// visually identical and keeps the SVG node count sane.
export const OBJECT_CULL_DEPTH = 16;
export const MAX_VISIBLE_DASHES = 10; // per lane divider
export const MAX_PARTICLES = 60;
export const CLOUD_COUNT = 6;
export const HILL_COUNT = 7;

/* --- Bold Cartoon Arcade palette (styles.css :root) ----------------------- */
export const TXTR = {
  ink: '#1b1b2b',
  paper: '#fffaf0',
  paper2: '#ffffff',
  sky: '#4cc9f0',
  skyLow: '#a8e6ff',
  red: '#ff4d5e',
  redDark: '#c81e3a',
  yellow: '#ffd23f',
  yellowDark: '#e0a400',
  green: '#43c59e',
  greenDark: '#2a9d8f',
  purple: '#9b5de5',
  grey: '#9aa0b0',
  // world
  roadTop: '#41414e',
  roadBottom: '#2a2a33',
  grassTop: '#52b788',
  grassBottom: '#2d6a4f',
  hillFar: '#7bdff2',
  hillNear: '#57cc99',
  sun: '#fff3b0',
  // fx
  popupPerfect: '#7cff5e',
  popupNear: '#8de1ff',
  shieldBlue: '#8de1ff',
  magnetPurple: '#c774e8',
  boostOrange: '#ffb13f',
  muted: '#777777',
  dim: '#6b7280',
} as const;

/* --- Fonts ---------------------------------------------------------------- */
// Loaded at runtime the same way the Arena screens load their pixel fonts:
// best-effort, never blocking, always with a system fallback.
export const FREDOKA_FONT = 'Fredoka';
export const FREDOKA_URI =
  'https://github.com/google/fonts/raw/main/ofl/fredoka/static/Fredoka-SemiBold.ttf';
export const FREDOKA_BOLD_FONT = 'FredokaBold';
export const FREDOKA_BOLD_URI =
  'https://github.com/google/fonts/raw/main/ofl/fredoka/static/Fredoka-Bold.ttf';
