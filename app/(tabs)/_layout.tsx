import { Ionicons } from '@expo/vector-icons';
import { AuthBoundary } from '@privy-io/expo';
import { Redirect, Tabs, useSegments } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePersistPrivySolanaAddress } from '../../hooks/usePersistPrivySolanaAddress';

const ACCENT = '#FFD700';
const INACTIVE = '#7A7A90';
const TAB_BG = '#0A0A0F';

export default function TabsLayout() {
  usePersistPrivySolanaAddress();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const leafRoute = segments[segments.length - 1] as string;
  const hideTabBar = leafRoute === 'game' || leafRoute === 'lobby' || leafRoute === 'matchmaking';

  return (
    <AuthBoundary
      loading={
        <View style={styles.privyLoading}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      }
      unauthenticated={<Redirect href="/privy-auth" />}
    >
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: INACTIVE,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: hideTabBar
          ? { display: 'none' }
          : {
              ...styles.tabBar,
              bottom: insets.bottom + 8,
            },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: 'Play',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="game-controller" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />

    </Tabs>
    </AuthBoundary>
  );
}

const styles = StyleSheet.create({
  privyLoading: {
    flex: 1,
    backgroundColor: '#05050F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 64,
    backgroundColor: TAB_BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 18,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
});
