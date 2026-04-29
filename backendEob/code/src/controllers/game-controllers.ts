import express, { Request, Response } from 'express';
// import {v4 as uuidv4} from "uuid"
import { getStats } from '../Services/GameServices';
import { authMiddleware } from '../middleware';
import pc from '../clients/prismaClient';
import { Chess } from 'chess.js';
import { redis } from '../clients/redisClient';
import { ComputerGameMessages } from '../utils/messages';
import {
  getComputerGameState,
  handlePlayerQuit,
} from '../Services/ComputerGameServices';
import { ComputerDifficulty } from '../generated/prisma/enums';
const gameRouter = express.Router();
const ALLOWED_DIFFICULTIES: ComputerDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

gameRouter.get('/stats-total', async (_req: Request, res: Response) => {
  try {
    const statsObj = await getStats();
    // console.log(count);
    res.status(200).json({ success: true, stats: statsObj });
    return;
  } catch (error) {
    res.status(500).json({ message: 'Internal Server error' });
    console.log(error);
    return;
  }
});

gameRouter.post(
  '/computer/create',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      // @ts-ignore
      const userId = req.userId;

      const { difficulty, playerColor } = req.body;

      if (
        !difficulty ||
        !playerColor ||
        !ALLOWED_DIFFICULTIES.includes(difficulty) ||
        (playerColor !== 'w' && playerColor !== 'b')
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid or missing difficulty/playerColor',
        });
        return;
      }
      const gameIdFromRedis = await redis.get(`user:${userId}:computer-game`);
      if (gameIdFromRedis) {
        const gameState = await getComputerGameState(Number(gameIdFromRedis));
        if (gameState) {
          res.status(200).json({
            success: false,
            message: 'There is already an existing computer game!',
            computerGameId: gameIdFromRedis,
          });
          return;
        }
      }

      // Create new game if there is no active game present in redis or postgresSql
      const chess = new Chess();

      const newComputerGame = await pc.computerGame.create({
        data: {
          userId,
          computerDifficulty: difficulty as ComputerDifficulty,
          playerColor: playerColor as 'w' | 'b',
          status: 'ACTIVE',
          currentFen: chess.fen(),
        },
      });

      // Add initial FEN to redis also
      await redis
        .multi()
        .hSet(`computer-game:${newComputerGame.id}`, {
          playerColor: playerColor,
          fen: chess.fen(),
          status: ComputerGameMessages.COMPUTER_GAME_ACTIVE,
          difficulty: difficulty,
          movesCount: '0',
        })
        .setEx(
          `user:${userId}:computer-game`,
          86400,
          newComputerGame.id.toString()
        )
        .exec();

      res.status(201).json({
        success: true,
        message: 'New computer game created',
        computerGameId: newComputerGame.id,
      });
      return;
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

gameRouter.patch(
  '/computer/finish',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      // @ts-ignore
      const userId = req.userId;
      const { computerGameId } = req.body;

      if (!computerGameId) {
        res.status(400).json({
          success: false,
          message: 'computerGameId is required',
        });
        return;
      }

      // Verify that game exists & belongs to user
      const game = await pc.computerGame.findFirst({
        where: { id: computerGameId, userId },
      });

      if (!game) {
        res.status(404).json({
          success: false,
          message: 'Game not found',
        });
        return;
      }

      await handlePlayerQuit(game.id, userId);

      res.status(200).json({
        success: true,
        message: 'Computer game finished',
      });
      return;
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

export { gameRouter };
