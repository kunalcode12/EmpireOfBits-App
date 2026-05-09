import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { formatClock } from '../hooks/useTimer';
import { useGame } from '../store/GameContext';
import { usePoints } from '../store/PointsContext';
import { getSession, setToken, updateSessionStatus } from '../lib/vorldTV';
import {
  clearReactiveSessionId,
  loadReactiveSnapshot,
} from '../utils/reactiveStorageHelper';
import { savePendingCelebration } from '../utils/storageHelper';

const WIN_POINTS_DELTA = 100;
const LOSE_POINTS_DELTA = -50;

// Reactive accents — same palette used in ArcadeCenterScreen / GameScreen.
const REACTIVE_PINK = '#FF006E';
const REACTIVE_CYAN = '#00F5FF';

type ReactiveSessionStatus =
  | 'unknown'
  | 'waiting'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'aborted';

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
  const { points, applyPointsDelta } = usePoints();
  const result = game.result;
  const headline = result?.result === 'win' ? 'You Won!' : result?.result === 'lose' ? 'You Lost' : 'Draw';
  const ratingDelta = result?.ratingChange;
  const hasRatingUpdate = typeof result?.newRating === 'number' && typeof ratingDelta === 'number';
  const ratingDeltaText =
    typeof ratingDelta === 'number' ? `${ratingDelta > 0 ? '+' : ''}${ratingDelta}` : null;
  const [signing, setSigning] = useState(false);
  const [signedPayload, setSignedPayload] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  // ─── Celebration / consolation popup ──────────────────────────────────────
  const pointsAppliedRef = useRef(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationOutcome, setCelebrationOutcome] = useState<'win' | 'lose' | null>(null);
  const [celebrationDelta, setCelebrationDelta] = useState(0);
  const [celebrationNewPoints, setCelebrationNewPoints] = useState<number | null>(null);
  const [celebrationApplying, setCelebrationApplying] = useState(false);
  const [celebrationError, setCelebrationError] = useState<string | null>(null);

  useEffect(() => {
    if (pointsAppliedRef.current) return;
    if (!result) return;
    if (result.result !== 'win' && result.result !== 'lose') return;
    pointsAppliedRef.current = true;
    const delta = result.result === 'win' ? WIN_POINTS_DELTA : LOSE_POINTS_DELTA;
    setCelebrationOutcome(result.result);
    setCelebrationDelta(delta);
    setCelebrationVisible(true);
    setCelebrationError(null);
    // On loss the entry fee was already deducted at game start — show the
    // "-50" cosmetically but do not double-charge the user.
    if (result.result !== 'win') return;
    setCelebrationApplying(true);
    void (async () => {
      try {
        const updated = await applyPointsDelta(delta);
        setCelebrationNewPoints(updated);
      } catch (err) {
        setCelebrationError(err instanceof Error ? err.message : 'Could not update points.');
      } finally {
        setCelebrationApplying(false);
      }
    })();
  }, [result, applyPointsDelta]);

  const handleCelebrationOk = async () => {
    if (celebrationApplying) return;
    if (celebrationOutcome) {
      try {
        await savePendingCelebration({
          outcome: celebrationOutcome,
          pointsDelta: celebrationDelta,
          newPoints: celebrationNewPoints ?? points ?? null,
          newRating: typeof result?.newRating === 'number' ? result.newRating : null,
          ratingChange: typeof result?.ratingChange === 'number' ? result.ratingChange : null,
          createdAt: Date.now(),
        });
      } catch {
        // non-fatal — popup will simply not replay on Arcade Center
      }
    }
    setCelebrationVisible(false);
  };
  const ratingMessage = useMemo(() => {
    if (typeof result?.newRating !== 'number') return null;
    return `Empire of Bits rating update: ${result.newRating}`;
  }, [result?.newRating]);

  // ─── Reactive session footer (additive — no chess logic touched) ──────────
  const [reactiveOn, setReactiveOn] = useState(false);
  const [twitchHandle, setTwitchHandle] = useState<string | null>(null);
  const [reactiveAccessToken, setReactiveAccessToken] = useState<string | null>(null);
  const [reactiveSessionId, setReactiveSessionId] = useState<string | null>(null);
  const [reactiveSessionStatus, setReactiveSessionStatus] = useState<ReactiveSessionStatus>('unknown');
  const [endingSession, setEndingSession] = useState(false);
  const [endSessionError, setEndSessionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const snap = await loadReactiveSnapshot();
        if (!mounted) return;
        const live = Boolean(snap.enabled && snap.accessToken && snap.user);
        setReactiveOn(live);
        if (snap.streamUrl) {
          const m = snap.streamUrl.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
          setTwitchHandle(m ? m[1] : snap.streamUrl);
        }
        console.log('snap', snap);
        if (snap.accessToken) setReactiveAccessToken(snap.accessToken);
        if (snap.sessionId) setReactiveSessionId(snap.sessionId);

        // Probe the session so we only show END SESSION when it's not already finished.
        if (snap.sessionId && snap.accessToken) {
          try {
            setToken(snap.accessToken);
            // Also pass the token explicitly so the request carries it even if
            // the axios default header isn't applied for any reason.
            const probe = await getSession(snap.sessionId, snap.accessToken);
            const body = (probe as { data?: unknown }).data as
              | { data?: { session?: { status?: string } }; session?: { status?: string }; status?: string }
              | undefined;
            const status = (body?.data?.session?.status ?? body?.session?.status ?? body?.status ?? '').toLowerCase();
            if (mounted) {
              if (
                status === 'waiting' ||
                status === 'active' ||
                status === 'completed' ||
                status === 'cancelled' ||
                status === 'aborted'
              ) {
                setReactiveSessionStatus(status as ReactiveSessionStatus);
              } else if (status) {
                setReactiveSessionStatus('unknown');
              }
            }
          } catch {
            // probe failed — leave status as unknown; user can still hit END SESSION.
          }
        }
      } catch {
        // ignore — reactive footer simply won't render
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const sessionFinished =
    reactiveSessionStatus === 'completed' ||
    reactiveSessionStatus === 'cancelled' ||
    reactiveSessionStatus === 'aborted';

  const handleEndReactiveSession = async () => {
    console.log('reactiveSessionId', reactiveSessionId);
    if (!reactiveSessionId || !reactiveAccessToken || endingSession) return;
    setEndingSession(true);
    setEndSessionError(null);
    try {
      setToken(reactiveAccessToken);
      // Pass the token explicitly so the PATCH carries Authorization
      // even if the axios instance default header was lost.
      await updateSessionStatus(reactiveSessionId, 'completed', reactiveAccessToken);
      await clearReactiveSessionId();
      setReactiveSessionStatus('completed');
      setReactiveSessionId(null);
    } catch (error) {
      setEndSessionError(error instanceof Error ? error.message : 'Failed to end session.');
    } finally {
      setEndingSession(false);
    }
  };

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
    // Clean up the saved reactive session id so re-entering the lobby
    // doesn't think a stale session is still live.
    await clearReactiveSessionId();
    setReactiveSessionId(null);
    await Promise.resolve(game.resetGame());
    router.push('/(tabs)/play');
  };

  const handlePlayAgain = () => {
    // "Play Again" only resets local game state; the reactive session id
    // stays intact so a follow-up match can still bind to the same session.
    game.resetGame();
  };

  return (
    <View style={[styles.screen, reactiveOn && styles.screenReactive]}>
      <RunicBackground />
      {reactiveOn && (
        <View style={styles.reactiveBadge}>
          <View style={styles.reactiveBadgeDot} />
          <Text style={styles.reactiveBadgeText}>REACTIVE GAME</Text>
          {twitchHandle ? (
            <>
              <Text style={styles.reactiveBadgeDivider}>·</Text>
              <MaterialCommunityIcons name="twitch" size={11} color={REACTIVE_PINK} />
              <Text style={styles.reactiveBadgeHandle} numberOfLines={1}>
                @{twitchHandle}
              </Text>
            </>
          ) : null}
        </View>
      )}
      <Text style={[styles.headline, reactiveOn && styles.headlineReactive]}>{headline}</Text>
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
      {reactiveOn && reactiveSessionId && !sessionFinished ? (
        <View style={styles.reactiveSessionCard}>
          <View style={styles.reactiveSessionHeaderRow}>
            <MaterialCommunityIcons name="broadcast" size={16} color={REACTIVE_PINK} />
            <Text style={styles.reactiveSessionTitle}>REACTIVE SESSION</Text>
            <View style={styles.reactiveSessionStatusPill}>
              <View
                style={[
                  styles.reactiveSessionStatusDot,
                  reactiveSessionStatus === 'active' && styles.reactiveSessionStatusDotActive,
                ]}
              />
              <Text style={styles.reactiveSessionStatusText}>
                {reactiveSessionStatus === 'unknown' ? 'OPEN' : reactiveSessionStatus.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.reactiveSessionId} numberOfLines={1}>
            ID: {reactiveSessionId}
          </Text>
          <Pressable
            style={[styles.endSessionBtn, endingSession && styles.endSessionBtnDisabled]}
            onPress={() => void handleEndReactiveSession()}
            disabled={endingSession}
          >
            {endingSession ? (
              <ActivityIndicator size="small" color={REACTIVE_PINK} />
            ) : (
              <>
                <MaterialCommunityIcons name="stop-circle-outline" size={14} color={REACTIVE_PINK} />
                <Text style={styles.endSessionBtnText}>END SESSION</Text>
              </>
            )}
          </Pressable>
          {endSessionError ? (
            <Text style={styles.endSessionError}>{endSessionError}</Text>
          ) : null}
        </View>
      ) : null}
      {reactiveOn && sessionFinished ? (
        <View style={styles.reactiveClosedNote}>
          <MaterialCommunityIcons name="check-circle-outline" size={14} color={REACTIVE_CYAN} />
          <Text style={styles.reactiveClosedNoteText}>
            Reactive session {reactiveSessionStatus}.
          </Text>
        </View>
      ) : null}
      <Pressable
        style={[styles.primary, reactiveOn && styles.primaryReactive]}
        onPress={handlePlayAgain}
      >
        <Text style={styles.primaryText}>Play Again</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => void handleHomePress()}>
        <Text style={styles.secondaryText}>Home</Text>
      </Pressable>
      {celebrationVisible && celebrationOutcome ? (
        <View style={celebrationStyles.overlay} pointerEvents="auto">
          <Pressable style={celebrationStyles.backdrop} onPress={() => {}} />
          <View
            style={[
              celebrationStyles.card,
              celebrationOutcome === 'win'
                ? celebrationStyles.cardWin
                : celebrationStyles.cardLose,
            ]}
          >
            <View
              style={[
                celebrationStyles.iconWrap,
                celebrationOutcome === 'win'
                  ? celebrationStyles.iconWrapWin
                  : celebrationStyles.iconWrapLose,
              ]}
            >
              <MaterialCommunityIcons
                name={celebrationOutcome === 'win' ? 'trophy-outline' : 'emoticon-sad-outline'}
                size={32}
                color={celebrationOutcome === 'win' ? '#8fd36d' : '#ff9b9b'}
              />
            </View>
            <Text
              style={[
                celebrationStyles.title,
                celebrationOutcome === 'win'
                  ? celebrationStyles.titleWin
                  : celebrationStyles.titleLose,
              ]}
            >
              {celebrationOutcome === 'win' ? 'Victory' : 'Defeat'}
            </Text>
            <Text style={celebrationStyles.subtitle}>
              {celebrationOutcome === 'win'
                ? `You won ${WIN_POINTS_DELTA} points`
                : `You lost ${Math.abs(LOSE_POINTS_DELTA)} points`}
            </Text>
            <View style={celebrationStyles.deltaPill}>
              <Text
                style={[
                  celebrationStyles.deltaText,
                  celebrationOutcome === 'win'
                    ? celebrationStyles.deltaTextWin
                    : celebrationStyles.deltaTextLose,
                ]}
              >
                {celebrationOutcome === 'win'
                  ? `+${WIN_POINTS_DELTA} PTS`
                  : `${LOSE_POINTS_DELTA} PTS`}
              </Text>
            </View>
            <View style={celebrationStyles.balanceRow}>
              <Text style={celebrationStyles.balanceLabel}>BALANCE</Text>
              {celebrationApplying ? (
                <ActivityIndicator
                  size="small"
                  color={celebrationOutcome === 'win' ? '#8fd36d' : '#ff9b9b'}
                />
              ) : (
                <Text style={celebrationStyles.balanceValue}>
                  {celebrationNewPoints ?? points ?? '--'}
                </Text>
              )}
            </View>
            {celebrationError ? (
              <Text style={celebrationStyles.errorText}>{celebrationError}</Text>
            ) : null}
            <Pressable
              style={[
                celebrationStyles.okButton,
                celebrationOutcome === 'win'
                  ? celebrationStyles.okButtonWin
                  : celebrationStyles.okButtonLose,
                celebrationApplying && celebrationStyles.okButtonDisabled,
              ]}
              onPress={() => void handleCelebrationOk()}
              disabled={celebrationApplying}
            >
              <Text
                style={[
                  celebrationStyles.okButtonText,
                  celebrationOutcome === 'win'
                    ? celebrationStyles.okButtonTextWin
                    : celebrationStyles.okButtonTextLose,
                ]}
              >
                OK
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  screenReactive: {
    backgroundColor: '#0a050a',
  },
  reactiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.10)',
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    marginBottom: spacing.md,
  },
  reactiveBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: REACTIVE_PINK,
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.95,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveBadgeText: {
    color: REACTIVE_PINK,
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1.4,
  },
  reactiveBadgeDivider: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: typography.tiny,
  },
  reactiveBadgeHandle: {
    color: REACTIVE_PINK,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 0.4,
    maxWidth: 130,
  },
  headlineReactive: {
    color: '#ffd6e6',
    textShadowColor: REACTIVE_PINK,
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  reactiveSessionCard: {
    width: '100%',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.07)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 8,
    marginBottom: spacing.lg,
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  reactiveSessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reactiveSessionTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.small,
    letterSpacing: 1.4,
  },
  reactiveSessionStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  reactiveSessionStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9ca3af',
  },
  reactiveSessionStatusDotActive: {
    backgroundColor: '#22c55e',
  },
  reactiveSessionStatusText: {
    color: colors.text,
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 1,
  },
  reactiveSessionId: {
    color: colors.subtleText,
    fontSize: typography.tiny,
    letterSpacing: 0.4,
  },
  endSessionBtn: {
    minHeight: 40,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(255,0,110,0.10)',
  },
  endSessionBtnDisabled: {
    opacity: 0.5,
  },
  endSessionBtnText: {
    color: REACTIVE_PINK,
    fontWeight: '800',
    fontSize: typography.tiny,
    letterSpacing: 1.2,
  },
  endSessionError: {
    color: '#fca5a5',
    fontSize: typography.tiny,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  reactiveClosedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.45)',
    backgroundColor: 'rgba(0,245,255,0.08)',
  },
  reactiveClosedNoteText: {
    color: REACTIVE_CYAN,
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  primaryReactive: {
    backgroundColor: REACTIVE_PINK,
    borderWidth: 1.5,
    borderColor: REACTIVE_CYAN,
    shadowColor: REACTIVE_PINK,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
});

const celebrationStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  card: {
    width: '100%',
    maxWidth: 280,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  cardWin: {
    borderColor: 'rgba(143, 211, 109, 0.55)',
  },
  cardLose: {
    borderColor: 'rgba(255, 155, 155, 0.55)',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  iconWrapWin: {
    backgroundColor: 'rgba(143, 211, 109, 0.10)',
    borderColor: 'rgba(143, 211, 109, 0.45)',
  },
  iconWrapLose: {
    backgroundColor: 'rgba(255, 155, 155, 0.10)',
    borderColor: 'rgba(255, 155, 155, 0.45)',
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },
  titleWin: {
    color: '#8fd36d',
  },
  titleLose: {
    color: '#ff9b9b',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: typography.small,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  deltaPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  deltaText: {
    fontWeight: '900',
    fontSize: typography.small,
    letterSpacing: 1.2,
  },
  deltaTextWin: {
    color: '#8fd36d',
  },
  deltaTextLose: {
    color: '#ff9b9b',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: spacing.md,
  },
  balanceLabel: {
    color: colors.subtleText,
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 1,
  },
  balanceValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '900',
  },
  errorText: {
    color: colors.warning,
    fontSize: typography.tiny,
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontWeight: '700',
  },
  okButton: {
    minWidth: 120,
    minHeight: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  okButtonWin: {
    backgroundColor: 'rgba(143, 211, 109, 0.14)',
    borderColor: 'rgba(143, 211, 109, 0.65)',
  },
  okButtonLose: {
    backgroundColor: 'rgba(255, 155, 155, 0.12)',
    borderColor: 'rgba(255, 155, 155, 0.65)',
  },
  okButtonDisabled: {
    opacity: 0.5,
  },
  okButtonText: {
    fontSize: typography.small,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  okButtonTextWin: {
    color: '#8fd36d',
  },
  okButtonTextLose: {
    color: '#ff9b9b',
  },
});
