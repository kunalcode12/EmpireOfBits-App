import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { formatClock } from '../hooks/useTimer';
import { useGame } from '../store/GameContext';

const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ', M: 'ᛗ', P: 'ᛈ', I: 'ᛁ', R: 'ᚱ',
  O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', T: 'ᛏ', S: 'ᛊ',
  ' ': '  ',
};

const EMPIRE_RUNES = 'EMPIRE OF BITS'
  .split('')
  .map((c) => RUNE_MAP[c] ?? c)
  .join('');

const RUNE_LINE = `${EMPIRE_RUNES}   ᛉ   ${EMPIRE_RUNES}   ✦   ${EMPIRE_RUNES}   ᚷ   `;

const ROW_CONFIGS = [
  { opacity: 0.13, size: 20, offset: 0 },
  { opacity: 0.09, size: 17, offset: -44 },
  { opacity: 0.15, size: 23, offset: 18 },
  { opacity: 0.10, size: 18, offset: -22 },
  { opacity: 0.12, size: 21, offset: 36 },
  { opacity: 0.08, size: 16, offset: -10 },
  { opacity: 0.14, size: 22, offset: 8 },
  { opacity: 0.09, size: 19, offset: -38 },
  { opacity: 0.13, size: 20, offset: 26 },
  { opacity: 0.10, size: 17, offset: -16 },
  { opacity: 0.15, size: 24, offset: 42 },
  { opacity: 0.08, size: 18, offset: -6 },
  { opacity: 0.12, size: 21, offset: 14 },
  { opacity: 0.09, size: 16, offset: -30 },
  { opacity: 0.14, size: 20, offset: 22 },
  { opacity: 0.10, size: 23, offset: -48 },
];

export function ResultScreen() {
  const game = useGame();
  const result = game.result;
  const headline = result?.result === 'win' ? 'You Won!' : result?.result === 'lose' ? 'You Lost' : 'Draw';

  return (
    <View style={styles.screen}>
      <RunicBackground />
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.reason}>{result?.reason ?? 'Game finished'}</Text>
      {result?.message ? <Text style={styles.message}>{result.message}</Text> : null}
      <View style={styles.stats}>
        <Stat label="Moves" value={String(result?.moves ?? game.moves.length)} />
        <Stat label="Duration" value={formatClock(result?.durationSeconds ?? 0)} />
      </View>
      <Pressable style={styles.primary} onPress={game.resetGame}>
        <Text style={styles.primaryText}>Play Again</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={game.resetGame}>
        <Text style={styles.secondaryText}>Home</Text>
      </Pressable>
    </View>
  );
}

function RunicBackground() {
  return (
    <View pointerEvents="none" style={runeStyles.container}>
      {ROW_CONFIGS.map((cfg, i) => (
        <View key={i} style={[runeStyles.row, { marginLeft: cfg.offset }]}>
          <Text
            style={[runeStyles.runeText, { opacity: cfg.opacity, fontSize: cfg.size }]}
            numberOfLines={1}
          >
            {RUNE_LINE}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const runeStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  row: {
    overflow: 'hidden',
  },
  runeText: {
    color: '#d4900a',
    fontWeight: '300',
    letterSpacing: 5,
    textShadowColor: '#b86c04',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  headline: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'center',
  },
  reason: {
    color: colors.mutedText,
    fontSize: typography.heading,
    fontWeight: '800',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  message: {
    color: colors.text,
    fontSize: typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  stat: {
    minWidth: 112,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    padding: spacing.lg,
  },
  statValue: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.subtleText,
    fontSize: typography.small,
    fontWeight: '800',
    marginTop: 2,
  },
  primary: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  primaryText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '900',
  },
  secondary: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: colors.mutedText,
    fontSize: typography.body,
    fontWeight: '900',
  },
});
