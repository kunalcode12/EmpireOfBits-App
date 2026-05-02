import * as Font from 'expo-font';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';

export default function PlayScreen() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Font.loadAsync({ PressStart2P: PRESS_START_2P_URI })
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PLAY</Text>
      <Text style={styles.subtitle}>Coming Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050F',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  title: {
    fontFamily: 'PressStart2P',
    color: '#FFD700',
    fontSize: 16,
  },
  subtitle: {
    color: '#A0A0C0',
    fontSize: 14,
    fontWeight: '600',
  },
});
