import {
  useEmbeddedSolanaWallet,
  usePrivy,
} from '@privy-io/expo';
import { PrivyUIError, useSolanaSignMessage } from '@privy-io/expo/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Font from 'expo-font';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getUserPoints,
  getUserProfile,
  sellPoints,
  type ProfileUpdatePayload,
  updateUserProfile,
} from '../api/authApi';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { SOLANA_RPC_URL } from '../constants/solana';
import { ReactiveIdentityPanel } from '../components/ReactiveIdentityPanel';
import { useAuth } from '../store/AuthContext';
import { usePoints } from '../store/PointsContext';
import { getPrivyDisplayName, getPrivyEmail } from '../utils/privyUser';
import {
  clearReactiveSessionKeepStreamUrl,
  loadReactiveSnapshot,
} from '../utils/reactiveStorageHelper';
import * as SecureStore from 'expo-secure-store';

const TREASURY_WALLET = '9bYK9h5Cjb2UXwWgnCi7zYMUYhcJfgkwL5B5KmgoDHEB';
const TRADE_POINTS = 100;
const TRADE_SOL = 0.001;

// ─── Reactive accents ─────────────────────────────────────────────────────────
const PINK = '#FF006E';

// ─── Avatar emojis (cycle on tap) ─────────────────────────────────────────────
const AVATAR_EMOJIS = ['🎮', '🕹️', '♟️', '🏆', '⚔️', '👾', '🎯', '🚀', '⭐', '🔮'];
const AVATAR_INDEX_KEY = 'eob.profile.avatarIndex';

type ProfileTab = 'solana' | 'games' | 'reactive';

// ─── Constants ─────────────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG      = '#050505';
const BG_MID  = '#0e0e0e';
const CYAN    = '#22d3ee';
const AMBER   = '#FFB800';
const MAGENTA = '#e879f9';
const MAG_D   = '#c026d3';
const DIM     = '#94a3b8';
const INK     = '#f5f5f5';
const CRT_TINT  = 'rgba(255,255,255,0.04)';
const VIGNETTE  = 'rgba(0,0,0,0.25)';
const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

// ─── Runic background — "EMPIRE OF BITS USER PROFILE" ────────────────────────
const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ', M: 'ᛗ', P: 'ᛈ', I: 'ᛁ', R: 'ᚱ',
  O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', T: 'ᛏ', S: 'ᛊ',
  A: 'ᚨ', U: 'ᚢ', H: 'ᚺ', L: 'ᛚ', N: 'ᚾ',
  ' ': '  ',
};
const PROFILE_RUNES = 'EMPIRE OF BITS USER PROFILE'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');
const RUNE_LINE = `${PROFILE_RUNES}   ᛉ   ${PROFILE_RUNES}   ✦   ${PROFILE_RUNES}   ᚷ   `;
const GLITCH_CHARS = ['ᚦ', 'ᚾ', 'ᛃ', 'ᛇ', 'ᛚ', 'ᛜ', 'ᛞ', '░', '▒', '▓', '█', '╬', '╫', '║'];
const GLITCH_COLORS = ['#f5f5f5','#d4d4d4','#b5b5b5','#8e8e8e','#c9c9c9','#ababab','#ffffff','#6f6f6f'];
const ROW_CONFIGS = [
  { baseOpacity: 0.11, size: 19, offset: 0 },
  { baseOpacity: 0.07, size: 16, offset: -38 },
  { baseOpacity: 0.13, size: 22, offset: 16 },
  { baseOpacity: 0.08, size: 15, offset: -22 },
  { baseOpacity: 0.12, size: 20, offset: 30 },
  { baseOpacity: 0.07, size: 15, offset: -10 },
  { baseOpacity: 0.10, size: 18, offset: 8 },
  { baseOpacity: 0.08, size: 16, offset: -44 },
  { baseOpacity: 0.12, size: 21, offset: 24 },
  { baseOpacity: 0.07, size: 15, offset: -16 },
  { baseOpacity: 0.11, size: 19, offset: 40 },
  { baseOpacity: 0.08, size: 17, offset: -30 },
  { baseOpacity: 0.13, size: 23, offset: 12 },
];
const GRID_LINE_COUNT = 6;

// ─── GlitchRuneRow ─────────────────────────────────────────────────────────────
function GlitchRuneRow({ cfg, globalGlitch }: { cfg: typeof ROW_CONFIGS[0]; globalGlitch: number }) {
  const opacityAnim = useRef(new Animated.Value(cfg.baseOpacity)).current;
  const colorIndex  = useRef(0);
  const [color, setColor]               = useState(GLITCH_COLORS[0]);
  const [glitchedLine, setGlitchedLine] = useState(RUNE_LINE);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: cfg.baseOpacity * 2.2,
          duration: 800 + Math.random() * 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: cfg.baseOpacity * 0.4,
          duration: 600 + Math.random() * 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (globalGlitch === 0) return;
    colorIndex.current = (colorIndex.current + 1) % GLITCH_COLORS.length;
    setColor(GLITCH_COLORS[colorIndex.current]);
    const chars = RUNE_LINE.split('');
    const swapCount = Math.floor(Math.random() * 6) + 1;
    for (let i = 0; i < swapCount; i++) {
      chars[Math.floor(Math.random() * chars.length)] =
        GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
    setGlitchedLine(chars.join(''));
    const t = setTimeout(() => setGlitchedLine(RUNE_LINE), 120 + Math.random() * 180);
    return () => clearTimeout(t);
  }, [globalGlitch]);

  return (
    <View style={[bgS.row, { marginLeft: cfg.offset }]}>
      <Animated.Text
        style={[bgS.runeText, { opacity: opacityAnim, fontSize: cfg.size, color }]}
        numberOfLines={1}
      >
        {glitchedLine}
      </Animated.Text>
    </View>
  );
}

// ─── RunicBackground ──────────────────────────────────────────────────────────
function RunicBackground() {
  const glitchTick = useRef(0);
  const [globalGlitch, setGlobalGlitch] = useState(0);
  useEffect(() => {
    const schedule = (): ReturnType<typeof setTimeout> => {
      const delay = 400 + Math.random() * 1800;
      return setTimeout(() => {
        glitchTick.current += 1;
        setGlobalGlitch(glitchTick.current);
        schedule();
      }, delay);
    };
    const t = schedule();
    return () => clearTimeout(t);
  }, []);
  return (
    <View pointerEvents="none" style={bgS.container}>
      <View pointerEvents="none" style={bgS.gradientWash} />
      <View pointerEvents="none" style={bgS.glowTop} />
      <View pointerEvents="none" style={bgS.glowBottom} />
      <View pointerEvents="none" style={bgS.vignette} />
      <View pointerEvents="none" style={bgS.scanOverlay} />
      <View pointerEvents="none" style={bgS.gridColWrap}>
        {Array.from({ length: GRID_LINE_COUNT }).map((_, i) => (
          <View key={i} style={bgS.gridVLine} />
        ))}
      </View>
      {ROW_CONFIGS.map((cfg, i) => (
        <GlitchRuneRow key={i} cfg={cfg} globalGlitch={globalGlitch} />
      ))}
    </View>
  );
}

// ─── ProfileRow ────────────────────────────────────────────────────────────────
function ProfileRow({
  label,
  value,
  mono,
  dim,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
  highlight?: string;
}) {
  return (
    <View style={ps.rowWrap}>
      <Text style={ps.rowLabel}>{label}</Text>
      <Text
        style={[
          ps.rowValue,
          mono && ps.rowMono,
          dim && ps.rowDim,
          highlight ? { color: highlight } : undefined,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── SignSlidePanel ────────────────────────────────────────────────────────────
function SignSlidePanel({ visible, onBack }: { visible: boolean; onBack: () => void }) {
  const insets       = useSafeAreaInsets();
  const slideAnim    = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const [busy, setBusy]               = useState(false);
  const [lastSig, setLastSig]         = useState<string | null>(null);
  const [localError, setLocalError]   = useState<string | null>(null);
  const solanaWallet                  = useEmbeddedSolanaWallet();
  const { signMessage: solanaSignUi } = useSolanaSignMessage();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_WIDTH, duration: 250,
          easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const onHeadlessSign = useCallback(async () => {
    setLocalError(null);
    if (solanaWallet.status !== 'connected' || !solanaWallet.wallets?.[0]) {
      setLocalError('Embedded wallet not ready.');
      return;
    }
    setBusy(true);
    try {
      const provider = await solanaWallet.wallets[0].getProvider();
      const result = await provider.request({
        method: 'signMessage',
        params: { message: 'Identity verified — Empire of Bits' },
      });
      const sig = typeof result === 'string' ? result : JSON.stringify(result);
      setLastSig(sig);
      Alert.alert('Signed ✓', 'Message signed with embedded wallet.');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Sign failed.');
    } finally {
      setBusy(false);
    }
  }, [solanaWallet]);

  const onUiSign = useCallback(async () => {
    setLocalError(null);
    setBusy(true);
    try {
      const { signature } = await solanaSignUi({
        message: 'Identity verified — Empire of Bits',
        appearance: {
          title: 'Sign to verify',
          description: 'Empire of Bits — prove wallet control',
          buttonText: 'Sign',
        },
      });
      setLastSig(signature);
      Alert.alert('Signed ✓', signature.slice(0, 24) + '…');
    } catch (e) {
      if (e instanceof PrivyUIError) {
        setLocalError(`${e.code}: ${e.message}`);
      } else {
        setLocalError(e instanceof Error ? e.message : 'Privy UI sign failed.');
      }
    } finally {
      setBusy(false);
    }
  }, [solanaSignUi]);

  const walletReady = solanaWallet.status === 'connected';

  return (
    <Animated.View
      style={[
        spS.panel,
        {
          transform: [{ translateX: slideAnim }],
          opacity: fadeAnim,
          pointerEvents: visible ? 'auto' : 'none',
        } as any,
      ]}
    >
      <RunicBackground />

      <Pressable style={[spS.backBtn, { top: insets.top + 4 }]} onPress={onBack}>
        {({ pressed: p }) => (
          <View style={[spS.backBtnInner, p && { opacity: 0.7 }]}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={CYAN} />
            <Text style={spS.backLabel}>BACK</Text>
          </View>
        )}
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          spS.content,
          { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={spS.headerRow}>
          <View style={spS.headerLine} />
          <MaterialCommunityIcons
            name="shield-key-outline"
            size={28}
            color={AMBER}
            style={{ marginHorizontal: 12 }}
          />
          <View style={spS.headerLine} />
        </View>

        <Text style={spS.title}>SIGN MESSAGE</Text>
        <Text style={spS.subtitle}>Prove wallet ownership{'\n'}cryptographically</Text>

        {localError ? <Text style={spS.error}>{localError}</Text> : null}

        {/* Headless sign */}
        <Pressable disabled={busy || !walletReady} onPress={onHeadlessSign}>
          {({ pressed: p }) => (
            <View
              style={[
                spS.signCard,
                { borderColor: CYAN, shadowColor: CYAN },
                p && spS.cardPressed,
                (!walletReady || busy) && spS.cardDisabled,
              ]}
            >
              <View style={[spS.cardAccentBar, { backgroundColor: CYAN }]} />
              <View style={spS.cardIconWrap}>
                <MaterialCommunityIcons name="lightning-bolt" size={28} color={CYAN} />
              </View>
              <View style={spS.cardBody}>
                <Text style={[spS.cardTitle, { color: CYAN }]}>HEADLESS SIGN</Text>
                <Text style={spS.cardHint}>Direct embedded wallet signing</Text>
                <Text style={spS.cardHint}>No confirmation UI</Text>
              </View>
              {busy
                ? <ActivityIndicator size="small" color={CYAN} style={{ marginRight: 14 }} />
                : <MaterialCommunityIcons name="chevron-right" size={20} color={CYAN} style={{ marginRight: 14, opacity: 0.7 }} />
              }
            </View>
          )}
        </Pressable>

        {/* Privy UI sign */}
        <Pressable disabled={busy} onPress={onUiSign}>
          {({ pressed: p }) => (
            <View
              style={[
                spS.signCard,
                { borderColor: AMBER, shadowColor: AMBER },
                p && spS.cardPressed,
                busy && spS.cardDisabled,
              ]}
            >
              <View style={[spS.cardAccentBar, { backgroundColor: AMBER }]} />
              <View style={spS.cardIconWrap}>
                <MaterialCommunityIcons name="shield-check-outline" size={28} color={AMBER} />
              </View>
              <View style={spS.cardBody}>
                <Text style={[spS.cardTitle, { color: AMBER }]}>PRIVY UI SIGN</Text>
                <Text style={spS.cardHint}>Privy modal confirmation</Text>
                <Text style={spS.cardHint}>With visual approval flow</Text>
              </View>
              {busy
                ? <ActivityIndicator size="small" color={AMBER} style={{ marginRight: 14 }} />
                : <MaterialCommunityIcons name="chevron-right" size={20} color={AMBER} style={{ marginRight: 14, opacity: 0.7 }} />
              }
            </View>
          )}
        </Pressable>

        {lastSig ? (
          <View style={spS.sigResult}>
            <Text style={spS.sigResultLabel}>LAST SIGNATURE</Text>
            <Text style={spS.sigResultText} selectable numberOfLines={4}>{lastSig}</Text>
          </View>
        ) : null}

        <View style={spS.runeAccent}>
          <Text style={spS.runeAccentText}>ᛖ ᛗ ᛈ ᛁ ᚱ ᛖ</Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// ─── ProfileScreen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, isReady, logout } = usePrivy();
  const auth = useAuth();
  const solanaWallet = useEmbeddedSolanaWallet();
  const [signPanelOpen, setSignPanelOpen] = useState(false);
  const [pointsPanelOpen, setPointsPanelOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [historyViewportHeight, setHistoryViewportHeight] = useState(1);
  const [historyContentHeight, setHistoryContentHeight] = useState(1);
  const [historyScrollY, setHistoryScrollY] = useState(0);
  const [profileData, setProfileData] = useState<Awaited<ReturnType<typeof getUserProfile>> | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editChessLevel, setEditChessLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'PRO'>('BEGINNER');
  const [editPassword, setEditPassword] = useState('');
  const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL' | null>(null);
  const [tradeBusy, setTradeBusy] = useState(false);
  const {
    points: ctxPoints,
    applyPointsDelta: ctxApplyPointsDelta,
    setPoints: ctxSetPoints,
  } = usePoints();
  const connectionRef = useRef(new Connection(SOLANA_RPC_URL, 'confirmed'));

  // ─── Tabs + reactive theming + avatar emoji ─────────────────────────────────
  const [activeTab, setActiveTab] = useState<ProfileTab>('solana');
  const [reactiveActive, setReactiveActive] = useState(false);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const tabIndicator = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(tabIndicator, {
      toValue: activeTab === 'solana' ? 0 : activeTab === 'games' ? 1 : 2,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [activeTab, tabIndicator]);

  const refreshReactiveFlag = useCallback(async () => {
    try {
      const snap = await loadReactiveSnapshot();
      setReactiveActive(Boolean(snap.enabled && snap.accessToken && snap.user));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshReactiveFlag();
  }, [refreshReactiveFlag]);

  useEffect(() => {
    void (async () => {
      try {
        if (await SecureStore.isAvailableAsync()) {
          const stored = await SecureStore.getItemAsync(AVATAR_INDEX_KEY);
          if (stored !== null) {
            const parsed = parseInt(stored, 10);
            if (!Number.isNaN(parsed) && parsed >= 0 && parsed < AVATAR_EMOJIS.length) {
              setAvatarIndex(parsed);
            }
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const cycleAvatar = useCallback(async () => {
    Haptics.selectionAsync().catch(() => undefined);
    setAvatarIndex((prev) => {
      const next = (prev + 1) % AVATAR_EMOJIS.length;
      void (async () => {
        try {
          if (await SecureStore.isAvailableAsync()) {
            await SecureStore.setItemAsync(AVATAR_INDEX_KEY, String(next));
          }
        } catch {
          // ignore
        }
      })();
      return next;
    });
  }, []);

  const pointsSlide = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const editSlide = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    Font.loadAsync({ PressStart2P: PRESS_START_2P_URI })
      .catch(() => null)
      .finally(() => setFontsLoaded(true));
  }, []);

  useEffect(() => {
    if (isReady && !user) {
      router.replace('/privy-auth');
    }
  }, [isReady, user]);

  const email = getPrivyEmail(user);
  const displayName = getPrivyDisplayName(user);

  const walletAddress =
    solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
      ? solanaWallet.wallets[0].address
      : null;

  const truncatedAddress = walletAddress
    ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
    : null;

  const gameHistory = useMemo(() => {
    const userId = profileData?.user?.id;
    const roomGames = ((profileData as any)?.allGames?.roomGames ?? []) as Array<any>;

    return roomGames.slice(0, 30).map((game) => {
      const didWin = userId != null && game?.winnerId === userId;
      const didLose = userId != null && game?.loserId === userId;
      const result: 'WON' | 'LOST' | 'DRAW' = game?.draw ? 'DRAW' : didWin ? 'WON' : didLose ? 'LOST' : 'DRAW';
      const opponentName =
        game?.opponentName ??
        (didWin ? game?.loser?.name : game?.winner?.name) ??
        'Unknown Opponent';

      return {
        id: String(game?.id ?? game?.roomId ?? Math.random()),
        opponentName,
        result,
        reason: String(game?.winReason ?? game?.loseReason ?? game?.status ?? '--'),
      };
    });
  }, [profileData]);

  const copyAddress = useCallback(async () => {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }, [walletAddress]);

  const loadProfile = useCallback(async () => {
    if (!auth.user) {
      setProfileData(null);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const [profile, points] = await Promise.all([getUserProfile(), getUserPoints()]);
      setProfileData({
        ...profile,
        user: {
          ...profile.user,
          points,
        },
      });
      setEditName(profile.user.name ?? '');
      setEditEmail(profile.user.email ?? '');
      setEditChessLevel(profile.user.chessLevel ?? 'BEGINNER');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  }, [auth.user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    Animated.timing(pointsSlide, {
      toValue: pointsPanelOpen ? 0 : SCREEN_WIDTH,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pointsPanelOpen, pointsSlide]);

  useEffect(() => {
    Animated.timing(editSlide, {
      toValue: editPanelOpen ? 0 : SCREEN_WIDTH,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [editPanelOpen, editSlide]);

  const refreshPoints = useCallback(async () => {
    if (!auth.user) return;
    setPointsLoading(true);
    try {
      const latestPoints = await getUserPoints();
      setProfileData((prev) => (prev ? { ...prev, user: { ...prev.user, points: latestPoints } } : prev));
      ctxSetPoints(latestPoints);
    } catch (error) {
      Alert.alert('Points', error instanceof Error ? error.message : 'Unable to refresh points');
    } finally {
      setPointsLoading(false);
    }
  }, [auth.user, ctxSetPoints]);

  // Keep the locally-displayed profileData.user.points in sync with the
  // shared PointsContext so changes made elsewhere (e.g. ArcadeCenter chess
  // entry charge, buy/sell on the arcade tab) reflect here too.
  // Track the last value we wrote so we never re-issue the same write.
  const lastSyncedPointsRef = useRef<number | null>(null);
  useEffect(() => {
    if (ctxPoints === null || ctxPoints === undefined) return;
    if (lastSyncedPointsRef.current === ctxPoints) return;
    lastSyncedPointsRef.current = ctxPoints;
    setProfileData((prev) => {
      if (!prev) return prev;
      if (prev.user.points === ctxPoints) return prev;
      return { ...prev, user: { ...prev.user, points: ctxPoints } };
    });
  }, [ctxPoints]);

  const handleBuyPoints = useCallback(async () => {
    if (tradeBusy) return;
    const wallet =
      solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
        ? solanaWallet.wallets[0]
        : null;
    if (!wallet) {
      Alert.alert('Buy points', 'Connect your embedded Privy Solana wallet first.');
      return;
    }
    if (!auth.user) {
      Alert.alert('Buy points', 'Please wait until your chess account is ready.');
      return;
    }
    const wAddress = wallet.address;
    setTradeMode('BUY');
    Alert.alert(
      'Confirm purchase',
      `Send ${TRADE_SOL} SOL for ${TRADE_POINTS} points?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setTradeBusy(true);
            try {
              const fromPubkey = new PublicKey(wAddress);
              const toPubkey = new PublicKey(TREASURY_WALLET);
              const lamports = Math.round(TRADE_SOL * LAMPORTS_PER_SOL);
              const { blockhash } = await connectionRef.current.getLatestBlockhash('confirmed');
              const tx = new Transaction({
                recentBlockhash: blockhash,
                feePayer: fromPubkey,
              }).add(
                SystemProgram.transfer({ fromPubkey, toPubkey, lamports }),
              );
              const provider = await wallet.getProvider();
              const txResult = (await provider.request({
                method: 'signAndSendTransaction',
                params: { transaction: tx, connection: connectionRef.current },
              })) as { signature?: string };

              const updatedPoints = await ctxApplyPointsDelta(TRADE_POINTS);
              setProfileData((prev) =>
                prev ? { ...prev, user: { ...prev.user, points: updatedPoints } } : prev,
              );
              Alert.alert(
                'Buy successful',
                `Sent ${TRADE_SOL} SOL\n+${TRADE_POINTS} points\nBalance: ${updatedPoints}${
                  txResult.signature ? `\nTx: ${txResult.signature.slice(0, 20)}...` : ''
                }`,
              );
            } catch (error) {
              Alert.alert(
                'Buy failed',
                error instanceof Error ? error.message : 'Unable to complete purchase.',
              );
            } finally {
              setTradeBusy(false);
            }
          },
        },
      ],
    );
  }, [auth.user, ctxApplyPointsDelta, solanaWallet, tradeBusy]);

  const handleSellPoints = useCallback(async () => {
    if (tradeBusy) return;
    const wallet =
      solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
        ? solanaWallet.wallets[0]
        : null;
    if (!wallet) {
      Alert.alert('Sell points', 'Connect your embedded Privy Solana wallet first.');
      return;
    }
    if (!auth.user) {
      Alert.alert('Sell points', 'Please wait until your chess account is ready.');
      return;
    }
    const currentPoints = ctxPoints ?? profileData?.user.points ?? 0;
    if (currentPoints < TRADE_POINTS) {
      Alert.alert('Sell points', `You need at least ${TRADE_POINTS} points to sell.`);
      return;
    }
    const wAddress = wallet.address;
    setTradeMode('SELL');
    Alert.alert(
      'Confirm sell',
      `Redeem ${TRADE_POINTS} points for ${TRADE_SOL} SOL?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setTradeBusy(true);
            try {
              const provider = await wallet.getProvider();
              await provider.request({
                method: 'signMessage',
                params: {
                  message: `Sell confirmation: redeem ${TRADE_POINTS} points for ${TRADE_SOL} SOL on devnet`,
                },
              });
              const sellResponse = await sellPoints(wAddress);
              const updatedPoints = sellResponse.points;
              ctxSetPoints(updatedPoints);
              setProfileData((prev) =>
                prev ? { ...prev, user: { ...prev.user, points: updatedPoints } } : prev,
              );
              Alert.alert(
                'Sell successful',
                `${sellResponse.payoutSol} SOL sent from treasury\n-${sellResponse.pointsSpent} points\nBalance: ${updatedPoints}\nTx: ${sellResponse.txSignature.slice(0, 20)}...`,
              );
            } catch (error) {
              Alert.alert(
                'Sell failed',
                error instanceof Error ? error.message : 'Unable to complete sell flow.',
              );
            } finally {
              setTradeBusy(false);
            }
          },
        },
      ],
    );
  }, [auth.user, ctxPoints, ctxApplyPointsDelta, ctxSetPoints, profileData?.user.points, solanaWallet, tradeBusy]);

  const saveProfileChanges = useCallback(async () => {
    if (!auth.user) return;
    const payload: ProfileUpdatePayload = {};
    if (editName.trim()) payload.name = editName.trim();
    if (editEmail.trim()) payload.email = editEmail.trim();
    if (editChessLevel) payload.chessLevel = editChessLevel;
    if (editPassword.trim()) payload.password = editPassword.trim();

    setSavingProfile(true);
    try {
      const response = await updateUserProfile(payload);
      setProfileData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            name: response.user.name,
            email: response.user.email,
            chessLevel: response.user.chessLevel,
          },
        };
      });
      setEditPassword('');
      setEditPanelOpen(false);
      Alert.alert('Profile', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Profile Update Failed', error instanceof Error ? error.message : 'Please try again');
    } finally {
      setSavingProfile(false);
    }
  }, [auth.user, editChessLevel, editEmail, editName, editPassword]);

  const onLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLogoutBusy(true);
          if (reactiveActive) {
            try {
              await clearReactiveSessionKeepStreamUrl();
              setReactiveActive(false);
            } catch (err) {
              console.log('Reactive disable on logout failed:', err);
            }
          }
          try {
            await auth.logout();
          } catch {
            // local flow continues with privy logout
          }
          try {
            await logout();
          } catch {
            // ignore logout errors
          } finally {
            setLogoutBusy(false);
          }
          router.replace('/privy-auth');
        },
      },
    ]);
  }, [auth, logout, reactiveActive]);

  if (!fontsLoaded || !isReady) {
    return (
      <View style={ps.centered}>
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  return (
    <View style={ps.root}>
      <RunicBackground />

      <ScrollView
        style={ps.scroll}
        contentContainerStyle={[
          ps.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PAGE HEADER ─────────────────────────────────── */}
        <View style={ps.pageHeader}>
          <View style={ps.pageHeaderLine} />
          <Text style={ps.pageHeaderTitle}>◈ PROFILE ◈</Text>
          <View style={ps.pageHeaderLine} />
        </View>
        <Text style={ps.pageHeaderRunes}>ᛖ ᛗ ᛈ ᛁ ᚱ ᛖ   ✦   ᛟ ᚠ   ✦   ᛒ ᛁ ᛏ ᛊ</Text>

        {/* ── HERO — AVATAR · NAME · STATUS ────────────────────────────────── */}
        <View
          style={[
            ps.heroRow,
            reactiveActive ? ps.heroRowReactive : null,
          ]}
        >
          <Pressable onPress={() => void cycleAvatar()} style={ps.heroAvatarWrap}>
            {({ pressed: p }) => (
              <View
                style={[
                  ps.heroAvatar,
                  reactiveActive ? ps.heroAvatarReactive : null,
                  p && { opacity: 0.85, transform: [{ scale: 0.96 }] },
                ]}
              >
                <Text style={ps.heroAvatarEmoji}>{AVATAR_EMOJIS[avatarIndex]}</Text>
                <View style={[ps.heroAvatarEditBadge, reactiveActive ? ps.heroAvatarEditBadgeReactive : null]}>
                  <MaterialCommunityIcons
                    name="pencil"
                    size={9}
                    color={reactiveActive ? '#fff' : '#0a0a0a'}
                  />
                </View>
              </View>
            )}
          </Pressable>
          <View style={ps.heroInfo}>
            <Text style={ps.heroEyebrow}>SIGNED IN AS</Text>
            <Text style={ps.heroName} numberOfLines={1}>
              {profileData?.user.name ?? displayName ?? auth.user?.username ?? 'Player'}
            </Text>
            <Text style={ps.heroEmail} numberOfLines={1}>
              {email ?? profileData?.user.email ?? '--'}
            </Text>
            <View style={ps.heroChipRow}>
              <View style={[ps.heroChip, { borderColor: 'rgba(255,184,0,0.45)' }]}>
                <MaterialCommunityIcons name="star-four-points-outline" size={10} color={AMBER} />
                <Text style={[ps.heroChipText, { color: AMBER }]}>
                  {(profileData?.user.chessLevel ?? 'BEGINNER').toUpperCase()}
                </Text>
              </View>
              {reactiveActive ? (
                <View style={[ps.heroChip, { borderColor: 'rgba(255,0,110,0.55)', backgroundColor: 'rgba(255,0,110,0.10)' }]}>
                  <View style={ps.heroChipDot} />
                  <Text style={[ps.heroChipText, { color: PINK }]}>REACTIVE</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── TABS ──────────────────────────────────────────────────────────── */}
        <View style={ps.tabBar}>
          <Animated.View
            pointerEvents="none"
            style={[
              ps.tabIndicator,
              {
                left: tabIndicator.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: ['1%', '34%', '67%'],
                }),
                backgroundColor:
                  activeTab === 'reactive'
                    ? 'rgba(255,0,110,0.18)'
                    : activeTab === 'games'
                      ? 'rgba(255,184,0,0.16)'
                      : 'rgba(34,211,238,0.16)',
                borderColor:
                  activeTab === 'reactive'
                    ? PINK
                    : activeTab === 'games'
                      ? AMBER
                      : CYAN,
              },
            ]}
          />
          <Pressable style={ps.tabBtn} onPress={() => setActiveTab('solana')}>
            <MaterialCommunityIcons
              name="wallet-outline"
              size={14}
              color={activeTab === 'solana' ? CYAN : DIM}
            />
            <Text style={[ps.tabText, activeTab === 'solana' && { color: CYAN }]}>
              SOLANA
            </Text>
          </Pressable>
          <Pressable style={ps.tabBtn} onPress={() => setActiveTab('games')}>
            <MaterialCommunityIcons
              name="chess-king"
              size={14}
              color={activeTab === 'games' ? AMBER : DIM}
            />
            <Text style={[ps.tabText, activeTab === 'games' && { color: AMBER }]}>
              GAME
            </Text>
          </Pressable>
          <Pressable style={ps.tabBtn} onPress={() => setActiveTab('reactive')}>
            <MaterialCommunityIcons
              name="broadcast"
              size={14}
              color={activeTab === 'reactive' ? PINK : DIM}
            />
            <Text style={[ps.tabText, activeTab === 'reactive' && { color: PINK }]}>
              REACTIVE
            </Text>
            {reactiveActive ? <View style={ps.tabLiveDot} /> : null}
          </Pressable>
        </View>

        {/* ── REACTIVE TAB ─────────────────────────────────── */}
        {activeTab === 'reactive' ? (
          <ReactiveIdentityPanel onChange={() => void refreshReactiveFlag()} />
        ) : null}

        {/* ── SOLANA TAB CONTENT ───────────────────────────── */}
        {activeTab === 'solana' ? (
          <>
            <View style={ps.profileShell}>
              <View style={ps.profileTopRow}>
                <View style={ps.profileSquareAvatar}>
                  <Text style={ps.profileSquareAvatarText}>{AVATAR_EMOJIS[avatarIndex]}</Text>
                </View>
                <View style={ps.profileTopInfo}>
                  <Text style={ps.profileMainName} numberOfLines={1}>
                    {profileData?.user.name ?? displayName ?? auth.user?.username ?? 'Player'}
                  </Text>
                  <Text style={ps.profileSubName} numberOfLines={1}>
                    {email ?? profileData?.user.email ?? '--'}
                  </Text>
                  <Text style={ps.profileJoined}>Wallet: {truncatedAddress ?? 'Not connected'}</Text>
                </View>
              </View>
            </View>

            <View style={ps.solanaActionRow}>
              <Pressable style={ps.solanaActionBtn} onPress={copyAddress}>
                <MaterialCommunityIcons name={copyDone ? 'check-circle' : 'content-copy'} size={16} color={CYAN} />
                <Text style={ps.solanaActionText}>{copyDone ? 'COPIED' : 'COPY'}</Text>
              </Pressable>
              <Pressable
                style={ps.solanaActionBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSignPanelOpen(true);
                }}
              >
                <MaterialCommunityIcons name="shield-key-outline" size={16} color={AMBER} />
                <Text style={ps.solanaActionText}>SIGN</Text>
              </Pressable>
              <Pressable style={ps.solanaActionBtn} onPress={() => setPointsPanelOpen(true)}>
                <MaterialCommunityIcons name="wallet-plus-outline" size={16} color={PINK} />
                <Text style={ps.solanaActionText}>POINTS</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* ── GAME TAB CONTENT ─────────────────────────────── */}
        {activeTab === 'games' ? (
          <>
            <View style={ps.gameStatsHeader}>
              <Text style={ps.gameStatsTitle}>Stats</Text>
            </View>
            <View style={ps.ratingBox}>
              <Text style={ps.ratingBoxValue}>{profileData?.user.rating ?? '--'}</Text>
              <Text style={ps.ratingBoxLabel}>Rating</Text>
            </View>

            <View style={ps.historyHeader}>
              <Text style={ps.historyTitle}>Game History</Text>
              <Text style={ps.historyCount}>{gameHistory.length}</Text>
            </View>

            <View style={ps.historyList}>
              {profileLoading ? (
                <ActivityIndicator size="small" color={AMBER} />
              ) : gameHistory.length === 0 ? (
                <Text style={ps.historyEmpty}>No game history found.</Text>
              ) : (
                <>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    persistentScrollbar
                    indicatorStyle="white"
                    style={ps.historyScroll}
                    onLayout={(event) => setHistoryViewportHeight(event.nativeEvent.layout.height)}
                    onContentSizeChange={(_, height) => setHistoryContentHeight(height)}
                    onScroll={(event) => setHistoryScrollY(event.nativeEvent.contentOffset.y)}
                    scrollEventThrottle={16}
                  >
                  {gameHistory.map((entry) => (
                    <View key={entry.id} style={ps.historyItem}>
                      <View style={ps.historyItemLeft}>
                        <MaterialCommunityIcons
                          name={entry.result === 'WON' ? 'trophy-outline' : entry.result === 'LOST' ? 'close-octagon-outline' : 'minus-circle-outline'}
                          size={16}
                          color={entry.result === 'WON' ? '#22c55e' : entry.result === 'LOST' ? '#ef4444' : AMBER}
                        />
                        <Text style={ps.historyOpponent} numberOfLines={1}>{entry.opponentName}</Text>
                      </View>
                      <Text style={[ps.historyResult, entry.result === 'WON' ? ps.resultWin : entry.result === 'LOST' ? ps.resultLoss : ps.resultDraw]}>
                        {entry.result}
                      </Text>
                    </View>
                  ))}
                  </ScrollView>
                  <View pointerEvents="none" style={ps.historyRailArcade}>
                    <View
                      style={[
                        ps.historyThumbArcade,
                        {
                          height: Math.max(
                            32,
                            (historyViewportHeight / Math.max(historyContentHeight, 1)) *
                              (historyViewportHeight - 8),
                          ),
                          transform: [
                            {
                              translateY:
                                ((historyViewportHeight -
                                  Math.max(
                                    32,
                                    (historyViewportHeight / Math.max(historyContentHeight, 1)) *
                                      (historyViewportHeight - 8),
                                  ) -
                                  8) *
                                  historyScrollY) /
                                Math.max(historyContentHeight - historyViewportHeight, 1),
                            },
                          ],
                        },
                      ]}
                    />
                  </View>
                </>
              )}
            </View>
          </>
        ) : null}

        {/* ── LOGOUT BUTTON ────────────────────────────────── */}
        <View style={ps.logoutBtnWrap}>
          <Pressable onPress={onLogout} disabled={logoutBusy}>
            {({ pressed: p }) => (
              <View style={[ps.logoutBtn, p && ps.btnPressed]}>
                {logoutBusy ? (
                  <ActivityIndicator size="small" color={MAGENTA} />
                ) : (
                  <MaterialCommunityIcons name="logout-variant" size={22} color={MAGENTA} />
                )}
                <Text style={ps.logoutBtnText}>{logoutBusy ? 'LOGGING OUT...' : 'LOG OUT'}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <View style={ps.footer}>
          <Text style={ps.footerRunes}>ᛖ ᛗ ᛈ ᛁ ᚱ ᛖ  ✦  ᛟ ᚠ  ✦  ᛒ ᛁ ᛏ ᛊ</Text>
        </View>
      </ScrollView>

      <SignSlidePanel visible={signPanelOpen} onBack={() => setSignPanelOpen(false)} />

      <Animated.View
        style={[
          ps.sidePanel,
          {
            transform: [{ translateX: pointsSlide }],
            pointerEvents: pointsPanelOpen ? 'auto' : 'none',
          } as any,
        ]}
      >
        <RunicBackground />
        <View style={[ps.sideHeader, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => setPointsPanelOpen(false)} style={ps.sideBackBtn}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={CYAN} />
            <Text style={ps.sideBackText}>BACK</Text>
          </Pressable>
          <Text style={ps.sideTitle}>POINTS</Text>
        </View>
        <View style={ps.sideBody}>
          <Text style={ps.sidePoints}>{profileData?.user.points ?? '--'}</Text>
          <Text style={ps.sideHint}>Current account points</Text>
          <Pressable style={ps.sideActionBtn} onPress={() => void refreshPoints()} disabled={pointsLoading || tradeBusy}>
            <MaterialCommunityIcons name="refresh" size={18} color={CYAN} />
            <Text style={ps.sideActionText}>{pointsLoading ? 'Refreshing...' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={ps.sideActionBtn} onPress={() => void handleBuyPoints()} disabled={tradeBusy}>
            <MaterialCommunityIcons name="cart-outline" size={18} color={AMBER} />
            <Text style={ps.sideActionText}>{tradeBusy && tradeMode === 'BUY' ? 'Buying...' : 'Buy'}</Text>
          </Pressable>
          <Pressable style={ps.sideActionBtn} onPress={() => void handleSellPoints()} disabled={tradeBusy}>
            <MaterialCommunityIcons name="cash-minus" size={18} color={MAGENTA} />
            <Text style={ps.sideActionText}>{tradeBusy && tradeMode === 'SELL' ? 'Selling...' : 'Sell'}</Text>
          </Pressable>
          {tradeMode ? (
            <Text style={ps.sideHint}>
              {tradeBusy
                ? `Processing ${tradeMode}…`
                : `${TRADE_SOL} SOL ↔ ${TRADE_POINTS} points · last action: ${tradeMode}`}
            </Text>
          ) : null}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          ps.sidePanel,
          {
            transform: [{ translateX: editSlide }],
            pointerEvents: editPanelOpen ? 'auto' : 'none',
          } as any,
        ]}
      >
        <RunicBackground />
        <View style={[ps.sideHeader, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => setEditPanelOpen(false)} style={ps.sideBackBtn}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={AMBER} />
            <Text style={[ps.sideBackText, { color: AMBER }]}>BACK</Text>
          </Pressable>
          <Text style={ps.sideTitle}>UPDATE PROFILE</Text>
        </View>
        <ScrollView style={ps.sideScroll} contentContainerStyle={ps.sideForm} showsVerticalScrollIndicator={false}>
          <Text style={ps.inputLabel}>Name</Text>
          <TextInput value={editName} onChangeText={setEditName} style={ps.input} placeholder="Name" placeholderTextColor="#64748b" />

          <Text style={ps.inputLabel}>Email</Text>
          <TextInput value={editEmail} onChangeText={setEditEmail} style={ps.input} placeholder="Email" placeholderTextColor="#64748b" autoCapitalize="none" keyboardType="email-address" />

          <Text style={ps.inputLabel}>Chess Level</Text>
          <View style={ps.levelRow}>
            {(['BEGINNER', 'INTERMEDIATE', 'PRO'] as const).map((level) => (
              <Pressable key={level} onPress={() => setEditChessLevel(level)} style={[ps.levelChip, editChessLevel === level && ps.levelChipActive]}>
                <Text style={[ps.levelChipText, editChessLevel === level && ps.levelChipTextActive]}>{level}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={ps.inputLabel}>Password (optional)</Text>
          <TextInput value={editPassword} onChangeText={setEditPassword} style={ps.input} placeholder="New password" placeholderTextColor="#64748b" secureTextEntry />

          <Pressable style={ps.saveBtn} onPress={() => void saveProfileChanges()} disabled={savingProfile}>
            {savingProfile ? (
              <ActivityIndicator size="small" color={AMBER} />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={18} color={AMBER} />
                <Text style={ps.saveBtnText}>Save Profile</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Background Styles ─────────────────────────────────────────────────────────
const bgS = StyleSheet.create({
  container: {
    ...FILL,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 6,
    backgroundColor: BG,
  },
  gradientWash: { ...FILL, backgroundColor: BG_MID },
  glowTop: {
    position: 'absolute', left: 0, right: 0, top: 0,
    height: '40%', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glowBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: '45%', backgroundColor: 'rgba(255,255,255,0.06)',
  },
  vignette:   { ...FILL, backgroundColor: VIGNETTE, opacity: 0.35 },
  scanOverlay: { ...FILL, backgroundColor: CRT_TINT },
  gridColWrap: {
    ...FILL, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20,
  },
  gridVLine: {
    width: StyleSheet.hairlineWidth * 2,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  row: { overflow: 'hidden' },
  runeText: {
    fontWeight: '300',
    letterSpacing: 5,
    textShadowColor: MAG_D,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
});

// ─── Sign Panel Styles ─────────────────────────────────────────────────────────
const spS = StyleSheet.create({
  panel: {
    ...FILL,
    backgroundColor: BG,
    zIndex: 100,
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: CYAN,
    letterSpacing: 2,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 24,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    fontFamily: 'PressStart2P',
    fontSize: 18,
    color: INK,
    letterSpacing: 3,
    textAlign: 'center',
    textShadowColor: AMBER,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: DIM,
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#fb7185',
    textAlign: 'center',
  },
  signCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,8,12,0.92)',
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    minHeight: 90,
  },
  cardAccentBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  cardIconWrap: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    paddingVertical: 18,
    gap: 4,
  },
  cardTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  cardHint: {
    fontSize: 11,
    color: DIM,
    lineHeight: 17,
  },
  cardPressed:  { opacity: 0.85, transform: [{ scale: 0.99 }] },
  cardDisabled: { opacity: 0.45 },
  sigResult: {
    backgroundColor: 'rgba(8,8,12,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  sigResultLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: DIM,
    letterSpacing: 3,
  },
  sigResultText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: '#71717a',
    lineHeight: 16,
  },
  runeAccent:     { alignItems: 'center', paddingTop: 8 },
  runeAccentText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: 'rgba(212,212,212,0.3)',
    letterSpacing: 8,
  },
});

// ─── Profile Screen Styles ─────────────────────────────────────────────────────
const ps = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  centered: {
    flex: 1, backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 22,
    gap: 16,
  },
  // Page header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  pageHeaderLine: {
    flex: 1, height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pageHeaderTitle: {
    fontFamily: 'PressStart2P',
    fontSize: 13,
    color: INK,
    letterSpacing: 3,
    marginHorizontal: 16,
    textShadowColor: 'rgba(255,255,255,0.2)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  pageHeaderRunes: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: 'rgba(212,212,212,0.22)',
    textAlign: 'center',
    letterSpacing: 3,
    marginTop: -2,
    marginBottom: 6,
  },
  // Rank card
  rankCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8,8,12,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.25)',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: AMBER,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  rankAccentBar: { width: 5, alignSelf: 'stretch' },
  rankCardInner: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 4,
  },
  rankLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: DIM,
    letterSpacing: 5,
  },
  rankTitle: {
    fontFamily: 'PressStart2P',
    fontSize: 30,
    color: AMBER,
    letterSpacing: 5,
    textShadowColor: 'rgba(255,184,0,0.55)',
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 0 },
    marginTop: 4,
  },
  rankLevel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 4,
    marginTop: 2,
  },
  // Generic card
  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8,8,12,0.88)',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  cardLeftBar: { width: 4, alignSelf: 'stretch' },
  cardInner: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
  },
  // Profile rows
  rowWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: DIM,
    letterSpacing: 1.5,
    minWidth: 54,
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    color: INK,
    fontWeight: '600',
    textAlign: 'right',
  },
  rowMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  rowDim: { color: '#71717a', fontSize: 11 },
  errorText: {
    fontSize: 12,
    color: '#fb7185',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // Copy button
  copyBtnWrap: { alignSelf: 'flex-end', marginTop: 2 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,184,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.35)',
    borderRadius: 8,
  },
  copyBtnText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: AMBER,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  noWallet: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: DIM,
  },
  // Sign button
  signBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(34,211,238,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(34,211,238,0.5)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: CYAN,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  signBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  signBtnTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: CYAN,
    fontWeight: '800',
    letterSpacing: 2,
  },
  signBtnSub: { fontSize: 11, color: DIM, marginTop: 2 },
  // Logout button
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(232,121,249,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(232,121,249,0.4)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: MAG_D,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  logoutBtnText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: MAGENTA,
    fontWeight: '800',
    letterSpacing: 2,
  },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  // Footer
  footer: { alignItems: 'center', paddingTop: 12 },
  footerRunes: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: 'rgba(212,212,212,0.18)',
    letterSpacing: 4,
  },
  sidePanel: {
    ...FILL,
    zIndex: 90,
    backgroundColor: BG,
  },
  sideHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(8,8,12,0.8)',
  },
  sideBackText: {
    color: CYAN,
    fontSize: 12,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
  },
  sideTitle: {
    color: INK,
    fontFamily: 'PressStart2P',
    fontSize: 12,
    letterSpacing: 2,
  },
  sideBody: {
    marginTop: 20,
    marginHorizontal: 20,
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(8,8,12,0.88)',
  },
  sidePoints: {
    fontFamily: 'PressStart2P',
    color: AMBER,
    fontSize: 28,
    textAlign: 'center',
  },
  sideHint: {
    color: DIM,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sideActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 12,
  },
  sideActionText: {
    color: INK,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sideScroll: {
    flex: 1,
  },
  sideForm: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 10,
  },
  inputLabel: {
    color: DIM,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 8,
  },
  input: {
    color: INK,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(8,8,12,0.88)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  levelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  levelChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  levelChipActive: {
    borderColor: AMBER,
    backgroundColor: 'rgba(255,184,0,0.12)',
  },
  levelChipText: {
    color: DIM,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  levelChipTextActive: {
    color: AMBER,
  },
  saveBtn: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,184,0,0.4)',
    backgroundColor: 'rgba(255,184,0,0.1)',
    borderRadius: 10,
    paddingVertical: 14,
  },
  saveBtnText: {
    color: AMBER,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // ─── Hero header ──────────────────────────────────────────
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(8,8,12,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  heroRowReactive: {
    borderColor: 'rgba(255,0,110,0.45)',
    shadowColor: PINK,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    backgroundColor: 'rgba(20,8,16,0.94)',
  },
  heroAvatarWrap: {
    // touch target
  },
  heroAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 2,
    borderColor: CYAN,
    shadowColor: CYAN,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    position: 'relative',
  },
  heroAvatarReactive: {
    backgroundColor: 'rgba(255,0,110,0.10)',
    borderColor: PINK,
    shadowColor: PINK,
  },
  heroAvatarEmoji: {
    fontSize: 34,
  },
  heroAvatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CYAN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BG,
  },
  heroAvatarEditBadgeReactive: {
    backgroundColor: PINK,
  },
  heroInfo: {
    flex: 1,
    gap: 2,
  },
  heroEyebrow: {
    color: DIM,
    fontSize: 9,
    letterSpacing: 1.6,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  heroName: {
    color: INK,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  heroEmail: {
    color: DIM,
    fontSize: 11,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  heroChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(255,184,0,0.08)',
  },
  heroChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: PINK,
  },
  heroChipText: {
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // ─── Tab bar ──────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(8,8,12,0.92)',
    padding: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '32%',
    borderRadius: 2,
    borderWidth: 1.5,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 2,
  },
  tabText: {
    color: DIM,
    fontSize: 11,
    letterSpacing: 1.3,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tabLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PINK,
    marginLeft: 2,
    shadowColor: PINK,
    shadowOpacity: 0.95,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  profileShell: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(8,8,12,0.92)',
    borderRadius: 2,
    padding: 12,
    marginTop: 12,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileSquareAvatar: {
    width: 70,
    height: 70,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSquareAvatarText: {
    fontSize: 32,
  },
  profileTopInfo: {
    flex: 1,
    gap: 3,
  },
  profileMainName: {
    color: INK,
    fontSize: 28,
    fontWeight: '900',
  },
  profileSubName: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '600',
  },
  profileJoined: {
    color: DIM,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  solanaActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  solanaActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(9,9,9,0.95)',
    borderRadius: 2,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  solanaActionText: {
    color: INK,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  gameStatsHeader: {
    marginTop: 14,
    marginBottom: 8,
  },
  gameStatsTitle: {
    color: INK,
    fontSize: 32,
    fontWeight: '900',
  },
  ratingBox: {
    width: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(8,8,8,0.95)',
    borderRadius: 2,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  ratingBoxValue: {
    color: INK,
    fontSize: 34,
    fontWeight: '900',
  },
  ratingBoxLabel: {
    color: DIM,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyTitle: {
    color: INK,
    fontSize: 28,
    fontWeight: '900',
  },
  historyCount: {
    color: DIM,
    fontSize: 14,
    fontWeight: '700',
  },
  historyList: {
    borderWidth: 1.5,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(8,8,8,0.98)',
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 120,
    maxHeight: 360,
    shadowColor: CYAN,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  historyScroll: {
    flexGrow: 0,
    maxHeight: 340,
    paddingRight: 2,
  },
  historyRailArcade: {
    position: 'absolute',
    right: 4,
    top: 10,
    bottom: 10,
    width: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,184,0,0.5)',
    backgroundColor: 'rgba(255,184,0,0.12)',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  historyThumbArcade: {
    width: 4,
    borderRadius: 1,
    backgroundColor: AMBER,
  },
  historyEmpty: {
    color: DIM,
    textAlign: 'center',
    paddingVertical: 18,
  },
  historyItem: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  historyOpponent: {
    color: INK,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  historyResult: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  resultWin: {
    color: '#22c55e',
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  resultLoss: {
    color: '#ef4444',
    borderColor: 'rgba(239,68,68,0.6)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  resultDraw: {
    color: AMBER,
    borderColor: 'rgba(255,184,0,0.5)',
    backgroundColor: 'rgba(255,184,0,0.1)',
  },
  logoutBtnWrap: {
    marginTop: 92,
  },
});
