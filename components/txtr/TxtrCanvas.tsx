import React, { useEffect, useReducer, useRef } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import {
  CENTER_LANE,
  CLOUD_COUNT,
  HALF_LANES,
  HILL_COUNT,
  LANE_COUNT,
  MAX_VISIBLE_DASHES,
  OBJECT_CULL_DEPTH,
  PLAYER_DEPTH,
  ROAD_FAR,
  TXTR,
} from '../../lib/txtr/constants';
import type { Car, TrafficPalette } from '../../lib/txtr/content';
import { project, type Pickup, type TrafficCar, type World } from '../../lib/txtr/engine';
import { clamp, lerp } from '../../lib/txtr/rng';

// ─── Txtr canvas ─────────────────────────────────────────────────────────────
// A faithful SVG port of the <canvas> renderer in extraFiles/js/game.js: sky,
// sun, scrolling hills and clouds, grass, the perspective road with dashed
// dividers, cartoon cars, coins, power-ups, particles, speed lines, screen
// shake and the white crash flash.
//
// Like components/arena/ArenaCanvas.tsx this component owns the frame loop: it
// ticks the engine through `onFrame` and then force-renders itself, so the rest
// of the screen never re-renders at 60fps.

interface TxtrCanvasProps {
  /** Mutable world — read (never copied) on every frame. */
  world: World;
  /** The player's equipped car (drives the body colours / rainbow cycling). */
  car: Car;
  width: number;
  height: number;
  /** Advance the simulation. Called once per animation frame, before drawing. */
  onFrame: (dt: number, ts: number) => void;
  fontFamily?: string;
}

/* --- Static scenery layout (mirrors the CLOUDS / HILLS tables in game.js) --- */
const CLOUDS = Array.from({ length: CLOUD_COUNT }, (_, i) => ({
  x: i / CLOUD_COUNT,
  y: 0.08 + (i % 3) * 0.05,
  s: 0.7 + (i % 4) * 0.18,
  spd: 0.004 + (i % 3) * 0.002,
}));
const HILLS = Array.from({ length: HILL_COUNT }, (_, i) => ({ x: i / 6, r: 0.1 + (i % 3) * 0.04 }));

const INK = TXTR.ink;

/* --- Path helpers --------------------------------------------------------- */

const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();

/** One full circle as a subpath, so a cluster can share a single <Path> node. */
const circleSub = (cx: number, cy: number, r: number): string =>
  `M${n1(cx - r)} ${n1(cy)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(r * 2)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-r * 2)} 0`;

/** Upper half of a circle (a cartoon hill) as a subpath. */
const hillSub = (cx: number, cy: number, r: number): string =>
  `M${n1(cx - r)} ${n1(cy)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(cx + r)} ${n1(cy)}Z`;

const quad = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): string =>
  `M${n1(ax)} ${n1(ay)}L${n1(bx)} ${n1(by)}L${n1(cx)} ${n1(cy)}L${n1(dx)} ${n1(dy)}Z`;

/* --- Cartoon car ---------------------------------------------------------- */
// Drawn as a rounded trapezoid: wider at the near end (bottom), narrower at the
// far end (top), so it reads as a real car seen at the road's angle. The near
// vertical end-face is shaded darker; the top surface catches light.
// facing "rear" = the player (taillights); "front" = oncoming traffic.

interface CarProps {
  x: number;
  y: number;
  laneUnit: number;
  pal: TrafficPalette;
  facing: 'front' | 'rear';
  rot?: number;
  opacity?: number;
  /** Trucks are wider, longer and boxier, and carry a cargo container. */
  truck?: boolean;
}

function CartoonCar({ x, y, laneUnit, pal, facing, rot = 0, opacity = 1, truck }: CarProps) {
  const W = laneUnit * (truck ? 0.86 : 0.72);
  if (W < 4) return null;
  const H = W * (truck ? 1.85 : 1.5);
  const lw = Math.max(2, W * 0.07);
  const topW = W * (truck ? 0.9 : 0.66); // far end narrower (perspective)
  const nearY = H * 0.5;
  const farY = -H * 0.5;
  const faceY = H * 0.18; // end-face spans faceY..nearY
  const r = W * 0.16;
  const widthAt = (yy: number): number => lerp(W, topW, (nearY - yy) / (nearY - farY));

  const bodyPath =
    `M${n1(-W / 2 + r)} ${n1(nearY)}` +
    `L${n1(W / 2 - r)} ${n1(nearY)}` +
    `Q${n1(W / 2)} ${n1(nearY)} ${n1(W / 2)} ${n1(nearY - r)}` +
    `L${n1(topW / 2)} ${n1(farY + r)}` +
    `Q${n1(topW / 2)} ${n1(farY)} ${n1(topW / 2 - r * 0.7)} ${n1(farY)}` +
    `L${n1(-topW / 2 + r * 0.7)} ${n1(farY)}` +
    `Q${n1(-topW / 2)} ${n1(farY)} ${n1(-topW / 2)} ${n1(farY + r)}` +
    `L${n1(-W / 2)} ${n1(nearY - r)}` +
    `Q${n1(-W / 2)} ${n1(nearY)} ${n1(-W / 2 + r)} ${n1(nearY)}Z`;

  const fW = widthAt(faceY);
  // The shaded near end-face — the same region the canvas build produced by
  // clipping the body and filling from faceY down.
  const facePath =
    `M${n1(-fW / 2)} ${n1(faceY)}` +
    `L${n1(fW / 2)} ${n1(faceY)}` +
    `L${n1(W / 2)} ${n1(nearY - r)}` +
    `Q${n1(W / 2)} ${n1(nearY)} ${n1(W / 2 - r)} ${n1(nearY)}` +
    `L${n1(-W / 2 + r)} ${n1(nearY)}` +
    `Q${n1(-W / 2)} ${n1(nearY)} ${n1(-W / 2)} ${n1(nearY - r)}Z`;
  // The lit top surface (roof + hood).
  const glossPath =
    `M${n1(-topW / 2 + r * 0.7)} ${n1(farY)}` +
    `L${n1(topW / 2 - r * 0.7)} ${n1(farY)}` +
    `Q${n1(topW / 2)} ${n1(farY)} ${n1(topW / 2)} ${n1(farY + r)}` +
    `L${n1(fW / 2)} ${n1(faceY)}` +
    `L${n1(-fW / 2)} ${n1(faceY)}` +
    `L${n1(-topW / 2)} ${n1(farY + r)}` +
    `Q${n1(-topW / 2)} ${n1(farY)} ${n1(-topW / 2 + r * 0.7)} ${n1(farY)}Z`;

  const rwW = W * 0.17;
  const rwH = H * 0.2;
  const fwW = rwW * 0.82;
  const fwH = rwH * 0.82;
  const fwX = widthAt(farY + H * 0.28) / 2;

  const gBotY = faceY - H * 0.03;
  const gTopY = farY + H * 0.32;
  const gbW = widthAt(gBotY) * 0.78;
  const gtW = widthAt(gTopY) * 0.74;

  const rTopY = farY + H * 0.03;
  const rBotY = gTopY;
  const rtW = widthAt(rTopY) * 0.68;
  const rbW = widthAt(rBotY) * 0.72;

  const faceH = nearY - faceY;
  const lY = nearY - faceH * 0.46;
  const lH = faceH * 0.34;
  const lW = W * 0.2;

  const wheel = (key: string, cx: number, cy: number, ww: number, hh: number) => (
    <Rect
      key={key}
      x={cx - ww / 2}
      y={cy - hh / 2}
      width={ww}
      height={hh}
      rx={Math.min(ww, hh) * 0.4}
      fill="#17171f"
      stroke={INK}
      strokeWidth={lw}
    />
  );

  return (
    <G transform={`translate(${n1(x)} ${n1(y)})`} opacity={opacity}>
      {/* ground shadow (unrotated, like the canvas build) */}
      <Ellipse cx={0} cy={nearY - H * 0.02} rx={W * 0.6} ry={H * 0.1} fill="rgba(0,0,0,0.18)" />
      <G transform={`rotate(${((rot * 180) / Math.PI).toFixed(2)})`}>
        {/* wheels first, so they poke out behind the body */}
        {wheel('rl', -W * 0.5, nearY - rwH * 0.6, rwW, rwH)}
        {wheel('rr', W * 0.5, nearY - rwH * 0.6, rwW, rwH)}
        {wheel('fl', -fwX, farY + H * 0.3, fwW, fwH)}
        {wheel('fr', fwX, farY + H * 0.3, fwW, fwH)}

        <Path
          d={bodyPath}
          fill={pal.body}
          stroke={INK}
          strokeWidth={lw}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path d={facePath} fill={pal.shade} />
        <Path d={glossPath} fill="url(#txtrGloss)" />
        {/* edge where the end-face meets the top surface */}
        <Path
          d={`M${n1(-fW / 2)} ${n1(faceY)}L${n1(fW / 2)} ${n1(faceY)}`}
          stroke={INK}
          strokeWidth={lw}
          strokeLinecap="round"
        />

        {/* roof accent strip */}
        <Polygon
          points={`${n1(-rbW / 2)},${n1(rBotY)} ${n1(rbW / 2)},${n1(rBotY)} ${n1(rtW / 2)},${n1(
            rTopY,
          )} ${n1(-rtW / 2)},${n1(rTopY)}`}
          fill={pal.roof}
          opacity={0.85}
        />
        {/* cabin glass */}
        <Polygon
          points={`${n1(-gbW / 2)},${n1(gBotY)} ${n1(gbW / 2)},${n1(gBotY)} ${n1(gtW / 2)},${n1(
            gTopY,
          )} ${n1(-gtW / 2)},${n1(gTopY)}`}
          fill={facing === 'front' ? '#bfe6ff' : '#21384f'}
          stroke={INK}
          strokeWidth={lw}
          strokeLinejoin="round"
        />

        {/* cargo container — what makes a truck read as a rolling wall */}
        {truck && (
          <>
            <Rect
              x={-widthAt(farY + H * 0.3) * 0.44}
              y={farY + H * 0.05}
              width={widthAt(farY + H * 0.3) * 0.88}
              height={H * 0.46}
              rx={W * 0.06}
              fill={pal.roof}
              stroke={INK}
              strokeWidth={lw}
              strokeLinejoin="round"
            />
            <Path
              d={
                `M${n1(-widthAt(farY + H * 0.3) * 0.36)} ${n1(farY + H * 0.2)}L${n1(widthAt(farY + H * 0.3) * 0.36)} ${n1(farY + H * 0.2)}` +
                `M${n1(-widthAt(farY + H * 0.3) * 0.36)} ${n1(farY + H * 0.34)}L${n1(widthAt(farY + H * 0.3) * 0.36)} ${n1(farY + H * 0.34)}`
              }
              stroke={pal.shade}
              strokeWidth={Math.max(1, lw * 0.7)}
              strokeOpacity={0.6}
            />
          </>
        )}

        {/* lights + details on the end-face */}
        {facing === 'front' ? (
          <>
            <Rect
              x={-W * 0.42}
              y={lY - lH / 2}
              width={lW}
              height={lH}
              rx={lH * 0.3}
              fill="#fff3b0"
              stroke={INK}
              strokeWidth={lw}
            />
            <Rect
              x={W * 0.42 - lW}
              y={lY - lH / 2}
              width={lW}
              height={lH}
              rx={lH * 0.3}
              fill="#fff3b0"
              stroke={INK}
              strokeWidth={lw}
            />
            <Rect
              x={-W * 0.17}
              y={lY - lH * 0.28}
              width={W * 0.34}
              height={lH * 0.56}
              rx={lH * 0.2}
              fill="#10141d"
            />
          </>
        ) : (
          <>
            <Rect
              x={-W * 0.44}
              y={lY - lH / 2}
              width={lW}
              height={lH}
              rx={lH * 0.3}
              fill="#ff4d5e"
              stroke={INK}
              strokeWidth={lw}
            />
            <Rect
              x={W * 0.44 - lW}
              y={lY - lH / 2}
              width={lW}
              height={lH}
              rx={lH * 0.3}
              fill="#ff4d5e"
              stroke={INK}
              strokeWidth={lw}
            />
            <Rect
              x={-W * 0.13}
              y={nearY - faceH * 0.36}
              width={W * 0.26}
              height={faceH * 0.22}
              rx={2}
              fill="#f4f4ea"
              stroke={INK}
              strokeWidth={lw}
            />
          </>
        )}
      </G>
    </G>
  );
}

/* --- Coin & power-up ------------------------------------------------------ */

function Coin({
  x,
  y,
  laneUnit,
  spin,
  time,
  fontFamily,
}: {
  x: number;
  y: number;
  laneUnit: number;
  spin: number;
  time: number;
  fontFamily?: string;
}) {
  const r = laneUnit * 0.3;
  if (r < 2) return null;
  const squash = Math.abs(Math.sin(time * 6 + spin)) * 0.85 + 0.15;
  return (
    <G transform={`translate(${n1(x)} ${n1(y)})`}>
      <Ellipse cx={0} cy={r * 1.2} rx={r * 0.9} ry={r * 0.3} fill="rgba(0,0,0,0.18)" />
      <Ellipse
        cx={0}
        cy={0}
        rx={r * squash}
        ry={r}
        fill={TXTR.yellow}
        stroke={INK}
        strokeWidth={Math.max(2, r * 0.16)}
      />
      {squash > 0.4 && (
        <SvgText
          x={0}
          y={r * 0.06 + r * 0.38}
          fontSize={Math.round(r * 1.1)}
          fontWeight="bold"
          fill="#b8860b"
          textAnchor="middle"
          fontFamily={fontFamily}
        >
          T
        </SvgText>
      )}
    </G>
  );
}

const POWERUP_FILL: Record<string, string> = {
  shield: '#8de1ff',
  magnet: '#c774e8',
  boost: TXTR.yellow,
};

/** Vector glyphs — emoji inside SVG <Text> renders inconsistently on Android. */
function powerupGlyph(kind: string, r: number): string {
  if (kind === 'shield') {
    return (
      `M0 ${n1(-r * 0.58)}L${n1(r * 0.5)} ${n1(-r * 0.32)}L${n1(r * 0.5)} ${n1(r * 0.08)}` +
      `Q${n1(r * 0.5)} ${n1(r * 0.55)} 0 ${n1(r * 0.72)}` +
      `Q${n1(-r * 0.5)} ${n1(r * 0.55)} ${n1(-r * 0.5)} ${n1(r * 0.08)}` +
      `L${n1(-r * 0.5)} ${n1(-r * 0.32)}Z`
    );
  }
  if (kind === 'magnet') {
    return (
      `M${n1(-r * 0.52)} ${n1(r * 0.5)}L${n1(-r * 0.52)} 0` +
      `A${n1(r * 0.52)} ${n1(r * 0.52)} 0 0 1 ${n1(r * 0.52)} 0` +
      `L${n1(r * 0.52)} ${n1(r * 0.5)}L${n1(r * 0.2)} ${n1(r * 0.5)}L${n1(r * 0.2)} 0` +
      `A${n1(r * 0.2)} ${n1(r * 0.2)} 0 0 0 ${n1(-r * 0.2)} 0` +
      `L${n1(-r * 0.2)} ${n1(r * 0.5)}Z`
    );
  }
  // four-point sparkle (✦)
  return (
    `M0 ${n1(-r * 0.62)}L${n1(r * 0.17)} ${n1(-r * 0.17)}L${n1(r * 0.62)} 0` +
    `L${n1(r * 0.17)} ${n1(r * 0.17)}L0 ${n1(r * 0.62)}L${n1(-r * 0.17)} ${n1(r * 0.17)}` +
    `L${n1(-r * 0.62)} 0L${n1(-r * 0.17)} ${n1(-r * 0.17)}Z`
  );
}

/* --- Road cone ------------------------------------------------------------ */
// Non-fatal hazard: clip it and you scrub speed. Drawn as a striped cone on a
// base so it reads clearly as "not a car".
function Cone({ x, y, laneUnit }: { x: number; y: number; laneUnit: number }) {
  const w = laneUnit * 0.34;
  if (w < 3) return null;
  const h = w * 1.5;
  const lw = Math.max(1.5, w * 0.14);
  return (
    <G transform={`translate(${n1(x)} ${n1(y)})`}>
      <Ellipse cx={0} cy={0} rx={w * 0.62} ry={w * 0.22} fill="rgba(0,0,0,0.2)" />
      {/* base slab */}
      <Rect
        x={-w * 0.6}
        y={-h * 0.16}
        width={w * 1.2}
        height={h * 0.16}
        rx={w * 0.1}
        fill="#d4600c"
        stroke={INK}
        strokeWidth={lw}
      />
      {/* cone body */}
      <Path
        d={`M0 ${n1(-h)}L${n1(w * 0.44)} ${n1(-h * 0.16)}L${n1(-w * 0.44)} ${n1(-h * 0.16)}Z`}
        fill="#ff8c32"
        stroke={INK}
        strokeWidth={lw}
        strokeLinejoin="round"
      />
      {/* reflective band */}
      <Path
        d={`M${n1(-w * 0.27)} ${n1(-h * 0.52)}L${n1(w * 0.27)} ${n1(-h * 0.52)}L${n1(w * 0.21)} ${n1(-h * 0.66)}L${n1(-w * 0.21)} ${n1(-h * 0.66)}Z`}
        fill="#fffaf0"
      />
    </G>
  );
}

function Powerup({
  x,
  y,
  laneUnit,
  kind,
  spin,
  time,
}: {
  x: number;
  y: number;
  laneUnit: number;
  kind: string;
  spin: number;
  time: number;
}) {
  const r = laneUnit * 0.36;
  if (r < 3) return null;
  const bob = Math.sin(time * 4 + spin) * r * 0.18;
  return (
    <G transform={`translate(${n1(x)} ${n1(y + bob)})`}>
      <Ellipse cx={0} cy={r * 1.5 - bob} rx={r * 0.9} ry={r * 0.3} fill="rgba(0,0,0,0.18)" />
      <Rect
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.5}
        fill={POWERUP_FILL[kind] ?? '#fff'}
        stroke={INK}
        strokeWidth={Math.max(2, r * 0.16)}
      />
      <Path d={powerupGlyph(kind, r * 0.78)} fill="#16263b" />
    </G>
  );
}

/* --- Canvas --------------------------------------------------------------- */

function TxtrCanvasInner({ world, car, width, height, onFrame, fontFamily }: TxtrCanvasProps) {
  // The scene is redrawn from a mutable world every frame and the callback ref
  // is written during render, so this component opts out of the React Compiler
  // (the same escape hatch the Arena canvas relies on).
  'use no memo';

  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  const lastTsRef = useRef(0);
  const [, force] = useReducer((c: number) => (c + 1) % 1_000_000, 0);

  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = Math.min((ts - last) / 1000, 0.033);
      lastTsRef.current = ts;
      frameRef.current(dt, ts);
      force();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const w = width;
  const h = height;
  if (w < 2 || h < 2) return null;

  const horizonY = project(w, h, 0, CENTER_LANE).horizonY;
  const scroll = world.scroll;
  const time = world.time;

  /* --- background ---------------------------------------------------------- */
  const sunR = Math.min(w, h) * 0.07;

  let hillFar = '';
  for (const hl of HILLS) {
    const hx = ((((hl.x - scroll * 0.0009) % 1.2) + 1.2) % 1.2) * w - w * 0.1;
    hillFar += hillSub(hx, horizonY, hl.r * w);
  }
  let hillNear = '';
  for (let i = 0; i < HILLS.length; i += 1) {
    const hx = ((((i / 5 - scroll * 0.0014) % 1.3) + 1.3) % 1.3) * w - w * 0.15;
    hillNear += hillSub(hx, horizonY + 4, (0.13 + (i % 2) * 0.05) * w);
  }

  const clouds: React.ReactElement[] = [];
  for (let i = 0; i < CLOUDS.length; i += 1) {
    const c = CLOUDS[i];
    const cx = ((((c.x - scroll * c.spd * 0.02) % 1.2) + 1.2) % 1.2) * w - w * 0.1;
    const cy = c.y * h;
    const s = c.s * w * 0.04;
    const ow = Math.max(2.5, s * 0.16);
    const parts: [number, number, number][] = [
      [0, 0, s],
      [s, s * 0.18, s * 0.78],
      [-s, s * 0.18, s * 0.72],
      [s * 0.45, -s * 0.42, s * 0.64],
      [-s * 0.55, -s * 0.18, s * 0.54],
    ];
    let dark = '';
    let light = '';
    for (const [dx, dy, pr] of parts) {
      dark += circleSub(cx + dx, cy + dy, pr + ow);
      light += circleSub(cx + dx, cy + dy, pr);
    }
    clouds.push(<Path key={`cd${i}`} d={dark} fill={INK} />);
    clouds.push(<Path key={`cl${i}`} d={light} fill="#ffffff" />);
  }

  /* --- road ---------------------------------------------------------------- */
  const roadEdgeX = (depth: number, side: number): number => {
    const p = project(w, h, depth, CENTER_LANE);
    return p.x + side * HALF_LANES * p.laneUnit;
  };
  const farP = project(w, h, ROAD_FAR, CENTER_LANE);
  const nearP = project(w, h, 0, CENTER_LANE);
  const farY = farP.y;
  const nearY = h;
  const shoulder = (depth: number, side: number): number => {
    const p = project(w, h, depth, CENTER_LANE);
    return roadEdgeX(depth, side) + side * p.laneUnit * 0.28;
  };
  const shoulderPath = quad(
    shoulder(ROAD_FAR, -1),
    farY,
    shoulder(ROAD_FAR, 1),
    farY,
    shoulder(0, 1),
    nearY,
    shoulder(0, -1),
    nearY,
  );
  const asphaltPath = quad(
    roadEdgeX(ROAD_FAR, -1),
    farY,
    roadEdgeX(ROAD_FAR, 1),
    farY,
    roadEdgeX(0, 1),
    nearY,
    roadEdgeX(0, -1),
    nearY,
  );
  const edgeLine = (side: number): string => {
    const farX = farP.x + side * HALF_LANES * farP.laneUnit;
    const nearX = nearP.x + side * HALF_LANES * nearP.laneUnit;
    const farIn = farP.x + side * (HALF_LANES * farP.laneUnit - farP.laneUnit * 0.12);
    const nearIn = nearP.x + side * (HALF_LANES * nearP.laneUnit - nearP.laneUnit * 0.12);
    return quad(farX, farY, farIn, farY, nearIn, h, nearX, h);
  };

  const DASH = 0.85;
  const GAP = 1.7;
  const phase = (scroll * 0.5) % GAP;
  const dashPaths: string[] = [];
  for (let div = 0.5; div < LANE_COUNT - 1; div += 1) {
    let d = '';
    for (let i = 0; i < MAX_VISIBLE_DASHES; i += 1) {
      const nearD = i * GAP - phase;
      if (nearD < 0 || nearD > ROAD_FAR) continue;
      const farD = nearD + DASH;
      const a = project(w, h, nearD, div);
      const b = project(w, h, farD, div);
      if (a.y - b.y < 1.5) continue; // sub-pixel in the distance
      const wN = Math.max(1, a.laneUnit * 0.06);
      const wF = Math.max(0.5, b.laneUnit * 0.06);
      d += quad(a.x - wN, a.y, a.x + wN, a.y, b.x + wF, b.y, b.x - wF, b.y);
    }
    if (d) dashPaths.push(d);
  }

  /* --- world objects (far first) ------------------------------------------- */
  type Item =
    | { depth: number; kind: 'car'; ref: TrafficCar }
    | { depth: number; kind: 'pickup'; ref: Pickup };
  const items: Item[] = [];
  for (const c of world.traffic) {
    if (c.depth > OBJECT_CULL_DEPTH || c.depth < -2) continue;
    items.push({ depth: c.depth, kind: 'car', ref: c });
  }
  for (const p of world.pickups) {
    if (p.dead || p.depth > OBJECT_CULL_DEPTH || p.depth < -2) continue;
    items.push({ depth: p.depth, kind: 'pickup', ref: p });
  }
  items.sort((a, b) => b.depth - a.depth);

  const objects: React.ReactElement[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const proj = project(w, h, it.ref.depth, it.ref.lane);
    if (it.kind === 'car') {
      if (it.ref.kind === 'cone') {
        objects.push(
          <Cone key={`t${i}`} x={proj.x} y={proj.y} laneUnit={proj.laneUnit} />,
        );
      } else {
        const bob = Math.sin(time * 7 + it.ref.bob) * proj.laneUnit * 0.02;
        objects.push(
          <CartoonCar
            key={`t${i}`}
            x={proj.x}
            y={proj.y + bob}
            laneUnit={proj.laneUnit}
            pal={it.ref.pal}
            facing="front"
            truck={it.ref.kind === 'truck'}
            // traffic leans into its own lane changes
            rot={clamp(it.ref.bank * 0.14, -0.16, 0.16)}
          />,
        );
      }
    } else if (it.ref.kind === 'coin') {
      objects.push(
        <Coin
          key={`p${i}`}
          x={proj.x}
          y={proj.y - proj.laneUnit * 0.5}
          laneUnit={proj.laneUnit}
          spin={it.ref.spin}
          time={time}
          fontFamily={fontFamily}
        />,
      );
    } else {
      objects.push(
        <Powerup
          key={`p${i}`}
          x={proj.x}
          y={proj.y - proj.laneUnit * 0.6}
          laneUnit={proj.laneUnit}
          kind={it.ref.kind}
          spin={it.ref.spin}
          time={time}
        />,
      );
    }
  }

  /* --- speed lines --------------------------------------------------------- */
  let speedLines = '';
  let speedAlpha = 0;
  if (world.state === 'playing') {
    const intensity = clamp((world.speed - 40) / 30, 0, 1);
    if (intensity > 0.02) {
      speedAlpha = 0.05 + intensity * 0.14;
      for (let i = 0; i < 16; i += 1) {
        const lx = Math.random() * w;
        const ly = h * 0.32 + Math.random() * h * 0.6;
        const len = (10 + Math.random() * 26) * intensity;
        speedLines += `M${n1(lx)} ${n1(ly)}L${n1(lx)} ${n1(ly + len)}`;
      }
    }
  }

  /* --- player -------------------------------------------------------------- */
  const pProj = project(w, h, PLAYER_DEPTH, world.currentLane);
  const steer = world.currentLane - world.targetLane;
  const playerBob = Math.sin(time * 10) * pProj.laneUnit * 0.012;
  const playerRot = clamp(steer * 0.08, -0.1, 0.1);
  let pal: TrafficPalette = { body: car.body, shade: car.shade, roof: car.roof };
  if (car.rainbow) {
    const hue = Math.round((time * 90) % 360);
    pal = {
      body: `hsl(${hue}, 90%, 60%)`,
      shade: `hsl(${hue}, 90%, 42%)`,
      roof: `hsl(${hue}, 90%, 82%)`,
    };
  }
  const flame =
    clamp((world.speed - 46) / 24, 0, 1) + (world.boost > 0 ? 0.6 : 0);
  const showFlame = world.state === 'playing' && flame > 0.15;
  const flameLen = pProj.laneUnit * (0.3 + flame * 0.5) * (0.8 + Math.random() * 0.4);
  const playerOpacity =
    world.invuln > 0 && Math.floor(time * 20) % 2 === 0 ? 0.45 : 1;

  /* --- shake --------------------------------------------------------------- */
  const sx = world.shake > 0 ? (Math.random() * 2 - 1) * world.shake : 0;
  const sy = world.shake > 0 ? (Math.random() * 2 - 1) * world.shake * 0.5 : 0;

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="txtrSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={TXTR.sky} />
          <Stop offset="1" stopColor={TXTR.skyLow} />
        </LinearGradient>
        <LinearGradient id="txtrGrass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={TXTR.grassTop} />
          <Stop offset="1" stopColor={TXTR.grassBottom} />
        </LinearGradient>
        <LinearGradient id="txtrAsphalt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={TXTR.roadTop} />
          <Stop offset="1" stopColor={TXTR.roadBottom} />
        </LinearGradient>
        <LinearGradient id="txtrGloss" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.26} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.05} />
        </LinearGradient>
        <LinearGradient id="txtrFlame" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffdc78" stopOpacity={0.9} />
          <Stop offset="1" stopColor="#ff5a3c" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <G transform={`translate(${n1(sx)} ${n1(sy)})`}>
        {/* sky */}
        <Rect x={0} y={0} width={w} height={horizonY + 2} fill="url(#txtrSky)" />
        <Circle
          cx={w * 0.8}
          cy={horizonY * 0.42}
          r={sunR}
          fill={TXTR.sun}
          stroke={INK}
          strokeWidth={Math.max(2, sunR * 0.08)}
        />
        <Path d={hillFar} fill={TXTR.hillFar} />
        <Path d={hillNear} fill={TXTR.hillNear} />
        {clouds}
        {/* grass */}
        <Rect x={0} y={horizonY} width={w} height={h - horizonY} fill="url(#txtrGrass)" />

        {/* road */}
        <Path d={shoulderPath} fill={INK} />
        <Path d={asphaltPath} fill="url(#txtrAsphalt)" />
        <Path d={edgeLine(-1)} fill={TXTR.yellow} />
        <Path d={edgeLine(1)} fill={TXTR.yellow} />
        {dashPaths.map((d, i) => (
          <Path key={`d${i}`} d={d} fill="#f4f4f8" />
        ))}

        {objects}

        {speedLines !== '' && (
          <Path d={speedLines} stroke="#ffffff" strokeOpacity={speedAlpha} strokeWidth={2} />
        )}

        {/* player */}
        {showFlame && (
          <G transform={`translate(${n1(pProj.x)} ${n1(pProj.y + pProj.laneUnit * 0.7)})`}>
            <Polygon
              points={`${n1(-pProj.laneUnit * 0.18)},0 0,${n1(flameLen)} ${n1(
                pProj.laneUnit * 0.18,
              )},0`}
              fill="url(#txtrFlame)"
            />
          </G>
        )}
        <CartoonCar
          x={pProj.x}
          y={pProj.y + playerBob}
          laneUnit={pProj.laneUnit * 1.05}
          pal={pal}
          facing="rear"
          rot={playerRot}
          opacity={playerOpacity}
        />
        {world.shield && (
          <Ellipse
            cx={pProj.x}
            cy={pProj.y}
            rx={pProj.laneUnit * 0.7}
            ry={pProj.laneUnit * 0.95}
            stroke={TXTR.shieldBlue}
            strokeWidth={Math.max(2, pProj.laneUnit * 0.06)}
            strokeOpacity={0.5 + Math.sin(time * 6) * 0.15}
            fill="none"
          />
        )}

        {/* particles */}
        {world.particles.map((p, i) => (
          <Circle
            key={`pt${i}`}
            cx={p.x}
            cy={p.y}
            r={p.size * clamp(p.life / p.max, 0.2, 1)}
            fill={p.color}
            opacity={clamp(p.life / p.max, 0, 1)}
          />
        ))}
      </G>

      {/* white crash flash */}
      {world.flashT > 0 && (
        <Rect x={0} y={0} width={w} height={h} fill="#ffffff" opacity={clamp(world.flashT, 0, 1)} />
      )}
    </Svg>
  );
}

// Props are stable (a mutable world object + stable callbacks), so HUD and
// overlay state changes never re-render the scene — only the frame loop does.
const TxtrCanvas = React.memo(TxtrCanvasInner);
export default TxtrCanvas;
