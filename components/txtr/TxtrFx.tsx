import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { TXTR } from '../../lib/txtr/constants';
import type { BannerStyle, PopupStyle } from '../../lib/txtr/engine';
import OutlinedText from './OutlinedText';

// ─── Floating FX layer ───────────────────────────────────────────────────────
// Score popups (CSS `floatUp`, 950ms) and centre-screen banners (`bannerPop`,
// 1050ms). Driven imperatively from the frame loop so an event never re-renders
// the game screen.

export interface TxtrFxHandle {
  popup: (text: string, x: number, y: number, style: PopupStyle) => void;
  banner: (main: string, sub: string | undefined, style: BannerStyle) => void;
  clear: () => void;
}

interface PopupItem {
  id: number;
  text: string;
  x: number;
  y: number;
  style: PopupStyle;
  t: Animated.Value;
}

interface BannerItem {
  id: number;
  main: string;
  sub?: string;
  style: BannerStyle;
  t: Animated.Value;
}

const POPUP_COLOR: Record<PopupStyle, string> = {
  coin: TXTR.yellow,
  perfect: TXTR.popupPerfect,
  near: TXTR.popupNear,
  ok: '#ffffff',
};

const POPUP_SIZE: Record<PopupStyle, number> = {
  coin: 22,
  perfect: 27,
  near: 25,
  ok: 22,
};

const BANNER_COLOR: Record<BannerStyle, string> = {
  gold: TXTR.yellow,
  shield: TXTR.popupNear,
  magnet: TXTR.magnetPurple,
  boost: TXTR.boostOrange,
  plain: TXTR.yellow,
};

const POPUP_WIDTH = 220;

interface TxtrFxProps {
  fontFamily?: string;
  /** Vertical centre for banners (defaults to 28% of the layer height). */
  bannerTop?: number;
}

function TxtrFxInner(
  { fontFamily, bannerTop }: TxtrFxProps,
  ref: React.ForwardedRef<TxtrFxHandle>,
) {
  const [popups, setPopups] = useState<PopupItem[]>([]);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const idRef = useRef(0);

  const popup = useCallback((text: string, x: number, y: number, style: PopupStyle) => {
    const id = (idRef.current += 1);
    const t = new Animated.Value(0);
    setPopups((prev) => [...prev.slice(-11), { id, text, x, y, style, t }]);
    Animated.timing(t, {
      toValue: 1,
      duration: 950,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setPopups((prev) => prev.filter((p) => p.id !== id)));
  }, []);

  const banner = useCallback((main: string, sub: string | undefined, style: BannerStyle) => {
    const id = (idRef.current += 1);
    const t = new Animated.Value(0);
    setBanners((prev) => [...prev.slice(-2), { id, main, sub, style, t }]);
    Animated.timing(t, {
      toValue: 1,
      duration: 1050,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setBanners((prev) => prev.filter((b) => b.id !== id)));
  }, []);

  const clear = useCallback(() => {
    setPopups([]);
    setBanners([]);
  }, []);

  useImperativeHandle(ref, () => ({ popup, banner, clear }), [popup, banner, clear]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {popups.map((p) => {
        const opacity = p.t.interpolate({
          inputRange: [0, 0.18, 1],
          outputRange: [0, 1, 0],
        });
        const translateY = p.t.interpolate({
          inputRange: [0, 0.18, 1],
          outputRange: [0, -12, -58],
        });
        const scale = p.t.interpolate({
          inputRange: [0, 0.18, 0.35, 1],
          outputRange: [0.6, 1.1, 1, 1],
        });
        return (
          <Animated.View
            key={p.id}
            style={[
              styles.popup,
              {
                left: p.x - POPUP_WIDTH / 2,
                top: p.y - 18,
                opacity,
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            <OutlinedText
              color={POPUP_COLOR[p.style]}
              outline={2}
              containerStyle={styles.center}
              style={[
                styles.popupText,
                { fontSize: POPUP_SIZE[p.style] },
                fontFamily ? { fontFamily } : null,
              ]}
            >
              {p.text}
            </OutlinedText>
          </Animated.View>
        );
      })}

      {banners.map((b) => {
        const opacity = b.t.interpolate({
          inputRange: [0, 0.16, 0.78, 1],
          outputRange: [0, 1, 1, 0],
        });
        const scale = b.t.interpolate({
          inputRange: [0, 0.16, 0.3, 1],
          outputRange: [0.5, 1.12, 1, 1],
        });
        const translateY = b.t.interpolate({
          inputRange: [0, 0.78, 1],
          outputRange: [0, 0, -18],
        });
        return (
          <Animated.View
            key={b.id}
            style={[
              styles.banner,
              { top: bannerTop ?? '28%', opacity, transform: [{ scale }, { translateY }] },
            ]}
          >
            <OutlinedText
              color={BANNER_COLOR[b.style]}
              outline={3}
              containerStyle={styles.center}
              style={[styles.bannerMain, fontFamily ? { fontFamily } : null]}
            >
              {b.main}
            </OutlinedText>
            {!!b.sub && (
              <OutlinedText
                color="#ffffff"
                outline={2}
                containerStyle={styles.center}
                style={[styles.bannerSub, fontFamily ? { fontFamily } : null]}
              >
                {b.sub}
              </OutlinedText>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const TxtrFx = React.forwardRef<TxtrFxHandle, TxtrFxProps>(TxtrFxInner);
export default TxtrFx;

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  popup: {
    position: 'absolute',
    width: POPUP_WIDTH,
    alignItems: 'center',
  },
  popupText: {
    fontWeight: '900',
    textAlign: 'center',
  },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bannerMain: {
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  bannerSub: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
});
