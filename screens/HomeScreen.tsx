import { usePrivy } from '@privy-io/expo';
import * as Font from 'expo-font';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { registerOrLogin } from '../api/authApi';

import { getPrivyEmail } from '../utils/privyUser';
import { saveStoredUser } from '../utils/storageHelper';

// ─── Font ─────────────────────────────────────────────────────────────────────
const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG      = '#050505';
const BG_MID  = '#0e0e0e';
const SURFACE = '#0a0a0a';
const HAIRLINE = 'rgba(255,255,255,0.08)';
const HAIRLINE_HI = 'rgba(255,255,255,0.14)';
const AMBER   = '#FFB800';
const AMBER_D = '#b38200';
const AMBER_DIM = 'rgba(255,184,0,0.55)';
const PURPLE  = '#9B30FF';
const TEAL    = '#00FFC2';
const TEAL_DIM = 'rgba(0,255,194,0.55)';
const DIM     = '#6b7280';
const DIM_HI  = '#9ca3af';
const INK     = '#f5f5f5';
const MAG_D   = '#c026d3';
const CRT_TINT  = 'rgba(255,255,255,0.04)';
const VIGNETTE  = 'rgba(0,0,0,0.25)';

// ─── Runic background (exact match to PrivyAuthScreen) ───────────────────────
const RUNE_MAP: Record<string, string> = {
  W: 'ᚹ', E: 'ᛖ', L: 'ᛚ', C: 'ᚲ', O: 'ᛟ', M: 'ᛗ',
  T: 'ᛏ', I: 'ᛁ', R: 'ᚱ', F: 'ᚠ', B: 'ᛒ', S: 'ᛊ',
  A: 'ᚨ', U: 'ᚢ', H: 'ᚺ', P: 'ᛈ', N: 'ᚾ', ' ': '  ',
};
const WELCOME_RUNES = 'WELCOME TO EMPIRE OF BITS'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');
const RUNE_LINE = `${WELCOME_RUNES}   ᛉ   ${WELCOME_RUNES}   ✦   ${WELCOME_RUNES}   ᚷ   `;
const GLITCH_CHARS = ['ᚦ', 'ᚾ', 'ᛃ', 'ᛇ', 'ᛚ', 'ᛜ', 'ᛞ', '░', '▒', '▓', '█', '╬', '╫', '║'];
const GLITCH_COLORS = [
  '#f5f5f5', '#d4d4d4', '#b5b5b5', '#8e8e8e',
  '#c9c9c9', '#ababab', '#ffffff', '#6f6f6f',
];
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

function GlitchRuneRow({ cfg, globalGlitch }: { cfg: typeof ROW_CONFIGS[0]; globalGlitch: number }) {
  const opacityAnim = useRef(new Animated.Value(cfg.baseOpacity)).current;
  const colorIndex  = useRef(0);
  const [color, setColor]             = useState(GLITCH_COLORS[0]);
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
    <View style={[bg.row, { marginLeft: cfg.offset }]}>
      <Animated.Text
        style={[bg.runeText, { opacity: opacityAnim, fontSize: cfg.size, color }]}
        numberOfLines={1}
      >
        {glitchedLine}
      </Animated.Text>
    </View>
  );
}

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
    <View pointerEvents="none" style={bg.container}>
      <View pointerEvents="none" style={bg.gradientWash} />
      <View pointerEvents="none" style={bg.glowTop} />
      <View pointerEvents="none" style={bg.glowBottom} />
      <View pointerEvents="none" style={bg.vignette} />
      <View pointerEvents="none" style={bg.scanOverlay} />
      <View pointerEvents="none" style={bg.gridColWrap}>
        {Array.from({ length: GRID_LINE_COUNT }).map((_, i) => (
          <View key={i} style={bg.gridVLine} />
        ))}
      </View>
      {ROW_CONFIGS.map((cfg, i) => (
        <GlitchRuneRow key={i} cfg={cfg} globalGlitch={globalGlitch} />
      ))}
    </View>
  );
}

// ─── Player email (reads Privy user, shows email only) ────────────────────────
function PlayerEmail() {
  const { user, isReady } = usePrivy();
  if (!isReady || !user) return null;
  const email = getPrivyEmail(user);
  if (!email) return null;
  return (
    <Text style={s.emailText} numberOfLines={1}>
      {email}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user: privyUser, isReady: privyReady } = usePrivy();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [isCongratsModalVisible, setIsCongratsModalVisible] = useState(false);
  const [newUserPoints, setNewUserPoints] = useState<number>(0);

  // Entrance animation values
  const logoAnim  = useRef(new Animated.Value(0)).current;
  const rankAnim  = useRef(new Animated.Value(0)).current;
  const ctaAnim   = useRef(new Animated.Value(0)).current;
  const hasAttemptedAutoAuth = useRef(false);

  // CTA idle scale pulse
  const ctaScale = useRef(new Animated.Value(1)).current;

  // Online dot pulse
  const onlinePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Font.loadAsync({ PressStart2P: PRESS_START_2P_URI })
      .catch(() => null)
      .finally(() => setFontsLoaded(true));
  }, []);

  // Staggered entrance
  useEffect(() => {
    if (!fontsLoaded) return;
    Animated.stagger(140, [
      Animated.spring(logoAnim, { toValue: 1, tension: 55, friction: 10, useNativeDriver: true }),
      Animated.spring(rankAnim, { toValue: 1, tension: 55, friction: 10, useNativeDriver: true }),
      Animated.spring(ctaAnim,  { toValue: 1, tension: 55, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fontsLoaded]);

  // CTA scale pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaScale, { toValue: 1.03, duration: 1000, useNativeDriver: true }),
        Animated.timing(ctaScale, { toValue: 1,    duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Online dot pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(onlinePulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(onlinePulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!privyReady || !privyUser || hasAttemptedAutoAuth.current) return;
    const email = getPrivyEmail(privyUser);
    if (!email) return;

    hasAttemptedAutoAuth.current = true;
    const localPart = email.split('@')[0] || 'Player';
    const cleanedName = localPart.replace(/[^a-zA-Z0-9]/g, '');
    const baseName = cleanedName.length >= 3 ? cleanedName : 'Player';
    const name = baseName.slice(0, 20);

    const syncAuth = async () => {
      setAuthLoading(true);
      try {
        const result = await registerOrLogin({
          email,
          name,
          password: 'test1234@',
        });
        await saveStoredUser(result.user);
        if (result.isNewUser) {
          setNewUserPoints(result.points);
          setIsCongratsModalVisible(true);
        }
      } catch (error) {
        console.log('Home auto auth failed:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    void syncAuth();
  }, [privyReady, privyUser]);

  if (!fontsLoaded) return null;

  const fadeSlide = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{
      translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }),
    }],
  });

  const onlineDotOpacity = onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <View style={s.root}>
      <RunicBackground />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── TOP STATUS BAR ────────────────────────────────────── */}
        <View style={s.topBar}>
          <View style={s.brandChip}>
            <View style={s.brandGlyphBox}>
              <Text style={s.brandGlyph}>◈</Text>
            </View>
            <View>
              <Text style={s.brandTag}>EMPIRE</Text>
              <Text style={s.brandSub}>arcade · onchain</Text>
            </View>
          </View>
          <View style={s.statusChip}>
            <Animated.View style={[s.statusDot, { opacity: onlineDotOpacity }]} />
            <Text style={s.statusText}>ONLINE</Text>
          </View>
        </View>

        {/* ── HERO ──────────────────────────────────────────────── */}
        <Animated.View style={[s.hero, fadeSlide(logoAnim)]}>
          <View style={s.logoStage}>
            <View style={s.logoOuterGlow} />
            <View style={s.logoInnerGlow} />
            <View style={s.logoFrame}>
              <Image
                source={require('../assets/images/empire.jpg')}
                style={s.logoImage}
                contentFit="cover"
              />
              <View style={[s.logoCorner, s.logoCornerTL]} />
              <View style={[s.logoCorner, s.logoCornerTR]} />
              <View style={[s.logoCorner, s.logoCornerBL]} />
              <View style={[s.logoCorner, s.logoCornerBR]} />
            </View>
          </View>

          
          <Text style={s.tagline}>WHERE EVERY GAME MATTERS</Text>
        </Animated.View>

        {/* ── PLAYER PROFILE CARD ───────────────────────────────── */}
        <Animated.View style={[s.playerCard, fadeSlide(rankAnim)]}>
          <View style={[s.bracket, s.bracketTL]} />
          <View style={[s.bracket, s.bracketTR]} />
          <View style={[s.bracket, s.bracketBL]} />
          <View style={[s.bracket, s.bracketBR]} />

          <View style={s.playerHead}>
            <View style={s.playerBadge}>
              <View style={s.playerBadgeDot} />
              <Text style={s.playerBadgeText}>PLAYER PROFILE</Text>
            </View>
            <Text style={s.versionTag}>v1.0</Text>
          </View>

          <View style={s.statRow}>
            <View style={s.statCol}>
              <Text style={s.statLabel}>RANK</Text>
              <Text style={s.statRank}>ROOKIE</Text>
            </View>
            <View style={s.statSep} />
            <View style={s.statCol}>
              <Text style={s.statLabel}>LEVEL</Text>
              <View style={s.lvlValueRow}>
                <Text style={s.statLvl}>01</Text>
                <View style={s.lvlBars}>
                  <View style={[s.lvlBlock, s.lvlBlockOn]} />
                  <View style={s.lvlBlock} />
                  <View style={s.lvlBlock} />
                  <View style={s.lvlBlock} />
                </View>
              </View>
            </View>
          </View>

          <View style={s.playerDivider} />

          <View style={s.emailRow}>
            <View style={s.emailGlyph}>
              <Text style={s.emailGlyphText}>✉</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.emailLabel}>SIGNED IN</Text>
              <PlayerEmail />
            </View>
          </View>
        </Animated.View>

        {/* ── ARCADE CTA CARD ───────────────────────────────────── */}
        <Animated.View
          style={[
            s.ctaWrap,
            {
              opacity: ctaAnim,
              transform: [
                { translateY: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) },
                { scale: ctaScale },
              ],
            },
          ]}
        >
          <View style={s.ctaCard}>
            <View style={s.ctaCardGlow} />
            <View style={[s.bracket, s.bracketAmberTL]} />
            <View style={[s.bracket, s.bracketAmberTR]} />
            <View style={[s.bracket, s.bracketAmberBL]} />
            <View style={[s.bracket, s.bracketAmberBR]} />

            <View style={s.ctaHeaderRow}>
              <View style={s.readyChip}>
                <View style={s.readyDot} />
                <Text style={s.readyText}>ARCADE READY</Text>
              </View>
              <Text style={s.ctaCoinTag}>◎ ENTER</Text>
            </View>

            <Text style={s.ctaSubtitle}>Step into the arena</Text>

            <View style={s.ctaGlowWrap}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/(tabs)/play');
                }}
                style={({ pressed }) => [s.ctaBtn, pressed && s.ctaPressed]}
                android_ripple={{ color: 'rgba(0,0,0,0.2)' }}
              >
                <View style={s.ctaBtnInner}>
                  <View style={s.ctaArrowBox}>
                    <Text style={s.ctaArrow}>▶</Text>
                  </View>
                  <Text style={s.ctaText}>PLAY NOW</Text>
                </View>
              </Pressable>
            </View>

            <View style={s.tagRow}>
              <Text style={s.tagItem}>STRATEGY</Text>
              <View style={s.tagBullet} />
              <Text style={s.tagItem}>CLASSIC</Text>
              <View style={s.tagBullet} />
              <Text style={s.tagItem}>LIVE</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.chainPill}>
            <Text style={s.chainGlyph}>◎</Text>
            <Text style={s.chainLabel}>SOLANA</Text>
            <View style={s.chainSep} />
            <Text style={s.chainNet}>DEVNET</Text>
          </View>
          <Text style={s.footerText}>
            <Text style={{ color: PURPLE }}>Powered </Text>
            <Text style={{ color: TEAL }}>by </Text>
            <Text style={{ color: AMBER }}>Solana</Text>
          </Text>
        </View>

      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isCongratsModalVisible}
        onRequestClose={() => setIsCongratsModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={[s.bracket, s.bracketAmberTL]} />
            <View style={[s.bracket, s.bracketAmberTR]} />
            <View style={[s.bracket, s.bracketAmberBL]} />
            <View style={[s.bracket, s.bracketAmberBR]} />
            <Text style={s.modalBadge}>◆ NEW CHAMPION UNLOCKED ◆</Text>
            <Text style={s.modalTitle}>CONGRATULATIONS!</Text>
            <Text style={s.modalSubTitle}>Your Empire of Bits profile is ready.</Text>
            <View style={s.pointsWrap}>
              <Text style={s.pointsLabel}>STARTING POINTS</Text>
              <Text style={s.pointsValue}>{newUserPoints}</Text>
              <View style={s.pointsLineRow}>
                <View style={s.pointsLine} />
                <Text style={s.pointsLineText}>READY</Text>
                <View style={s.pointsLine} />
              </View>
            </View>
            <Pressable
              onPress={() => setIsCongratsModalVisible(false)}
              style={({ pressed }) => [s.modalBtn, pressed && s.modalBtnPressed]}
            >
              <Text style={s.modalBtnText}>▶  LET'S PLAY</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {authLoading ? (
        <View style={s.loaderOverlay} pointerEvents="auto">
          <View style={s.loaderCard}>
            <View style={[s.bracket, s.bracketAmberTL]} />
            <View style={[s.bracket, s.bracketAmberTR]} />
            <View style={[s.bracket, s.bracketAmberBL]} />
            <View style={[s.bracket, s.bracketAmberBR]} />
            <ActivityIndicator size="large" color={AMBER} />
            <Text style={s.loaderTitle}>SYNCING PLAYER PROFILE...</Text>
            <Text style={s.loaderSubtitle}>Preparing your Empire account</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Background styles (exact PrivyAuthScreen match) ─────────────────────────
const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const bg = StyleSheet.create({
  container: {
    ...FILL,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 6,
    backgroundColor: BG,
  },
  gradientWash: {
    ...FILL,
    backgroundColor: BG_MID,
  },
  glowTop: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glowBottom: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  vignette: {
    ...FILL,
    backgroundColor: VIGNETTE,
    opacity: 0.35,
  },
  scanOverlay: {
    ...FILL,
    backgroundColor: CRT_TINT,
  },
  gridColWrap: {
    ...FILL,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
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

// ─── Screen styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 60,
    gap: 22,
  },

  // ── TOP STATUS BAR
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandGlyphBox: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: AMBER_DIM,
    backgroundColor: 'rgba(15,12,5,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandGlyph: {
    color: AMBER,
    fontSize: 14,
    fontWeight: '900',
  },
  brandTag: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  brandSub: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 1,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,255,194,0.30)',
    backgroundColor: 'rgba(0,255,194,0.06)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: TEAL,
  },
  statusText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: TEAL,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },

  // ── HERO
  hero: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 6,
  },
  logoStage: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  logoOuterGlow: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 999,
    backgroundColor: 'rgba(255,184,0,0.10)',
  },
  logoInnerGlow: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 999,
    backgroundColor: 'rgba(255,184,0,0.18)',
  },
  logoFrame: {
    width: 116,
    height: 116,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: AMBER_DIM,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoCorner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: AMBER,
  },
  logoCornerTL: { top: -3, left: -3, borderTopWidth: 2, borderLeftWidth: 2 },
  logoCornerTR: { top: -3, right: -3, borderTopWidth: 2, borderRightWidth: 2 },
  logoCornerBL: { bottom: -3, left: -3, borderBottomWidth: 2, borderLeftWidth: 2 },
  logoCornerBR: { bottom: -3, right: -3, borderBottomWidth: 2, borderRightWidth: 2 },

  titleStack: {
    alignItems: 'center',
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleSideLine: {
    width: 26,
    height: 2,
    borderRadius: 2,
    backgroundColor: AMBER,
    shadowColor: AMBER,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  titleEmpire: {
    fontFamily: 'PressStart2P',
    fontSize: 22,
    color: INK,
    letterSpacing: 5,
    textShadowColor: 'rgba(255,255,255,0.25)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  titleConnector: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 11,
    letterSpacing: 6,
    marginVertical: 4,
  },
  titleStar: {
    color: AMBER,
    fontSize: 16,
    fontWeight: '900',
    textShadowColor: AMBER_D,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  titleBits: {
    fontFamily: 'PressStart2P',
    fontSize: 30,
    color: AMBER,
    letterSpacing: 8,
    textShadowColor: 'rgba(255,184,0,0.55)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  tagline: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM_HI,
    fontSize: 11,
    letterSpacing: 4,
    marginTop: 2,
  },

  // ── PLAYER CARD
  playerCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
    gap: 14,
    overflow: 'visible',
  },
  bracket: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: AMBER,
  },
  bracketTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  bracketTR: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bracketBL: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  bracketBR: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  bracketAmberTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2, borderColor: AMBER },
  bracketAmberTR: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2, borderColor: AMBER },
  bracketAmberBL: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: AMBER },
  bracketAmberBR: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2, borderColor: AMBER },

  playerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.32)',
    backgroundColor: 'rgba(255,184,0,0.06)',
  },
  playerBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: AMBER,
  },
  playerBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: AMBER,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  versionTag: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 10,
    letterSpacing: 1.4,
  },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 4,
  },
  statCol: {
    flex: 1,
    gap: 6,
  },
  statSep: {
    width: 1,
    height: 44,
    backgroundColor: HAIRLINE,
  },
  statLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 9.5,
    letterSpacing: 2.2,
    fontWeight: '900',
  },
  statRank: {
    fontFamily: 'PressStart2P',
    color: AMBER,
    fontSize: 18,
    letterSpacing: 3,
    textShadowColor: 'rgba(255,184,0,0.55)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  statLvl: {
    fontFamily: 'PressStart2P',
    color: '#fff',
    fontSize: 22,
    letterSpacing: 2,
  },
  lvlValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lvlBars: {
    flexDirection: 'row',
    gap: 3,
  },
  lvlBlock: {
    width: 6,
    height: 14,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lvlBlockOn: {
    backgroundColor: AMBER,
    shadowColor: AMBER,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },

  playerDivider: {
    height: 1,
    backgroundColor: HAIRLINE,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emailGlyph: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,255,194,0.10)',
    borderWidth: 1,
    borderColor: TEAL_DIM,
  },
  emailGlyphText: {
    color: TEAL,
    fontSize: 14,
    fontWeight: '900',
  },
  emailLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '900',
  },
  emailText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#EDEDF8',
    letterSpacing: 0.4,
    marginTop: 2,
  },

  // ── CTA Card
  ctaWrap: {
    marginTop: 4,
  },
  ctaCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.30)',
    gap: 14,
    overflow: 'hidden',
  },
  ctaCardGlow: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(255,184,0,0.10)',
  },
  ctaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,255,194,0.32)',
    backgroundColor: 'rgba(0,255,194,0.08)',
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: TEAL,
    shadowColor: TEAL,
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  readyText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: TEAL,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  ctaCoinTag: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: PURPLE,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  ctaSubtitle: {
    fontFamily: 'PressStart2P',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 2,
    lineHeight: 22,
    marginBottom: 4,
  },
  ctaGlowWrap: {
    shadowColor: AMBER,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    borderRadius: 8,
  },
  ctaBtn: {
    backgroundColor: AMBER,
    borderWidth: 2,
    borderColor: AMBER_D,
    borderRadius: 8,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  ctaPressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  ctaBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctaArrowBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(11,11,11,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: {
    color: AMBER,
    fontSize: 12,
    fontWeight: '900',
  },
  ctaText: {
    fontFamily: 'PressStart2P',
    color: '#080808',
    fontSize: 15,
    letterSpacing: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 2,
  },
  tagItem: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: DIM_HI,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  tagBullet: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: AMBER_DIM,
  },

  // ── Footer
  footer: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
  chainPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HAIRLINE_HI,
    backgroundColor: 'rgba(15,15,15,0.85)',
  },
  chainGlyph: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: '900',
  },
  chainLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  chainSep: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: DIM,
  },
  chainNet: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: TEAL,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Loader Overlay
  loaderOverlay: {
    ...FILL,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loaderCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.32)',
    borderRadius: 12,
    backgroundColor: 'rgba(8,8,8,0.97)',
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 12,
  },
  loaderTitle: {
    fontFamily: 'PressStart2P',
    color: AMBER,
    fontSize: 10,
    letterSpacing: 1.4,
    textAlign: 'center',
    lineHeight: 16,
  },
  loaderSubtitle: {
    color: 'rgba(245,245,245,0.7)',
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,184,0,0.45)',
    backgroundColor: 'rgba(6,6,6,0.97)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
    shadowColor: AMBER,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  modalBadge: {
    color: TEAL,
    fontSize: 10,
    letterSpacing: 2.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '900',
  },
  modalTitle: {
    fontFamily: 'PressStart2P',
    color: AMBER,
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: 2,
    textShadowColor: 'rgba(255,184,0,0.5)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  modalSubTitle: {
    color: 'rgba(245,245,245,0.78)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 18,
  },
  pointsWrap: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(0,255,194,0.32)',
    borderRadius: 10,
    backgroundColor: 'rgba(0,255,194,0.08)',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  pointsLabel: {
    color: 'rgba(245,245,245,0.7)',
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pointsValue: {
    color: TEAL,
    fontFamily: 'PressStart2P',
    fontSize: 28,
    letterSpacing: 2,
    textShadowColor: 'rgba(0,255,194,0.4)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  pointsLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  pointsLine: {
    width: 32,
    height: 1,
    backgroundColor: TEAL_DIM,
  },
  pointsLineText: {
    color: TEAL,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  modalBtn: {
    marginTop: 6,
    width: '100%',
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: AMBER_D,
    backgroundColor: AMBER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPressed: {
    opacity: 0.85,
    transform: [{ translateY: 1 }],
  },
  modalBtnText: {
    color: '#0b0b0b',
    fontFamily: 'PressStart2P',
    fontSize: 12,
    letterSpacing: 1.6,
  },
});
