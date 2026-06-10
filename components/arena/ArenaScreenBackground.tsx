import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Pattern, Rect, RadialGradient, Stop } from 'react-native-svg';

// Bright arcade backdrop shared by the Arena lobby / shop: layered neon glow
// blobs, a faint grid, and a slow scan beam. Decorative only (pointerEvents off).

export default function ArenaScreenBackground({ scanlines = false }: { scanlines?: boolean }) {
  const { width, height } = useWindowDimensions();
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(scan, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ).start();
  }, [scan]);

  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [-40, height] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bgBase" x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0%" stopColor="#241a12" />
            <Stop offset="55%" stopColor="#140f0a" />
            <Stop offset="100%" stopColor="#0a0705" />
          </LinearGradient>
          <RadialGradient id="glowCyan" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#ff7a33" stopOpacity={0.32} />
            <Stop offset="100%" stopColor="#ff7a33" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowPink" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.22} />
            <Stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowPurple" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#ecb53f" stopOpacity={0.16} />
            <Stop offset="100%" stopColor="#ecb53f" stopOpacity={0} />
          </RadialGradient>
          <Pattern id="scanlines" x={0} y={0} width={3} height={4} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0.5} x2={3} y2={0.5} stroke="#000000" strokeWidth={1} strokeOpacity={0.22} />
          </Pattern>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#bgBase)" />
        <Circle cx={width * 0.16} cy={height * 0.18} r={width * 0.4} fill="url(#glowCyan)" />
        <Circle cx={width * 0.9} cy={height * 0.85} r={width * 0.45} fill="url(#glowPink)" />
        <Circle cx={width * 0.62} cy={height * 0.3} r={width * 0.36} fill="url(#glowPurple)" />
        {scanlines && <Rect x={0} y={0} width={width} height={height} fill="url(#scanlines)" />}
      </Svg>

      {/* faint grid */}
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={`h${i}`} style={[styles.hLine, { top: `${(i + 1) * 9}%` }]} />
      ))}
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={`v${i}`} style={[styles.vLine, { left: `${(i + 1) * 7}%` }]} />
      ))}

      {/* scan beam */}
      <Animated.View style={[styles.scan, { width, transform: [{ translateY }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(120,200,255,0.05)',
  },
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(120,200,255,0.04)',
  },
  scan: {
    position: 'absolute',
    height: 90,
    backgroundColor: 'rgba(0,229,255,0.05)',
  },
});
