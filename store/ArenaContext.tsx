import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  connectArenaSocket,
  disconnectArenaSocket,
  onArenaSocketMessage,
  onArenaSocketStatus,
  arenaJoinQueue,
  arenaCancelQueue,
  arenaInput,
  arenaLeave,
  arenaUseItem,
  arenaThrowBomb,
  arenaSwitchGun,
  type ArenaLoadout,
  type ArenaSocketStatus,
  type ArenaSocketEnvelope,
} from '../websockets/arenaSocket';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ArenaPhase = 'idle' | 'matchmaking' | 'countdown' | 'active' | 'finished';

export interface ArenaPlayerState {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  weapon: string;
  ammo: number;
  shield: number;
  speedBoosted: boolean;
  invulnerable: boolean;
  frozen?: boolean;
  disarmed?: boolean;
  alive: boolean;
  facingX: number;
  facingY: number;
  kills: number;
}

export interface ArenaProjectileState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: string;
  ownerId: number;
}

export interface ArenaPowerupState {
  id: string;
  type: 'shotgun' | 'rocket' | 'shield' | 'speed' | 'health';
  x: number;
  y: number;
}

export interface ArenaGrenadeState {
  id: string;
  type: 'frag' | 'cryo';
  x: number;
  y: number;
  fuseMs: number;
}

export interface ArenaDetonation {
  type: 'frag' | 'cryo';
  x: number;
  y: number;
  radius: number;
  token: number;
}

export interface ArenaObstacleState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  destructible: boolean;
  hp: number;
}

export interface ArenaDangerZone {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ArenaItemEvent {
  itemId: string;
  itemName: string;
  kind: 'buff' | 'sabotage';
  targetActorName: string;
  targetPlayerNumber: number;
  targetPlayerId: number;
  token: number;
}

export interface ArenaResult {
  result: 'win' | 'lose' | 'draw';
  reason: string;
  yourHp: number;
  opponentHp: number;
  yourKills: number;
  opponentKills: number;
  pointsAwarded: number;
  entryCost?: number;
  itemsUsed?: Record<string, number>;
  itemsRemaining?: Record<string, number>;
  newArenaRating: number | null;
  arenaRatingDelta: number | null;
  durationMs: number;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  pillars: ArenaObstacleState[];
  crates: ArenaObstacleState[];
  powerupSpots: { x: number; y: number }[];
}

interface ArenaState {
  phase: ArenaPhase;
  socketStatus: ArenaSocketStatus;
  gameId: number | null;
  mapData: MapData | null;
  self: ArenaPlayerState | null;
  opponent: ArenaPlayerState | null;
  playerName: string | null;
  opponentName: string | null;
  opponentRating: number | null;
  playerRating: number | null;
  playerNumber: number | null;
  projectiles: ArenaProjectileState[];
  powerups: ArenaPowerupState[];
  grenades: ArenaGrenadeState[];
  obstacles: ArenaObstacleState[];
  dangerZone: ArenaDangerZone | null;
  timeRemainingMs: number;
  countdownSec: number;
  detonation: ArenaDetonation | null;
  result: ArenaResult | null;
  toast: string | null;
  hitFlash: { targetId: number; damage: number; timestamp: number } | null;
  itemEvent: ArenaItemEvent | null;
  /** This player's remaining consumable item counts for the current match. */
  items: Record<string, number>;
  equippedGun: string | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type ArenaAction =
  | { type: 'SET_STATUS'; status: ArenaSocketStatus }
  | { type: 'SET_MATCHMAKING' }
  | { type: 'MATCH_FOUND'; payload: Record<string, unknown> }
  | { type: 'COUNTDOWN'; countdownSec: number }
  | { type: 'GAME_STATE'; payload: Record<string, unknown> }
  | { type: 'GAME_OVER'; payload: Record<string, unknown> }
  | { type: 'HIT'; payload: Record<string, unknown> }
  | { type: 'MATCH_NOT_FOUND'; message: string }
  | { type: 'PLAYER_DISCONNECTED' }
  | { type: 'PLAYER_RECONNECTED' }
  | { type: 'SEARCH_CANCELLED' }
  | { type: 'CLEAR_TOAST' }
  | { type: 'ITEM_APPLIED'; payload: Record<string, unknown> }
  | { type: 'ITEM_COUNTS'; items: Record<string, number> }
  | { type: 'DETONATION'; payload: Record<string, unknown> }
  | { type: 'CLEAR_ITEM_EVENT' }
  | { type: 'RESET' };

const initialState: ArenaState = {
  phase: 'idle',
  socketStatus: 'idle',
  gameId: null,
  mapData: null,
  self: null,
  opponent: null,
  playerName: null,
  opponentName: null,
  opponentRating: null,
  playerRating: null,
  playerNumber: null,
  projectiles: [],
  powerups: [],
  grenades: [],
  obstacles: [],
  dangerZone: null,
  timeRemainingMs: 90_000,
  countdownSec: 3,
  detonation: null,
  result: null,
  toast: null,
  hitFlash: null,
  itemEvent: null,
  items: {},
  equippedGun: null,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function arenaReducer(state: ArenaState, action: ArenaAction): ArenaState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, socketStatus: action.status };

    case 'SET_MATCHMAKING':
      return { ...state, phase: 'matchmaking' };

    case 'MATCH_FOUND': {
      const p = action.payload as {
        gameId: number;
        mapData: Record<string, unknown>;
        playerNumber: number;
        yourName?: string;
        opponentName?: string;
        opponentRating?: number;
        yourRating?: number;
        reconnect?: boolean;
        currentState?: Record<string, unknown>;
        items?: Record<string, number>;
        equippedGun?: string | null;
      };

      const rawMap = p.mapData as {
        id: string;
        name: string;
        width: number;
        height: number;
        pillars: ArenaObstacleState[];
        crates: ArenaObstacleState[];
        powerupSpots: { x: number; y: number }[];
      };

      const mapData: MapData = {
        id: rawMap.id,
        name: rawMap.name,
        width: rawMap.width,
        height: rawMap.height,
        pillars: rawMap.pillars?.map((o) => ({
          id: o.id,
          x: o.x ?? 0,
          y: o.y ?? 0,
          w: o.w ?? 60,
          h: o.h ?? 60,
          destructible: false,
          hp: -1,
        })) ?? [],
        crates: rawMap.crates?.map((o) => ({
          id: o.id,
          x: o.x ?? 0,
          y: o.y ?? 0,
          w: o.w ?? 50,
          h: o.h ?? 50,
          destructible: true,
          hp: o.hp ?? 3,
        })) ?? [],
        powerupSpots: rawMap.powerupSpots ?? [],
      };

      const newState: ArenaState = {
        ...state,
        phase: p.reconnect ? 'active' : 'countdown',
        gameId: p.gameId,
        mapData,
        playerName: p.yourName ?? null,
        opponentName: p.opponentName ?? null,
        opponentRating: p.opponentRating ?? null,
        playerRating: p.yourRating ?? null,
        playerNumber: p.playerNumber,
        countdownSec: 3,
        items: p.items ?? {},
        equippedGun: p.equippedGun ?? state.equippedGun,
      };

      if (p.reconnect && p.currentState) {
        const cs = p.currentState as {
          self: ArenaPlayerState;
          opponent: ArenaPlayerState;
          projectiles: ArenaProjectileState[];
          powerups: ArenaPowerupState[];
          obstacles: ArenaObstacleState[];
          dangerZone: ArenaDangerZone | null;
          timeRemainingMs: number;
          status: string;
          countdownSec: number;
        };
        newState.self = cs.self;
        newState.opponent = cs.opponent;
        newState.projectiles = cs.projectiles;
        newState.powerups = cs.powerups;
        newState.obstacles = cs.obstacles;
        newState.dangerZone = cs.dangerZone;
        newState.timeRemainingMs = cs.timeRemainingMs;
        newState.grenades = (cs as { grenades?: ArenaGrenadeState[] }).grenades ?? [];
        newState.phase = cs.status === 'active' ? 'active' : cs.status === 'countdown' ? 'countdown' : 'active';
      }

      return newState;
    }

    case 'COUNTDOWN':
      return {
        ...state,
        countdownSec: action.countdownSec,
        phase: action.countdownSec <= 0 ? 'active' : 'countdown',
      };

    case 'GAME_STATE': {
      const p = action.payload as {
        self: ArenaPlayerState;
        opponent: ArenaPlayerState;
        projectiles: ArenaProjectileState[];
        powerups: ArenaPowerupState[];
        grenades?: ArenaGrenadeState[];
        obstacles: ArenaObstacleState[];
        dangerZone: ArenaDangerZone | null;
        timeRemainingMs: number;
        status: string;
        countdownSec: number;
      };
      return {
        ...state,
        phase: p.status === 'active' ? 'active' : p.status === 'countdown' ? 'countdown' : state.phase,
        self: p.self,
        opponent: p.opponent,
        projectiles: p.projectiles,
        powerups: p.powerups,
        grenades: p.grenades ?? [],
        obstacles: p.obstacles,
        dangerZone: p.dangerZone,
        timeRemainingMs: p.timeRemainingMs,
      };
    }

    case 'DETONATION': {
      const p = action.payload as { grenadeType: 'frag' | 'cryo'; x: number; y: number; radius: number };
      return {
        ...state,
        detonation: { type: p.grenadeType, x: p.x, y: p.y, radius: p.radius, token: Date.now() + Math.random() },
      };
    }

    case 'GAME_OVER': {
      const p = action.payload as unknown as ArenaResult;
      return {
        ...state,
        phase: 'finished',
        result: p,
      };
    }

    case 'HIT': {
      const p = action.payload as { targetId: number; damage: number };
      return {
        ...state,
        hitFlash: { targetId: p.targetId, damage: p.damage, timestamp: Date.now() },
      };
    }

    case 'MATCH_NOT_FOUND':
      return { ...state, phase: 'idle', toast: action.message };

    case 'PLAYER_DISCONNECTED':
      return { ...state, toast: 'Opponent disconnected...' };

    case 'PLAYER_RECONNECTED':
      return { ...state, toast: null };

    case 'SEARCH_CANCELLED':
      return { ...state, phase: 'idle' };

    case 'CLEAR_TOAST':
      return { ...state, toast: null };

    case 'ITEM_APPLIED': {
      const p = action.payload as {
        itemId: string;
        itemName: string;
        kind: 'buff' | 'sabotage';
        targetActorName: string;
        targetPlayerNumber: number;
        targetPlayerId: number;
      };
      return {
        ...state,
        itemEvent: {
          itemId: p.itemId,
          itemName: p.itemName,
          kind: p.kind,
          targetActorName: p.targetActorName,
          targetPlayerNumber: p.targetPlayerNumber,
          targetPlayerId: p.targetPlayerId,
          token: Date.now(),
        },
      };
    }

    case 'ITEM_COUNTS':
      return { ...state, items: action.items };

    case 'CLEAR_ITEM_EVENT':
      return { ...state, itemEvent: null };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ArenaContextValue {
  arena: ArenaState;
  joinArenaQueue: (loadout?: ArenaLoadout) => Promise<void>;
  cancelArenaQueue: () => void;
  sendInput: (dx: number, dy: number, shoot: boolean, aimX?: number, aimY?: number) => void;
  useItem: (itemId: string) => void;
  throwBomb: (itemId: string, dirX: number, dirY: number, power: number) => void;
  switchGun: (gunId: string) => void;
  leaveArena: () => void;
  resetArena: () => void;
  clearToast: () => void;
  clearItemEvent: () => void;
}

const ArenaContext = createContext<ArenaContextValue | null>(null);

export function ArenaProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(arenaReducer, initialState);

  // Track the latest phase for use inside the (once-registered) socket handlers.
  const phaseRef = useRef<ArenaPhase>(state.phase);
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // Remember the loadout we joined with so a reconnect re-join keeps it.
  const loadoutRef = useRef<ArenaLoadout>({ equippedGun: null, items: {} });

  useEffect(() => {
    const unsubStatus = onArenaSocketStatus((status) => {
      dispatch({ type: 'SET_STATUS', status });
      // If the socket re-opens while we're still searching, re-enter the queue.
      // (A transient drop removes us from the server queue + refunds; rejoining
      //  re-charges, so the net fee is unchanged.)
      if (status === 'open' && phaseRef.current === 'matchmaking') {
        arenaJoinQueue(loadoutRef.current);
      }
    });

    const unsubMsg = onArenaSocketMessage((msg: ArenaSocketEnvelope) => {
      switch (msg.type) {
        case 'arena_match_found':
          dispatch({ type: 'MATCH_FOUND', payload: msg.payload as Record<string, unknown> });
          break;
        case 'arena_countdown': {
          const p = msg.payload as { secondsRemaining: number };
          dispatch({ type: 'COUNTDOWN', countdownSec: p.secondsRemaining });
          break;
        }
        case 'arena_game_state':
          dispatch({ type: 'GAME_STATE', payload: msg.payload as Record<string, unknown> });
          break;
        case 'arena_game_over':
          dispatch({ type: 'GAME_OVER', payload: msg.payload as Record<string, unknown> });
          break;
        case 'arena_hit':
          dispatch({ type: 'HIT', payload: msg.payload as Record<string, unknown> });
          break;
        case 'arena_match_not_found': {
          const p = msg.payload as { message?: string };
          dispatch({ type: 'MATCH_NOT_FOUND', message: p.message ?? 'No opponent found' });
          break;
        }
        case 'arena_already_in_queue':
          // We're already queued (e.g. after a reconnect re-join) — that's the
          // desired state, so keep searching instead of bouncing the user out.
          break;
        case 'arena_player_disconnected':
          dispatch({ type: 'PLAYER_DISCONNECTED' });
          break;
        case 'arena_player_reconnected':
          dispatch({ type: 'PLAYER_RECONNECTED' });
          break;
        case 'arena_search_cancelled':
          dispatch({ type: 'SEARCH_CANCELLED' });
          break;
        case 'arena_item_applied':
          dispatch({ type: 'ITEM_APPLIED', payload: msg.payload as Record<string, unknown> });
          break;
        case 'arena_item_counts': {
          const p = msg.payload as { items?: Record<string, number> };
          dispatch({ type: 'ITEM_COUNTS', items: p.items ?? {} });
          break;
        }
        case 'arena_bomb_detonate':
          dispatch({ type: 'DETONATION', payload: msg.payload as Record<string, unknown> });
          break;
      }
    });

    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, []);

  const joinArenaQueueCb = useCallback(async (loadout?: ArenaLoadout) => {
    loadoutRef.current = loadout ?? { equippedGun: null, items: {} };
    await connectArenaSocket();
    arenaJoinQueue(loadoutRef.current);
    dispatch({ type: 'SET_MATCHMAKING' });
  }, []);

  const useItemCb = useCallback((itemId: string) => {
    arenaUseItem(itemId);
  }, []);

  const throwBombCb = useCallback((itemId: string, dirX: number, dirY: number, power: number) => {
    arenaThrowBomb(itemId, dirX, dirY, power);
  }, []);

  const switchGunCb = useCallback((gunId: string) => {
    arenaSwitchGun(gunId);
  }, []);

  const cancelArenaQueueCb = useCallback(() => {
    arenaCancelQueue();
  }, []);

  const sendInputCb = useCallback((dx: number, dy: number, shoot: boolean, aimX = 0, aimY = 0) => {
    arenaInput(dx, dy, shoot, aimX, aimY);
  }, []);

  const leaveArenaCb = useCallback(() => {
    arenaLeave();
  }, []);

  const resetArenaCb = useCallback(() => {
    disconnectArenaSocket();
    dispatch({ type: 'RESET' });
  }, []);

  const clearToastCb = useCallback(() => {
    dispatch({ type: 'CLEAR_TOAST' });
  }, []);

  const clearItemEventCb = useCallback(() => {
    dispatch({ type: 'CLEAR_ITEM_EVENT' });
  }, []);

  const value = useMemo(
    () => ({
      arena: state,
      joinArenaQueue: joinArenaQueueCb,
      cancelArenaQueue: cancelArenaQueueCb,
      sendInput: sendInputCb,
      useItem: useItemCb,
      throwBomb: throwBombCb,
      switchGun: switchGunCb,
      leaveArena: leaveArenaCb,
      resetArena: resetArenaCb,
      clearToast: clearToastCb,
      clearItemEvent: clearItemEventCb,
    }),
    [state, joinArenaQueueCb, cancelArenaQueueCb, sendInputCb, useItemCb, throwBombCb, switchGunCb, leaveArenaCb, resetArenaCb, clearToastCb, clearItemEventCb],
  );

  return <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>;
}

export function useArena(): ArenaContextValue {
  const ctx = useContext(ArenaContext);
  if (!ctx) throw new Error('useArena must be used within ArenaProvider');
  return ctx;
}
