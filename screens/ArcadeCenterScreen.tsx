import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
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
  const glitchTick = useRef(0);
  const [globalGlitch, setGlobalGlitch] = useState(0);

  useEffect(() => {
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

  return (
    <Pressable disabled={locked} onPress={onPress} style={cardStyles.pressableWrap}>
      {({ pressed }) => (
        <Animated.View
          style={[
            cardStyles.outer,
            {
              borderColor,
              shadowColor: glowColor,
              shadowOpacity: locked ? 0 : (shadowOpacity as unknown as number),
              shadowRadius: locked ? 0 : (shadowRadius as unknown as number),
            },
            locked && cardStyles.outerLocked,
            pressed && !locked && cardStyles.outerPressed,
          ]}
        >
          <View style={[cardStyles.stripe, { backgroundColor: borderColor }]} />
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
    if (!email.trim()) return;
    onStepChange(1);
  };
  const handleOtpNext = () => {
    if (otp.length < 4) return;
    onStepChange(2);
  };
  const handleLinkAccount = () => {
    if (!twitch.trim()) return;
    onClose();
  };

  const handleBack = () => {
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
                disabled={!email.trim()}
                onPress={handleEmailNext}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      panelStyles.cta,
                      { borderColor: ELECTRIC_CYAN, shadowColor: ELECTRIC_CYAN },
                      pressed && panelStyles.ctaPressed,
                      !email.trim() && panelStyles.ctaDisabled,
                    ]}
                  >
                    <Text style={pixelLoaded ? panelStyles.ctaLabelPixel : panelStyles.ctaLabelFallback}>
                      SEND CODE
                    </Text>
                    <MaterialCommunityIcons name="send-outline" size={16} color="#fff" />
                  </View>
                )}
              </Pressable>
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
                disabled={otp.length < 4}
                onPress={handleOtpNext}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      panelStyles.cta,
                      { borderColor: NEON_YELLOW, shadowColor: NEON_YELLOW },
                      pressed && panelStyles.ctaPressed,
                      otp.length < 4 && panelStyles.ctaDisabled,
                    ]}
                  >
                    <Text style={pixelLoaded ? panelStyles.ctaLabelPixel : panelStyles.ctaLabelFallback}>
                      VERIFY
                    </Text>
                    <MaterialCommunityIcons name="shield-check-outline" size={16} color="#fff" />
                  </View>
                )}
              </Pressable>
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
              <Text style={panelStyles.fieldLabel}>TWITCH USERNAME</Text>
              <TextInput
                style={panelStyles.textInput}
                value={twitch}
                onChangeText={setTwitch}
                placeholder="your_twitch_handle"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={panelStyles.ctaWrap}
                disabled={!twitch.trim()}
                onPress={handleLinkAccount}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      panelStyles.cta,
                      { borderColor: HOT_PINK, shadowColor: HOT_PINK },
                      pressed && panelStyles.ctaPressed,
                      !twitch.trim() && panelStyles.ctaDisabled,
                    ]}
                  >
                    <Text style={pixelLoaded ? panelStyles.ctaLabelPixel : panelStyles.ctaLabelFallback}>
                      LINK ACCOUNT
                    </Text>
                    <MaterialCommunityIcons name="link-variant" size={16} color="#fff" />
                  </View>
                )}
              </Pressable>
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

  const handleToggle = (next: boolean) => {
    setReactiveOn(next);
    if (next) {
      setStep(0);
      setPanelVisible(true);
    } else {
      setPanelVisible(false);
    }
  };

  const handleClosePanel = () => {
    setPanelVisible(false);
    setReactiveOn(false);
  };

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

        <ReactiveToggleRow
          value={reactiveOn}
          onChange={handleToggle}
          pixelLoaded={pixelLoaded}
        />

        <Text style={pixelLoaded ? styles.sectionPixel : styles.sectionFallback}>
          GAME LIBRARY
        </Text>
        <Text style={styles.sectionHint}>Pick your cabinet.</Text>

        <View style={styles.grid}>
          <GameCard
            title="CHESS"
            subtitle="STRATEGY · LIVE"
            borderColor={GOLD}
            glowColor={GOLD}
            illustration={<ChessIllustration />}
            pixelLoaded={pixelLoaded}
          />
          <GameCard
            title="TIC TAC TOE"
            subtitle="CLASSIC · LIVE"
            borderColor={NEON_BLUE}
            glowColor={NEON_BLUE}
            illustration={<TttIllustration />}
            pixelLoaded={pixelLoaded}
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
      />
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
});
