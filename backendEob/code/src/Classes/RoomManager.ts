import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import pc from '../clients/prismaClient';
import { redis } from '../clients/redisClient';
import {
  insertPlayerInQueue,
  matchingPlayer,
  MatchmakingPreferences,
  removePlayerFromQueue
} from '../Services/MatchMaking';
import {
  handleRoomChat,
  handleRoomDrawAcceptance,
  handleRoomDrawOffer,
  handleRoomDrawRejection,
  handleRoomGameLeave,
  handleRoomMove,
  handleRoomReconnection,
  handleRoomTakeback
} from '../Services/RoomGameServices';
import provideValidMoves, { parseChat } from '../utils/chessUtils';
import {
  applyRatingsForRoomGame,
  DEFAULT_RATING,
  type RoomGameResult,
} from '../utils/eloUtils';
import { ErrorMessages, GameMessages, RoomMessages } from '../utils/messages';

interface RestoredGameState {
  user1: number;
  user2: number;
  fen: string;
  whiteTimer: number;
  blackTimer: number;
  moves: string[];
  moveCount: number;
  status: string;
  chat: string[];
  capturedPieces: string[];
  roomCode: string;
}

class RoomManager {
  public roomSocketManager: Map<number, WebSocket> = new Map();
  public globalRoomClock: NodeJS.Timeout | null = null;
  private checkQueueInterval: NodeJS.Timeout | null = null;
  private readonly TIME_BUFFER_ON_CRASH = 10;

  async addRoomUser(userId: number, userSocket: WebSocket) {
    this.roomSocketManager.set(userId, userSocket);
    this.messageHandlerForRoom(userId, userSocket);

    userSocket.send(
      JSON.stringify({
        type: RoomMessages.ASSIGN_ID_FOR_ROOM,
        payload: {
          message: 'Id Assigned for room',
        },
      })
    );
    
    // Check for existing active game for reconnection
    await this.checkAndRestoreActiveGame(userId, userSocket);
  }

  async checkAndRestoreActiveGame(userId: number, userSocket: WebSocket) {
    try {
      const gameIdFromRedis = await redis.get(`user:${userId}:room-game`);
      if (gameIdFromRedis) {
        const gameData = await redis.hGetAll(`room-game:${gameIdFromRedis}`);

        if (
          gameData &&
          Object.keys(gameData).length > 0 &&
          gameData.status !== RoomMessages.ROOM_GAME_OVER
        ) {
          console.log(`♻️ Reconnecting user ${userId} to active game ${gameIdFromRedis}`);
          await handleRoomReconnection(
            userId,
            userSocket,
            Number(gameIdFromRedis),
            this.roomSocketManager
          );
          return;
        } else {
          await redis.del(`user:${userId}:room-game`);
        }
      }

      // Check DB for active game
      const activeRoom = await pc.room.findFirst({
        where: {
          OR: [{ createdById: userId }, { joinedById: userId }],
          status: 'ACTIVE',
        },
        include: { game: true },
      });

      if (activeRoom && activeRoom.game) {
        await handleRoomReconnection(
          userId,
          userSocket,
          activeRoom.game.id,
          this.roomSocketManager
        );
      }
    } catch (error) {
      console.error('Error checking for active game:', error);
    }
  }

  async startRoomTimer() {
    if (this.globalRoomClock) return;

    // Re-entrancy guard. setInterval fires every 1 s regardless of whether the
    // previous callback finished, and on a remote Redis (Upstash) a single tick
    // can take longer than 1 s. Without this guard two ticks can run in
    // parallel and each calls hIncrBy(-1) → the clock jumps by 2 (or more) per
    // wall-clock second, which is what the "random times" symptom looks like.
    let tickInFlight = false;

    this.globalRoomClock = setInterval(async () => {
      if (tickInFlight) return;
      tickInFlight = true;
      try {
        const activeRoomGames = await redis.sMembers('room-active-games');
        if (!activeRoomGames || activeRoomGames.length === 0) {
          if (this.globalRoomClock) {
            clearInterval(this.globalRoomClock);
            this.globalRoomClock = null;
          }
          return;
        }

        for (const gameId of activeRoomGames) {
          const game = (await redis.hGetAll(`room-game:${gameId}`)) as Record<string, string>;
          if (!game || Object.keys(game).length === 0 || game.status === RoomMessages.ROOM_GAME_OVER) {
            await redis.sRem('room-active-games', gameId);
            continue;
          }

          let whiteTimer = Number(game.whiteTimer);
          let blackTimer = Number(game.blackTimer);
          const turn = game.fen.split(' ')[1];

          if (turn === 'w') {
            const updated = await redis.hIncrBy(`room-game:${gameId}`, 'whiteTimer', -1);
            whiteTimer = Math.max(0, Number(updated));
          } else {
            const updated = await redis.hIncrBy(`room-game:${gameId}`, 'blackTimer', -1);
            blackTimer = Math.max(0, Number(updated));
          }

          const whitePlayerId = Number(game.user1);
          const blackPlayerId = Number(game.user2);
          const timerMessage = JSON.stringify({
            type: RoomMessages.ROOM_TIMER_UPDATE,
            payload: { whiteTimer, blackTimer, roomGameId: Number(gameId) }
          });

          this.roomSocketManager.get(whitePlayerId)?.send(timerMessage);
          this.roomSocketManager.get(blackPlayerId)?.send(timerMessage);

          if (whiteTimer <= 0 || blackTimer <= 0) {
            await this.handleRoomTimeExpired(game, gameId, whiteTimer, blackTimer);
          }
        }
      } catch (error) {
        console.error('Error in room timer:', error);
      } finally {
        tickInFlight = false;
      }
    }, 1000);
  }

  async handleRoomTimeExpired(game: Record<string, string>, gameId: string, whiteTimer: number, blackTimer: number) {
    try {
      // Defensive guard: never process timeout unless a clock actually reached zero.
      if (whiteTimer > 0 && blackTimer > 0) {
        return;
      }
      if (!Number.isFinite(whiteTimer) || !Number.isFinite(blackTimer)) {
        console.log(`[Room Timeout] skipped due to invalid timers for game ${gameId}`, { whiteTimer, blackTimer });
        return;
      }
      // If game was already finished/cancelled by resign/draw/other flow, ignore timeout handling.
      if (game.status && game.status !== RoomMessages.ROOM_GAME_ACTIVE) {
        return;
      }

      const winnerId = whiteTimer <= 0 ? Number(game.user2) : Number(game.user1);
      const loserId = whiteTimer <= 0 ? Number(game.user1) : Number(game.user2);
      const winnerColor = winnerId === Number(game.user1) ? 'w' : 'b';
      const roomCode = game.roomCode;

      const roomFromDb = await pc.room.findUnique({
        where: { code: roomCode },
        select: { status: true, game: { select: { status: true } } },
      });
      if (!roomFromDb || roomFromDb.status !== 'ACTIVE' || roomFromDb.game?.status !== 'ACTIVE') {
        return;
      }

      const chatArr = await parseChat(`room-game:${gameId}:chat`);
      const moves = game.moves ? JSON.parse(game.moves) : [];

      await pc.$transaction([
        pc.game.update({
          where: { id: Number(gameId) },
          data: {
            winnerId, loserId, draw: false, status: 'FINISHED', endedAt: new Date(),
            moves, chat: chatArr, currentFen: game.fen, whiteTimeLeft: whiteTimer, blackTimeLeft: blackTimer,
            lastMoveBy: whiteTimer <= 0 ? 'w' : 'b', lastMoveAt: new Date()
          },
        }),
        pc.room.update({
          where: { code: roomCode },
          data: { status: 'FINISHED' },
        }),
      ]);

      await redis.multi()
        .hIncrBy(`stats`, 'roomGamesCount', 1)
        .hSet(`room-game:${gameId}`, { status: RoomMessages.ROOM_GAME_OVER, winner: winnerId.toString() })
        .del([`user:${winnerId}:room-game`, `user:${loserId}:room-game`, `room-game:${gameId}`, `room-game:${gameId}:moves`, `room-game:${gameId}:chat`, `room-game:${gameId}:capturedPieces` ])
        .sRem('room-active-games', gameId)
        .exec();

      const gameOverMsg = (result: string, msg: string) => JSON.stringify({
        type: RoomMessages.ROOM_GAME_OVER,
        payload: { result, reason: RoomMessages.ROOM_TIME_EXCEEDED, winner: winnerColor, message: msg, roomStatus: 'FINISHED', gameStatus: 'GAME_OVER' }
      });

      const winnerSocket = this.roomSocketManager.get(winnerId);
      const loserSocket = this.roomSocketManager.get(loserId);
      if (winnerSocket && winnerSocket.readyState === WebSocket.OPEN) winnerSocket.send(gameOverMsg('win', '🎉 You won! Your opponent ran out of time.'));
      if (loserSocket && loserSocket.readyState === WebSocket.OPEN) loserSocket.send(gameOverMsg('lose', "⏱️ Time's up! You lost on time."));

      // Elo rating update — broadcast AFTER ROOM_GAME_OVER messages.
      const whiteUserId = Number(game.user1);
      const blackUserId = Number(game.user2);
      if (
        Number.isFinite(whiteUserId) &&
        Number.isFinite(blackUserId) &&
        whiteUserId > 0 &&
        blackUserId > 0
      ) {
        const result: RoomGameResult =
          winnerColor === 'w' ? 'white_wins' : 'black_wins';
        applyRatingsForRoomGame({
          gameId: Number(gameId),
          whiteUserId,
          blackUserId,
          result,
          socketManager: this.roomSocketManager,
        }).catch((err) =>
          console.error(
            `[Elo] timeout rating update failed for game ${gameId}:`,
            err,
          ),
        );
      }
    } catch (error) {
      console.error('Error handling time expiration:', error);
    }
  }

  async checkQueueAndSendMessage() {
    if (this.checkQueueInterval) return;

    this.checkQueueInterval = setInterval(async () => {
      const now = Date.now();
      const sixtySecondsAgo = now - 60 * 1000;
      const allQueues = [
        'auth:matchmaking:queue:5:w', 'auth:matchmaking:queue:5:b', 'auth:matchmaking:queue:5:r',
        'auth:matchmaking:queue:10:w', 'auth:matchmaking:queue:10:b', 'auth:matchmaking:queue:10:r'
      ];

      let totalPlayers = 0;
      for (const q of allQueues) {
        totalPlayers += await redis.zCard(q);
        const expired = await redis.zRangeByScore(q, 0, sixtySecondsAgo);
        for (const playerId of expired) {
          await redis.zRem(q, playerId);
          const userIdNum = parseInt(playerId);
          if (!isNaN(userIdNum)) {
             const socket = this.roomSocketManager.get(userIdNum);
             if (socket && socket.readyState === WebSocket.OPEN) {
               socket.send(JSON.stringify({
                type: GameMessages.MATCH_NOT_FOUND,
                payload: { message: 'No compatible match found within 60 seconds.' }
              }));
             }
          }
        }
      }

      if (totalPlayers === 0) {
        clearInterval(this.checkQueueInterval!);
        this.checkQueueInterval = null;
      }
    }, 10000);
  }

  async messageHandlerForRoom(userId: number, userSocket: WebSocket) {
    userSocket.on('message', async (message: string) => {
      try {
        const msg = JSON.parse(message);
        const { type, payload } = msg;

        if (type === RoomMessages.INIT_ROOM_GAME) {
          const { timeControl, colorPreference } = payload;
          if (!timeControl || !colorPreference) {
             userSocket.send(JSON.stringify({ type: ErrorMessages.PAYLOAD_ERROR, payload: { message: 'Missing preferences' } }));
             return;
          }

          let userRating = DEFAULT_RATING;
          try {
            const me = await pc.user.findUnique({
              where: { id: userId },
              select: { rating: true },
            });
            if (me && typeof me.rating === 'number') {
              userRating = me.rating;
            }
          } catch (ratingFetchErr) {
            console.error(
              'Failed to fetch user rating for matchmaking, using default:',
              ratingFetchErr,
            );
          }

          const prefs: MatchmakingPreferences = {
            timeControl,
            colorPreference,
            isGuest: false,
            rating: userRating,
          };
          let match = await matchingPlayer(userId.toString(), prefs);

          if (!match) {
            const inserted = await insertPlayerInQueue(userId.toString(), prefs);
            if (!inserted) {
              userSocket.send(JSON.stringify({ type: GameMessages.ALREADY_IN_QUEUE, payload: { searching: true, message: 'Already in queue' } }));
              return;
            }
            await this.checkQueueAndSendMessage();
            // Handle simultaneous enqueue race:
            // if both users queued almost at the same time, re-check immediately.
            match = await matchingPlayer(userId.toString(), prefs);
            if (!match) return;
            await removePlayerFromQueue(userId.toString(), false);
          }

          // Match found!
          const opponentId = parseInt(match.opponentId);
          const whiteId = parseInt(match.whitePlayerId);
          const blackId = parseInt(match.blackPlayerId);
          const chess = new Chess();
          const timeLimit = parseInt(timeControl) * 60;
          const roomCode = nanoid();

          const matchedUsers = await pc.user.findMany({
            where: { id: { in: [whiteId, blackId] } },
            select: { id: true, name: true, rating: true },
          });
          const nameById = new Map(matchedUsers.map((user) => [user.id, user.name]));
          const ratingById = new Map(
            matchedUsers.map((user) => [user.id, user.rating ?? DEFAULT_RATING]),
          );
          const whiteRating = ratingById.get(whiteId) ?? DEFAULT_RATING;
          const blackRating = ratingById.get(blackId) ?? DEFAULT_RATING;

          const newRoom = await pc.room.create({
            data: {
              code: roomCode,
              createdById: whiteId,
              joinedById: blackId,
              status: 'ACTIVE',
            }
          });

          const newGame = await pc.game.create({
            data: {
              currentFen: chess.fen(),
              roomId: newRoom.id,
              whiteTimeLeft: timeLimit,
              blackTimeLeft: timeLimit,
              type: 'RANDOM',
              status: 'ACTIVE',
              lastMoveAt: new Date(),
              whiteRatingBefore: whiteRating,
              blackRatingBefore: blackRating,
            }
          });

          await redis.multi()
            .hSet(`room-game:${newGame.id}`, {
              user1: whiteId.toString(),
              user2: blackId.toString(),
              status: RoomMessages.ROOM_GAME_ACTIVE,
              fen: chess.fen(),
              whiteTimer: timeLimit.toString(),
              blackTimer: timeLimit.toString(),
              moveCount: '0',
              roomCode: roomCode
            })
            .setEx(`user:${whiteId}:room-game`, 86400, newGame.id.toString())
            .setEx(`user:${blackId}:room-game`, 86400, newGame.id.toString())
            .exec();

          const initPayload = (color: string, playerId: number, oppId: number) => JSON.stringify({
            type: RoomMessages.INIT_ROOM_GAME,
            payload: {
              color, fen: chess.fen(), whiteTimer: timeLimit, blackTimer: timeLimit,
              opponentId: oppId,
              opponentName: nameById.get(oppId) ?? null,
              playerName: nameById.get(playerId) ?? null,
              playerRating: ratingById.get(playerId) ?? DEFAULT_RATING,
              opponentRating: ratingById.get(oppId) ?? DEFAULT_RATING,
              whiteRating,
              blackRating,
              roomGameId: newGame.id,
              validMoves: color === 'w' ? provideValidMoves(chess.fen()) : []
            }
          });

          const whiteSocket = this.roomSocketManager.get(whiteId);
          const blackSocket = this.roomSocketManager.get(blackId);
          const whiteOnline = Boolean(whiteSocket && whiteSocket.readyState === WebSocket.OPEN);
          const blackOnline = Boolean(blackSocket && blackSocket.readyState === WebSocket.OPEN);

          // Do not start a game unless both matched users are still connected.
          if (!whiteOnline || !blackOnline) {
            if (whiteOnline) {
              await insertPlayerInQueue(String(whiteId), {
                timeControl,
                colorPreference: 'r',
                isGuest: false,
              });
              whiteSocket!.send(
                JSON.stringify({
                  type: GameMessages.ALREADY_IN_QUEUE,
                  payload: {
                    searching: true,
                    message: 'Opponent was unavailable. Continuing matchmaking...',
                  },
                })
              );
            }

            if (blackOnline) {
              await insertPlayerInQueue(String(blackId), {
                timeControl,
                colorPreference: 'r',
                isGuest: false,
              });
              blackSocket!.send(
                JSON.stringify({
                  type: GameMessages.ALREADY_IN_QUEUE,
                  payload: {
                    searching: true,
                    message: 'Opponent was unavailable. Continuing matchmaking...',
                  },
                })
              );
            }

            await this.checkQueueAndSendMessage();
            return;
          }

          if (whiteSocket && whiteSocket.readyState === WebSocket.OPEN) whiteSocket.send(initPayload('w', whiteId, blackId));
          if (blackSocket && blackSocket.readyState === WebSocket.OPEN) blackSocket.send(initPayload('b', blackId, whiteId));

          await redis.sAdd('room-active-games', newGame.id.toString());
          await this.startRoomTimer();
          return;
        }

        // Generic handlers for other messages
        switch (type) {
          case GameMessages.CANCEL_SEARCH: {
            const removed = await removePlayerFromQueue(userId.toString(), false);
            userSocket.send(
              JSON.stringify({
                type: GameMessages.SEARCH_CANCELLED,
                payload: {
                  success: removed,
                  message: removed ? 'Search cancelled' : 'You were not in queue',
                },
              })
            );
            break;
          }
          case RoomMessages.ROOM_MOVE:
            await handleRoomMove(userId, userSocket, payload, payload.roomGameId, this.roomSocketManager);
            break;
          case RoomMessages.ROOM_CHAT:
            await handleRoomChat(userId, userSocket, payload.roomGameId, payload.message, this.roomSocketManager);
            break;
          case RoomMessages.ROOM_LEAVE_GAME:
            await handleRoomGameLeave(userId, userSocket, payload.roomGameId, this.roomSocketManager);
            break;
          case RoomMessages.ROOM_RECONNECT:
            await handleRoomReconnection(userId, userSocket, payload.roomGameId, this.roomSocketManager);
            break;
          case GameMessages.OFFER_DRAW:
            await handleRoomDrawOffer(userId, userSocket, payload.roomGameId, this.roomSocketManager);
            break;
          case GameMessages.ACCEPT_DRAW:
            await handleRoomDrawAcceptance(userId, userSocket, payload.roomGameId, this.roomSocketManager);
            break;
          case GameMessages.REJECT_DRAW:
            await handleRoomDrawRejection(userId, userSocket, payload.roomGameId, this.roomSocketManager);
            break;
          case RoomMessages.ROOM_TAKEBACK:
            await handleRoomTakeback(userId, userSocket, payload.roomGameId, this.roomSocketManager);
            break;
          default:
            userSocket.send(JSON.stringify({ type: RoomMessages.WRONG_ROOM_MESSAGE, payload: { message: 'Invalid Action' } }));
        }
      } catch (e) {
        console.error('Error in room message handler:', e);
      }
    });
  }

  async restoreGameFromDB(gameId: number): Promise<RestoredGameState | null> {
    try {
      const gameFromDB = await pc.game.findUnique({
        where: { id: gameId },
        include: { room: true },
      });

      if (!gameFromDB || !gameFromDB.room || gameFromDB.status === 'FINISHED') return null;

      let whiteTimeLeft = gameFromDB.whiteTimeLeft;
      let blackTimeLeft = gameFromDB.blackTimeLeft;

      if (gameFromDB.lastMoveAt && gameFromDB.lastMoveBy) {
        const elapsed = Math.floor((Date.now() - gameFromDB.lastMoveAt.getTime()) / 1000);
        const chess = new Chess(gameFromDB.currentFen);
        if (chess.turn() === 'w') whiteTimeLeft = Math.max(0, whiteTimeLeft - elapsed);
        else blackTimeLeft = Math.max(0, blackTimeLeft - elapsed);
        
        if (elapsed > 10) {
          whiteTimeLeft += this.TIME_BUFFER_ON_CRASH;
          blackTimeLeft += this.TIME_BUFFER_ON_CRASH;
        }
      }

      const chat = (Array.isArray(gameFromDB.chat) ? gameFromDB.chat : []) as string[];
      const moves = (Array.isArray(gameFromDB.moves) ? gameFromDB.moves : []) as string[];

      await redis.hSet(`room-game:${gameId}`, {
        user1: gameFromDB.room.createdById.toString(),
        user2: gameFromDB.room.joinedById!.toString(),
        status: RoomMessages.ROOM_GAME_ACTIVE,
        fen: gameFromDB.currentFen,
        whiteTimer: whiteTimeLeft.toString(),
        blackTimer: blackTimeLeft.toString(),
        moveCount: moves.length.toString(),
        roomCode: gameFromDB.room.code,
      });

      await redis.del(`room-game:${gameId}:moves`);
      for (const m of moves) await redis.rPush(`room-game:${gameId}:moves`, JSON.stringify(m));
      
      await redis.del(`room-game:${gameId}:chat`);
      for (const c of chat) await redis.rPush(`room-game:${gameId}:chat`, JSON.stringify(c));

      await redis.sAdd('room-active-games', gameId.toString());
      
      return {
        user1: gameFromDB.room.createdById,
        user2: gameFromDB.room.joinedById!,
        fen: gameFromDB.currentFen,
        whiteTimer: whiteTimeLeft,
        blackTimer: blackTimeLeft,
        moves,
        moveCount: moves.length,
        status: RoomMessages.ROOM_GAME_ACTIVE,
        chat,
        capturedPieces: gameFromDB.capturedPieces,
        roomCode: gameFromDB.room.code,
      };
    } catch (error) {
      console.error('Failed to restore game from DB:', error);
      return null;
    }
  }

  async handleDisconnection(userId: number) {
    const roomGameId = await redis.get(`user:${userId}:room-game`);
    if (roomGameId) {
      const roomGame = await redis.hGetAll(`room-game:${roomGameId}`);
      if (roomGame && Object.keys(roomGame).length > 0) {
        const whiteId = Number(roomGame.user1);
        const blackId = Number(roomGame.user2);
        const opponentId = whiteId === userId ? blackId : whiteId;
        const opponentSocket = this.roomSocketManager.get(opponentId);
        if (opponentSocket && opponentSocket.readyState === WebSocket.OPEN) {
          opponentSocket.send(
            JSON.stringify({
              type: RoomMessages.ROOM_OPP_DISCONNECTED,
              payload: { message: 'Opponent disconnected - waiting for reconnect.' },
            })
          );
        }
      }
    }

    this.roomSocketManager.delete(userId);
    await removePlayerFromQueue(userId.toString(), false);
  }
}

export const roomManager = new RoomManager();