import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface AimStickProps {
  weapon: string;
  ammo: number;
  disabled?: boolean;
  size?: number;
  /** active fire begins */
  onAimStart: () => void;
  /** normalized aim direction (magnitude 0..1); (0,0) = fire in move direction */
  onAimMove: (dirX: number, dirY: number) => void;
  onAimEnd: () => void;
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

export default function AimStick({ weapon, ammo, disabled, size = 146, onAimStart, onAimMove, onAimEnd }: AimStickProps) {
  const radius = size / 2;
  const thumbR = 36;
  // larger throw = the same finger move sweeps a smaller angle = finer aim
  const maxDist = radius - thumbR + 16;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // remembers the last real aim so micro-moves near center keep the gun pointed
  // where you put it (instead of snapping back to "fire forward")
  const lastDir = useRef({ x: 0, y: 0 });
  const engaged = useRef(false);

  const wColor = disabled ? '#a855f7' : WEAPON_COLOR[weapon] ?? '#FFE600';
  const wIcon = (disabled ? 'flash-off' : WEAPON_ICON[weapon] ?? 'flash') as IconName;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: () => {
        pan.setValue({ x: 0, y: 0 });
        lastDir.current = { x: 0, y: 0 };
        engaged.current = false;
        onAimStart();
        onAimMove(0, 0);
      },
      onPanResponderMove: (_e, g) => {
        let dx = g.dx;
        let dy = g.dy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0;
        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }
        pan.setValue({ x: dx, y: dy });
        // Small engage threshold; once you've started aiming, tiny moves near
        // the center keep the LAST direction so you can fine-tune smoothly
        // instead of snapping back to "fire forward".
        if (dist >= 8) {
          const nx = dx / dist;
          const ny = dy / dist;
          lastDir.current = { x: nx, y: ny };
          engaged.current = true;
          onAimMove(nx, ny);
        } else if (engaged.current) {
          onAimMove(lastDir.current.x, lastDir.current.y);
        } else {
          onAimMove(0, 0);
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start();
        engaged.current = false;
        onAimEnd();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start();
        engaged.current = false;
        onAimEnd();
      },
    }),
  ).current;

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: radius, borderColor: wColor + '44', opacity: disabled ? 0.55 : 1 }]}>
      <Text style={[styles.hint, { color: wColor }]}>AIM • FIRE</Text>
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.thumb,
          {
            width: thumbR * 2,
            height: thumbR * 2,
            borderRadius: thumbR,
            borderColor: wColor,
            shadowColor: wColor,
            transform: pan.getTranslateTransform(),
          },
        ]}
      >
        <MaterialCommunityIcons name={wIcon} size={30} color={wColor} />
        <Text style={[styles.ammo, { color: wColor }]}>{disabled ? 'JAM' : ammo < 0 ? '∞' : ammo}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    position: 'absolute',
    top: 8,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    opacity: 0.7,
  },
  thumb: {
    backgroundColor: 'rgba(12,10,18,0.92)',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 6,
  },
  ammo: {
    fontSize: 11,
    fontWeight: '900',
    marginTop: 1,
  },
});
