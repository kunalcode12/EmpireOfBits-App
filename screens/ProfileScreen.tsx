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
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  type ProfileUpdatePayload,
  updateUserProfile,
} from '../api/authApi';
import { useAuth } from '../store/AuthContext';
import { getPrivyDisplayName, getPrivyEmail } from '../utils/privyUser';

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
  const [profileData, setProfileData] = useState<Awaited<ReturnType<typeof getUserProfile>> | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editChessLevel, setEditChessLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'PRO'>('BEGINNER');
  const [editPassword, setEditPassword] = useState('');
  const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL' | null>(null);

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
    } catch (error) {
      Alert.alert('Points', error instanceof Error ? error.message : 'Unable to refresh points');
    } finally {
      setPointsLoading(false);
    }
  }, [auth.user]);

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
  }, [auth, logout]);

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

        {/* ── RANK CARD ────────────────────────────────────── */}
        <View style={ps.rankCard}>
          <View style={[ps.rankAccentBar, { backgroundColor: AMBER }]} />
          <View style={ps.rankCardInner}>
            <Text style={ps.rankLabel}>◈ RANK ◈</Text>
            <Text style={ps.rankTitle}>{profileData?.user.chessLevel ?? 'ROOKIE'}</Text>
            <Text style={ps.rankLevel}>{profileData?.totalTimePlayed ?? '0h 0m'}</Text>
          </View>
        </View>

        {/* ── IDENTITY CARD ────────────────────────────────── */}
        <View style={[ps.card, { borderColor: 'rgba(34,211,238,0.3)', shadowColor: CYAN }]}>
          <View style={[ps.cardLeftBar, { backgroundColor: CYAN }]} />
          <View style={ps.cardInner}>
            <View style={ps.cardHeader}>
              <MaterialCommunityIcons name="account-circle-outline" size={15} color={CYAN} />
              <Text style={[ps.cardTitle, { color: CYAN }]}>IDENTITY</Text>
            </View>
            {displayName ? <ProfileRow label="NAME" value={displayName} /> : null}
            {email ? <ProfileRow label="EMAIL" value={email} mono /> : null}
            {user?.id ? (
              <ProfileRow label="ID" value={`${user.id.slice(0, 20)}…`} mono dim />
            ) : null}
            <ProfileRow
              label="CHESS USER"
              value={profileData?.user.name ?? auth.user?.username ?? '--'}
            />
          </View>
        </View>

        {/* ── BACKEND PROFILE STATUS ───────────────────────── */}
        <View style={[ps.card, { borderColor: 'rgba(255,255,255,0.2)', shadowColor: '#999' }]}>
          <View style={[ps.cardLeftBar, { backgroundColor: '#d4d4d4' }]} />
          <View style={ps.cardInner}>
            <View style={ps.cardHeader}>
              <MaterialCommunityIcons name="account-box-outline" size={15} color="#d4d4d4" />
              <Text style={[ps.cardTitle, { color: '#d4d4d4' }]}>CHESS PROFILE</Text>
            </View>
            {profileLoading ? (
              <ActivityIndicator size="small" color={AMBER} />
            ) : (
              <>
                <ProfileRow label="POINTS" value={`${profileData?.user.points ?? '--'}`} highlight={AMBER} />
                <ProfileRow label="LEVEL" value={profileData?.user.chessLevel ?? '--'} />
                <ProfileRow label="TIME PLAYED" value={profileData?.totalTimePlayed ?? '--'} />
              </>
            )}
            {profileError ? <Text style={ps.errorText}>{profileError}</Text> : null}
          </View>
        </View>

        {/* ── STATS CARD ───────────────────────────────────── */}
        <View style={[ps.card, { borderColor: 'rgba(232,121,249,0.35)', shadowColor: MAGENTA }]}>
          <View style={[ps.cardLeftBar, { backgroundColor: MAGENTA }]} />
          <View style={ps.cardInner}>
            <View style={ps.cardHeader}>
              <MaterialCommunityIcons name="chart-box-outline" size={15} color={MAGENTA} />
              <Text style={[ps.cardTitle, { color: MAGENTA }]}>GAME STATS</Text>
            </View>
            <ProfileRow label="ROOM" value={`${profileData?.stats.room.won ?? 0}W / ${profileData?.stats.room.lost ?? 0}L / ${profileData?.stats.room.drawn ?? 0}D`} />
            <ProfileRow label="COMPUTER" value={`${profileData?.stats.computer.won ?? 0}W / ${profileData?.stats.computer.lost ?? 0}L / ${profileData?.stats.computer.drawn ?? 0}D`} />
            <ProfileRow label="GUEST" value={`${profileData?.stats.guest.won ?? 0}W / ${profileData?.stats.guest.lost ?? 0}L / ${profileData?.stats.guest.drawn ?? 0}D`} />
          </View>
        </View>

        {/* ── WALLET CARD ──────────────────────────────────── */}
        <View style={[ps.card, { borderColor: 'rgba(255,184,0,0.3)', shadowColor: AMBER }]}>
          <View style={[ps.cardLeftBar, { backgroundColor: AMBER }]} />
          <View style={ps.cardInner}>
            <View style={ps.cardHeader}>
              <MaterialCommunityIcons name="wallet-outline" size={15} color={AMBER} />
              <Text style={[ps.cardTitle, { color: AMBER }]}>SOLANA WALLET</Text>
            </View>
            <ProfileRow label="STATUS" value={solanaWallet.status} highlight={CYAN} />
            {truncatedAddress ? (
              <>
                <ProfileRow label="ADDRESS" value={truncatedAddress} mono />
                <Pressable onPress={copyAddress} style={ps.copyBtnWrap}>
                  {({ pressed: p }) => (
                    <View style={[ps.copyBtn, p && { opacity: 0.75 }]}>
                      <MaterialCommunityIcons
                        name={copyDone ? 'check-circle' : 'content-copy'}
                        size={14}
                        color={copyDone ? '#4ade80' : AMBER}
                      />
                      <Text style={[ps.copyBtnText, copyDone && { color: '#4ade80' }]}>
                        {copyDone ? 'COPIED!' : 'COPY ADDRESS'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={ps.noWallet}>No embedded wallet found</Text>
            )}
          </View>
        </View>

        {/* ── SIGN MESSAGE BUTTON ──────────────────────────── */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSignPanelOpen(true);
          }}
        >
          {({ pressed: p }) => (
            <View style={[ps.signBtn, p && ps.btnPressed]}>
              <View style={ps.signBtnLeft}>
                <MaterialCommunityIcons name="shield-key-outline" size={22} color={CYAN} />
                <View>
                  <Text style={ps.signBtnTitle}>SIGN MESSAGE</Text>
                  <Text style={ps.signBtnSub}>Prove wallet ownership</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={CYAN} />
            </View>
          )}
        </Pressable>

        <Pressable onPress={() => setEditPanelOpen(true)}>
          {({ pressed: p }) => (
            <View style={[ps.signBtn, p && ps.btnPressed]}>
              <View style={ps.signBtnLeft}>
                <MaterialCommunityIcons name="account-edit-outline" size={22} color={AMBER} />
                <View>
                  <Text style={[ps.signBtnTitle, { color: AMBER }]}>UPDATE PROFILE</Text>
                  <Text style={ps.signBtnSub}>Slide panel with edit controls</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={AMBER} />
            </View>
          )}
        </Pressable>

        <Pressable onPress={() => setPointsPanelOpen(true)}>
          {({ pressed: p }) => (
            <View style={[ps.signBtn, p && ps.btnPressed]}>
              <View style={ps.signBtnLeft}>
                <MaterialCommunityIcons name="wallet-plus-outline" size={22} color={CYAN} />
                <View>
                  <Text style={ps.signBtnTitle}>POINTS ACTIONS</Text>
                  <Text style={ps.signBtnSub}>Refresh, buy and sell in right panel</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={CYAN} />
            </View>
          )}
        </Pressable>

        {/* ── LOGOUT BUTTON ────────────────────────────────── */}
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
          <Pressable style={ps.sideActionBtn} onPress={() => void refreshPoints()} disabled={pointsLoading}>
            <MaterialCommunityIcons name="refresh" size={18} color={CYAN} />
            <Text style={ps.sideActionText}>{pointsLoading ? 'Refreshing...' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={ps.sideActionBtn} onPress={() => setTradeMode('BUY')}>
            <MaterialCommunityIcons name="cart-outline" size={18} color={AMBER} />
            <Text style={ps.sideActionText}>Buy</Text>
          </Pressable>
          <Pressable style={ps.sideActionBtn} onPress={() => setTradeMode('SELL')}>
            <MaterialCommunityIcons name="cash-minus" size={18} color={MAGENTA} />
            <Text style={ps.sideActionText}>Sell</Text>
          </Pressable>
          {tradeMode ? (
            <Text style={ps.sideHint}>
              {tradeMode} flow UI is open. Connect this button to your purchase/sell endpoint when ready.
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
});
