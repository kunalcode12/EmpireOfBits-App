import { Chess } from 'chess.js';
import { WebSocket } from 'ws';
import { roomManager } from '../Classes/RoomManager';
import pc from '../clients/prismaClient';
import { redis } from '../clients/redisClient';
import provideValidMoves, {
  MOVE_BEFORE_SAFE,
  parseChat,
  parseMoves,
  sendMessage,
} from '../utils/chessUtils';
import { ErrorMessages, GameMessages, RoomMessages } from '../utils/messages';
import { Move } from './GameServices';

export async function getRoomGameState(gameId: number) {
  const gameExists = (await redis.hGetAll(`room-game:${gameId}`)) as Record<
    string,
    string
  >;

  const movesRaw = await redis.lRange(`room-game:${gameId}:moves`, 0, -1);
  const moves = movesRaw.map((m) => JSON.parse(m));

  const chatRaw = await redis.lRange(`room-game:${gameId}:chat`, 0, -1);
  const chat = chatRaw.map((c) => JSON.parse(c));

  const capturedPieces = await redis.lRange(
    `room-game:${gameId}:capturedPieces`,
    0,
    -1
  );

  if (
    !gameExists ||
    Object.keys(gameExists).length === 0 ||
    gameExists.status === RoomMessages.ROOM_GAME_OVER
  ) {
    const restoredGame = await roomManager.restoreGameFromDB(gameId);
    if (!restoredGame) {
      return null;
    }
    return restoredGame;
  }

  return {
    user1: Number(gameExists.user1),
    user2: Number(gameExists.user2),
    fen: gameExists.fen,
    whiteTimer: Number(gameExists.whiteTimer),
    blackTimer: Number(gameExists.blackTimer),
    moves: moves,
    moveCount: Number(gameExists.moveCount),
    status: gameExists.status,
    chat: chat,
    capturedPieces: capturedPieces,
    roomCode: gameExists.roomCode,
  };
}

export async function handleRoomMove(
  userId: Number,
  userSocket: WebSocket,
  move: Move,
  gameId: number,
  socketManager: Map<number, WebSocket>
) {
  const existingGame = await getRoomGameState(gameId);
  if (!existingGame) {
    userSocket.send(
      JSON.stringify({
        type: RoomMessages.ROOM_GAME_NOT_FOUND,
        payload: { message: 'Game Message Not Found' },
      })
    );
    return;
  }
  const chess = new Chess(existingGame.fen);
  const turn = existingGame.fen.split(' ')[1];
  const movingPlayerColor = turn === 'w' ? 'w' : 'b';
  const opponentId =
    userId === existingGame.user1 ? existingGame.user2 : existingGame.user1;
  if (!opponentId) {
    console.log('Opponent Id Error');
    return null;
  }

  if (
    (turn === 'w' && existingGame.user1 !== userId) ||
    (turn === 'b' && existingGame.user2 !== userId)
  ) {
    const message = JSON.stringify({
      type: GameMessages.WRONG_PLAYER_MOVE,
      payload: {
        message: 'Not your turn',
      },
    });
    userSocket.send(message);
    return null;
  }

  let capturedPiece = null;
  try {
    const boardMove = chess.move({
      to: move.to,
      from: move.from,
      promotion: move.promotion || 'q',
    });

    await redis.rPush(`room-game:${gameId}:moves`, JSON.stringify(move));
    await redis.hSet(`room-game:${gameId}`, 'fen', chess.fen());

    if (boardMove.captured) {
      const capturedColor = boardMove.color === 'b' ? 'w' : 'b';
      const pieceCaptured = boardMove.captured.toUpperCase(); // p => P, k=> K
      const capturedCode = `${capturedColor}${pieceCaptured}`; //bK=> for frontend display of piece
      capturedPiece = capturedCode;

      await redis.rPush(`room-game:${gameId}:capturedPieces`, capturedPiece);
      console.log('Room Captured Piece:', capturedPiece);
    }
    const updatedMoveCnt = await redis.hIncrBy(
      `room-game:${gameId}`,
      'moveCount',
      1
    );
    if (updatedMoveCnt % MOVE_BEFORE_SAFE === 0) {
      const updatedGameData = (await redis.hGetAll(
        `room-game:${gameId}`
      )) as Record<string, string>;

      await saveGameProgress(
        gameId,
        updatedGameData,
        updatedGameData.currentFen,
        movingPlayerColor
      );
    }
  } catch (error) {
    console.error('Error processing Room-move:', error);
    userSocket.send(
      JSON.stringify({
        type: RoomMessages.ILLEGAL_ROOM_MOVE,
        payload: {
          message:
            'Server error while processing move or illegal move attempted',
        },
      })
    );
    return;
  }
  const opponentSocket = socketManager.get(opponentId);
  const validMoves = provideValidMoves(chess.fen());

  const oppPayload = {
    type: RoomMessages.ROOM_MOVE,
    payload: {
      move,
      turn: chess.turn(),
      fen: chess.fen(),
      validMoves,
      capturedPiece,
    },
  };
  const currentPlayerPayload = {
    type: RoomMessages.ROOM_MOVE,
    payload: {
      move,
      turn: chess.turn(),
      fen: chess.fen(),
      validMoves,
      capturedPiece,
    },
  };

  // Send the latest board snapshot before terminal checks.
  // This prevents loser-side freeze if ROOM_GAME_OVER is delayed/dropped.
  userSocket.send(JSON.stringify(currentPlayerPayload));
  opponentSocket?.send(JSON.stringify(oppPayload));

  if (chess.isStalemate()) {
    await handleRoomDraw(
      userSocket,
      opponentSocket,
      gameId,
      'Draw by stalemate'
    );
    return;
  } else if (chess.isInsufficientMaterial()) {
    await handleRoomDraw(
      userSocket,
      opponentSocket,
      gameId,
      'Draw due to insufficient material'
    );
    return;
  } else if (chess.isThreefoldRepetition()) {
    await handleRoomDraw(
      userSocket,
      opponentSocket,
      gameId,
      'Draw by threefold repetition'
    );
    return;
  } else if (chess.isDraw()) {
    await handleRoomDraw(
      userSocket,
      opponentSocket,
      gameId,
      'Draw by 50-move rule'
    );
    return;
  }
  // Game Over logic
  if (chess.isGameOver()) {
    const winnerColor = chess.turn() === 'w' ? 'b' : 'w';
    const winnerId = Number(userId);
    const loserId = Number(opponentId);

    // 1. Get all final data from Redis before deleting
    const [final_moves, final_chat, final_CapturedPieces] = await Promise.all([
      parseMoves(`room-game:${gameId}:moves`),
      parseChat(`room-game:${gameId}:chat`),
      redis.lRange(`room-game:${gameId}:capturedPieces`, 0, -1),
    ]);

    // 2. Save to Database (Transaction)
    await pc.$transaction([
      pc.game.update({
        where: { id: gameId },
        data: {
          winnerId,
          loserId,
          draw: false,
          endedAt: new Date(),
          moves: final_moves,
          chat: final_chat,
          capturedPieces: final_CapturedPieces,
          currentFen: chess.fen(),
          status: 'FINISHED',
        },
      }),
      pc.room.update({
        where: { code: existingGame.roomCode },
        data: { status: 'FINISHED' },
      }),
    ]);
    await redis
      .multi()
      .hIncrBy(`stats`, 'roomGamesCount', 1)
      .hSet(`room-game:${gameId}`, {
        status: RoomMessages.ROOM_GAME_OVER,
        winner: winnerId.toString(),
      })
      .del(`user:${winnerId}:room-game`)
      .del(`user:${loserId}:room-game`)
      .del(`room-game:${gameId}`)
      .del(`room-game:${gameId}:moves`)
      .del(`room-game:${gameId}:chat`)
      .del(`room-game:${gameId}:capturedPieces`)
      .sRem('room-active-games', gameId.toString())
      .exec();

    // Cleanup user mappings so they can join new games
    await redis.del(`user:${winnerId}:room-game`);
    await redis.del(`user:${loserId}:room-game`);

    await redis.hIncrBy(`stats`, 'roomGamesCount', 1);

    // 4. Send Messages
    sendMessage(
      userSocket,
      JSON.stringify({
        type: RoomMessages.ROOM_GAME_OVER,
        payload: {
          result: 'win',
          message: "🏆 Congratulations! You've won.",
          winner: winnerColor,
          roomStatus: 'FINISHED',
        },
      })
    );

    sendMessage(
      opponentSocket,
      JSON.stringify({
        type: RoomMessages.ROOM_GAME_OVER,
        payload: {
          result: 'lose',
          message: '💔 Checkmate! Game over.',
          winner: winnerColor,
          roomStatus: 'FINISHED',
        },
      })
    );

    return;
  }

  if (chess.isCheck()) {
    const defenderCheckMessage = {
      type: GameMessages.CHECK,
      payload: {
        message: 'Check',
      },
    };

    opponentSocket?.send(JSON.stringify(defenderCheckMessage));

    return;
  }
}

export async function handleRoomDraw(
  userSocket: WebSocket,
  opponentSocket: WebSocket | undefined,
  gameId: number,
  reason: string
): Promise<void> {
  try {
    const message = JSON.stringify({
      type: RoomMessages.ROOM_DRAW,
      payload: {
        reason,
        roomStatus: 'FINISHED',
        gameStatus: 'GAME_OVER',
      },
    });

    userSocket.send(message);
    opponentSocket?.send(message);

    await redis.hSet(`room-game:${gameId}`, {
      status: RoomMessages.ROOM_GAME_OVER,
      winner: 'draw',
      drawReason: reason,
    });
    await redis.sRem(`room-active-games`, gameId.toString());
    await redis.expire(`room-game:${gameId}`, 86400);

    // Get roomCode and chat from Redis for DB update
    const gameData = (await redis.hGetAll(`room-game:${gameId}`)) as Record<
      string,
      string
    >;
    const roomCode = gameData.roomCode as string;

    // Get moves and chat from Redis using the parseMoves and parseChat util functions
    const final_chat = await parseChat(`room-game:${gameId}:chat`);
    const final_moves = await parseMoves(`room-game:${gameId}:moves`);

    await pc.$transaction([
      pc.game.update({
        where: { id: gameId },
        data: {
          draw: true,
          status: 'FINISHED',
          endedAt: new Date(),
          moves: final_moves,
          chat: final_chat,
          currentFen: gameData.fen,
        },
      }),
      pc.room.update({
        where: { code: roomCode },
        data: {
          status: 'FINISHED',
          updatedAt: new Date(),
        },
      }),
    ]);
    await redis.hIncrBy(`stats`, 'roomGamesCount', 1);
    console.log(
      `GameDraw ${gameId}: ${reason} - Chat messages saved: ${final_chat.length}`
    );
  } catch (error) {
    console.error(`Error handling draw for game ${gameId}:`, error);
  }
}

export async function handleRoomReconnection(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  roomSocketManager: Map<number, WebSocket>
) {
  const existingGame = await getRoomGameState(gameId);

  if (!existingGame) {
    sendMessage(
      userSocket,
      JSON.stringify({
        type: RoomMessages.ROOM_GAME_OVER,
        payload: {
          message: 'The game you are looking for is over',
          roomStatus: 'FINISHED',
        },
      })
    );
    return;
  }

  const opponentId =
    userId === existingGame.user1 ? existingGame.user2 : existingGame.user1;
  const userColor = userId === existingGame.user1 ? 'w' : 'b';
  const chatArr = existingGame.chat ? existingGame.chat : [];
  await redis.sAdd('room-active-games', gameId.toString());

  // Get room info using roomCode from existingGame
  const room = await pc.room.findUnique({
    where: { code: existingGame.roomCode },
    include: {
      createdBy: { select: { id: true, name: true } },
      joinedBy: { select: { id: true, name: true } },
    },
  });

  // Checking if room exists and is finished/cancelled
  if (!room) {
    sendMessage(
      userSocket,
      JSON.parse(
        JSON.stringify({
          type: RoomMessages.ROOM_NOT_FOUND,
          payload: {
            message: 'The room you are looking for does not exist',
            roomStatus: 'FINISHED',
          },
        })
      )
    );
    return;
  }

  if (room.status === 'FINISHED' || room.status === 'CANCELLED') {
    sendMessage(
      userSocket,
      JSON.parse(
        JSON.stringify({
          type: RoomMessages.ROOM_GAME_OVER,
          payload: {
            message: `This room has been ${room.status.toLowerCase()}. You cannot reconnect.`,
            roomStatus: room.status,
          },
        })
      )
    );
    return;
  }

  const isCreator = room?.createdById === userId;
  const opponentInfo = isCreator ? room?.joinedBy : room?.createdBy;

  // Get valid moves for current position
  const chess = new Chess(existingGame.fen);
  const validMoves = chess.moves({ verbose: true });

  // Send reconnection data to the user with room context
  userSocket.send(
    JSON.stringify({
      type: RoomMessages.ROOM_RECONNECT,
      payload: {
        color: userColor,
        gameId: gameId,
        fen: existingGame.fen,
        whiteTimer: Number(existingGame.whiteTimer),
        blackTimer: Number(existingGame.blackTimer),
        validMoves: validMoves,
        moves: existingGame.moves,
        count: existingGame.moveCount,
        chat: chatArr,
        capturedPieces: existingGame.capturedPieces || [],
        roomCode: existingGame.roomCode,
        isCreator: isCreator,
        opponentId: opponentId,
        opponentName: opponentInfo?.name || null,
        roomGameId: gameId,
      },
    })
  );

  console.log(
    `User ${userId} reconnected to room-game:${gameId}, restarting timers...`
  );
  roomManager.startRoomTimer();
}

/** Normalise a move from Redis/DB to { from, to, promotion? } for chess.js */
function normaliseMove(m: unknown): { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null {
  if (m == null) return null;
  if (typeof m === 'string') {
    const s = m.trim();
    if (s.length >= 4) {
      const from = s.slice(0, 2).toLowerCase();
      const to = s.slice(2, 4).toLowerCase();
      if (/^[a-h][1-8]$/.test(from) && /^[a-h][1-8]$/.test(to)) {
        const prom = s.length >= 5 ? s[4].toLowerCase() : undefined;
        const promotion = prom && ['q', 'r', 'b', 'n'].includes(prom) ? (prom as 'q' | 'r' | 'b' | 'n') : undefined;
        return { from, to, promotion };
      }
    }
    return null;
  }
  if (typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const from = typeof o.from === 'string' ? o.from.trim().toLowerCase() : String(o.from ?? '').trim().toLowerCase();
  const to = typeof o.to === 'string' ? o.to.trim().toLowerCase() : String(o.to ?? '').trim().toLowerCase();
  if (!from || !to || from.length !== 2 || to.length !== 2) return null;
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return null;
  const prom = o.promotion;
  const promotion =
    prom === null || prom === undefined
      ? undefined
      : ['q', 'r', 'b', 'n'].includes(String(prom).toLowerCase())
        ? (String(prom).toLowerCase() as 'q' | 'r' | 'b' | 'n')
        : undefined;
  return { from, to, promotion };
}

/**
 * Reverts the last two moves (one full turn). Only the player whose turn it is
 * after the takeback may request (shield owner uses on their turn).
 * Uses replay-from-start (not undo()) because Chess loaded from FEN has no move history.
 */
export async function handleRoomTakeback(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  socketManager: Map<number, WebSocket>
): Promise<void> {
  try {
    const existingGame = await getRoomGameState(gameId);
    if (!existingGame) {
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ROOM_GAME_NOT_FOUND,
          payload: { message: 'Game not found' },
        })
      );
      return;
    }

    const rawMoves = existingGame.moves;
    const moves = Array.isArray(rawMoves) ? rawMoves : [];
    if (moves.length < 2) {
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ILLEGAL_ROOM_MOVE,
          payload: { message: 'Not enough moves to take back (need at least 2)' },
        })
      );
      return;
    }

    const chess = new Chess();
    const replayCount = moves.length - 2;
    for (let i = 0; i < replayCount; i++) {
      const norm = normaliseMove(moves[i]);
      if (!norm) {
        console.error(`[Takeback] Invalid move at index ${i}:`, moves[i]);
        userSocket.send(
          JSON.stringify({
            type: RoomMessages.ILLEGAL_ROOM_MOVE,
            payload: { message: 'Takeback failed: invalid move data' },
          })
        );
        return;
      }
      let applied;
      try {
        applied = chess.move(norm);
      } catch (err) {
        console.error(`[Takeback] chess.move threw at index ${i}:`, norm, err);
        userSocket.send(
          JSON.stringify({
            type: RoomMessages.ILLEGAL_ROOM_MOVE,
            payload: { message: 'Takeback failed: could not replay moves' },
          })
        );
        return;
      }
      if (!applied) {
        console.error(`[Takeback] chess.move returned null at index ${i}, fen=${chess.fen()}`, norm);
        userSocket.send(
          JSON.stringify({
            type: RoomMessages.ILLEGAL_ROOM_MOVE,
            payload: { message: 'Takeback failed: could not replay moves' },
          })
        );
        return;
      }
    }

    const turnAfterTakeback = chess.turn();
    const requesterMustBeUserId =
      turnAfterTakeback === 'w' ? existingGame.user1 : existingGame.user2;
    if (userId !== requesterMustBeUserId) {
      userSocket.send(
        JSON.stringify({
          type: GameMessages.WRONG_PLAYER_MOVE,
          payload: { message: 'Takeback is only available on your turn' },
        })
      );
      return;
    }

    const newMoves = moves.slice(0, -2);
    const movesKey = `room-game:${gameId}:moves`;
    const capturedKey = `room-game:${gameId}:capturedPieces`;
    await redis.del(movesKey);
    for (const m of newMoves) {
      await redis.rPush(movesKey, JSON.stringify(m));
    }

    const currentCaptured = await redis.lRange(capturedKey, 0, -1);
    let toRemove = 0;
    const tempChess = new Chess(chess.fen());
    const secondLast = normaliseMove(moves[moves.length - 2]);
    const last = normaliseMove(moves[moves.length - 1]);
    if (secondLast) {
      try {
        const s = tempChess.move(secondLast);
        if (s?.captured) toRemove++;
      } catch {
        // ignore
      }
    }
    if (last) {
      try {
        const l = tempChess.move(last);
        if (l?.captured) toRemove++;
      } catch {
        // ignore
      }
    }
    const newCaptured =
      toRemove === 0
        ? currentCaptured
        : currentCaptured.slice(0, -toRemove);
    await redis.del(capturedKey);
    for (const p of newCaptured) {
      await redis.rPush(capturedKey, p);
    }

    await redis.hSet(`room-game:${gameId}`, {
      fen: chess.fen(),
      moveCount: String(newMoves.length),
    });

    const validMoves = provideValidMoves(chess.fen());
    const whiteTimer = Number(existingGame.whiteTimer);
    const blackTimer = Number(existingGame.blackTimer);
    const payload = {
      fen: chess.fen(),
      moves: newMoves,
      validMoves,
      capturedPieces: newCaptured,
      whiteTimer,
      blackTimer,
    };

    const takebackMessage = JSON.stringify({
      type: RoomMessages.ROOM_TAKEBACK,
      payload,
    });

    const whiteSocket = socketManager.get(existingGame.user1);
    const blackSocket = socketManager.get(existingGame.user2);
    whiteSocket?.send(takebackMessage);
    blackSocket?.send(takebackMessage);
  } catch (error) {
    console.error('Error in handleRoomTakeback:', error);
    userSocket.send(
      JSON.stringify({
        type: RoomMessages.ILLEGAL_ROOM_MOVE,
        payload: { message: 'Takeback failed. Please try again.' },
      })
    );
  }
}

export async function handleRoomChat(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  message: string,
  roomSocketManager: Map<number, WebSocket>
) {
  try {
    const existingGame = await getRoomGameState(gameId);

    if (!existingGame) {
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ROOM_GAME_OVER,
          payload: { message: 'The Game You are looking for is over' },
        })
      );
      return;
    }
    const opponentId =
      userId === existingGame.user1 ? existingGame.user2 : existingGame.user1;
    const opponentSocket = roomSocketManager.get(opponentId);
    await redis.rPush(
      `room-game:${gameId}:chat`,
      JSON.stringify({
        sender: userId,
        message,
        timestamp: Date.now(),
      })
    );
    const timestamp = Date.now();
    const chatPayload = {
      type: RoomMessages.ROOM_CHAT,
      payload: {
        message: message,
        sender: userId,
        timestamp: timestamp,
      },
    };
    userSocket.send(JSON.stringify(chatPayload));
    // Send to opponent only - sender will see their own message from frontend
    opponentSocket?.send(JSON.stringify(chatPayload));
  } catch (error) {
    console.log('Error in handleRoomChat: ', error);
    userSocket.send(
      JSON.stringify({
        type: ErrorMessages.SERVER_ERROR,
        payload: {
          message: 'Server Error, Please send the message again!',
        },
      })
    );
  }
}

export function validateRoomGamePayload(
  type: string,
  payload: any
): string | null {
  if (!payload) {
    return 'Missing Payload Object';
  }
  switch (type) {
    case RoomMessages.INIT_ROOM_GAME:
      if (!payload.timeControl) return 'Missing timeControl';
      if (!payload.colorPreference) return 'Missing colorPreference';
      break;
    case RoomMessages.ROOM_RECONNECT:
      if (!payload.roomGameId) return 'Missing GameId';
      break;
    case RoomMessages.ROOM_MOVE:
      if (!payload.to || !payload.from || !payload.roomGameId)
        return 'Missing Move or GameId';
      break;
    case RoomMessages.ROOM_CHAT:
      if (!payload.message) return 'Missing message';
      if (!payload.roomGameId) return 'Missing roomGameId';
      break;
    case RoomMessages.ROOM_LEAVE_GAME:
      if (!payload.roomGameId) return 'Missing field: gameId';
      break;
    case RoomMessages.ROOM_TAKEBACK:
      if (!payload.roomGameId) return 'Missing roomGameId';
      break;
    default:
      return null;
  }
  return null;
}

export async function handleRoomGameLeave(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  socketManager: Map<number, WebSocket>
) {
  try {
    console.log(`[Room Resign] user ${userId} requested resign for game ${gameId}`);
    const room = await pc.room.findFirst({
      where: {
        game: { id: gameId },
        status: { notIn: ['FINISHED', 'CANCELLED'] },
      },
      include: { game: true },
    });

    if (!room) {
      console.log(`[Room Game Leave] room not found for game ${gameId}`);
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ROOM_NOT_FOUND,
          payload: { message: 'Room not found' },
        })
      );
      return;
    }

    if (room.status !== 'ACTIVE') {
      console.log(`[Room Game Leave] room is not active for game ${gameId}`);
      userSocket.send(
        JSON.stringify({
          type: ErrorMessages.SERVER_ERROR,
          payload: { message: 'No active game to leave' },
        })
      );
      return;
    }

    console.log(`[Room Game Leave] room status: ${room.status}`);
    const isCreator = room.createdById === userId;
    const winnerId = isCreator ? room.joinedById : room.createdById;
    if (!winnerId) {
      console.log(`[Room Game Leave] winnerId missing for game ${gameId}`);
      userSocket.send(
        JSON.stringify({
          type: ErrorMessages.SERVER_ERROR,
          payload: { message: 'Unable to resolve winner for this game' },
        })
      );
      return;
    }

    const finalGameData = (await redis.hGetAll(
      `room-game:${gameId}`
    )) as Record<string, string>;
    console.log(`[Room Game Leave] finalGameData: ${JSON.stringify(finalGameData)}`);
    let final_chat: any[] = [];
    let final_moves: any[] = [];
    if (finalGameData && Object.keys(finalGameData).length > 0) {
      final_chat = await parseChat(`room-game:${gameId}:chat`);
      final_moves = await parseMoves(`room-game:${gameId}:moves`);
    }

    await pc.$transaction([
      pc.game.update({
        where: { id: gameId },
        data: {
          winnerId,
          loserId: userId,
          draw: false,
          endedAt: new Date(),
          status: 'FINISHED',
          moves: final_moves,
          chat: final_chat,
          currentFen: finalGameData?.fen ?? room.game?.currentFen,
        },
      }),
      pc.room.update({
        where: { id: room.id },
        data: { status: 'FINISHED' },
      }),
    ]);
    await redis.hIncrBy(`stats`, 'roomGamesCount', 1);

    const oppSocket = socketManager.get(winnerId);

    // Send game over message to winner with confetti
    sendMessage(
      oppSocket,
      JSON.stringify({
        type: RoomMessages.ROOM_GAME_OVER,
        payload: {
          result: 'win',
          message: '🎉 You won! Your opponent resigned.',
          winner: winnerId,
          loser: userId,
          reason: 'resignation',
          roomStatus: 'FINISHED',
          gameStatus: 'GAME_OVER',
        },
      })
    );

    sendMessage(
      userSocket,
      JSON.stringify({
        type: RoomMessages.ROOM_LEFT,
        payload: {
          result: 'lose',
          message: 'You have resigned from the game',
          reason: 'resignation',
          roomStatus: 'FINISHED',
          gameStatus: 'GAME_OVER',
        },
      })
    );
    console.log(`[Room Game Leave] user ${userId} resigned from game ${gameId}`);

    await redis
      .multi()
      .sRem('room-active-games', gameId.toString())
      .del(`room-game:${gameId}`)
      .del(`room-game:${gameId}:moves`)
      .del(`room-game:${gameId}:chat`)
      .del(`room-game:${gameId}:capturedPieces`)
      .del(`user:${winnerId}:room-game`)
      .del(`user:${userId}:room-game`)
      .exec();
  } catch (error) {
    console.error('Error in handleRoomGameLeave:', error);
  }
}

export async function handleRoomLeave(
  userId: number,
  roomCode: string,
  userSocket: WebSocket,
  roomSocketManager: Map<number, WebSocket>
) {
  try {
    const room = await pc.room.findFirst({
      where: {
        code: roomCode,
        status: { notIn: ['FINISHED', 'CANCELLED'] },
      },
    });

    if (!room) {
      sendMessage(
        userSocket,
        JSON.stringify({
          type: RoomMessages.ROOM_NOT_FOUND,
          payload: { message: 'Room not found' },
        })
      );
      return;
    }

    if (room.status === 'WAITING') {
      if (userId !== room.createdById) {
        sendMessage(
          userSocket,
          JSON.stringify({
            type: ErrorMessages.SERVER_ERROR,
            payload: { message: 'You did not create this room' },
          })
        );
        return;
      }

      await pc.room.update({
        where: { id: room.id },
        data: { status: 'CANCELLED' },
      });

      await redis.del(`room:${roomCode}:lobby-chat`);

      sendMessage(
        userSocket,
        JSON.stringify({
          type: RoomMessages.ROOM_LEFT,
          payload: {
            message: 'Room Left Successfully',
            roomStatus: 'CANCELLED',
          },
        })
      );
      return;
    }

    // FULL room - determine roles
    const isCreator = room.createdById === userId;
    const isJoiner = room.joinedById === userId;
    const opponentId = isCreator ? room.joinedById : room.createdById;
    const oppSocket = opponentId ? roomSocketManager.get(opponentId) : null;

    if (room.status === 'FULL' && isCreator) {
      // Creator leaving FULL room = CANCEL entire room
      await pc.room.update({
        where: { id: room.id },
        data: {
          joinedById: null,
          status: 'CANCELLED',
        },
      });

      await redis.del(`room:${roomCode}:lobby-chat`);

      if (oppSocket) {
        sendMessage(
          oppSocket,
          JSON.stringify({
            type: RoomMessages.ROOM_OPPONENT_LEFT,
            payload: {
              message: 'Room creator left. Room has been cancelled.',
              reason: 'creator_left',
              roomStatus: 'CANCELLED',
            },
          })
        );
      }

      sendMessage(
        userSocket,
        JSON.stringify({
          type: RoomMessages.ROOM_LEFT,
          payload: {
            message: 'You left the room. Room cancelled.',
            roomStatus: 'CANCELLED',
          },
        })
      );
    } else if (room.status === 'FULL' && isJoiner) {
      await pc.room.update({
        where: { id: room.id },
        data: {
          joinedById: null,
          status: 'WAITING',
        },
      });

      await redis.del(`room:${roomCode}:lobby-chat`);

      if (oppSocket) {
        sendMessage(
          oppSocket,
          JSON.stringify({
            type: RoomMessages.ROOM_OPPONENT_LEFT,
            payload: {
              message: 'Opponent left. Waiting for new player...',
              reason: 'opponent_left',
              roomStatus: 'WAITING',
            },
          })
        );
        console.log(`✅ Notification sent to creator ${opponentId}`);
      }

      sendMessage(
        userSocket,
        JSON.stringify({
          type: RoomMessages.ROOM_LEFT,
          payload: {
            message: 'You left the room.',
            roomStatus: 'WAITING',
          },
        })
      );
    }
  } catch (error) {
    console.error('Error in handleRoomLeave:', error);
    sendMessage(
      userSocket,
      JSON.stringify({
        type: ErrorMessages.SERVER_ERROR,
        payload: { message: 'Failed to leave room. Please try again.' },
      })
    );
  }
}

async function saveGameProgress(
  gameId: number,
  game: Record<string, string>,
  currentFen: string,
  lastMoveBy: 'w' | 'b'
) {
  try {
    const chat = await parseChat(`room-game:${gameId}:chat`);
    const moves = await parseMoves(`room-game:${gameId}:moves`);
    const capturedPiecesRaw = await redis.lRange(
      `room-game:${gameId}:capturedPieces`,
      0,
      -1
    );
    await pc.$transaction([
      pc.game.update({
        where: { id: gameId },
        data: {
          moves: moves,
          lastMoveBy: lastMoveBy,
          lastMoveAt: new Date(),
          whiteTimeLeft: Number(game.whiteTimer),
          blackTimeLeft: Number(game.blackTimer),
          chat: chat,
          currentFen: currentFen,
          capturedPieces: capturedPiecesRaw,
        },
      }),
    ]);
    console.log(
      `Game ${gameId}: Progress saved to DB at move count ${moves.length}`
    );
  } catch (error) {
    console.log(`Game: ${gameId} Progress Error: `, error);
    return null;
  }
}

export async function resetCancelledRoom(
  roomCode: string,
  newCreatorId: number
) {
  try {
    const room = await pc.room.findUnique({
      where: { code: roomCode },
    });

    if (!room || room.status !== 'CANCELLED') {
      return null;
    }

    await pc.room.update({
      where: { code: roomCode },
      data: {
        status: 'WAITING',
        createdById: newCreatorId,
        joinedById: null,
      },
    });

    return room;
  } catch (error) {
    console.error('Error resetting cancelled room:', error);
    return null;
  }
}

export async function handleRoomDrawOffer(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  socketManager: Map<number, WebSocket>
) {
  try {
    const existingGame = await getRoomGameState(gameId);
    if (!existingGame) {
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ROOM_GAME_NOT_FOUND,
          payload: { message: 'Game Message Not Found' },
        })
      );
      return;
    }
    const opponentId =
      userId === existingGame.user1 ? existingGame.user2 : existingGame.user1;

    socketManager.get(opponentId)?.send(
      JSON.stringify({
        type: GameMessages.DRAW_OFFERED,
        payload: { message: 'Opponent has offered a draw.' },
      })
    );
  } catch (error) {
    console.error('Error handling room draw offer:', error);
  }
}

export async function handleRoomDrawRejection(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  socketManager: Map<number, WebSocket>
) {
  try {
    const existingGame = await getRoomGameState(gameId);
    if (!existingGame) {
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ROOM_GAME_NOT_FOUND,
          payload: { message: 'Game Message Not Found' },
        })
      );
      return;
    }
    const opponentId =
      userId === existingGame.user1 ? existingGame.user2 : existingGame.user1;
    userSocket.send(
      JSON.stringify({
        type: GameMessages.DRAW_REJECTED,
        payload: { message: 'You declined the draw offer.' },
      })
    );
    socketManager.get(opponentId)?.send(
      JSON.stringify({
        type: GameMessages.DRAW_REJECTED,
        payload: { message: 'Opponent has rejected your draw offer.' },
      })
    );
  } catch (error) {
    console.error('Error handling room draw rejection:', error);
  }
}

export async function handleRoomDrawAcceptance(
  userId: number,
  userSocket: WebSocket,
  gameId: number,
  socketManager: Map<number, WebSocket>
) {
  try {
    const existingGame = await getRoomGameState(gameId);
    if (!existingGame) {
      userSocket.send(
        JSON.stringify({
          type: RoomMessages.ROOM_GAME_NOT_FOUND,
          payload: { message: 'Game Message Not Found' },
        })
      );
      return;
    }
    const opponentId =
      userId === existingGame.user1 ? existingGame.user2 : existingGame.user1;
    const opponentSocket = socketManager.get(opponentId);

    await handleRoomDraw(
      userSocket,
      opponentSocket,
      gameId,
      'Draw agreed by both players'
    );
  } catch (error) {
    console.error('Error handling room draw acceptance:', error);
  }
}