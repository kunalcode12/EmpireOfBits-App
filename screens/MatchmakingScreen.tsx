import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useGame } from '../store/GameContext';

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

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

export function MatchmakingScreen() {

  
  const game = useGame();
  const matchmaking = useMatchmaking(game.timeControl, game.colorPreference);
  const timedOut = Boolean(matchmaking.message && !matchmaking.searching);

  return (
    <View style={styles.screen}>
      <RunicBackground />
      <ImageBackground
        source={require('../assets/images/board.png')}
        style={styles.boardPanel}
        resizeMode="cover"
        blurRadius={1}
      >
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
    backgroundColor: 'transparent',
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
