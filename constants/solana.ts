import Constants from 'expo-constants';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

// TODO(mainnet): public api.mainnet-beta.solana.com is rate-limited and routinely
// rejects mobile traffic. Set EXPO_PUBLIC_SOLANA_RPC_URL (or expo.extra.solanaRpcUrl)
// to a paid RPC (Helius / Triton / QuickNode / Alchemy) before shipping.
export const SOLANA_RPC_URL =
  process?.env?.EXPO_PUBLIC_SOLANA_RPC_URL ?? extra?.solanaRpcUrl ?? 'https://api.mainnet-beta.solana.com';
