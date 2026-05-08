// Email OTP - Passwordless Authentication
// This is the PRIMARY authentication method for Vorld

import * as SecureStore from 'expo-secure-store';

const VORLD_AUTH_BASE = 'https://auth.thevorld.com';
const VORLD_APP_ID = 'app_mgs5crer_51c332b3';
const DEVICE_ID_KEY = 'vorld.device.id';

let cachedDeviceId: string | null = null;

const generateDeviceId = () =>
  `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    if (await SecureStore.isAvailableAsync()) {
      const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (existing) {
        cachedDeviceId = existing;
        return existing;
      }
      const fresh = generateDeviceId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
      cachedDeviceId = fresh;
      return fresh;
    }
  } catch {
    // fall through to in-memory id
  }
  cachedDeviceId = generateDeviceId();
  return cachedDeviceId;
};

const buildHeaders = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
  const deviceId = await getDeviceId();
  return {
    'Content-Type': 'application/json',
    'x-vorld-app-id': VORLD_APP_ID,
    'x-vorld-device-id': deviceId,
    ...extra,
  };
};

export interface VorldUser {
  id?: string;
  email?: string;
  isNewUser?: boolean;
  [key: string]: unknown;
}

export interface VorldVerifyResult {
  accessToken: string;
  refreshToken: string;
  user: VorldUser;
  isNewUser: boolean;
}

export interface VorldProfile {
  [key: string]: unknown;
}

// Step 1: Request OTP (6-digit code sent to email)
export const requestOtp = async (email: string): Promise<{ success: boolean; message?: string }> => {
  const headers = await buildHeaders();
  const response = await fetch(`${VORLD_AUTH_BASE}/api/v1/auth/send-email-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || 'Failed to send OTP');
  }
  return { success: true, message: data?.data?.message };
};

// Step 2: Verify OTP and get tokens
// If user doesn't exist, they are automatically registered
export const verifyOtp = async (email: string, otp: string): Promise<VorldVerifyResult> => {
  const headers = await buildHeaders();
  const response = await fetch(`${VORLD_AUTH_BASE}/api/v1/auth/verify-email-otp-login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp }),
  });

  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || 'OTP verification failed');
  }

  return {
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
    user: data.data.user,
    isNewUser: data.data.isNewUser,
  };
};

// Step 3: Fetch the authenticated user's profile using the access token
export const getUserProfile = async (accessToken: string): Promise<VorldProfile> => {
  console.log('accessToken', accessToken);
  const headers = await buildHeaders({ Authorization: `Bearer ${accessToken}` });
  const response = await fetch(`${VORLD_AUTH_BASE}/api/v1/user/profile`, {
    method: 'GET',
    headers,
  });
  const data = await response.json();
  console.log('data', data);
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || 'Failed to load profile');
  }
  return (data?.data ?? data) as VorldProfile;
};
