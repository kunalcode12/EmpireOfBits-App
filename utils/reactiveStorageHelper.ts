import * as SecureStore from 'expo-secure-store';

const REACTIVE_ACCESS_TOKEN_KEY = 'eob.reactive.accessToken';
const REACTIVE_REFRESH_TOKEN_KEY = 'eob.reactive.refreshToken';
const REACTIVE_USER_KEY = 'eob.reactive.user';
const REACTIVE_PROFILE_KEY = 'eob.reactive.profile';
const REACTIVE_STREAM_URL_KEY = 'eob.reactive.streamUrl';
const REACTIVE_ENABLED_KEY = 'eob.reactive.enabled';
const REACTIVE_SESSION_ID_KEY = 'eob.reactive.sessionId';

export interface ReactiveVorldUser {
  id?: string;
  email?: string;
  isNewUser?: boolean;
  [key: string]: unknown;
}

export interface ReactiveVorldProfile {
  [key: string]: unknown;
}

const canUseSecureStore = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

const setItem = async (key: string, value: string) => {
  if (await canUseSecureStore()) await SecureStore.setItemAsync(key, value);
};

const getItem = async (key: string): Promise<string | null> => {
  if (!(await canUseSecureStore())) return null;
  return SecureStore.getItemAsync(key);
};

const deleteItem = async (key: string) => {
  if (await canUseSecureStore()) await SecureStore.deleteItemAsync(key);
};

export const saveReactiveAccessToken = (token: string) =>
  setItem(REACTIVE_ACCESS_TOKEN_KEY, token);
export const getReactiveAccessToken = () => getItem(REACTIVE_ACCESS_TOKEN_KEY);
export const clearReactiveAccessToken = () => deleteItem(REACTIVE_ACCESS_TOKEN_KEY);

export const saveReactiveRefreshToken = (token: string) =>
  setItem(REACTIVE_REFRESH_TOKEN_KEY, token);
export const getReactiveRefreshToken = () => getItem(REACTIVE_REFRESH_TOKEN_KEY);
export const clearReactiveRefreshToken = () => deleteItem(REACTIVE_REFRESH_TOKEN_KEY);

export const saveReactiveUser = (user: ReactiveVorldUser) =>
  setItem(REACTIVE_USER_KEY, JSON.stringify(user));
export const getReactiveUser = async (): Promise<ReactiveVorldUser | null> => {
  const raw = await getItem(REACTIVE_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReactiveVorldUser;
  } catch {
    return null;
  }
};
export const clearReactiveUser = () => deleteItem(REACTIVE_USER_KEY);

export const saveReactiveProfile = (profile: ReactiveVorldProfile) =>
  setItem(REACTIVE_PROFILE_KEY, JSON.stringify(profile));
export const getReactiveProfile = async (): Promise<ReactiveVorldProfile | null> => {
  const raw = await getItem(REACTIVE_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReactiveVorldProfile;
  } catch {
    return null;
  }
};
export const clearReactiveProfile = () => deleteItem(REACTIVE_PROFILE_KEY);

export const saveReactiveStreamUrl = (url: string) =>
  setItem(REACTIVE_STREAM_URL_KEY, url);
export const getReactiveStreamUrl = () => getItem(REACTIVE_STREAM_URL_KEY);
export const clearReactiveStreamUrl = () => deleteItem(REACTIVE_STREAM_URL_KEY);

export const saveReactiveEnabled = (enabled: boolean) =>
  setItem(REACTIVE_ENABLED_KEY, enabled ? '1' : '0');
export const getReactiveEnabled = async (): Promise<boolean> => {
  const raw = await getItem(REACTIVE_ENABLED_KEY);
  return raw === '1';
};
export const clearReactiveEnabled = () => deleteItem(REACTIVE_ENABLED_KEY);

export const saveReactiveSessionId = (sessionId: string) =>
  setItem(REACTIVE_SESSION_ID_KEY, sessionId);
export const getReactiveSessionId = () => getItem(REACTIVE_SESSION_ID_KEY);
export const clearReactiveSessionId = () => deleteItem(REACTIVE_SESSION_ID_KEY);

export interface ReactiveSessionPayload {
  accessToken: string;
  refreshToken: string;
  user: ReactiveVorldUser;
  profile?: ReactiveVorldProfile | null;
}

export const saveReactiveSession = async (payload: ReactiveSessionPayload) => {
  await saveReactiveAccessToken(payload.accessToken);
  await saveReactiveRefreshToken(payload.refreshToken);
  await saveReactiveUser(payload.user);
  if (payload.profile) await saveReactiveProfile(payload.profile);
};

export interface ReactiveSessionSnapshot {
  accessToken: string | null;
  refreshToken: string | null;
  user: ReactiveVorldUser | null;
  profile: ReactiveVorldProfile | null;
  streamUrl: string | null;
  enabled: boolean;
  sessionId: string | null;
}

export const loadReactiveSnapshot = async (): Promise<ReactiveSessionSnapshot> => {
  const [accessToken, refreshToken, user, profile, streamUrl, enabled, sessionId] = await Promise.all([
    getReactiveAccessToken(),
    getReactiveRefreshToken(),
    getReactiveUser(),
    getReactiveProfile(),
    getReactiveStreamUrl(),
    getReactiveEnabled(),
    getReactiveSessionId(),
  ]);
  return { accessToken, refreshToken, user, profile, streamUrl, enabled, sessionId };
};

/** Clears the auth side of the reactive session (tokens, user, profile, enabled flag) but keeps the stream URL on disk. */
export const clearReactiveSessionKeepStreamUrl = async () => {
  await Promise.all([
    clearReactiveAccessToken(),
    clearReactiveRefreshToken(),
    clearReactiveUser(),
    clearReactiveProfile(),
    clearReactiveEnabled(),
    clearReactiveSessionId(),
  ]);
};

/** Nukes everything reactive-related, including the stream URL. */
export const clearReactiveAll = async () => {
  await Promise.all([
    clearReactiveAccessToken(),
    clearReactiveRefreshToken(),
    clearReactiveUser(),
    clearReactiveProfile(),
    clearReactiveStreamUrl(),
    clearReactiveEnabled(),
    clearReactiveSessionId(),
  ]);
};
