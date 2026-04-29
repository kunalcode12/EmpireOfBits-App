export const GameMessages = {
  // Client -> Server
  INIT_GAME: 'init_game',
  MOVE: 'move',
  LEAVE_GAME: 'leave_game',
  RECONNECT_REQ: 'reconnect_req',
  OFFER_DRAW: 'offer_draw',
  ACCEPT_DRAW: 'accept_draw',
  REJECT_DRAW: 'reject_draw',
  REQUEST_VALID_MOVES: 'request_valid_moves',
  CANCEL_SEARCH: 'cancel_search',

  // Server -> Client
  ASSIGN_ID: 'assign_id',
  GAME_ACTIVE: 'ongoing_game',
  GAME_NOT_FOUND: 'game_not_found',
  GAME_OVER: 'game_over',
  RECONNECT: 'reconnect',
  GAME_FOUND: 'existing_game_found',
  CHECK: 'check_move',
  STALEMATE: 'game_drawn',
  TIMER_UPDATE: 'timer_update',
  TIME_EXCEEDED: 'time_exceeded',
  WRONG_MOVE: 'wrong_move',
  DRAW_OFFERED: 'draw_offered',
  DRAW_ACCEPTED: 'draw_accepted',
  DRAW_REJECTED: 'draw_rejected',
  OPP_RECONNECTED: 'opp_reconnected',
  DISCONNECTED: 'player_left',
  WRONG_PLAYER_MOVE: 'wrong_player_move',
  USER_HAS_JOINED: 'user_has_joined',
  MATCH_NOT_FOUND: 'match_not_found',
  PLAYER_UNAVAILABLE: 'player_unavailable',
  NO_ACTIVE_GAMES: 'no_active_games',
  DRAW_LIMIT_REACHED: 'draw_limit_reached',
  NO_ACTIVE_USERS: 'no_active_users',
  QUEUE_EXPIRED: 'queue_expired',
  GAME_DRAW: 'game_draw',
  DRAW_COOLDOWN: 'draw_cooldown',
  ALREADY_IN_QUEUE: 'already_in_queue',
  SEARCH_CANCELLED: 'search_cancelled',
} as const;
export const ComputerGameMessages = {
  //No Draw offers are there either you win or lose
  COMPUTER_GAME_ACTIVE: 'computer_game_active',
  COMPUTER_GAME_OVER: 'computer_game_over',
  INIT_COMPUTER_GAME: 'init_computer_game',
  NO_ACTIVE_GAME: 'no_active_game',
  CHECK_ACTIVE_GAME: 'check_active_game',
  RECONNECT_COMPUTER_GAME: 'reconnect_computer_game',
  PLAYER_MOVE: 'player_move',
  PLAYER_QUIT: 'player_quit',
  PLAYER_WON: 'player_won',
  COMPUTER_WON: 'computer_won',
  COMPUTER_LOST: 'computer_lost',
  COMPUTER_MOVE: 'computer_move',
  NOT_YOUR_TURN: 'not_your_turn',
  PLAYER_CHECK: 'player_check',
  COMPUTER_CHECK: 'computer_check',
  EXISTING_COMPUTER_GAME: 'existing_computer_game',
} as const;

export const RoomMessages = {
  // Client -> Server
  INIT_ROOM_GAME: 'init_room_game',
  ROOM_MOVE: 'room_move',
  LEAVE_ROOM: 'leave_room',
  ROOM_CHAT: 'room_chat',
  ROOM_LEAVE_GAME: 'room_leave_game',
  ROOM_TAKEBACK: 'room_takeback',
  ROOM_ARENA_EVENT: 'room_arena_event',

  // Server -> Client
  ASSIGN_ID_FOR_ROOM: 'assign_id_for_room',
  ROOM_GAME_ACTIVE: 'room_game_active',
  ROOM_GAME_OVER: 'room_game_over',
  ROOM_TIMER_UPDATE: 'room_timer_update',
  ROOM_TIME_EXCEEDED: 'room_timer_exceeded',
  ROOM_USER_JOINED: 'room_user_joined',
  ROOM_READY_TO_START: 'room_ready_to_start',
  ROOM_NOT_FOUND: 'room_not_found',
  ROOM_NOT_READY: 'room_not_ready',
  ROOM_GAME_ACTIVE_ERROR: 'room_game_active_error',
  ROOM_OPP_DISCONNECTED: 'room_opp_disconnected',
  OPP_ROOM_RECONNECTED: 'opp_room_reconnect',
  ROOM_RECONNECT: 'room_reconnect',
  ROOM_LEFT: 'room_left',
  ROOM_GAME_NOT_FOUND: 'room_game_not_found',
  NO_ROOM_RECONNECTION: 'no_room_reconnection',
  WRONG_ROOM_MESSAGE: 'wrong_room_message',
  ILLEGAL_ROOM_MOVE: 'illegal_room_move',
  ROOM_DRAW: 'room_draw',
  ROOM_OPPONENT_LEFT: 'room_opponent_left',
} as const;

export const ErrorMessages = {
  SERVER_ERROR: 'server_error',
  UNAUTHORIZED: 'unauthorized',
  PAYLOAD_ERROR: 'payload_error',
  INVALID_AUTH: 'invalid_auth',
  NO_AUTH: 'no_auth',
} as const;

// Combined export for backward compatibility if needed
export const Messages = {
  ...GameMessages,
  ...RoomMessages,
  ...ErrorMessages,
} as const;
