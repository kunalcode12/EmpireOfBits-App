import axios from 'axios';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
const appId = process.env.EXPO_PUBLIC_VORLD_APP_ID ?? process.env.NEXT_PUBLIC_VORLD_APP_ID;

if (!apiBaseUrl) {
  throw new Error('Missing EXPO_PUBLIC_API_URL in environment');
}

if (!appId) {
  throw new Error('Missing EXPO_PUBLIC_VORLD_APP_ID in environment');
}

const api = axios.create({
  baseURL: `${apiBaseUrl}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
    'x-vorld-app-id': appId,
  },
});

export const setToken = (token: string) => {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
};

export type CreateSessionRequest = {
  gameConfigId: string;
  streamUrl: string;
  sessionTitle?: string;
};

export const createSession = (data: CreateSessionRequest) => api.post('/sessions', data);

export const getSession = (id: string) => api.get(`/sessions/${id}`);

export const updateSessionStatus = (sessionId: string, status: 'completed' | 'cancelled' | 'aborted') => api.patch(`/api/v1/sessions/${sessionId}/status`, {
  status: 'completed',
});

