import { Ionicons } from '@expo/vector-icons';
import { useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { PrivyUIError, useFundSolanaWallet } from '@privy-io/expo/ui';
import type { SolanaCluster } from '@privy-io/js-sdk-core';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import { SOLANA_RPC_URL } from '../constants/solana';
import {
  getPrivySolanaAddress,
  savePrivySolanaAddress,
} from '../utils/storageHelper';
import { getPrivyDisplayName, getPrivyEmail } from '../utils/privyUser';

const BG = '#05050F';
const SURFACE = '#0E0E1F';
const GOLD = '#FFD700';
const MUTED = '#A0A0C0';

export function PrivyWalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, isReady } = usePrivy();
  const solanaWallet = useEmbeddedSolanaWallet();
  const { fundWallet } = useFundSolanaWallet();

  const cluster = useMemo<SolanaCluster>(
    () => ({ name: 'devnet', rpcUrl: SOLANA_RPC_URL }),
    [],
  );

  const connection = useMemo(() => new Connection(SOLANA_RPC_URL, 'confirmed'), []);

  const [cachedAddress, setCachedAddress] = useState<string | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [amountSol, setAmountSol] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const email = getPrivyEmail(user);
  const displayName = getPrivyDisplayName(user);

  const privyAddress =
    solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
      ? solanaWallet.wallets[0].address
      : null;

  const effectiveAddress = privyAddress ?? cachedAddress;

  const refreshBalance = useCallback(async () => {
    if (!effectiveAddress) {
      setBalanceLamports(null);
      return;
    }
    setBalanceLoading(true);
    try {
      const lamports = await connection.getBalance(new PublicKey(effectiveAddress));
      setBalanceLamports(lamports);
    } catch {
      setBalanceLamports(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [connection, effectiveAddress]);

  useEffect(() => {
    void (async () => {
      const stored = await getPrivySolanaAddress();
      setCachedAddress(stored);
    })();
  }, []);

  useEffect(() => {
    if (privyAddress) void savePrivySolanaAddress(privyAddress);
  }, [privyAddress]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshBalance();
    } finally {
      setRefreshing(false);
    }
  }, [refreshBalance]);

  const copyAddress = async () => {
    if (!effectiveAddress) return;
    await Clipboard.setStringAsync(effectiveAddress);
    Alert.alert('Copied', 'Wallet address copied to clipboard.');
  };

  const onCreateWallet = async () => {
    const createWallet = solanaWallet.create;
    if (!createWallet) {
      Alert.alert('Wallet', 'Wallet creation is not available in this state.');
      return;
    }
    setActionBusy(true);
    try {
      await createWallet();
      Alert.alert('Wallet', 'Embedded Solana wallet created.');
    } catch (e) {
      Alert.alert('Wallet', e instanceof Error ? e.message : 'Could not create wallet.');
    } finally {
      setActionBusy(false);
    }
  };

  const onFund = async () => {
    if (!effectiveAddress) {
      Alert.alert('Wallet', 'No Solana address yet.');
      return;
    }
    setActionBusy(true);
    try {
      await fundWallet({
        address: effectiveAddress,
        cluster,
        asset: 'native-currency',
      });
    } catch (e) {
      if (e instanceof PrivyUIError) {
        Alert.alert('Funding', `${e.code}: ${e.message}`);
      } else {
        Alert.alert('Funding', e instanceof Error ? e.message : 'Funding flow failed.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const executeSend = async () => {
    if (!privyAddress || solanaWallet.status !== 'connected' || !solanaWallet.wallets?.[0]) {
      Alert.alert('Send', 'Connect your embedded wallet first.');
      return;
    }
    const to = recipient.trim();
    const amt = amountSol.trim();
    let toPub: PublicKey;
    try {
      toPub = new PublicKey(to);
    } catch {
      Alert.alert('Send', 'Invalid recipient address.');
      return;
    }
    const sol = parseFloat(amt);
    if (!Number.isFinite(sol) || sol <= 0) {
      Alert.alert('Send', 'Enter a valid SOL amount.');
      return;
    }
    const lamports = Math.round(sol * LAMPORTS_PER_SOL);
    if (lamports <= 0) {
      Alert.alert('Send', 'Amount too small.');
      return;
    }

    setActionBusy(true);
    try {
      const fromPubkey = new PublicKey(privyAddress);
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey,
      }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey: toPub,
          lamports,
        }),
      );

      const provider = await solanaWallet.wallets[0].getProvider();
      const result = await provider.request({
        method: 'signAndSendTransaction',
        params: {
          transaction: tx,
          connection,
        },
      });

      Alert.alert('Transaction sent', `Signature:\n${result.signature}`);
      setRecipient('');
      setAmountSol('');
      await refreshBalance();
    } catch (e) {
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setActionBusy(false);
    }
  };

  const onSendPress = () => {
    const to = recipient.trim();
    const amt = amountSol.trim();
    if (!to || !amt) {
      Alert.alert('Send', 'Enter recipient and amount.');
      return;
    }
    Alert.alert('Confirm send', `Send ${amt} SOL to\n${to.slice(0, 8)}…${to.slice(-6)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', style: 'destructive', onPress: () => void executeSend() },
    ]);
  };

  if (!isReady) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  const statusLabel = solanaWallet.status;
  const balanceSol =
    balanceLamports === null ? '—' : (balanceLamports / LAMPORTS_PER_SOL).toFixed(6);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 18,
        paddingBottom: insets.bottom + 100,
        gap: 14,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
    >
      <Text style={styles.screenTitle}>Wallet</Text>
      <Text style={styles.screenSubtitle}>Privy identity & embedded Solana wallet</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Row label="Name" value={displayName ?? '—'} />
        <Row label="Email" value={email ?? '—'} mono />
        <Row label="Privy user id" value={user?.id ? `${user.id.slice(0, 10)}…` : '—'} mono />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Embedded Solana</Text>
        <Row label="Status" value={statusLabel} highlight />
        {effectiveAddress ? (
          <>
            <Text style={styles.mono}>{effectiveAddress}</Text>
            {!privyAddress && cachedAddress ? (
              <Text style={styles.hint}>Showing last saved address from device storage.</Text>
            ) : null}
            <View style={styles.rowBtns}>
              <MiniBtn icon="copy-outline" label="Copy" onPress={copyAddress} disabled={actionBusy} />
              <MiniBtn
                icon="refresh-outline"
                label={balanceLoading ? '…' : 'Balance'}
                onPress={refreshBalance}
                disabled={balanceLoading || actionBusy}
              />
            </View>
            <Text style={styles.balanceLine}>
              Balance: <Text style={styles.balanceValue}>{balanceSol}</Text> SOL
            </Text>
          </>
        ) : (
          <Text style={styles.hint}>No embedded wallet yet. Create one to receive & send on Solana.</Text>
        )}

        {(solanaWallet.status === 'not-created' || solanaWallet.status === 'disconnected') && (
          <Pressable
            style={[styles.primaryBtn, actionBusy && styles.disabled]}
            disabled={actionBusy}
            onPress={onCreateWallet}
          >
            <Text style={styles.primaryBtnText}>Create embedded wallet</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.secondaryBtn, (!effectiveAddress || actionBusy) && styles.disabled]}
          disabled={!effectiveAddress || actionBusy}
          onPress={onFund}
        >
          <Ionicons name="card-outline" size={18} color={GOLD} />
          <Text style={styles.secondaryBtnText}>Receive funds (on-ramp)</Text>
        </Pressable>
        <Text style={styles.hint}>
          Opens Privy funding (card / exchange). Requires funding enabled for your app in the Privy
          dashboard.
        </Text>
      </View>

      {effectiveAddress ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receive via QR</Text>
          <Text style={styles.hint}>Others scan this to copy your public address (Solana).</Text>
          <View style={styles.qrWrap}>
            <QRCodeStyled
              data={effectiveAddress}
              pieceSize={6}
              padding={16}
              color="#05050F"
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Send SOL</Text>
        <Text style={styles.hint}>Uses Privy embedded signer + devnet RPC ({SOLANA_RPC_URL}).</Text>
        <TextInput
          style={styles.input}
          placeholder="Recipient Solana address"
          placeholderTextColor="#666"
          value={recipient}
          onChangeText={setRecipient}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Amount (SOL)"
          placeholderTextColor="#666"
          value={amountSol}
          onChangeText={setAmountSol}
          keyboardType="decimal-pad"
        />
        <Pressable
          style={[styles.primaryBtn, (actionBusy || statusLabel !== 'connected') && styles.disabled]}
          disabled={actionBusy || statusLabel !== 'connected'}
          onPress={onSendPress}
        >
          <Text style={styles.primaryBtnText}>Review & send</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono, highlight && styles.rowHighlight]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function MiniBtn({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.miniBtn, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Ionicons name={icon} size={16} color={GOLD} />
      <Text style={styles.miniBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  centered: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  screenSubtitle: {
    fontSize: 14,
    color: MUTED,
    marginTop: -8,
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.15)',
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: GOLD,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowLabel: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
    width: 110,
  },
  rowValue: {
    flex: 1,
    color: '#EAEAF5',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  rowHighlight: {
    color: GOLD,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#C8C8E8',
  },
  hint: {
    fontSize: 12,
    color: MUTED,
    lineHeight: 18,
  },
  balanceLine: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  balanceValue: {
    color: GOLD,
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  miniBtnText: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#0A0A0F',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
    marginTop: 4,
  },
  secondaryBtnText: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.45,
  },
  input: {
    backgroundColor: '#080812',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 8,
  },
});
