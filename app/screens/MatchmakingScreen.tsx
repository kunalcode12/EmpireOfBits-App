import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useGame } from '../store/GameContext';

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

export function MatchmakingScreen() {

  
  const game = useGame();
  const matchmaking = useMatchmaking(game.timeControl, game.colorPreference);
  const timedOut = Boolean(matchmaking.message && !matchmaking.searching);

  return (
    <View style={styles.screen}>
      <LoadingSpinner />
      <Text style={styles.title}>{timedOut ? 'No opponent found' : `Searching... ${formatElapsed(matchmaking.elapsed)}`}</Text>
      <Text style={styles.subtitle}>
        {timedOut ? 'The queue is quiet for that setup.' : `${game.timeControl} minute game, ${labelForColor(game.colorPreference)} pieces`}
      </Text>
      {timedOut ? (
        <Pressable style={styles.primary} onPress={() => void matchmaking.retry()}>
          <Text style={styles.primaryText}>Try Again</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.secondary} onPress={matchmaking.cancel}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

const labelForColor = (preference: string | null) => {
  if (preference === 'w') return 'white';
  if (preference === 'b') return 'black';
  return 'random';
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
    marginTop: spacing.xl,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  primary: {
    minWidth: 180,
    minHeight: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.body,
  },
  secondary: {
    minWidth: 180,
    minHeight: 50,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: colors.mutedText,
    fontWeight: '900',
    fontSize: typography.body,
  },
});
