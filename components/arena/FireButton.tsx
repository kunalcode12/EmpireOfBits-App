import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

interface FireButtonProps {
  onShootStart: () => void;
  onShootEnd: () => void;
  weapon: string;
  ammo: number;
  /** EMP Jam item: weapon disabled — dim the button and block firing. */
  disabled?: boolean;
}

const WEAPON_ICON: Record<string, string> = {
  blaster: 'flash',
  shotgun: 'pistol',
  rocket: 'rocket-launch',
  smg: 'pistol',
  scatter: 'ammunition',
  laser: 'flash-outline',
  rail: 'crosshairs',
};

const WEAPON_COLOR: Record<string, string> = {
  blaster: '#FFE600',
  shotgun: '#f97316',
  rocket: '#ef4444',
  smg: '#FFE600',
  scatter: '#f97316',
  laser: '#19f0ff',
  rail: '#c084fc',
};

export default function FireButton({ onShootStart, onShootEnd, weapon, ammo, disabled }: FireButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, friction: 4 }).start();
    onShootStart();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    onShootEnd();
  };

  const wColor = disabled ? '#a855f7' : WEAPON_COLOR[weapon] ?? '#FFE600';

  return (
    <View style={[styles.wrapper, disabled && { opacity: 0.55 }]}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={[styles.btn, { borderColor: wColor, transform: [{ scale }] }]}>
          <MaterialCommunityIcons
            name={(disabled ? 'flash-off' : WEAPON_ICON[weapon]) as keyof typeof MaterialCommunityIcons.glyphMap}
            size={28}
            color={wColor}
          />
        </Animated.View>
      </Pressable>
      <Text style={[styles.ammo, { color: wColor }]}>
        {disabled ? 'JAMMED' : ammo < 0 ? '∞' : ammo}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  btn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,70,70,0.15)',
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  ammo: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
});
