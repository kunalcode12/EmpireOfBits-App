import { redis } from '../clients/redisClient';

export interface MatchmakingPreferences {
  timeControl: '5' | '10';
  colorPreference: 'w' | 'b' | 'r';
  isGuest: boolean;
}

interface MatchFound {
  opponentId: string;
  whitePlayerId: string;
  blackPlayerId: string;
}

const getQueueKey = (timeControl: string, color: string, isGuest: boolean) => 
  `${isGuest ? 'guest' : 'auth'}:matchmaking:queue:${timeControl}:${color}`;

export async function insertPlayerInQueue(playerId: string, prefs: MatchmakingPreferences) {
  try {
    const key = getQueueKey(prefs.timeControl, prefs.colorPreference, prefs.isGuest);
    const timeStamp = Date.now();
    
    // Check if player is already in any queue (of the same type)
    const allQueues = [
      getQueueKey('5', 'w', prefs.isGuest), getQueueKey('5', 'b', prefs.isGuest), getQueueKey('5', 'r', prefs.isGuest),
      getQueueKey('10', 'w', prefs.isGuest), getQueueKey('10', 'b', prefs.isGuest), getQueueKey('10', 'r', prefs.isGuest)
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
    
    return true;
  } catch (error) {
    console.error('Error inserting player in queue:', error);
    return false;
  }
}

export async function matchingPlayer(playerId: string, prefs: MatchmakingPreferences): Promise<MatchFound | null> {
  const { timeControl, colorPreference, isGuest } = prefs;
  
  let queuesToCheck: string[] = [];
  if (colorPreference === 'w') {
    queuesToCheck = [getQueueKey(timeControl, 'b', isGuest), getQueueKey(timeControl, 'r', isGuest)];
  } else if (colorPreference === 'b') {
    queuesToCheck = [getQueueKey(timeControl, 'w', isGuest), getQueueKey(timeControl, 'r', isGuest)];
  } else {
    queuesToCheck = [getQueueKey(timeControl, 'r', isGuest), getQueueKey(timeControl, 'w', isGuest), getQueueKey(timeControl, 'b', isGuest)];
  }

  for (const queueKey of queuesToCheck) {
    // Atomic removal of the longest waiting player
    // zPopMin returns { value, score }
    const result = await redis.zPopMin(queueKey);
    
    if (result) {
      const opponentId = result.value;
      if (opponentId === playerId) {
        await redis.zAdd(queueKey, { value: opponentId, score: result.score });
        continue;
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
      
      console.log(`[${isGuest ? 'Guest' : 'Auth'}] Match found! ${whitePlayerId} (W) vs ${blackPlayerId} (B)`);
      return { opponentId, whitePlayerId, blackPlayerId };
    }
  }

  return null;
}

export async function removePlayerFromQueue(playerId: string, isGuest: boolean): Promise<boolean> {
  try {
    const allQueues = [
      getQueueKey('5', 'w', isGuest), getQueueKey('5', 'b', isGuest), getQueueKey('5', 'r', isGuest),
      getQueueKey('10', 'w', isGuest), getQueueKey('10', 'b', isGuest), getQueueKey('10', 'r', isGuest)
    ];
    
    let anyRemoved = false;
    for (const q of allQueues) {
      const removed = await redis.zRem(q, playerId);
      if (removed) anyRemoved = true;
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
        getQueueKey('5', 'w', isGuest), getQueueKey('5', 'b', isGuest), getQueueKey('5', 'r', isGuest),
        getQueueKey('10', 'w', isGuest), getQueueKey('10', 'b', isGuest), getQueueKey('10', 'r', isGuest)
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