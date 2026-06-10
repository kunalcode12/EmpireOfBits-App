import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';

// Targeting-radar loader — an arcade/shooter replacement for the chess spinner.
// A static reticle (ring + crosshair + ticks) with a rotating scan wedge and a
// pulsing lock-on dot.

interface ArenaLoaderProps {
  size?: number;
  color?: string;
}

export default function ArenaLoader({ size = 96, color = '#00F5FF' }: ArenaLoaderProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const c = 50;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });

  return (
    <View style={{ width: size, height: size }}>
      {/* Static reticle */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={46} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.35} />
        <Circle cx={c} cy={c} r={32} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.2} />
        {/* crosshair */}
        <Line x1={c} y1={6} x2={c} y2={20} stroke={color} strokeWidth={2} />
        <Line x1={c} y1={80} x2={c} y2={94} stroke={color} strokeWidth={2} />
        <Line x1={6} y1={c} x2={20} y2={c} stroke={color} strokeWidth={2} />
        <Line x1={80} y1={c} x2={94} y2={c} stroke={color} strokeWidth={2} />
        {/* corner ticks */}
        {[0, 90, 180, 270].map((deg) => (
          <Line
            key={deg}
            x1={c}
            y1={c}
            x2={c}
            y2={c - 46}
            stroke={color}
            strokeWidth={1}
            strokeOpacity={0.12}
            transform={`rotate(${deg + 45} ${c} ${c})`}
          />
        ))}
      </Svg>

      {/* Rotating scan wedge */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="arenaScan" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <G>
            <Path d={`M ${c} ${c} L ${c} 4 A 46 46 0 0 1 ${c + 38} ${c - 26} Z`} fill="url(#arenaScan)" />
            <Line x1={c} y1={c} x2={c} y2={4} stroke={color} strokeWidth={2.5} />
          </G>
        </Svg>
      </Animated.View>

      {/* Lock-on dot */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>
          <Animated.View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: color,
              transform: [{ scale: dotScale }],
              opacity: dotOpacity,
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
