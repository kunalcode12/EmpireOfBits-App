import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { formatClock } from '../hooks/useTimer';
import { useGame } from '../store/GameContext';

export function ResultScreen() {
  const game = useGame();
  const result = game.result;
  const headline = result?.result === 'win' ? 'You Won!' : result?.result === 'lose' ? 'You Lost' : 'Draw';

  return (
    <View style={styles.screen}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

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
