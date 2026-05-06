import { usePrivy } from '@privy-io/expo';
import { registerOrLogin } from '../api/authApi';
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

import { getPrivyEmail } from '../utils/privyUser';
import { saveStoredUser } from '../utils/storageHelper';

// ─── Font ─────────────────────────────────────────────────────────────────────
const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG      = '#050505';
const BG_MID  = '#0e0e0e';
const AMBER   = '#FFB800';
const AMBER_D = '#b38200';
const PURPLE  = '#9B30FF';
const TEAL    = '#00FFC2';
const DIM     = '#6b7280';
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

  return (
    <View style={s.root}>
      <RunicBackground />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── LOGO + TITLE ──────────────────────────────────────── */}
        <Animated.View style={[s.logoSection, fadeSlide(logoAnim)]}>
          <Image
            source={require('../assets/images/empire.jpg')}
            style={s.logoImage}
            contentFit="cover"
          />
          <Text style={s.title}>EMPIRE{'\n'}OF BITS</Text>
          <Text style={s.tagline}>WHERE EVERY GAME MATTERS</Text>
        </Animated.View>

        {/* ── RANK + PLAYER EMAIL ──────────────────────────────── */}
        <Animated.View style={[s.rankSection, fadeSlide(rankAnim)]}>
          <Text style={s.rankLabel}>◈ RANK ◈</Text>
          <Text style={s.rankTitle}>ROOKIE</Text>
          <Text style={s.rankLevel}>LVL 01</Text>
          <View style={s.rankDivider} />
          <PlayerEmail />
        </Animated.View>

        {/* ── PLAY NOW ─────────────────────────────────────────── */}
        <Animated.View style={[
          fadeSlide(ctaAnim),
          { transform: [
            { translateY: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) },
            { scale: ctaScale },
          ]},
        ]}>
          <View style={s.ctaGlow}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/(tabs)/play');
              }}
              style={({ pressed }) => [s.ctaBtn, pressed && s.ctaPressed]}
              android_ripple={{ color: 'rgba(0,0,0,0.2)' }}
            >
              <Text style={s.ctaText}>▶  PLAY NOW</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <View style={s.footer}>
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
            <Text style={s.modalBadge}>NEW CHAMPION UNLOCKED</Text>
            <Text style={s.modalTitle}>CONGRATULATIONS!</Text>
            <Text style={s.modalSubTitle}>Your Empire of Bits profile is ready.</Text>
            <View style={s.pointsWrap}>
              <Text style={s.pointsLabel}>STARTING POINTS</Text>
              <Text style={s.pointsValue}>{newUserPoints}</Text>
            </View>
            <Pressable
              onPress={() => setIsCongratsModalVisible(false)}
              style={({ pressed }) => [s.modalBtn, pressed && s.modalBtnPressed]}
            >
              <Text style={s.modalBtnText}>LET'S PLAY</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {authLoading ? (
        <View style={s.loaderOverlay} pointerEvents="auto">
          <View style={s.loaderCard}>
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
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 60,
    gap: 28,
    justifyContent: 'center',
  },

  // ── Logo section
  logoSection: {
    alignItems: 'center',
    gap: 16,
  },
  logoImage: {
    width: 108,
    height: 108,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,184,0,0.35)',
  },
  title: {
    fontFamily: 'PressStart2P',
    fontSize: 22,
    color: AMBER,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: 3,
    textShadowColor: 'rgba(255,184,0,0.4)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  tagline: {
    fontFamily: 'PressStart2P',
    fontSize: 8,
    color: 'rgba(245,245,245,0.45)',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 1.5,
  },

  // ── Rank section
  rankSection: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10,10,10,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.18)',
    borderRadius: 8,
  },
  rankLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: DIM,
    letterSpacing: 4,
  },
  rankTitle: {
    fontFamily: 'PressStart2P',
    fontSize: 36,
    color: AMBER,
    letterSpacing: 6,
    textAlign: 'center',
    textShadowColor: 'rgba(255,184,0,0.55)',
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 0 },
    marginTop: 4,
  },
  rankLevel: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: 'rgba(245,245,245,0.35)',
    letterSpacing: 3,
    marginTop: 2,
  },
  rankDivider: {
    width: 48,
    height: 1,
    backgroundColor: 'rgba(255,184,0,0.25)',
    marginTop: 14,
    marginBottom: 8,
  },
  emailText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: DIM,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── CTA button
  ctaGlow: {
    shadowColor: AMBER,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  ctaBtn: {
    backgroundColor: AMBER,
    borderWidth: 2,
    borderColor: AMBER_D,
    borderRadius: 6,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: {
    fontFamily: 'PressStart2P',
    color: '#080808',
    fontSize: 16,
    letterSpacing: 2,
  },

  // ── Footer
  footer: {
    alignItems: 'center',
    paddingTop: 4,
  },
  footerText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  loaderOverlay: {
    ...FILL,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loaderCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.28)',
    borderRadius: 10,
    backgroundColor: 'rgba(10,10,10,0.95)',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  loaderTitle: {
    fontFamily: 'PressStart2P',
    color: AMBER,
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'center',
    lineHeight: 16,
  },
  loaderSubtitle: {
    color: 'rgba(245,245,245,0.7)',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,184,0,0.42)',
    backgroundColor: 'rgba(5,5,5,0.96)',
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: 'center',
    gap: 10,
    shadowColor: AMBER,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  modalBadge: {
    color: TEAL,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalTitle: {
    fontFamily: 'PressStart2P',
    color: AMBER,
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 30,
    textShadowColor: 'rgba(255,184,0,0.4)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  modalSubTitle: {
    color: 'rgba(245,245,245,0.75)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  pointsWrap: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(0,255,194,0.28)',
    borderRadius: 8,
    backgroundColor: 'rgba(0,255,194,0.08)',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  pointsLabel: {
    color: 'rgba(245,245,245,0.65)',
    fontSize: 11,
    letterSpacing: 1.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pointsValue: {
    color: TEAL,
    fontFamily: 'PressStart2P',
    fontSize: 24,
    textShadowColor: 'rgba(0,255,194,0.35)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  modalBtn: {
    marginTop: 6,
    width: '100%',
    minHeight: 54,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: AMBER_D,
    backgroundColor: AMBER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPressed: {
    opacity: 0.85,
  },
  modalBtnText: {
    color: '#0b0b0b',
    fontFamily: 'PressStart2P',
    fontSize: 12,
    letterSpacing: 1.2,
  },
});
