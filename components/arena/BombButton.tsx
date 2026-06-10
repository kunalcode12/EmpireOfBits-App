import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getArenaItemImage } from '../../lib/arenaItemImages';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface BombButtonProps {
  itemId: string;
  type: 'frag' | 'cryo';
  icon: string;
  color: string;
  count: number;
  armed?: boolean;
  disabled?: boolean;
  /** tap to equip/arm the bomb (or disarm if already armed) */
  onArm: (itemId: string, type: 'frag' | 'cryo', color: string, count: number) => void;
}

/**
 * Tap to *equip* a bomb. While armed the soldier holds it and a large throw
 * pad (BombAimPad) replaces the fire stick. Tapping again disarms.
 */
export default function BombButton({ itemId, type, icon, color, count, armed, disabled, onArm }: BombButtonProps) {
  const img = getArenaItemImage(itemId);
  const off = disabled || count <= 0;

  return (
    <Pressable
      onPress={() => onArm(itemId, type, color, count)}
      disabled={off}
      style={[
        styles.btn,
        { borderColor: color },
        armed && { backgroundColor: color + '2a', borderWidth: 2.6, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 10, elevation: 8 },
        off && { opacity: 0.4 },
      ]}
    >
      {img ? (
        <Image source={img} style={styles.art} contentFit="contain" />
      ) : (
        <MaterialCommunityIcons name={icon as IconName} size={26} color={color} />
      )}
      <View style={[styles.count, { backgroundColor: color }]}>
        <Text style={styles.countText}>{count}</Text>
      </View>
      <Text style={[styles.label, { color }]}>{armed ? 'ARMED' : 'EQUIP'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 56,
    height: 56,
    borderRadius: 13,
    borderWidth: 1.8,
    backgroundColor: 'rgba(8,9,16,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  art: {
    width: 38,
    height: 38,
  },
  count: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#120c06',
    fontSize: 11,
    fontWeight: '900',
  },
  label: {
    position: 'absolute',
    bottom: -13,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
