import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { isKingInCheck, normalizeBackendMove, parseFen, toAlgebraic, type ChessMove, type Color } from '../utils/chessHelpers';
import { clearActiveGameId, getActiveGameId, saveActiveGameId } from '../utils/storageHelper';
import {
    acceptDraw,
    cancelQueue,
    connectGameSocket,
    joinQueue,
    offerDraw,
    onGameSocketMessage,
    onGameSocketStatus,
    reconnectRoomGame,
    rejectDraw,
    resign,
    RoomSocketEvents,
    sendMove,
    sendRoomChat,
    type ColorPreference,
    type GameOverPayload,
    type InitRoomPayload,
    type MovePayload,
    type RatingUpdatePayload,
    type RoomChatMessage,
    type TimeControl,
} from '../websockets/gameSocket';
import type { SocketStatus } from '../websockets/socketClient';

export type GamePhase = 'idle' | 'matchmaking' | 'active' | 'finished';

export interface Timers {
  white: number;
  black: number;
}

export interface GameResult {
  result: 'win' | 'lose' | 'draw';
  reason: string;
  message?: string;
  moves: number;
  durationSeconds: number;
  ratingChange?: number;
  newRating?: number;
  opponentNewRating?: number;
}

interface GameState {
  phase: GamePhase;
  socketStatus: SocketStatus;
  timeControl: TimeControl | null;
  colorPreference: ColorPreference | null;
  roomGameId: string | null;
  color: Color | null;
  opponentId: number | null;
  opponentName: string | null;
  playerRating: number | null;
  opponentRating: number | null;
  fen: string;
  turn: Color;
  timers: Timers;
  moves: ChessMove[];
  lastMove: ChessMove | null;
  validMoves: ChessMove[];
  selectedSquare: string | null;
  checkSquare: string | null;
  checkAlert: string | null;
  checkAlertToken: number;
  drawOfferIncoming: boolean;
  opponentDisconnected: boolean;
  toast: string | null;
  result: GameResult | null;
  startedAt: number | null;
  chat: RoomChatMessage[];
}

type GameAction =
  | { type: 'SOCKET_STATUS'; status: SocketStatus }
  | { type: 'QUEUE_START'; timeControl: TimeControl; colorPreference: ColorPreference }
  | { type: 'QUEUE_TIMEOUT'; message: string }
  | { type: 'QUEUE_CANCELLED' }
  | { type: 'INIT_GAME'; payload: InitRoomPayload }
  | { type: 'MOVE_APPLIED'; payload: MovePayload }
  | { type: 'TIMER'; timers: Timers; roomGameId?: number }
  | { type: 'CHECK'; message: string }
  | { type: 'CLEAR_CHECK_ALERT' }
  | { type: 'DRAW_OFFER' }
  | { type: 'DRAW_MODAL_CLOSE' }
  | { type: 'DRAW_REJECTED'; message: string }
  | { type: 'OPP_DISCONNECTED'; message: string }
  | { type: 'CHAT_MESSAGE'; message: RoomChatMessage }
  | { type: 'GAME_OVER'; payload: GameOverPayload }
  | { type: 'RATING_UPDATE'; payload: RatingUpdatePayload }
  | { type: 'TOAST'; message: string | null }
  | { type: 'RESET' };

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const initialState: GameState = {
  phase: 'idle',
  socketStatus: 'idle',
  timeControl: null,
  colorPreference: null,
  roomGameId: null,
  color: null,
  opponentId: null,
  opponentName: null,
  playerRating: null,
  opponentRating: null,
  fen: startFen,
  turn: 'w',
  timers: { white: 300, black: 300 },
  moves: [],
  lastMove: null,
  validMoves: [],
  selectedSquare: null,
  checkSquare: null,
  checkAlert: null,
  checkAlertToken: 0,
  drawOfferIncoming: false,
  opponentDisconnected: false,
  toast: null,
  result: null,
  startedAt: null,
  chat: [],
};

const resultReason = (payload: GameOverPayload): string => {
  if (typeof payload.reason === 'string' && payload.reason.trim().length > 0) {
    const backendReason = payload.reason.trim();
    if (backendReason.toLowerCase().includes('draw')) return backendReason;
  }
  const text = `${payload.reason ?? ''} ${payload.message ?? ''}`.toLowerCase();
  if (text.includes('resign')) return 'by Resignation';
  if (text.includes('time') || text.includes('timer')) return 'by Timeout';
  if (text.includes('draw') || text.includes('agreement') || text.includes('agreed')) return 'by Agreement';
  if (text.includes('abandon') || text.includes('left')) return 'Opponent Abandoned';
  return 'by Checkmate';
};

const resolveGameResult = (
  payload: GameOverPayload,
  myColor: Color | null,
  opponentId: number | null
): 'win' | 'lose' | 'draw' => {
  if (payload.winner === 'draw' || payload.result === 'draw') return 'draw';

  if (typeof payload.winner === 'number' && opponentId !== null) {
    return payload.winner === opponentId ? 'lose' : 'win';
  }
  if (typeof payload.loser === 'number' && opponentId !== null) {
    return payload.loser === opponentId ? 'win' : 'lose';
  }
  if (typeof payload.winner === 'string' && (payload.winner === 'w' || payload.winner === 'b') && myColor) {
    return payload.winner === myColor ? 'win' : 'lose';
  }
  if (payload.result === 'win' || payload.result === 'lose') return payload.result;

  return 'draw';
};

const reducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'SOCKET_STATUS':
      return { ...state, socketStatus: action.status };
    case 'QUEUE_START':
      return {
        ...initialState,
        socketStatus: state.socketStatus,
        phase: 'matchmaking',
        timeControl: action.timeControl,
        colorPreference: action.colorPreference,
        timers: { white: Number(action.timeControl) * 60, black: Number(action.timeControl) * 60 },
      };
    case 'QUEUE_TIMEOUT':
      return { ...state, phase: 'idle', toast: action.message };
    case 'QUEUE_CANCELLED':
      return { ...initialState, socketStatus: state.socketStatus };
    case 'INIT_GAME': {
      const parsedMoves = (action.payload.moves ?? []).map((move, index) => ({ ...move, san: move.san ?? `${index + 1}. ${move.from}${move.to}` }));
      return {
        ...state,
        phase: 'active',
        color: action.payload.color,
        roomGameId: String(action.payload.roomGameId ?? action.payload.gameId),
        opponentId: action.payload.opponentId,
        opponentName: action.payload.opponentName ?? null,
        playerRating: typeof action.payload.playerRating === 'number' ? action.payload.playerRating : state.playerRating,
        opponentRating: typeof action.payload.opponentRating === 'number' ? action.payload.opponentRating : state.opponentRating,
        fen: action.payload.fen,
        turn: parseFen(action.payload.fen).turn,
        timers: { white: Number(action.payload.whiteTimer), black: Number(action.payload.blackTimer) },
        validMoves: action.payload.validMoves ?? [],
        moves: parsedMoves,
        lastMove: parsedMoves[parsedMoves.length - 1] ?? null,
        opponentDisconnected: false,
        startedAt: state.startedAt ?? Date.now(),
        chat: action.payload.chat ?? state.chat,
        toast: null,
      };
    }
    case 'MOVE_APPLIED': {
      if (state.phase !== 'active') return state;
      const backendMove = normalizeBackendMove(action.payload.move) ?? action.payload.move;
      const san = backendMove.san ?? toAlgebraic(state.fen, { ...backendMove, capture: action.payload.move.capture });
      const move = { ...backendMove, san };
      const nextFen = action.payload.fen;
      const nextTurn = action.payload.turn;
      const nextValidMoves = action.payload.validMoves ?? [];
      const checkSquare = isKingInCheck(nextFen, nextTurn);

      if (nextValidMoves.length === 0) {
        const result: GameResult = {
          result: checkSquare ? (state.color && state.color === nextTurn ? 'lose' : 'win') : 'draw',
          reason: checkSquare ? 'by Checkmate' : 'by Stalemate',
          message: checkSquare ? 'Checkmate! Game over.' : 'Draw by stalemate.',
          moves: state.moves.length + 1,
          durationSeconds: state.startedAt ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)) : 0,
        };
        return {
          ...state,
          phase: 'finished',
          fen: nextFen,
          turn: nextTurn,
          moves: [...state.moves, move],
          lastMove: move,
          validMoves: nextValidMoves,
          checkSquare,
          drawOfferIncoming: false,
          opponentDisconnected: false,
          result,
          toast: result.message ?? null,
        };
      }
      return {
        ...state,
        fen: nextFen,
        turn: nextTurn,
        moves: [...state.moves, move],
        lastMove: move,
        validMoves: nextValidMoves,
        checkSquare,
        drawOfferIncoming: false,
        toast: null,
      };
    }
    case 'TIMER':
      if (state.phase !== 'active') return state;
      if (
        typeof action.roomGameId === 'number' &&
        state.roomGameId &&
        action.roomGameId !== Number(state.roomGameId)
      ) {
        return state;
      }
      return { ...state, timers: action.timers };
    case 'CHECK':
      return {
        ...state,
        checkAlert: action.message || 'Check',
        checkAlertToken: state.checkAlertToken + 1,
        toast: null,
      };
    case 'CLEAR_CHECK_ALERT':
      return { ...state, checkAlert: null };
    case 'DRAW_OFFER':
      return { ...state, drawOfferIncoming: true };
    case 'DRAW_MODAL_CLOSE':
      return { ...state, drawOfferIncoming: false };
    case 'DRAW_REJECTED': {
      const rejectionText = state.opponentName ? `${state.opponentName} rejected your draw offer` : action.message;
      return { ...state, drawOfferIncoming: false, toast: rejectionText };
    }
    case 'OPP_DISCONNECTED':
      return { ...state, opponentDisconnected: true, toast: action.message };
    case 'CHAT_MESSAGE':
      return { ...state, chat: [...state.chat, action.message] };
    case 'GAME_OVER': {
      const result: GameResult = {
        result: resolveGameResult(action.payload, state.color, state.opponentId),
        reason: resultReason(action.payload),
        message: action.payload.message,
        moves: state.moves.length,
        durationSeconds: state.startedAt ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)) : 0,
      };
      return { ...state, phase: 'finished', result, drawOfferIncoming: false, opponentDisconnected: false, toast: action.payload.message ?? null };
    }
    case 'RATING_UPDATE': {
      const nextResult = state.result
        ? {
            ...state.result,
            ratingChange: action.payload.ratingChange,
            newRating: action.payload.yourNewRating,
            opponentNewRating: action.payload.opponentNewRating,
          }
        : state.result;
      return {
        ...state,
        playerRating: action.payload.yourNewRating,
        opponentRating: action.payload.opponentNewRating,
        result: nextResult,
      };
    }
    case 'TOAST':
      return { ...state, toast: action.message };
    case 'RESET':
      return {
        ...initialState,
        socketStatus: state.socketStatus,
        playerRating: state.playerRating,
      };
    default:
      return state;
  }
};

interface GameContextValue extends GameState {
  startMatchmaking: (timeControl: TimeControl, colorPreference: ColorPreference) => Promise<void>;
  cancelMatchmaking: () => void;
  makeMove: (move: ChessMove) => void;
  resignGame: () => void;
  offerDrawGame: () => void;
  acceptDrawOffer: () => void;
  rejectDrawOffer: () => void;
  resetGame: () => void;
  clearToast: () => void;
  clearCheckAlert: () => void;
  sendChatMessage: (message: string) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => onGameSocketStatus((status) => dispatch({ type: 'SOCKET_STATUS', status })), []);

  useEffect(
    () =>
      onGameSocketMessage((message) => {
        const payloadRecord = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : {};
        switch (message.type) {
          case RoomSocketEvents.INIT_ROOM_GAME:
          case RoomSocketEvents.ROOM_RECONNECT:
            dispatch({ type: 'INIT_GAME', payload: message.payload as InitRoomPayload });
            void saveActiveGameId(String((message.payload as InitRoomPayload).roomGameId ?? (message.payload as InitRoomPayload).gameId));
            break;
          case RoomSocketEvents.ROOM_MOVE:
            dispatch({ type: 'MOVE_APPLIED', payload: message.payload as MovePayload });
            break;
          case RoomSocketEvents.ROOM_TIMER_UPDATE:
            if (
              !Number.isFinite(Number(payloadRecord.whiteTimer)) ||
              !Number.isFinite(Number(payloadRecord.blackTimer))
            ) {
              break;
            }
            dispatch({
              type: 'TIMER',
              roomGameId:
                typeof payloadRecord.roomGameId === 'number'
                  ? payloadRecord.roomGameId
                  : undefined,
              timers: { white: Number(payloadRecord.whiteTimer ?? 0), black: Number(payloadRecord.blackTimer ?? 0) },
            });
            break;
          case RoomSocketEvents.MATCH_NOT_FOUND:
            dispatch({ type: 'QUEUE_TIMEOUT', message: String(payloadRecord.message ?? 'No opponent found') });
            break;
          case RoomSocketEvents.SEARCH_CANCELLED:
            dispatch({ type: 'QUEUE_CANCELLED' });
            break;
          case RoomSocketEvents.DRAW_OFFERED:
            dispatch({ type: 'DRAW_OFFER' });
            break;
          case RoomSocketEvents.DRAW_REJECTED:
            dispatch({ type: 'DRAW_REJECTED', message: String(payloadRecord.message ?? 'Opponent declined your draw offer') });
            break;
          case RoomSocketEvents.CHECK:
            dispatch({ type: 'CHECK', message: 'Check' });
            break;
          case RoomSocketEvents.ROOM_DRAW:
            dispatch({ type: 'GAME_OVER', payload: { result: 'draw', reason: String(payloadRecord.reason ?? 'by Agreement') } });
            void clearActiveGameId();
            break;
          case RoomSocketEvents.ROOM_GAME_OVER:
            dispatch({ type: 'GAME_OVER', payload: message.payload as GameOverPayload });
            void clearActiveGameId();
            break;
          case 'RATING_UPDATE':
            dispatch({ type: 'RATING_UPDATE', payload: message.payload as RatingUpdatePayload });
            break;
          case RoomSocketEvents.ROOM_LEFT:
            dispatch({
              type: 'GAME_OVER',
              payload: { ...(message.payload as GameOverPayload), result: 'lose' },
            });
            void clearActiveGameId();
            break;
          case RoomSocketEvents.ROOM_CHAT:
            dispatch({
              type: 'CHAT_MESSAGE',
              message: {
                sender: Number(payloadRecord.sender ?? 0),
                message: String(payloadRecord.message ?? ''),
                timestamp: Number(payloadRecord.timestamp ?? Date.now()),
              },
            });
            break;
          case RoomSocketEvents.ILLEGAL_ROOM_MOVE:
          case RoomSocketEvents.WRONG_PLAYER_MOVE:
          case RoomSocketEvents.SERVER_ERROR:
          case RoomSocketEvents.PAYLOAD_ERROR:
            dispatch({ type: 'TOAST', message: String(payloadRecord.message ?? 'Move rejected by server') });
            break;
          case 'room_opp_disconnected':
          case 'player_left':
            dispatch({ type: 'OPP_DISCONNECTED', message: String(payloadRecord.message ?? 'Opponent disconnected - waiting for them to return...') });
            break;
          default:
            break;
        }
      }),
    [],
  );

  useEffect(() => {
    const reconnect = async () => {
      const activeGameId = await getActiveGameId();
      if (activeGameId) {
        await connectGameSocket();
        reconnectRoomGame(activeGameId);
      }
    };
    void reconnect();
  }, []);

  const startMatchmaking = useCallback(async (timeControl: TimeControl, colorPreference: ColorPreference) => {
    dispatch({ type: 'QUEUE_START', timeControl, colorPreference });
    try {
      await connectGameSocket();
      joinQueue(timeControl, colorPreference);
    } catch (error) {
      dispatch({ type: 'QUEUE_CANCELLED' });
      dispatch({
        type: 'TOAST',
        message: error instanceof Error ? error.message : 'Unable to connect to game server',
      });
    }
  }, []);

  const cancelMatchmaking = useCallback(() => {
    try {
      cancelQueue();
    } catch {
      dispatch({ type: 'QUEUE_CANCELLED' });
    }
  }, []);

  const makeMove = useCallback(
    (move: ChessMove) => {
      if (!state.roomGameId) return;
      try {
        sendMove(state.roomGameId, move);
      } catch (error) {
        dispatch({ type: 'TOAST', message: error instanceof Error ? error.message : 'Unable to send move' });
      }
    },
    [state.roomGameId],
  );

  const resignGame = useCallback(() => {
    if (state.roomGameId) resign(state.roomGameId);
  }, [state.roomGameId]);

  const offerDrawGame = useCallback(() => {
    if (state.roomGameId) offerDraw(state.roomGameId);
  }, [state.roomGameId]);

  const acceptDrawOffer = useCallback(() => {
    if (state.roomGameId) acceptDraw(state.roomGameId);
  }, [state.roomGameId]);

  const rejectDrawOffer = useCallback(() => {
    dispatch({ type: 'DRAW_MODAL_CLOSE' });
    if (state.roomGameId) rejectDraw(state.roomGameId);
  }, [state.roomGameId]);

  const resetGame = useCallback(() => {
    void clearActiveGameId();
    dispatch({ type: 'RESET' });
  }, []);

  const clearToast = useCallback(() => dispatch({ type: 'TOAST', message: null }), []);
  const clearCheckAlert = useCallback(() => dispatch({ type: 'CLEAR_CHECK_ALERT' }), []);

  const sendChatMessage = useCallback(
    (message: string) => {
      if (!state.roomGameId) return;
      const trimmed = message.trim();
      if (!trimmed) return;
      try {
        sendRoomChat(state.roomGameId, trimmed);
      } catch (error) {
        dispatch({
          type: 'TOAST',
          message: error instanceof Error ? error.message : 'Unable to send chat message',
        });
      }
    },
    [state.roomGameId],
  );

  const value = useMemo<GameContextValue>(
    () => ({
      ...state,
      startMatchmaking,
      cancelMatchmaking,
      makeMove,
      resignGame,
      offerDrawGame,
      acceptDrawOffer,
      rejectDrawOffer,
      resetGame,
      clearToast,
      clearCheckAlert,
      sendChatMessage,
    }),
    [state, startMatchmaking, cancelMatchmaking, makeMove, resignGame, offerDrawGame, acceptDrawOffer, rejectDrawOffer, resetGame, clearToast, clearCheckAlert, sendChatMessage],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export const useGame = (): GameContextValue => {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside GameProvider');
  return value;
};
