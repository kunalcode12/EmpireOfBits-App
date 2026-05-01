import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
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
      <ImageBackground source={require('../assets/images/board.png')} style={styles.boardPanel} resizeMode="cover" blurRadius={1}>
        <View style={styles.backgroundBlur} />
      </ImageBackground>
      <View style={styles.content}>
        <LoadingSpinner />
        <Text style={styles.title}>{timedOut ? 'No Opponent Found' : `Searching  ${formatElapsed(matchmaking.elapsed)}`}</Text>
        {timedOut && <Text style={styles.subtitle}>The queue is quiet for that setup.</Text>}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  boardPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '10%',
    bottom: '10%',
    overflow: 'hidden',
  },
  backgroundBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: '#f0d9b5',
    fontSize: typography.heading,
    fontWeight: '900',
    marginTop: spacing.lg,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.38)',
    textShadowRadius: 5,
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
    marginTop: spacing.lg,
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
    marginTop: spacing.lg,
  },
  secondaryText: {
    color: colors.mutedText,
    fontWeight: '900',
    fontSize: typography.body,
  },
});
