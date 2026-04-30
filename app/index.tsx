import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import { AuthScreen } from '../screens/AuthScreen';
import { GameScreen } from '../screens/GameScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { MatchmakingScreen } from '../screens/MatchmakingScreen';
import { ResultScreen } from '../screens/ResultScreen';

export default function AppIndex() {
  const auth = useAuth();
  const game = useGame();

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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
