import { WebSocket } from 'ws';
import pc from '../clients/prismaClient';
import { redis } from '../clients/redisClient';

export const DEFAULT_RATING = 800;
export const MIN_RATING = 100;
export const MAX_RATING = 3000;

export function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return DEFAULT_RATING;
  const rounded = Math.round(rating);
  return Math.max(MIN_RATING, Math.min(MAX_RATING, rounded));
}

export function getKFactor(rating: number): number {
  if (rating < 1000) return 40;
  if (rating < 2000) return 20;
  return 10;
}

function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function calculateElo(
  winnerRating: number,
  loserRating: number,
): { winnerNew: number; loserNew: number } {
  const eW = expectedScore(winnerRating, loserRating);
  const eL = expectedScore(loserRating, winnerRating);
  const kW = getKFactor(winnerRating);
  const kL = getKFactor(loserRating);
  return {
    winnerNew: clampRating(winnerRating + kW * (1 - eW)),
    loserNew: clampRating(loserRating + kL * (0 - eL)),
  };
}

export function calculateEloDraw(
  ratingA: number,
  ratingB: number,
): { newA: number; newB: number } {
  const eA = expectedScore(ratingA, ratingB);
  const eB = expectedScore(ratingB, ratingA);
  const kA = getKFactor(ratingA);
  const kB = getKFactor(ratingB);
  return {
    newA: clampRating(ratingA + kA * (0.5 - eA)),
    newB: clampRating(ratingB + kB * (0.5 - eB)),
  };
}

export type RoomGameResult = 'white_wins' | 'black_wins' | 'draw';

export interface RatingUpdateResult {
  whiteRatingBefore: number;
  blackRatingBefore: number;
  whiteRatingAfter: number;
  blackRatingAfter: number;
}

export const RATING_UPDATE_MESSAGE_TYPE = 'RATING_UPDATE';

/**
 * Apply Elo rating changes for a finished room/random game.
 *
 * - Fetches both users' current ratings.
 * - Computes new ratings via the Elo formulas above.
 * - Persists user + game updates inside a single Prisma transaction.
 * - Emits a personalised RATING_UPDATE WS message to each player.
 *
 * Idempotent: if the game record already has whiteRatingAfter populated,
 * the call is a no-op so accidental double-invocation cannot move ratings twice.
 *
 * Failures are logged and swallowed — they MUST NOT roll back the game outcome.
 */
export async function applyRatingsForRoomGame(params: {
  gameId: number;
  whiteUserId: number;
  blackUserId: number;
  result: RoomGameResult;
  socketManager?: Map<number, WebSocket>;
}): Promise<RatingUpdateResult | null> {
  const { gameId, whiteUserId, blackUserId, result, socketManager } = params;

  if (
    !Number.isFinite(gameId) ||
    !Number.isFinite(whiteUserId) ||
    !Number.isFinite(blackUserId) ||
    whiteUserId <= 0 ||
    blackUserId <= 0 ||
    whiteUserId === blackUserId
  ) {
    console.error('[Elo] Invalid params for applyRatingsForRoomGame', params);
    return null;
  }

  try {
    const existingGame = await pc.game.findUnique({
      where: { id: gameId },
      select: { whiteRatingAfter: true },
    });
    if (existingGame && existingGame.whiteRatingAfter !== null) {
      console.log(`[Elo] Ratings already applied for game ${gameId}, skipping`);
      return null;
    }

    const users = await pc.user.findMany({
      where: { id: { in: [whiteUserId, blackUserId] } },
      select: { id: true, rating: true },
    });
    const whiteRatingBefore = clampRating(
      users.find((u) => u.id === whiteUserId)?.rating ?? DEFAULT_RATING,
    );
    const blackRatingBefore = clampRating(
      users.find((u) => u.id === blackUserId)?.rating ?? DEFAULT_RATING,
    );

    let whiteRatingAfter: number;
    let blackRatingAfter: number;

    if (result === 'draw') {
      const d = calculateEloDraw(whiteRatingBefore, blackRatingBefore);
      whiteRatingAfter = d.newA;
      blackRatingAfter = d.newB;
    } else if (result === 'white_wins') {
      const r = calculateElo(whiteRatingBefore, blackRatingBefore);
      whiteRatingAfter = r.winnerNew;
      blackRatingAfter = r.loserNew;
    } else {
      const r = calculateElo(blackRatingBefore, whiteRatingBefore);
      blackRatingAfter = r.winnerNew;
      whiteRatingAfter = r.loserNew;
    }

    await pc.$transaction([
      pc.user.update({
        where: { id: whiteUserId },
        data: { rating: whiteRatingAfter },
      }),
      pc.user.update({
        where: { id: blackUserId },
        data: { rating: blackRatingAfter },
      }),
      pc.game.update({
        where: { id: gameId },
        data: {
          whiteRatingBefore,
          blackRatingBefore,
          whiteRatingAfter,
          blackRatingAfter,
        },
      }),
    ]);

    try {
      await Promise.all([
        redis.del(`user:${whiteUserId}:profile`),
        redis.del(`user:${blackUserId}:profile`),
      ]);
    } catch (cacheErr) {
      console.error('[Elo] Failed to invalidate profile cache:', cacheErr);
    }

    if (socketManager) {
      const whiteSocket = socketManager.get(whiteUserId);
      const blackSocket = socketManager.get(blackUserId);

      const whiteMessage = JSON.stringify({
        type: RATING_UPDATE_MESSAGE_TYPE,
        payload: {
          yourNewRating: whiteRatingAfter,
          ratingChange: whiteRatingAfter - whiteRatingBefore,
          opponentNewRating: blackRatingAfter,
        },
      });
      const blackMessage = JSON.stringify({
        type: RATING_UPDATE_MESSAGE_TYPE,
        payload: {
          yourNewRating: blackRatingAfter,
          ratingChange: blackRatingAfter - blackRatingBefore,
          opponentNewRating: whiteRatingAfter,
        },
      });

      if (whiteSocket && whiteSocket.readyState === WebSocket.OPEN) {
        try {
          whiteSocket.send(whiteMessage);
        } catch (e) {
          console.error('[Elo] Failed to send RATING_UPDATE to white:', e);
        }
      }
      if (blackSocket && blackSocket.readyState === WebSocket.OPEN) {
        try {
          blackSocket.send(blackMessage);
        } catch (e) {
          console.error('[Elo] Failed to send RATING_UPDATE to black:', e);
        }
      }
    }

    return {
      whiteRatingBefore,
      blackRatingBefore,
      whiteRatingAfter,
      blackRatingAfter,
    };
  } catch (error) {
    console.error('[Elo] applyRatingsForRoomGame failed:', error);
    return null;
  }
}
