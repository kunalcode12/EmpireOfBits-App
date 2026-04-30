import { Chess } from 'chess.js';
import { WebSocket } from 'ws';
import pc from '../clients/prismaClient';
import { redis } from '../clients/redisClient';
import {
  acceptDraw,
  getGameState,
  handleGuestGameMove,
  offerDraw,
  playerLeft,
  reconnectPlayer,
  rejectDraw,
  validateGamePayload,
} from '../Services/GameServices';
import {
  MatchmakingPreferences,
  insertPlayerInQueue,
  matchingPlayer,
  removePlayerFromQueue,
} from '../Services/MatchMaking';
import provideValidMoves, {
  parseMoves,
} from '../utils/chessUtils';
import { ErrorMessages, GameMessages } from '../utils/messages';
export class GameManager {
  private socketMap: Map<string, WebSocket> = new Map();
  private globalSetInterval: NodeJS.Timeout | null = null;
  private checkQueueInterval: NodeJS.Timeout | null = null;
  private disconnectionQueueInterval: NodeJS.Timeout | null = null;
  async addUser(socket: WebSocket, id: string) {
    this.socketMap.set(id, socket);
    this.gameMessageHandler(socket, id);

    const existingGameId = await redis.get(`user:${id}:game`);
    if (existingGameId) {
      // update socketMap for reconnection
      await reconnectPlayer(id, existingGameId, socket, this.socketMap);
      return;
    }

    // Check if player is already in matchmaking queue
    const allQueues = [
      'matchmaking:queue:5:w', 'matchmaking:queue:5:b', 'matchmaking:queue:5:r',
      'matchmaking:queue:10:w', 'matchmaking:queue:10:b', 'matchmaking:queue:10:r'
    ];
    
    for (const q of allQueues) {
      const isInQueue = await redis.zScore(q, id);
      if (isInQueue !== null) {
        console.log(`Player ${id} is already in queue ${q}, restoring search state`);
        socket.send(
          JSON.stringify({
            type: GameMessages.ALREADY_IN_QUEUE,
            payload: {
              searching: true,
              message: 'You are already in the matchmaking queue',
            },
          })
        );
        return;
      }
    }
  }

  async checkQueueAndSendMessage() {
    if (this.checkQueueInterval) return;

    this.checkQueueInterval = setInterval(async () => {
      const now = Date.now();
      const sixtySecondsAgo = now - 60 * 1000;
      
      const allQueues = [
        'guest:matchmaking:queue:5:w', 'guest:matchmaking:queue:5:b', 'guest:matchmaking:queue:5:r',
        'guest:matchmaking:queue:10:w', 'guest:matchmaking:queue:10:b', 'guest:matchmaking:queue:10:r'
      ];

      let totalPlayers = 0;
      for (const q of allQueues) {
        const queue_length = await redis.zCard(q);
        totalPlayers += queue_length;

        const expiredPlayers = await redis.zRangeByScore(q, 0, sixtySecondsAgo);

        if (expiredPlayers.length > 0) {
          for (const playerId of expiredPlayers) {
            await redis.zRem(q, playerId);
            const playerSocket = this.socketMap.get(playerId);
            if (playerSocket && playerSocket.readyState === WebSocket.OPEN) {
              playerSocket.send(
                JSON.stringify({
                  type: GameMessages.MATCH_NOT_FOUND,
                  payload: {
                    message: 'No compatible match found within 60 seconds. Please try again.',
                  },
                })
              );
            }
          }
        }
      }

      if (totalPlayers === 0 && this.checkQueueInterval) {
        console.log('Queue empty, stopping queue check interval');
        clearInterval(this.checkQueueInterval);
        this.checkQueueInterval = null;
        return;
      }
    }, 10000); // Run every 10 seconds for faster cleanup
  }

  async startTimer() {
    // if globalSetInterval is not null means it is already running and this will run
    // there are active-games other wise it will stop
    if (this.globalSetInterval) {
      console.log('Timer already running');
      return;
    }

    this.globalSetInterval = setInterval(async () => {
      try {
        // Get all active games
        const activeGames = await redis.sMembers('active-games');

        // If no games, stop the timer
        if (!activeGames || activeGames.length === 0) {
          console.log('No active games, stopping timer');
          if (this.globalSetInterval) {
            clearInterval(this.globalSetInterval);
            this.globalSetInterval = null;
          }
          return;
        }

        // Process each game
        for (const gameId of activeGames) {
          const game = (await redis.hGetAll(`guest-game:${gameId}`)) as Record<
            string,
            string
          >;

          // Skip if game not found
          if (!game || Object.keys(game).length === 0) {
            await redis.sRem('active-games', gameId);
            continue;
          }

          // Skip if game already over
          if (
            game.status === GameMessages.GAME_OVER ||
            game.status === GameMessages.DISCONNECTED
          ) {
            await redis.sRem('active-games', gameId);
            continue;
          }

          // Get current timers and turn
          let blackTimer = Number(game.blackTimer) || 0;
          let whiteTimer = Number(game.whiteTimer) || 0;
          const fen = game.fen;
          const turn = fen.split(' ')[1]; // 'w' or 'b'

          // Only decrement if timer is still positive
          if (turn === 'w' && whiteTimer > 0) {
            const newWhiteTimer = await redis.hIncrBy(
              `guest-game:${gameId}`,
              'whiteTimer',
              -1
            );
            whiteTimer = Math.max(0, Number(newWhiteTimer));
            // If timer went negative, reset to 0 in Redis
            if (newWhiteTimer < 0) {
              await redis.hSet(`guest-game:${gameId}`, 'whiteTimer', '0');
              whiteTimer = 0;
            }
          } else if (turn === 'b' && blackTimer > 0) {
            const newBlackTimer = await redis.hIncrBy(
              `guest-game:${gameId}`,
              'blackTimer',
              -1
            );
            blackTimer = Math.max(0, Number(newBlackTimer));
            // If timer went negative, reset to 0 in Redis
            if (newBlackTimer < 0) {
              await redis.hSet(`guest-game:${gameId}`, 'blackTimer', '0');
              blackTimer = 0;
            }
          }

          // Get sockets
          const whiteSocket = this.socketMap.get(game.whitePlayerId);
          const blackSocket = this.socketMap.get(game.blackPlayerId);

          // Send timer update to both players
          if (whiteSocket && blackSocket) {
            const timerMessage = {
              type: GameMessages.TIMER_UPDATE,
              payload: {
                whiteTimer: whiteTimer,
                blackTimer: blackTimer,
              },
            };

            whiteSocket.send(JSON.stringify(timerMessage));
            blackSocket.send(JSON.stringify(timerMessage));
          }

          // Check if time ran out
          if (whiteTimer <= 0 || blackTimer <= 0) {
            await this.handleTimeExpired(game, gameId, whiteTimer, blackTimer);
          }
        }
      } catch (error) {
        console.error('Error in timer:', error);
      }
    }, 1000);
  }

  async checkDisconnectionQueue() {
    if (this.disconnectionQueueInterval) return;

    this.disconnectionQueueInterval = setInterval(async () => {
      const thirtySecondsAgo = Date.now() - 30 * 1000;

      const queue = await redis.zRangeByScore(
        `guest-games:disconnection:queue`,
        0,
        thirtySecondsAgo
      );


      if (!queue || queue.length === 0) {
        console.log('No players in guest-gamees disconnection queue');
        if (this.disconnectionQueueInterval) {
          clearInterval(this.disconnectionQueueInterval);
          this.disconnectionQueueInterval = null;
        }
        return;
      }

      for (const gameAndPlayerIds of queue) {
        const [playerId, gameId] = gameAndPlayerIds.split(':');

        // Check if game still exists
        const game = await redis.exists(`guest-game:${gameId}`);
        if (!game) {
          await redis.zRem(`guest-games:disconnection:queue`, gameAndPlayerIds);
          continue;
        }

        // Check current game status
        const currentStatus = await redis.hGet(`guest-game:${gameId}`, 'status');

        // If game is already over or player reconnected (status is ACTIVE), remove from queue
        if (currentStatus === GameMessages.GAME_OVER || currentStatus === GameMessages.GAME_ACTIVE) {
          await redis.zRem(`guest-games:disconnection:queue`, gameAndPlayerIds);
          continue;
        }

        // Get game state to determine opponent
        const gameState = await getGameState(gameId);
        if (!gameState) {
          await redis.zRem(`guest-games:disconnection:queue`, gameAndPlayerIds);
          continue;
        }

        // Determine opponent
        const opponentId = gameState.blackPlayerId === playerId ? gameState.whitePlayerId : gameState.blackPlayerId;
        const opponentSocket = this.socketMap.get(opponentId);

        // Call playerLeft with opponent socket if it exists, otherwise without socket
        if (opponentSocket) {
          await playerLeft(playerId, gameId, opponentSocket);
        } else {
          // Edge case: both players disconnected, no socket to notify
          await playerLeft(playerId, gameId);
        }

        // Remove from queue after processing
        await redis.zRem(`guest-games:disconnection:queue`, gameAndPlayerIds);
      }
    }, 30000);
  }

  async handleTimeExpired(
    game: Record<string, string>,
    gameId: string,
    whiteTimer: number,
    blackTimer: number
  ) {
    try {
      // If white timer <= 0, black wins. If black timer <= 0, white wins.
      const winnerId =
        whiteTimer <= 0 ? game.blackPlayerId : game.whitePlayerId;
      const loserId = whiteTimer <= 0 ? game.whitePlayerId : game.blackPlayerId;
      const winnerColor = whiteTimer <= 0 ? 'b' : 'w';
      const loserColor = whiteTimer <= 0 ? 'w' : 'b';
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
      await redis.hSet(`guest-game:${gameId}`, {
        status: GameMessages.GAME_OVER,
        winner: winnerColor,
        whiteTimer: String(whiteTimer),
        blackTimer: String(blackTimer),
      });
      const final_capturedPieces = await redis.lRange(
        `guest-game:${gameId}:capturedPieces`,
        0,
        -1
      );
      const final_moves = await parseMoves(`guest-game:${gameId}:moves`);
      //Time Logic FOR DB
      const player1TimerLeft =
        existingGameFromDb.player1Color === 'w' ? whiteTimer : blackTimer;
      const player2TimeLeft =
        existingGameFromDb.player1Color === 'w' ? blackTimer : whiteTimer;

      await redis.sRem('active-games', gameId);
      await redis.expire(`guest-game:${gameId}`, 600);
      await pc.guestGames.update({
        where: {
          id: Number(gameId),
        },
        data: {
          status: 'FINISHED',
          winner: winnerColor,
          loser: loserColor,
          moves: final_moves,
          capturedPieces: final_capturedPieces,
          endedAt: new Date(),
          currentFen: game.fen,
          draw: false,
          player1TimeLeft: player1TimerLeft,
          player2TimeLeft: player2TimeLeft,
        },
      });
      await redis.hIncrBy(`stats`, 'guestGamesCount', 1);
      const winnerSocket = this.socketMap.get(winnerId);
      const loserSocket = this.socketMap.get(loserId);
      const winnerMessage = JSON.stringify({
        type: GameMessages.TIME_EXCEEDED,
        payload: {
          result: 'win',
          reason: GameMessages.TIME_EXCEEDED,
          winner: winnerColor,
          loser: loserColor,
          message: '🎉 You won! Your opponent ran out of time.',
        },
      });

      // Send loser message
      const loserMessage = JSON.stringify({
        type: GameMessages.TIME_EXCEEDED,
        payload: {
          result: 'lose',
          reason: GameMessages.TIME_EXCEEDED,
          winner: winnerColor,
          loser: loserColor,
          message: "⏱️ Time's up! You lost on time.",
        },
      });

      winnerSocket?.send(winnerMessage);
      loserSocket?.send(loserMessage);
    } catch (error) {
      console.log('error in handleTimeExpired: ', error);
      return null;
    }
  }

  async restoreGuestGameFromDb(gameId: string, socket: WebSocket) {
    const restoredGameFromDb = await pc.guestGames.findFirst({
      where: {
        id: Number(gameId),
      },
    });
    if (!restoredGameFromDb || restoredGameFromDb.status === 'FINISHED') {
      console.log(`Game : ${gameId} does not exist on DB or Game is FINISHED`);
      socket.send(
        JSON.stringify({
          type: GameMessages.GAME_NOT_FOUND,
          payload: {
            code: 'GAME_NOT_FOUND',
            message: 'Your game session has expired or was lost.',
          },
        })
      );
      return;
    }
    //Timers
    let whiteTimer =
      restoredGameFromDb.player1Color === 'w'
        ? restoredGameFromDb.player1TimeLeft
        : restoredGameFromDb.player2TimeLeft;
    let blackTimer =
      restoredGameFromDb.player1Color === 'w'
        ? restoredGameFromDb.player2TimeLeft
        : restoredGameFromDb.player1TimeLeft;
    //Ids
    let whitePlayerId =
      restoredGameFromDb.player1Color === 'w'
        ? restoredGameFromDb.player1GuestId
        : restoredGameFromDb.player2GuestId;
    let blackPlayerId =
      restoredGameFromDb.player1Color === 'w'
        ? restoredGameFromDb.player2GuestId
        : restoredGameFromDb.player1GuestId;

    const movesArray = (
      Array.isArray(restoredGameFromDb.moves) ? restoredGameFromDb.moves : []
    ) as string[];
    const movesCount = movesArray.length.toString();
    await redis.hSet(`guest-game:${gameId}`, {
      player1TimeLeft: String(restoredGameFromDb.player1TimeLeft),
      player2TimeLeft: String(restoredGameFromDb.player2TimeLeft),
      whiteTimer: String(whiteTimer),
      blackTimer: String(blackTimer),
      whitePlayerId: whitePlayerId,
      blackPlayerId: blackPlayerId,
      status: GameMessages.GAME_ACTIVE,
      fen: restoredGameFromDb.currentFen,
      movesCount: movesCount,
    });
    if (movesArray.length > 0) {
      await redis.del(`guest-games:${gameId}:moves`);
      for (const move of movesArray) {
        await redis.rPush(`guest-game:${gameId}:moves`, JSON.stringify(move));
      }
    }
    await redis.sAdd('active-games', gameId.toString());
    if (restoredGameFromDb.capturedPieces.length > 0) {
      await redis.del(`guest-game:${gameId}:capturedPieces`);
      //Use for of loop basically for async await becuase in
      //forEach the promises are not awaited which can crash the code
      for (const pieces of restoredGameFromDb.capturedPieces) {
        await redis.rPush(`guest-game:${gameId}:capturedPieces`, pieces);
      }
    }

    return {
      whitePlayerId: whitePlayerId,
      blackPlayerId: blackPlayerId,
      whiteTimer: whiteTimer,
      blackTimer: blackTimer,
      capturedPieces: restoredGameFromDb.capturedPieces,
      fen: restoredGameFromDb.currentFen,
      moves: movesArray,
      moveCount: movesCount,
    };
  }

  private gameMessageHandler(socket: WebSocket, id: string) {
    socket.on('message', async (message: string) => {
      const msg = JSON.parse(message);
      const { type, payload } = msg;

      const validationError = validateGamePayload(type, payload);
      if (validationError) {
        socket.send(
          JSON.stringify({
            type: ErrorMessages.PAYLOAD_ERROR,
            payload: { message: validationError },
          })
        );
        return;
      }

      // Cancel Search - remove player from matchmaking queue
      if (type === GameMessages.CANCEL_SEARCH) {
        const removed = await removePlayerFromQueue(id, true);

        socket.send(
          JSON.stringify({
            type: GameMessages.SEARCH_CANCELLED,
            payload: {
              success: removed,
              message: removed ? 'Search cancelled' : 'You were not in queue',
            },
          })
        );
        return;
      }

      //New Game Block
      if (type === GameMessages.INIT_GAME) {
        const { timeControl, colorPreference } = payload;
        
        if (!timeControl || !colorPreference || !['5', '10'].includes(timeControl) || !['w', 'b', 'r'].includes(colorPreference)) {
          socket.send(JSON.stringify({
            type: ErrorMessages.PAYLOAD_ERROR,
            payload: { message: 'Invalid time control or color preference' }
          }));
          return;
        }

        const prefs: MatchmakingPreferences = { timeControl, colorPreference, isGuest: true };
        let matchFound = await matchingPlayer(id, prefs);

        if (!matchFound) {
          const inserted = await insertPlayerInQueue(id, prefs);
          if (!inserted) {
            socket.send(
              JSON.stringify({
                type: GameMessages.ALREADY_IN_QUEUE,
                payload: {
                  searching: true,
                  message: 'You are already in queue',
                },
              })
            );
            return;
          }
          await this.checkQueueAndSendMessage();
          // Handle simultaneous enqueue race for guest matchmaking too.
          matchFound = await matchingPlayer(id, prefs);
          if (!matchFound) return;
          await removePlayerFromQueue(id, true);
        }

        const matchedPlayerId = matchFound.opponentId;
        const whitePlayerId = matchFound.whitePlayerId;
        const blackPlayerId = matchFound.blackPlayerId;
        const whitePlayerSocket = this.socketMap.get(whitePlayerId);
        const blackPlayerSocket = this.socketMap.get(blackPlayerId);
        const playerDisconnectedPayload = {
          type: GameMessages.DISCONNECTED,
          payload: {
            message: 'player left, Finding another Match`',
          },
        };
        if (!whitePlayerSocket) {
          // If white disconnected, put black back in queue
          // We assume black was 'b' or 'r'. Let's use 'r' to be safe or try to deduce.
          // For now, let's just use the current timeControl.
          await insertPlayerInQueue(blackPlayerId, { timeControl: timeControl as '5' | '10', colorPreference: 'r', isGuest: true });
          if (blackPlayerSocket) {
            blackPlayerSocket.send(JSON.stringify(playerDisconnectedPayload));
          }
          return;
        }
        if (!blackPlayerSocket) {
          // If black disconnected, put white back in queue
          await insertPlayerInQueue(whitePlayerId, { timeControl: timeControl as '5' | '10', colorPreference: 'r', isGuest: true });
          whitePlayerSocket.send(JSON.stringify(playerDisconnectedPayload));
          return;
        }

        const chessInstance = new Chess();
        const timeLimit = parseInt(timeControl) * 60;

        const guestGameDB = await pc.guestGames.create({
          data: {
            currentFen: chessInstance.fen(),
            player1GuestId: whitePlayerId,
            player2GuestId: blackPlayerId,
            player1Color: 'w',
            player1TimeLeft: timeLimit,
            player2TimeLeft: timeLimit,
            status: 'ACTIVE',
          },
        });
        // Save game state in Redis
        await redis
          .multi()
          .hSet(`guest-game:${guestGameDB.id}`, {
            whitePlayerId: whitePlayerId,
            blackPlayerId: blackPlayerId,
            status: GameMessages.GAME_ACTIVE,
            fen: chessInstance.fen(),
            whiteTimer: String(timeLimit),
            blackTimer: String(timeLimit),
          })
          .setEx(`user:${whitePlayerId}:game`, 1800, String(guestGameDB.id))
          .setEx(`user:${blackPlayerId}:game`, 1800, String(guestGameDB.id))
          .exec();

        // Precompute valid moves
        const moves = provideValidMoves(chessInstance.fen());

        console.log('New game started:', String(guestGameDB.id));

        // Notify (white) Player
        whitePlayerSocket.send(
          JSON.stringify({
            type: GameMessages.INIT_GAME,
            payload: {
              color: 'w',
              gameId: String(guestGameDB.id),
              fen: chessInstance.fen(),
              opponentId: blackPlayerId,
              turn: chessInstance.turn(),
              whiteTimer: timeLimit,
              blackTimer: timeLimit,
              validMoves: moves,
            },
          })
        );

        blackPlayerSocket.send(
          JSON.stringify({
            type: GameMessages.INIT_GAME,
            payload: {
              color: 'b',
              gameId: String(guestGameDB.id),
              fen: chessInstance.fen(),
              opponentId: whitePlayerId,
              turn: chessInstance.turn(),
              whiteTimer: timeLimit,
              blackTimer: timeLimit,
              moveCount: '0',
            },
          })
        );

        // Add to active games for global timer handling
        await redis.sAdd('active-games', String(guestGameDB.id));
        await redis.incr('guest:games:total');

        await this.startTimer();
      }

      if (type === GameMessages.MOVE) {
        const gameId = await redis.get(`user:${id}:game`);
        if (!gameId) {
          const message = {
            type: ErrorMessages.SERVER_ERROR,
            payload: {
              message:
                'internal server error cannot find game and cannot make move',
            },
          };
          socket.send(JSON.stringify(message));
          return;
        }

        // Check if game exists in Redis, if not restore from DB
        const gameExists = await redis.exists(`guest-game:${gameId}`);
        if (!gameExists) {
          console.log(`Game ${gameId} not found in Redis, restoring from DB`);
          const restored = await this.restoreGuestGameFromDb(gameId, socket);
          if (!restored) return;
        }

        handleGuestGameMove(
          socket,
          { to: payload.to, from: payload.from },
          gameId,
          id,
          this.socketMap
        );
      }

      if (type === GameMessages.LEAVE_GAME) {
        const gameId = await redis.get(`user:${id}:game`);
        if (!gameId) {
          const message = {
            type: ErrorMessages.SERVER_ERROR,
            payload: {
              message:
                'internal server error cannot find game and cannot make move',
            },
          };
          socket.send(JSON.stringify(message));
          return;
        }

        // Check if game exists in Redis, if not restore from DB
        const gameExists = await redis.exists(`guest-game:${gameId}`);
        if (!gameExists) {
          console.log(`Game ${gameId} not found in Redis, restoring from DB`);
          const restored = await this.restoreGuestGameFromDb(gameId, socket);
          if (!restored) return;
        }

        // console.log('Player Left Block');
        playerLeft(id, gameId, socket);
      }

      if (type === GameMessages.RECONNECT) {
        const { id } = payload;
        const gameId = await redis.get(`user:${id}:game`);
        if (!gameId) {
          socket.send(
            JSON.stringify({
              type: GameMessages.GAME_NOT_FOUND,
              payload: {
                message: 'Game Not found',
              },
            })
          );
          return;
        }

        // Check if game exists in Redis, if not restore from DB
        const gameExists = await redis.exists(`guest-game:${gameId}`);
        if (!gameExists) {
          console.log(`Game ${gameId} not found in Redis, restoring from DB`);
          const restored = await this.restoreGuestGameFromDb(gameId, socket);
          if (!restored) return;
        }

        await reconnectPlayer(id, gameId, socket, this.socketMap);
        return;
      }

      if (type === GameMessages.OFFER_DRAW) {
        const gameId = await redis.get(`user:${id}:game`);
        if (!gameId) {
          socket.send(
            JSON.stringify({
              type: GameMessages.GAME_NOT_FOUND,
              payload: {
                message: 'Game Not found',
              },
            })
          );
          return;
        }

        // Check if game exists in Redis, if not restore from DB
        const gameExists = await redis.exists(`guest-game:${gameId}`);
        if (!gameExists) {
          console.log(`Game ${gameId} not found in Redis, restoring from DB`);
          const restored = await this.restoreGuestGameFromDb(gameId, socket);
          if (!restored) return;
        }
        const cooldown = await redis.exists(`draw-offer:${id}`);
        if (cooldown) {
          socket.send(
            JSON.stringify({
              type: GameMessages.DRAW_COOLDOWN,
              payload: {
                message:
                  'Draw offer can only be sent after few minutes! Spamming is not allowed',
              },
            })
          );
          return;
        }
        await offerDraw(id, gameId, socket, this.socketMap);
        return;
      }
      if (type === GameMessages.ACCEPT_DRAW) {
        const gameId = await redis.get(`user:${id}:game`);
        if (!gameId) {
          socket.send(
            JSON.stringify({
              type: GameMessages.GAME_NOT_FOUND,
              payload: {
                message: 'Game Not found',
              },
            })
          );
          return;
        }

        // Check if game exists in Redis, if not restore from DB
        const gameExists = await redis.exists(`guest-game:${gameId}`);
        if (!gameExists) {
          console.log(`Game ${gameId} not found in Redis, restoring from DB`);
          const restored = await this.restoreGuestGameFromDb(gameId, socket);
          if (!restored) return;
        }

        await acceptDraw(gameId, socket, this.socketMap);
        return;
      }

      if (type === GameMessages.REJECT_DRAW) {
        const gameId = await redis.get(`user:${id}:game`);
        if (!gameId) {
          socket.send(
            JSON.stringify({
              type: GameMessages.GAME_NOT_FOUND,
              payload: {
                message: 'Game Not found',
              },
            })
          );
          return;
        }

        // Check if game exists in Redis, if not restore from DB
        const gameExists = await redis.exists(`guest-game:${gameId}`);
        if (!gameExists) {
          console.log(`Game ${gameId} not found in Redis, restoring from DB`);
          const restored = await this.restoreGuestGameFromDb(gameId, socket);
          if (!restored) return;
        }

        await rejectDraw(id, gameId, socket, this.socketMap);
        return;
      }
    });
  }

  async handleDisconnection(playerId: string) {
    // Remove from matchmaking queue if disconnected
    await removePlayerFromQueue(playerId, true);

    const gameId = await redis.get(`user:${playerId}:game`);
    if (!gameId) {
      this.socketMap.delete(playerId);
      return GameMessages.DISCONNECTED;
    }

    const existingGame = await getGameState(gameId);
    if (!existingGame) {
      this.socketMap.delete(playerId);
      return GameMessages.GAME_NOT_FOUND;
    }

    if (existingGame.gameEnded) {
      console.log(`Game ${gameId} already over, ignoring disconnection`);
      this.socketMap.delete(playerId);
      return;
    }

    const connectedUserId =
      existingGame.whitePlayerId === playerId
        ? existingGame.blackPlayerId
        : existingGame.whitePlayerId;

    const connectedUserSocket = this.socketMap.get(connectedUserId);

    // Notify opponent about disconnection
    const disconnectMessage = JSON.stringify({
      type: GameMessages.DISCONNECTED,
      payload: {
        message: 'Opponent left due to bad connectivity',
      },
    });

    await redis.hSet(`guest-game:${gameId}`, {
      status: GameMessages.DISCONNECTED,
      disconnectedBy: playerId,
      timestamp: Date.now()
    });

    connectedUserSocket?.send(disconnectMessage);

    // Add to disconnection queue of sortedsets  with current timestamp
    await redis.zAdd('guest-games:disconnection:queue', {
      value: `${playerId}:${gameId}`,
      score: Date.now(),
    });

    await this.checkDisconnectionQueue();

    this.socketMap.delete(playerId);
  }
}

export const gameManager = new GameManager();