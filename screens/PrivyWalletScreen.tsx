import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { PrivyUIError, useFundSolanaWallet } from '@privy-io/expo/ui';
import type { SolanaCluster } from '@privy-io/js-sdk-core';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
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
const BG_MID = '#0e0e0e';
const SURFACE_INK = 'rgba(8,8,8,0.92)';
const HAIRLINE = 'rgba(255,255,255,0.06)';
const HAIRLINE_HI = 'rgba(255,255,255,0.12)';
const GOLD = '#FFD700';
const GOLD_DIM = 'rgba(255,215,0,0.65)';
const MUTED = '#a1a1aa';
const MUTED_2 = '#71717a';
const CYAN = '#22d3ee';
const PINK = '#FF006E';
const VIOLET = '#a855f7';
const GREEN = '#4ade80';
const RED = '#ef4444';
const MAG_D = '#c026d3';
const INK = '#f5f5f5';
const CRT_TINT = 'rgba(255,255,255,0.04)';
const VIGNETTE = 'rgba(0,0,0,0.25)';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const RUNE_MAP: Record<string, string> = {
  S: 'ᛊ', O: 'ᛟ', L: 'ᛚ', A: 'ᚨ', N: 'ᚾ',
  W: 'ᚹ', E: 'ᛖ', T: 'ᛏ', V: 'ᚡ', U: 'ᚢ',
  R: 'ᚱ', C: 'ᚲ', ' ': '  ',
};
const WALLET_RUNES = 'SOLANA WALLET VAULT'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');
const RUNE_LINE = `${WALLET_RUNES}   ᛉ   ${WALLET_RUNES}   ✦   ${WALLET_RUNES}   ᚷ   `;
const GLITCH_CHARS = ['ᚦ', 'ᚾ', 'ᛃ', 'ᛇ', 'ᛚ', 'ᛜ', 'ᛞ', '░', '▒', '▓', '█'];
const GLITCH_COLORS = ['#f5f5f5', '#d4d4d4', '#b5b5b5', '#8e8e8e', '#ffffff'];
const ROW_CONFIGS = [
  { baseOpacity: 0.11, size: 19, offset: 0 },
  { baseOpacity: 0.08, size: 16, offset: -28 },
  { baseOpacity: 0.12, size: 21, offset: 12 },
  { baseOpacity: 0.07, size: 15, offset: -12 },
  { baseOpacity: 0.11, size: 19, offset: 22 },
];

function GlitchRuneRow({ cfg, globalGlitch }: { cfg: typeof ROW_CONFIGS[0]; globalGlitch: number }) {
  const opacityAnim = useRef(new Animated.Value(cfg.baseOpacity)).current;
  const colorIndex = useRef(0);
  const [color, setColor] = useState(GLITCH_COLORS[0]);
  const [glitchedLine, setGlitchedLine] = useState(RUNE_LINE);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: cfg.baseOpacity * 2.1,
          duration: 900 + Math.random() * 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: cfg.baseOpacity * 0.5,
          duration: 700 + Math.random() * 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [cfg.baseOpacity, opacityAnim]);

  useEffect(() => {
    if (globalGlitch === 0) return;
    colorIndex.current = (colorIndex.current + 1) % GLITCH_COLORS.length;
    setColor(GLITCH_COLORS[colorIndex.current]);
    const chars = RUNE_LINE.split('');
    const swapCount = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < swapCount; i++) {
      chars[Math.floor(Math.random() * chars.length)] = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
    setGlitchedLine(chars.join(''));
    const t = setTimeout(() => setGlitchedLine(RUNE_LINE), 130 + Math.random() * 170);
    return () => clearTimeout(t);
  }, [globalGlitch]);

  return (
    <View style={[styles.bgRow, { marginLeft: cfg.offset }]}>
      <Animated.Text style={[styles.bgRuneText, { opacity: opacityAnim, fontSize: cfg.size, color }]} numberOfLines={1}>
        {glitchedLine}
      </Animated.Text>
    </View>
  );
}

function RunicBackground() {
  const glitchTick = useRef(0);
  const [globalGlitch, setGlobalGlitch] = useState(0);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timerId = setTimeout(() => {
        if (cancelled) return;
        glitchTick.current += 1;
        setGlobalGlitch(glitchTick.current);
        schedule();
      }, 450 + Math.random() * 1700);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.bgContainer}>
      <View pointerEvents="none" style={styles.bgGradientWash} />
      <View pointerEvents="none" style={styles.bgGlowTop} />
      <View pointerEvents="none" style={styles.bgGlowBottom} />
      <View pointerEvents="none" style={styles.bgVignette} />
      <View pointerEvents="none" style={styles.bgScanOverlay} />
      {ROW_CONFIGS.map((cfg, i) => (
        <GlitchRuneRow key={i} cfg={cfg} globalGlitch={globalGlitch} />
      ))}
    </View>
  );
}

const truncate = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;

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
  const [receivePanelOpen, setReceivePanelOpen] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);
  const [sendStage, setSendStage] = useState<'review' | 'processing' | 'success' | 'error'>('review');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSignature, setSendSignature] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const receiveSlide = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const sendSlide = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const heroPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(heroPulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [heroPulse]);

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
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 1800);
  };

  useEffect(() => {
    Animated.timing(receiveSlide, {
      toValue: receivePanelOpen ? 0 : SCREEN_WIDTH,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [receivePanelOpen, receiveSlide]);

  useEffect(() => {
    Animated.timing(sendSlide, {
      toValue: sendSheetOpen ? 0 : SCREEN_HEIGHT,
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sendSheetOpen, sendSlide]);

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
    setSendStage('processing');
    setSendError(null);
    setSendSignature(null);
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

      setSendSignature(result.signature ?? null);
      setSendStage('success');
      setRecipient('');
      setAmountSol('');
      await refreshBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setSendError(msg);
      setSendStage('error');
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
    void executeSend();
  };

  const setQuickAmount = (frac: number) => {
    if (balanceLamports === null) return;
    const sol = (balanceLamports / LAMPORTS_PER_SOL) * frac;
    if (sol <= 0) return;
    setAmountSol(sol.toFixed(6));
  };

  if (!isReady) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={styles.loadingText}>BOOTING VAULT…</Text>
      </View>
    );
  }

  const statusLabel = solanaWallet.status;
  const isConnected = statusLabel === 'connected';
  const balanceSol =
    balanceLamports === null ? '0.000000' : (balanceLamports / LAMPORTS_PER_SOL).toFixed(6);
  const heroBalanceWhole = balanceSol.split('.')[0];
  const heroBalanceFrac = balanceSol.split('.')[1] ?? '000000';
  const showCreateWallet = !privyAddress && (solanaWallet.status === 'not-created' || solanaWallet.status === 'disconnected');

  const heroGlowOpacity = heroPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const dotPulseOpacity = heroPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={styles.root}>
      <RunicBackground />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 120,
          gap: 14,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* Top header */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarDot}>
                <Ionicons name="game-controller" size={16} color={GOLD} />
              </View>
            </View>
            <View>
              <Text style={styles.greetTag}>EMPIRE • VAULT</Text>
              <Text style={styles.greetName} numberOfLines={1}>
                {displayName ?? email ?? 'Player One'}
              </Text>
            </View>
          </View>
          <View style={styles.netPill}>
            <Animated.View
              style={[
                styles.netDot,
                {
                  backgroundColor: isConnected ? GREEN : RED,
                  opacity: isConnected ? dotPulseOpacity : 1,
                },
              ]}
            />
            <Text style={styles.netPillText}>DEVNET</Text>
          </View>
        </View>

        {/* HERO Balance Card */}
        <View style={styles.heroCard}>
          <Animated.View style={[styles.heroGlowGold, { opacity: heroGlowOpacity }]} />
          <View style={styles.heroGlowViolet} />
          <View style={styles.heroCornerTL} />
          <View style={styles.heroCornerTR} />
          <View style={styles.heroCornerBL} />
          <View style={styles.heroCornerBR} />

          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>TOTAL BALANCE</Text>
            <View style={styles.heroChainChip}>
              <Text style={styles.heroChainGlyph}>◎</Text>
              <Text style={styles.heroChainText}>SOLANA</Text>
            </View>
          </View>

          <View style={styles.heroBalanceRow}>
            <Text style={styles.heroBalanceWhole}>{heroBalanceWhole}</Text>
            <Text style={styles.heroBalanceDot}>.</Text>
            <Text style={styles.heroBalanceFrac}>{heroBalanceFrac}</Text>
            <Text style={styles.heroUnit}>SOL</Text>
          </View>

          <View style={styles.heroSubRow}>
            <View style={styles.heroStatusChip}>
              <View style={[styles.tinyDot, { backgroundColor: isConnected ? GREEN : RED }]} />
              <Text style={[styles.heroStatusText, { color: isConnected ? GREEN : RED }]}>
                {isConnected ? 'CONNECTED' : (statusLabel ?? 'OFFLINE').toString().toUpperCase()}
              </Text>
            </View>
            {balanceLoading ? (
              <View style={styles.heroLoadChip}>
                <ActivityIndicator size="small" color={CYAN} />
                <Text style={styles.heroLoadText}>SYNCING</Text>
              </View>
            ) : null}
          </View>

          {effectiveAddress ? (
            <Pressable style={styles.addressPill} onPress={copyAddress}>
              <View style={styles.addressPillLeft}>
                <View style={styles.addressIcon}>
                  <Text style={styles.addressIconText}>◎</Text>
                </View>
                <Text style={styles.addressPillText}>{truncate(effectiveAddress)}</Text>
              </View>
              <View style={styles.addressPillRight}>
                <Ionicons
                  name={copyDone ? 'checkmark-circle' : 'copy-outline'}
                  size={16}
                  color={copyDone ? GREEN : GOLD}
                />
                <Text style={[styles.addressCopyText, copyDone && { color: GREEN }]}>
                  {copyDone ? 'COPIED' : 'COPY'}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {/* Quick Action Row */}
        <View style={styles.actionsRow}>
          <CircleAction
            icon="arrow-up"
            label="Send"
            tint={GOLD}
            disabled={!isConnected || actionBusy}
            onPress={() => {
              setSendStage('review');
              setSendError(null);
              setSendSignature(null);
              setSendSheetOpen(true);
            }}
          />
          <CircleAction
            icon="arrow-down"
            label="Receive"
            tint={CYAN}
            disabled={!effectiveAddress || actionBusy}
            onPress={() => setReceivePanelOpen(true)}
          />
          <CircleAction
            icon="card-outline"
            label="Fund"
            tint={PINK}
            disabled={!effectiveAddress || actionBusy}
            onPress={onFund}
          />
          <CircleAction
            icon="refresh"
            label={balanceLoading ? '...' : 'Sync'}
            tint={VIOLET}
            disabled={balanceLoading || actionBusy || !effectiveAddress}
            onPress={refreshBalance}
          />
        </View>

        {showCreateWallet ? (
          <Pressable
            style={[styles.ctaCreate, actionBusy && styles.disabled]}
            disabled={actionBusy}
            onPress={onCreateWallet}
          >
            <View style={styles.ctaCreateGlow} />
            <Ionicons name="flash" size={18} color="#0A0A0F" />
            <Text style={styles.ctaCreateText}>
              {actionBusy ? 'SUMMONING…' : 'CREATE EMBEDDED WALLET'}
            </Text>
          </Pressable>
        ) : null}

        {/* Assets section */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>ASSETS</Text>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionCount}>1</Text>
          </View>
          <View style={styles.tokenCard}>
            <View style={styles.tokenIconWrap}>
              <View style={styles.tokenIconGlow} />
              <View style={styles.tokenIcon}>
                <Text style={styles.tokenGlyph}>◎</Text>
              </View>
            </View>
            <View style={styles.tokenMid}>
              <Text style={styles.tokenName}>Solana</Text>
              <View style={styles.tokenSubRow}>
                <Text style={styles.tokenTicker}>SOL</Text>
                <View style={styles.tokenSep} />
                <Text style={styles.tokenNet}>Devnet</Text>
              </View>
            </View>
            <View style={styles.tokenRight}>
              <Text style={styles.tokenBal}>{balanceSol}</Text>
              <Text style={styles.tokenBalSub}>SOL</Text>
            </View>
          </View>
          <View style={styles.tokenLockedCard}>
            <View style={[styles.tokenIcon, styles.tokenIconLocked]}>
              <Ionicons name="lock-closed" size={14} color={MUTED_2} />
            </View>
            <View style={styles.tokenMid}>
              <Text style={styles.tokenLockedName}>SPL Tokens</Text>
              <Text style={styles.tokenLockedSub}>Coming next quest</Text>
            </View>
            <Text style={styles.tokenLockedTag}>SOON</Text>
          </View>
        </View>

        {/* Identity section */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>IDENTITY</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.infoCard}>
            <InfoRow icon="person-outline" label="Player" value={displayName ?? '—'} />
            <View style={styles.divider} />
            <InfoRow icon="mail-outline" label="Email" value={email ?? '—'} mono />
            <View style={styles.divider} />
            <InfoRow icon="shield-checkmark-outline" label="Signer" value="Privy Embedded" highlight />
          </View>
        </View>

        {/* Network section */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>NETWORK INTEL</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.infoCard}>
            <InfoRow icon="git-network-outline" label="Cluster" value="Solana Devnet" highlight />
            <View style={styles.divider} />
            <InfoRow icon="server-outline" label="RPC" value={SOLANA_RPC_URL} mono />
            <View style={styles.divider} />
            <InfoRow
              icon="pulse-outline"
              label="Status"
              value={isConnected ? 'Online · Signed-in' : (statusLabel ?? 'offline')}
              highlight={isConnected}
            />
          </View>
          <Text style={styles.footnote}>
            ⟡ Transfers are signed by your embedded key and broadcast directly to devnet RPC.
          </Text>
        </View>
      </ScrollView>

      {/* Receive Panel */}
      <Animated.View
        style={[
          styles.receivePanel,
          {
            transform: [{ translateX: receiveSlide }],
            pointerEvents: receivePanelOpen ? 'auto' : 'none',
          } as any,
        ]}
      >
        <RunicBackground />
        <View style={[styles.panelHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => setReceivePanelOpen(false)} style={styles.panelBack}>
            <Ionicons name="arrow-back" size={18} color={CYAN} />
            <Text style={styles.panelBackText}>Back</Text>
          </Pressable>
          <Text style={styles.panelTitle}>Receive SOL</Text>
          <View style={styles.panelHeaderRight}>
            <View style={styles.netPill}>
              <View style={[styles.netDot, { backgroundColor: GREEN }]} />
              <Text style={styles.netPillText}>DEVNET</Text>
            </View>
          </View>
        </View>
        {effectiveAddress ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 16 }}
          >
            <View style={styles.receiveHero}>
              <Text style={styles.receiveHeading}>SOL INGRESS PORTAL</Text>
              <Text style={styles.receiveSub}>
                Scan or share the address below. Only send SOL on Solana Devnet.
              </Text>
            </View>

            <View style={styles.qrCard}>
              <View style={styles.qrCornerTL} />
              <View style={styles.qrCornerTR} />
              <View style={styles.qrCornerBL} />
              <View style={styles.qrCornerBR} />
              <View style={styles.qrWrap}>
                <QRCodeStyled
                  data={effectiveAddress}
                  pieceSize={6}
                  padding={16}
                  color="#05050F"
                  style={{ backgroundColor: '#FFFFFF' }}
                />
              </View>
              <View style={styles.qrChainRow}>
                <Text style={styles.qrChainGlyph}>◎</Text>
                <Text style={styles.qrChainText}>SOLANA · DEVNET</Text>
              </View>
            </View>

            <View style={styles.addressFullCard}>
              <Text style={styles.addressFullLabel}>YOUR ADDRESS</Text>
              <Text style={styles.addressFullValue}>{effectiveAddress}</Text>
            </View>

            <Pressable style={styles.receiveCopyBtn} onPress={copyAddress}>
              <MaterialCommunityIcons
                name={copyDone ? 'check-circle-outline' : 'content-copy'}
                size={20}
                color={copyDone ? GREEN : CYAN}
              />
              <Text style={[styles.receiveCopyBtnText, copyDone && { color: GREEN }]}>
                {copyDone ? 'ADDRESS COPIED' : 'COPY ADDRESS'}
              </Text>
            </Pressable>

            <View style={styles.warnCard}>
              <Ionicons name="warning-outline" size={16} color={GOLD} />
              <Text style={styles.warnText}>
                This is a devnet address. Mainnet SOL sent here will be lost.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.receiveBody}>
            <Text style={styles.hint}>No wallet connected.</Text>
          </View>
        )}
      </Animated.View>

      {/* Send Sheet */}
      <Animated.View
        style={[
          styles.sendSheet,
          {
            transform: [{ translateY: sendSlide }],
            pointerEvents: sendSheetOpen ? 'auto' : 'none',
          } as any,
        ]}
      >
        <RunicBackground />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Pressable onPress={() => setSendSheetOpen(false)} style={styles.panelBack}>
              <Ionicons name="close" size={18} color={GOLD} />
              <Text style={styles.panelBackText}>Close</Text>
            </Pressable>
            <Text style={styles.panelTitle}>Send SOL</Text>
            <View style={styles.netPill}>
              <View style={[styles.netDot, { backgroundColor: GREEN }]} />
              <Text style={styles.netPillText}>DEVNET</Text>
            </View>
          </View>
          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={{ gap: 14, paddingBottom: insets.bottom + 22, paddingHorizontal: 18 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sendBalanceCard}>
              <Text style={styles.sendBalanceLabel}>AVAILABLE</Text>
              <View style={styles.sendBalanceRow}>
                <Text style={styles.sendBalanceValue}>{balanceSol}</Text>
                <Text style={styles.sendBalanceUnit}>SOL</Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>RECIPIENT</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-circle-outline" size={18} color={MUTED} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Solana address"
                  placeholderTextColor="#56566b"
                  value={recipient}
                  onChangeText={setRecipient}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {recipient.length > 0 ? (
                  <Pressable onPress={() => setRecipient('')} style={styles.inputClear}>
                    <Ionicons name="close-circle" size={16} color={MUTED} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>AMOUNT</Text>
                <View style={styles.quickAmtRow}>
                  <Pressable style={styles.quickAmt} onPress={() => setQuickAmount(0.25)}>
                    <Text style={styles.quickAmtText}>25%</Text>
                  </Pressable>
                  <Pressable style={styles.quickAmt} onPress={() => setQuickAmount(0.5)}>
                    <Text style={styles.quickAmtText}>50%</Text>
                  </Pressable>
                  <Pressable style={styles.quickAmt} onPress={() => setQuickAmount(1)}>
                    <Text style={[styles.quickAmtText, { color: GOLD }]}>MAX</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.amountWrap}>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#3a3a4a"
                  value={amountSol}
                  onChangeText={setAmountSol}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.amountUnit}>SOL</Text>
              </View>
            </View>

            {sendStage === 'processing' ? (
              <View style={styles.statusCard}>
                <ActivityIndicator size="small" color={CYAN} />
                <Text style={styles.statusText}>Broadcasting transaction…</Text>
              </View>
            ) : null}
            {sendStage === 'success' ? (
              <View style={styles.statusCardSuccess}>
                <View style={styles.statusHead}>
                  <Ionicons name="checkmark-circle" size={18} color={GREEN} />
                  <Text style={styles.statusTextSuccess}>Transfer confirmed.</Text>
                </View>
                {sendSignature ? (
                  <Text style={styles.statusSig}>Sig: {sendSignature}</Text>
                ) : null}
              </View>
            ) : null}
            {sendStage === 'error' && sendError ? (
              <View style={styles.statusCardError}>
                <Ionicons name="alert-circle" size={18} color={RED} />
                <Text style={styles.statusTextError}>{sendError}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, (actionBusy || !isConnected) && styles.disabled]}
              disabled={actionBusy || !isConnected}
              onPress={onSendPress}
            >
              <Ionicons
                name={sendStage === 'success' ? 'reload' : 'flash'}
                size={18}
                color="#0A0A0F"
              />
              <Text style={styles.primaryBtnText}>
                {actionBusy ? 'PROCESSING…' : sendStage === 'success' ? 'SEND AGAIN' : 'CONFIRM & SEND'}
              </Text>
            </Pressable>

            <Text style={styles.footnote}>
              ⟡ Signed locally by your embedded key, broadcast over Solana devnet RPC.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={14} color={MUTED} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.infoValue, mono && styles.mono, highlight && styles.infoHighlight]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function CircleAction({
  icon,
  label,
  tint,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.circleAction, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={[styles.circleBtn, { borderColor: tint, shadowColor: tint }]}>
        <View style={[styles.circleInner, { backgroundColor: `${tint}14` }]}>
          <Ionicons name={icon} size={20} color={tint} />
        </View>
      </View>
      <Text style={styles.circleLabel}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  bgContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 6,
    backgroundColor: BG,
  },
  bgGradientWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG_MID,
  },
  bgGlowTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bgGlowBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bgVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: VIGNETTE,
    opacity: 0.35,
  },
  bgScanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CRT_TINT,
  },
  bgRow: {
    overflow: 'hidden',
  },
  bgRuneText: {
    fontWeight: '300',
    letterSpacing: 5,
    textShadowColor: MAG_D,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: GOLD,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '800',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(255,215,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetTag: {
    color: GOLD_DIM,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  greetName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 1,
    maxWidth: 200,
  },
  netPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
    backgroundColor: 'rgba(18,18,18,0.92)',
  },
  netDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  netPillText: {
    color: '#e5e5f0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },

  // Hero
  heroCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.32)',
    overflow: 'hidden',
    gap: 12,
    shadowColor: GOLD,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroGlowGold: {
    position: 'absolute',
    top: -90,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(255,215,0,0.10)',
  },
  heroGlowViolet: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  heroTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroCornerTL: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: GOLD_DIM,
  },
  heroCornerTR: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: GOLD_DIM,
  },
  heroCornerBL: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: GOLD_DIM,
  },
  heroCornerBR: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: GOLD_DIM,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: GOLD_DIM,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  heroChainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    backgroundColor: 'rgba(168,85,247,0.10)',
  },
  heroChainGlyph: {
    color: VIOLET,
    fontSize: 12,
    fontWeight: '800',
  },
  heroChainText: {
    color: VIOLET,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heroBalanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginTop: 4,
  },
  heroBalanceWhole: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 52,
  },
  heroBalanceDot: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 52,
  },
  heroBalanceFrac: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 4,
  },
  heroUnit: {
    color: GOLD,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginLeft: 8,
    marginBottom: 8,
  },
  heroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
    backgroundColor: SURFACE_INK,
  },
  tinyDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  heroStatusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heroLoadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  heroLoadText: {
    color: CYAN,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  addressPill: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE_INK,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
  },
  addressPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addressIcon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.45)',
  },
  addressIconText: {
    color: VIOLET,
    fontWeight: '900',
    fontSize: 13,
  },
  addressPillText: {
    color: '#EDEDF8',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.4,
  },
  addressPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  addressCopyText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  // Quick actions
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0a0a0a',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
  },
  circleAction: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  circleBtn: {
    width: 50,
    height: 50,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  circleInner: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLabel: {
    color: '#cdcde0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  // Create CTA
  ctaCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  ctaCreateGlow: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    left: -40,
    right: -40,
    backgroundColor: 'rgba(255,215,0,0.18)',
  },
  ctaCreateText: {
    color: '#0A0A0F',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.6,
  },

  // Sections
  section: {
    gap: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  sectionCount: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  // Token card
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
  },
  tokenIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.5)',
  },
  tokenIconLocked: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tokenGlyph: {
    color: VIOLET,
    fontSize: 22,
    fontWeight: '900',
  },
  tokenMid: {
    flex: 1,
    gap: 3,
  },
  tokenName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tokenSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tokenTicker: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  tokenSep: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: MUTED_2,
  },
  tokenNet: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },
  tokenRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  tokenBal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  tokenBalSub: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  tokenLockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(10,10,10,0.6)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderStyle: 'dashed',
  },
  tokenLockedName: {
    color: '#cdcde0',
    fontSize: 14,
    fontWeight: '700',
  },
  tokenLockedSub: {
    color: MUTED_2,
    fontSize: 11,
    fontWeight: '600',
  },
  tokenLockedTag: {
    color: MUTED_2,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
  },

  // Info card
  infoCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 110,
  },
  infoLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  infoValue: {
    flex: 1,
    color: '#EDEDF8',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  infoHighlight: {
    color: GOLD,
  },
  divider: {
    height: 1,
    backgroundColor: HAIRLINE,
    marginHorizontal: 12,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  hint: {
    fontSize: 12,
    color: MUTED,
    lineHeight: 18,
  },
  footnote: {
    color: MUTED_2,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
    marginTop: 2,
  },

  disabled: {
    opacity: 0.42,
  },

  // Receive panel
  receivePanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(6,6,6,0.985)',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  panelHeaderRight: {
    minWidth: 78,
    alignItems: 'flex-end',
  },
  panelBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
  },
  panelBackText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  panelTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  receiveHero: {
    paddingHorizontal: 4,
    gap: 4,
  },
  receiveHeading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  receiveSub: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },
  receiveBody: {
    marginTop: 12,
    gap: 10,
    paddingHorizontal: 18,
  },
  qrCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(34,211,238,0.32)',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    shadowColor: CYAN,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  qrCornerTL: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: CYAN,
  },
  qrCornerTR: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: CYAN,
  },
  qrCornerBL: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: CYAN,
  },
  qrCornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: CYAN,
  },
  qrWrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  qrChainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    backgroundColor: 'rgba(168,85,247,0.10)',
  },
  qrChainGlyph: {
    color: VIOLET,
    fontSize: 14,
    fontWeight: '900',
  },
  qrChainText: {
    color: VIOLET,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  addressFullCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
    gap: 6,
  },
  addressFullLabel: {
    color: GOLD_DIM,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  addressFullValue: {
    color: '#EDEDF8',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  receiveCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(34,211,238,0.45)',
    backgroundColor: 'rgba(34,211,238,0.08)',
    paddingVertical: 14,
  },
  receiveCopyBtnText: {
    color: CYAN,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    backgroundColor: 'rgba(255,215,0,0.05)',
  },
  warnText: {
    flex: 1,
    color: '#e5d680',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },

  // Send sheet
  sendSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '82%',
    backgroundColor: 'rgba(6,6,6,0.985)',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,215,0,0.32)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 8,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  sheetBody: {
    flex: 1,
  },
  sendBalanceCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.28)',
    gap: 4,
  },
  sendBalanceLabel: {
    color: GOLD_DIM,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  sendBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  sendBalanceValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: -0.4,
  },
  sendBalanceUnit: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: GOLD_DIM,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: HAIRLINE_HI,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    color: '#fff',
    fontFamily: 'monospace',
  },
  inputClear: {
    padding: 4,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.35)',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    paddingVertical: 10,
    letterSpacing: -0.4,
  },
  amountUnit: {
    color: GOLD,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  quickAmtRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickAmt: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
    backgroundColor: '#101010',
  },
  quickAmtText: {
    color: '#cdcde0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  statusCard: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(34,211,238,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  statusCardSuccess: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.4)',
    backgroundColor: 'rgba(74,222,128,0.10)',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusCardError: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusText: {
    color: CYAN,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusTextSuccess: {
    color: GREEN,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusSig: {
    color: '#cdcde0',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  statusTextError: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    lineHeight: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: '#0A0A0F',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1.4,
  },
});
