import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSession as vorldCreateSession,
  setToken as vorldSetToken,
  updateSessionStatus as vorldUpdateSessionStatus,
} from '../lib/vorldTV';
import {
  connectToSession,
  type BoostActivatedEvent,
  type CountdownEvent,
  type ImmediateItemDropEvent,
  type SessionEndedEvent,
  type SessionStartedEvent,
} from '../lib/websocket';
import {
  clearReactiveSessionId,
  loadReactiveSnapshot,
  saveReactiveSessionId,
} from '../utils/reactiveStorageHelper';
import { arenaItemDrop } from '../websockets/arenaSocket';

// Mirrors the Vorld TV integration in GameScreen, packaged as a reusable hook
// for the Arena. Auto-creates + connects a session when Reactive Arcade is
// enabled, then surfaces countdown / boost / item-drop / disconnect events as
// UI-friendly state. Purely additive — does nothing when Reactive is off.

export type VorldSessionStatus = 'idle' | 'creating' | 'connecting' | 'active' | 'ended' | 'error';
export type ArenaToastTone = 'boost' | 'drop' | 'info' | 'error';

export interface ArenaToast {
  id: string;
  title: string;
  subtitle?: string;
  tone: ArenaToastTone;
}

export interface ArenaCelebration {
  title: string;
  subtitle: string;
  tone: 'boost' | 'drop';
  token: number;
}

export interface ArenaCountdown {
  secondsRemaining: number;
  phase: string;
}

export interface VorldArenaSession {
  reactiveOn: boolean;
  status: VorldSessionStatus;
  sessionId: string | null;
  error: string | null;
  countdown: ArenaCountdown | null;
  celebration: ArenaCelebration | null;
  toasts: ArenaToast[];
  reconnecting: boolean;
}

// Same fixed Reactive game config as the chess flow; titles rotate per session.
const ARENA_GAME_CONFIG_ID = 'c76360fe-3ee6-493e-a24c-9696eca7a93d';
const ARENA_TITLE_POOL = [
  'Neon Pit Showdown',
  'Blitz Arena — Reactive Cup',
  'Twin Soldiers Live',
  'Pixel Firefight',
  'Last Bit Standing',
  'Arena Blitz Royale',
  'Crate & Carnage',
  'Rocket Rumble',
  'Shrink Zone Smackdown',
  'Top-Down Takedown',
];

const pickRandomArenaTitle = () => {
  const idx = Math.floor(Math.random() * ARENA_TITLE_POOL.length);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${ARENA_TITLE_POOL[idx]} #${tag}`;
};

const CELEBRATION_MS = 1900;
const TOAST_MS = 3400;

export function useVorldArenaSession(): VorldArenaSession {
  const [reactiveOn, setReactiveOn] = useState(false);
  const [status, setStatus] = useState<VorldSessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<ArenaCountdown | null>(null);
  const [celebration, setCelebration] = useState<ArenaCelebration | null>(null);
  const [toasts, setToasts] = useState<ArenaToast[]>([]);
  const [reconnecting, setReconnecting] = useState(false);

  const socketRef = useRef<ReturnType<typeof connectToSession> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const pushToast = useCallback((toast: Omit<ArenaToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [{ id, ...toast }, ...prev].slice(0, 4));
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimers.current.delete(id);
    }, TOAST_MS);
    toastTimers.current.set(id, timer);
  }, []);

  const showCelebration = useCallback((data: Omit<ArenaCelebration, 'token'>) => {
    setCelebration({ ...data, token: Date.now() });
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => {
      if (mountedRef.current) setCelebration(null);
    }, CELEBRATION_MS);
  }, []);

  const wireSocketHandlers = useCallback(
    (socket: ReturnType<typeof connectToSession>) => {
      socket.on('connect', () => {
        if (!mountedRef.current) return;
        setReconnecting(false);
      });
      socket.on('disconnect', (reason: string) => {
        if (!mountedRef.current) return;
        setReconnecting(true);
        pushToast({ title: 'Reactive link lost', subtitle: reason, tone: 'info' });
      });
      socket.on('connect_error', (err: Error) => {
        if (!mountedRef.current) return;
        pushToast({ title: 'Reactive error', subtitle: err.message, tone: 'error' });
      });

      socket.on('session_started', (_d: SessionStartedEvent) => {
        if (!mountedRef.current) return;
        setStatus('active');
      });
      socket.on('countdown', (d: CountdownEvent) => {
        if (!mountedRef.current) return;
        setStatus((prev) => (prev === 'connecting' || prev === 'creating' || prev === 'idle' ? 'active' : prev));
        if (d.secondsRemaining <= 0) {
          setCountdown(null);
        } else {
          setCountdown({ secondsRemaining: d.secondsRemaining, phase: d.phase });
        }
      });
      socket.on('boost_activated', (d: BoostActivatedEvent) => {
        if (!mountedRef.current) return;
        showCelebration({
          title: `+${d.amount} POINTS`,
          subtitle: `${d.actorName} boosted • total ${d.totalPoints}`,
          tone: 'boost',
        });
        pushToast({ title: `+${d.amount} pts`, subtitle: `${d.actorName} boosted`, tone: 'boost' });
      });
      socket.on('immediate_item_drop', (d: ImmediateItemDropEvent) => {
        if (!mountedRef.current) return;
        // Forward to the arena backend so it applies the effect to the live game.
        arenaItemDrop(d.itemName, d.targetActorName);
        pushToast({
          title: d.itemName,
          subtitle: `${d.purchaserUsername} → ${d.targetActorName}`,
          tone: 'drop',
        });
      });
      socket.on('session_ended', (_d: SessionEndedEvent) => {
        if (!mountedRef.current) return;
        setStatus('ended');
        setCountdown(null);
      });
    },
    [pushToast, showCelebration],
  );

  useEffect(() => {
    mountedRef.current = true;

    const createAndConnect = async (token: string, streamUrl: string) => {
      setStatus('creating');
      setError(null);
      const title = pickRandomArenaTitle();
      try {
        vorldSetToken(token);
        const response = await vorldCreateSession(
          { gameConfigId: ARENA_GAME_CONFIG_ID, streamUrl, sessionTitle: title },
          token,
        );
        const body = (response as { data?: unknown }).data as
          | {
              data?: { session?: { id?: string; sessionId?: string } };
              session?: { id?: string; sessionId?: string };
              id?: string;
              sessionId?: string;
            }
          | undefined;
        const session = body?.data?.session ?? body?.session;
        const newId = session?.id ?? session?.sessionId ?? body?.id ?? body?.sessionId ?? null;
        if (!newId) throw new Error('Session created but no id returned.');
        if (!mountedRef.current) return;

        setSessionId(newId);
        sessionIdRef.current = newId;
        void saveReactiveSessionId(newId);

        setStatus('connecting');
        const socket = connectToSession(token, newId);
        socketRef.current = socket;
        wireSocketHandlers(socket);
      } catch (err) {
        const responseError = (err as {
          response?: { data?: { error?: { code?: string; message?: string } } };
        })?.response?.data?.error;
        const msg = responseError?.message ?? (err instanceof Error ? err.message : 'Reactive session unavailable.');
        if (!mountedRef.current) return;
        setError(msg);
        setStatus('error');
        pushToast({ title: 'Reactive unavailable', subtitle: msg, tone: 'error' });
      }
    };

    void (async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        const snap = await loadReactiveSnapshot();
        const live = Boolean(snap.enabled && snap.accessToken && snap.user);
        if (!mountedRef.current) return;
        setReactiveOn(live);
        if (live && snap.accessToken && snap.streamUrl) {
          tokenRef.current = snap.accessToken;
          await createAndConnect(snap.accessToken, snap.streamUrl);
        }
      } catch {
        // Reactive features simply stay off.
      }
    })();

    return () => {
      mountedRef.current = false;

      const sock = socketRef.current;
      socketRef.current = null;
      if (sock) {
        try {
          sock.disconnect();
        } catch {
          // ignore
        }
      }

      const id = sessionIdRef.current;
      const tok = tokenRef.current;
      if (id && tok) {
        try {
          vorldSetToken(tok);
          void vorldUpdateSessionStatus(id, 'completed', tok).catch(() => {});
        } catch {
          // ignore
        }
        void clearReactiveSessionId();
      }

      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      toastTimers.current.forEach((t) => clearTimeout(t));
      toastTimers.current.clear();
    };
  }, [wireSocketHandlers, pushToast]);

  return { reactiveOn, status, sessionId, error, countdown, celebration, toasts, reconnecting };
}
