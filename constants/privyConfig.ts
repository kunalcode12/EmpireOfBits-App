import Constants from 'expo-constants';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

/** Privy App ID from dashboard — prefer env for local overrides */
export const PRIVY_APP_ID ="cmoph6f8s00qu0cl7l4yh8j0q";

/** Mobile app client ID from Privy Dashboard → Clients */
export const PRIVY_CLIENT_ID ="client-WY6YgvphW2q82ryUdwQYqm3rSbQ9pE6Y3BUpcEzkxVR3f";

export const privyConfigured = Boolean(PRIVY_APP_ID && PRIVY_CLIENT_ID);
