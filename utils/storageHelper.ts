import * as SecureStore from 'expo-secure-store';

const AUTH_COOKIE_KEY = 'eob.auth.cookie';
const USER_KEY = 'eob.auth.user';
const ACTIVE_GAME_KEY = 'eob.active.game';
const PRIVY_SOLANA_ADDRESS_KEY = 'eob.privy.solanaAddress';

export interface StoredUser {
  id: number;
  username: string;
  email: string;
  chessLevel: 'BEGINNER' | 'INTERMEDIATE' | 'PRO';
  isGuest: false;
}

const canUseSecureStore = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

export const saveAuthCookie = async (cookie: string): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.setItemAsync(AUTH_COOKIE_KEY, cookie);
};

export const getAuthCookie = async (): Promise<string | null> => {
  if (!(await canUseSecureStore())) return null;
  return SecureStore.getItemAsync(AUTH_COOKIE_KEY);
};

export const clearAuthCookie = async (): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.deleteItemAsync(AUTH_COOKIE_KEY);
};

export const saveStoredUser = async (user: StoredUser): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getStoredUser = async (): Promise<StoredUser | null> => {
  if (!(await canUseSecureStore())) return null;
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredUser;
    return parsed;
  } catch {
    return null;
  }
};

export const clearStoredUser = async (): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.deleteItemAsync(USER_KEY);
};

export const saveActiveGameId = async (gameId: string): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.setItemAsync(ACTIVE_GAME_KEY, gameId);
};

export const getActiveGameId = async (): Promise<string | null> => {
  if (!(await canUseSecureStore())) return null;
  return SecureStore.getItemAsync(ACTIVE_GAME_KEY);
};

export const clearActiveGameId = async (): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.deleteItemAsync(ACTIVE_GAME_KEY);
};

/** Last embedded Solana address synced from Privy (for app features that need it offline). */
export const savePrivySolanaAddress = async (address: string): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.setItemAsync(PRIVY_SOLANA_ADDRESS_KEY, address);
};

export const getPrivySolanaAddress = async (): Promise<string | null> => {
  if (!(await canUseSecureStore())) return null;
  return SecureStore.getItemAsync(PRIVY_SOLANA_ADDRESS_KEY);
};

export const clearPrivySolanaAddress = async (): Promise<void> => {
  if (await canUseSecureStore()) await SecureStore.deleteItemAsync(PRIVY_SOLANA_ADDRESS_KEY);
};

export const clearSessionStorage = async (): Promise<void> => {
  await Promise.all([clearAuthCookie(), clearStoredUser(), clearActiveGameId()]);
};
