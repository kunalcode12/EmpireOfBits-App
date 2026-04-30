import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import type { ColorPreference, TimeControl } from '../websockets/gameSocket';

export function LobbyScreen() {
  const auth = useAuth();
  const game = useGame();
  const [timeControl, setTimeControl] = useState<TimeControl | null>(null);
  const [colorPreference, setColorPreference] = useState<ColorPreference | null>(null);
  const ready = Boolean(timeControl && colorPreference);

  return (
    <View style={styles.screen}>
      <Pattern />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Signed in as</Text>
          <Text style={styles.title}>{auth.user?.username ?? 'Player'}</Text>
        </View>
        <Pressable style={styles.logout} onPress={auth.logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Time Control</Text>
        <View style={styles.options}>
          <Option selected={timeControl === '5'} title="5 minutes" subtitle="Blitz" onPress={() => setTimeControl('5')} />
          <Option selected={timeControl === '10'} title="10 minutes" subtitle="Rapid" onPress={() => setTimeControl('10')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Colour</Text>
        <View style={styles.options}>
          <Option selected={colorPreference === 'w'} title="White" subtitle="Move first" onPress={() => setColorPreference('w')} />
          <Option selected={colorPreference === 'b'} title="Black" subtitle="Defend first" onPress={() => setColorPreference('b')} />
          <Option selected={colorPreference === 'r'} title="Random" subtitle="Either side" onPress={() => setColorPreference('r')} />
        </View>
      </View>

      {game.toast && <Text style={styles.toast}>{game.toast}</Text>}
      <Pressable
        disabled={!ready}
        style={[styles.play, !ready && styles.disabled]}
        onPress={() => {
          if (timeControl && colorPreference) void game.startMatchmaking(timeControl, colorPreference);
        }}
      >
        <Text style={styles.playText}>Play</Text>
      </Pressable>
    </View>
  );
}

function Option({ selected, title, subtitle, onPress }: { selected: boolean; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.option, selected && styles.optionSelected]} onPress={onPress}>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function Pattern() {
  return (
    <View pointerEvents="none" style={styles.pattern}>
      {Array.from({ length: 64 }).map((_, index) => <View key={index} style={[styles.patternSquare, index % 2 === 0 && styles.patternSquareAlt]} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  pattern: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
    opacity: 0.06,
  },
  patternSquare: {
    width: '12.5%',
    aspectRatio: 1,
    backgroundColor: colors.boardDark,
  },
  patternSquareAlt: {
    backgroundColor: colors.boardLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  eyebrow: {
    color: colors.subtleText,
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: typography.tiny,
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '900',
  },
  logout: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  logoutText: {
    color: colors.mutedText,
    fontWeight: '800',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  options: {
    gap: spacing.md,
  },
  option: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: '#2f3927',
  },
  optionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '900',
  },
  optionSubtitle: {
    color: colors.mutedText,
    marginTop: 3,
  },
  toast: {
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  play: {
    minHeight: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  playText: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
  },
});
