import { Ionicons } from '@expo/vector-icons';
import { usePrivy } from '@privy-io/expo';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getPrivyDisplayName, getPrivyEmail } from '../utils/privyUser';

const BG = '#0E0E1F';
const GOLD = '#FFD700';
const MUTED = '#A0A0C0';

export function PrivyUserBanner() {
  const { user, isReady } = usePrivy();

  if (!isReady) {
    return (
      <View style={[styles.wrap, styles.loadingWrap]}>
        <ActivityIndicator size="small" color={GOLD} />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  if (!user) return null;

  const email = getPrivyEmail(user);
  const name = getPrivyDisplayName(user);
  const subtitle = email ?? `${user.id.slice(0, 10)}…`;

  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name="person" size={22} color={GOLD} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.label}>Signed in</Text>
        <Text style={styles.title} numberOfLines={1}>
          {name ?? 'Empire player'}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BG,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.18)',
  },
  loadingWrap: {
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  email: {
    fontSize: 14,
    fontWeight: '500',
    color: GOLD,
  },
});
