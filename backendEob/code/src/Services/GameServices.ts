import { WebSocket } from 'ws';
import { GameMessages, ErrorMessages } from '../utils/messages';
import { redis } from '../clients/redisClient';
import { Chess, PieceSymbol } from 'chess.js';
import provideValidMoves, {
  MOVE_BEFORE_SAFE,
  parseMoves,
} from '../utils/chessUtils';
import { gameManager } from '../Classes/GameManager';
import pc from '../clients/prismaClient';

//This Method Will Help To return the gameState to reconnected player
export async function getGameState(gameId: string) {
  const existingGame = (await redis.hGetAll(`guest-game:${gameId}`)) as Record<
    string,
    string
  >;
  // console.log(existingGame);

  if (!existingGame || Object.keys(existingGame).length === 0) {
    return null;
  }

  const board = new Chess(existingGame.fen);
  const movesRaw = await redis.lRange(`guest-game:${gameId}:moves`, 0, -1);
  const moves = movesRaw.map((m) => JSON.parse(m));
  const capturedPieces = await redis.lRange(
    `guest-game:${gameId}:capturedPieces`,
    0,
    -1
  );

  // Ensure timers are valid numbers and not negative
  const rawWhiteTimer = Number(existingGame.whiteTimer);
  const rawBlackTimer = Number(existingGame.blackTimer);
  const whiteTimer = Math.max(0, isNaN(rawWhiteTimer) ? 600 : rawWhiteTimer);
  const blackTimer = Math.max(0, isNaN(rawBlackTimer) ? 600 : rawBlackTimer);

  // Fix Redis data if timers were negative or invalid
  if (rawWhiteTimer < 0 || isNaN(rawWhiteTimer)) {
    await redis.hSet(`guest-game:${gameId}`, 'whiteTimer', String(whiteTimer));
  }
  if (rawBlackTimer < 0 || isNaN(rawBlackTimer)) {
    await redis.hSet(`guest-game:${gameId}`, 'blackTimer', String(blackTimer));
  }

  return {
    whitePlayerId: existingGame.whitePlayerId, // white player
    blackPlayerId: existingGame.blackPlayerId, // black player
    board,
    status: existingGame.status,
    fen: existingGame.fen,
    turn: board.turn(),
    whiteTimer: String(whiteTimer),
    blackTimer: String(blackTimer),
    gameStarted: existingGame.status === GameMessages.GAME_ACTIVE,
    gameEnded: existingGame.status === GameMessages.GAME_OVER,
    moves,
    capturedPieces,
  };
}

export function validateGamePayload(type: string, payload: any) {
  if (!payload) {
    return 'Missing Payload Object in GuestGame';
  }
  switch (type) {
    case GameMessages.INIT_GAME: {
      if (!payload.timeControl) return 'Missing timeControl';
      if (!payload.colorPreference) return 'Missing colorPreference';
      break;
    }
    case GameMessages.MOVE: {
      if (!payload.to || !payload.from)
        return 'Missing move coordinates (to/from)';
      break;
    }
    case GameMessages.RECONNECT: {
      if (!payload.id) return 'Missing Id in payload for reconnecting';
      break;
    }
  }
  return null; // No validation error
}

export async function handleGuestGameMove(
  socket: WebSocket,
  move: { from: string; to: string; promotion?: string },
  gameId: string,
  playerId: string,
  socketMap: Map<string, WebSocket>
) {
  const gameState = await getGameState(gameId);

  if (!gameState) {
    socket.send(
      JSON.stringify({
        type: GameMessages.GAME_NOT_FOUND,
        payload: {
          message: 'Game Not Found',
        },
      })
    );
    return;
  }

  const isWhiteTurn = gameState.turn === 'w';
  if (
    (isWhiteTurn && gameState.whitePlayerId !== playerId) ||
    (!isWhiteTurn && gameState?.blackPlayerId !== playerId)
  ) {
    console.log('Wrong player move');
    const message = JSON.stringify({
      type: GameMessages.WRONG_PLAYER_MOVE,
      payload: {
        message: 'Not your turn',
      },
    });
    socket.send(message);
    return null;
  }

  const whitePlayerSocket = socketMap.get(gameState.whitePlayerId);
  const blackPlayerSocket = socketMap.get(gameState.blackPlayerId);
  if (!whitePlayerSocket || !blackPlayerSocket) {
    console.log('One or both players disconnected');
    return;
  }

  const board = gameState.board;
  let capturedPiece = null;
  try {
    const boardMove = board.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || 'q',
    });
    //redis moves pushing
    await redis.rPush(`guest-game:${gameId}:moves`, JSON.stringify(move));
    // Save FEN to the correct Redis key so timer logic can read it
    await redis.hSet(`guest-game:${gameId}`, 'fen', board.fen());

    if (boardMove.captured) {
      const capturedColor = boardMove.color === 'b' ? 'w' : 'b';
      const pieceCaptured = boardMove.captured.toUpperCase(); // p=> P
      const capturedCode = `${capturedColor}${pieceCaptured}`;
      capturedPiece = capturedCode;

      await redis.rPush(`guest-game:${gameId}:capturedPieces`, capturedPiece);
      console.log('Captured Piece Block: ', capturedPiece);
    }
    const updatedGuestGameMoveCnt = await redis.hIncrBy(
      `guest-game:${gameId}`,
      'moveCount',
      1
    );
    const turn = gameState.fen.split(' ')[1];
    const movingPlayerColor = turn === 'w' ? 'w' : 'b';
    if (updatedGuestGameMoveCnt % MOVE_BEFORE_SAFE === 0) {
      const udpdatedGameData = (await redis.hGetAll(
        `guest-game:${gameId}`
      )) as Record<string, string>;
      saveGuestGameProgress(gameId, udpdatedGameData, movingPlayerColor);
    }
  } catch (err) {
    //if illegal moves is attempted direct this block will be executed
    console.error('Error processing move:', err);
    socket.send(
      JSON.stringify({
        type: ErrorMessages.SERVER_ERROR,
        payload: {
          message:
            'Server error while processing move or illegal move attempted',
        },
      })
    );
    return;
  }

  if (board.isStalemate()) {
    await handleGuestGameDraw(
      whitePlayerSocket,
      blackPlayerSocket,
      gameId,
      'Draw by stalemate',
      {
        whiteTimer: gameState.whiteTimer,
        blackTimer: gameState.blackTimer,
        fen: board.fen(),
      }
    );
    return;
  } else if (board.isInsufficientMaterial()) {
    await handleGuestGameDraw(
      whitePlayerSocket,
      blackPlayerSocket,
      gameId,
      'Draw due to insufficient material',
      {
        whiteTimer: gameState.whiteTimer,
        blackTimer: gameState.blackTimer,
        fen: board.fen(),
      }
    );
    return;
  } else if (board.isThreefoldRepetition()) {
    await handleGuestGameDraw(
      whitePlayerSocket,
      blackPlayerSocket,
      gameId,
      'Draw by threefold repetition',
      {
        whiteTimer: gameState.whiteTimer,
        blackTimer: gameState.blackTimer,
        fen: board.fen(),
      }
    );
    return;
  } else if (board.isDraw()) {
    await handleGuestGameDraw(
      whitePlayerSocket,
      blackPlayerSocket,
      gameId,
      'Draw by 50-move rule',
      {
        whiteTimer: gameState.whiteTimer,
        blackTimer: gameState.blackTimer,
        fen: board.fen(),
      }
    );
    return;
  }

  if (board.isGameOver()) {
    const winnerColor = board.turn() === 'w' ? 'b' : 'w';
    const winnerId =
      winnerColor === 'w' ? gameState.whitePlayerId : gameState.blackPlayerId;
    const loserId =
      winnerId === gameState.whitePlayerId
        ? gameState.blackPlayerId
        : gameState.whitePlayerId;
    const loserColor = winnerColor === 'b' ? 'w' : 'b';
    const winnerSocket = socketMap.get(winnerId);
    const loserSocket = socketMap.get(loserId);

    await redis.hSet(`guest-game:${gameId}`, {
      status: GameMessages.GAME_OVER,
      winner: winnerColor,
    });
    await redis.expire(`guest-game:${gameId}`, 600);

    // Fetch player1Color to correctly map timers
    const existingGame = await pc.guestGames.findUnique({
      where: { id: Number(gameId) },
      select: { player1Color: true },
    });

    if (existingGame) {
      const player1TimeLeft =
        existingGame.player1Color === 'w'
          ? Number(gameState.whiteTimer)
          : Number(gameState.blackTimer);
      const player2TimeLeft =
        existingGame.player1Color === 'w'
          ? Number(gameState.blackTimer)
          : Number(gameState.whiteTimer);
      // const raw_moves = await redis.lRange(`guest-game:${gameId}:moves`, 0, -1);
      // const final_moves = raw_moves.map((move) => JSON.parse(move));
      const final_moves = await parseMoves(`guest-game:${gameId}:moves`);
      const final_capturedPieces = await redis.lRange(
        `guest-game:${gameId}:capturedPieces`,
        0,
        -1
      );

      await pc.guestGames.update({
        where: { id: Number(gameId) },
        data: {
          status: 'FINISHED',
          winner: winnerColor,
          loser: loserColor,
          player1TimeLeft,
          player2TimeLeft,
          currentFen: board.fen(),
          moves: final_moves,
          endedAt: new Date(),
          draw: false,
          capturedPieces: final_capturedPieces,
        },
      });
      await redis.hIncrBy(`stats`, 'guestGamesCount', 1);
    }

    const winnerMessage = JSON.stringify({
      type: GameMessages.GAME_OVER,
      payload: {
        result: 'win',
        message: "🏆 Congratulations! You've won the game.",
        winner: winnerColor,
        loser: loserColor,
      },
    });

    const loserMessage = JSON.stringify({
      type: GameMessages.GAME_OVER,
      payload: {
        result: 'lose',
        message: "💔 Game over. You've been checkmated.",
        winner: winnerColor,
        loser: loserColor,
      },
    });

    winnerSocket?.send(winnerMessage);
    loserSocket?.send(loserMessage);

    return;
  }
  const validMoves = provideValidMoves(board.fen());

  const oppPayload = {
    type: GameMessages.MOVE,
    payload: {
      move,
      turn: board.turn(),
      fen: board.fen(),
      validMoves,
      capturedPiece,
    },
  };
  const currentPlayerPayload = {
    type: GameMessages.MOVE,
    payload: {
      move,
      turn: board.turn(),
      fen: board.fen(),
      validMoves: [],
      capturedPiece,
    },
  };

  const currentPlayerSocket =
    playerId === gameState.whitePlayerId
      ? whitePlayerSocket
      : blackPlayerSocket;
  const opponentSocket =
    playerId === gameState.whitePlayerId
      ? blackPlayerSocket
      : whitePlayerSocket;

  currentPlayerSocket.send(JSON.stringify(currentPlayerPayload));
  opponentSocket.send(JSON.stringify(oppPayload));

  if (board.isCheck()) {
    const attackerCheckMessage = {
      type: GameMessages.CHECK,
      payload: {
        message:
          "Check! You've put the opposing King under fire. The pressure is on them now!",
      },
    };

    const defenderCheckMessage = {
      type: GameMessages.CHECK,
      payload: {
        message: 'You are in Check! Defend your King immediately. Your move.',
      },
    };

    currentPlayerSocket.send(JSON.stringify(attackerCheckMessage));
    opponentSocket.send(JSON.stringify(defenderCheckMessage));

    return;
  }
}

export async function reconnectPlayer(
  playerId: string,
  gameId: string,
  socket: WebSocket,
  socketMap: Map<string, WebSocket>
) {
  const game = await getGameState(gameId);
  console.log('reconnection player');
  if (!game) {
    const message = {
      type: GameMessages.GAME_NOT_FOUND,
      payload: {
        message: 'Previous Game Not found Internal Server Error ',
      },
    };
    socket.send(JSON.stringify(message));
    return;
  }
  // console.log(game.status);
  // console.log('GameEnded: ', game.gameEnded);
  if (game.gameEnded) {
    const message = {
      type: GameMessages.GAME_OVER,
      payload: {
        message: 'Previous Game Over ',
      },
    };
    socket.send(JSON.stringify(message));
    return;
  }
  if (game.status === GameMessages.DISCONNECTED) {
    const timeElapsed =
      Date.now() -
      Number(await redis.hGet(`guest-game:${gameId}`, 'timestamp'));
    // const disconnectedBy = await redis.hGet(`guest-game:${gameId}`, "disconnectedBy");;
    if (timeElapsed > 60 * 1000) {
      socket.send(
        JSON.stringify({
          type: GameMessages.GAME_NOT_FOUND,
          payload: {
            message: 'Disconnected For Too Long',
          },
        })
      );
      return;
    }
  }

  await redis.hSet(`guest-game:${gameId}`, {
    status: GameMessages.GAME_ACTIVE,
  });
  await redis.sAdd('active-games', gameId);

  const color = playerId === game.whitePlayerId ? 'w' : 'b';
  const opponentId =
    playerId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;

  console.log('sending the current moves to ', playerId);
  const validMoves = provideValidMoves(game.board.fen());

  socket.send(
    JSON.stringify({
      type: GameMessages.RECONNECT,
      payload: {
        fen: game.board.fen(),
        color: color,
        turn: game.board.turn(),
        opponentId,
        gameId,
        whiteTimer: Number(game.whiteTimer) || 0,
        blackTimer: Number(game.blackTimer) || 0,
        validMoves: validMoves || [],
        moves: game.moves,
        status: game.status,
        capturedPieces: game.capturedPieces,
      },
    })
  );

  const opponentSocket = socketMap.get(opponentId);
  gameManager.startTimer();
  console.log(
    'Sending reconnect notice to:',
    opponentId,
    socketMap.has(opponentId)
  );

  opponentSocket?.send(
    JSON.stringify({
      type: GameMessages.OPP_RECONNECTED,
      payload: {
        message: 'Opponent reconnected',
      },
    })
  );
}

export async function getStats() {
  const statsFromRedis = (await redis.hGetAll(`stats`)) as Record<
    string,
    string
  >;
  if (statsFromRedis && Object.keys(statsFromRedis).length > 0) {
    console.log('redis');
    return {
      guestGamesCount: Number(statsFromRedis.guestGamesCount),
      roomsCount: Number(statsFromRedis.roomsCount),
    };
  }
  const guestGamesCount = await pc.guestGames.count();
  const roomsCount = await pc.room.count({
    where: {
      status: 'FINISHED',
    },
  });
  const statsFromDb = {
    guestGamesCount: guestGamesCount ?? 0,
    roomsCount: roomsCount ?? 0,
  };
  // console.log(statsFromDb);
  await redis.hSet(`stats`, {
    guestGamesCount: guestGamesCount.toString(),
    roomsCount: roomsCount.toString(),
  });
  return statsFromDb;
}
export async function playerLeft(
  playerId: string,
  gameId: string,
  socket?: WebSocket,
) {
  const game = await getGameState(gameId);

  if (!game) {
    console.log('Game Not found');
    // Only send message if socket exists
    if (socket) {
      socket.send(
        JSON.stringify({
          type: GameMessages.GAME_NOT_FOUND,
          payload: {
            message: 'Cannot leave game due to game not found',
          },
        })
      );
    }
    return;
  }

  // Check if game is already over
  if (game.gameEnded) {
    console.log('Game already over, ignoring player left');
    return;
  }

  console.log('In player left method');

  const winnerColor = playerId === game.whitePlayerId ? 'b' : 'w';
  const loserColor = winnerColor === 'b' ? 'w' : 'b';

  try {
    await redis
      .multi()
      .hSet(`guest-game:${gameId}`, 'status', GameMessages.GAME_OVER)
      .hSet(`guest-game:${gameId}`, 'winner', winnerColor)
      .hSet(`guest-game:${gameId}`, 'reason', 'player_left')
      .expire(`guest-game:${gameId}`, 600)
      .expire(`guest-game:${gameId}:moves`, 600)
      .sRem('active-games', gameId)
      .exec();

    const moves = await parseMoves(`guest-game:${gameId}:moves`);
    const capturedPieces = await redis.lRange(
      `guest-game:${gameId}:capturedPieces`,
      0,
      -1
    );

    const existingGame = await pc.guestGames.findUnique({
      where: { id: Number(gameId) },
      select: {
        player1Color: true,
        player1GuestId: true,
        player2GuestId: true,
      },
    });

    if (existingGame) {
      const player1TimeLeft =
        existingGame.player1Color === 'w'
          ? Number(game.whiteTimer)
          : Number(game.blackTimer);
      const player2TimeLeft =
        existingGame.player1Color === 'w'
          ? Number(game.blackTimer)
          : Number(game.whiteTimer);

      await pc.guestGames.update({
        where: { id: Number(gameId) },
        data: {
          status: 'FINISHED',
          winner: winnerColor,
          loser: loserColor,
          player1TimeLeft,
          player2TimeLeft,
          currentFen: game.fen,
          moves,
          capturedPieces,
          draw: false,
          endedAt: new Date(),
        },
      });
      await redis.hIncrBy(`stats`, 'guestGamesCount', 1);
    }

    console.log(`✅ Game ${gameId} ended - Status set to GAME_OVER`);
    // Only send message if socket exists (opponent might also be disconnected)
    if (socket) {
      socket.send(JSON.stringify({
        type: GameMessages.GAME_OVER,
        payload: {
          result: 'win',
          message: 'Player Left You Won!',
          winner: winnerColor,
          loser: loserColor,
        },
      }));
    }
  } catch (error) {
    console.error('Error updating game status:', error);
  }

}

export interface Move {
  to: string;
  from: string;
  promotion?: PieceSymbol | null;
}
export type Moves = Move[];

export async function handleGuestGameDraw(
  whitePlayerSocket: WebSocket,
  blackPlayerSocket: WebSocket | undefined,
  gameId: string,
  reason: string,
  gameData: { whiteTimer: string; blackTimer: string; fen: string }
): Promise<void> {
  try {
    const message = JSON.stringify({
      type: GameMessages.GAME_DRAW,
      payload: {
        result: 'draw',
        reason,
        gameStatus: GameMessages.GAME_OVER,
      },
    });

    whitePlayerSocket.send(message);
    blackPlayerSocket?.send(message);

    await redis.hSet(`guest-game:${gameId}`, {
      status: GameMessages.GAME_OVER,
      winner: 'draw',
      drawReason: reason,
    });
    await redis.sRem('active-games', gameId);
    await redis.expire(`guest-game:${gameId}`, 600);
    await redis.expire(`guest-game:${gameId}:moves`, 600);

    // Get moves and captured pieces from Redis for DB update
    const moves = await parseMoves(`guest-game:${gameId}:moves`);
    const capturedPieces = await redis.lRange(
      `guest-game:${gameId}:capturedPieces`,
      0,
      -1
    );

    const existingGame = await pc.guestGames.findUnique({
      where: { id: Number(gameId) },
      select: {
        player1Color: true,
        player1GuestId: true,
        player2GuestId: true,
      },
    });

    if (existingGame) {
      const player1TimeLeft =
        existingGame.player1Color === 'w'
          ? Number(gameData.whiteTimer)
          : Number(gameData.blackTimer);
      const player2TimeLeft =
        existingGame.player1Color === 'w'
          ? Number(gameData.blackTimer)
          : Number(gameData.whiteTimer);

      await pc.guestGames.update({
        where: { id: Number(gameId) },
        data: {
          status: 'FINISHED',
          player1TimeLeft,
          player2TimeLeft,
          currentFen: gameData.fen,
          moves,
          capturedPieces,
          draw: true,
          endedAt: new Date(),
        },
      });
      await redis.hIncrBy(`stats`, 'guestGamesCount', 1);
    }

    console.log(`✅ Game ${gameId} ended in draw: ${reason}`);
  } catch (error) {
    console.error(`Error handling draw for game ${gameId}:`, error);
  }
}

export async function offerDraw(
  playerId: string,
  gameId: string,
  offerSenderSocket: WebSocket,
  socketMap: Map<string, WebSocket>
) {
  const game = await getGameState(gameId);
  if (!game || game.gameEnded) {
    offerSenderSocket.send(
      JSON.stringify({
        type: GameMessages.GAME_NOT_FOUND,
        payload: { message: 'The Game You Are looking for is over' },
      })
    );
    return;
  }

  await redis.setEx(`draw-offer:${gameId}`, 30, 'true');
  // Send confirmation to sender
  offerSenderSocket.send(
    JSON.stringify({
      type: GameMessages.OFFER_DRAW,
      payload: {
        message: 'Draw offered to the opponent. Waiting for response!',
      },
    })
  );

  // Send draw offer to opponent
  const draw_offer_recieverId =
    game.whitePlayerId === playerId ? game.blackPlayerId : game.whitePlayerId;
  const offerRecieverSocket = socketMap.get(draw_offer_recieverId);

  offerRecieverSocket?.send(
    JSON.stringify({
      type: GameMessages.DRAW_OFFERED,
      payload: { message: 'Draw Offered. Do you want to accept it?' },
    })
  );
}

export async function acceptDraw(
  // playerId: string,
  gameId: string,
  offerAcceptedSocket: WebSocket,
  socketMap: Map<string, WebSocket>
) {
  const game = await getGameState(gameId);
  if (!game || game.gameEnded) {
    offerAcceptedSocket.send(
      JSON.stringify({
        type: GameMessages.GAME_NOT_FOUND,
        payload: { message: 'The Game You Are looking for is over' },
      })
    );
    return;
  }

  const whitePlayerSocket = socketMap.get(game.whitePlayerId);
  const blackPlayerSocket = socketMap.get(game.blackPlayerId);
  await redis.del(`draw-offer:${gameId}`);
  await handleGuestGameDraw(
    whitePlayerSocket!,
    blackPlayerSocket,
    gameId,
    'Draw by mutual agreement',
    { whiteTimer: game.whiteTimer, blackTimer: game.blackTimer, fen: game.fen }
  );
}

export async function rejectDraw(
  playerId: string,
  gameId: string,
  rejecterSocket: WebSocket,
  socketMap: Map<string, WebSocket>
) {
  const game = await getGameState(gameId);
  if (!game || game.gameEnded) {
    rejecterSocket.send(
      JSON.stringify({
        type: GameMessages.GAME_NOT_FOUND,
        payload: { message: 'The Game You Are looking for is over' },
      })
    );
    return;
  }

  const offerSenderId =
    playerId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
  const offerSenderSocket = socketMap.get(offerSenderId);

  rejecterSocket?.send(
    JSON.stringify({
      type: GameMessages.DRAW_REJECTED,
      payload: {
        message: 'You rejected the draw offer.',
      },
    })
  );

  offerSenderSocket?.send(
    JSON.stringify({
      type: GameMessages.DRAW_REJECTED,
      payload: {
        message: 'Your opponent rejected the draw offer.',
      },
    })
  );
}

export async function saveGuestGameProgress(
  gameId: string,
  gameState: Record<string, string>,
  lastMoveBy: 'w' | 'b'
) {
  try {
    const moves = await redis.lRange(`guest-game:${gameId}:moves`, 0, -1);
    const capturedPieces = await redis.lRange(
      `guest-game:${gameId}:capturedPieces`,
      0,
      -1
    );
    const existingGameFromDb = await pc.guestGames.findUnique({
      where: { id: Number(gameId) },
      select: {
        player1Color: true,
      },
    });

    if (!existingGameFromDb) {
      console.log(`The game ${gameId} does not exist in DB`);
      return;
    }
    // Fetch the game to get player1Color for correct timer mapping
    const player1TimeLeft =
      existingGameFromDb.player1Color === 'w'
        ? Number(gameState.whiteTimer)
        : Number(gameState.blackTimer);
    const player2TimeLeft =
      existingGameFromDb.player1Color === 'w'
        ? Number(gameState.blackTimer)
        : Number(gameState.whiteTimer);

    await pc.guestGames.update({
      where: {
        id: Number(gameId),
      },
      data: {
        currentFen: gameState.fen,
        capturedPieces: capturedPieces,
        moves: moves,
        player1TimeLeft: player1TimeLeft,
        player2TimeLeft: player2TimeLeft,
        lastMoveBy: lastMoveBy,
      },
    });

    console.log(`✅ Game ${gameId} progress saved to database`);
  } catch (error) {
    console.error(`Error saving game ${gameId} progress:`, error);
  }
}
