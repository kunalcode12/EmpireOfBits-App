import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BRAKE_FLOOR, THROTTLE_TOP, TXTR } from '../../lib/txtr/constants';
import { HardShadow } from './overlays/Panel';

// ─── Pedals ──────────────────────────────────────────────────────────────────
// Gas and brake, held rather than tapped, with a speed gauge above them. The
// gauge reads the live speed against the road's cruise pace so you can see the
// car pulling ahead of (or falling behind) the pack.

interface TxtrPedalsProps {
  onThrottle: (down: boolean) => void;
  onBrake: (down: boolean) => void;
  /** speed / cruise — 1.0 is coasting at the road's own pace. */
  speedRatio: number;
  /** Nitro active: the ceiling is higher and the gauge goes purple. */
  boosting: boolean;
  bottom: number;
  sidePad: number;
  enabled: boolean;
}

function SpeedGauge({ ratio, boosting }: { ratio: number; boosting: boolean }) {
  // Map the usable band (brake floor → throttle ceiling) onto 0..1.
  const span = THROTTLE_TOP - BRAKE_FLOOR;
  const frac = Math.max(0, Math.min(1, (ratio - BRAKE_FLOOR) / span));
  const hot = ratio > 1.35;
  const color = boosting ? TXTR.magnetPurple : hot ? TXTR.red : ratio > 1.05 ? TXTR.yellow : TXTR.green;
  return (
    <View style={styles.gauge}>
      <View style={[styles.gaugeFill, { width: `${frac * 100}%`, backgroundColor: color }]} />
      {/* the cruise mark: sitting on it means you are matching the road */}
      <View style={[styles.gaugeTick, { left: `${((1 - BRAKE_FLOOR) / span) * 100}%` }]} />
    </View>
  );
}

function Pedal({
  label,
  glyph,
  color,
  big,
  onDown,
}: {
  label: string;
  glyph: string;
  color: string;
  big?: boolean;
  onDown: (down: boolean) => void;
}) {
  const [held, setHeld] = useState(false);
  const press = useCallback(
    (down: boolean) => {
      setHeld(down);
      onDown(down);
    },
    [onDown],
  );

  return (
    <Pressable
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      hitSlop={6}
      // a finger sliding off the pedal must release it, not stick on
      onTouchCancel={() => press(false)}
    >
      <HardShadow depth={held ? 2 : 7} radius={18} pressed={held}>
        <View
          style={[
            styles.pedal,
            big ? styles.pedalBig : styles.pedalSmall,
            { backgroundColor: color },
            held && styles.pedalHeld,
          ]}
        >
          <Text style={[styles.pedalGlyph, big && styles.pedalGlyphBig]} allowFontScaling={false}>
            {glyph}
          </Text>
          <Text style={styles.pedalLabel} allowFontScaling={false}>
            {label}
          </Text>
        </View>
      </HardShadow>
    </Pressable>
  );
}

export default function TxtrPedals({
  onThrottle,
  onBrake,
  speedRatio,
  boosting,
  bottom,
  sidePad,
  enabled,
}: TxtrPedalsProps) {
  if (!enabled) return null;
  return (
    <View style={[styles.wrap, { right: sidePad, bottom }]} pointerEvents="box-none">
      <SpeedGauge ratio={speedRatio} boosting={boosting} />
      <View style={styles.pedals}>
        <Pedal label="BRAKE" glyph="▼" color={TXTR.red} onDown={onBrake} />
        <View style={styles.gap} />
        <Pedal label="GAS" glyph="▲" color={TXTR.green} big onDown={onThrottle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignItems: 'flex-end',
  },
  gauge: {
    width: 148,
    height: 12,
    marginBottom: 8,
    marginRight: 2,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: TXTR.ink,
    backgroundColor: 'rgba(27,27,43,0.45)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 999,
  },
  gaugeTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2.5,
    backgroundColor: TXTR.paper,
    opacity: 0.85,
  },
  pedals: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  gap: {
    width: 10,
  },
  pedal: {
    borderRadius: 18,
    borderWidth: 3.5,
    borderColor: TXTR.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  pedalSmall: {
    width: 66,
    height: 62,
  },
  pedalBig: {
    width: 78,
    height: 82,
  },
  pedalHeld: {
    borderColor: TXTR.paper,
  },
  pedalGlyph: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  pedalGlyphBig: {
    fontSize: 22,
  },
  pedalLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
});
