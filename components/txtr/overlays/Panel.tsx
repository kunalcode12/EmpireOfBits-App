import { BlurView } from 'expo-blur';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { TXTR } from '../../../lib/txtr/constants';

// ─── Cartoon UI primitives ───────────────────────────────────────────────────
// The web theme is built on thick ink borders plus *hard* offset shadows
// (`box-shadow: 0 8px 0 ink`). RN shadows are always soft, so a hard shadow is
// drawn as an ink block behind the element, revealed by bottom padding — and
// removed while pressed, reproducing `:active { translateY(...) }`.

interface HardShadowProps {
  children: React.ReactNode;
  depth?: number;
  radius?: number;
  color?: string;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function HardShadow({
  children,
  depth = 5,
  radius = 14,
  color = TXTR.ink,
  pressed = false,
  style,
}: HardShadowProps) {
  const drop = pressed ? Math.max(1, depth - 3) : depth;
  return (
    <View
      style={[
        { backgroundColor: color, borderRadius: radius, paddingBottom: drop },
        pressed ? { transform: [{ translateY: depth - drop }] } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* --- Buttons -------------------------------------------------------------- */

interface BigButtonProps {
  label: string;
  onPress: () => void;
  color?: string;
  fontFamily?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function BigButton({
  label,
  onPress,
  color = TXTR.red,
  fontFamily,
  style,
  disabled,
}: BigButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      {({ pressed }) => (
        <HardShadow depth={8} radius={18} pressed={pressed}>
          <View style={[styles.bigBtn, { backgroundColor: color }, disabled && styles.disabled]}>
            <Text style={[styles.bigBtnText, fontFamily ? { fontFamily } : null]} allowFontScaling={false}>
              {label}
            </Text>
          </View>
        </HardShadow>
      )}
    </Pressable>
  );
}

interface GhostButtonProps {
  label: string;
  onPress: () => void;
  active?: boolean;
  trailing?: string;
  fontFamily?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function GhostButton({
  label,
  onPress,
  active,
  trailing,
  fontFamily,
  style,
  disabled,
}: GhostButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.ghostWrap, style]}>
      {({ pressed }) => (
        <HardShadow depth={4} radius={14} pressed={pressed}>
          <View style={[styles.ghostBtn, active && styles.ghostBtnOn, disabled && styles.disabled]}>
            <Text
              style={[styles.ghostText, active && styles.ghostTextOn, fontFamily ? { fontFamily } : null]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {label}
              {trailing ? ' ' : ''}
              {trailing ? (
                <Text style={[styles.ghostTrailing, active && styles.ghostTextOn]}>{trailing}</Text>
              ) : null}
            </Text>
          </View>
        </HardShadow>
      )}
    </Pressable>
  );
}

interface ModeButtonProps {
  label: string;
  onPress: () => void;
  active: boolean;
  fontFamily?: string;
}

export function ModeButton({ label, onPress, active, fontFamily }: ModeButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.modeWrap}>
      {({ pressed }) => (
        <HardShadow depth={4} radius={14} pressed={pressed}>
          <View style={[styles.modeBtn, active && styles.modeBtnOn]}>
            <Text style={[styles.modeText, fontFamily ? { fontFamily } : null]} allowFontScaling={false}>
              {label}
            </Text>
          </View>
        </HardShadow>
      )}
    </Pressable>
  );
}

/* --- Panel + scrim -------------------------------------------------------- */

interface CartoonPanelProps {
  children: React.ReactNode;
  /** Wide panels (garage / trophies) get more width and left-aligned content. */
  wide?: boolean;
  small?: boolean;
  /** Landscape trades height for width — panels grow sideways instead of scrolling. */
  landscape?: boolean;
  maxHeight?: number;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function CartoonPanel({
  children,
  wide,
  small,
  landscape,
  maxHeight,
  scroll = true,
  style,
}: CartoonPanelProps) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const inner = [styles.panelInner, landscape && styles.panelInnerLandscape];
  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={inner}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={inner}>{children}</View>
  );

  return (
    <Animated.View
      style={[
        styles.panel,
        wide ? styles.panelWide : small ? styles.panelSmall : null,
        landscape ? (wide ? styles.panelWideLand : small ? styles.panelSmallLand : styles.panelLand) : null,
        maxHeight ? { maxHeight } : null,
        { opacity: anim, transform: [{ translateY }, { scale }] },
        style,
      ]}
    >
      {body}
    </Animated.View>
  );
}

interface ScreenScrimProps {
  children: React.ReactNode;
  /** Extra padding so panels clear the notch / nav bar. */
  insets?: { top: number; bottom: number };
}

export function ScreenScrim({ children, insets }: ScreenScrimProps) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]}>
      <BlurView intensity={14} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.scrimTint} />
      </View>
      <View
        style={[
          styles.scrimBody,
          insets ? { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 } : null,
        ]}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/* --- Small bits ----------------------------------------------------------- */

/** Square back chip pinned to the top-left of a panel's header row. */
export function BackButton({ onPress, label = '◀' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      {({ pressed }) => (
        <HardShadow depth={4} radius={12} pressed={pressed}>
          <View style={styles.backBtn}>
            <Text style={styles.backGlyph} allowFontScaling={false}>
              {label}
            </Text>
          </View>
        </HardShadow>
      )}
    </Pressable>
  );
}

export function PanelTitle({ children, fontFamily, style }: { children: React.ReactNode; fontFamily?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.panelTitle, fontFamily ? { fontFamily } : null, style]} allowFontScaling={false}>
      {children}
    </Text>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  scrim: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrimTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27,27,43,0.45)',
  },
  scrimBody: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '100%',
    backgroundColor: TXTR.paper,
    borderWidth: 5,
    borderColor: TXTR.ink,
    borderRadius: 30,
    overflow: 'hidden',
  },
  panelWide: {
    maxWidth: 560,
  },
  panelSmall: {
    maxWidth: 340,
  },
  panelLand: {
    maxWidth: 700,
  },
  panelWideLand: {
    maxWidth: 900,
  },
  panelSmallLand: {
    maxWidth: 420,
  },
  panelInner: {
    padding: 22,
  },
  panelInnerLandscape: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 44,
    height: 38,
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: 15,
    fontWeight: '900',
    color: TXTR.ink,
  },
  bigBtn: {
    borderWidth: 4,
    borderColor: TXTR.ink,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  bigBtnText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  ghostWrap: {
    flex: 1,
    // Tuned so the three-up row (Garage / Trophies / Daily) sits on one line in
    // a landscape column, and wraps the last button onto its own full-width line
    // on narrower screens instead of squeezing all three — the same behaviour the
    // web build got from `.ghost-btn { min-width: 110px }` plus a wrapping row.
    flexShrink: 1,
    minWidth: 106,
  },
  ghostBtn: {
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  ghostBtnOn: {
    backgroundColor: TXTR.green,
  },
  ghostText: {
    color: TXTR.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  ghostTextOn: {
    color: '#ffffff',
  },
  ghostTrailing: {
    color: TXTR.red,
    fontWeight: '900',
  },
  modeWrap: {
    flex: 1,
  },
  modeBtn: {
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeBtnOn: {
    backgroundColor: TXTR.yellow,
  },
  modeText: {
    color: TXTR.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  panelTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: TXTR.ink,
    textAlign: 'center',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  disabled: {
    opacity: 0.6,
  },
});
