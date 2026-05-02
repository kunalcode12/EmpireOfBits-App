import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '../store/AuthContext';
import { GameProvider } from '../store/GameContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <AuthProvider>
        <GameProvider>
          <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth-flow" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <StatusBar style="light" />
        </GameProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
