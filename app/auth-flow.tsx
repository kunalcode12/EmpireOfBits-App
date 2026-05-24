import { AuthBoundary } from '@privy-io/expo';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { AuthScreen } from '../screens/AuthScreen';
import { GameScreen } from '../screens/GameScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { MatchmakingScreen } from '../screens/MatchmakingScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import { usePoints } from '../store/PointsContext';

const CHESS_ENTRY_COST = 50;

function AuthFlowContent() {
  const auth = useAuth();
  const game = useGame();
  const { applyPointsDelta } = usePoints();
  const prevPhaseRef = useRef(game.phase);
  const refundedRef = useRef(false);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = game.phase;

    if (
      prev === 'matchmaking' &&
      game.phase === 'idle' &&
      game.toast &&
      !refundedRef.current
    ) {
      refundedRef.current = true;
      void applyPointsDelta(CHESS_ENTRY_COST).catch(() => {});
      game.clearToast();
      router.replace('/(tabs)/play');
    }
  }, [game.phase, game.toast, applyPointsDelta, game.clearToast]);

  if (auth.initializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!auth.user) return <AuthScreen />;
  if (game.phase === 'matchmaking') return <MatchmakingScreen />;
  if (game.phase === 'active') return <GameScreen />;
  if (game.phase === 'finished') return <ResultScreen />;
  return <LobbyScreen />;
}

export default function AuthFlowScreen() {
  return (
    <AuthBoundary
      loading={
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      }
      unauthenticated={<Redirect href="/privy-auth" />}
    >
      <AuthFlowContent />
    </AuthBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
