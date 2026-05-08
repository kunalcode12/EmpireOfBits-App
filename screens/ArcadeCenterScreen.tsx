import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as Font from 'expo-font';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerOrLogin, sellPoints } from '../api/authApi';
import { getUserProfile, requestOtp, verifyOtp } from '../lib/vorldAuth';
import { SOLANA_RPC_URL } from '../constants/solana';
import { useAuth } from '../store/AuthContext';
import { usePoints } from '../store/PointsContext';
import { getPrivyEmail } from '../utils/privyUser';
import {
  clearReactiveSessionKeepStreamUrl,
  loadReactiveSnapshot,
  saveReactiveEnabled,
  saveReactiveSession,
  saveReactiveStreamUrl,
  type ReactiveVorldProfile,
  type ReactiveVorldUser,
} from '../utils/reactiveStorageHelper';
import { saveStoredUser } from '../utils/storageHelper';

// ─── Reactive Arcade (Vorld) constants ───────────────────────────────────────
const TWITCH_URL_REGEX = /^https:\/\/(?:www\.)?twitch\.tv\/[a-zA-Z0-9_]{3,25}\/?$/;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Pixel font (mirrors play.tsx loader) ────────────────────────────────────
const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';
const PIXEL_FONT = 'PressStart2P';

// ─── Color tokens ────────────────────────────────────────────────────────────
const BG = '#050505';
const BG_MID = '#0e0e0e';
const INK = '#f5f5f5';
const DIM = '#9ca3af';
const MUTED = '#6b7280';
const NEON_YELLOW = '#FFE600';
const ELECTRIC_CYAN = '#00F5FF';
const HOT_PINK = '#FF006E';
const GOLD = '#D4AF37';
const IVORY = '#F0E6D2';
const WOOD_DARK = '#3a2418';
const NEON_BLUE = '#3b82f6';
const NEON_RED = '#ef4444';
const CRT_TINT = 'rgba(255, 255, 255, 0.04)';
const VIGNETTE = 'rgba(0, 0, 0, 0.25)';
const MAGENTA_DEEP = '#c026d3';
const TREASURY_WALLET = '9bYK9h5Cjb2UXwWgnCi7zYMUYhcJfgkwL5B5KmgoDHEB';
const TRADE_POINTS = 100;
const TRADE_SOL = 0.001;
const CHESS_ENTRY_COST = 50;
const SWIPE_KNOB_SIZE = 48;
const SWIPE_MAX_DISTANCE = SCREEN_WIDTH * 0.62;

// ─── Background: dark CRT + grid + glitch rune rows (matches PrivyAuthScreen) ─

const RUNE_MAP: Record<string, string> = {
  A: 'ᚨ', R: 'ᚱ', C: 'ᚲ', D: 'ᛞ', E: 'ᛖ', N: 'ᚾ', T: 'ᛏ',
  S: 'ᛊ', P: 'ᛈ', I: 'ᛁ', O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', H: 'ᚺ',
  M: 'ᛗ', U: 'ᚢ', ' ': '  ',
};
const ARCADE_RUNES = 'ARCADE OF BITS'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');
const RUNE_LINE = `${ARCADE_RUNES}   ᛉ   ${ARCADE_RUNES}   ✦   ${ARCADE_RUNES}   ᚷ   `;
const GLITCH_CHARS = ['ᚦ', 'ᚾ', 'ᛃ', 'ᛇ', 'ᛚ', 'ᛜ', 'ᛞ', '░', '▒', '▓', '█', '╬', '╫', '║'];
const GLITCH_COLORS = [
  '#f5f5f5', '#d4d4d4', '#b5b5b5', '#8e8e8e',
  '#c9c9c9', '#ababab', '#ffffff', '#6f6f6f',
];
const ROW_CONFIGS = [
  { baseOpacity: 0.10, size: 18, offset: 0 },
  { baseOpacity: 0.07, size: 16, offset: -38 },
  { baseOpacity: 0.12, size: 21, offset: 16 },
  { baseOpacity: 0.08, size: 15, offset: -22 },
  { baseOpacity: 0.11, size: 19, offset: 30 },
  { baseOpacity: 0.07, size: 15, offset: -10 },
  { baseOpacity: 0.10, size: 18, offset: 8 },
  { baseOpacity: 0.08, size: 16, offset: -44 },
  { baseOpacity: 0.12, size: 20, offset: 24 },
  { baseOpacity: 0.07, size: 15, offset: -16 },
  { baseOpacity: 0.10, size: 18, offset: 40 },
  { baseOpacity: 0.08, size: 17, offset: -30 },
  { baseOpacity: 0.12, size: 22, offset: 12 },
];
const GRID_LINE_COUNT = 6;

function GlitchRuneRow({
  cfg,
  globalGlitch,
}: {
  cfg: typeof ROW_CONFIGS[0];
  globalGlitch: number;
}) {
  const opacityAnim = useRef(new Animated.Value(cfg.baseOpacity)).current;
  const colorIndex = useRef(0);
  const [color, setColor] = useState(GLITCH_COLORS[0]);
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
      const pos = Math.floor(Math.random() * chars.length);
      chars[pos] = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
    setGlitchedLine(chars.join(''));

    const timer = setTimeout(() => setGlitchedLine(RUNE_LINE), 120 + Math.random() * 180);
    return () => clearTimeout(timer);
  }, [globalGlitch]);

  return (
    <View style={[bgStyles.row, { marginLeft: cfg.offset }]}>
      <Animated.Text
        style={[
          bgStyles.runeText,
          { opacity: opacityAnim, fontSize: cfg.size, color },
        ]}
        numberOfLines={1}
      >
        {glitchedLine}
      </Animated.Text>
    </View>
  );
}

function ArcadeBackground() {
  const [globalGlitch, setGlobalGlitch] = useState(0);

  useEffect(() => {
    // Track every timer in the recursive chain and stop scheduling new ones
    // after unmount. Without this, each remount (HMR / Strict Mode) leaks
    // a chain that keeps calling setState on stale instances and can trip
    // "Maximum update depth exceeded".
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleGlitch = () => {
      if (cancelled) return;
      const delay = 400 + Math.random() * 1800;
      timerId = setTimeout(() => {
        if (cancelled) return;
        setGlobalGlitch((tick) => tick + 1);
        scheduleGlitch();
      }, delay);
    };

    scheduleGlitch();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  return (
    <View pointerEvents="none" style={bgStyles.container}>
      <View pointerEvents="none" style={bgStyles.gradientWash} />
      <View pointerEvents="none" style={bgStyles.glowTop} />
      <View pointerEvents="none" style={bgStyles.glowBottom} />
      <View pointerEvents="none" style={bgStyles.vignette} />
      <View pointerEvents="none" style={bgStyles.scanOverlay} />
      <View pointerEvents="none" style={bgStyles.gridColWrap}>
        {Array.from({ length: GRID_LINE_COUNT }).map((_, i) => (
          <View key={i} style={bgStyles.gridVLine} />
        ))}
      </View>
      {ROW_CONFIGS.map((cfg, i) => (
        <GlitchRuneRow key={i} cfg={cfg} globalGlitch={globalGlitch} />
      ))}
    </View>
  );
}

// ─── Header — ARCADE CENTER ──────────────────────────────────────────────────

function ArcadeHeader({ pixelLoaded }: { pixelLoaded: boolean }) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const shadowRadius = glow.interpolate({ inputRange: [0, 1], outputRange: [10, 28] });

  return (
    <View style={headerStyles.wrap}>
      <Text style={headerStyles.preRunes}>ᛉ ᚷ ᛟ ᚠ ᛉ</Text>
      <View style={headerStyles.titleRow}>
        <View style={[headerStyles.lineEnd, { backgroundColor: ELECTRIC_CYAN, shadowColor: ELECTRIC_CYAN }]} />
        <Animated.Text
          style={[
            pixelLoaded ? headerStyles.titlePixel : headerStyles.titleFallback,
            { textShadowRadius: shadowRadius as unknown as number },
          ]}
        >
          ARCADE
        </Animated.Text>
        <View style={[headerStyles.lineEnd, { backgroundColor: HOT_PINK, shadowColor: HOT_PINK }]} />
      </View>
      <View style={headerStyles.subtitleRow}>
        <Text style={headerStyles.bracket}>◤</Text>
        <Animated.Text
          style={[
            pixelLoaded ? headerStyles.subPixel : headerStyles.subFallback,
            { textShadowRadius: shadowRadius as unknown as number },
          ]}
        >
          CENTER
        </Animated.Text>
        <Text style={headerStyles.bracket}>◥</Text>
      </View>
      <Text style={headerStyles.postRunes}>ᚨ ✦ ᛒ ✦ ᚨ</Text>
    </View>
  );
}

// ─── Reactive Toggle row ─────────────────────────────────────────────────────

function ReactiveToggleRow({
  value,
  onChange,
  pixelLoaded,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  pixelLoaded: boolean;
}) {
  return (
    <View style={toggleStyles.wrap}>
      <View style={toggleStyles.cornerTL} />
      <View style={toggleStyles.cornerTR} />
      <View style={toggleStyles.cornerBL} />
      <View style={toggleStyles.cornerBR} />
      <View style={toggleStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={pixelLoaded ? toggleStyles.labelPixel : toggleStyles.labelFallback}>
            ENABLE REACTIVE
          </Text>
          <Text style={pixelLoaded ? toggleStyles.labelPixel : toggleStyles.labelFallback}>
            ARCADE
          </Text>
          <Text style={toggleStyles.hint}>
            Link Twitch to let viewers nudge gameplay events.
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#1f1f1f', true: HOT_PINK }}
          thumbColor={value ? NEON_YELLOW : '#444'}
          ios_backgroundColor="#1f1f1f"
        />
      </View>
    </View>
  );
}

// ─── Game tile illustrations (no external images) ─────────────────────────────

function ChessIllustration() {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const dark = (r + c) % 2 === 1;
      cells.push(
        <View
          key={`${r}-${c}`}
          style={[
            tileStyles.chessCell,
            { backgroundColor: dark ? WOOD_DARK : IVORY },
          ]}
        />
      );
    }
  }
  return (
    <View style={tileStyles.chessBoardWrap}>
      <View style={tileStyles.chessBoard}>{cells}</View>
      <Text style={tileStyles.chessKing}>♚</Text>
      <Text style={tileStyles.chessQueen}>♛</Text>
    </View>
  );
}

function TttIllustration() {
  const marks = ['X', 'O', 'X', 'O', 'X', '', 'O', '', 'X'];
  const colors = [NEON_RED, NEON_BLUE, NEON_RED, NEON_BLUE, NEON_RED, '', NEON_BLUE, '', NEON_RED];
  return (
    <View style={tileStyles.tttWrap}>
      {marks.map((m, i) => (
        <View key={i} style={tileStyles.tttCell}>
          <Text
            style={[
              tileStyles.tttMark,
              {
                color: colors[i] || 'transparent',
                textShadowColor: colors[i] || 'transparent',
              },
            ]}
          >
            {m}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ComingSoonIllustration({
  icon,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  return (
    <View style={tileStyles.lockedWrap}>
      <MaterialCommunityIcons name={icon} size={42} color={MUTED} />
      <View style={tileStyles.lockBadge}>
        <MaterialCommunityIcons name="lock-outline" size={11} color="#0a0a0a" />
      </View>
    </View>
  );
}

// ─── Game Card ───────────────────────────────────────────────────────────────

type GameCardProps = {
  title: string;
  subtitle: string;
  borderColor: string;
  glowColor: string;
  illustration: React.ReactNode;
  locked?: boolean;
  onPress?: () => void;
  pixelLoaded: boolean;
  reactiveActive?: boolean;
};

function GameCard({
  title,
  subtitle,
  borderColor,
  glowColor,
  illustration,
  locked,
  onPress,
  pixelLoaded,
  reactiveActive,
}: GameCardProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (locked) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [locked]);

  const shadowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const shadowRadius = pulse.interpolate({ inputRange: [0, 1], outputRange: [10, 22] });

  const effectiveBorderColor = reactiveActive && !locked ? HOT_PINK : borderColor;
  const effectiveGlowColor = reactiveActive && !locked ? HOT_PINK : glowColor;
  const effectiveStripeColor = reactiveActive && !locked ? HOT_PINK : borderColor;

  return (
    <Pressable disabled={locked} onPress={onPress} style={cardStyles.pressableWrap}>
      {({ pressed }) => (
        <Animated.View
          style={[
            cardStyles.outer,
            {
              borderColor: effectiveBorderColor,
              shadowColor: effectiveGlowColor,
              shadowOpacity: locked ? 0 : (shadowOpacity as unknown as number),
              shadowRadius: locked ? 0 : (shadowRadius as unknown as number),
            },
            locked && cardStyles.outerLocked,
            pressed && !locked && cardStyles.outerPressed,
          ]}
        >
          <View style={[cardStyles.stripe, { backgroundColor: effectiveStripeColor }]} />
          <View style={cardStyles.illuArea}>{illustration}</View>
          <View style={cardStyles.titleArea}>
            <Text style={pixelLoaded ? cardStyles.titlePixel : cardStyles.titleFallback}>
              {title}
            </Text>
            <Text style={cardStyles.subtitle}>{subtitle}</Text>
          </View>
          {locked && (
            <View style={cardStyles.comingBadge}>
              <Text style={pixelLoaded ? cardStyles.comingPixel : cardStyles.comingFallback}>
                COMING SOON
              </Text>
            </View>
          )}
          {reactiveActive && !locked && (
            <View style={styles.reactiveBadge}>
              <View style={styles.reactiveBadgeDot} />
              <Text style={pixelLoaded ? styles.reactiveBadgeText : styles.reactiveBadgeFallback}>
                REACTIVE
              </Text>
            </View>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

// ─── Slide-up reactive panel ─────────────────────────────────────────────────

type Step = 0 | 1 | 2;

function ReactivePanel({
  visible,
  step,
  onClose,
  onStepChange,
  email,
  setEmail,
  otp,
  setOtp,
  twitch,
  setTwitch,
  pixelLoaded,
  busy,
  errorText,
  twitchValid,
  onSendOtp,
  onVerifyOtp,
  onLinkAccount,
}: {
  visible: boolean;
  step: Step;
  onClose: () => void;
  onStepChange: (next: Step) => void;
  email: string;
  setEmail: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
  twitch: string;
  setTwitch: (v: string) => void;
  pixelLoaded: boolean;
  busy: boolean;
  errorText: string | null;
  twitchValid: boolean;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onLinkAccount: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const stepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          tension: 60,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: SCREEN_HEIGHT,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(stepAnim, {
      toValue: step,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step]);

  const stepTranslate = stepAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, -SCREEN_WIDTH, -SCREEN_WIDTH * 2],
  });

  const handleEmailNext = () => {
    if (!email.trim() || busy) return;
    onSendOtp();
  };
  const handleOtpNext = () => {
    if (otp.length < 4 || busy) return;
    onVerifyOtp();
  };
  const handleLinkAccount = () => {
    if (!twitch.trim() || !twitchValid || busy) return;
    onLinkAccount();
  };

  const handleBack = () => {
    if (busy) return;
    if (step === 0) onClose();
    else onStepChange((step - 1) as Step);
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        panelStyles.panel,
        { transform: [{ translateY: slideY }], opacity: fade },
      ]}
    >
      <ArcadeBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[panelStyles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={handleBack} style={panelStyles.backBtn}>
            {({ pressed }) => (
              <View style={[panelStyles.backInner, pressed && { opacity: 0.6 }]}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={ELECTRIC_CYAN} />
                <Text style={panelStyles.backLabel}>BACK</Text>
              </View>
            )}
          </Pressable>
          <Text style={pixelLoaded ? panelStyles.headerTitlePixel : panelStyles.headerTitleFallback}>
            REACTIVE LINK
          </Text>
          <View style={panelStyles.backBtn} />
        </View>

        <View style={panelStyles.stepIndicatorRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                panelStyles.stepDot,
                i <= step && panelStyles.stepDotActive,
                i === step && panelStyles.stepDotCurrent,
              ]}
            />
          ))}
        </View>

        <View style={panelStyles.stepsClipper}>
          <Animated.View
            style={[
              panelStyles.stepsTrack,
              { transform: [{ translateX: stepTranslate }] },
            ]}
          >
            {/* Step 1 — Email */}
            <View style={panelStyles.stepPage}>
              <View style={panelStyles.stepIconWrap}>
                <MaterialCommunityIcons name="email-outline" size={32} color={ELECTRIC_CYAN} />
              </View>
              <Text style={pixelLoaded ? panelStyles.stepTitlePixel : panelStyles.stepTitleFallback}>
                STEP 01 / EMAIL
              </Text>
              <Text style={panelStyles.stepBody}>
                Enter the email tied to your reactive arcade profile.
              </Text>
              <Text style={panelStyles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={panelStyles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="player@arcade.gg"
                placeholderTextColor={MUTED}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={panelStyles.ctaWrap}
                disabled={!email.trim() || busy}
                onPress={handleEmailNext}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      panelStyles.cta,
                      { borderColor: ELECTRIC_CYAN, shadowColor: ELECTRIC_CYAN },
                      pressed && panelStyles.ctaPressed,
                      (!email.trim() || busy) && panelStyles.ctaDisabled,
                    ]}
                  >
                    {busy && step === 0 ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={pixelLoaded ? panelStyles.ctaLabelPixel : panelStyles.ctaLabelFallback}>
                          SEND CODE
                        </Text>
                        <MaterialCommunityIcons name="send-outline" size={16} color="#fff" />
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {step === 0 && errorText ? (
                <Text style={panelStyles.errorText}>{errorText}</Text>
              ) : null}
            </View>

            {/* Step 2 — OTP */}
            <View style={panelStyles.stepPage}>
              <View style={panelStyles.stepIconWrap}>
                <MaterialCommunityIcons name="shield-key-outline" size={32} color={NEON_YELLOW} />
              </View>
              <Text style={pixelLoaded ? panelStyles.stepTitlePixel : panelStyles.stepTitleFallback}>
                STEP 02 / VERIFY
              </Text>
              <Text style={panelStyles.stepBody}>
                Six-digit code sent to{' '}
                <Text style={{ color: ELECTRIC_CYAN }}>{email || 'your email'}</Text>.
              </Text>
              <Text style={panelStyles.fieldLabel}>VERIFICATION CODE</Text>
              <TextInput
                style={panelStyles.codeInput}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, ''))}
                placeholder="• • • • • •"
                placeholderTextColor={MUTED}
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={panelStyles.dotRow}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      panelStyles.codeDot,
                      i < otp.length && panelStyles.codeDotFilled,
                    ]}
                  />
                ))}
              </View>
              <Pressable
                style={panelStyles.ctaWrap}
                disabled={otp.length < 4 || busy}
                onPress={handleOtpNext}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      panelStyles.cta,
                      { borderColor: NEON_YELLOW, shadowColor: NEON_YELLOW },
                      pressed && panelStyles.ctaPressed,
                      (otp.length < 4 || busy) && panelStyles.ctaDisabled,
                    ]}
                  >
                    {busy && step === 1 ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={pixelLoaded ? panelStyles.ctaLabelPixel : panelStyles.ctaLabelFallback}>
                          VERIFY
                        </Text>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color="#fff" />
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {step === 1 && errorText ? (
                <Text style={panelStyles.errorText}>{errorText}</Text>
              ) : null}
            </View>

            {/* Step 3 — Twitch */}
            <View style={panelStyles.stepPage}>
              <View style={panelStyles.stepIconWrap}>
                <MaterialCommunityIcons name="twitch" size={32} color={HOT_PINK} />
              </View>
              <Text style={pixelLoaded ? panelStyles.stepTitlePixel : panelStyles.stepTitleFallback}>
                STEP 03 / TWITCH
              </Text>
              <Text style={panelStyles.stepBody}>
                Your audience can drop pixel-events into the live game.
              </Text>
              <Text style={panelStyles.fieldLabel}>STREAM URL</Text>
              <TextInput
                style={panelStyles.textInput}
                value={twitch}
                onChangeText={setTwitch}
                placeholder="https://twitch.tv/your_handle"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={panelStyles.hintMono}>
                Format: https://twitch.tv/accountname
              </Text>
              <Pressable
                style={panelStyles.ctaWrap}
                disabled={!twitch.trim() || !twitchValid || busy}
                onPress={handleLinkAccount}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      panelStyles.cta,
                      { borderColor: HOT_PINK, shadowColor: HOT_PINK },
                      pressed && panelStyles.ctaPressed,
                      (!twitch.trim() || !twitchValid || busy) && panelStyles.ctaDisabled,
                    ]}
                  >
                    {busy && step === 2 ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={pixelLoaded ? panelStyles.ctaLabelPixel : panelStyles.ctaLabelFallback}>
                          LINK ACCOUNT
                        </Text>
                        <MaterialCommunityIcons name="link-variant" size={16} color="#fff" />
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {step === 2 && errorText ? (
                <Text style={panelStyles.errorText}>{errorText}</Text>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ArcadeCenterScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { user: privyUser, isReady: privyReady } = usePrivy();
  const solanaWallet = useEmbeddedSolanaWallet();
  const connectionRef = useRef(new Connection(SOLANA_RPC_URL, 'confirmed'));

  const [pixelLoaded, setPixelLoaded] = useState(false);
  useEffect(() => {
    Font.loadAsync({ [PIXEL_FONT]: PRESS_START_2P_URI })
      .catch(() => null)
      .finally(() => setPixelLoaded(true));
  }, []);

  const [reactiveOn, setReactiveOn] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [twitch, setTwitch] = useState('');
  // ─── Reactive Arcade (Vorld) state — kept independent from existing flows ───
  const [reactiveBusy, setReactiveBusy] = useState(false);
  const [reactiveError, setReactiveError] = useState<string | null>(null);
  const [reactiveDisableModalOpen, setReactiveDisableModalOpen] = useState(false);
  const [reactiveAccessToken, setReactiveAccessToken] = useState<string | null>(null);
  const [reactiveVorldUser, setReactiveVorldUser] = useState<ReactiveVorldUser | null>(null);
  const [reactiveProfile, setReactiveProfile] = useState<ReactiveVorldProfile | null>(null);
  const reactiveAccessTokenRef = useRef<string | null>(null);
  const reactiveHydratedRef = useRef(false);
  const twitchValid = TWITCH_URL_REGEX.test(twitch.trim());
  const { points, pointsLoading, refreshPoints, applyPointsDelta, setPoints } = usePoints();
  const [chessLoading, setChessLoading] = useState(false);
  const [chessEntryModalOpen, setChessEntryModalOpen] = useState(false);
  const [chessEntryCharging, setChessEntryCharging] = useState(false);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeStatusText, setTradeStatusText] = useState<string | null>(null);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);
  const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeStage, setTradeStage] = useState<'review' | 'processing' | 'success'>('review');
  const [tradeFlowFrom, setTradeFlowFrom] = useState<string>('--');
  const [tradeFlowTo, setTradeFlowTo] = useState<string>('--');
  const [tradeResultText, setTradeResultText] = useState<string>('');
  const [tradeSwipeActive, setTradeSwipeActive] = useState(false);
  const [swipeFillPx, setSwipeFillPx] = useState(0);
  const tradeSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const isSyncingChessAuthRef = useRef(false);
  const tradeStageRef = useRef<'review' | 'processing' | 'success'>('review');
  const tradeBusyRef = useRef(false);
  const triggerTradeRef = useRef<() => void>(() => {});

  const fetchPoints = refreshPoints;

  // Keep a live ref to the auth context so the callback doesn't have to take
  // `auth` as a dependency. Re-creating the callback whenever the context
  // value changed was the second source of the update-depth loop: every
  // dispatch in AuthContext produced a new `auth` reference, which produced
  // a new `ensureChessAuth` reference, which retriggered the effect below.
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  const ensureChessAuth = useCallback(async () => {
    const currentAuth = authRef.current;
    if (currentAuth.user || !privyReady || !privyUser || isSyncingChessAuthRef.current) {
      return Boolean(currentAuth.user);
    }

    const emailFromPrivy = getPrivyEmail(privyUser);
    if (!emailFromPrivy) return false;

    isSyncingChessAuthRef.current = true;
    try {
      const localPart = emailFromPrivy.split('@')[0] || 'Player';
      const cleanedName = localPart.replace(/[^a-zA-Z0-9]/g, '');
      const baseName = cleanedName.length >= 3 ? cleanedName : 'Player';
      const name = baseName.slice(0, 20);

      const result = await registerOrLogin({
        email: emailFromPrivy,
        name,
        password: 'test1234@',
      });
      await saveStoredUser(result.user);
      await authRef.current.login({ email: emailFromPrivy, password: 'test1234@' });
      return true;
    } catch (error) {
      console.log('Chess auth sync failed:', error);
      return false;
    } finally {
      isSyncingChessAuthRef.current = false;
    }
  }, [privyReady, privyUser]);

  useEffect(() => {
    if (auth.user) return;
    void ensureChessAuth();
  }, [auth.user, ensureChessAuth]);

  // ─── Reactive Arcade: hydrate from secure storage on mount ────────────────
  useEffect(() => {
    if (reactiveHydratedRef.current) return;
    reactiveHydratedRef.current = true;
    void (async () => {
      try {
        const snap = await loadReactiveSnapshot();
        if (snap.streamUrl) setTwitch(snap.streamUrl);
        if (snap.accessToken) {
          reactiveAccessTokenRef.current = snap.accessToken;
          setReactiveAccessToken(snap.accessToken);
        }
        if (snap.user) setReactiveVorldUser(snap.user);
        if (snap.profile) setReactiveProfile(snap.profile);
        const sessionLive = Boolean(snap.accessToken && snap.user);
        if (snap.enabled && sessionLive) {
          setReactiveOn(true);
        }
      } catch (err) {
        console.log('Reactive hydrate failed:', err);
      }
    })();
  }, []);

  // Re-hydrate from storage whenever this screen regains focus, so state
  // toggled from ProfileScreen (or anywhere else writing to the same
  // reactiveStorageHelper keys) shows up here without needing a remount.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const snap = await loadReactiveSnapshot();
          if (cancelled) return;
          const sessionLive = Boolean(snap.enabled && snap.accessToken && snap.user);
          if (sessionLive && !reactiveAccessTokenRef.current) {
            reactiveAccessTokenRef.current = snap.accessToken;
            setReactiveAccessToken(snap.accessToken);
            if (snap.user) setReactiveVorldUser(snap.user);
            if (snap.profile) setReactiveProfile(snap.profile);
            if (snap.streamUrl) setTwitch(snap.streamUrl);
            setReactiveOn(true);
          } else if (!sessionLive && reactiveAccessTokenRef.current) {
            reactiveAccessTokenRef.current = null;
            setReactiveAccessToken(null);
            setReactiveVorldUser(null);
            setReactiveProfile(null);
            setReactiveOn(false);
          }
        } catch {
          // ignore — non-fatal
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const resetReactivePanelInputs = () => {
    setOtp('');
    setStep(0);
    setReactiveError(null);
  };

  const handleToggle = (next: boolean) => {
    if (next) {
      setReactiveError(null);
      setOtp('');
      setStep(0);
      setReactiveOn(true);
      setPanelVisible(true);
    } else {
      // Ask for confirmation before disabling.
      setReactiveDisableModalOpen(true);
    }
  };

  const handleClosePanel = () => {
    if (reactiveBusy) return;
    setPanelVisible(false);
    // If the user closed before completing the link flow, snap back to off
    // unless a session already exists from a prior login.
    if (!reactiveAccessTokenRef.current) {
      setReactiveOn(false);
    }
  };

  const handleSendOtp = useCallback(async () => {
    if (reactiveBusy) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    setReactiveBusy(true);
    setReactiveError(null);
    try {
      await requestOtp(trimmed);
      setStep(1);
    } catch (err) {
      setReactiveError(err instanceof Error ? err.message : 'Could not send OTP.');
    } finally {
      setReactiveBusy(false);
    }
  }, [email, reactiveBusy]);

  const handleVerifyOtp = useCallback(async () => {
    if (reactiveBusy) return;
    if (otp.length < 4) return;
    setReactiveBusy(true);
    setReactiveError(null);
    try {
      const result = await verifyOtp(email.trim(), otp);
      let profile: ReactiveVorldProfile | null = null;
      try {
        profile = await getUserProfile(result.accessToken);
      } catch (profileErr) {
        console.log('Vorld profile fetch failed (non-fatal):', profileErr);
      }
      await saveReactiveSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user as ReactiveVorldUser,
        profile,
      });
      reactiveAccessTokenRef.current = result.accessToken;
      setReactiveAccessToken(result.accessToken);
      setReactiveVorldUser(result.user as ReactiveVorldUser);
      setReactiveProfile(profile);
      setStep(2);
    } catch (err) {
      setReactiveError(err instanceof Error ? err.message : 'Invalid code, try again.');
    } finally {
      setReactiveBusy(false);
    }
  }, [email, otp, reactiveBusy]);

  const handleLinkAccount = useCallback(async () => {
    if (reactiveBusy) return;
    const trimmed = twitch.trim();
    if (!trimmed || !TWITCH_URL_REGEX.test(trimmed)) {
      setReactiveError('Use the format https://twitch.tv/accountname');
      return;
    }
    setReactiveBusy(true);
    setReactiveError(null);
    try {
      await saveReactiveStreamUrl(trimmed);
      await saveReactiveEnabled(true);
      setReactiveOn(true);
      setPanelVisible(false);
      resetReactivePanelInputs();
    } catch (err) {
      setReactiveError(err instanceof Error ? err.message : 'Failed to save stream URL.');
    } finally {
      setReactiveBusy(false);
    }
  }, [reactiveBusy, twitch]);

  const handleConfirmDisableReactive = useCallback(async () => {
    setReactiveBusy(true);
    try {
      await clearReactiveSessionKeepStreamUrl();
      reactiveAccessTokenRef.current = null;
      setReactiveAccessToken(null);
      setReactiveVorldUser(null);
      setReactiveProfile(null);
      setReactiveOn(false);
      setReactiveDisableModalOpen(false);
      // Stream URL stays cached so re-enabling auto-fills the field.
    } catch (err) {
      console.log('Reactive disable failed:', err);
    } finally {
      setReactiveBusy(false);
    }
  }, []);

  const handleCancelDisableReactive = () => {
    if (reactiveBusy) return;
    setReactiveDisableModalOpen(false);
  };

  const openTradeDrawer = (mode: 'BUY' | 'SELL') => {
    setTradeMode(mode);
    setTradeStatusText(null);
    setTradeResultText('');
    setTradeStage('review');
    swipeX.setValue(0);
    setSwipeFillPx(0);
    setTradeDrawerOpen(true);
    Animated.spring(tradeSheetY, {
      toValue: 0,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  const closeTradeDrawer = () => {
    if (tradeBusy) return;
    Animated.timing(tradeSheetY, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setTradeDrawerOpen(false);
    });
  };

  const handleBuyPoints = useCallback(async () => {
    if (tradeBusy) return;
    const walletAddress =
      solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
        ? solanaWallet.wallets[0].address
        : null;
    if (!walletAddress || !solanaWallet.wallets?.[0]) {
      Alert.alert('Buy points', 'Connect your embedded Privy Solana wallet first.');
      return;
    }
    if (!auth.user) {
      Alert.alert('Buy points', 'Please wait until your chess account is ready.');
      return;
    }

    setTradeBusy(true);
    setTradeStage('processing');
    setTradeStatusText('Awaiting Privy wallet approval...');
    try {
      const fromPubkey = new PublicKey(walletAddress);
      const toPubkey = new PublicKey(TREASURY_WALLET);
      setTradeFlowFrom(walletAddress);
      setTradeFlowTo(TREASURY_WALLET);
      const lamports = Math.round(TRADE_SOL * LAMPORTS_PER_SOL);
      const { blockhash } = await connectionRef.current.getLatestBlockhash('confirmed');
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey,
      }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        }),
      );

      const provider = await solanaWallet.wallets[0].getProvider();
      const txResult = (await provider.request({
        method: 'signAndSendTransaction',
        params: {
          transaction: tx,
          connection: connectionRef.current,
        },
      })) as { signature?: string };

      setTradeStatusText('Transaction confirmed. Updating points...');
      const updatedPoints = await applyPointsDelta(TRADE_POINTS);
      setTradeResultText(
        `Sent ${TRADE_SOL} SOL\n+${TRADE_POINTS} points\nBalance: ${updatedPoints}${
          txResult.signature ? `\nTx: ${txResult.signature.slice(0, 20)}...` : ''
        }`,
      );
      setTradeStage('success');
    } catch (error) {
      setTradeStage('review');
      Alert.alert('Buy failed', error instanceof Error ? error.message : 'Unable to complete purchase.');
    } finally {
      setTradeBusy(false);
      setTradeStatusText(null);
    }
  }, [applyPointsDelta, auth.user, solanaWallet, tradeBusy]);

  const handleSellPoints = useCallback(async () => {
    if (tradeBusy) return;
    const walletAddress =
      solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
        ? solanaWallet.wallets[0].address
        : null;
    if (!walletAddress || !solanaWallet.wallets?.[0]) {
      Alert.alert('Sell points', 'Connect your embedded Privy Solana wallet first.');
      return;
    }
    if (!auth.user) {
      Alert.alert('Sell points', 'Please wait until your chess account is ready.');
      return;
    }
    if ((points ?? 0) < TRADE_POINTS) {
      Alert.alert('Sell points', `You need at least ${TRADE_POINTS} points to sell.`);
      return;
    }

    setTradeBusy(true);
    setTradeStage('processing');
    setTradeStatusText('Awaiting Privy wallet signature...');
    try {
      const provider = await solanaWallet.wallets[0].getProvider();
      await provider.request({
        method: 'signMessage',
        params: {
          message: `Sell confirmation: redeem ${TRADE_POINTS} points for ${TRADE_SOL} SOL on devnet`,
        },
      });

      setTradeStatusText('Signature complete. Processing treasury payout...');
      setTradeFlowFrom('TREASURY');
      setTradeFlowTo(walletAddress);
      const sellResponse = await sellPoints(walletAddress);
      const updatedPoints = sellResponse.points;
      setPoints(updatedPoints);
      setTradeResultText(
        `${sellResponse.payoutSol} SOL sent from treasury\n-${sellResponse.pointsSpent} points\nBalance: ${updatedPoints}\nTx: ${sellResponse.txSignature.slice(0, 20)}...`,
      );
      setTradeStage('success');
    } catch (error) {
      setTradeStage('review');
      Alert.alert('Sell failed', error instanceof Error ? error.message : 'Unable to complete sell flow.');
    } finally {
      setTradeBusy(false);
      setTradeStatusText(null);
    }
  }, [applyPointsDelta, auth.user, points, solanaWallet, tradeBusy]);

  const triggerTradeFromSwipe = useCallback(() => {
    if (tradeBusy || tradeStage !== 'review') return;
    void (tradeMode === 'BUY' ? handleBuyPoints() : handleSellPoints());
  }, [handleBuyPoints, handleSellPoints, tradeBusy, tradeMode, tradeStage]);

  useEffect(() => {
    tradeStageRef.current = tradeStage;
    tradeBusyRef.current = tradeBusy;
    triggerTradeRef.current = triggerTradeFromSwipe;
  }, [tradeBusy, tradeStage, triggerTradeFromSwipe]);

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
        tradeStageRef.current === 'review' &&
        !tradeBusyRef.current,
      onPanResponderGrant: () => {
        setTradeSwipeActive(true);
      },
      onPanResponderMove: (_, gestureState) => {
        const clamped = Math.max(0, Math.min(gestureState.dx, SWIPE_MAX_DISTANCE));
        swipeX.setValue(clamped);
        setSwipeFillPx(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        setTradeSwipeActive(false);
        const threshold = SWIPE_MAX_DISTANCE * 0.85;
        if (gestureState.dx >= threshold) {
          setSwipeFillPx(SWIPE_MAX_DISTANCE);
          Animated.timing(swipeX, {
            toValue: SWIPE_MAX_DISTANCE,
            duration: 120,
            useNativeDriver: true,
          }).start(() => {
            triggerTradeRef.current();
          });
          return;
        }
        setSwipeFillPx(0);
        Animated.spring(swipeX, {
          toValue: 0,
          tension: 70,
          friction: 10,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        setTradeSwipeActive(false);
        setSwipeFillPx(0);
        Animated.spring(swipeX, {
          toValue: 0,
          tension: 70,
          friction: 10,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const handleChessPress = async () => {
    if (!privyReady || !privyUser || chessLoading) return;

    setChessLoading(true);
    try {
      const isLinked = await ensureChessAuth();
      if (!auth.user && !isLinked) return;

      setChessEntryModalOpen(true);
    } catch (error) {
      console.log('Chess auth flow failed:', error);
    } finally {
      setChessLoading(false);
    }
  };

  const handleChessEntryConfirm = useCallback(async () => {
    if (chessEntryCharging || chessLoading) return;
    if ((points ?? 0) < CHESS_ENTRY_COST) {
      Alert.alert(
        'Not enough points',
        `You need ${CHESS_ENTRY_COST} points to start a Chess match.`,
      );
      return;
    }

    setChessEntryCharging(true);
    try {
      const updatedPoints = await applyPointsDelta(-CHESS_ENTRY_COST);
      setChessEntryModalOpen(false);
      router.push('/auth-flow');
      Alert.alert('Match started', `Entry fee charged: ${CHESS_ENTRY_COST} points.\nBalance: ${updatedPoints}`);
    } catch (error) {
      Alert.alert(
        'Unable to start match',
        error instanceof Error ? error.message : 'Point deduction failed.',
      );
    } finally {
      setChessEntryCharging(false);
    }
  }, [applyPointsDelta, chessEntryCharging, chessLoading, points]);

  return (
    <View style={styles.root}>
      <ArcadeBackground />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ArcadeHeader pixelLoaded={pixelLoaded} />
        <View style={styles.utilityRow}>
          <View style={styles.pointsCard}>
            <Text style={styles.pointsLabel}>POINTS</Text>
            {pointsLoading ? (
              <ActivityIndicator size="small" color={NEON_YELLOW} />
            ) : (
              <Text style={pixelLoaded ? styles.pointsValuePixel : styles.pointsValueFallback}>
                {points ?? '--'}
              </Text>
            )}
          </View>
          <View style={styles.utilityButtons}>
            <Pressable style={styles.utilityBtn} onPress={() => void fetchPoints()}>
              <MaterialCommunityIcons name="refresh" size={16} color={ELECTRIC_CYAN} />
              <Text style={styles.utilityBtnText}>REFRESH</Text>
            </Pressable>
            <Pressable style={styles.utilityBtn} onPress={() => openTradeDrawer('BUY')}>
              <MaterialCommunityIcons name="cart-outline" size={16} color={NEON_YELLOW} />
              <Text style={styles.utilityBtnText}>BUY</Text>
            </Pressable>
            <Pressable style={styles.utilityBtn} onPress={() => openTradeDrawer('SELL')}>
              <MaterialCommunityIcons name="cash-minus" size={16} color={HOT_PINK} />
              <Text style={styles.utilityBtnText}>SELL</Text>
            </Pressable>
          </View>
        </View>

        <ReactiveToggleRow
          value={reactiveOn}
          onChange={handleToggle}
          pixelLoaded={pixelLoaded}
        />

        <Text style={pixelLoaded ? styles.sectionPixel : styles.sectionFallback}>
          GAME LIBRARY
        </Text>
        <Text style={styles.sectionHint}>Pick your cabinet.</Text>

        {reactiveOn && (() => {
          const profileEmail =
            (typeof reactiveProfile?.email === 'string' ? (reactiveProfile.email as string) : null) ??
            reactiveVorldUser?.email ??
            email ??
            '--';
          const twitchHandleMatch = twitch.trim().match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
          const twitchHandle = twitchHandleMatch ? `@${twitchHandleMatch[1]}` : (twitch || '--');
          return (
            <View>
              <View style={styles.reactiveStatusStrip}>
                <View style={styles.reactiveStatusDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reactiveStatusText}>REACTIVE LIVE</Text>
                  <Text style={styles.reactiveStatusSub}>
                    Viewers can drop pixel-events into your matches.
                  </Text>
                </View>
                <MaterialCommunityIcons name="twitch" size={18} color={HOT_PINK} />
              </View>
              <View style={styles.reactiveProfileCard}>
                <View style={styles.reactiveProfileRow}>
                  <MaterialCommunityIcons name="email-outline" size={14} color={ELECTRIC_CYAN} />
                  <Text style={styles.reactiveProfileLabel}>EMAIL</Text>
                  <Text style={styles.reactiveProfileValue} numberOfLines={1}>
                    {profileEmail}
                  </Text>
                </View>
                <View style={styles.reactiveProfileRow}>
                  <MaterialCommunityIcons name="twitch" size={14} color={HOT_PINK} />
                  <Text style={styles.reactiveProfileLabel}>TWITCH</Text>
                  <Text style={styles.reactiveProfileValue} numberOfLines={1}>
                    {twitchHandle}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}

        <View style={styles.grid}>
          <GameCard
            title="CHESS"
            subtitle={reactiveOn ? `STRATEGY · REACTIVE · ${CHESS_ENTRY_COST} PTS` : `STRATEGY · LIVE · ${CHESS_ENTRY_COST} PTS`}
            borderColor={GOLD}
            glowColor={GOLD}
            illustration={<ChessIllustration />}
            pixelLoaded={pixelLoaded}
            onPress={() => void handleChessPress()}
            reactiveActive={reactiveOn}
          />
          <GameCard
            title="TIC TAC TOE"
            subtitle={reactiveOn ? 'CLASSIC · REACTIVE' : 'CLASSIC · LIVE'}
            borderColor={NEON_BLUE}
            glowColor={NEON_BLUE}
            illustration={<TttIllustration />}
            pixelLoaded={pixelLoaded}
            reactiveActive={reactiveOn}
          />
          <GameCard
            title="SNAKE"
            subtitle="ARCADE · LOCKED"
            borderColor="#3a3a3a"
            glowColor="#3a3a3a"
            illustration={<ComingSoonIllustration icon="snake" />}
            locked
            pixelLoaded={pixelLoaded}
          />
          <GameCard
            title="PONG"
            subtitle="ARCADE · LOCKED"
            borderColor="#3a3a3a"
            glowColor="#3a3a3a"
            illustration={<ComingSoonIllustration icon="table-tennis" />}
            locked
            pixelLoaded={pixelLoaded}
          />
          <GameCard
            title="TETRIS"
            subtitle="ARCADE · LOCKED"
            borderColor="#3a3a3a"
            glowColor="#3a3a3a"
            illustration={<ComingSoonIllustration icon="grid" />}
            locked
            pixelLoaded={pixelLoaded}
          />
        </View>
      </ScrollView>

      <ReactivePanel
        visible={panelVisible}
        step={step}
        onStepChange={setStep}
        onClose={handleClosePanel}
        email={email}
        setEmail={setEmail}
        otp={otp}
        setOtp={setOtp}
        twitch={twitch}
        setTwitch={setTwitch}
        pixelLoaded={pixelLoaded}
        busy={reactiveBusy}
        errorText={reactiveError}
        twitchValid={twitchValid}
        onSendOtp={() => void handleSendOtp()}
        onVerifyOtp={() => void handleVerifyOtp()}
        onLinkAccount={() => void handleLinkAccount()}
      />

      {reactiveDisableModalOpen && (
        <View style={styles.overlayBlocker} pointerEvents="box-none">
          <View style={styles.chessLoaderOverlay}>
            <View style={styles.reactiveDisableCard}>
              <MaterialCommunityIcons name="alert-octagram-outline" size={42} color={HOT_PINK} />
              <Text style={styles.reactiveDisableTitle}>DISABLE REACTIVE?</Text>
              <Text style={styles.reactiveDisableHint}>
                Your Vorld access token and account will be cleared from this device.{"\n"}
                Stream URL will be remembered for next time.
              </Text>
              <View style={styles.chessEntryButtons}>
                <Pressable
                  style={[styles.chessEntryBtn, styles.chessEntryCancelBtn]}
                  onPress={handleCancelDisableReactive}
                  disabled={reactiveBusy}
                >
                  <Text style={styles.chessEntryCancelText}>CANCEL</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.chessEntryBtn,
                    styles.reactiveDisableConfirmBtn,
                    reactiveBusy && styles.utilityBtnDisabled,
                  ]}
                  onPress={() => void handleConfirmDisableReactive()}
                  disabled={reactiveBusy}
                >
                  {reactiveBusy ? (
                    <ActivityIndicator size="small" color={HOT_PINK} />
                  ) : (
                    <Text style={styles.reactiveDisableConfirmText}>DISABLE</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {(tradeDrawerOpen || chessLoading || chessEntryModalOpen) && (
        <View style={styles.overlayBlocker} pointerEvents="box-none">
          {tradeDrawerOpen && (
            <>
              <Pressable style={styles.drawerBackdrop} onPress={closeTradeDrawer} />
              <Animated.View
                style={[
                  styles.tradeSheet,
                  {
                    transform: [{ translateY: tradeSheetY }],
                    paddingTop: insets.top + 10,
                    paddingBottom: insets.bottom + 18,
                  },
                ]}
              >
                <View style={styles.sheetHeader}>
                  <Pressable onPress={closeTradeDrawer} style={styles.drawerBackBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={18} color={ELECTRIC_CYAN} />
                    <Text style={styles.drawerBackText}>BACK</Text>
                  </Pressable>
                  <Text style={pixelLoaded ? styles.sheetTitlePixel : styles.sheetTitleFallback}>
                    {tradeMode} TERMINAL
                  </Text>
                  <View style={styles.drawerBackBtn} />
                </View>
                <View style={styles.sheetBody}>
                  {tradeStage === 'review' && (
                    <>
                      <MaterialCommunityIcons
                        name={tradeMode === 'BUY' ? 'cart-plus' : 'cash-minus'}
                        size={50}
                        color={tradeMode === 'BUY' ? NEON_YELLOW : HOT_PINK}
                      />
                      <Text style={styles.sheetMainTitle}>
                        {tradeMode === 'BUY' ? `BUY ${TRADE_POINTS} POINTS` : `SELL ${TRADE_POINTS} POINTS`}
                      </Text>
                      <Text style={styles.sheetHint}>
                        {tradeMode === 'BUY'
                          ? `${TRADE_SOL} SOL -> ${TRADE_POINTS} points`
                          : `${TRADE_POINTS} points -> ${TRADE_SOL} SOL`}
                      </Text>
                      <View style={styles.drawerStatBox}>
                        <Text style={styles.drawerStatLabel}>CURRENT POINTS</Text>
                        {pointsLoading ? (
                          <ActivityIndicator size="small" color={NEON_YELLOW} />
                        ) : (
                          <Text style={styles.drawerStatValue}>{points ?? '--'}</Text>
                        )}
                      </View>
                      <View style={styles.flowRow}>
                        <Text style={styles.flowLabel}>FROM</Text>
                        <Text style={styles.flowValue}>
                          {tradeMode === 'BUY'
                            ? (solanaWallet.wallets?.[0]?.address ?? 'Your Wallet')
                            : 'Treasury Wallet'}
                        </Text>
                      </View>
                      <View style={styles.flowRow}>
                        <Text style={styles.flowLabel}>TO</Text>
                        <Text style={styles.flowValue}>
                          {tradeMode === 'BUY'
                            ? `${TREASURY_WALLET.slice(0, 8)}...${TREASURY_WALLET.slice(-8)}`
                            : (solanaWallet.wallets?.[0]?.address ?? 'Your Wallet')}
                        </Text>
                      </View>
                      <View style={styles.swipeSection}>
                        <Text style={styles.swipeLabelOutside}>Swipe to approve</Text>
                        <View style={styles.swipeTrack}>
                          {swipeFillPx > 0 ? <View style={[styles.swipeFill, { width: swipeFillPx }]} /> : null}
                          <Animated.View
                            style={[
                              styles.swipeKnob,
                              tradeSwipeActive && styles.swipeKnobActive,
                              { transform: [{ translateX: swipeX }] },
                            ]}
                            {...swipeResponder.panHandlers}
                          >
                            <MaterialCommunityIcons name="swap-horizontal" size={22} color={BG} />
                          </Animated.View>
                        </View>
                      </View>
                    </>
                  )}

                  {tradeStage === 'processing' && (
                    <>
                      <ActivityIndicator size="large" color={ELECTRIC_CYAN} />
                      <Text style={styles.sheetMainTitle}>PROCESSING TRANSACTION</Text>
                      <Text style={styles.sheetHint}>{tradeStatusText ?? 'Preparing request...'}</Text>
                      <View style={styles.flowRow}>
                        <Text style={styles.flowLabel}>FROM</Text>
                        <Text style={styles.flowValue}>{tradeFlowFrom}</Text>
                      </View>
                      <View style={styles.flowRow}>
                        <Text style={styles.flowLabel}>TO</Text>
                        <Text style={styles.flowValue}>{tradeFlowTo}</Text>
                      </View>
                    </>
                  )}

                  {tradeStage === 'success' && (
                    <>
                      <View style={styles.successCircle}>
                        <MaterialCommunityIcons name="check" size={42} color="#22c55e" />
                      </View>
                      <Text style={styles.successTitle}>SUCCESS</Text>
                      <Text style={styles.sheetHint}>{tradeResultText}</Text>
                      <View style={styles.flowRow}>
                        <Text style={styles.flowLabel}>FROM</Text>
                        <Text style={styles.flowValue}>{tradeFlowFrom}</Text>
                      </View>
                      <View style={styles.flowRow}>
                        <Text style={styles.flowLabel}>TO</Text>
                        <Text style={styles.flowValue}>{tradeFlowTo}</Text>
                      </View>
                      <Pressable style={styles.doneBtn} onPress={closeTradeDrawer}>
                        <Text style={styles.doneBtnText}>DONE</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </Animated.View>
            </>
          )}
          {chessLoading && (
            <View style={styles.chessLoaderOverlay}>
              <View style={styles.chessLoaderCard}>
                <ActivityIndicator size="large" color={NEON_YELLOW} />
                <Text style={styles.chessLoaderTitle}>PREPARING CHESS ARENA...</Text>
              </View>
            </View>
          )}
          {chessEntryModalOpen && (
            <View style={styles.chessLoaderOverlay}>
              <View style={styles.chessEntryModalCard}>
                <MaterialCommunityIcons name="chess-king" size={42} color={NEON_YELLOW} />
                <Text style={styles.chessEntryTitle}>START CHESS MATCH?</Text>
                <Text style={styles.chessEntryHint}>
                  This match costs {CHESS_ENTRY_COST} points.
                </Text>
                <Text style={styles.chessEntryBalance}>
                  Current balance: {pointsLoading ? '...' : points ?? '--'} points
                </Text>
                <View style={styles.chessEntryButtons}>
                  <Pressable
                    style={[styles.chessEntryBtn, styles.chessEntryCancelBtn]}
                    onPress={() => setChessEntryModalOpen(false)}
                    disabled={chessEntryCharging}
                  >
                    <Text style={styles.chessEntryCancelText}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chessEntryBtn, styles.chessEntryPlayBtn, chessEntryCharging && styles.utilityBtnDisabled]}
                    onPress={() => void handleChessEntryConfirm()}
                    disabled={chessEntryCharging}
                  >
                    {chessEntryCharging ? (
                      <ActivityIndicator size="small" color={NEON_YELLOW} />
                    ) : (
                      <Text style={styles.chessEntryPlayText}>PLAY ({CHESS_ENTRY_COST})</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default ArcadeCenterScreen;

// ─── Styles ──────────────────────────────────────────────────────────────────

const bgStyles = StyleSheet.create({
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  glowBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
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

const headerStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  preRunes: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(229, 229, 229, 0.45)',
    letterSpacing: 6,
  },
  postRunes: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: 'rgba(212, 212, 212, 0.4)',
    letterSpacing: 5,
    marginTop: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineEnd: {
    width: 32,
    height: 3,
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  titlePixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 28,
    color: NEON_YELLOW,
    letterSpacing: 2,
    textShadowColor: NEON_YELLOW,
    textShadowOffset: { width: 0, height: 0 },
  },
  titleFallback: {
    fontWeight: '900',
    fontSize: 32,
    color: NEON_YELLOW,
    letterSpacing: 6,
    textShadowColor: NEON_YELLOW,
    textShadowOffset: { width: 0, height: 0 },
  },
  bracket: {
    color: ELECTRIC_CYAN,
    fontSize: 18,
    textShadowColor: ELECTRIC_CYAN,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  subPixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 18,
    color: ELECTRIC_CYAN,
    letterSpacing: 2,
    textShadowColor: ELECTRIC_CYAN,
    textShadowOffset: { width: 0, height: 0 },
  },
  subFallback: {
    fontWeight: '900',
    fontSize: 22,
    color: ELECTRIC_CYAN,
    letterSpacing: 6,
    textShadowColor: ELECTRIC_CYAN,
    textShadowOffset: { width: 0, height: 0 },
  },
});

const toggleStyles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    marginBottom: 22,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(12, 12, 12, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 0, 110, 0.55)',
    borderRadius: 8,
    shadowColor: HOT_PINK,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  cornerTL: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: HOT_PINK,
  },
  cornerTR: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: HOT_PINK,
  },
  cornerBL: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: 10,
    height: 10,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: HOT_PINK,
  },
  cornerBR: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: HOT_PINK,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  labelPixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 11,
    color: INK,
    letterSpacing: 1.5,
    lineHeight: 18,
  },
  labelFallback: {
    fontWeight: '900',
    fontSize: 14,
    color: INK,
    letterSpacing: 3,
  },
  hint: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: DIM,
    marginTop: 6,
    letterSpacing: 0.5,
  },
});

const tileStyles = StyleSheet.create({
  chessBoardWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chessBoard: {
    width: 80,
    height: 80,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 2,
    borderColor: GOLD,
  },
  chessCell: {
    width: 19,
    height: 19,
  },
  chessKing: {
    position: 'absolute',
    fontSize: 28,
    color: '#1a1a1a',
    top: 14,
    left: 12,
  },
  chessQueen: {
    position: 'absolute',
    fontSize: 26,
    color: IVORY,
    bottom: 12,
    right: 14,
    textShadowColor: '#000',
    textShadowRadius: 2,
    textShadowOffset: { width: 1, height: 1 },
  },
  tttWrap: {
    width: 88,
    height: 88,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 2,
    borderColor: NEON_BLUE,
  },
  tttCell: {
    width: '33.33%',
    height: '33.33%',
    borderWidth: 0.7,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tttMark: {
    fontFamily: PIXEL_FONT,
    fontSize: 13,
    fontWeight: '900',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  lockedWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(20, 20, 20, 0.6)',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: NEON_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const cardStyles = StyleSheet.create({
  pressableWrap: {
    width: '48%',
  },
  outer: {
    backgroundColor: 'rgba(10, 10, 10, 0.92)',
    borderWidth: 2,
    borderRadius: 8,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 14,
    minHeight: 178,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  outerLocked: {
    opacity: 0.6,
  },
  outerPressed: {
    transform: [{ scale: 0.98 }, { translateY: 2 }],
    opacity: 0.92,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    opacity: 0.55,
  },
  illuArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  titleArea: {
    alignItems: 'center',
    marginTop: 10,
  },
  titlePixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 11,
    color: INK,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  titleFallback: {
    fontWeight: '900',
    fontSize: 14,
    color: INK,
    letterSpacing: 3,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 9,
    color: DIM,
    marginTop: 6,
    letterSpacing: 1.2,
  },
  comingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: NEON_YELLOW,
    borderRadius: 3,
  },
  comingPixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 7,
    color: NEON_YELLOW,
    letterSpacing: 1,
  },
  comingFallback: {
    fontWeight: '900',
    fontSize: 9,
    color: NEON_YELLOW,
    letterSpacing: 2,
  },
});

const panelStyles = StyleSheet.create({
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  backBtn: {
    minWidth: 70,
  },
  backInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontFamily: PIXEL_FONT,
    fontSize: 9,
    color: ELECTRIC_CYAN,
    letterSpacing: 1.5,
  },
  headerTitlePixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 12,
    color: HOT_PINK,
    letterSpacing: 2,
    textShadowColor: HOT_PINK,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  headerTitleFallback: {
    fontWeight: '900',
    fontSize: 14,
    color: HOT_PINK,
    letterSpacing: 4,
    textShadowColor: HOT_PINK,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  stepDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  stepDotActive: {
    backgroundColor: ELECTRIC_CYAN,
  },
  stepDotCurrent: {
    shadowColor: ELECTRIC_CYAN,
    shadowOpacity: 0.95,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  stepsClipper: {
    flex: 1,
    overflow: 'hidden',
  },
  stepsTrack: {
    flexDirection: 'row',
    width: SCREEN_WIDTH * 3,
    flex: 1,
  },
  stepPage: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  stepIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 15, 15, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    marginBottom: 14,
  },
  stepTitlePixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 13,
    color: INK,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
  },
  stepTitleFallback: {
    fontWeight: '900',
    fontSize: 16,
    color: INK,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 8,
  },
  stepBody: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: DIM,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 22,
  },
  fieldLabel: {
    fontFamily: PIXEL_FONT,
    fontSize: 9,
    color: ELECTRIC_CYAN,
    letterSpacing: 2,
    marginBottom: 8,
  },
  textInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(12, 12, 12, 0.9)',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: INK,
    letterSpacing: 1,
  },
  codeInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(12, 12, 12, 0.9)',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontSize: 22,
    color: INK,
    letterSpacing: 10,
    textAlign: 'center',
    shadowColor: NEON_YELLOW,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  codeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  codeDotFilled: {
    backgroundColor: NEON_YELLOW,
    borderColor: NEON_YELLOW,
    shadowColor: NEON_YELLOW,
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaWrap: {
    marginTop: 20,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: 'rgba(20, 20, 20, 0.96)',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  ctaPressed: {
    transform: [{ translateY: 2 }, { scale: 0.99 }],
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaLabelPixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 11,
    color: '#fff',
    letterSpacing: 2,
  },
  ctaLabelFallback: {
    fontWeight: '900',
    fontSize: 14,
    color: '#fff',
    letterSpacing: 3,
  },
  errorText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: NEON_RED,
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  hintMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: MUTED,
    fontSize: 10,
    marginTop: 8,
    letterSpacing: 0.4,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 4,
  },
  sectionPixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 11,
    color: NEON_YELLOW,
    letterSpacing: 2,
    marginTop: 4,
  },
  sectionFallback: {
    fontWeight: '900',
    fontSize: 14,
    color: NEON_YELLOW,
    letterSpacing: 4,
    marginTop: 4,
  },
  sectionHint: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: DIM,
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    rowGap: 12,
  },
  utilityRow: {
    marginBottom: 14,
    gap: 10,
  },
  pointsCard: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,230,0,0.35)',
    borderRadius: 8,
    backgroundColor: 'rgba(8,8,8,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  pointsLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 11,
    letterSpacing: 2,
  },
  pointsValuePixel: {
    fontFamily: PIXEL_FONT,
    color: NEON_YELLOW,
    fontSize: 20,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(255,230,0,0.4)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  pointsValueFallback: {
    fontWeight: '900',
    color: NEON_YELLOW,
    fontSize: 24,
    letterSpacing: 3,
  },
  utilityButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  utilityBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(12,12,12,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  utilityBtnText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: INK,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  overlayBlocker: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tradeSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(7,7,7,0.98)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(0,245,255,0.35)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: SCREEN_HEIGHT,
    paddingHorizontal: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  drawerBackBtn: {
    minWidth: 70,
    minHeight: 34,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.35)',
    backgroundColor: 'rgba(0,245,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  drawerBackText: {
    color: ELECTRIC_CYAN,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    letterSpacing: 1,
  },
  sheetTitlePixel: {
    fontFamily: PIXEL_FONT,
    fontSize: 11,
    color: NEON_YELLOW,
    letterSpacing: 1.4,
  },
  sheetTitleFallback: {
    fontWeight: '900',
    fontSize: 14,
    color: NEON_YELLOW,
    letterSpacing: 2.4,
  },
  sheetBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    backgroundColor: 'rgba(12,12,12,0.8)',
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: ELECTRIC_CYAN,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  sheetMainTitle: {
    color: INK,
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  sheetHint: {
    color: DIM,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  utilityBtnDisabled: {
    opacity: 0.45,
  },
  drawerStatBox: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(5,5,5,0.75)',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
    marginTop: 2,
  },
  drawerStatLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.4,
  },
  drawerStatValue: {
    color: NEON_YELLOW,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  drawerStatusRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  drawerStatusText: {
    color: ELECTRIC_CYAN,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  drawerActionBtn: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: 'rgba(12,12,12,0.95)',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  drawerActionBtnBuy: {
    borderColor: 'rgba(255,230,0,0.42)',
  },
  drawerActionBtnSell: {
    borderColor: 'rgba(255,0,110,0.45)',
  },
  drawerActionBtnText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '800',
  },
  flowRow: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 4,
  },
  flowLabel: {
    color: DIM,
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  flowValue: {
    color: ELECTRIC_CYAN,
    fontSize: 12,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  swipeSection: {
    width: '100%',
    marginTop: 'auto',
    marginBottom: 52,
    gap: 8,
  },
  swipeLabelOutside: {
    color: 'rgba(236,240,245,0.72)',
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.8,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  swipeTrack: {
    width: '100%',
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: 'rgba(0,245,255,0.45)',
    backgroundColor: 'rgba(5,8,10,0.95)',
    padding: 5,
    marginTop: 2,
    minHeight: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  swipeFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(34,197,94,0.22)',
    borderTopLeftRadius: 34,
    borderBottomLeftRadius: 34,
  },
  swipeKnob: {
    width: SWIPE_KNOB_SIZE,
    height: SWIPE_KNOB_SIZE,
    borderRadius: SWIPE_KNOB_SIZE / 2,
    backgroundColor: NEON_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON_YELLOW,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  swipeKnobActive: {
    shadowOpacity: 0.85,
    shadowRadius: 18,
    borderColor: 'rgba(0,245,255,0.95)',
    backgroundColor: '#fff176',
  },
  successCircle: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.1)',
    marginTop: 6,
  },
  successTitle: {
    color: '#22c55e',
    fontFamily: PIXEL_FONT,
    fontSize: 13,
    letterSpacing: 1.6,
  },
  doneBtn: {
    marginTop: 8,
    minWidth: 140,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#22c55e',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  chessLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  chessLoaderCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,230,0,0.3)',
    backgroundColor: 'rgba(10,10,10,0.95)',
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
  },
  chessLoaderTitle: {
    fontFamily: PIXEL_FONT,
    color: NEON_YELLOW,
    fontSize: 10,
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  chessEntryModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,230,0,0.35)',
    backgroundColor: 'rgba(8,8,8,0.97)',
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  chessEntryTitle: {
    fontFamily: PIXEL_FONT,
    color: NEON_YELLOW,
    fontSize: 11,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  chessEntryHint: {
    color: INK,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  chessEntryBalance: {
    color: DIM,
    fontSize: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chessEntryButtons: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  chessEntryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chessEntryCancelBtn: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chessEntryPlayBtn: {
    borderColor: 'rgba(255,230,0,0.38)',
    backgroundColor: 'rgba(255,230,0,0.08)',
  },
  chessEntryCancelText: {
    color: INK,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chessEntryPlayText: {
    color: NEON_YELLOW,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  reactiveDisableCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.5)',
    backgroundColor: 'rgba(8,8,8,0.97)',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
    shadowColor: HOT_PINK,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveDisableTitle: {
    fontFamily: PIXEL_FONT,
    color: HOT_PINK,
    fontSize: 12,
    letterSpacing: 1.4,
    textAlign: 'center',
    textShadowColor: HOT_PINK,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  reactiveDisableHint: {
    color: DIM,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  reactiveDisableConfirmBtn: {
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.12)',
  },
  reactiveDisableConfirmText: {
    color: HOT_PINK,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  reactiveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: HOT_PINK,
    borderRadius: 3,
    shadowColor: HOT_PINK,
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: HOT_PINK,
    shadowColor: HOT_PINK,
    shadowOpacity: 0.95,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveBadgeText: {
    fontFamily: PIXEL_FONT,
    fontSize: 7,
    color: HOT_PINK,
    letterSpacing: 1,
  },
  reactiveBadgeFallback: {
    fontWeight: '900',
    fontSize: 9,
    color: HOT_PINK,
    letterSpacing: 1,
  },
  reactiveStatusStrip: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.45)',
    backgroundColor: 'rgba(255,0,110,0.08)',
  },
  reactiveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HOT_PINK,
    shadowColor: HOT_PINK,
    shadowOpacity: 0.95,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveStatusText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: INK,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
  },
  reactiveStatusSub: {
    color: DIM,
    fontSize: 10,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  reactiveProfileCard: {
    marginTop: -2,
    marginBottom: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(8,8,8,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  reactiveProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reactiveProfileLabel: {
    fontFamily: PIXEL_FONT,
    fontSize: 8,
    color: ELECTRIC_CYAN,
    letterSpacing: 1.2,
    width: 56,
  },
  reactiveProfileValue: {
    flex: 1,
    color: INK,
    fontSize: 11,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
