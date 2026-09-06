import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

// ─── Steering ────────────────────────────────────────────────────────────────
// Three redundant inputs:
//   1. the ◀ ▶ buttons (the `.steer` circles from the web build),
//   2. tapping the left / right third of the play field,
//   3. a horizontal drag anywhere on the play field.
// The web build steered with arrow keys and a trackpad swipe; on a phone touch
// has to carry all of it.

const SWIPE_STEP = 28; // px of travel per lane change
const TAP_SLOP = 10;

interface TxtrSteerProps {
  onSteer: (dir: number) => void;
  width: number;
  height: number;
  /** Distance from the bottom of the play field to the steer buttons. */
  buttonsBottom: number;
  /** Horizontal inset for the buttons (safe area / notch in landscape). */
  sidePad: number;
  enabled: boolean;
}

export default function TxtrSteer({
  onSteer,
  width,
  height,
  buttonsBottom,
  sidePad,
  enabled,
}: TxtrSteerProps) {
  const steerRef = useRef(onSteer);
  steerRef.current = onSteer;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const widthRef = useRef(width);
  widthRef.current = width;
  const lastFire = useRef(0);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: (_e, g) =>
          enabledRef.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          lastFire.current = 0;
        },
        onPanResponderMove: (_e, g) => {
          if (!enabledRef.current) return;
          const delta = g.dx - lastFire.current;
          if (delta >= SWIPE_STEP) {
            steerRef.current(1);
            lastFire.current += SWIPE_STEP;
          } else if (delta <= -SWIPE_STEP) {
            steerRef.current(-1);
            lastFire.current -= SWIPE_STEP;
          }
        },
        onPanResponderRelease: (e, g) => {
          if (!enabledRef.current) return;
          if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) return; // was a drag
          const x = e.nativeEvent.locationX / Math.max(1, widthRef.current);
          if (x < 0.33) steerRef.current(-1);
          else if (x > 0.67) steerRef.current(1);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );

  return (
    <View style={[styles.layer, { height }]} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
      {enabled && (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.steer,
              { bottom: buttonsBottom, left: sidePad },
              pressed && styles.steerPressed,
            ]}
            onPressIn={() => onSteer(-1)}
            hitSlop={8}
          >
            <Text style={styles.steerGlyph} allowFontScaling={false}>
              ◀
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.steer,
              { bottom: buttonsBottom, right: sidePad },
              pressed && styles.steerPressed,
            ]}
            onPressIn={() => onSteer(1)}
            hitSlop={8}
          >
            <Text style={styles.steerGlyph} allowFontScaling={false}>
              ▶
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  steer: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(27,27,43,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  steerPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.92 }],
  },
  steerGlyph: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
});
