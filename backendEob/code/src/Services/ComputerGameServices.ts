import path from 'path';
import { computerGameManager } from '../Classes/ComputerGameManager';
import {
  ComputerGameMessages,
  ErrorMessages,
  GameMessages,
} from '../utils/messages';
import { redis } from '../clients/redisClient';
import { Move } from './GameServices';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { Chess } from 'chess.js';
import pc from '../clients/prismaClient';
import provideValidMoves, { parseMoves } from '../utils/chessUtils';
// this are the depthLevels according to which the computer will calculate the best-move
const ComputerGameLevels: Record<string, number> = {
  EASY: 3,
  MEDIUM: 5,
  HARD: 7,
};
// Use path relative to project root, not dist folder
const stockfish_path = path.join(process.cwd(), 'bin', 'stockfish');

export function getComputerMove(
  fen: string,
  difficulty: string
): Promise<Move> {
  const depthLevel = ComputerGameLevels[difficulty.toUpperCase()];
  return new Promise((resolve, reject) => {
    const engine = spawn(stockfish_path);

    const timer = setTimeout(() => {
      engine.kill();
      reject(new Error('Computer Timed Out'));
    }, 10000);

    engine.stdout.on('data', (data: Buffer) => {
      const str_data = data.toString().trim().split('\n');
      for (const lines of str_data) {
        if (lines.startsWith('bestmove')) {
          clearTimeout(timer);
          const move = lines.split(' ')[1];
          const best_move: Move = {
            from: move.substring(0, 2), // "e2"
            to: move.substring(2, 4), // "e4"
          };

          resolve(best_move);
          engine.stdin.write('quit\n');
          engine.kill();
          return;
        }
      }
    });
    engine.stderr.on('data', (data: Buffer) => {
      console.error('Stockfish error:', data.toString());
    });

    engine.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Stockfish process error: ${err.message}`));
    });

    engine.stdin.write(`uci\n`);
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write(`go depth ${depthLevel}\n`);
  });
}

export function validateComputerGamePayload(
  type: string,
  payload: any
): string | null {
  if (!payload) {
    return 'Missing Payload Object';
  }
  switch (type) {
    case ComputerGameMessages.INIT_COMPUTER_GAME:
      if (!payload.difficulty || !payload.playerColor)
        return 'Missing difficulty or playerColor';
      if (payload.playerColor !== 'w' && payload.playerColor !== 'b')
        return "playerColor must be 'w' or 'b'";
      break;

    case ComputerGameMessages.PLAYER_MOVE:
      if (!payload.computerGameId || !payload.move)
        return 'Missing Move or GameId';
      break;
    case ComputerGameMessages.PLAYER_QUIT:
      if (!payload.computerGameId) return 'Missing computerGameId';
      break;
    default:
      return null;
  }
  return null;
}
export async function getComputerGameState(gameId: number) {
  const gameExists = (await redis.hGetAll(`computer-game:${gameId}`)) as Record<
    string,
    string
  >;

  const moves = await parseMoves(`computer-game:${gameId}:moves`);

  const capturedPieces = await redis.lRange(
    `computer-game:${gameId}:capturedPieces`,
    0,
    -1
  );

  if (
    !gameExists ||
    Object.keys(gameExists).length === 0 ||
    gameExists.status === ComputerGameMessages.COMPUTER_GAME_OVER
  ) {
    const restoredGame = await computerGameManager.restoreGameFromDb(gameId);
    if (!restoredGame) {
      return null;
    }
    return restoredGame;
  }

  return {
    difficulty: gameExists.difficulty,
    fen: gameExists.fen,
    moves: moves,
    moveCount: Number(gameExists.moveCount),
    status: gameExists.status,
    playerColor: gameExists.playerColor,
    capturedPieces: capturedPieces,
  };
}

export async function handlePlayerMove(
  userId: number,
  userSocket: WebSocket,
  computerGameId: number,
  move: Move
) {
  const gameState = await getComputerGameState(computerGameId);
  if (!gameState) {
    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.COMPUTER_GAME_OVER,
        payload: {
          message: 'The Game you are trying to find is over',
        },
      })
    );
    return;
  }
  const turn = gameState.fen.split(' ')[1];
  const board = new Chess(gameState.fen);
  if (gameState.playerColor !== turn) {
    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.NOT_YOUR_TURN,
        payload: {
          message: 'Wait for your turn to make move!',
        },
      })
    );
    return;
  }
  let capturedPieceNotation = null;
  try {
    const boardMove = board.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || 'q',
    });
    if (!boardMove) {
      userSocket.send(
        JSON.stringify({
          type: GameMessages.WRONG_MOVE,
          payload: { message: 'Illegal move attempted!' },
        })
      );
      return;
    }
    await redis.rPush(
      `computer-game:${computerGameId}:moves`,
      JSON.stringify(boardMove)
    );
    await redis.hSet(`computer-game:${computerGameId}`, 'fen', board.fen());

    if (boardMove.captured) {
      const piece = boardMove.captured.toUpperCase(); //Same logic as room game
      const color = boardMove.color.toLowerCase() === 'w' ? 'b' : 'w';
      const capturedPiece = `${color}${piece}`;
      capturedPieceNotation = capturedPiece;
      await redis.rPush(
        `computer-game:${computerGameId}:capturedPieces`,
        capturedPiece
      );
      console.log(`Player Captured Piece: ${capturedPiece}`);
    }

    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.PLAYER_MOVE,
        payload: {
          fen: board.fen(),
          capturedPiece: capturedPieceNotation || undefined,
        },
      })
    );
  } catch (err) {
    console.error('Error processing move:', err);
    userSocket.send(
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

  // Check if player put computer in check
  if (board.isCheck()) {
    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.PLAYER_CHECK,
        payload: {
          message: 'Good! You put the computer in check',
        },
      })
    );
  }
  if (board.isStalemate()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw by stalemate'
    );
    return;
  } else if (board.isInsufficientMaterial()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw due to insufficient material'
    );
    return;
  } else if (board.isThreefoldRepetition()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw by threefold repetition'
    );
    return;
  } else if (board.isDraw()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw by 50-move rule'
    );
    return;
  }
  if (board.isCheckmate()) {
    await redis.hSet(`computer-game:${computerGameId}`, {
      winner: gameState.playerColor,
      fen: board.fen(),
      loser: 'computer',
    });

    // Clear the user's active game key so they can start a new game
    await redis.del(`user:${userId}:computer-game`);

    const updatedCapturedPieces = await redis.lRange(
      `computer-game:${computerGameId}:capturedPieces`,
      0,
      -1
    );
    // const movesRaw = await redis.lRange(
    //   `computer-game:${computerGameId}:moves`,
    //   0,
    //   -1
    // );
    // const updatedMoves = movesRaw.map((m) => JSON.parse(m));
    const updatedMoves = await parseMoves(
      `computer-game:${computerGameId}:moves`
    );
    await pc.computerGame.update({
      where: {
        id: computerGameId,
      },
      data: {
        currentFen: board.fen(),
        winnerId: userId,
        loserId: null,
        lastMoveBy: gameState.playerColor,
        status: 'FINISHED',
        capturedPieces: updatedCapturedPieces,
        moves: updatedMoves,
        draw: false,
        endedAt: new Date(Date.now()),
      },
    });

    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.PLAYER_WON,
        payload: {
          message: 'Congratulations! You Won.',
        },
      })
    );
    return;
  }
  const computerMove: Move = await getComputerMove(
    board.fen(),
    gameState.difficulty
  );
  console.log(`[ComputerGame] Computer move calculated:`, computerMove);
  // await delay(2000)
  await handleComputerMove(userSocket, computerMove, computerGameId, userId);
}
export async function handleComputerMove(
  userSocket: WebSocket,
  move: Move,
  computerGameId: number,
  userId: number
) {
  const gameState = await getComputerGameState(computerGameId);
  if (!gameState) {
    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.COMPUTER_GAME_OVER,
        payload: {
          message: 'The Game you are trying to find is over',
        },
      })
    );
    return;
  }
  const board = new Chess(gameState.fen);
  let capturedPieceNotation = null;

  console.log(`[ComputerGame] Processing computer move:`, move);

  try {
    const boardMove = board.move({
      from: move.from,
      to: move.to,
    });

    console.log(`[ComputerGame] Board move successful:`, boardMove);
    await redis.rPush(
      `computer-game:${computerGameId}:moves`,
      JSON.stringify(boardMove)
    );
    await redis.hSet(`computer-game:${computerGameId}`, 'fen', board.fen());
    if (boardMove.captured) {
      const piece = boardMove.captured.toUpperCase(); //Same logic as room game
      const color = boardMove.color.toLowerCase() === 'w' ? 'b' : 'w';
      const capturedPiece = `${color}${piece}`;
      capturedPieceNotation = capturedPiece;
      await redis.rPush(
        `computer-game:${computerGameId}:capturedPieces`,
        capturedPiece
      );
      console.log(`Computer Captured Piece: ${capturedPiece}`);
    }
    const validMovesAfterComputerMove = provideValidMoves(board.fen());

    // Send computer move confirmation
    console.log(`[ComputerGame] Sending computer move to client`);
    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.COMPUTER_MOVE,
        payload: {
          move: move,
          fen: board.fen(),
          capturedPiece: capturedPieceNotation || undefined,
          validMoves: validMovesAfterComputerMove,
        },
      })
    );
  } catch (err) {
    console.error('Error processing move:', err);
    userSocket.send(
      JSON.stringify({
        type: ErrorMessages.SERVER_ERROR,
        payload: { message: 'Server error while processing computer move' },
      })
    );
    return;
  }

  // Calculate valid moves for player after computer's move (it's now player's turn)

  // Check if computer put player in check
  if (board.isCheck()) {
    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.COMPUTER_CHECK,
        payload: {
          message: 'Computer has put you in check!',
        },
      })
    );
  }

  if (board.isStalemate()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw by stalemate'
    );
    return;
  } else if (board.isInsufficientMaterial()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw due to insufficient material'
    );
    return;
  } else if (board.isThreefoldRepetition()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw by threefold repetition'
    );
    return;
  } else if (board.isDraw()) {
    await handleComputerGameDraw(
      userSocket,
      computerGameId,
      'Draw by 50-move rule'
    );
    return;
  }
  if (board.isCheckmate()) {
    const winnerColor = gameState.playerColor === 'w' ? 'b' : 'w';
    await redis.hSet(`computer-game:${computerGameId}`, {
      winner: winnerColor,
      fen: board.fen(),
      loser: userId.toString(),
      status: ComputerGameMessages.COMPUTER_GAME_OVER,
    });

    // Clear the user's active game key so they can start a new game
    await redis.del(`user:${userId}:computer-game`);

    const updatedCapturedPieces = await redis.lRange(
      `computer-game:${computerGameId}:capturedPieces`,
      0,
      -1
    );
    const updatedMoves = await parseMoves(
      `computer-game:${computerGameId}:moves`
    );
    // const updatedMoves = movesRaw.map((m) => JSON.parse(m));
    await pc.computerGame.update({
      where: {
        id: computerGameId,
      },
      data: {
        currentFen: board.fen(),
        winnerId: null,
        loserId: userId,
        lastMoveBy: winnerColor,
        status: 'FINISHED',
        capturedPieces: updatedCapturedPieces,
        moves: updatedMoves,
        draw: false,
        endedAt: new Date(Date.now()),
      },
    });

    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.COMPUTER_WON,
        payload: {
          message: 'Computer Won! Better luck next time.',
        },
      })
    );
    return;
  }

  const updatedMoveCount = await redis.hIncrBy(
    `computer-game:${computerGameId}`,
    'movesCount',
    1
  );

  if (updatedMoveCount % computerGameManager.MOVES_BEFORE_SAVE === 0) {
    await saveComputerGameProgress(computerGameId, gameState);
  }
}

export async function handleComputerGameDraw(
  userSocket: WebSocket,
  computerGameId: number,
  reason: string
) {
  try {
    const gameState = await getComputerGameState(computerGameId);
    if (!gameState) {
      return;
    }

    await redis.hSet(`computer-game:${computerGameId}`, {
      status: ComputerGameMessages.COMPUTER_GAME_OVER,
      winner: 'draw',
      drawReason: reason,
    });

    // Clear the user's active game key from the game state
    // We need to get userId from somewhere - let's get it from the database
    const gameRecord = await pc.computerGame.findUnique({
      where: { id: computerGameId },
      select: { userId: true },
    });

    if (gameRecord) {
      await redis.del(`user:${gameRecord.userId}:computer-game`);
    }

    const updatedCapturedPieces = await redis.lRange(
      `computer-game:${computerGameId}:capturedPieces`,
      0,
      -1
    );
    const updatedMoves = await parseMoves(
      `computer-game:${computerGameId}:moves`
    );
    // const updatedMoves = movesRaw.map((m) => JSON.parse(m));

    await pc.computerGame.update({
      where: { id: computerGameId },
      data: {
        draw: true,
        status: 'FINISHED',
        moves: updatedMoves,
        capturedPieces: updatedCapturedPieces,
        currentFen: gameState.fen,
        endedAt: new Date(),
      },
    });

    userSocket.send(
      JSON.stringify({
        type: ComputerGameMessages.COMPUTER_GAME_OVER,
        payload: {
          result: 'draw',
          message: `Game ended in a draw: ${reason}`,
          reason: reason,
        },
      })
    );
  } catch (error) {
    console.error('Error handling computer game draw:', error);
  }
}

async function saveComputerGameProgress(
  computerGameId: number,
  gameState: any
) {
  try {
    const moves = await parseMoves(`computer-game:${computerGameId}:moves`);
    const capturedPiecesRaw = await redis.lRange(
      `computer-game:${computerGameId}:capturedPieces`,
      0,
      -1
    );

    await pc.computerGame.update({
      where: { id: computerGameId },
      data: {
        moves: moves,
        currentFen: gameState.fen,
        capturedPieces: capturedPiecesRaw,
        lastMoveBy: gameState.playerColor,
      },
    });

    console.log(
      `Computer Game ${computerGameId}: Progress saved to DB at move count ${moves.length}`
    );
  } catch (error) {
    console.error(`Computer Game ${computerGameId} Progress Error:`, error);
  }
}

export async function handlePlayerQuit(userId: number, computerGameId: number) {
  try {
    const existingGame = await getComputerGameState(computerGameId);
    if (!existingGame) {
      console.log('Error in player quit! Computer Game Not found');
      return;
    }

    const lastMoveBy = existingGame.fen.split(' ')[1] === 'w' ? 'b' : 'w';
    await redis.hSet(`computer-game:${computerGameId}`, {
      status: ComputerGameMessages.COMPUTER_GAME_OVER,
      currentFen: existingGame.fen,
      loser: existingGame.playerColor,
      winner: 'COMPUTER',
    });

    // Clear the user's active game key so they can start a new game
    await redis.del(`user:${userId}:computer-game`);

    await pc.computerGame.update({
      where: {
        id: computerGameId,
      },
      data: {
        loserId: userId,
        moves: existingGame.moves,
        currentFen: existingGame.fen,
        capturedPieces: existingGame.capturedPieces,
        draw: false,
        lastMoveBy: lastMoveBy,
        status: 'FINISHED',
        endedAt: new Date(Date.now()),
        winnerId: null,
      },
    });
  } catch (error) {
    console.log('Error Updating Player Quit in game');
    return null;
  }
}
