import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const solanaWallet = useEmbeddedSolanaWallet();
  const result = game.result;
  const headline = result?.result === 'win' ? 'You Won!' : result?.result === 'lose' ? 'You Lost' : 'Draw';
  const ratingDelta = result?.ratingChange;
  const hasRatingUpdate = typeof result?.newRating === 'number' && typeof ratingDelta === 'number';
  const ratingDeltaText =
    typeof ratingDelta === 'number' ? `${ratingDelta > 0 ? '+' : ''}${ratingDelta}` : null;
  const [signing, setSigning] = useState(false);
  const [signedPayload, setSignedPayload] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const ratingMessage = useMemo(() => {
    if (typeof result?.newRating !== 'number') return null;
    return `Empire of Bits rating update: ${result.newRating}`;
  }, [result?.newRating]);

  const onSignRating = async () => {
    if (!ratingMessage || signing) return;
    setSigning(true);
    setSignError(null);
    const startedAt = Date.now();
    try {
      if (solanaWallet.status !== 'connected' || !solanaWallet.wallets?.[0]) {
        throw new Error('Embedded wallet is not connected.');
      }
      const provider = await solanaWallet.wallets[0].getProvider();
      const signResult = await provider.request({
        method: 'signMessage',
        params: { message: ratingMessage },
      });
      const elapsed = Date.now() - startedAt;
      const minLoaderMs = 1200;
      if (elapsed < minLoaderMs) {
        await new Promise((resolve) => setTimeout(resolve, minLoaderMs - elapsed));
      }
      setSignedPayload(
        typeof signResult === 'string' ? signResult : JSON.stringify(signResult),
      );
    } catch (error) {
      setSignError(error instanceof Error ? error.message : 'Signing failed.');
    } finally {
      setSigning(false);
    }
  };

  const handleHomePress = async () => {
    await Promise.resolve(game.resetGame());
    router.push('/(tabs)/play');
  };

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
      {hasRatingUpdate ? (
        <View style={styles.ratingCard}>
          <Text style={styles.ratingTitle}>Rating Update</Text>
          <Text style={styles.ratingValue}>{result?.newRating}</Text>
          <Text style={[styles.ratingDelta, (ratingDelta ?? 0) >= 0 ? styles.ratingDeltaUp : styles.ratingDeltaDown]}>
            {ratingDeltaText}
          </Text>
          {ratingMessage ? <Text style={styles.signMessage}>{ratingMessage}</Text> : null}
          <Pressable style={styles.signButton} onPress={() => void onSignRating()} disabled={signing}>
            {signing ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.signButtonText}>Sign Rating</Text>
            )}
          </Pressable>
          {signedPayload ? (
            <>
              <Text style={styles.signatureLabel}>Signed Message</Text>
              <Text style={styles.signatureValue} numberOfLines={3}>
                {signedPayload}
              </Text>
            </>
          ) : null}
          {signError ? <Text style={styles.signError}>{signError}</Text> : null}
        </View>
      ) : null}
      <Pressable style={styles.primary} onPress={game.resetGame}>
        <Text style={styles.primaryText}>Play Again</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => void handleHomePress()}>
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
  ratingCard: {
    width: '100%',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  ratingTitle: {
    color: colors.subtleText,
    fontSize: typography.small,
    fontWeight: '800',
    marginBottom: 4,
  },
  ratingValue: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '900',
  },
  ratingDelta: {
    fontSize: typography.body,
    fontWeight: '900',
    marginTop: 4,
  },
  ratingDeltaUp: {
    color: '#8fd36d',
  },
  ratingDeltaDown: {
    color: '#ff9b9b',
  },
  signMessage: {
    color: colors.mutedText,
    fontSize: typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  signButton: {
    minWidth: 160,
    minHeight: 42,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  signButtonText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '900',
  },
  signatureLabel: {
    color: colors.subtleText,
    fontSize: typography.small,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  signatureValue: {
    color: colors.mutedText,
    fontSize: typography.tiny,
    textAlign: 'center',
    marginTop: 2,
  },
  signError: {
    color: colors.warning,
    fontSize: typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '700',
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
