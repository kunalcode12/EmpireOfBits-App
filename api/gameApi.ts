import { RESOLVED_API_BASE_URL } from './authApi';
import { getAuthCookie } from '../utils/storageHelper';

export interface GameStatsResponse {
  success: boolean;
  stats: {
    guestGamesCount?: number;
    roomGamesCount?: number;
    roomsCount?: number;
  };
}

const authenticatedFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const cookie = await getAuthCookie();
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${RESOLVED_API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? 'Game request failed');
  return body;
};

export const fetchGameStats = async (): Promise<GameStatsResponse> =>
  authenticatedFetch<GameStatsResponse>('/api/v1/game/stats-total');

export const resignGame = async (roomGameId: string): Promise<void> => {
  await authenticatedFetch('/api/v1/game/resign', {
    method: 'POST',
    body: JSON.stringify({ roomGameId }),
  });
};

export const offerDrawRest = async (roomGameId: string): Promise<void> => {
  await authenticatedFetch('/api/v1/game/draw/offer', {
    method: 'POST',
    body: JSON.stringify({ roomGameId }),
  });
};
