import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { useEffect } from 'react';

import { savePrivySolanaAddress } from '../utils/storageHelper';

/** Persists the primary embedded Solana address whenever Privy reports a connected wallet. */
export function usePersistPrivySolanaAddress(): void {
  const solana = useEmbeddedSolanaWallet();

  useEffect(() => {
    if (solana.status !== 'connected') return;
    const addr = solana.wallets?.[0]?.address;
    if (addr) void savePrivySolanaAddress(addr);
  }, [solana.status, solana.wallets?.[0]?.address]);
}
