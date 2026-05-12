import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChessBoard } from '../components/ChessBoard';
import { ChessPiece } from '../components/ChessPiece';
import { DrawResignControls } from '../components/DrawResignControls';
import { Timer } from '../components/Timer';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useChessGame } from '../hooks/useChessGame';
import {
  connectToSession,
  type ArenaToggledEvent,
  type BoostActivatedEvent,
  type CountdownEvent,
  type ImmediateItemDropEvent,
  type SessionStartedEvent,
} from '../lib/websocket';
import {
  createSession as vorldCreateSession,
  setToken as vorldSetToken,
  updateSessionStatus as vorldUpdateSessionStatus,
} from '../lib/vorldTV';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import { applyMoveToBoard, boardToFenPlacement, isKingInCheck, oppositeColor, parseFen, squareToCoords, type ChessMove, type Color, type PromotionPiece } from '../utils/chessHelpers';
import {
  clearReactiveSessionId,
  loadReactiveSnapshot,
  saveReactiveSessionId,
} from '../utils/reactiveStorageHelper';

// ─── Reactive Arcade additions (purely additive — no chess logic touched) ────
const REACTIVE_PINK = '#FF006E';
const REACTIVE_CYAN = '#00F5FF';
const REACTIVE_YELLOW = '#FFE600';
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SESSION_SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;
const VORLD_STREAMER_URL = 'https://vorld.tv/';

type SessionStatus = 'idle' | 'creating' | 'connecting' | 'active' | 'ended' | 'error';
type LogTone = 'info' | 'started' | 'countdown' | 'arena' | 'boost' | 'drop' | 'error';
type SessionLogEntry = { id: string; text: string; tone: LogTone; timestamp: number };
type CelebrationData = { title: string; subtitle: string; tone: 'boost' | 'drop' } | null;

// Reactive session defaults — game config is fixed; titles auto-rotate per session.
const REACTIVE_GAME_CONFIG_ID = '7f3d9c02-93a4-472c-9c95-f6f729597389';
const CHESS_SESSION_TITLE_POOL = [
  'Knights of the Bit Realm',
  'Pawn Storm — Reactive Cup',
  'Rook & Roll Showdown',
  'Bishops at Dawn',
  'Endgame Empire',
  'Checkmate Carnival',
  'Castle Crusaders Live',
  'Gambit Galaxy',
  'Zugzwang Zone',
  'En Passant Express',
  'Forked Kingdom',
  'Discovered Check Derby',
  'King Hunt Arcade',
  'Queen\'s Reactive Gambit',
  'Sicilian Sparks',
  'Pixel Pawn Promotion',
  'Stalemate Showdown',
  'Tactics Tower Live',
  'Bit Bishop Bonanza',
  'Fool\'s Mate Festival',
];
const pickRandomChessTitle = () => {
  const idx = Math.floor(Math.random() * CHESS_SESSION_TITLE_POOL.length);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${CHESS_SESSION_TITLE_POOL[idx]} #${tag}`;
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ', M: 'ᛗ', P: 'ᛈ', I: 'ᛁ', R: 'ᚱ',
  O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', T: 'ᛏ', S: 'ᛊ',
  ' ': '  ',
};

const EMPIRE_RUNES = 'EMPIRE OF BITS'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');

const RUNE_LINE = `${EMPIRE_RUNES}   ᛉ   ${EMPIRE_RUNES}   ✦   ${EMPIRE_RUNES}   ᚷ   `;
const ROW_CONFIGS = [
  { opacity: 0.2, size: 20, offset: 0 },
  { opacity: 0.14, size: 17, offset: -44 },
  { opacity: 0.22, size: 23, offset: 18 },
  { opacity: 0.15, size: 18, offset: -22 },
  { opacity: 0.18, size: 21, offset: 36 },
  { opacity: 0.13, size: 16, offset: -10 },
  { opacity: 0.21, size: 22, offset: 8 },
  { opacity: 0.14, size: 19, offset: -38 },
  { opacity: 0.2, size: 20, offset: 26 },
  { opacity: 0.15, size: 17, offset: -16 },
  { opacity: 0.22, size: 24, offset: 42 },
  { opacity: 0.13, size: 18, offset: -6 },
  { opacity: 0.18, size: 21, offset: 14 },
  { opacity: 0.14, size: 16, offset: -30 },
  { opacity: 0.21, size: 20, offset: 22 },
  { opacity: 0.15, size: 23, offset: -48 },
];

function RunicBackground() {
  return (
    <View pointerEvents="none" style={runeStyles.container}>
      {ROW_CONFIGS.map((cfg, i) => (
        <View key={i} style={[runeStyles.row, { marginLeft: cfg.offset }]}>
          <Text
            style={[runeStyles.runeText, { opacity: cfg.opacity, fontSize: cfg.size }]}
            numberOfLines={1}
          >
            {RUNE_LINE}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function GameScreen() {
  const auth = useAuth();
  const game = useGame();
  const [chatDraft, setChatDraft] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewPly, setViewPly] = useState(game.moves.length);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const lastChatCountRef = useRef(game.chat.length);
  const orientation: Color = game.color ?? 'w';
  const myName = auth.user?.username ?? 'You';
  const opponentName = game.opponentName ?? 'Opponent';
  const myRating = game.playerRating;
  const opponentRating = game.opponentRating;
  const ownSeconds = orientation === 'w' ? game.timers.white : game.timers.black;
  const opponentSeconds = orientation === 'w' ? game.timers.black : game.timers.white;
  const ownActive = game.turn === orientation;
  const opponentActive = !ownActive;
  const replayStates = useMemo(() => {
    const initial = parseFen(START_FEN);
    let board = initial.board;
    let turn: Color = initial.turn;
    const snapshots: Array<{ board: typeof board; turn: Color; checkSquare: ReturnType<typeof isKingInCheck> }> = [
      { board, turn, checkSquare: isKingInCheck(board, turn) },
    ];
    game.moves.forEach((move) => {
      const from = squareToCoords(move.from);
      const to = squareToCoords(move.to);
      const movingPiece = board[from.row]?.[from.col];
      const isCastleLike = movingPiece?.type === 'k' && Math.abs(to.col - from.col) === 2;
      const replayMove: ChessMove = isCastleLike
        ? { ...move, castle: (to.col > from.col ? 'king' : 'queen') as 'king' | 'queen' }
        : move;
      board = applyMoveToBoard(board, replayMove);
      turn = oppositeColor(turn);
      snapshots.push({ board, turn, checkSquare: isKingInCheck(board, turn) });
    });
    return snapshots;
  }, [game.moves]);
  const safePly = Math.max(0, Math.min(viewPly, game.moves.length));
  const viewingLatest = safePly === game.moves.length;
  const replayState = replayStates[safePly] ?? replayStates[replayStates.length - 1];
  const displayFen = viewingLatest ? game.fen : `${boardToFenPlacement(replayState.board)} ${replayState.turn} - - 0 1`;
  const chess = useChessGame(displayFen, game.color, replayState.turn, game.makeMove);
  const interactionsDisabled =
    game.phase !== 'active' ||
    !game.color ||
    game.turn !== game.color ||
    game.opponentDisconnected ||
    !viewingLatest;
  const sortedChat = useMemo(
    () => [...game.chat].sort((a, b) => a.timestamp - b.timestamp).slice(-20),
    [game.chat],
  );
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkTranslateY = useRef(new Animated.Value(-8)).current;

  // ─── Reactive Arcade — read-only mirror of ArcadeCenterScreen storage ─────
  const [reactiveOn, setReactiveOn] = useState(false);
  const [twitchHandle, setTwitchHandle] = useState<string | null>(null);
  const [reactiveAccessToken, setReactiveAccessToken] = useState<string | null>(null);
  const [reactiveStreamUrl, setReactiveStreamUrl] = useState<string | null>(null);
  // ─── Reactive Session control state ───────────────────────────────────────
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [streamerRoleModalOpen, setStreamerRoleModalOpen] = useState(false);
  const [sessionGameConfigId, setSessionGameConfigId] = useState(REACTIVE_GAME_CONFIG_ID);
  const [sessionTitle, setSessionTitle] = useState(pickRandomChessTitle);
  const [eventLog, setEventLog] = useState<SessionLogEntry[]>([]);
  const [activeCountdown, setActiveCountdown] = useState<{ secondsRemaining: number; phase: string } | null>(null);
  const [latestBoost, setLatestBoost] = useState<{ actorName: string; amount: number; totalPoints: number } | null>(null);
  const [celebration, setCelebration] = useState<CelebrationData>(null);
  const sessionSheetY = useRef(new Animated.Value(SESSION_SHEET_HEIGHT)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const celebrationScale = useRef(new Animated.Value(0.8)).current;
  const socketRef = useRef<ReturnType<typeof connectToSession> | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const snap = await loadReactiveSnapshot();
        if (!mounted) return;
        const live = Boolean(snap.enabled && snap.accessToken && snap.user);
        setReactiveOn(live);
        if (snap.streamUrl) {
          const m = snap.streamUrl.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
          setTwitchHandle(m ? m[1] : snap.streamUrl);
          setReactiveStreamUrl(snap.streamUrl);
        }
        if (snap.accessToken) setReactiveAccessToken(snap.accessToken);
      } catch {
        // reactive UI just won't render
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {
          // ignore
        }
        socketRef.current = null;
      }
    };
  }, []);

  const appendLog = useCallback((text: string, tone: LogTone = 'info') => {
    setEventLog((prev) => {
      const entry: SessionLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        tone,
        timestamp: Date.now(),
      };
      const next = [entry, ...prev];
      return next.slice(0, 60);
    });
  }, []);

  const showCelebration = useCallback(
    (data: NonNullable<CelebrationData>) => {
      setCelebration(data);
      celebrationOpacity.setValue(0);
      celebrationScale.setValue(0.7);
      Animated.parallel([
        Animated.timing(celebrationOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(celebrationScale, {
          toValue: 1,
          friction: 6,
          tension: 110,
          useNativeDriver: true,
        }),
      ]).start();
      const id = setTimeout(() => {
        Animated.timing(celebrationOpacity, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setCelebration(null));
      }, 1700);
      return () => clearTimeout(id);
    },
    [celebrationOpacity, celebrationScale],
  );

  const openSessionPanel = useCallback(() => {
    setSessionPanelOpen(true);
    sessionSheetY.setValue(SESSION_SHEET_HEIGHT);
    Animated.spring(sessionSheetY, {
      toValue: 0,
      tension: 70,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [sessionSheetY]);

  const closeSessionPanel = useCallback(() => {
    Animated.timing(sessionSheetY, {
      toValue: SESSION_SHEET_HEIGHT,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSessionPanelOpen(false);
    });
  }, [sessionSheetY]);

  const wireSocketHandlers = useCallback(
    (socket: ReturnType<typeof connectToSession>) => {
      socket.on('connect', () => appendLog('Socket connected', 'info'));
      socket.on('disconnect', (reason: string) => appendLog(`Socket disconnected: ${reason}`, 'info'));
      socket.on('connect_error', (error: Error) => appendLog(`Connect error: ${error.message}`, 'error'));

      socket.on('session_started', (d: SessionStartedEvent) => {
        setSessionStatus('active');
        appendLog(`Session started: ${d.sessionId}`, 'started');
      });
      socket.on('countdown', (d: CountdownEvent) => {
        setActiveCountdown({ secondsRemaining: d.secondsRemaining, phase: d.phase });
        appendLog(`Countdown ${d.phase}: ${d.secondsRemaining}s`, 'countdown');
        // The `session_started` event isn't always emitted before countdown
        // ticks roll in. Treat any countdown as proof the session is live so
        // the status pill flips from "Connecting…" to "Live" instead of
        // sticking on the API's "waiting" state.
        setSessionStatus((prev) =>
          prev === 'connecting' || prev === 'creating' || prev === 'idle' ? 'active' : prev,
        );
        if (d.secondsRemaining <= 0) {
          setActiveCountdown(null);
        }
      });
      socket.on('arena_toggled', (d: ArenaToggledEvent) => {
        appendLog(`Arena ${d.arenaActive ? 'active' : 'inactive'}`, 'arena');
      });
      socket.on('boost_activated', (d: BoostActivatedEvent) => {
        setLatestBoost({ actorName: d.actorName, amount: d.amount, totalPoints: d.totalPoints });
        appendLog(`Boost: ${d.actorName} +${d.amount} (total ${d.totalPoints})`, 'boost');
        showCelebration({
          title: `+${d.amount} POINTS!`,
          subtitle: `${d.actorName} boosted • total ${d.totalPoints}`,
          tone: 'boost',
        });
      });
      socket.on('immediate_item_drop', (d: ImmediateItemDropEvent) => {
        appendLog(`Drop: ${d.itemName} → ${d.targetActorName} (by ${d.purchaserUsername})`, 'drop');
        showCelebration({
          title: d.itemName,
          subtitle: `${d.purchaserUsername} → ${d.targetActorName}`,
          tone: 'drop',
        });
      });
    },
    [appendLog, showCelebration],
  );

  const handleCreateSession = useCallback(async () => {
    if (!reactiveAccessToken) {
      setSessionError('Missing reactive access token. Re-enable Reactive Arcade.');
      setSessionStatus('error');
      return;
    }
    const streamUrl = reactiveStreamUrl ?? '';
    if (!streamUrl) {
      setSessionError('Stream URL missing.');
      setSessionStatus('error');
      return;
    }
    setSessionError(null);
    setSessionStatus('creating');
    // Always use the fixed reactive game config id and rotate to a fresh
    // chess-themed title for every new session.
    const gameConfigId = REACTIVE_GAME_CONFIG_ID;
    const title = pickRandomChessTitle();
    setSessionGameConfigId(gameConfigId);
    setSessionTitle(title);
    appendLog(`Creating session "${title}"…`, 'info');

    try {
      vorldSetToken(reactiveAccessToken);
      const response = await vorldCreateSession(
        {
          gameConfigId,
          streamUrl,
          sessionTitle: title,
        },
        reactiveAccessToken,
      );
      // API shape: { success: true, data: { session: { id: "TWQEGG", ... } } }
      // wrapped by axios as response.data, so the id sits at response.data.data.session.id.
      const body = (response as { data?: unknown }).data as
        | {
            data?: { session?: { id?: string; sessionId?: string } };
            session?: { id?: string; sessionId?: string };
            id?: string;
            sessionId?: string;
          }
        | undefined;
      const session = body?.data?.session ?? body?.session;
      const newId =
        session?.id ??
        session?.sessionId ??
        body?.id ??
        body?.sessionId ??
        null;
      if (!newId) {
        throw new Error('Session created but no id returned.');
      }
      setSessionId(newId);
      // Persist so ResultScreen can offer to end the session even after we
      // navigate away from this screen.
      void saveReactiveSessionId(newId);
      appendLog(`Session created: ${newId}`, 'started');

      setSessionStatus('connecting');
      const socket = connectToSession(reactiveAccessToken, newId);
      socketRef.current = socket;
      wireSocketHandlers(socket);
    } catch (err) {
      const responseError = (err as {
        response?: { data?: { error?: { code?: string; message?: string }; message?: string } };
      })?.response?.data?.error;
      const msg = responseError?.message ?? (err instanceof Error ? err.message : 'Failed to create session.');
      if (
        responseError?.code === 'FORBIDDEN' &&
        /active streamer role required/i.test(responseError.message ?? '')
      ) {
        setStreamerRoleModalOpen(true);
      }
      setSessionError(msg);
      setSessionStatus('error');
      appendLog(msg, 'error');
    }
  }, [appendLog, reactiveAccessToken, reactiveStreamUrl, sessionGameConfigId, sessionTitle, wireSocketHandlers]);

  const handleDisconnectSession = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch {
        // ignore
      }
      socketRef.current = null;
    }
    setSessionStatus((prev) => (prev === 'ended' ? 'ended' : 'idle'));
    setActiveCountdown(null);
    appendLog('Disconnected from session', 'info');
  }, [appendLog]);

  const handleEndSession = useCallback(async () => {
    if (!sessionId) {
      handleDisconnectSession();
      return;
    }
    try {
      if (reactiveAccessToken) {
        vorldSetToken(reactiveAccessToken);
        await vorldUpdateSessionStatus(sessionId, 'completed', reactiveAccessToken);
        appendLog(`Session ${sessionId} marked completed`, 'started');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to end session.';
      appendLog(msg, 'error');
    } finally {
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {
          // ignore
        }
        socketRef.current = null;
      }
      setSessionStatus('ended');
      setActiveCountdown(null);
      // Session is over — drop the saved id so ResultScreen won't offer to end it again.
      void clearReactiveSessionId();
    }
  }, [appendLog, handleDisconnectSession, reactiveAccessToken, sessionId]);

  const sessionStatusLabel = useMemo(() => {
    switch (sessionStatus) {
      case 'idle':
        return 'Ready';
      case 'creating':
        return 'Creating…';
      case 'connecting':
        return 'Connecting…';
      case 'active':
        return 'Live';
      case 'ended':
        return 'Ended';
      case 'error':
        return 'Error';
      default:
        return sessionStatus;
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (!game.toast) return undefined;
    const id = setTimeout(game.clearToast, 2200);
    return () => clearTimeout(id);
  }, [game.toast, game.clearToast]);

  useEffect(() => {
    if (!game.toast) return;
    if (/draw/i.test(game.toast) && /(reject|decline)/i.test(game.toast)) {
      setActionsOpen(false);
    }
  }, [game.toast]);

  useEffect(() => {
    setViewPly(game.moves.length);
  }, [game.moves.length]);

  useEffect(() => {
    if (chatOpen) setUnreadChatCount(0);
  }, [chatOpen]);

  useEffect(() => {
    const previousCount = lastChatCountRef.current;
    const currentCount = game.chat.length;
    if (currentCount > previousCount) {
      const incoming = currentCount - previousCount;
      if (!chatOpen) setUnreadChatCount((count) => count + incoming);
    }
    lastChatCountRef.current = currentCount;
  }, [game.chat.length, chatOpen]);

  useEffect(() => {
    if (!game.checkAlert) return undefined;
    checkOpacity.setValue(0);
    checkTranslateY.setValue(-8);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(checkOpacity, {
          toValue: 1,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(checkTranslateY, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1500),
      Animated.parallel([
        Animated.timing(checkOpacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(checkTranslateY, {
          toValue: -8,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    const id = setTimeout(game.clearCheckAlert, 2000);
    return () => clearTimeout(id);
  }, [game.checkAlertToken, game.checkAlert, game.clearCheckAlert, checkOpacity, checkTranslateY]);

  return (
    <View style={styles.screen}>
      <RunicBackground />
      {game.checkAlert && (
        <Animated.View
          style={[
            styles.checkBannerWrap,
            {
              opacity: checkOpacity,
              transform: [{ translateY: checkTranslateY }],
            },
          ]}
        >
          <Text style={styles.checkBannerText}>Check</Text>
        </Animated.View>
      )}
      <View style={styles.content}>
        <View style={styles.retroHeaderRow}>
          <View style={[styles.retroHeader, reactiveOn && styles.retroHeaderReactive]}>
            <Text style={[styles.retroHeaderText, reactiveOn && styles.retroHeaderTextReactive]}>
              {reactiveOn ? 'EMPIRE OF BITS · REACTIVE CHESS' : 'EMPIRE OF BITS - ARCADE CHESS'}
            </Text>
          </View>
          {reactiveOn && twitchHandle ? (
            <View style={styles.twitchChip}>
              <MaterialCommunityIcons name="twitch" size={12} color={REACTIVE_PINK} />
              <Text style={styles.twitchChipText} numberOfLines={1}>
                @{twitchHandle}
              </Text>
            </View>
          ) : null}
        </View>

        {reactiveOn && (
          <View style={styles.reactiveBanner}>
            <View style={styles.reactiveBannerDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reactiveBannerTitle}>REACTIVE SESSION</Text>
              <Text style={styles.reactiveBannerSub}>
                Status: {sessionStatusLabel}
                {sessionId ? `  ·  ${sessionId.slice(0, 10)}…` : ''}
              </Text>
            </View>
            <Pressable style={styles.activateBtn} onPress={openSessionPanel}>
              <MaterialCommunityIcons
                name={sessionStatus === 'active' ? 'broadcast' : 'play-circle-outline'}
                size={14}
                color="#fff"
              />
              <Text style={styles.activateBtnText}>
                {sessionStatus === 'active' || sessionStatus === 'connecting'
                  ? 'CONTROLS'
                  : 'ACTIVATE'}
              </Text>
            </Pressable>
          </View>
        )}

        {reactiveOn && activeCountdown && (
          <View style={styles.countdownBanner}>
            <MaterialCommunityIcons name="timer-sand" size={14} color={REACTIVE_CYAN} />
            <Text style={styles.countdownLabel}>{activeCountdown.phase.toUpperCase()}</Text>
            <Text style={styles.countdownValue}>{activeCountdown.secondsRemaining}s</Text>
          </View>
        )}

        {reactiveOn && latestBoost && (
          <View style={styles.boostTicker}>
            <MaterialCommunityIcons name="rocket-launch" size={13} color={REACTIVE_YELLOW} />
            <Text style={styles.boostTickerText} numberOfLines={1}>
              {latestBoost.actorName} +{latestBoost.amount}
            </Text>
            <Text style={styles.boostTickerTotal}>= {latestBoost.totalPoints}</Text>
          </View>
        )}

        {game.opponentDisconnected && <Text style={styles.banner}>Opponent disconnected - waiting for them to return...</Text>}
        <View style={styles.playerRow}>
          <View>
            <Text style={styles.playerLabel}>Opponent</Text>
            <Text style={styles.nameLabel}>{opponentName}</Text>
            {typeof opponentRating === 'number' ? <Text style={styles.ratingLabel}>Rating: {opponentRating}</Text> : null}
            <Text style={styles.status}>{opponentActive ? 'Thinking' : 'Waiting'}</Text>
          </View>
          <Timer seconds={opponentSeconds} label={orientation === 'w' ? 'Black' : 'White'} active={opponentActive} />
        </View>

        <View style={styles.boardWrap}>
          <ChessBoard
            board={viewingLatest ? chess.board : replayState.board}
            orientation={orientation}
            selected={viewingLatest ? chess.selected : null}
            legalTargets={viewingLatest ? chess.legalTargets : []}
            lastMove={viewingLatest ? game.lastMove : safePly > 0 ? game.moves[safePly - 1] : null}
            checkSquare={viewingLatest ? chess.checkSquare : replayState.checkSquare}
            disabled={interactionsDisabled}
            onSquarePress={chess.tapSquare}
          />
        </View>

        <View style={styles.playerRow}>
          <View>
            <Text style={styles.playerLabel}>You</Text>
            <Text style={styles.nameLabel}>{myName}</Text>
            {typeof myRating === 'number' ? <Text style={styles.ratingLabel}>Rating: {myRating}</Text> : null}
            <Text style={[styles.status, ownActive && styles.activeStatus]}>{ownActive ? 'Your move' : 'Opponent turn'}</Text>
          </View>
          <Timer seconds={ownSeconds} label={orientation === 'w' ? 'White' : 'Black'} active={ownActive} />
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomTab} onPress={() => setActionsOpen(true)}>
          <MaterialCommunityIcons name="format-list-bulleted-square" size={20} color={colors.text} />
          <Text style={styles.bottomTabText}>Actions</Text>
        </Pressable>
        <Pressable
          style={styles.bottomTab}
          onPress={() => {
            setUnreadChatCount(0);
            setChatOpen(true);
          }}
        >
          <MaterialCommunityIcons name="chat-outline" size={20} color={colors.text} />
          <Text style={styles.bottomTabText}>Chat</Text>
          {unreadChatCount > 0 && (
            <View style={styles.chatTabBadge}>
              <Text style={styles.chatTabBadgeText}>{unreadChatCount > 99 ? '99+' : String(unreadChatCount)}</Text>
            </View>
          )}
        </Pressable>
        <Pressable style={[styles.navTab, safePly <= 0 && styles.disabled]} disabled={safePly <= 0} onPress={() => setViewPly((curr) => Math.max(0, curr - 1))}>
          <Text style={styles.bottomTabText}>{'<'}</Text>
        </Pressable>
        <Pressable
          style={[styles.navTab, viewingLatest && styles.disabled]}
          disabled={viewingLatest}
          onPress={() => setViewPly((curr) => Math.min(game.moves.length, curr + 1))}
        >
          <Text style={styles.bottomTabText}>{'>'}</Text>
        </Pressable>
      </View>
      {game.toast && <Text style={styles.toast}>{game.toast}</Text>}

      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, styles.actionsModal]}>
            <View style={styles.actionsHeader}>
              <Text style={styles.modalTitle}>Game Actions</Text>
              <Pressable style={styles.closeButton} onPress={() => setActionsOpen(false)}>
                <Text style={styles.closeText}>X</Text>
              </Pressable>
            </View>
            <DrawResignControls
              onOfferDraw={game.offerDrawGame}
              onResign={game.resignGame}
              disabled={game.phase !== 'active' || game.opponentDisconnected}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <View style={styles.chatScreen}>
          <View style={styles.chatHeader}>
            <Pressable style={styles.backButton} onPress={() => setChatOpen(false)}>
              <Text style={styles.backButtonText}>{'<'}</Text>
            </Pressable>
            <Text style={styles.chatHeaderTitle}>Game Chat</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.chatList}>
            {sortedChat.length === 0 ? (
              <Text style={styles.chatPlaceholder}>No messages yet.</Text>
            ) : (
              sortedChat.map((item, index) => {
                const mine = Number(auth.user?.id) === item.sender;
                return (
                  <View key={`${item.timestamp}-${index}`} style={[styles.chatBubble, mine ? styles.chatBubbleMine : styles.chatBubbleOther]}>
                    <Text style={styles.chatSender}>{mine ? 'You' : opponentName}</Text>
                    <Text style={styles.chatText}>{item.message}</Text>
                  </View>
                );
              })
            )}
          </View>
          <View style={styles.chatComposerRow}>
            <TextInput
              value={chatDraft}
              onChangeText={setChatDraft}
              placeholder="Type a message"
              placeholderTextColor={colors.subtleText}
              style={styles.chatInput}
              onSubmitEditing={() => {
                game.sendChatMessage(chatDraft);
                setChatDraft('');
              }}
            />
            <Pressable
              style={styles.chatSend}
              onPress={() => {
                game.sendChatMessage(chatDraft);
                setChatDraft('');
              }}
            >
              <Text style={styles.chatSendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PromotionModal visible={Boolean(chess.pendingPromotion)} color={orientation} onPick={chess.choosePromotion} onCancel={chess.cancelPromotion} />
      <DrawOfferModal visible={game.drawOfferIncoming} onAccept={game.acceptDrawOffer} onReject={game.rejectDrawOffer} />

      <Modal
        visible={streamerRoleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStreamerRoleModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, styles.streamerRoleModal]}>
            <View style={styles.streamerRoleIconWrap}>
              <MaterialCommunityIcons name="broadcast" size={26} color={REACTIVE_PINK} />
            </View>
            <Text style={styles.modalTitle}>Streamer Mode Required</Text>
            <Text style={styles.streamerRoleBody}>
              Vorld blocked arena creation because this account needs an active streamer role. Go to
              vorld.tv, open Profile, enable streamer mode, then come back and activate the session again.
              Your chess game can continue normally.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => setStreamerRoleModalOpen(false)}
              >
                <Text style={styles.secondaryText}>Later</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.acceptButton]}
                onPress={() => void Linking.openURL(VORLD_STREAMER_URL)}
              >
                <Text style={styles.acceptText}>Open Vorld</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {celebration && (
        <View pointerEvents="none" style={styles.celebrationOverlay}>
          <Animated.View
            style={[
              styles.celebrationCard,
              celebration.tone === 'drop' ? styles.celebrationCardDrop : styles.celebrationCardBoost,
              {
                opacity: celebrationOpacity,
                transform: [{ scale: celebrationScale }],
              },
            ]}
          >
            <View style={styles.celebrationSparkles}>
              <Text style={styles.celebrationSparkle}>✦</Text>
              <Text style={styles.celebrationSparkle}>✧</Text>
              <Text style={styles.celebrationSparkle}>✦</Text>
            </View>
            <MaterialCommunityIcons
              name={celebration.tone === 'drop' ? 'gift-outline' : 'rocket-launch'}
              size={36}
              color={celebration.tone === 'drop' ? REACTIVE_CYAN : REACTIVE_YELLOW}
            />
            <Text style={styles.celebrationTitle}>{celebration.title}</Text>
            <Text style={styles.celebrationSubtitle}>{celebration.subtitle}</Text>
          </Animated.View>
        </View>
      )}

      {sessionPanelOpen && (
        <View style={styles.sessionOverlay}>
          <Pressable style={styles.sessionBackdrop} onPress={closeSessionPanel} />
          <Animated.View
            style={[
              styles.sessionSheet,
              { transform: [{ translateY: sessionSheetY }] },
            ]}
          >
            <View style={styles.sessionGrip} />
            <View style={styles.sessionHeader}>
              <Pressable onPress={closeSessionPanel} style={styles.sessionBackBtn}>
                <MaterialCommunityIcons name="chevron-down" size={20} color={REACTIVE_CYAN} />
                <Text style={styles.sessionBackText}>HIDE</Text>
              </Pressable>
              <Text style={styles.sessionTitle}>REACTIVE SESSION</Text>
              <View
                style={[
                  styles.sessionStatusPill,
                  sessionStatus === 'active' && styles.sessionStatusPillActive,
                  sessionStatus === 'error' && styles.sessionStatusPillError,
                ]}
              >
                <View
                  style={[
                    styles.sessionStatusDot,
                    sessionStatus === 'active' && styles.sessionStatusDotActive,
                    sessionStatus === 'error' && styles.sessionStatusDotError,
                  ]}
                />
                <Text style={styles.sessionStatusText}>{sessionStatusLabel}</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.sessionBody} keyboardShouldPersistTaps="handled">
              <View style={styles.sessionRow}>
                <Text style={styles.sessionFieldLabel}>STREAM URL</Text>
                <Text style={styles.sessionFieldReadonly} numberOfLines={1}>
                  {reactiveStreamUrl ?? '— not set —'}
                </Text>
              </View>

              <View style={styles.sessionRow}>
                <Text style={styles.sessionFieldLabel}>GAME CONFIG ID</Text>
                <Text style={styles.sessionFieldReadonly} numberOfLines={1}>
                  {sessionGameConfigId}
                </Text>
              </View>

              <View style={styles.sessionRow}>
                <View style={styles.sessionTitleHeaderRow}>
                  <Text style={styles.sessionFieldLabel}>SESSION TITLE</Text>
                  <Pressable
                    onPress={() => setSessionTitle(pickRandomChessTitle())}
                    style={styles.sessionRerollBtn}
                    disabled={sessionStatus === 'creating' || sessionStatus === 'connecting' || sessionStatus === 'active'}
                  >
                    <MaterialCommunityIcons name="dice-multiple-outline" size={12} color={REACTIVE_CYAN} />
                    <Text style={styles.sessionRerollBtnText}>REROLL</Text>
                  </Pressable>
                </View>
                <Text style={styles.sessionFieldReadonly} numberOfLines={1}>
                  {sessionTitle}
                </Text>
              </View>

              {sessionId ? (
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionFieldLabel}>SESSION ID</Text>
                  <Text style={styles.sessionFieldReadonly} numberOfLines={1}>
                    {sessionId}
                  </Text>
                </View>
              ) : null}

              {sessionError ? <Text style={styles.sessionErrorText}>{sessionError}</Text> : null}

              <View style={styles.sessionButtonRow}>
                <Pressable
                  style={[
                    styles.sessionPrimaryBtn,
                    (sessionStatus === 'creating' || sessionStatus === 'connecting' || sessionStatus === 'active') &&
                      styles.sessionBtnDisabled,
                  ]}
                  disabled={
                    sessionStatus === 'creating' ||
                    sessionStatus === 'connecting' ||
                    sessionStatus === 'active'
                  }
                  onPress={() => void handleCreateSession()}
                >
                  {sessionStatus === 'creating' || sessionStatus === 'connecting' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="broadcast" size={16} color="#fff" />
                      <Text style={styles.sessionPrimaryBtnText}>CREATE & ACTIVATE</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={styles.sessionButtonRow}>
                <Pressable
                  style={[
                    styles.sessionSecondaryBtn,
                    !socketRef.current && styles.sessionBtnDisabled,
                  ]}
                  disabled={!socketRef.current}
                  onPress={handleDisconnectSession}
                >
                  <MaterialCommunityIcons name="lan-disconnect" size={14} color={REACTIVE_CYAN} />
                  <Text style={styles.sessionSecondaryBtnText}>DISCONNECT</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.sessionDangerBtn,
                    !sessionId && styles.sessionBtnDisabled,
                  ]}
                  disabled={!sessionId}
                  onPress={() => void handleEndSession()}
                >
                  <MaterialCommunityIcons name="stop-circle-outline" size={14} color={REACTIVE_PINK} />
                  <Text style={styles.sessionDangerBtnText}>END SESSION</Text>
                </Pressable>
              </View>

              <Text style={styles.sessionLogTitle}>EVENT LOG</Text>
              <View style={styles.sessionLogBox}>
                {eventLog.length === 0 ? (
                  <Text style={styles.sessionLogEmpty}>No events yet — create a session to begin.</Text>
                ) : (
                  eventLog.map((entry) => (
                    <View key={entry.id} style={styles.sessionLogRow}>
                      <View style={[styles.sessionLogDot, sessionLogToneStyle(entry.tone)]} />
                      <Text style={styles.sessionLogText} numberOfLines={2}>
                        {entry.text}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function sessionLogToneStyle(tone: LogTone) {
  switch (tone) {
    case 'started':
      return { backgroundColor: REACTIVE_CYAN };
    case 'countdown':
      return { backgroundColor: '#9cc8ff' };
    case 'arena':
      return { backgroundColor: '#a78bfa' };
    case 'boost':
      return { backgroundColor: REACTIVE_YELLOW };
    case 'drop':
      return { backgroundColor: REACTIVE_PINK };
    case 'error':
      return { backgroundColor: '#ef4444' };
    default:
      return { backgroundColor: '#6b7280' };
  }
}

function PromotionModal({
  visible,
  color,
  onPick,
  onCancel,
}: {
  visible: boolean;
  color: Color;
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const options: PromotionPiece[] = ['q', 'r', 'b', 'n'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Promote pawn</Text>
          <View style={styles.promotionRow}>
            {options.map((piece) => (
              <Pressable key={piece} style={styles.promotionButton} onPress={() => onPick(piece)}>
                <ChessPiece piece={{ color, type: piece }} size={52} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DrawOfferModal({ visible, onAccept, onReject }: { visible: boolean; onAccept: () => void; onReject: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modal, styles.drawModal]}>
          <View style={styles.drawBadge}>
            <Text style={styles.drawBadgeText}>DRAW OFFER</Text>
          </View>
          <Text style={styles.modalTitle}>Opponent offered a draw</Text>
          <Text style={styles.drawSubtitle}>Accept to finish this game as a draw, or decline to keep playing.</Text>
          <View style={styles.modalActions}>
            <Pressable style={[styles.modalButton, styles.declineButton]} onPress={onReject}>
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, styles.acceptButton]} onPress={onAccept}>
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const runeStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  row: {
    overflow: 'hidden',
  },
  runeText: {
    color: '#efb53a',
    fontWeight: '300',
    letterSpacing: 5,
    textShadowColor: 'rgba(203, 123, 8, 0.95)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tableGlossTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(255,232,198,0.12)',
  },
  tableGlossMid: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    height: '10%',
    backgroundColor: 'rgba(255,225,184,0.06)',
  },
  tableGlossBottom: {
    position: 'absolute',
    bottom: '6%',
    left: 0,
    right: 0,
    height: '12%',
    backgroundColor: 'rgba(255,220,170,0.05)',
  },
  woodGrainA: {
    position: 'absolute',
    left: '-8%',
    top: '8%',
    width: '128%',
    height: 18,
    backgroundColor: 'rgba(104,63,33,0.26)',
    transform: [{ rotate: '-2deg' }],
  },
  woodGrainB: {
    position: 'absolute',
    left: '-4%',
    top: '28%',
    width: '124%',
    height: 14,
    backgroundColor: 'rgba(96,56,28,0.22)',
    transform: [{ rotate: '1deg' }],
  },
  woodGrainC: {
    position: 'absolute',
    left: '-10%',
    top: '56%',
    width: '134%',
    height: 16,
    backgroundColor: 'rgba(93,54,26,0.24)',
    transform: [{ rotate: '-1.2deg' }],
  },
  woodGrainD: {
    position: 'absolute',
    left: '-6%',
    top: '78%',
    width: '126%',
    height: 13,
    backgroundColor: 'rgba(88,50,24,0.2)',
    transform: [{ rotate: '1deg' }],
  },
  woodGrainE: {
    position: 'absolute',
    left: '-7%',
    top: '18%',
    width: '130%',
    height: 8,
    backgroundColor: 'rgba(119,73,39,0.16)',
    transform: [{ rotate: '0.5deg' }],
  },
  woodGrainF: {
    position: 'absolute',
    left: '-5%',
    top: '68%',
    width: '126%',
    height: 9,
    backgroundColor: 'rgba(117,69,37,0.14)',
    transform: [{ rotate: '-0.6deg' }],
  },
  woodPoreA: {
    position: 'absolute',
    left: '22%',
    top: '32%',
    width: 2,
    height: 26,
    borderRadius: 2,
    backgroundColor: 'rgba(60,31,16,0.16)',
  },
  woodPoreB: {
    position: 'absolute',
    right: '26%',
    top: '52%',
    width: 2,
    height: 22,
    borderRadius: 2,
    backgroundColor: 'rgba(60,31,16,0.14)',
  },
  woodPoreC: {
    position: 'absolute',
    left: '48%',
    top: '74%',
    width: 1.5,
    height: 18,
    borderRadius: 2,
    backgroundColor: 'rgba(60,31,16,0.14)',
  },
  woodVignette: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 18,
    borderColor: 'rgba(34,18,10,0.14)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  tableCrackOne: {
    position: 'absolute',
    left: '8%',
    top: '16%',
    width: 2,
    height: '42%',
    backgroundColor: 'rgba(42,20,9,0.28)',
    transform: [{ rotate: '-12deg' }],
  },
  tableCrackTwo: {
    position: 'absolute',
    right: '10%',
    bottom: '14%',
    width: 2,
    height: '36%',
    backgroundColor: 'rgba(42,20,9,0.26)',
    transform: [{ rotate: '20deg' }],
  },
  tableCrackThree: {
    position: 'absolute',
    left: '44%',
    top: '58%',
    width: 1.5,
    height: '24%',
    backgroundColor: 'rgba(42,20,9,0.22)',
    transform: [{ rotate: '-6deg' }],
  },
  retroHeader: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#a77445',
    backgroundColor: '#4b3220',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  retroHeaderText: {
    color: '#ffe1ab',
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1.1,
  },
  banner: {
    color: colors.warning,
    backgroundColor: '#5a3e27',
    borderRadius: radii.sm,
    padding: spacing.md,
    fontWeight: '800',
    textAlign: 'center',
  },
  checkBannerWrap: {
    backgroundColor: '#5f432a',
    borderRadius: radii.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#b58350',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  checkBannerText: {
    color: '#f7e8b0',
    fontWeight: '900',
    textAlign: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#9f6f42',
    backgroundColor: '#4a3322',
    padding: spacing.md,
  },
  playerLabel: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '900',
  },
  nameLabel: {
    color: colors.subtleText,
    fontSize: typography.small,
    fontWeight: '700',
    marginTop: 1,
  },
  ratingLabel: {
    color: '#d7c6a1',
    fontSize: typography.tiny,
    fontWeight: '800',
    marginTop: 1,
  },
  status: {
    color: colors.mutedText,
    marginTop: 2,
    fontWeight: '700',
  },
  activeStatus: {
    color: colors.accent,
  },
  boardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#935f36',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: '#3d2b1d',
  },
  bottomTab: {
    position: 'relative',
    flex: 1,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#a26f42',
    backgroundColor: '#563a23',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chatTabBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#d64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTabBadgeText: {
    color: '#fff',
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  navTab: {
    width: 52,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#a26f42',
    backgroundColor: '#563a23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  bottomTabText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '800',
  },
  chatScreen: {
    flex: 1,
    backgroundColor: '#2d1f14',
    padding: spacing.md,
    gap: spacing.sm,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  chatHeaderTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
  },
  headerSpacer: {
    width: 38,
  },
  actionsModal: {
    gap: spacing.lg,
  },
  actionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  closeText: {
    color: colors.text,
    fontWeight: '900',
  },
  chatList: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  chatPlaceholder: {
    color: colors.subtleText,
    fontStyle: 'italic',
  },
  chatBubble: {
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  chatBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#2f3b2d',
    borderColor: '#6f8d4f',
  },
  chatBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
  },
  chatSender: {
    color: colors.subtleText,
    fontSize: typography.tiny,
    fontWeight: '800',
  },
  chatText: {
    color: colors.text,
  },
  chatComposerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    paddingHorizontal: spacing.sm,
  },
  chatSend: {
    minWidth: 70,
    minHeight: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendText: {
    color: colors.text,
    fontWeight: '900',
  },
  toast: {
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '800',
    paddingBottom: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  drawModal: {
    borderColor: '#55623f',
    backgroundColor: '#1e2220',
  },
  streamerRoleModal: {
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: '#140817',
  },
  streamerRoleIconWrap: {
    alignSelf: 'center',
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.12)',
  },
  streamerRoleBody: {
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.md,
  },
  drawBadge: {
    alignSelf: 'center',
    backgroundColor: '#2f3b2d',
    borderWidth: 1,
    borderColor: '#6f8d4f',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  drawBadgeText: {
    color: '#d9efb8',
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 0.6,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
    textAlign: 'center',
  },
  promotionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  promotionButton: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  drawSubtitle: {
    color: colors.mutedText,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
  },
  declineButton: {
    backgroundColor: '#2c2323',
    borderColor: '#a15b5b',
    borderWidth: 1,
  },
  acceptButton: {
    backgroundColor: colors.accent,
  },
  secondaryText: {
    color: colors.mutedText,
    fontWeight: '900',
  },
  declineText: {
    color: '#ffb4b4',
    fontWeight: '900',
  },
  acceptText: {
    color: colors.text,
    fontWeight: '900',
  },
  retroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  retroHeaderReactive: {
    borderColor: REACTIVE_PINK,
    backgroundColor: '#3d1729',
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  retroHeaderTextReactive: {
    color: '#ffd6e6',
  },
  twitchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.10)',
    maxWidth: 160,
  },
  twitchChipText: {
    color: REACTIVE_PINK,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 0.5,
  },
  reactiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.10)',
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveBannerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: REACTIVE_PINK,
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.95,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveBannerTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.small,
    letterSpacing: 1.4,
  },
  reactiveBannerSub: {
    color: colors.mutedText,
    fontSize: typography.tiny,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  activateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: REACTIVE_PINK,
    borderWidth: 1,
    borderColor: REACTIVE_CYAN,
  },
  activateBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1,
  },
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.55)',
    backgroundColor: 'rgba(0,245,255,0.10)',
  },
  countdownLabel: {
    color: REACTIVE_CYAN,
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1.6,
    flex: 1,
  },
  countdownValue: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.body,
    letterSpacing: 0.5,
  },
  boostTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,230,0,0.45)',
    backgroundColor: 'rgba(255,230,0,0.08)',
  },
  boostTickerText: {
    flex: 1,
    color: colors.text,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 0.5,
  },
  boostTickerTotal: {
    color: REACTIVE_YELLOW,
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 0.5,
  },
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(8,8,8,0.94)',
    shadowOpacity: 0.7,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  celebrationCardBoost: {
    borderColor: REACTIVE_YELLOW,
    shadowColor: REACTIVE_YELLOW,
  },
  celebrationCardDrop: {
    borderColor: REACTIVE_CYAN,
    shadowColor: REACTIVE_CYAN,
  },
  celebrationSparkles: {
    flexDirection: 'row',
    gap: 14,
  },
  celebrationSparkle: {
    color: REACTIVE_YELLOW,
    fontSize: 16,
    textShadowColor: REACTIVE_YELLOW,
    textShadowRadius: 6,
  },
  celebrationTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  celebrationSubtitle: {
    color: colors.mutedText,
    fontSize: typography.small,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  sessionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sessionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sessionSheet: {
    height: SESSION_SHEET_HEIGHT,
    backgroundColor: '#080a10',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,0,110,0.55)',
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sessionGrip: {
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sessionBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.45)',
    backgroundColor: 'rgba(0,245,255,0.08)',
  },
  sessionBackText: {
    color: REACTIVE_CYAN,
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sessionTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.body,
    letterSpacing: 1.6,
  },
  sessionStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sessionStatusPillActive: {
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  sessionStatusPillError: {
    borderColor: 'rgba(239,68,68,0.6)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  sessionStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#9ca3af',
  },
  sessionStatusDotActive: {
    backgroundColor: '#22c55e',
  },
  sessionStatusDotError: {
    backgroundColor: '#ef4444',
  },
  sessionStatusText: {
    color: colors.text,
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sessionBody: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sessionRow: {
    gap: 6,
  },
  sessionFieldLabel: {
    color: REACTIVE_CYAN,
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1.4,
  },
  sessionFieldReadonly: {
    color: colors.text,
    fontSize: typography.small,
    letterSpacing: 0.3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sessionInput: {
    color: colors.text,
    fontSize: typography.small,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sessionErrorText: {
    color: '#fca5a5',
    fontSize: typography.tiny,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  sessionButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sessionPrimaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: REACTIVE_PINK,
    borderWidth: 1.5,
    borderColor: REACTIVE_CYAN,
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  sessionPrimaryBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: typography.small,
    letterSpacing: 1.2,
  },
  sessionSecondaryBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0,245,255,0.55)',
    backgroundColor: 'rgba(0,245,255,0.08)',
  },
  sessionSecondaryBtnText: {
    color: REACTIVE_CYAN,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 1.2,
  },
  sessionDangerBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.10)',
  },
  sessionDangerBtnText: {
    color: REACTIVE_PINK,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 1.2,
  },
  sessionBtnDisabled: {
    opacity: 0.45,
  },
  sessionLogTitle: {
    color: colors.subtleText,
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1.6,
    marginTop: spacing.sm,
  },
  sessionLogBox: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.sm,
    gap: 6,
    minHeight: 110,
  },
  sessionLogEmpty: {
    color: colors.subtleText,
    fontSize: typography.tiny,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  sessionLogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  sessionLogDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  sessionLogText: {
    color: colors.text,
    fontSize: typography.tiny,
    flex: 1,
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  sessionTitleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionRerollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.45)',
    backgroundColor: 'rgba(0,245,255,0.08)',
  },
  sessionRerollBtnText: {
    color: REACTIVE_CYAN,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 1,
  },
});
