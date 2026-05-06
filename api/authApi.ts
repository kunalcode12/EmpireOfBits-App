import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  getAuthCookie,
  saveAuthCookie,
  type StoredUser,
} from "../utils/storageHelper";

declare const process: { env?: Record<string, string | undefined> };

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload extends SignInPayload {
  name: string;
  chessLevel: "BEGINNER" | "INTERMEDIATE" | "PRO";
}

export interface AuthResponse extends StoredUser {
  success: boolean;
  message?: string;
  isNewUser?: boolean;
  points: number;
}

type HeadersWithCookie = Headers & {
  getSetCookie?: () => string[];
};

const extra = Constants.expoConfig?.extra as
  | Record<string, string | undefined>
  | undefined;

export const API_BASE_URL =
  process.env?.EXPO_PUBLIC_API_BASE_URL ??
  process.env?.API_BASE_URL ??
  extra?.API_BASE_URL ??
  "";

const getExpoHost = (): string | null => {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;

  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  return host || null;
};

const getFallbackBaseUrl = (): string => {
  if (Platform.OS === "web") return "http://localhost:3000";

  // Android emulator cannot reach machine localhost directly.
  if (Platform.OS === "android") return "http://10.0.2.2:3000";

  return "http://localhost:3000";
};

export const RESOLVED_API_BASE_URL =
  API_BASE_URL ||
  (() => {
    const host = getExpoHost();
    return host ? `http://${host}:3000` : getFallbackBaseUrl();
  })();

const cookieFromHeaders = (headers: Headers): string | null => {
  const typed = headers as HeadersWithCookie;
  const setCookies = typed.getSetCookie?.();
  const raw = setCookies?.[0] ?? headers.get("set-cookie");
  if (!raw) return null;
  const tokenPart = raw
    .split(";")
    .find((part) => part.trim().startsWith("token="));
  return tokenPart?.trim() ?? null;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  if (!response.ok) {
    const maybeMessage = body as { message?: string; error?: string };
    throw new Error(
      maybeMessage.message ?? maybeMessage.error ?? "Request failed",
    );
  }
  return body;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const cookie = await getAuthCookie();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (cookie && Platform.OS !== "web") headers.set("Cookie", cookie);
  const response = await fetch(`${RESOLVED_API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const responseCookie = cookieFromHeaders(response.headers);
  if (responseCookie) await saveAuthCookie(responseCookie);
  return parseJson<T>(response);
};

const toStoredUser = (response: AuthResponse): StoredUser => ({
  id: response.id,
  username: response.username,
  email: response.email,
  chessLevel: response.chessLevel,
  isGuest: false,
});

export const signIn = async (payload: SignInPayload): Promise<StoredUser> => {
  console.log("Signing in with payload:", payload);
  const response = await request<AuthResponse>("/api/v1/user/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log("Auth Response:", response);
  return toStoredUser(response);
};

export const signUp = async (payload: SignUpPayload): Promise<StoredUser> => {
  const response = await request<AuthResponse>("/api/v1/user/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return toStoredUser(response);
};

export interface RegisterOrLoginPayload {
  email: string;
  name: string;
  password: string;
}

export interface RegisterOrLoginResult {
  user: StoredUser;
  points: number;
  isNewUser: boolean;
}

export const registerOrLogin = async (
  payload: RegisterOrLoginPayload,
): Promise<RegisterOrLoginResult> => {
  const response = await request<AuthResponse>(
    "/api/v1/user/register-or-login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return {
    user: toStoredUser(response),
    points: response.points,
    isNewUser: Boolean(response.isNewUser),
  };
};

export interface UserPointsResponse {
  success: boolean;
  id: number;
  email: string;
  points: number;
}

export const getUserPoints = async (): Promise<number> => {
  const response = await request<UserPointsResponse>("/api/v1/user/points", {
    method: "GET",
  });
  return response.points;
};

export interface UpdateUserPointsResponse extends UserPointsResponse {
  delta: number;
}

export const updateUserPoints = async (delta: number): Promise<UpdateUserPointsResponse> => {
  return request<UpdateUserPointsResponse>("/api/v1/user/points", {
    method: "POST",
    body: JSON.stringify({ delta }),
  });
};

export interface SellPointsResponse extends UserPointsResponse {
  pointsSpent: number;
  payoutSol: number;
  txSignature: string;
}

export const sellPoints = async (walletAddress: string): Promise<SellPointsResponse> => {
  return request<SellPointsResponse>("/api/v1/user/points/sell", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
};

export interface UserProfileStatsBucket {
  total: number;
  won: number;
  lost: number;
  drawn: number;
}

export interface UserProfileResponse {
  success: boolean;
  isGuest: boolean;
  userProfile: {
    user: {
      id: number;
      name: string;
      email: string;
      chessLevel: "BEGINNER" | "INTERMEDIATE" | "PRO";
      points: number;
    };
    stats: {
      computer: UserProfileStatsBucket;
      room: UserProfileStatsBucket;
      guest: UserProfileStatsBucket;
    };
    totalTimePlayed: string;
    recentGames: Record<string, unknown>;
    allGames: Record<string, unknown>;
    rooms: Record<string, unknown>;
  };
}

export const getUserProfile = async (): Promise<UserProfileResponse["userProfile"]> => {
  const response = await request<UserProfileResponse>("/api/v1/user/profile", {
    method: "GET",
  });
  return response.userProfile;
};

export interface ProfileUpdatePayload {
  name?: string;
  email?: string;
  chessLevel?: "BEGINNER" | "INTERMEDIATE" | "PRO";
  password?: string;
}

export interface ProfileUpdateResponse {
  message: string;
  user: {
    id: number;
    name: string;
    email: string;
    chessLevel: "BEGINNER" | "INTERMEDIATE" | "PRO";
  };
}

export const updateUserProfile = async (
  payload: ProfileUpdatePayload,
): Promise<ProfileUpdateResponse> => {
  return request<ProfileUpdateResponse>("/api/v1/user/profile/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const checkAuth = async (): Promise<boolean> => {
  try {
    const response = await request<{ success: boolean }>(
      "/api/v1/user/checkAuth",
      { method: "POST" },
    );
    return response.success;
  } catch {
    return false;
  }
};

export const logoutRequest = async (): Promise<void> => {
  await request<{ success: boolean }>("/api/v1/user/logout", {
    method: "POST",
  });
};
