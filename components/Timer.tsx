import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { formatClock } from '../hooks/useTimer';

interface Props {
  seconds: number;
  label: string;
  active: boolean;
}

export function Timer({ seconds, label, active }: Props) {
  const warning = seconds <= 10;
  return (
    <View style={[styles.container, active && styles.active, warning && styles.warning]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.time, warning && styles.warningText]}>{formatClock(seconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 118,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  active: {
    borderColor: colors.accent,
  },
  warning: {
    borderColor: colors.danger,
  },
  label: {
    color: colors.mutedText,
    fontSize: typography.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  time: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    marginTop: 2,
  },
  warningText: {
    color: colors.danger,
  },
});
