import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';
import { formatMoveText, type ChessMove } from '../utils/chessHelpers';

interface Props {
  moves: ChessMove[];
}

export function MoveHistory({ moves }: Props) {
  const ref = useRef<ScrollView | null>(null);
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]] as const);

  useEffect(() => {
    ref.current?.scrollToEnd({ animated: true });
  }, [moves.length]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Moves</Text>
      <ScrollView ref={ref} style={styles.list} contentContainerStyle={styles.content}>
        {rows.map(([white, black], index) => (
          <View key={`${index}-${white?.from ?? 'x'}`} style={styles.row}>
            <Text style={styles.number}>{index + 1}.</Text>
            <Text style={styles.move}>{formatMoveText(white ?? null, index * 2)}</Text>
            <Text style={styles.move}>{black ? formatMoveText(black, index * 2 + 1) : ''}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxHeight: 150,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  list: {
    minHeight: 74,
  },
  content: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  number: {
    width: 34,
    color: colors.subtleText,
    fontWeight: '700',
  },
  move: {
    flex: 1,
    color: colors.mutedText,
    fontSize: typography.small,
    fontWeight: '700',
  },
});
