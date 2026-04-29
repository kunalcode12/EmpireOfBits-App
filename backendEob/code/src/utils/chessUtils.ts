//this file will contain the helper function for chess games

import { Chess } from 'chess.js';
import pc from '../clients/prismaClient';
import { redis } from '../clients/redisClient';
import WebSocket from 'ws';
import { InputJsonValue } from '@prisma/client/runtime/client';
export const MOVE_BEFORE_SAFE = 5;
export const GUEST_MATCHMAKING_KEY =
  process.env.GUEST_MATCHING_KEY || 'guest:game:queue';
export default function provideValidMoves(fen: string) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });

  const validMoves = moves.map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion ?? null,
  }));

  return validMoves;
}

export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function sendMessage(socket: WebSocket | undefined, message: string) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log(`⚠️ Opponent socket not available`);
    return;
  }
  socket.send(message);
}
export function sendError(socket: WebSocket, message: JSON) {
  socket.send(JSON.stringify(message));
}
export async function addGuestGamesToUserProfile(
  guestId: string,
  userId: number
) {
  try {
    // Update all games where this guest was player1
    const player1Updates = await pc.guestGames.updateMany({
      where: { player1GuestId: guestId },
      data: { player1UserId: userId },
    });

    // Update all games where this guest was player2
    const player2Updates = await pc.guestGames.updateMany({
      where: { player2GuestId: guestId },
      data: { player2UserId: userId },
    });

    console.log(
      `✅ Linked ${player1Updates.count + player2Updates.count} guest games to user ${userId}`
    );

    return player1Updates.count + player2Updates.count;
  } catch (error) {
    console.error('Error linking guest games to user:', error);
  }
}

export interface MovePayload {
  from: string;
  to: string;
  promotion?: string | null;
}

export interface ChatPayload {
  sender: number;
  message: string;
  timestamp: number;
}

export async function parseChat(redisKey: string): Promise<InputJsonValue[]> {
  const chatRaw = await redis.lRange(redisKey, 0, -1);
  if (!chatRaw || chatRaw.length === 0) return []; // returning empty array if no chat is there
  return chatRaw.map((c: string) => {
    try {
      return JSON.parse(c);
    } catch {
      return { sender: 0, message: String(c), timestamp: Date.now() };
    }
  });
}

export async function parseMoves(redisKey: string): Promise<InputJsonValue[]> {
  const movesRaw = await redis.lRange(redisKey, 0, -1);
  if (!movesRaw || movesRaw.length === 0) return [];
  return movesRaw.map((m: string) => {
    try {
      return JSON.parse(m);
    } catch {
      return { from: '', to: '', promotion: null };
    }
  });
}
