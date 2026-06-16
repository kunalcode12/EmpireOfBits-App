import { Image } from 'expo-image';
import React, { useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { getArenaItemImage } from '../../lib/arenaItemImages';

interface BombAimPadProps {
  itemId: string;
  type: 'frag' | 'cryo';
  color: string;
  count: number;
  size?: number;
  /** live aim while dragging (normalized dir + 0..1 power) */
  onAimMove: (dirX: number, dirY: number, power: number) => void;
  /** release past the deadzone throws */
  onThrow: (itemId: string, dirX: number, dirY: number, power: number) => void;
  onCancel: () => void;
}

/**
 * Large throw-aim joystick shown once a bomb is "armed" (held in hand).
 * Drag to set direction + power (the canvas draws the trajectory + landing
 * blast), release past the deadzone to throw. The ✕ chip disarms.
 */
export default function BombAimPad({ itemId, type, color, count, size = 150, onAimMove, onThrow, onCancel }: BombAimPadProps) {
  const radius = size / 2;
  const thumbR = 34;
  const maxDist = radius - thumbR + 4;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const last = useRef({ nx: 0, ny: 0, power: 0 });
  const img = getArenaItemImage(itemId);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        last.current = { nx: 0, ny: 0, power: 0 };
      },
      onPanResponderMove: (_e, g) => {
        const dist = Math.sqrt(g.dx * g.dx + g.dy * g.dy) || 0;
        let tx = g.dx;
        let ty = g.dy;
        if (dist > maxDist) {
          tx = (g.dx / dist) * maxDist;
          ty = (g.dy / dist) * maxDist;
        }
        pan.setValue({ x: tx, y: ty });
        const nx = dist > 0.001 ? g.dx / dist : 0;
        const ny = dist > 0.001 ? g.dy / dist : 0;
        const power = Math.min(1, dist / maxDist);
        last.current = { nx, ny, power };
        onAimMove(nx, ny, power);
      },
      onPanResponderRelease: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start();
        const l = last.current;
        // Any deliberate drag throws — even a tiny one, so you can drop a bomb
        // close to yourself / at a short distance.
        if (l.power > 0.02) {
          onThrow(itemId, l.nx, l.ny, l.power);
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start();
      },
    }),
  ).current;

  return (
    <View style={[styles.wrap, { width: size, height: size + 24 }]}>
      {/* cancel / unequip chip */}
      <Pressable onPress={onCancel} style={[styles.cancel, { borderColor: color }]} hitSlop={8}>
        <Text style={[styles.cancelText, { color }]}>✕ UNARM</Text>
      </Pressable>

      <View style={[styles.base, { width: size, height: size, borderRadius: radius, borderColor: color + '55' }]}>
        <Text style={[styles.hint, { color }]}>DRAG ▸ AIM</Text>
        <Text style={[styles.count, { color }]}>{count} LEFT</Text>
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.thumb,
            {
              width: thumbR * 2,
              height: thumbR * 2,
              borderRadius: thumbR,
              borderColor: color,
              shadowColor: color,
              transform: pan.getTranslateTransform(),
            },
          ]}
        >
          {img ? (
            <Image source={img} style={styles.art} contentFit="contain" />
          ) : (
            <View style={[styles.dot, { backgroundColor: color }]} />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  cancel: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: 'rgba(8,9,16,0.9)',
    zIndex: 2,
  },
  cancelText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  base: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    position: 'absolute',
    top: 10,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    opacity: 0.75,
  },
  count: {
    position: 'absolute',
    bottom: 10,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    opacity: 0.75,
  },
  thumb: {
    backgroundColor: 'rgba(12,10,18,0.94)',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 7,
  },
  art: {
    width: 40,
    height: 40,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
