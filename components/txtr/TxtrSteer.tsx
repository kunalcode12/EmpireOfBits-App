import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { TXTR } from '../../lib/txtr/constants';
import { HardShadow } from './overlays/Panel';

// ─── Steering ────────────────────────────────────────────────────────────────
// Both arrows live together in the bottom-left corner, thumb-width apart, so one
// hand steers while the other works the pedals on the right. A horizontal drag
// anywhere on the road still works as a shortcut.

const SWIPE_STEP = 28; // px of travel per lane change

interface TxtrSteerProps {
  onSteer: (dir: number) => void;
  width: number;
  height: number;
  /** Distance from the bottom of the play field to the pad. */
  buttonsBottom: number;
  /** Horizontal inset (safe area / notch in landscape). */
  sidePad: number;
  enabled: boolean;
}

function ArrowKey({ dir, onPress }: { dir: -1 | 1; onPress: (d: number) => void }) {
  return (
    <Pressable onPressIn={() => onPress(dir)} hitSlop={6}>
      {({ pressed }) => (
        <HardShadow depth={6} radius={16} pressed={pressed}>
          <View style={[styles.key, pressed && styles.keyPressed]}>
            <Text style={styles.keyGlyph} allowFontScaling={false}>
              {dir === -1 ? '◀' : '▶'}
            </Text>
          </View>
        </HardShadow>
      )}
    </Pressable>
  );
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
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          enabledRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
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
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );

  return (
    <View style={[styles.layer, { height }]} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} {...responder.panHandlers} pointerEvents="box-only" />
      {enabled && (
        <View style={[styles.pad, { left: sidePad, bottom: buttonsBottom }]}>
          <ArrowKey dir={-1} onPress={onSteer} />
          <View style={styles.gap} />
          <ArrowKey dir={1} onPress={onSteer} />
        </View>
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
  pad: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  gap: {
    width: 10,
  },
  key: {
    width: 66,
    height: 60,
    borderRadius: 16,
    borderWidth: 3.5,
    borderColor: TXTR.ink,
    backgroundColor: TXTR.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: TXTR.yellow,
  },
  keyGlyph: {
    color: TXTR.ink,
    fontSize: 24,
    fontWeight: '900',
    marginTop: -2,
  },
});
