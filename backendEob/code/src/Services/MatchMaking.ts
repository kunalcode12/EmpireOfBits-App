import { redis } from '../clients/redisClient';

export interface MatchmakingPreferences {
  timeControl: '5' | '10';
  colorPreference: 'w' | 'b' | 'r';
  isGuest: boolean;
  /**
   * Optional Elo rating for the player. Only meaningful for authenticated
   * users (isGuest === false). Used to prefer pairing players within
   * RATING_DELTA points of each other.
   */
  rating?: number;
}

interface MatchFound {
  opponentId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  /** Optional rating snapshot of the opponent at match time, when known. */
  opponentRating?: number;
}

const RATING_DELTA = 300;
const RATING_CACHE_TTL_SECONDS = 30 * 60;

const getQueueKey = (timeControl: string, color: string, isGuest: boolean) =>
  `${isGuest ? 'guest' : 'auth'}:matchmaking:queue:${timeControl}:${color}`;

const getRatingCacheKey = (playerId: string) =>
  `auth:matchmaking:rating:${playerId}`;

async function setPlayerRating(playerId: string, rating: number): Promise<void> {
  try {
    await redis.setEx(
      getRatingCacheKey(playerId),
      RATING_CACHE_TTL_SECONDS,
      String(rating),
    );
  } catch (error) {
    console.error('Error caching player rating:', error);
  }
}

async function getCachedRating(playerId: string): Promise<number | null> {
  try {
    const raw = await redis.get(getRatingCacheKey(playerId));
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    console.error('Error reading cached rating:', error);
    return null;
  }
}

async function clearCachedRating(playerId: string): Promise<void> {
  try {
    await redis.del(getRatingCacheKey(playerId));
  } catch (error) {
    console.error('Error clearing cached rating:', error);
  }
}

/**
 * Try to atomically claim a queued opponent within RATING_DELTA of `playerRating`.
 * Iterates candidates from oldest enqueue time to newest so longer-waiting
 * players are preferred. Uses zRem return value to defeat races with
 * concurrent matchers.
 */
async function findRatedOpponent(
  queueKey: string,
  playerId: string,
  playerRating: number,
  delta: number,
): Promise<string | null> {
  try {
    const candidates = await redis.zRange(queueKey, 0, -1);
    for (const candId of candidates) {
      if (candId === playerId) continue;
      const oppRating = await getCachedRating(candId);
      if (oppRating === null) continue;
      if (Math.abs(oppRating - playerRating) <= delta) {
        const removed = await redis.zRem(queueKey, candId);
        if (removed > 0) {
          return candId;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error scanning for rated opponent:', error);
    return null;
  }
}

export async function insertPlayerInQueue(
  playerId: string,
  prefs: MatchmakingPreferences,
) {
  try {
    const key = getQueueKey(
      prefs.timeControl,
      prefs.colorPreference,
      prefs.isGuest,
    );
    const timeStamp = Date.now();

    // Check if player is already in any queue (of the same type)
    const allQueues = [
      getQueueKey('5', 'w', prefs.isGuest),
      getQueueKey('5', 'b', prefs.isGuest),
      getQueueKey('5', 'r', prefs.isGuest),
      getQueueKey('10', 'w', prefs.isGuest),
      getQueueKey('10', 'b', prefs.isGuest),
      getQueueKey('10', 'r', prefs.isGuest),
    ];

    for (const q of allQueues) {
      const score = await redis.zScore(q, playerId);
      if (score !== null) {
        return false;
      }
    }

    await redis.zAdd(key, {
      value: playerId,
      score: timeStamp,
    });

    if (!prefs.isGuest && typeof prefs.rating === 'number') {
      await setPlayerRating(playerId, prefs.rating);
    }

    return true;
  } catch (error) {
    console.error('Error inserting player in queue:', error);
    return false;
  }
}

export async function matchingPlayer(
  playerId: string,
  prefs: MatchmakingPreferences,
): Promise<MatchFound | null> {
  const { timeControl, colorPreference, isGuest } = prefs;

  let queuesToCheck: string[] = [];
  if (colorPreference === 'w') {
    queuesToCheck = [
      getQueueKey(timeControl, 'b', isGuest),
      getQueueKey(timeControl, 'r', isGuest),
    ];
  } else if (colorPreference === 'b') {
    queuesToCheck = [
      getQueueKey(timeControl, 'w', isGuest),
      getQueueKey(timeControl, 'r', isGuest),
    ];
  } else {
    queuesToCheck = [
      getQueueKey(timeControl, 'r', isGuest),
      getQueueKey(timeControl, 'w', isGuest),
      getQueueKey(timeControl, 'b', isGuest),
    ];
  }

  const useRatedMatching = !isGuest && typeof prefs.rating === 'number';

  for (const queueKey of queuesToCheck) {
    let opponentId: string | null = null;

    if (useRatedMatching) {
      opponentId = await findRatedOpponent(
        queueKey,
        playerId,
        prefs.rating as number,
        RATING_DELTA,
      );
    }

    if (!opponentId) {
      // Fallback: existing atomic longest-waiting pop.
      const result = await redis.zPopMin(queueKey);
      if (!result) continue;

      if (result.value === playerId) {
        await redis.zAdd(queueKey, {
          value: result.value,
          score: result.score,
        });
        continue;
      }
      opponentId = result.value;
    }

    const opponentPref = queueKey.split(':').pop();

    let whitePlayerId = '';
    let blackPlayerId = '';

    if (colorPreference === 'w') {
      whitePlayerId = playerId;
      blackPlayerId = opponentId;
    } else if (colorPreference === 'b') {
      whitePlayerId = opponentId;
      blackPlayerId = playerId;
    } else if (opponentPref === 'w') {
      whitePlayerId = opponentId;
      blackPlayerId = playerId;
    } else if (opponentPref === 'b') {
      whitePlayerId = playerId;
      blackPlayerId = opponentId;
    } else {
      if (Math.random() > 0.5) {
        whitePlayerId = playerId;
        blackPlayerId = opponentId;
      } else {
        whitePlayerId = opponentId;
        blackPlayerId = playerId;
      }
    }

    const opponentRating = !isGuest
      ? (await getCachedRating(opponentId)) ?? undefined
      : undefined;

    // Player has been claimed out of the queue: clean up cached rating too.
    if (!isGuest) {
      await clearCachedRating(opponentId);
    }

    console.log(
      `[${isGuest ? 'Guest' : 'Auth'}] Match found! ${whitePlayerId} (W) vs ${blackPlayerId} (B)`,
    );
    return {
      opponentId,
      whitePlayerId,
      blackPlayerId,
      opponentRating,
    };
  }

  return null;
}

export async function removePlayerFromQueue(
  playerId: string,
  isGuest: boolean,
): Promise<boolean> {
  try {
    const allQueues = [
      getQueueKey('5', 'w', isGuest),
      getQueueKey('5', 'b', isGuest),
      getQueueKey('5', 'r', isGuest),
      getQueueKey('10', 'w', isGuest),
      getQueueKey('10', 'b', isGuest),
      getQueueKey('10', 'r', isGuest),
    ];

    let anyRemoved = false;
    for (const q of allQueues) {
      const removed = await redis.zRem(q, playerId);
      if (removed) anyRemoved = true;
    }

    if (!isGuest) {
      await clearCachedRating(playerId);
    }

    return anyRemoved;
  } catch (error) {
    console.error('Error removing player from queue:', error);
    return false;
  }
}

export async function clearQueues() {
  try {
    const types = [true, false];
    for (const isGuest of types) {
      const allQueues = [
        getQueueKey('5', 'w', isGuest),
        getQueueKey('5', 'b', isGuest),
        getQueueKey('5', 'r', isGuest),
        getQueueKey('10', 'w', isGuest),
        getQueueKey('10', 'b', isGuest),
        getQueueKey('10', 'r', isGuest),
      ];
      for (const q of allQueues) {
        await redis.del(q);
      }
    }
    return true;
  } catch (error) {
    console.error('Error clearing queues:', error);
    return false;
  }
}
