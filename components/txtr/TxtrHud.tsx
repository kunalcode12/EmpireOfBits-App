import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { TXTR } from '../../lib/txtr/constants';
import { formatNum } from '../../lib/txtr/format';
import { HardShadow } from './overlays/Panel';
import OutlinedText from './OutlinedText';

// ─── HUD ─────────────────────────────────────────────────────────────────────
// The fixed top overlay from index.html: coin / mph chips on the left, the big
// outlined score with the BEST subline in the middle (plus the combo block and
// active power-up chips), pause / mute on the right.

export interface HudSnapshot {
  score: number;
  best: number;
  coins: number;
  mph: number;
  combo: number;
  mult: number;
  comboFrac: number;
  shield: boolean;
  magnet: number;
  boost: number;
}

interface TxtrHudProps {
  hud: HudSnapshot;
  muted: boolean;
  paused: boolean;
  /** Drops the combo block and power-up chips on short screens (CSS max-height rule). */
  compact: boolean;
  /** Landscape: the same HUD, tightened so it does not eat the short viewport. */
  dense: boolean;
  topInset: number;
  sidePad: number;
  fontFamily?: string;
  onPause: () => void;
  onMute: () => void;
}

function ComboBar({ frac }: { frac: number }) {
  return (
    <View style={styles.comboBar}>
      <View style={[styles.comboFill, { width: `${Math.max(0, Math.min(1, frac)) * 100}%` }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="txtrCombo" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={TXTR.yellow} />
              <Stop offset="1" stopColor={TXTR.red} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#txtrCombo)" />
        </Svg>
      </View>
    </View>
  );
}

function IconButton({ label, onPress, dim }: { label: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      {({ pressed }) => (
        <HardShadow depth={5} radius={14} pressed={pressed}>
          <View style={[styles.iconBtn, dim && styles.iconBtnDim]}>
            <Text style={styles.iconBtnText} allowFontScaling={false}>
              {label}
            </Text>
          </View>
        </HardShadow>
      )}
    </Pressable>
  );
}

export default function TxtrHud({
  hud,
  muted,
  paused,
  compact,
  dense,
  topInset,
  sidePad,
  fontFamily,
  onPause,
  onMute,
}: TxtrHudProps) {
  const ff = fontFamily ? { fontFamily } : null;
  return (
    <View
      style={[
        styles.hud,
        { paddingTop: topInset + (dense ? 6 : 10), paddingLeft: sidePad, paddingRight: sidePad },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.left} pointerEvents="none">
        <View style={styles.chipWrap}>
          <HardShadow depth={5} radius={14}>
            <View style={styles.chip}>
              <Text style={styles.chipIcon} allowFontScaling={false}>
                🪙
              </Text>
              <Text style={[styles.chipValue, ff]} allowFontScaling={false}>
                {formatNum(hud.coins)}
              </Text>
            </View>
          </HardShadow>
        </View>
        <View style={styles.chipWrap}>
          <HardShadow depth={5} radius={14}>
            <View style={styles.chip}>
              <Text style={[styles.chipValue, ff]} allowFontScaling={false}>
                {hud.mph}
              </Text>
              <Text style={styles.chipUnit} allowFontScaling={false}>
                mph
              </Text>
            </View>
          </HardShadow>
        </View>
      </View>

      <View style={styles.center} pointerEvents="none">
        <OutlinedText
          color="#ffffff"
          outline={3}
          dropShadow={6}
          containerStyle={styles.centerText}
          style={[styles.score, dense && styles.scoreDense, ff]}
        >
          {formatNum(hud.score)}
        </OutlinedText>
        <OutlinedText
          color="#ffffff"
          outline={1.5}
          containerStyle={styles.centerText}
          style={[styles.scoreSub, ff]}
          numberOfLines={1}
        >
          {`BEST ${formatNum(hud.best)}`}
        </OutlinedText>

        {!compact && hud.combo > 0 && (
          <View style={[styles.combo, dense && styles.comboDense]}>
            <OutlinedText
              color={TXTR.yellow}
              outline={2.5}
              containerStyle={styles.centerText}
              style={[styles.comboMult, dense && styles.comboMultDense, ff]}
            >
              {`x${hud.mult.toFixed(1)}`}
            </OutlinedText>
            <OutlinedText
              color="#ffffff"
              outline={1.5}
              containerStyle={styles.centerText}
              style={[styles.comboCount, ff]}
            >
              {`${hud.combo} combo`}
            </OutlinedText>
            <ComboBar frac={hud.comboFrac} />
          </View>
        )}

        {!compact && (hud.shield || hud.magnet > 0 || hud.boost > 0) && (
          <View style={styles.pickupRow}>
            {hud.shield && (
              <View style={styles.pu}>
                <Text style={[styles.puText, styles.puShield]} allowFontScaling={false}>
                  🛡 Shield
                </Text>
              </View>
            )}
            {hud.magnet > 0 && (
              <View style={styles.pu}>
                <Text style={[styles.puText, styles.puMagnet]} allowFontScaling={false}>
                  {`🧲 ${hud.magnet.toFixed(0)}s`}
                </Text>
              </View>
            )}
            {hud.boost > 0 && (
              <View style={styles.pu}>
                <Text style={[styles.puText, styles.puBoost]} allowFontScaling={false}>
                  {`✦ x2 ${hud.boost.toFixed(0)}s`}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.right}>
        <IconButton label={paused ? '▶' : '⏸'} onPress={onPause} />
        <IconButton label={muted ? '🔇' : '🔊'} onPress={onMute} dim={muted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  left: {
    gap: 8,
  },
  chipWrap: {
    alignSelf: 'flex-start',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipIcon: {
    fontSize: 15,
  },
  chipValue: {
    fontSize: 15,
    fontWeight: '800',
    color: TXTR.ink,
  },
  chipUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: TXTR.grey,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  centerText: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  score: {
    fontSize: 42,
    lineHeight: 44,
    fontWeight: '900',
    textAlign: 'center',
  },
  scoreDense: {
    fontSize: 32,
    lineHeight: 34,
  },
  scoreSub: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  combo: {
    marginTop: 6,
    width: '86%',
    alignItems: 'center',
  },
  comboDense: {
    marginTop: 2,
    width: '62%',
  },
  comboMult: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  comboMultDense: {
    fontSize: 22,
    lineHeight: 24,
  },
  comboCount: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  comboBar: {
    marginTop: 5,
    height: 10,
    width: '100%',
    backgroundColor: 'rgba(27,27,43,0.4)',
    borderWidth: 2,
    borderColor: TXTR.ink,
    borderRadius: 999,
    overflow: 'hidden',
  },
  comboFill: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  pickupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  pu: {
    backgroundColor: TXTR.paper2,
    borderWidth: 2.5,
    borderColor: TXTR.ink,
    borderRadius: 11,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  puText: {
    fontSize: 12,
    fontWeight: '700',
  },
  puShield: {
    color: '#2a9dd8',
  },
  puMagnet: {
    color: TXTR.purple,
  },
  puBoost: {
    color: TXTR.yellowDark,
  },
  right: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDim: {
    opacity: 0.7,
  },
  iconBtnText: {
    fontSize: 18,
  },
});
