import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { checkAuth, logoutRequest, signIn, signUp, type SignInPayload, type SignUpPayload } from '../api/authApi';
import { clearSessionStorage, getStoredUser, saveStoredUser, type StoredUser } from '../utils/storageHelper';
import { disconnectGameSocket } from '../websockets/gameSocket';

interface AuthState {
  user: StoredUser | null;
  initializing: boolean;
  loading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'BOOT_START' }
  | { type: 'BOOT_DONE'; user: StoredUser | null }
  | { type: 'REQUEST_START' }
  | { type: 'REQUEST_SUCCESS'; user: StoredUser }
  | { type: 'REQUEST_ERROR'; error: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' };

interface AuthContextValue extends AuthState {
  login: (payload: SignInPayload) => Promise<void>;
  register: (payload: SignUpPayload) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const initialState: AuthState = {
  user: null,
  initializing: true,
  loading: false,
  error: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

const reducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'BOOT_START':
      return { ...state, initializing: true };
    case 'BOOT_DONE':
      return { ...state, initializing: false, user: action.user };
    case 'REQUEST_START':
      return { ...state, loading: true, error: null };
    case 'REQUEST_SUCCESS':
      return { ...state, loading: false, user: action.user, error: null };
    case 'REQUEST_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'LOGOUT':
      return { ...state, user: null, loading: false, error: null };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      dispatch({ type: 'BOOT_START' });
      const storedUser = await getStoredUser();
      const valid = storedUser ? await checkAuth() : false;
      if (mounted) dispatch({ type: 'BOOT_DONE', user: valid ? storedUser : null });
      if (!valid) await clearSessionStorage();
    };
    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (payload: SignInPayload) => {
    dispatch({ type: 'REQUEST_START' });
    try {
      const user = await signIn(payload);
      await saveStoredUser(user);
      dispatch({ type: 'REQUEST_SUCCESS', user });
    } catch (error) {
      dispatch({ type: 'REQUEST_ERROR', error: error instanceof Error ? error.message : 'Unable to sign in' });
    }
  }, []);

  const register = useCallback(async (payload: SignUpPayload) => {
    dispatch({ type: 'REQUEST_START' });
    try {
      const user = await signUp(payload);
      await saveStoredUser(user);
      dispatch({ type: 'REQUEST_SUCCESS', user });
    } catch (error) {
      dispatch({ type: 'REQUEST_ERROR', error: error instanceof Error ? error.message : 'Unable to create account' });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Local logout is still valid if the server session is already gone.
    }
    disconnectGameSocket();
    await clearSessionStorage();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  const value = useMemo<AuthContextValue>(() => ({ ...state, login, register, logout, clearError }), [state, login, register, logout, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};
