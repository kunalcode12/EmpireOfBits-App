import { Ionicons } from '@expo/vector-icons';
import { AuthBoundary } from '@privy-io/expo';
import { Redirect, Tabs, useSegments } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { usePersistPrivySolanaAddress } from '../../hooks/usePersistPrivySolanaAddress';

const ACCENT = '#FFD700';
const ACCENT_DIM = 'rgba(255, 215, 0, 0.55)';
const INACTIVE = '#6b7280';
const TAB_BG = '#070707';
const HAIRLINE = 'rgba(255,215,0,0.28)';
const HAIRLINE_GLOW = 'rgba(255,215,0,0.08)';

type RouteName = 'index' | 'play' | 'wallet' | 'profile';

const ROUTE_META: Record<
  RouteName,
  {
    active: keyof typeof Ionicons.glyphMap;
    inactive: keyof typeof Ionicons.glyphMap;
    label: string;
  }
> = {
  index: { active: 'home', inactive: 'home-outline', label: 'HOME' },
  play: { active: 'game-controller', inactive: 'game-controller-outline', label: 'PLAY' },
  wallet: { active: 'wallet', inactive: 'wallet-outline', label: 'WALLET' },
  profile: { active: 'person-circle', inactive: 'person-circle-outline', label: 'PROFILE' },
};

function ArcadeTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { bottom: Math.max(insets.bottom, 10) + 6 }]}>
      <View style={styles.tabBarHairline} />
      <View style={styles.tabBarHairlineGlow} />
      <View style={styles.tabBarRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const meta =
            ROUTE_META[route.name as RouteName] ?? {
              active: 'ellipse',
              inactive: 'ellipse-outline',
              label: (route.name ?? '').toUpperCase(),
            };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.65 }]}
              android_ripple={{ color: 'rgba(255,215,0,0.12)', borderless: true }}
            >
              <View style={[styles.tabIndicator, isFocused && styles.tabIndicatorActive]} />
              <View style={styles.tabIconWrap}>
                {isFocused ? <View style={styles.tabIconGlow} /> : null}
                <Ionicons
                  name={isFocused ? meta.active : meta.inactive}
                  size={isFocused ? 28 : 25}
                  color={isFocused ? ACCENT : INACTIVE}
                  style={isFocused ? styles.tabIconActive : undefined}
                />
              </View>
              {isFocused ? <View style={styles.tabBaseDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  usePersistPrivySolanaAddress();
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
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (hideTabBar ? null : <ArcadeTabBar {...props} />)}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="play" options={{ title: 'Play' }} />
        <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
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
    left: 18,
    right: 18,
    backgroundColor: TAB_BG,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  tabBarHairline: {
    height: 1,
    backgroundColor: HAIRLINE,
  },
  tabBarHairlineGlow: {
    height: 1,
    backgroundColor: HAIRLINE_GLOW,
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    minHeight: 56,
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    width: 56,
    height: 3,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.95,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  tabIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconGlow: {
    position: 'absolute',
    width: 64,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
  },
  tabIconActive: {
    textShadowColor: ACCENT_DIM,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  tabBaseDot: {
    position: 'absolute',
    bottom: 0,
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
