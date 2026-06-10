import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type {
  ArenaCelebration,
  ArenaCountdown,
  ArenaToast,
  ArenaToastTone,
} from '../../hooks/useVorldArenaSession';
import { lookupArenaItemUi } from '../../lib/arenaItems';
import type { ArenaItemEvent } from '../../store/ArenaContext';

const GOLD = '#FFD700';
const CYAN = '#19f0ff';
const PINK = '#FF006E';
const RED = '#ef4444';
const DIM = '#9ca3af';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TONE_COLOR: Record<ArenaToastTone, string> = {
  boost: GOLD,
  drop: CYAN,
  info: DIM,
  error: RED,
};

const TONE_ICON: Record<ArenaToastTone, IconName> = {
  boost: 'rocket-launch',
  drop: 'gift-outline',
  info: 'information-outline',
  error: 'alert-circle-outline',
};

interface ReactiveOverlayProps {
  countdown: ArenaCountdown | null;
  celebration: ArenaCelebration | null;
  toasts: ArenaToast[];
  reconnecting: boolean;
  itemEvent: ArenaItemEvent | null;
  topInset: number;
  sidePad: number;
}

// ─── Applied item-drop banner ────────────────────────────────────────────────

function ItemBanner({ event, top }: { event: ArenaItemEvent; top: number }) {
  const ui = lookupArenaItemUi(event.itemId) ?? lookupArenaItemUi(event.itemName);
  const color = ui?.color ?? (event.kind === 'buff' ? GOLD : PINK);
  const icon = (ui?.icon ?? (event.kind === 'buff' ? 'gift-outline' : 'flash')) as IconName;
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(0.8);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [event.token, scale, opacity]);

  return (
    <View style={[styles.itemBannerWrap, { top }]} pointerEvents="none">
      <Animated.View
        style={[styles.itemBanner, { borderColor: color, shadowColor: color, opacity, transform: [{ scale }] }]}
      >
        <MaterialCommunityIcons name={icon} size={24} color={color} />
        <View>
          <Text style={[styles.itemBannerTitle, { color }]} numberOfLines={1}>
            {event.itemName}
          </Text>
          <Text style={styles.itemBannerSub}>
            {event.kind === 'buff' ? 'BUFF' : 'SABOTAGE'} → PLAYER {event.targetPlayerNumber}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Auto-animated toast card ────────────────────────────────────────────────

function ToastCard({ toast }: { toast: ArenaToast }) {
  const x = useRef(new Animated.Value(-30)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const color = TONE_COLOR[toast.tone];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [opacity, x]);

  return (
    <Animated.View style={[styles.toast, { borderColor: color, opacity, transform: [{ translateX: x }] }]}>
      <MaterialCommunityIcons name={TONE_ICON[toast.tone]} size={18} color={color} />
      <View style={styles.toastTextWrap}>
        <Text style={[styles.toastTitle, { color }]} numberOfLines={1}>
          {toast.title}
        </Text>
        {toast.subtitle ? (
          <Text style={styles.toastSubtitle} numberOfLines={1}>
            {toast.subtitle}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

export default function ReactiveOverlay({
  countdown,
  celebration,
  toasts,
  reconnecting,
  itemEvent,
  topInset,
  sidePad,
}: ReactiveOverlayProps) {
  const celebScale = useRef(new Animated.Value(0.7)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!celebration) return;
    celebScale.setValue(0.7);
    celebOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // fade out shortly before the hook clears it
    const id = setTimeout(() => {
      Animated.timing(celebOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    }, 1500);
    return () => clearTimeout(id);
  }, [celebration, celebScale, celebOpacity]);

  const celebColor = celebration?.tone === 'drop' ? CYAN : GOLD;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* top-center banners */}
      <View style={[styles.topCenter, { top: topInset + 58 }]}>
        {countdown ? (
          <View style={[styles.banner, { borderColor: CYAN }]}>
            <MaterialCommunityIcons name="timer-sand" size={13} color={CYAN} />
            <Text style={styles.bannerLabel}>{countdown.phase.toUpperCase()}</Text>
            <Text style={[styles.bannerValue, { color: CYAN }]}>{countdown.secondsRemaining}s</Text>
          </View>
        ) : null}
        {reconnecting ? (
          <View style={[styles.banner, { borderColor: GOLD, marginTop: 6 }]}>
            <MaterialCommunityIcons name="lan-disconnect" size={13} color={GOLD} />
            <Text style={[styles.bannerLabel, { color: GOLD }]}>RECONNECTING…</Text>
          </View>
        ) : null}
      </View>

      {/* reactive toasts (top-left, below HUD) */}
      <View style={[styles.toastColumn, { top: topInset + 60, left: sidePad + 6 }]}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </View>

      {/* applied item-drop banner */}
      {itemEvent ? <ItemBanner key={itemEvent.token} event={itemEvent} top={topInset + 96} /> : null}

      {/* boost / drop celebration popup */}
      {celebration ? (
        <View style={styles.celebrationWrap}>
          <Animated.View
            style={[
              styles.celebrationCard,
              { borderColor: celebColor, shadowColor: celebColor, opacity: celebOpacity, transform: [{ scale: celebScale }] },
            ]}
          >
            <View style={styles.sparkRow}>
              <Text style={[styles.spark, { color: celebColor }]}>✦</Text>
              <Text style={[styles.spark, { color: celebColor }]}>✧</Text>
              <Text style={[styles.spark, { color: celebColor }]}>✦</Text>
            </View>
            <MaterialCommunityIcons
              name={celebration.tone === 'drop' ? 'gift-outline' : 'rocket-launch'}
              size={40}
              color={celebColor}
            />
            <Text style={[styles.celebrationTitle, { color: celebColor, textShadowColor: celebColor }]}>
              {celebration.title}
            </Text>
            <Text style={styles.celebrationSubtitle}>{celebration.subtitle}</Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5,6,12,0.82)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bannerLabel: {
    color: CYAN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  bannerValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  toastColumn: {
    position: 'absolute',
    width: 230,
    gap: 6,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(5,6,12,0.88)',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toastTextWrap: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  toastSubtitle: {
    color: DIM,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  celebrationWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,9,16,0.92)',
    borderWidth: 2,
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 12,
  },
  sparkRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 4,
  },
  spark: {
    fontSize: 14,
    fontWeight: '900',
  },
  celebrationTitle: {
    fontSize: 26,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: 1,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  celebrationSubtitle: {
    color: DIM,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  itemBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  itemBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(8,9,16,0.92)',
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
  },
  itemBannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  itemBannerSub: {
    color: DIM,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 1,
  },
});
