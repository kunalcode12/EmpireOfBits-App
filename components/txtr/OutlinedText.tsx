import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { TXTR } from '../../lib/txtr/constants';

// ─── Outlined text ───────────────────────────────────────────────────────────
// The Bold Cartoon Arcade look leans on a 4-way CSS text-shadow to draw a thick
// ink outline around big type (score, combo, banners, logo, popups). RN only
// supports a single text shadow, so we stack four offset copies behind the fill
// copy — plus an optional hard drop shadow, matching `0 7px 0 rgba(...)`.

interface OutlinedTextProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Fill colour of the visible glyphs. */
  color?: string;
  /** Outline thickness in px (the CSS offset). */
  outline?: number;
  outlineColor?: string;
  /** Hard drop shadow offset in px; 0 disables it. */
  dropShadow?: number;
  dropShadowColor?: string;
  numberOfLines?: number;
}

export default function OutlinedText({
  children,
  style,
  containerStyle,
  color = '#ffffff',
  outline = 2,
  outlineColor = TXTR.ink,
  dropShadow = 0,
  dropShadowColor = 'rgba(27,27,43,0.35)',
  numberOfLines,
}: OutlinedTextProps) {
  const offsets: [number, number][] = [
    [-outline, -outline],
    [outline, -outline],
    [-outline, outline],
    [outline, outline],
  ];
  return (
    <View style={containerStyle}>
      {dropShadow > 0 && (
        <Text
          style={[style, styles.ghost, { color: dropShadowColor, transform: [{ translateY: dropShadow }] }]}
          numberOfLines={numberOfLines}
          allowFontScaling={false}
        >
          {children}
        </Text>
      )}
      {offsets.map(([dx, dy], i) => (
        <Text
          key={i}
          style={[
            style,
            styles.ghost,
            { color: outlineColor, transform: [{ translateX: dx }, { translateY: dy }] },
          ]}
          numberOfLines={numberOfLines}
          allowFontScaling={false}
        >
          {children}
        </Text>
      ))}
      <Text style={[style, { color }]} numberOfLines={numberOfLines} allowFontScaling={false}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
