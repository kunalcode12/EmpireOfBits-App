import { AuthBoundary } from '@privy-io/expo';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

/** Root `/` — send Privy-authenticated users to the tab home, not the chess lobby. */
export default function AppIndex() {
  return (
    <AuthBoundary
      loading={
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      }
      unauthenticated={<Redirect href="/privy-auth" />}
    >
      <Redirect href="/(tabs)" />
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
