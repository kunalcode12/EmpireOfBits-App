import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  size?: number;
  color?: string;
}

export default function Joystick({ onMove, size = 140, color = '#00F5FF' }: JoystickProps) {
  const radius = size / 2;
  const thumbRadius = 24;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: 0, y: 0 });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_e, gesture) => {
        let dx = gesture.dx;
        let dy = gesture.dy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = radius - thumbRadius;
        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }
        pan.setValue({ x: dx, y: dy });
        onMove(dx / maxDist, dy / maxDist);
      },
      onPanResponderRelease: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          friction: 5,
        }).start();
        onMove(0, 0);
      },
    }),
  ).current;

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: radius, borderColor: color + '40' }]}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.thumb,
          {
            width: thumbRadius * 2,
            height: thumbRadius * 2,
            borderRadius: thumbRadius,
            backgroundColor: color,
            transform: pan.getTranslateTransform(),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: {
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
});
