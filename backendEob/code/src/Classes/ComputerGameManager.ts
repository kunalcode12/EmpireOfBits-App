import WebSocket from 'ws';
import { ErrorMessages, ComputerGameMessages } from '../utils/messages';
import { Chess } from 'chess.js';
import { redis } from '../clients/redisClient';
import pc from '../clients/prismaClient';
import {
  getComputerMove,
  handleComputerMove,
  handlePlayerMove,
  handlePlayerQuit,
  validateComputerGamePayload,
} from '../Services/ComputerGameServices';
import { Move } from '../Services/GameServices';
import provideValidMoves, { delay } from '../utils/chessUtils';

class ComputerGameManager {
  globalSetInterval: NodeJS.Timeout | null = null;
  computerGameSocketManager: Map<number, WebSocket> = new Map();
  public readonly MOVES_BEFORE_SAVE = 10;

  public addForComputerGame(userId: number, userSocket: WebSocket) {
    this.computerGameSocketManager.set(userId, userSocket);
    this.playerMessageHandler(userId, userSocket);
    this.checkAndRestoreActiveGame(userId, userSocket);
  }

  async restoreGameFromDb(computerGameId: number) {
    try {
      const gameFromDB = await pc.computerGame.findUnique({
        where: { id: computerGameId },
        select: {
          id: true,
          currentFen: true,
          moves: true,
          playerColor: true,
          computerDifficulty: true,
          capturedPieces: true,
          status: true,
        },
      });

      if (!gameFromDB || gameFromDB.status === 'FINISHED') {
        return null;
      }

      const movesArray = (
        Array.isArray(gameFromDB.moves) ? gameFromDB.moves : []
      ) as string[];
      const capturedPiecesArray = (
        Array.isArray(gameFromDB.capturedPieces)
          ? gameFromDB.capturedPieces
          : []
      ) as string[];

      // Restore to Redis
      await redis.hSet(`computer-game:${computerGameId}`, {
        playerColor: gameFromDB.playerColor || 'w',
        fen: gameFromDB.currentFen || new Chess().fen(),
        status: ComputerGameMessages.COMPUTER_GAME_ACTIVE,
        difficulty: gameFromDB.computerDifficulty || 'MEDIUM',
        movesCount: movesArray.length.toString(),
      });

      // Restore moves list
      if (movesArray.length > 0) {
        await redis.del(`computer-game:${computerGameId}:moves`);
        for (const move of movesArray) {
          await redis.rPush(
            `computer-game:${computerGameId}:moves`,
            JSON.stringify(move)
          );
        }
      }

      // Restore captured pieces
      if (capturedPiecesArray.length > 0) {
        await redis.del(`computer-game:${computerGameId}:capturedPieces`);
        for (const piece of capturedPiecesArray) {
          await redis.rPush(
            `computer-game:${computerGameId}:capturedPieces`,
            piece
          );
        }
      }

      return {
        fen: gameFromDB.currentFen || new Chess().fen(),
        playerColor: gameFromDB.playerColor || 'w',
        difficulty: gameFromDB.computerDifficulty || 'MEDIUM',
        moves: movesArray,
        capturedPieces: capturedPiecesArray,
      };
    } catch (error) {
      console.error('Failed to restore computer game from DB:', error);
      return null;
    }
  }

  // Update the checkAndRestoreActiveGame method in ComputerGameManager.ts

  async checkAndRestoreActiveGame(userId: number, userSocket: WebSocket) {
    try {
      // Check Redis first for active computer game
      const gameIdFromRedis = await redis.get(`user:${userId}:computer-game`);
      if (gameIdFromRedis) {
        const gameExists = await redis.exists(
          `computer-game:${gameIdFromRedis}`
        );
        if (gameExists) {
          // Game exists in Redis, restore and send reconnection data
          const gameState = (await redis.hGetAll(
            `computer-game:${gameIdFromRedis}`
          )) as Record<string, string>;
          const movesRaw = await redis.lRange(
            `computer-game:${gameIdFromRedis}:moves`,
            0,
            -1
          );
          const moves = movesRaw.map((m) => JSON.parse(m));
          const capturedPieces = await redis.lRange(
            `computer-game:${gameIdFromRedis}:capturedPieces`,
            0,
            -1
          );
          const validMoves = provideValidMoves(gameState.fen);

          userSocket.send(
            JSON.stringify({
              type: ComputerGameMessages.COMPUTER_GAME_ACTIVE,
              payload: {
                computerGameId: Number(gameIdFromRedis),
                fen: gameState.fen,
                playerColor: gameState.playerColor,
                difficulty: gameState.difficulty,
                moves: moves,
                message: 'Reconnected to your active game',
                validMoves: validMoves,
                capturedPieces: capturedPieces || [],
              },
            })
          );

          // 🎯 FIX: Check if it's computer's turn and make a move if needed
          const currentTurn = gameState.fen.split(' ')[1]; // "w" or "b"
          console.log(
            `[Computer Game] Player color: ${gameState.playerColor}, Current turn: ${currentTurn}`
          );

          if (gameState.playerColor !== currentTurn) {
            console.log(
              `[Computer Game] It's computer's turn, calculating move...`
            );
            await delay(1000); // Small delay so player sees the board first
            const computerMove: Move = await getComputerMove(
              gameState.fen,
              gameState.difficulty
            );
            await handleComputerMove(
              userSocket,
              computerMove,
              Number(gameIdFromRedis),
              userId
            );
          }

          return;
        }
      }

      // Check database for active computer game
      const gameFromDB = await pc.computerGame.findFirst({
        where: {
          userId: userId,
          status: 'ACTIVE',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (gameFromDB) {
        // Restore from database
        const restored = await this.restoreGameFromDb(gameFromDB.id);
        if (restored) {
          const validMoves = provideValidMoves(restored.fen);

          userSocket.send(
            JSON.stringify({
              type: ComputerGameMessages.COMPUTER_GAME_ACTIVE,
              payload: {
                computerGameId: gameFromDB.id,
                fen: restored.fen,
                playerColor: restored.playerColor,
                difficulty: restored.difficulty,
                moves: restored.moves,
                message: 'Reconnected to your active game',
                validMoves: validMoves,
                capturedPieces: restored.capturedPieces || [],
              },
            })
          );

          // 🎯 FIX: Check if it's computer's turn and make a move if needed
          const currentTurn = restored.fen.split(' ')[1]; // "w" or "b"
          console.log(
            `[Computer Game] Player color: ${restored.playerColor}, Current turn: ${currentTurn}`
          );

          if (restored.playerColor !== currentTurn) {
            console.log(
              `[Computer Game] It's computer's turn, calculating move...`
            );
            await delay(1000); // Small delay so player sees the board first
            const computerMove: Move = await getComputerMove(
              restored.fen,
              restored.difficulty
            );
            await handleComputerMove(
              userSocket,
              computerMove,
              gameFromDB.id,
              userId
            );
          }
        }
      }
    } catch (error) {
      console.error('Error checking for active computer game:', error);
      userSocket.send(
        JSON.stringify({
          type: ErrorMessages.SERVER_ERROR,
          payload: { message: 'Error reconnecting to game' },
        })
      );
    }
  }

  playerMessageHandler(userId: number, userSocket: WebSocket) {
    userSocket.on('message', async (message: string) => {
      const msg = JSON.parse(message);
      const { type, payload } = msg;
      const validationError = validateComputerGamePayload(type, payload);
      if (validationError) {
        userSocket.send(
          JSON.stringify({
            type: ErrorMessages.PAYLOAD_ERROR,
            payload: { message: validationError },
          })
        );
        return;
      }

      // if(type === ComputerGameMessages.CHECK_ACTIVE_GAME){
      //     // Check for active game and auto-reconnect if requested
      //     const autoReconnect = payload.autoReconnect === true;
      //     await this.handleCheckActiveGame(userId, userSocket, autoReconnect);
      //     return;
      // }
      // else if(type === ComputerGameMessages.INIT_COMPUTER_GAME){
      //     // Check if player already has an active game
      //     const existingGameId = await redis.get(`user:${userId}:computer-game`);
      //     if (existingGameId) {
      //         const gameExists = await redis.exists(`computer-game:${existingGameId}`);
      //         if (gameExists) {
      //             userSocket.send(JSON.stringify({
      //                 type: ComputerGameMessages.EXISTING_COMPUTER_GAME,
      //                 payload: {
      //                     computerGameId: Number(existingGameId),
      //                     message: "You already have an active game. Do you want to continue or start a new one?"
      //                 }
      //             }));
      //             return;
      //         }
      //     }

      //     // Check database for active game
      //     const activeGameInDB = await pc.computerGame.findFirst({
      //         where: {
      //             userId: userId,
      //             status: "ACTIVE"
      //         }
      //     });

      //     if (activeGameInDB) {
      //         userSocket.send(JSON.stringify({
      //             type: ComputerGameMessages.EXISTING_COMPUTER_GAME,
      //             payload: {
      //                 computerGameId: activeGameInDB.id,
      //                 message: "You already have an active game. Do you want to continue or start a new one?"
      //             }
      //         }));
      //         return;
      //     }

      //     const chess=new Chess()
      //     const {difficulty,playerColor}=payload;

      //     const newGame = await pc.computerGame.create({
      //         data:{
      //             userId: userId,
      //             currentFen: chess.fen(),
      //             playerColor: playerColor,
      //             computerDifficulty: difficulty,
      //             status: "ACTIVE"
      //         }
      //     });

      //     await redis.multi()
      //     .hSet(`computer-game:${newGame.id}`,{
      //         playerColor: playerColor,
      //         fen: chess.fen(),
      //         status: ComputerGameMessages.COMPUTER_GAME_ACTIVE,
      //         difficulty: difficulty,
      //         movesCount: "0"
      //     })
      //     .setEx(`user:${userId}:computer-game`, 86400, newGame.id.toString())
      //     .exec();

      //     userSocket.send(JSON.stringify({
      //         type: ComputerGameMessages.INIT_COMPUTER_GAME,
      //         payload: {
      //             computerGameId: newGame.id,
      //             fen: chess.fen(),
      //             playerColor: playerColor,
      //             difficulty: difficulty,
      //             validMoves:provideValidMoves(chess.fen()),
      //             capturedPieces: []
      //         }
      //     }));
      //     if(playerColor === "b"){
      //       const computerMove:Move=await getComputerMove(chess.fen(),difficulty)
      //       console.log(`Got the ComputerMove:${computerMove}`);
      //       await handleComputerMove(userSocket,computerMove,newGame.id,userId);
      //       return
      //     }
      //     return;
      // }

      if (type === ComputerGameMessages.PLAYER_MOVE) {
        const { computerGameId, move } = payload;

        await handlePlayerMove(userId, userSocket, computerGameId, move);

        return;
      } else if (type === ComputerGameMessages.PLAYER_QUIT) {
        const { computerGameId } = payload;
        await handlePlayerQuit(userId, computerGameId);
        return;
      }
    });
  }

  async handleDisconnection(userId: number) {
    try {
      this.computerGameSocketManager.delete(userId);
      console.log(`Computer game player ${userId} disconnected`);
    } catch (error) {
      console.error('Error handling computer game disconnection:', error);
    }
  }
}

export const computerGameManager = new ComputerGameManager();
