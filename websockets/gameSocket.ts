import type { ChessMove, PromotionPiece } from '../utils/chessHelpers';
import { socketClient, type SocketEnvelope } from './socketClient';

export const RoomSocketEvents = {
  INIT_ROOM_GAME: 'init_room_game',
  ROOM_MOVE: 'room_move',
  ROOM_LEAVE_GAME: 'room_leave_game',
  ROOM_RECONNECT: 'room_reconnect',
  ROOM_TIMER_UPDATE: 'room_timer_update',
  ROOM_GAME_OVER: 'room_game_over',
  ROOM_LEFT: 'room_left',
  ROOM_DRAW: 'room_draw',
  ILLEGAL_ROOM_MOVE: 'illegal_room_move',
  DRAW_OFFERED: 'draw_offered',
  OFFER_DRAW: 'offer_draw',
  ACCEPT_DRAW: 'accept_draw',
  REJECT_DRAW: 'reject_draw',
  DRAW_REJECTED: 'draw_rejected',
  MATCH_NOT_FOUND: 'match_not_found',
  ALREADY_IN_QUEUE: 'already_in_queue',
  SEARCH_CANCELLED: 'search_cancelled',
  CHECK: 'check_move',
  WRONG_PLAYER_MOVE: 'wrong_player_move',
  SERVER_ERROR: 'server_error',
  PAYLOAD_ERROR: 'payload_error',
  ROOM_CHAT: 'room_chat',
} as const;

export type TimeControl = '5' | '10';
export type ColorPreference = 'w' | 'b' | 'r';

export interface InitRoomPayload {
  color: 'w' | 'b';
  fen: string;
  whiteTimer: number;
  blackTimer: number;
  opponentId: number;
  roomGameId: number;
  gameId?: number;
  validMoves?: ChessMove[];
  moves?: ChessMove[];
  capturedPieces?: string[];
  opponentName?: string | null;
  playerName?: string | null;
  chat?: RoomChatMessage[];
}

export interface MovePayload {
  move: ChessMove;
  turn: 'w' | 'b';
  fen: string;
  validMoves?: ChessMove[];
  capturedPiece?: string | null;
}

export interface TimerPayload {
  whiteTimer: number;
  blackTimer: number;
}

export interface GameOverPayload {
  result?: 'win' | 'lose' | 'draw';
  reason?: string;
  message?: string;
  winner?: string | number;
  loser?: string | number;
  roomStatus?: string;
  gameStatus?: string;
}

export interface RoomChatMessage {
  sender: number;
  message: string;
  timestamp: number;
}

export const connectGameSocket = () => socketClient.connect('/room');
export const disconnectGameSocket = () => socketClient.disconnect();
export const onGameSocketMessage = (handler: (message: SocketEnvelope) => void) => socketClient.onMessage(handler);
export const onGameSocketStatus = socketClient.onStatus.bind(socketClient);

export const joinQueue = (timeControl: TimeControl, colorPreference: ColorPreference): void => {
  socketClient.send(RoomSocketEvents.INIT_ROOM_GAME, { timeControl, colorPreference });
};

export const cancelQueue = (): void => {
  socketClient.send('cancel_search', {});
};

export const sendMove = (roomGameId: string, move: ChessMove): void => {
  const promotion: PromotionPiece | undefined = move.promotion;
  socketClient.send(RoomSocketEvents.ROOM_MOVE, {
    roomGameId: Number(roomGameId),
    from: move.from,
    to: move.to,
    promotion,
  });
};

export const resign = (roomGameId: string): void => {
  socketClient.send(RoomSocketEvents.ROOM_LEAVE_GAME, { roomGameId: Number(roomGameId) });
};

export const reconnectRoomGame = (roomGameId: string): void => {
  socketClient.send(RoomSocketEvents.ROOM_RECONNECT, { roomGameId: Number(roomGameId) });
};

export const offerDraw = (roomGameId: string): void => {
  socketClient.send(RoomSocketEvents.OFFER_DRAW, { roomGameId: Number(roomGameId) });
};

export const acceptDraw = (roomGameId: string): void => {
  socketClient.send(RoomSocketEvents.ACCEPT_DRAW, { roomGameId: Number(roomGameId) });
};

export const rejectDraw = (roomGameId: string): void => {
  socketClient.send(RoomSocketEvents.REJECT_DRAW, { roomGameId: Number(roomGameId) });
};

export const sendRoomChat = (roomGameId: string, message: string): void => {
  socketClient.send(RoomSocketEvents.ROOM_CHAT, { roomGameId: Number(roomGameId), message });
};
