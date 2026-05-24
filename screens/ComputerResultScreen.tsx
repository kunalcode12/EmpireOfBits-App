import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';

const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ', M: 'ᛗ', P: 'ᛈ', I: 'ᛁ', R: 'ᚱ',
  O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', T: 'ᛏ', S: 'ᛊ',
  ' ': '  ',
};
const EMPIRE_RUNES = 'EMPIRE OF BITS'.split('').map((c) => RUNE_MAP[c] ?? c).join('');
const RUNE_LINE = `${EMPIRE_RUNES}   ᛉ   ${EMPIRE_RUNES}   ✦   ${EMPIRE_RUNES}   ᚷ   `;
const ROW_CONFIGS = [
  { opacity: 0.13, size: 20, offset: 0 }, { opacity: 0.09, size: 17, offset: -44 },
  { opacity: 0.15, size: 23, offset: 18 }, { opacity: 0.10, size: 18, offset: -22 },
  { opacity: 0.12, size: 21, offset: 36 }, { opacity: 0.08, size: 16, offset: -10 },
  { opacity: 0.14, size: 22, offset: 8 }, { opacity: 0.09, size: 19, offset: -38 },
  { opacity: 0.13, size: 20, offset: 26 }, { opacity: 0.10, size: 17, offset: -16 },
  { opacity: 0.15, size: 24, offset: 42 }, { opacity: 0.08, size: 18, offset: -6 },
  { opacity: 0.12, size: 21, offset: 14 }, { opacity: 0.09, size: 16, offset: -30 },
  { opacity: 0.14, size: 20, offset: 22 }, { opacity: 0.10, size: 23, offset: -48 },
];

function RunicBackground() {
  return (
    <View pointerEvents="none" style={runeStyles.container}>
      {ROW_CONFIGS.map((cfg, i) => (
        <View key={i} style={[runeStyles.row, { marginLeft: cfg.offset }]}>
          <Text style={[runeStyles.runeText, { opacity: cfg.opacity, fontSize: cfg.size }]} numberOfLines={1}>
            {RUNE_LINE}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ComputerResultScreen() {
  const params = useLocalSearchParams<{
    result?: string;
    reason?: string;
    points?: string;
    moves?: string;
  }>();

  const gameResult = params.result ?? 'draw';
  const reason = params.reason ?? 'Game Over';
  const pointsDelta = Number(params.points ?? '0');
  const moveCount = params.moves ?? '0';

  const headline =
    gameResult === 'win' ? 'You Won!' : gameResult === 'lose' ? 'You Lost' : 'Draw';

  const headlineColor =
    gameResult === 'win' ? '#8fd36d' : gameResult === 'lose' ? '#ff9b9b' : colors.text;

  return (
    <View style={styles.screen}>
      <RunicBackground />
      <View style={styles.badge}>
        <MaterialCommunityIcons name="robot" size={13} color="#22d3ee" />
        <Text style={styles.badgeText}>VS COMPUTER</Text>
      </View>
      <Text style={[styles.headline, { color: headlineColor }]}>{headline}</Text>
      <Text style={styles.reason}>{reason}</Text>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{moveCount}</Text>
          <Text style={styles.statLabel}>Moves</Text>
        </View>
        {pointsDelta > 0 && (
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: '#8fd36d' }]}>+{pointsDelta}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)/play')}>
        <Text style={styles.primaryText}>Arcade</Text>
      </Pressable>
    </View>
  );
}

const runeStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden', justifyContent: 'space-around', paddingVertical: 4,
  },
  row: { overflow: 'hidden' },
  runeText: {
    color: '#d4900a', fontWeight: '300', letterSpacing: 5,
    textShadowColor: '#b86c04', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
    backgroundColor: 'rgba(34,211,238,0.08)', marginBottom: spacing.md,
  },
  badgeText: {
    color: '#22d3ee', fontWeight: '900', fontSize: 10, letterSpacing: 1.4,
  },
  headline: {
    fontSize: 44, fontWeight: '900', textAlign: 'center',
  },
  reason: {
    color: colors.mutedText, fontSize: typography.heading, fontWeight: '800',
    marginTop: spacing.sm, marginBottom: spacing.xl,
  },
  stats: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl,
  },
  stat: {
    minWidth: 112, borderRadius: radii.md, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface,
    alignItems: 'center', padding: spacing.lg,
  },
  statValue: {
    color: colors.text, fontSize: typography.heading, fontWeight: '900',
  },
  statLabel: {
    color: colors.subtleText, fontSize: typography.small, fontWeight: '800', marginTop: 2,
  },
  primary: {
    width: '100%', minHeight: 52, borderRadius: radii.sm,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: {
    color: colors.text, fontSize: typography.body, fontWeight: '900',
  },
});
