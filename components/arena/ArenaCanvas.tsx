import React, { useEffect, useMemo, useReducer, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type {
  ArenaDangerZone,
  ArenaDetonation,
  ArenaGrenadeState,
  ArenaObstacleState,
  ArenaPlayerState,
  ArenaPowerupState,
  ArenaProjectileState,
} from '../../store/ArenaContext';

export interface BombAimState {
  dirX: number;
  dirY: number;
  power: number;
  type: 'frag' | 'cryo';
}

interface ArenaCanvasProps {
  self: ArenaPlayerState | null;
  opponent: ArenaPlayerState | null;
  projectiles: ArenaProjectileState[];
  powerups: ArenaPowerupState[];
  obstacles: ArenaObstacleState[];
  dangerZone: ArenaDangerZone | null;
  grenades?: ArenaGrenadeState[];
  detonation?: ArenaDetonation | null;
  /** Latest damage event; drives the on-player hit spark + damage number. */
  hitFlash?: { targetId: number; damage: number; timestamp: number } | null;
  /** True while the gun aim-stick is active (drives zoom + aim line). */
  aiming?: boolean;
  /** Active bomb-throw aim (drag), shows the trajectory + blast reticle. */
  bombAim?: BombAimState | null;
  /** When set, the player is holding (has equipped) a bomb — drawn in hand. */
  holdingBomb?: 'frag' | 'cryo' | null;
  viewportWidth: number;
  viewportHeight: number;
  /** World/map size in game units (square). Defaults to 1000. */
  worldSize?: number;
  /** Vorld actor labels ("PLAYER 1" / "PLAYER 2"); null hides them (Reactive off). */
  selfLabel?: string | null;
  oppLabel?: string | null;
  /** Usernames shown on the nameplate above each soldier. */
  selfName?: string | null;
  oppName?: string | null;
}

const DEFAULT_WORLD_SIZE = 1000;
// How far we zoom in beyond "just fit the screen". Higher = closer/bigger players,
// but less of the arena visible. Tune to taste.
const ZOOM = 1.25;

// Strongly contrasting team colors so the two players read as clearly different:
// you are cool cyan/blue, the enemy is hot red/orange.
const SELF_COLOR = '#28e0ff';
const OPP_COLOR = '#ff4530';

const POWERUP_COLORS: Record<string, string> = {
  shotgun: '#f97316',
  rocket: '#ef4444',
  shield: '#3b82f6',
  speed: '#22c55e',
  health: '#ec4899',
};

const POWERUP_LABELS: Record<string, string> = {
  shotgun: 'SG',
  rocket: 'RK',
  shield: 'SH',
  speed: 'SP',
  health: '+',
};

const PROJECTILE_COLORS: Record<string, string> = {
  blaster: '#FFE600',
  shotgun: '#f97316',
  rocket: '#ff5530',
  smg: '#ffe600',
  scatter: '#f97316',
  laser: '#19f0ff',
  rail: '#c084fc',
};
const BIG_PROJECTILES = new Set(['rocket', 'rail']);

interface DispProj {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: string;
  ownerId: number;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function clampN(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── 3D extruded block ─────────────────────────────────────────────────────────

function ExtrudedBlock({ obs }: { obs: ArenaObstacleState }) {
  const { x, y, w, h, destructible, hp } = obs;
  const depth = destructible ? 14 : 22;

  const topFill = destructible ? 'url(#woodTop)' : 'url(#metalTop)';
  const rightFill = destructible ? '#5a3919' : '#252b40';
  const bottomFill = destructible ? '#3d2510' : '#161a28';
  const strokeColor = destructible ? '#b8742f' : '#36e0ff';

  const rightWall = `${x + w},${y} ${x + w + depth},${y + depth} ${x + w + depth},${y + h + depth} ${x + w},${y + h}`;
  const bottomWall = `${x},${y + h} ${x + w},${y + h} ${x + w + depth},${y + h + depth} ${x + depth},${y + h + depth}`;

  return (
    <G>
      <Rect x={x + 9} y={y + 11} width={w} height={h} rx={4} fill="rgba(0,0,0,0.5)" />
      <Polygon points={rightWall} fill={rightFill} />
      <Polygon points={bottomWall} fill={bottomFill} />
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={destructible ? 3 : 6}
        fill={topFill}
        stroke={strokeColor}
        strokeWidth={destructible ? 2 : 2.5}
        strokeOpacity={destructible ? 0.85 : 0.6}
      />
      <Rect x={x + 3} y={y + 3} width={w - 6} height={(h - 6) * 0.42} rx={3} fill="rgba(255,255,255,0.14)" />
      {destructible ? (
        <>
          <Line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="#5a3919" strokeWidth={1.5} strokeOpacity={0.6} />
          <Line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke="#5a3919" strokeWidth={1.5} strokeOpacity={0.6} />
          {hp > 0 && (
            <SvgText x={x + w / 2} y={y + h / 2 + 5} fontSize={15} fontWeight="bold" fill="#fff" stroke="#000" strokeWidth={0.6} textAnchor="middle">
              {hp}
            </SvgText>
          )}
        </>
      ) : (
        <Circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.2} fill="#36e0ff" fillOpacity={0.4} />
      )}
    </G>
  );
}

// ─── Per-weapon gun graphics (drawn in the soldier's hands, barrel along +x) ──

const MUZZLE_X: Record<string, number> = {
  blaster: 38,
  shotgun: 33,
  scatter: 33,
  smg: 33,
  laser: 39,
  rocket: 47,
  rail: 53,
};

function weaponShape(weapon: string): React.ReactElement {
  switch (weapon) {
    case 'rail': // long sniper rifle + scope
      return (
        <G>
          <Rect x={2} y={-2} width={48} height={4} rx={1.5} fill="#0c0e14" />
          <Rect x={2} y={-2} width={48} height={4} rx={1.5} fill="url(#gunShade)" />
          <Rect x={48} y={-1.5} width={6} height={3} rx={1} fill="#05060a" />
          <Rect x={9} y={-5.5} width={15} height={3.4} rx={1.4} fill="#1b2030" />
          <Circle cx={15} cy={-5.5} r={2.3} fill="#c084fc" />
          <Rect x={2} y={2} width={7} height={7} rx={1.4} fill="#0a0b10" />
          <Rect x={42} y={-3} width={2.6} height={6} rx={1} fill="#c084fc" fillOpacity={0.85} />
        </G>
      );
    case 'rocket': // shoulder tube launcher
      return (
        <G>
          <Rect x={2} y={-4.5} width={34} height={9} rx={4} fill="#2a2730" />
          <Rect x={2} y={-4.5} width={34} height={9} rx={4} fill="url(#gunShade)" />
          <Circle cx={36} cy={0} r={5.2} fill="#0a0b10" />
          <Polygon points="36,-4.5 47,0 36,4.5" fill="#ff5530" />
          <Rect x={8} y={4} width={6} height={8} rx={1.6} fill="#15161c" />
          <Rect x={5} y={-7.5} width={11} height={3} rx={1.2} fill="#1b2030" />
          <Circle cx={20} cy={0} r={2} fill="#ff8a3b" />
        </G>
      );
    case 'scatter':
    case 'shotgun': // wide double-barrel
      return (
        <G>
          <Rect x={2} y={-3.6} width={30} height={2.8} rx={1} fill="#241a0f" />
          <Rect x={2} y={0.8} width={30} height={2.8} rx={1} fill="#241a0f" />
          <Rect x={2} y={-3.6} width={13} height={7.2} rx={1.6} fill="#7a4a22" />
          <Rect x={2} y={-3.6} width={13} height={7.2} rx={1.6} fill="url(#gunShade)" />
          <Rect x={5} y={3.4} width={6} height={7} rx={1.3} fill="#0a0b10" />
          <Circle cx={32} cy={-2.2} r={1.7} fill="#0a0b10" />
          <Circle cx={32} cy={2.2} r={1.7} fill="#0a0b10" />
        </G>
      );
    case 'laser': // sleek energy rifle with glowing emitter
      return (
        <G>
          <Rect x={2} y={-2.6} width={34} height={5.2} rx={2.4} fill="#0c1822" />
          <Rect x={2} y={-2.6} width={34} height={5.2} rx={2.4} fill="url(#gunShade)" />
          <Rect x={10} y={-3.8} width={17} height={1.7} rx={0.8} fill={SELF_COLOR} fillOpacity={0.9} />
          <Circle cx={36} cy={0} r={3.2} fill={SELF_COLOR} />
          <Circle cx={36} cy={0} r={6} fill={SELF_COLOR} fillOpacity={0.3} />
          <Rect x={6} y={2.6} width={6} height={7} rx={1.3} fill="#0a0b10" />
        </G>
      );
    case 'smg': // compact rapid-fire
      return (
        <G>
          <Rect x={2} y={-2.8} width={24} height={5.6} rx={1.8} fill="#16181f" />
          <Rect x={2} y={-2.8} width={24} height={5.6} rx={1.8} fill="url(#gunShade)" />
          <Rect x={24} y={-1.6} width={9} height={3.2} rx={1} fill="#0a0b10" />
          <Rect x={8} y={2.6} width={5} height={11} rx={1.5} fill="#101218" />
          <Rect x={4} y={-4.2} width={8} height={2} rx={0.8} fill="#2a2e3a" />
        </G>
      );
    default: // blaster — standard issue carbine
      return (
        <G>
          <Rect x={1} y={-2.8} width={31} height={5.6} rx={2} fill="#13151c" />
          <Rect x={1} y={-2.8} width={31} height={5.6} rx={2} fill="url(#gunShade)" />
          <Rect x={28} y={-1.8} width={10} height={3.6} rx={1.2} fill="#0a0b10" />
          <Rect x={8} y={2.4} width={4.5} height={8} rx={1.2} fill="#0a0b10" />
          <Rect x={3} y={-3.6} width={7} height={1.6} rx={0.8} fill="#2a2e3a" />
        </G>
      );
  }
}

// ─── Top-down human soldier ──────────────────────────────────────────────────────

function Soldier({ p, teamColor, shooting, holding }: { p: ArenaPlayerState; teamColor: string; shooting: boolean; holding?: 'frag' | 'cryo' | null }) {
  const angle = (Math.atan2(p.facingY, p.facingX) * 180) / Math.PI;
  const isSelf = teamColor === SELF_COLOR;
  const haloId = isSelf ? 'url(#selfHalo)' : 'url(#oppHalo)';
  const skin = '#e8b08a';
  const visor = isSelf ? '#bdf6ff' : '#ffd2c0';
  const muzzleX = MUZZLE_X[p.weapon] ?? 38;
  const bombCol = holding === 'frag' ? '#ff5530' : '#7dd3fc';

  return (
    <G transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
      {/* aim laser */}
      <Line x1={18} y1={0} x2={150} y2={0} stroke={teamColor} strokeWidth={1.6} strokeOpacity={0.28} strokeDasharray="3 9" strokeLinecap="round" />

      {/* team halo + base ring (strong team identity) */}
      <Circle cx={0} cy={0} r={26} fill={haloId} />
      <Circle cx={0} cy={0} r={19} fill="none" stroke={teamColor} strokeWidth={2.5} strokeOpacity={0.55} />
      <Circle cx={0} cy={0} r={19} fill={teamColor} fillOpacity={0.07} />

      {/* held energy shield (a barrier carried in front, bulging toward facing) */}
      {p.shield > 0 && (
        <G>
          <Path d="M 14,-17 Q 32,0 14,17 L 10,13 Q 24,0 10,-13 Z" fill="#5aa9ff" fillOpacity={0.28} />
          <Path d="M 14,-17 Q 32,0 14,17" fill="none" stroke="#7fc0ff" strokeWidth={4} strokeOpacity={0.95} strokeLinecap="round" />
          <Path d="M 11,-13 Q 25,0 11,13" fill="none" stroke="#bfe3ff" strokeWidth={1.5} strokeOpacity={0.7} />
          <Circle cx={22} cy={0} r={3} fill="#dff1ff" />
          <Circle cx={0} cy={0} r={23} fill="none" stroke="#5aa9ff" strokeWidth={1.5} strokeOpacity={0.35} strokeDasharray="4 6" />
        </G>
      )}

      {/* Cryo Freeze aura */}
      {p.frozen && (
        <>
          <Circle cx={0} cy={0} r={23} fill="#7dd3fc" fillOpacity={0.26} />
          <Circle cx={0} cy={0} r={25} fill="none" stroke="#bae6fd" strokeWidth={2.5} strokeOpacity={0.85} strokeDasharray="3 4" />
        </>
      )}

      {/* EMP Jam ring */}
      {p.disarmed && (
        <Circle cx={0} cy={0} r={26} fill="none" stroke="#a855f7" strokeWidth={2.5} strokeOpacity={0.9} strokeDasharray="2 5" />
      )}

      {/* Adrenaline / speed boost — lime aura + motion streaks behind */}
      {p.speedBoosted && (
        <>
          <Circle cx={0} cy={0} r={23} fill="none" stroke="#a3e635" strokeWidth={2} strokeOpacity={0.85} strokeDasharray="9 6" />
          <Line x1={-20} y1={-7} x2={-32} y2={-7} stroke="#a3e635" strokeWidth={2.5} strokeOpacity={0.7} strokeLinecap="round" />
          <Line x1={-20} y1={0} x2={-36} y2={0} stroke="#a3e635" strokeWidth={2.5} strokeOpacity={0.85} strokeLinecap="round" />
          <Line x1={-20} y1={7} x2={-32} y2={7} stroke="#a3e635" strokeWidth={2.5} strokeOpacity={0.7} strokeLinecap="round" />
        </>
      )}

      {/* contact shadow (gives the body lift off the floor) */}
      <Ellipse cx={2} cy={3} rx={17} ry={13} fill="rgba(0,0,0,0.4)" />

      {/* legs / boots */}
      <Rect x={-16} y={-10} width={12} height={7} rx={3} fill="#262833" />
      <Rect x={-16} y={3} width={12} height={7} rx={3} fill="#262833" />
      <Rect x={-16} y={-10} width={12} height={2.5} rx={1.5} fill="rgba(255,255,255,0.12)" />
      <Rect x={-16} y={3} width={12} height={2.5} rx={1.5} fill="rgba(255,255,255,0.12)" />
      <Rect x={-18} y={-9.5} width={4.5} height={6} rx={2} fill="#121319" />
      <Rect x={-18} y={3.5} width={4.5} height={6} rx={2} fill="#121319" />

      {/* backpack */}
      <Rect x={-17} y={-8.5} width={10} height={17} rx={4} fill="#2b3142" />
      <Rect x={-17} y={-8.5} width={10} height={17} rx={4} fill="url(#bodyShade)" />
      <Rect x={-15.5} y={-5} width={6.5} height={10} rx={2} fill="#3b455e" />
      <Circle cx={-12} cy={-6} r={1.2} fill={teamColor} />

      {/* gun (distinct per equipped weapon), held under the arms */}
      {weaponShape(p.weapon)}

      {/* torso / tactical vest — layered for a rounded, 3D body */}
      <Ellipse cx={0} cy={0} rx={13.5} ry={11.5} fill="#11131a" />
      <Ellipse cx={0} cy={0} rx={12} ry={10} fill={teamColor} />
      <Ellipse cx={0} cy={0} rx={12} ry={10} fill="url(#bodyShade)" />
      {/* chest armor plates */}
      <Rect x={-6.5} y={-7.5} width={13} height={15} rx={3.5} fill="rgba(0,0,0,0.22)" />
      <Rect x={-5} y={-6} width={10} height={5.5} rx={2} fill="rgba(255,255,255,0.12)" />
      <Rect x={-5} y={0.5} width={10} height={5.5} rx={2} fill="rgba(0,0,0,0.18)" />
      <Ellipse cx={-3.5} cy={-3.8} rx={6} ry={4} fill="rgba(255,255,255,0.28)" />

      {/* shoulders */}
      <Circle cx={0} cy={-10.5} r={5} fill={teamColor} />
      <Circle cx={0} cy={10.5} r={5} fill={teamColor} />
      <Circle cx={0} cy={-10.5} r={5} fill="url(#bodyShade)" />
      <Circle cx={0} cy={10.5} r={5} fill="url(#bodyShade)" />
      <Circle cx={-1.5} cy={-11.5} r={1.8} fill="rgba(255,255,255,0.35)" />
      <Circle cx={-1.5} cy={9.5} r={1.8} fill="rgba(255,255,255,0.35)" />

      {/* arms gripping the gun */}
      <Path d="M3,-9 Q13,-7 19,-2" stroke={teamColor} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Path d="M3,9 Q13,7 19,2" stroke={teamColor} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Path d="M3,-9 Q13,-7 19,-2" stroke="rgba(0,0,0,0.18)" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d="M3,9 Q13,7 19,2" stroke="rgba(0,0,0,0.18)" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Circle cx={19} cy={-2} r={3} fill={skin} />
      <Circle cx={19} cy={2} r={3} fill={skin} />

      {/* head / helmet with team visor */}
      <Circle cx={4.5} cy={0} r={8.5} fill="#20252f" />
      <Circle cx={4.5} cy={0} r={8} fill="url(#helmetShade)" />
      <Path d="M9,-5 Q14,0 9,5 L7,4 Q11,0 7,-4 Z" fill={visor} fillOpacity={0.9} />
      <Circle cx={2} cy={-3} r={2.6} fill="rgba(255,255,255,0.5)" />

      {/* muzzle flash (placed at the actual barrel tip) */}
      {shooting && (
        <G transform={`translate(${muzzleX} 0)`}>
          <Circle cx={0} cy={0} r={11} fill="#fff7c2" fillOpacity={0.9} />
          <Circle cx={0} cy={0} r={6} fill="#fff" />
          <Polygon points="0,-11 6,0 0,11 20,0" fill="#ffd34d" fillOpacity={0.85} />
          <Polygon points="0,-5 26,0 0,5" fill="#fff3a0" />
        </G>
      )}

      {/* equipped bomb held in hand (raised, ready to throw) */}
      {holding && (
        <G transform="translate(16 -11)">
          <Circle cx={0} cy={0} r={11} fill={bombCol} fillOpacity={0.3} />
          <Circle cx={0} cy={0} r={6.5} fill={holding === 'frag' ? '#241008' : '#082630'} stroke={bombCol} strokeWidth={2} />
          <Circle cx={-2} cy={-2} r={2} fill="rgba(255,255,255,0.6)" />
          <Rect x={-1.4} y={-11} width={2.8} height={5} rx={1} fill={bombCol} />
        </G>
      )}
    </G>
  );
}

// ─── Main canvas ───────────────────────────────────────────────────────────────

export default function ArenaCanvas({
  self,
  opponent,
  projectiles,
  powerups,
  obstacles,
  dangerZone,
  grenades = [],
  detonation,
  hitFlash,
  aiming = false,
  bombAim,
  holdingBomb,
  viewportWidth,
  viewportHeight,
  worldSize = DEFAULT_WORLD_SIZE,
  selfLabel,
  oppLabel,
  selfName,
  oppName,
}: ArenaCanvasProps) {
  const GAME_SIZE = worldSize;
  const dispSelfRef = useRef<ArenaPlayerState | null>(self ? { ...self } : null);
  const dispOppRef = useRef<ArenaPlayerState | null>(opponent ? { ...opponent } : null);
  const targetSelfRef = useRef<ArenaPlayerState | null>(self);
  const targetOppRef = useRef<ArenaPlayerState | null>(opponent);
  const projRef = useRef<Map<string, DispProj>>(new Map());
  const camRef = useRef<{ x: number; y: number } | null>(null);
  const nowRef = useRef(0);
  const lastTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const targetZoomRef = useRef(1);
  const detsRef = useRef<{ type: 'frag' | 'cryo'; x: number; y: number; radius: number; start: number; token: number }[]>([]);
  // On-player hit sparks / damage numbers, and bomb burn/frost overlays.
  const hitsRef = useRef<{ targetId: number; dmg: number; start: number; dur: number; token: number }[]>([]);
  const burnsRef = useRef<{ targetId: number; type: 'frag' | 'cryo'; start: number; dur: number; token: string }[]>([]);
  const [, force] = useReducer((c: number) => (c + 1) % 1_000_000, 0);

  // Spawn an explosion VFX when a detonation arrives — and tag any player
  // caught in the blast so we paint burning / frost on them.
  useEffect(() => {
    if (!detonation) return;
    const start = nowRef.current || performance.now();
    detsRef.current.push({ type: detonation.type, x: detonation.x, y: detonation.y, radius: detonation.radius, start, token: detonation.token });
    const caught = (pl: ArenaPlayerState | null) => {
      if (!pl || !pl.alive) return;
      const d = dist(pl.x, pl.y, detonation.x, detonation.y);
      if (d <= detonation.radius) {
        burnsRef.current.push({
          targetId: pl.id,
          type: detonation.type,
          start,
          dur: detonation.type === 'frag' ? 950 : 750,
          token: `${detonation.token}-${pl.id}`,
        });
      }
    };
    caught(dispSelfRef.current);
    caught(dispOppRef.current);
  }, [detonation?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spawn an on-player hit spark + floating damage number on each damage event.
  useEffect(() => {
    if (!hitFlash) return;
    hitsRef.current.push({
      targetId: hitFlash.targetId,
      dmg: hitFlash.damage,
      start: nowRef.current || performance.now(),
      dur: 520,
      token: hitFlash.timestamp,
    });
  }, [hitFlash?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    targetSelfRef.current = self;
    if (!self) dispSelfRef.current = null;
    else if (dispSelfRef.current)
      dispSelfRef.current = {
        ...self,
        x: dispSelfRef.current.x,
        y: dispSelfRef.current.y,
        facingX: dispSelfRef.current.facingX,
        facingY: dispSelfRef.current.facingY,
      };
    else dispSelfRef.current = { ...self };
  }, [self]);

  useEffect(() => {
    targetOppRef.current = opponent;
    if (!opponent) dispOppRef.current = null;
    else if (dispOppRef.current)
      dispOppRef.current = {
        ...opponent,
        x: dispOppRef.current.x,
        y: dispOppRef.current.y,
        facingX: dispOppRef.current.facingX,
        facingY: dispOppRef.current.facingY,
      };
    else dispOppRef.current = { ...opponent };
  }, [opponent]);

  useEffect(() => {
    const map = projRef.current;
    const seen = new Set<string>();
    for (const p of projectiles) {
      seen.add(p.id);
      const ex = map.get(p.id);
      if (ex) {
        ex.x = p.x;
        ex.y = p.y;
        ex.vx = p.vx;
        ex.vy = p.vy;
        ex.weapon = p.weapon;
        ex.ownerId = p.ownerId;
      } else {
        map.set(p.id, { id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, weapon: p.weapon, ownerId: p.ownerId });
      }
    }
    for (const id of Array.from(map.keys())) if (!seen.has(id)) map.delete(id);
  }, [projectiles]);

  useEffect(() => {
    const loop = (ts: number) => {
      const last = lastTsRef.current || ts;
      let dt = (ts - last) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastTsRef.current = ts;
      nowRef.current = ts;

      // YOU follow the server tightly (snappy, responsive controls); the
      // OPPONENT is smoothed a bit more (you don't control them, so hide jitter).
      const SELF_LERP = 0.5;
      const OPP_LERP = 0.32;
      const SELF_FACE = 0.55;
      const OPP_FACE = 0.4;
      const ds = dispSelfRef.current;
      const tsf = targetSelfRef.current;
      if (ds && tsf) {
        ds.x += (tsf.x - ds.x) * SELF_LERP;
        ds.y += (tsf.y - ds.y) * SELF_LERP;
        ds.facingX += (tsf.facingX - ds.facingX) * SELF_FACE;
        ds.facingY += (tsf.facingY - ds.facingY) * SELF_FACE;
      }
      const dop = dispOppRef.current;
      const top = targetOppRef.current;
      if (dop && top) {
        dop.x += (top.x - dop.x) * OPP_LERP;
        dop.y += (top.y - dop.y) * OPP_LERP;
        dop.facingX += (top.facingX - dop.facingX) * OPP_FACE;
        dop.facingY += (top.facingY - dop.facingY) * OPP_FACE;
      }
      for (const p of projRef.current.values()) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      // smooth zoom toward target (aim/scope)
      zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.16;
      // prune finished explosion VFX (~700ms)
      if (detsRef.current.length > 0) {
        detsRef.current = detsRef.current.filter((d) => ts - d.start < 700);
      }
      if (hitsRef.current.length > 0) {
        hitsRef.current = hitsRef.current.filter((h) => ts - h.start < h.dur);
      }
      if (burnsRef.current.length > 0) {
        burnsRef.current = burnsRef.current.filter((b) => ts - b.start < b.dur);
      }
      force();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const ds = dispSelfRef.current;
  const dop = dispOppRef.current;
  const now = nowRef.current;

  // ── Camera (with aim/scope zoom) ──
  const vpW = Math.max(1, viewportWidth);
  const vpH = Math.max(1, viewportHeight);
  // While aiming, zoom in — much more for the sniper rail (scope).
  const aimZoom = aiming ? (ds?.weapon === 'rail' ? 1.7 : 1.25) : 1;
  targetZoomRef.current = ZOOM * aimZoom;
  if (zoomRef.current <= 1) zoomRef.current = ZOOM; // first-frame init
  const scaleCover = Math.max(vpW, vpH) / GAME_SIZE;
  const scale = scaleCover * zoomRef.current;
  const visibleW = vpW / scale;
  const visibleH = vpH / scale;

  const focus = ds ?? dop ?? { x: GAME_SIZE / 2, y: GAME_SIZE / 2 };
  let camX = clampN(focus.x - visibleW / 2, 0, Math.max(0, GAME_SIZE - visibleW));
  let camY = clampN(focus.y - visibleH / 2, 0, Math.max(0, GAME_SIZE - visibleH));
  // smooth the camera a touch
  if (!camRef.current) camRef.current = { x: camX, y: camY };
  camRef.current.x += (camX - camRef.current.x) * 0.55;
  camRef.current.y += (camY - camRef.current.y) * 0.55;
  camX = camRef.current.x;
  camY = camRef.current.y;

  const viewBox = `${camX} ${camY} ${visibleW} ${visibleH}`;

  // Static layer (floor + decals + border + obstacles)
  const staticLayer = useMemo(() => {
    const C = GAME_SIZE / 2;

    // Grid: fine 50u lines + bright 200u tech-panel seams.
    const gridLines: React.ReactElement[] = [];
    for (let i = 50; i < GAME_SIZE; i += 50) {
      const major = i % 200 === 0;
      gridLines.push(
        <Line key={`gv${i}`} x1={i} y1={0} x2={i} y2={GAME_SIZE} stroke={major ? '#26344e' : '#151b27'} strokeWidth={major ? 1.6 : 1} strokeOpacity={major ? 0.6 : 0.32} />,
      );
      gridLines.push(
        <Line key={`gh${i}`} x1={0} y1={i} x2={GAME_SIZE} y2={i} stroke={major ? '#26344e' : '#151b27'} strokeWidth={major ? 1.6 : 1} strokeOpacity={major ? 0.6 : 0.32} />,
      );
    }

    // Diagonal hazard stripes tucked into each corner.
    const hazard: React.ReactElement[] = [];
    const corners: [number, number, number, number][] = [
      [0, 0, 1, 1],
      [GAME_SIZE, 0, -1, 1],
      [0, GAME_SIZE, 1, -1],
      [GAME_SIZE, GAME_SIZE, -1, -1],
    ];
    corners.forEach(([cx, cy, sx, sy], ci) => {
      for (let k = 0; k < 4; k++) {
        const off = 16 + k * 17;
        hazard.push(
          <Line
            key={`hz${ci}-${k}`}
            x1={cx + sx * off}
            y1={cy}
            x2={cx}
            y2={cy + sy * off}
            stroke={k % 2 === 0 ? '#caa12a' : '#0b0d14'}
            strokeWidth={7}
            strokeOpacity={0.45}
          />,
        );
      }
    });

    // Corner targeting brackets (neon).
    const bracket = 64;
    const inset = 20;
    const brackets: React.ReactElement[] = corners.map(([cx, cy, sx, sy], ci) => (
      <Path
        key={`br${ci}`}
        d={`M ${cx + sx * inset},${cy + sy * (inset + bracket)} L ${cx + sx * inset},${cy + sy * inset} L ${cx + sx * (inset + bracket)},${cy + sy * inset}`}
        fill="none"
        stroke={SELF_COLOR}
        strokeWidth={3}
        strokeOpacity={0.5}
        strokeLinecap="round"
      />
    ));

    return (
      <G>
        {/* void outside the arena */}
        <Rect x={-2000} y={-2000} width={5000} height={5000} fill="#04050a" />
        {/* arena floor + center glow */}
        <Rect x={0} y={0} width={GAME_SIZE} height={GAME_SIZE} fill="#0b0d15" />
        <Rect x={0} y={0} width={GAME_SIZE} height={GAME_SIZE} fill="url(#floorGlow)" />
        {gridLines}
        {hazard}

        {/* center emblem */}
        <G>
          <Circle cx={C} cy={C} r={132} fill="none" stroke="#1f6f86" strokeWidth={2} strokeOpacity={0.3} />
          <Circle cx={C} cy={C} r={98} fill="none" stroke="#1f6f86" strokeWidth={1.5} strokeOpacity={0.28} strokeDasharray="6 12" />
          <Circle cx={C} cy={C} r={60} fill="url(#centerGlow)" />
          <G transform={`rotate(45 ${C} ${C})`}>
            <Rect x={C - 52} y={C - 52} width={104} height={104} rx={10} fill="none" stroke={SELF_COLOR} strokeWidth={2} strokeOpacity={0.3} />
          </G>
          <Line x1={C - 150} y1={C} x2={C - 104} y2={C} stroke={SELF_COLOR} strokeWidth={2} strokeOpacity={0.3} />
          <Line x1={C + 104} y1={C} x2={C + 150} y2={C} stroke={SELF_COLOR} strokeWidth={2} strokeOpacity={0.3} />
          <Line x1={C} y1={C - 150} x2={C} y2={C - 104} stroke={SELF_COLOR} strokeWidth={2} strokeOpacity={0.3} />
          <Line x1={C} y1={C + 104} x2={C} y2={C + 150} stroke={SELF_COLOR} strokeWidth={2} strokeOpacity={0.3} />
          <Circle cx={C} cy={C} r={5} fill={SELF_COLOR} fillOpacity={0.5} />
        </G>

        {brackets}

        {/* layered neon wall border */}
        <Rect x={4} y={4} width={GAME_SIZE - 8} height={GAME_SIZE - 8} fill="none" stroke="#090d16" strokeWidth={12} />
        <Rect x={6} y={6} width={GAME_SIZE - 12} height={GAME_SIZE - 12} fill="none" stroke="#33507a" strokeWidth={4} />
        <Rect x={6} y={6} width={GAME_SIZE - 12} height={GAME_SIZE - 12} fill="none" stroke={SELF_COLOR} strokeWidth={2} strokeOpacity={0.45} />

        {obstacles.map((o) => (
          <ExtrudedBlock key={o.id} obs={o} />
        ))}
      </G>
    );
  }, [obstacles, GAME_SIZE]);

  const dangerLayer = useMemo(() => {
    if (!dangerZone) return null;
    const dz = dangerZone;
    return (
      <G>
        <Rect x={0} y={0} width={GAME_SIZE} height={dz.minY} fill="url(#dangerGrad)" />
        <Rect x={0} y={dz.maxY} width={GAME_SIZE} height={GAME_SIZE - dz.maxY} fill="url(#dangerGrad)" />
        <Rect x={0} y={dz.minY} width={dz.minX} height={dz.maxY - dz.minY} fill="url(#dangerGrad)" />
        <Rect x={dz.maxX} y={dz.minY} width={GAME_SIZE - dz.maxX} height={dz.maxY - dz.minY} fill="url(#dangerGrad)" />
        <Rect
          x={dz.minX}
          y={dz.minY}
          width={dz.maxX - dz.minX}
          height={dz.maxY - dz.minY}
          fill="none"
          stroke="#ff3b3b"
          strokeWidth={5}
          strokeOpacity={0.9}
          strokeDasharray="20 14"
        />
      </G>
    );
  }, [dangerZone, GAME_SIZE]);

  const projList = Array.from(projRef.current.values());
  const selfShooting = !!ds && projList.some((p) => p.ownerId === ds.id && dist(p.x, p.y, ds.x, ds.y) < 80);
  const oppShooting = !!dop && projList.some((p) => p.ownerId === dop.id && dist(p.x, p.y, dop.x, dop.y) < 80);

  const renderExtras = (p: ArenaPlayerState | null, teamColor: string, name?: string | null, label?: string | null) => {
    if (!p || !p.alive) return null;
    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const barW = 44;
    const hpCol = ratio > 0.6 ? '#22c55e' : ratio > 0.3 ? '#f59e0b' : '#ef4444';
    const barY = p.y - 36;
    // Nameplate: prefer the Vorld actor label, else the username.
    const plate = (label || name || '').toString().slice(0, 14).toUpperCase();
    const chipW = Math.max(barW + 2, plate.length * 7.2 + 14);
    return (
      <G key={`extra-${p.id}`}>
        <Ellipse cx={p.x + 5} cy={p.y + 10} rx={18} ry={10} fill="rgba(0,0,0,0.5)" />
        {plate ? (
          <G>
            <Rect
              x={p.x - chipW / 2}
              y={barY - 19}
              width={chipW}
              height={14}
              rx={4}
              fill="rgba(6,8,14,0.82)"
              stroke={teamColor}
              strokeWidth={1.2}
              strokeOpacity={0.7}
            />
            <SvgText
              x={p.x}
              y={barY - 9}
              fontSize={9}
              fontWeight="bold"
              fill={teamColor}
              textAnchor="middle"
              letterSpacing={0.6}
            >
              {plate}
            </SvgText>
          </G>
        ) : null}
        <Rect x={p.x - barW / 2 - 1} y={barY} width={barW + 2} height={7} rx={3.5} fill="rgba(0,0,0,0.78)" />
        <Rect x={p.x - barW / 2} y={barY + 1} width={barW * ratio} height={5} rx={2.5} fill={hpCol} />
        <Rect x={p.x - barW / 2} y={barY + 1} width={barW * ratio} height={2} rx={1} fill="rgba(255,255,255,0.3)" />
      </G>
    );
  };

  // Off-screen opponent indicator (in world coords, clamped to the visible window edge)
  let oppArrow: React.ReactElement | null = null;
  if (dop && dop.alive && ds) {
    const margin = 46;
    const minVX = camX + margin;
    const maxVX = camX + visibleW - margin;
    const minVY = camY + margin;
    const maxVY = camY + visibleH - margin;
    const onScreen = dop.x >= minVX && dop.x <= maxVX && dop.y >= minVY && dop.y <= maxVY;
    if (!onScreen) {
      const ax = clampN(dop.x, minVX, maxVX);
      const ay = clampN(dop.y, minVY, maxVY);
      const ang = (Math.atan2(dop.y - ay, dop.x - ax) * 180) / Math.PI;
      oppArrow = (
        <G transform={`translate(${ax} ${ay}) rotate(${ang})`}>
          <Circle cx={0} cy={0} r={20} fill={OPP_COLOR} fillOpacity={0.18} />
          <Polygon points="18,0 -8,-12 -2,0 -8,12" fill={OPP_COLOR} />
        </G>
      );
    }
  }

  // Gun aim line + crosshair reticle (when the aim stick is active)
  let aimLine: React.ReactElement | null = null;
  if (ds && ds.alive && aiming) {
    const isRail = ds.weapon === 'rail';
    const len = isRail ? GAME_SIZE : 280;
    const col = isRail ? '#c084fc' : '#19f0ff';
    // reticle sits at mid-range along the aim so the player can read the lead
    const rDist = isRail ? Math.min(len, 360) : 220;
    const rx = ds.x + ds.facingX * rDist;
    const ry = ds.y + ds.facingY * rDist;
    const rr = isRail ? 13 : 11;
    aimLine = (
      <G>
        <Line
          x1={ds.x + ds.facingX * 20}
          y1={ds.y + ds.facingY * 20}
          x2={ds.x + ds.facingX * len}
          y2={ds.y + ds.facingY * len}
          stroke={col}
          strokeWidth={isRail ? 2.5 : 2}
          strokeOpacity={isRail ? 0.55 : 0.42}
          strokeDasharray={isRail ? '2 9' : '5 9'}
          strokeLinecap="round"
        />
        <Circle cx={rx} cy={ry} r={rr} fill="none" stroke={col} strokeWidth={2} strokeOpacity={0.85} />
        <Line x1={rx - rr - 5} y1={ry} x2={rx - rr + 2} y2={ry} stroke={col} strokeWidth={2} strokeOpacity={0.85} />
        <Line x1={rx + rr - 2} y1={ry} x2={rx + rr + 5} y2={ry} stroke={col} strokeWidth={2} strokeOpacity={0.85} />
        <Line x1={rx} y1={ry - rr - 5} x2={rx} y2={ry - rr + 2} stroke={col} strokeWidth={2} strokeOpacity={0.85} />
        <Line x1={rx} y1={ry + rr - 2} x2={rx} y2={ry + rr + 5} stroke={col} strokeWidth={2} strokeOpacity={0.85} />
        <Circle cx={rx} cy={ry} r={2.2} fill={col} />
      </G>
    );
  }

  // Bomb throw aim — lobbed trajectory (bowed dotted arc) + landing blast + crosshair.
  // When not dragged yet, preview straight ahead along the current facing.
  let bombOverlay: React.ReactElement | null = null;
  if (ds && ds.alive && bombAim) {
    let dx = bombAim.dirX;
    let dy = bombAim.dirY;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag < 0.001) {
      dx = ds.facingX;
      dy = ds.facingY;
    } else {
      dx /= mag;
      dy /= mag;
    }
    // Matches the server throw model: grenade spawns ~21u in front, then travels
    // (MIN_THROW 150 + power*1500) * ~0.236 friction factor at 30Hz. So it lands
    // ~56u away (close, near your feet) up to ~410u (far across the arena).
    const dist = 56 + clampN(bombAim.power, 0, 1) * 354;
    const sx = ds.x;
    const sy = ds.y;
    const lx = sx + dx * dist;
    const ly = sy + dy * dist;
    const col = bombAim.type === 'frag' ? '#ff5530' : '#7dd3fc';
    const blastR = bombAim.type === 'frag' ? 135 : 150;
    // perpendicular used to "bow" the path so it reads as a thrown lob
    const px = -dy;
    const py = dx;
    const bowMax = Math.min(46, dist * 0.2);
    const N = 7;
    const dots: React.ReactElement[] = [];
    for (let i = 1; i <= N; i++) {
      const t = i / (N + 1);
      const bow = Math.sin(t * Math.PI) * bowMax;
      const x = sx + (lx - sx) * t + px * bow;
      const y = sy + (ly - sy) * t + py * bow;
      dots.push(<Circle key={`bd${i}`} cx={x} cy={y} r={3 + t * 1.6} fill={col} fillOpacity={0.45 + 0.45 * t} />);
    }
    bombOverlay = (
      <G>
        {dots}
        <Circle cx={lx} cy={ly} r={blastR} fill={col} fillOpacity={0.13} />
        <Circle cx={lx} cy={ly} r={blastR} fill="none" stroke={col} strokeWidth={2.5} strokeOpacity={0.8} strokeDasharray="10 8" />
        {/* landing crosshair */}
        <Circle cx={lx} cy={ly} r={15} fill="none" stroke={col} strokeWidth={2.5} strokeOpacity={0.95} />
        <Line x1={lx - 22} y1={ly} x2={lx - 9} y2={ly} stroke={col} strokeWidth={2.5} />
        <Line x1={lx + 9} y1={ly} x2={lx + 22} y2={ly} stroke={col} strokeWidth={2.5} />
        <Line x1={lx} y1={ly - 22} x2={lx} y2={ly - 9} stroke={col} strokeWidth={2.5} />
        <Line x1={lx} y1={ly + 9} x2={lx} y2={ly + 22} stroke={col} strokeWidth={2.5} />
        <Circle cx={lx} cy={ly} r={3.5} fill={col} />
      </G>
    );
  }

  // Lock-on reticle: when you're aiming and the gun is pointed at the opponent,
  // bracket them so you know you've got the shot lined up.
  let aimLock: React.ReactElement | null = null;
  if (aiming && ds && ds.alive && dop && dop.alive) {
    const tx = dop.x - ds.x;
    const ty = dop.y - ds.y;
    const aimAng = Math.atan2(ds.facingY, ds.facingX);
    const oppAng = Math.atan2(ty, tx);
    let diff = oppAng - aimAng;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.26) {
      const s = 21;
      const k = 8; // bracket arm length
      const lc = '#ff3b3b';
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 170));
      const cx = dop.x;
      const cy = dop.y;
      aimLock = (
        <G opacity={pulse}>
          {/* four corner brackets */}
          <Path d={`M ${cx - s},${cy - s + k} L ${cx - s},${cy - s} L ${cx - s + k},${cy - s}`} fill="none" stroke={lc} strokeWidth={2.5} strokeLinecap="round" />
          <Path d={`M ${cx + s - k},${cy - s} L ${cx + s},${cy - s} L ${cx + s},${cy - s + k}`} fill="none" stroke={lc} strokeWidth={2.5} strokeLinecap="round" />
          <Path d={`M ${cx - s},${cy + s - k} L ${cx - s},${cy + s} L ${cx - s + k},${cy + s}`} fill="none" stroke={lc} strokeWidth={2.5} strokeLinecap="round" />
          <Path d={`M ${cx + s - k},${cy + s} L ${cx + s},${cy + s} L ${cx + s},${cy + s - k}`} fill="none" stroke={lc} strokeWidth={2.5} strokeLinecap="round" />
          <SvgText x={cx} y={cy - s - 7} fontSize={9} fontWeight="bold" fill={lc} stroke="#000" strokeWidth={0.5} textAnchor="middle" letterSpacing={1}>
            LOCK
          </SvgText>
        </G>
      );
    }
  }

  return (
    <View style={[styles.wrap, { width: vpW, height: vpH }]}>
      <Svg width={vpW} height={vpH} viewBox={viewBox}>
        <Defs>
          <RadialGradient id="floorGlow" cx="50%" cy="42%" r="75%">
            <Stop offset="0%" stopColor="#1c2436" stopOpacity={1} />
            <Stop offset="62%" stopColor="#0c0e16" stopOpacity={1} />
            <Stop offset="100%" stopColor="#06070d" stopOpacity={1} />
          </RadialGradient>
          <RadialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={SELF_COLOR} stopOpacity={0.12} />
            <Stop offset="100%" stopColor={SELF_COLOR} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="selfHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={SELF_COLOR} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={SELF_COLOR} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="oppHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={OPP_COLOR} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={OPP_COLOR} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bodyShade" cx="38%" cy="30%" r="78%">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
            <Stop offset="55%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.45} />
          </RadialGradient>
          <RadialGradient id="helmetShade" cx="34%" cy="28%" r="82%">
            <Stop offset="0%" stopColor="#69768f" stopOpacity={1} />
            <Stop offset="100%" stopColor="#1a1f2b" stopOpacity={1} />
          </RadialGradient>
          <LinearGradient id="metalTop" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#3f4d6c" />
            <Stop offset="100%" stopColor="#222a3f" />
          </LinearGradient>
          <LinearGradient id="gunShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.28} />
            <Stop offset="45%" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.4} />
          </LinearGradient>
          <LinearGradient id="woodTop" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#a76c39" />
            <Stop offset="100%" stopColor="#6e4423" />
          </LinearGradient>
          <LinearGradient id="dangerGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#ff1f1f" stopOpacity={0.3} />
            <Stop offset="100%" stopColor="#7a0000" stopOpacity={0.36} />
          </LinearGradient>
        </Defs>

        {staticLayer}
        {dangerLayer}

        {/* powerups */}
        {powerups.map((pw) => {
          const color = POWERUP_COLORS[pw.type] ?? '#fff';
          const bob = Math.sin(now / 350 + pw.x) * 5;
          const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now / 400));
          return (
            <G key={pw.id} transform={`translate(${pw.x} ${pw.y + bob})`}>
              <Ellipse cx={0} cy={16 - bob} rx={13} ry={6} fill="rgba(0,0,0,0.45)" />
              <Circle cx={0} cy={0} r={22} fill={color} fillOpacity={0.22 * pulse} />
              <Circle cx={0} cy={0} r={13} fill={color} />
              <Circle cx={-3.5} cy={-3.5} r={5} fill="rgba(255,255,255,0.5)" />
              <SvgText x={0} y={5} fontSize={12} fontWeight="bold" fill="#fff" textAnchor="middle">
                {POWERUP_LABELS[pw.type] ?? '?'}
              </SvgText>
            </G>
          );
        })}

        {/* projectiles */}
        {projList.map((p) => {
          const color = PROJECTILE_COLORS[p.weapon] ?? '#FFE600';
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
          const isBig = BIG_PROJECTILES.has(p.weapon);
          const trailLen = p.weapon === 'rail' ? 48 : isBig ? 34 : 26;
          const tx = p.x - (p.vx / speed) * trailLen;
          const ty = p.y - (p.vy / speed) * trailLen;
          const core = isBig ? 5 : 3;
          const glow = isBig ? 12 : 7;
          return (
            <G key={p.id}>
              <Line x1={tx} y1={ty} x2={p.x} y2={p.y} stroke={color} strokeWidth={isBig ? 7 : 4} strokeOpacity={0.32} strokeLinecap="round" />
              <Circle cx={p.x} cy={p.y} r={glow} fill={color} fillOpacity={0.3} />
              <Circle cx={p.x} cy={p.y} r={core} fill="#ffffff" />
              <Circle cx={p.x} cy={p.y} r={core * 0.55} fill={color} />
            </G>
          );
        })}

        {/* grenades (ticking) */}
        {grenades.map((g) => {
          const isFrag = g.type === 'frag';
          const col = isFrag ? '#ff5530' : '#7dd3fc';
          const secs = Math.max(1, Math.ceil(g.fuseMs / 1000));
          const fast = g.fuseMs < 550;
          const visible = fast ? Math.floor(now / 110) % 2 === 0 : true;
          const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 150));
          return (
            <G key={g.id} transform={`translate(${g.x} ${g.y})`}>
              <Ellipse cx={0} cy={9} rx={9} ry={4} fill="rgba(0,0,0,0.45)" />
              {visible && <Circle cx={0} cy={0} r={16} fill={col} fillOpacity={0.28 * pulse} />}
              <Circle cx={0} cy={0} r={8} fill={isFrag ? '#1c140f' : '#0b2a33'} stroke={col} strokeWidth={2} />
              <Circle cx={-2.5} cy={-2.5} r={2.4} fill="rgba(255,255,255,0.5)" />
              <SvgText x={0} y={-13} fontSize={13} fontWeight="bold" fill={col} stroke="#000" strokeWidth={0.6} textAnchor="middle">
                {secs}
              </SvgText>
            </G>
          );
        })}

        {/* aim overlays (under soldiers) */}
        {aimLine}
        {bombOverlay}

        {/* shadows + hp bars + nameplates */}
        {renderExtras(dop, OPP_COLOR, oppName, oppLabel)}
        {renderExtras(ds, SELF_COLOR, selfName, selfLabel)}

        {/* soldiers */}
        {dop && dop.alive && <Soldier p={dop} teamColor={OPP_COLOR} shooting={oppShooting} />}
        {ds && ds.alive && <Soldier p={ds} teamColor={SELF_COLOR} shooting={selfShooting} holding={holdingBomb} />}

        {/* explosion VFX */}
        {detsRef.current.map((d) => {
          const e = Math.min(1, (now - d.start) / 700);
          const isFrag = d.type === 'frag';
          const ringCol = isFrag ? '#ff6a2b' : '#7dd3fc';
          const coreCol = isFrag ? '#fff3a0' : '#e6fbff';
          const r = d.radius * (0.28 + 0.72 * e);
          const op = 1 - e;
          return (
            <G key={d.token}>
              <Circle cx={d.x} cy={d.y} r={r} fill={ringCol} fillOpacity={0.16 * op} />
              <Circle cx={d.x} cy={d.y} r={r} fill="none" stroke={ringCol} strokeWidth={5} strokeOpacity={0.85 * op} />
              <Circle cx={d.x} cy={d.y} r={d.radius * 0.3 * (1 - e)} fill={coreCol} fillOpacity={op} />
              {isFrag &&
                [0, 60, 120, 180, 240, 300].map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  const pr = r * 0.9;
                  return (
                    <Circle
                      key={deg}
                      cx={d.x + Math.cos(rad) * pr}
                      cy={d.y + Math.sin(rad) * pr}
                      r={4 * op}
                      fill="#ffb347"
                      fillOpacity={op}
                    />
                  );
                })}
            </G>
          );
        })}

        {/* bomb burn / frost clinging to caught players */}
        {burnsRef.current.map((b) => {
          const tp = ds && b.targetId === ds.id ? ds : dop && b.targetId === dop.id ? dop : null;
          if (!tp) return null;
          const age = (now - b.start) / b.dur;
          if (age >= 1) return null;
          const op = 1 - age;
          if (b.type === 'frag') {
            return (
              <G key={b.token}>
                <Circle cx={tp.x} cy={tp.y} r={22} fill="#ff5530" fillOpacity={0.2 * op} />
                {[-11, -4, 4, 11].map((ox, i) => {
                  const fl = 9 + Math.abs(Math.sin(now / 85 + i * 1.7)) * 12;
                  return (
                    <Polygon
                      key={i}
                      points={`${tp.x + ox - 5},${tp.y + 7} ${tp.x + ox},${tp.y + 7 - fl} ${tp.x + ox + 5},${tp.y + 7}`}
                      fill={i % 2 ? '#ff8a3b' : '#ffd34d'}
                      fillOpacity={0.85 * op}
                    />
                  );
                })}
              </G>
            );
          }
          return (
            <G key={b.token}>
              <Circle cx={tp.x} cy={tp.y} r={23} fill="#7dd3fc" fillOpacity={0.22 * op} />
              <Circle cx={tp.x} cy={tp.y} r={25} fill="none" stroke="#bae6fd" strokeWidth={2.5} strokeOpacity={0.85 * op} strokeDasharray="3 4" />
            </G>
          );
        })}

        {/* lock-on bracket on the opponent */}
        {aimLock}

        {/* on-player hit sparks + floating damage numbers */}
        {hitsRef.current.map((h) => {
          const tp = ds && h.targetId === ds.id ? ds : dop && h.targetId === dop.id ? dop : null;
          if (!tp) return null;
          const age = (now - h.start) / h.dur;
          if (age >= 1) return null;
          const op = 1 - age;
          const isSelf = !!ds && tp.id === ds.id;
          const sparkCol = isSelf ? '#ff5b5b' : '#ffd34d';
          return (
            <G key={h.token}>
              {/* white impact flash (very brief) */}
              {age < 0.32 && <Circle cx={tp.x} cy={tp.y} r={17} fill="#ffffff" fillOpacity={0.55 * (1 - age / 0.32)} />}
              {/* radial sparks */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const r0 = 11;
                const r1 = 11 + 24 * age;
                return (
                  <Line
                    key={deg}
                    x1={tp.x + Math.cos(rad) * r0}
                    y1={tp.y + Math.sin(rad) * r0}
                    x2={tp.x + Math.cos(rad) * r1}
                    y2={tp.y + Math.sin(rad) * r1}
                    stroke={sparkCol}
                    strokeWidth={2.6 * op}
                    strokeOpacity={op}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* hit marker (4 diagonal ticks) */}
              {age < 0.4 &&
                [
                  [-1, -1],
                  [1, -1],
                  [-1, 1],
                  [1, 1],
                ].map(([sx, sy], i) => (
                  <Line
                    key={`m${i}`}
                    x1={tp.x + sx * 6}
                    y1={tp.y + sy * 6}
                    x2={tp.x + sx * 12}
                    y2={tp.y + sy * 12}
                    stroke="#ffffff"
                    strokeWidth={2.4 * (1 - age / 0.4)}
                    strokeOpacity={1 - age / 0.4}
                    strokeLinecap="round"
                  />
                ))}
              {/* floating damage number */}
              <SvgText
                x={tp.x + 16}
                y={tp.y - 26 - age * 30}
                fontSize={15}
                fontWeight="bold"
                fill={sparkCol}
                stroke="#000"
                strokeWidth={0.7}
                textAnchor="middle"
                opacity={op}
              >
                -{h.dmg}
              </SvgText>
            </G>
          );
        })}

        {/* off-screen opponent marker */}
        {oppArrow}
      </Svg>

      {/* cinematic vignette (screen space) */}
      <Svg width={vpW} height={vpH} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="vignette" cx="50%" cy="50%" r="72%">
            <Stop offset="55%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.6} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={vpW} height={vpH} fill="url(#vignette)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#040507',
  },
});
