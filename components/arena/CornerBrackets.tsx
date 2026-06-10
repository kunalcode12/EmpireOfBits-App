import React from 'react';
import { StyleSheet, View } from 'react-native';

// Tactical HUD corner brackets drawn over a panel — gives the Arena UI an
// angular "armory frame" feel instead of soft rounded cards.

interface CornerBracketsProps {
  color: string;
  size?: number;
  thickness?: number;
  inset?: number;
}

export default function CornerBrackets({ color, size = 13, thickness = 2, inset = 5 }: CornerBracketsProps) {
  const base = { position: 'absolute' as const, width: size, height: size, borderColor: color };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[base, { top: inset, left: inset, borderTopWidth: thickness, borderLeftWidth: thickness }]} />
      <View style={[base, { top: inset, right: inset, borderTopWidth: thickness, borderRightWidth: thickness }]} />
      <View style={[base, { bottom: inset, left: inset, borderBottomWidth: thickness, borderLeftWidth: thickness }]} />
      <View style={[base, { bottom: inset, right: inset, borderBottomWidth: thickness, borderRightWidth: thickness }]} />
    </View>
  );
}
