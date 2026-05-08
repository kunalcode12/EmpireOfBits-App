import axios from 'axios';

const apiBaseUrl = 'https://dev.reactive.thevorld.com';
const appId = "app_mgs5crer_51c332b3";

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

const authHeaders = (token?: string) =>
  token ? { Authorization: `Bearer ${token}` } : undefined;

export type CreateSessionRequest = {
  gameConfigId: string;
  streamUrl: string;
  sessionTitle?: string;
};

export const createSession = (data: CreateSessionRequest, token?: string) =>
  api.post('/sessions', data, { headers: authHeaders(token) });

export const getSession = (id: string, token?: string) =>
  api.get(`/sessions/${id}`, { headers: authHeaders(token) });

// NOTE: baseURL already includes `/api/v1`, so the path here must be relative
// (`/sessions/...`) — prepending `/api/v1` again produced `/api/v1/api/v1/...`
// and the patch silently 404'd. Also forwards the real `status` argument
// instead of hardcoding `completed`.
export const updateSessionStatus = (
  sessionId: string,
  status: 'completed' | 'cancelled' | 'aborted',
  token?: string,
) =>
  api.patch(
    `/sessions/${sessionId}/status`,
    { status },
    { headers: authHeaders(token) },
  );

