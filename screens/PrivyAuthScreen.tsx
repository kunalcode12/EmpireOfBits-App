import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useEmbeddedSolanaWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  useLoginWithSiws,
  usePrivy,
} from '@privy-io/expo';
import {
  useBackpackDeeplinkWalletConnector,
  usePhantomDeeplinkWalletConnector,
} from '@privy-io/expo/connectors';
import { PrivyUIError, useSolanaSignMessage } from '@privy-io/expo/ui';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Elder Futhark-style glyphs */
const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ',
  M: 'ᛗ',
  P: 'ᛈ',
  I: 'ᛁ',
  R: 'ᚱ',
  O: 'ᛟ',
  F: 'ᚠ',
  B: 'ᛒ',
  T: 'ᛏ',
  S: 'ᛊ',
  A: 'ᚨ',
  U: 'ᚢ',
  H: 'ᚺ',
  ' ': '  ',
};

const EMPIRE_RUNES = 'EMPIRE OF BITS AUTH'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');

const RUNE_LINE = `${EMPIRE_RUNES}   ᛉ   ${EMPIRE_RUNES}   ✦   ${EMPIRE_RUNES}   ᚷ   `;

// Extra glitch chars that get randomly swapped in
const GLITCH_CHARS = ['ᚦ', 'ᚾ', 'ᛃ', 'ᛇ', 'ᛚ', 'ᛜ', 'ᛞ', '░', '▒', '▓', '█', '╬', '╫', '║'];

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

// Color palette for glitch cycling
const GLITCH_COLORS = [
  '#f5f5f5',
  '#d4d4d4',
  '#b5b5b5',
  '#8e8e8e',
  '#c9c9c9',
  '#ababab',
  '#ffffff',
  '#6f6f6f',
];

function GlitchRuneRow({ cfg, globalGlitch }: { cfg: typeof ROW_CONFIGS[0]; globalGlitch: number }) {
  const opacityAnim = useRef(new Animated.Value(cfg.baseOpacity)).current;
  const colorIndex = useRef(0);
  const [color, setColor] = useState(GLITCH_COLORS[0]);
  const [glitchedLine, setGlitchedLine] = useState(RUNE_LINE);

  useEffect(() => {
    // Pulse opacity
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

  // Glitch text & color on globalGlitch tick
  useEffect(() => {
    if (globalGlitch === 0) return;
    colorIndex.current = (colorIndex.current + 1) % GLITCH_COLORS.length;
    setColor(GLITCH_COLORS[colorIndex.current]);

    // Randomly swap some chars in the line
    const chars = RUNE_LINE.split('');
    const swapCount = Math.floor(Math.random() * 6) + 1;
    for (let i = 0; i < swapCount; i++) {
      const pos = Math.floor(Math.random() * chars.length);
      chars[pos] = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
    setGlitchedLine(chars.join(''));

    // Revert after short delay
    const timer = setTimeout(() => {
      setGlitchedLine(RUNE_LINE);
    }, 120 + Math.random() * 180);
    return () => clearTimeout(timer);
  }, [globalGlitch]);

  return (
    <View style={[runeStyles.row, { marginLeft: cfg.offset }]}>
      <Animated.Text
        style={[
          runeStyles.runeText,
          { opacity: opacityAnim, fontSize: cfg.size, color },
        ]}
        numberOfLines={1}
      >
        {glitchedLine}
      </Animated.Text>
    </View>
  );
}

function RunicBackgroundMono() {
  const glitchTick = useRef(0);
  const [globalGlitch, setGlobalGlitch] = useState(0);

  useEffect(() => {
    // Random glitch bursts
    const scheduleGlitch = () => {
      const delay = 400 + Math.random() * 1800;
      return setTimeout(() => {
        glitchTick.current += 1;
        setGlobalGlitch(glitchTick.current);
        scheduleGlitch();
      }, delay);
    };
    const t = scheduleGlitch();
    return () => clearTimeout(t);
  }, []);

  return (
    <View pointerEvents="none" style={runeStyles.container}>
      <View pointerEvents="none" style={runeStyles.gradientWash} />
      <View pointerEvents="none" style={runeStyles.glowTop} />
      <View pointerEvents="none" style={runeStyles.glowBottom} />
      <View pointerEvents="none" style={runeStyles.vignette} />
      <View pointerEvents="none" style={runeStyles.scanOverlay} />
      <View pointerEvents="none" style={runeStyles.gridColWrap}>
        {Array.from({ length: GRID_LINE_COUNT }).map((_, i) => (
          <View key={i} style={runeStyles.gridVLine} />
        ))}
      </View>
      {ROW_CONFIGS.map((cfg, i) => (
        <GlitchRuneRow key={i} cfg={cfg} globalGlitch={globalGlitch} />
      ))}
    </View>
  );
}

/** Empire of Bits animated title */
function EmpireTitle() {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const shadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 32],
  });

  return (
    <View style={titleStyles.wrap}>
      {/* Decorative top runes */}
      <Text style={titleStyles.preRunes}>ᛉ ᚷ ᛟ ᚠ ᛉ</Text>

      {/* EMPIRE */}
      <View style={titleStyles.empireRow}>
        <View style={titleStyles.empireLineCyan} />
        <Animated.Text
          style={[
            titleStyles.empire,
            { textShadowRadius: shadowRadius as unknown as number },
          ]}
        >
          EMPIRE
        </Animated.Text>
        <View style={titleStyles.empireLineMagenta} />
      </View>

      {/* OF */}
      <Text style={titleStyles.of}>— OF —</Text>

      {/* BITS */}
      <View style={titleStyles.bitsRow}>
        <Text style={titleStyles.bitsAccent}>◈</Text>
        <Animated.Text
          style={[
            titleStyles.bits,
            { textShadowRadius: shadowRadius as unknown as number },
          ]}
        >
          BITS
        </Animated.Text>
        <Text style={titleStyles.bitsAccent}>◈</Text>
      </View>

      {/* Bottom runes */}
      <Text style={titleStyles.postRunes}>ᚨ ✦ ᛒ ✦ ᚨ</Text>
    </View>
  );
}

/** Official Privy GitHub org avatar */
const PRIVY_MARK_URI = 'https://avatars.githubusercontent.com/u/81824329?s=128&v=4';

type WalletChoice = 'phantom' | 'backpack';

const WALLET_OPTIONS: {
  id: WalletChoice;
  label: string;
  hint: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { id: 'phantom', label: 'Phantom', hint: 'Solana', icon: 'ghost-outline' },
  { id: 'backpack', label: 'Backpack', hint: 'Solana', icon: 'bag-personal-outline' },
];

const BG = '#050505';
const BG_MID = '#0e0e0e';
const INK = '#f5f5f5';
const DIM = '#94a3b8';
const CYAN = '#22d3ee';
const CYAN_DEEP = '#0891b2';
const MAGENTA = '#e879f9';
const MAGENTA_DEEP = '#c026d3';
const AMBER = '#fbbf24';
const AMBER_DEEP = '#d97706';
const CRT_TINT = 'rgba(255, 255, 255, 0.04)';
const VIGNETTE = 'rgba(0, 0, 0, 0.25)';

type ArcadeButtonVariant = 'cyan' | 'outline' | 'google' | 'amber' | 'magentaOutline';

const arcadeVariants: Record<
  ArcadeButtonVariant,
  { outer: object; stripe: object; inner: object }
> = {
  cyan: {
    outer: {
      borderColor: CYAN,
      shadowColor: CYAN,
      shadowOpacity: 0.55,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 10,
    },
    stripe: { backgroundColor: 'rgba(255,255,255,0.4)' },
    inner: {
      backgroundColor: CYAN_DEEP,
      borderColor: 'rgba(255,255,255,0.35)',
    },
  },
  outline: {
    outer: {
      borderColor: MAGENTA,
      shadowColor: MAGENTA_DEEP,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    stripe: { backgroundColor: 'rgba(232, 121, 249, 0.35)' },
    inner: {
      backgroundColor: 'rgba(30, 27, 75, 0.92)',
      borderColor: 'rgba(232, 121, 249, 0.45)',
    },
  },
  google: {
    outer: {
      borderColor: '#60a5fa',
      backgroundColor: '#171717',
      shadowColor: '#3b82f6',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    stripe: { backgroundColor: 'rgba(96, 165, 250, 0.4)' },
    inner: {
      backgroundColor: '#f5f5f5',
      borderColor: 'rgba(96, 165, 250, 0.35)',
    },
  },
  amber: {
    outer: {
      borderColor: AMBER,
      shadowColor: AMBER_DEEP,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 3 },
      elevation: 7,
    },
    stripe: { backgroundColor: 'rgba(255, 255, 255, 0.45)' },
    inner: {
      backgroundColor: AMBER_DEEP,
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
  },
  magentaOutline: {
    outer: {
      borderColor: MAGENTA_DEEP,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    stripe: { backgroundColor: 'rgba(192, 38, 211, 0.4)' },
    inner: {
      backgroundColor: 'rgba(15, 10, 30, 0.95)',
      borderColor: 'rgba(192, 38, 211, 0.5)',
    },
  },
};

function ArcadeFrame({
  children,
  pressed,
  variant,
}: {
  children: React.ReactNode;
  pressed?: boolean;
  variant: ArcadeButtonVariant;
}) {
  const v = arcadeVariants[variant];
  return (
    <View style={[arcadeFrame.outer, v.outer, pressed && arcadeFrame.outerPressed]}>
      <View style={[arcadeFrame.innerStripe, v.stripe]} />
      <View style={[arcadeFrame.inner, v.inner]}>{children}</View>
    </View>
  );
}

/** Slide-in OTP panel (slides from right, shows back button) */
function OtpSlidePanel({
  visible,
  email,
  code,
  setCode,
  onVerify,
  onBack,
  authBusy,
  otpState,
}: {
  visible: boolean;
  email: string;
  code: string;
  setCode: (v: string) => void;
  onVerify: () => void;
  onBack: () => void;
  authBusy: boolean;
  otpState: { status: string; error?: { message: string } | null };
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_WIDTH,
          duration: 250,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View
      style={[
        otpPanelStyles.panel,
        {
          transform: [{ translateX: slideAnim }],
          opacity: fadeAnim,
          pointerEvents: visible ? 'auto' : 'none',
        } as any,
      ]}
    >
      <RunicBackgroundMono />
      {/* Back button */}
      <Pressable style={[otpPanelStyles.backBtn, { top: insets.top }]} onPress={onBack}>
        {({ pressed: p }) => (
          <View style={[otpPanelStyles.backBtnInner, p && { opacity: 0.7 }]}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={CYAN} />
            <Text style={otpPanelStyles.backLabel}>BACK</Text>
          </View>
        )}
      </Pressable>

      <View style={otpPanelStyles.content}>
        {/* Header */}
        <View style={otpPanelStyles.headerRow}>
          <View style={otpPanelStyles.headerLine} />
          <MaterialCommunityIcons name="email-check-outline" size={28} color={CYAN} style={{ marginHorizontal: 12 }} />
          <View style={otpPanelStyles.headerLine} />
        </View>

        <Text style={otpPanelStyles.title}>CHECK YOUR EMAIL</Text>
        <Text style={otpPanelStyles.subtitle}>
          Code sent to{'\n'}
          <Text style={otpPanelStyles.emailHighlight}>{email}</Text>
        </Text>

        <Text style={otpPanelStyles.inputLabel}>VERIFICATION CODE</Text>
        <TextInput
          style={otpPanelStyles.codeInput}
          value={code}
          onChangeText={setCode}
          placeholder="6 — digit code"
          placeholderTextColor={DIM}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {/* Digit indicators */}
        <View style={otpPanelStyles.digitRow}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[
                otpPanelStyles.digitDot,
                i < code.length && otpPanelStyles.digitDotFilled,
              ]}
            />
          ))}
        </View>

        <Pressable
          style={otpPanelStyles.verifyBtnWrap}
          disabled={authBusy}
          onPress={onVerify}
        >
          {({ pressed: p }) => (
            <ArcadeFrame pressed={p} variant="cyan">
              {otpState.status === 'submitting-code' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={20} color="#fff" />
                  <Text style={styles.btnLabelLight}>VERIFY & ENTER</Text>
                </View>
              )}
            </ArcadeFrame>
          )}
        </Pressable>

        <View style={otpPanelStyles.runeAccent}>
          <Text style={otpPanelStyles.runeAccentText}>ᛖ ᛗ ᛈ ᛁ ᚱ ᛖ</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function PrivyAuthScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  const { isReady, user, error: privyInitError, logout } = usePrivy();
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail();
  const { login: loginWithOAuth, state: oauthState } = useLoginWithOAuth();
  const { signMessage: solanaSignUi } = useSolanaSignMessage();
  const solanaWallet = useEmbeddedSolanaWallet();
  const { generateMessage, login: loginWithSiws } = useLoginWithSiws();

  const redirectUri = Linking.createURL('/privy-auth');
  const appDisplayUrl = useMemo(() => {
    const host =
      Constants.expoConfig?.hostUri?.split(':')[0] ??
      (typeof Constants.expoConfig?.scheme === 'string' ? `${Constants.expoConfig.scheme}://app` : null);
    return host ? `https://${host}` : 'https://expo.dev';
  }, []);

  const phantom = usePhantomDeeplinkWalletConnector({
    appUrl: appDisplayUrl,
    redirectUri,
    autoReconnect: false,
  });

  const backpack = useBackpackDeeplinkWalletConnector({
    appUrl: appDisplayUrl,
    redirectUri,
    autoReconnect: false,
  });

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);

  const siwsOrigin = useMemo(() => {
    try {
      const u = new URL(appDisplayUrl);
      return { domain: u.hostname || 'localhost', uri: appDisplayUrl };
    } catch {
      return { domain: 'localhost', uri: appDisplayUrl };
    }
  }, [appDisplayUrl]);

  useEffect(() => {
    if (isReady && user) {
      router.replace('/(tabs)');
    }
  }, [isReady, user]);

  const onSendCode = useCallback(async () => {
    setLocalError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setLocalError('Enter your email.');
      return;
    }
    setBusy(true);
    try {
      await sendCode({ email: trimmed });
      setCodeSent(true);
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Failed to send code.');
    } finally {
      setBusy(false);
    }
  }, [email, sendCode]);

  const onVerifyCode = useCallback(async () => {
    setLocalError(null);
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setLocalError('Enter the code from your email.');
      return;
    }
    setBusy(true);
    try {
      await loginWithCode({ code: trimmedCode, email: trimmedEmail });
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }, [code, email, loginWithCode]);

  const onGoogleLogin = useCallback(async () => {
    setLocalError(null);
    try {
      await loginWithOAuth({ provider: 'google' });
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
  }, [loginWithOAuth]);

  const onHeadlessSolanaSign = useCallback(async () => {
    setLocalError(null);
    setLastSignature(null);
    if (solanaWallet.status !== 'connected' || !solanaWallet.wallets?.[0]) {
      setLocalError('Solana embedded wallet is not ready yet.');
      return;
    }
    setBusy(true);
    try {
      const provider = await solanaWallet.wallets[0].getProvider();
      const result = await provider.request({
        method: 'signMessage',
        params: { message: 'Hello from EobApp (headless Solana sign)' },
      });
      setLastSignature(typeof result === 'string' ? result : JSON.stringify(result));
      Alert.alert('Signed (headless)', 'Message signed with embedded Solana wallet.');
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Headless sign failed.');
    } finally {
      setBusy(false);
    }
  }, [solanaWallet]);

  const onUiSolanaSign = useCallback(async () => {
    setLocalError(null);
    setLastSignature(null);
    setBusy(true);
    try {
      const { signature } = await solanaSignUi({
        message: 'Hello world',
        appearance: {
          title: 'Confirm signature',
          description: 'Empire of Bits — prove wallet control',
          buttonText: 'Sign',
        },
      });
      setLastSignature(signature);
      Alert.alert('Signed (Privy UI)', signature.slice(0, 24) + '…');
    } catch (e: unknown) {
      if (e instanceof PrivyUIError) {
        setLocalError(`${e.code}: ${e.message}`);
      } else {
        setLocalError(e instanceof Error ? e.message : 'Privy UI sign failed.');
      }
    } finally {
      setBusy(false);
    }
  }, [solanaSignUi]);

  const runSiwsLogin = useCallback(
    async (choice: WalletChoice) => {
      setLocalError(null);
      setWalletSheetOpen(false);
      setBusy(true);

      const connector = choice === 'phantom' ? phantom : backpack;
      const other = choice === 'phantom' ? backpack : phantom;

      try {
        await other.disconnect().catch(() => {});
        if (!connector.isConnected) {
          await connector.connect();
        }
        const address = connector.address;
        if (!address) {
          throw new Error('Wallet did not return an address.');
        }

        const { message } = await generateMessage({
          wallet: { address },
          from: siwsOrigin,
        });

        const { signature } = await connector.signMessage(message);

        await loginWithSiws({
          message,
          signature,
          wallet: {
            walletClientType: choice === 'phantom' ? 'phantom' : 'backpack',
            connectorType: 'mobile_wallet_protocol',
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Wallet login failed.';
        setLocalError(msg);
        await connector.disconnect().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [backpack, generateMessage, loginWithSiws, phantom, siwsOrigin],
  );

  const otpBusy =
    otpState.status === 'sending-code' || otpState.status === 'submitting-code';
  const oauthBusy = oauthState.status === 'loading';
  const oauthErrorMessage =
    oauthState.status === 'error' && oauthState.error ? oauthState.error.message : null;
  const authBusy = busy || otpBusy || oauthBusy;

  const errorText =
    localError ??
    oauthErrorMessage ??
    (otpState.status === 'error' ? otpState.error?.message : null) ??
    null;

  if (!fontsLoaded) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={CYAN} />
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <RunicBackgroundMono />
        <ActivityIndicator size="large" color={CYAN} />
      </View>
    );
  }

  if (privyInitError) {
    return (
      <View style={[styles.screenRoot, styles.errorScreenPad, { paddingTop: insets.top + 20 }]}>
        <RunicBackgroundMono />
        <Text style={styles.heroTitle}>Privy error</Text>
        <Text style={styles.mono}>{privyInitError.message}</Text>
        <Pressable style={styles.arcadeBtnGhostWrap} onPress={() => logout()}>
          {({ pressed }) => (
            <ArcadeFrame pressed={pressed} variant="outline">
              <Text style={styles.btnLabelOutline}>Reset session</Text>
            </ArcadeFrame>
          )}
        </Pressable>
      </View>
    );
  }

  if (user) {
    const solanaStatus = solanaWallet.status;
    const solanaAddress =
      solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
        ? solanaWallet.wallets[0].address
        : null;

    return (
      <View style={styles.screenRoot}>
        <RunicBackgroundMono />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContentSignedIn,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <EmpireTitle />

          <Pressable style={styles.arcadeBtnSolidWrap} disabled={busy} onPress={() => router.replace('/(tabs)')}>
            {({ pressed }) => (
              <ArcadeFrame pressed={pressed} variant="cyan">
                <Text style={styles.btnLabelLight}>CONTINUE</Text>
              </ArcadeFrame>
            )}
          </Pressable>

          <Pressable style={styles.arcadeBtnGhostWrap} onPress={() => { setCodeSent(false); setCode(''); logout(); }}>
            {({ pressed }) => (
              <ArcadeFrame pressed={pressed} variant="magentaOutline">
                <Text style={styles.btnLabelOutline}>LOG OUT</Text>
              </ArcadeFrame>
            )}
          </Pressable>

          <View style={styles.walletCard}>
            <Text style={styles.walletCardTitle}>EMBEDDED SOLANA</Text>
            <Text style={styles.walletCardLine}>
              Status: <Text style={styles.walletCardEm}>{solanaStatus}</Text>
            </Text>
            {solanaAddress ? (
              <Text style={styles.mono} selectable numberOfLines={2}>
                {solanaAddress}
              </Text>
            ) : (
              <Text style={styles.walletCardMuted}>Provisioning wallet…</Text>
            )}
            <Pressable
              style={styles.arcadeBtnGhostWrap}
              disabled={busy || solanaStatus !== 'connected'}
              onPress={onHeadlessSolanaSign}
            >
              {({ pressed }) => (
                <ArcadeFrame pressed={pressed} variant="outline">
                  <Text
                    style={[
                      styles.btnLabelOutline,
                      (busy || solanaStatus !== 'connected') && styles.disabledText,
                    ]}
                  >
                    SIGN (HEADLESS)
                  </Text>
                </ArcadeFrame>
              )}
            </Pressable>
            <Pressable style={styles.arcadeBtnGhostWrap} disabled={busy} onPress={onUiSolanaSign}>
              {({ pressed }) => (
                <ArcadeFrame pressed={pressed} variant="amber">
                  <Text style={[styles.btnLabelLight, busy && styles.disabledText]}>
                    SIGN (PRIVY UI)
                  </Text>
                </ArcadeFrame>
              )}
            </Pressable>
            {lastSignature ? (
              <Text style={styles.monoSmall} selectable numberOfLines={3}>
                {lastSignature}
              </Text>
            ) : null}
          </View>

          <View style={styles.privyFooter}>
            <Image source={{ uri: PRIVY_MARK_URI }} style={styles.privyMark} contentFit="contain" />
            <Text style={styles.privyFooterLabel}>Privy Auth</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.screenRoot}>
        <RunicBackgroundMono />

        <ScrollView
          contentContainerStyle={[
            styles.scrollCentered,
            {
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 28,
              paddingHorizontal: 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <EmpireTitle />

          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

          {/* Email */}
          <Text style={styles.sectionLabel}>EMAIL</Text>
          <TextInput
            style={styles.arcadeInput}
            value={email}
            onChangeText={setEmail}
            placeholder="you@domain.com"
            placeholderTextColor={DIM}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable style={styles.arcadeBtnSolidWrap} disabled={authBusy} onPress={onSendCode}>
            {({ pressed }) => (
              <ArcadeFrame pressed={pressed} variant="cyan">
                {otpState.status === 'sending-code' ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                    <Text style={[styles.btnLabelLight, authBusy && styles.disabledTextLight]}>
                      SEND CODE
                    </Text>
                  </View>
                )}
              </ArcadeFrame>
            )}
          </Pressable>

          {/* Google */}
          <Text style={[styles.sectionLabel, { marginTop: 28 }]}>GOOGLE</Text>
          <Pressable style={styles.arcadeBtnGhostWrap} disabled={authBusy} onPress={onGoogleLogin}>
            {({ pressed }) => (
              <ArcadeFrame pressed={pressed} variant="google">
                <View style={styles.rowCenter}>
                  {oauthBusy ? (
                  <ActivityIndicator color="#3b82f6" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="google" size={24} color="#3b82f6" />
                      <Text style={[styles.btnLabelGoogle, { marginLeft: 12 }]}>SIGN IN WITH GOOGLE</Text>
                    </>
                  )}
                </View>
              </ArcadeFrame>
            )}
          </Pressable>

          {/* Wallet */}
          {/* <Text style={[styles.sectionLabel, { marginTop: 28 }]}>WALLET</Text>
          <Pressable
            style={styles.arcadeBtnGhostWrap}
            disabled={authBusy}
            onPress={() => setWalletSheetOpen(true)}
          >
            {({ pressed }) => (
              <ArcadeFrame pressed={pressed} variant="amber">
                <View style={styles.rowBetween}>
                  <Text style={styles.btnLabelLight}>SELECT WALLET</Text>
                  <MaterialCommunityIcons name="wallet-outline" size={24} color="#f5f5f5" />
                </View>
              </ArcadeFrame>
            )}
          </Pressable> */}

          <View style={styles.privyFooter}>
            <Image source={{ uri: PRIVY_MARK_URI }} style={styles.privyMark} contentFit="contain" />
            <Text style={styles.privyFooterLabel}>Privy Auth</Text>
          </View>
        </ScrollView>

        {/* OTP slide panel — sits on top, slides in from right */}
        <OtpSlidePanel
          visible={codeSent}
          email={email}
          code={code}
          setCode={setCode}
          onVerify={onVerifyCode}
          onBack={() => {
            setCodeSent(false);
            setCode('');
            setLocalError(null);
          }}
          authBusy={authBusy}
          otpState={otpState}
        />
      </View>

      <Modal
        visible={walletSheetOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setWalletSheetOpen(false)}
      >
        <View style={[styles.sheetRoot, { paddingTop: insets.top + 8 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>CONNECT WALLET</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close wallet picker"
              style={styles.sheetClose}
              onPress={() => setWalletSheetOpen(false)}
            >
              <Text style={styles.sheetCloseText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetSubtitle}>Solana wallets via Privy (deep link)</Text>

          <View style={styles.sheetList}>
            {WALLET_OPTIONS.map((w) => (
              <Pressable
                key={w.id}
                style={[
                  styles.sheetRow,
                  w.id === 'phantom' ? styles.sheetRowPhantom : styles.sheetRowBackpack,
                ]}
                disabled={authBusy}
                onPress={() => void runSiwsLogin(w.id)}
              >
                <View style={styles.sheetRowLeft}>
                  <MaterialCommunityIcons
                    name={w.icon}
                    size={28}
                    color={w.id === 'phantom' ? CYAN : MAGENTA}
                  />
                  <View>
                    <Text style={styles.sheetRowTitle}>{w.label}</Text>
                    <Text style={styles.sheetRowHint}>{w.hint}</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={DIM} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.sheetFoot}>
            You may leave the app to approve the connection in your wallet. Ensure Phantom or Backpack is installed.
          </Text>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const runeStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 6,
    backgroundColor: BG,
  },
  gradientWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG_MID,
  },
  glowTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '40%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  glowBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: VIGNETTE,
    opacity: 0.35,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CRT_TINT,
  },
  gridColWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  gridVLine: {
    width: StyleSheet.hairlineWidth * 2,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  row: {
    overflow: 'hidden',
  },
  runeText: {
    fontWeight: '300',
    letterSpacing: 5,
    textShadowColor: MAGENTA_DEEP,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
});

const titleStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  preRunes: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(229, 229, 229, 0.45)',
    letterSpacing: 6,
    marginBottom: 4,
  },
  empireRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  empireLineCyan: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: CYAN,
    shadowColor: CYAN,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  empireLineMagenta: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: MAGENTA,
    shadowColor: MAGENTA,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  empire: {
    fontFamily: 'Inter_900Black',
    fontSize: 38,
    color: INK,
    letterSpacing: 8,
    textTransform: 'uppercase',
    textShadowColor: CYAN,
    textShadowOffset: { width: 0, height: 0 },
  },
  of: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(163, 163, 163, 0.75)',
    letterSpacing: 8,
    textTransform: 'uppercase',
    marginVertical: 2,
  },
  bitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bitsAccent: {
    fontSize: 18,
    color: MAGENTA,
    textShadowColor: MAGENTA_DEEP,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  bits: {
    fontFamily: 'Inter_900Black',
    fontSize: 46,
    color: MAGENTA,
    letterSpacing: 10,
    textTransform: 'uppercase',
    textShadowColor: MAGENTA_DEEP,
    textShadowOffset: { width: 0, height: 0 },
  },
  postRunes: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: 'rgba(212, 212, 212, 0.4)',
    letterSpacing: 5,
    marginTop: 4,
  },
});

const otpPanelStyles = StyleSheet.create({
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 100,
  },
  backBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: CYAN,
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16,
    marginTop: 60,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  title: {
    fontFamily: 'Inter_900Black',
    fontSize: 22,
    color: INK,
    letterSpacing: 4,
    textAlign: 'center',
    textShadowColor: CYAN,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: DIM,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  emailHighlight: {
    fontFamily: 'Inter_600SemiBold',
    color: CYAN,
  },
  inputLabel: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 11,
    letterSpacing: 4,
    color: CYAN,
    marginBottom: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.25)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  codeInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(12, 12, 12, 0.95)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    fontSize: 26,
    color: INK,
    textAlign: 'center',
    letterSpacing: 12,
    shadowColor: CYAN,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  digitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: -4,
  },
  digitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'transparent',
  },
  digitDotFilled: {
    backgroundColor: CYAN,
    borderColor: CYAN,
    shadowColor: CYAN,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  verifyBtnWrap: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
  runeAccent: {
    alignItems: 'center',
    marginTop: 24,
  },
  runeAccentText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 16,
    color: 'rgba(212, 212, 212, 0.35)',
    letterSpacing: 8,
  },
});

const arcadeFrame = StyleSheet.create({
  outer: {
    borderWidth: 3,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
  },
  outerPressed: {
    opacity: 0.9,
    transform: [{ translateY: 3 }, { scale: 0.99 }],
  },
  innerStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  inner: {
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    paddingHorizontal: 18,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 6,
  },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenRoot: {
    flex: 1,
    backgroundColor: BG,
  },
  errorScreenPad: {
    paddingHorizontal: 24,
    gap: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  scrollCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  scrollContentSignedIn: {
    gap: 18,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  heroTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 17,
    color: '#e2e8f0',
    textAlign: 'center',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionLabel: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
    letterSpacing: 4,
    color: CYAN,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 10,
    textShadowColor: 'rgba(255, 255, 255, 0.22)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  arcadeInput: {
    fontFamily: 'Inter_500Medium',
    backgroundColor: 'rgba(12, 12, 12, 0.88)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontSize: 17,
    minHeight: 54,
    color: INK,
  },
  arcadeBtnSolidWrap: {
    alignSelf: 'stretch',
    marginTop: 14,
  },
  arcadeBtnGhostWrap: {
    alignSelf: 'stretch',
    marginTop: 4,
  },
  btnLabelLight: {
    fontFamily: 'Inter_900Black',
    fontSize: 15,
    letterSpacing: 2.5,
    color: '#ffffff',
  },
  btnLabelGoogle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    letterSpacing: 1.5,
    color: '#0f172a',
  },
  btnLabelOutline: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    letterSpacing: 2,
    color: '#fae8ff',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  privyFooter: {
    marginTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    opacity: 0.95,
  },
  privyMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  privyFooterLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#cbd5e1',
    letterSpacing: 1.2,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#fb7185',
    textAlign: 'center',
    marginBottom: 4,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: DIM,
  },
  monoSmall: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: '#71717a',
    marginTop: 8,
  },
  walletCard: {
    marginTop: 8,
    padding: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: 10,
    backgroundColor: 'rgba(14, 14, 14, 0.92)',
    gap: 14,
  },
  walletCardTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
    letterSpacing: 4,
    color: MAGENTA,
  },
  walletCardLine: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: INK,
  },
  walletCardEm: {
    fontFamily: 'Inter_700Bold',
    color: INK,
  },
  walletCardMuted: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: DIM,
  },
  disabledText: {
    opacity: 0.45,
  },
  disabledTextLight: {
    opacity: 0.55,
  },
  sheetRoot: {
    flex: 1,
    backgroundColor: '#070707',
    paddingHorizontal: 22,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 20,
    letterSpacing: 4,
    color: INK,
  },
  sheetClose: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderColor: MAGENTA,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(22, 22, 22, 0.92)',
  },
  sheetCloseText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: MAGENTA,
  },
  sheetSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: DIM,
    marginBottom: 22,
    lineHeight: 20,
  },
  sheetList: {
    gap: 14,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 16, 16, 0.92)',
  },
  sheetRowPhantom: {
    borderColor: 'rgba(34, 211, 238, 0.55)',
    borderLeftWidth: 5,
    borderLeftColor: CYAN,
  },
  sheetRowBackpack: {
    borderColor: 'rgba(232, 121, 249, 0.42)',
    borderLeftWidth: 5,
    borderLeftColor: MAGENTA,
  },
  sheetRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sheetRowTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 18,
    letterSpacing: 0.5,
    color: INK,
  },
  sheetRowHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: DIM,
    marginTop: 2,
  },
  sheetFoot: {
    marginTop: 'auto',
    paddingTop: 24,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: DIM,
    lineHeight: 18,
    opacity: 0.85,
  },
});
