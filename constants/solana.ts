import Constants from 'expo-constants';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

/** Default matches app copy (Solana devnet); override via env / expo.extra */
export const SOLANA_RPC_URL =
  process?.env?.EXPO_PUBLIC_SOLANA_RPC_URL ?? extra?.solanaRpcUrl ?? 'https://api.devnet.solana.com';
