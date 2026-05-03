import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { PrivyProvider } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { PRIVY_APP_ID, PRIVY_CLIENT_ID, privyConfigured } from '../constants/privyConfig';
import { AuthProvider } from '../store/AuthContext';
import { GameProvider } from '../store/GameContext';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (!privyConfigured) {
    return (
      <View style={styles.configMissing}>
        <Text style={styles.configTitle}>Privy configuration required</Text>
        <Text style={styles.configBody}>
          Set EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID in a root .env file, or set
          expo.extra.privyAppId and privyClientId in app.json. Restart Expo after changing environment
          variables.
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  const scheme = colorScheme === 'light' ? 'light' : 'dark';

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{
        embedded: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <PrivyElements
        config={{
          appearance: {
            colorScheme: scheme,
            accentColor: '#FFD700',
          },
        }}
      />
      <ThemeProvider value={DarkTheme}>
        <AuthProvider>
          <GameProvider>
            <Stack initialRouteName="privy-auth" screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="privy-auth" />
              <Stack.Screen name="index" />
              <Stack.Screen name="auth-flow" />
              <Stack.Screen name="(tabs)" />
            </Stack>
            <StatusBar style="light" />
          </GameProvider>
        </AuthProvider>
      </ThemeProvider>
    </PrivyProvider>
  );
}

const styles = StyleSheet.create({
  configMissing: {
    flex: 1,
    backgroundColor: '#05050F',
    justifyContent: 'center',
    padding: 24,
  },
  configTitle: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  configBody: {
    color: '#A0A0C0',
    fontSize: 15,
    lineHeight: 22,
  },
});
