import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const COLORS = {
  background: '#05050F',
  backgroundAlt: '#090915',
  surface: '#0E0E1F',
  accentGold: '#FFD700',
  accentPurple: '#8B5CF6',
  accentTeal: '#00FFC2',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  border: 'rgba(255, 215, 0, 0.15)',
};
const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';

const GAME_CARDS = [
  { name: 'Space Invader', badge: 'Coming Soon' },
  { name: 'Axe Arcade', badge: 'Coming Soon' },
  { name: 'Candy Crush', badge: 'Coming Soon' },
  { name: 'Battleship', badge: 'Play' },
];

export default function HomeTabScreen() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Font.loadAsync({ PressStart2P: PRESS_START_2P_URI })
      .catch(() => null)
      .finally(() => setFontsLoaded(true));
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.03,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (!fontsLoaded) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroDecorationOne} />
        <View style={styles.heroDecorationTwo} />
        <View style={styles.scanline} />

        <Text style={styles.logo}>
          <Text style={styles.logoGold}>EMPIRE </Text>
          <Text style={styles.logoPurple}>OF </Text>
          <Text style={styles.logoGold}>BITS</Text>
        </Text>
        <Text style={styles.tagline}>WHERE EVERY GAME MATTERS</Text>
        <Text style={styles.subTagline}>Interoperable Gaming on Solana</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>LIVE ON SOLANA DEVNET</Text>
        </View>
      </View>

      <Animated.View style={[styles.ctaWrap, { transform: [{ scale: pulse }] }]}>
        <Pressable
          android_ripple={{ color: 'rgba(0,0,0,0.15)' }}
          onPress={() => router.push('/auth-flow')}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>PLAY NOW</Text>
        </Pressable>
      </Animated.View>

      <Text style={styles.sectionTitle}>VIEWER INFLUENCE LOOP</Text>
      <View style={styles.featureCard}>
        <Text style={styles.featureBody}>
          Viewers spend credits to trigger real-time, game-changing events in live matches and
          shape each run of the arcade.
        </Text>
        <View style={styles.featureRow}>
          <Ionicons name="flash" color={COLORS.accentTeal} size={18} />
          <Text style={styles.featureText}>Real-time interaction</Text>
        </View>
        <View style={styles.featureRow}>
          <Ionicons name="eye" color={COLORS.accentTeal} size={18} />
          <Text style={styles.featureText}>Direct viewer engagement</Text>
        </View>
        <View style={styles.featureRow}>
          <Ionicons name="sparkles" color={COLORS.accentTeal} size={18} />
          <Text style={styles.featureText}>Game-changing events</Text>
        </View>
        <View style={styles.featureRow}>
          <Ionicons name="git-network" color={COLORS.accentTeal} size={18} />
          <Text style={styles.featureText}>Cross-game ecosystem</Text>
        </View>
      </View>

      <View style={styles.problemStrip}>
        <View style={styles.problemCard}>
          <Text style={styles.problemTitle}>5 Broken Things in Gaming</Text>
          <Text style={styles.problemList}>- Isolated assets</Text>
          <Text style={styles.problemList}>- Wasted investment</Text>
          <Text style={styles.problemList}>- No rewards</Text>
          <Text style={styles.problemList}>- Repetitive loops</Text>
          <Text style={styles.problemList}>- Split communities</Text>
        </View>
        <View style={styles.problemCard}>
          <Text style={styles.problemTitle}>1 Solution</Text>
          <Text style={styles.solutionText}>The Viewer-Influence Loop changes everything.</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>GAMES IN THE ARCADE</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gameStrip}
      >
        {GAME_CARDS.map((game) => (
          <Pressable
            key={game.name}
            style={({ pressed }) => [styles.gameCard, pressed && styles.pressed]}
            onPress={() => {}}
            android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
          >
            <Text style={styles.gameName}>{game.name}</Text>
            <View style={[styles.gameBadge, game.badge === 'Play' && styles.gameBadgePlay]}>
              <Text style={[styles.gameBadgeText, game.badge === 'Play' && styles.gameBadgeTextDark]}>
                {game.badge}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>
          <Text style={{ color: '#8B5CF6' }}>Powered </Text>
          <Text style={{ color: '#00FFC2' }}>by </Text>
          <Text style={{ color: '#FFD700' }}>Solana</Text>
        </Text>
        <Text style={styles.footerCaption}>
          Assets · Achievements · Experiences - across every game
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 18,
  },
  hero: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  heroDecorationOne: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 100,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    top: -30,
    right: -20,
  },
  heroDecorationTwo: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 194, 0.2)',
    bottom: 15,
    left: -24,
    transform: [{ rotate: '20deg' }],
  },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.02)',
  },
  logo: {
    fontFamily: 'PressStart2P',
    fontSize: 20,
    lineHeight: 30,
  },
  logoGold: {
    color: COLORS.accentGold,
    textShadowColor: 'rgba(255, 215, 0, 0.35)',
    textShadowRadius: 6,
  },
  logoPurple: {
    color: COLORS.accentPurple,
  },
  tagline: {
    marginTop: 12,
    fontFamily: 'PressStart2P',
    color: COLORS.textPrimary,
    fontSize: 10,
    lineHeight: 16,
  },
  subTagline: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,255,194,0.15)',
    borderColor: 'rgba(0,255,194,0.6)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: COLORS.accentTeal,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  ctaWrap: {
    shadowColor: COLORS.accentGold,
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  ctaButton: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: COLORS.accentGold,
    borderWidth: 2,
    borderColor: '#B58D00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontFamily: 'PressStart2P',
    color: '#111111',
    fontSize: 14,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontFamily: 'PressStart2P',
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  featureCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accentGold,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  featureBody: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  problemStrip: {
    flexDirection: 'row',
    gap: 10,
  },
  problemCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 6,
  },
  problemTitle: {
    color: COLORS.accentGold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  problemList: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  solutionText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 21,
  },
  gameStrip: {
    gap: 12,
    paddingRight: 8,
  },
  gameCard: {
    width: 170,
    minHeight: 120,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    justifyContent: 'space-between',
    padding: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  gameName: {
    fontFamily: 'PressStart2P',
    color: COLORS.textPrimary,
    fontSize: 10,
    lineHeight: 16,
  },
  gameBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gameBadgePlay: {
    borderColor: 'rgba(0,255,194,0.7)',
    backgroundColor: COLORS.accentTeal,
  },
  gameBadgeText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  gameBadgeTextDark: {
    color: '#04231C',
  },
  footer: {
    marginTop: 10,
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  footerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  footerCaption: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});
