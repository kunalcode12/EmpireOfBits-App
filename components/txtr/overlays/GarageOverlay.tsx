import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { TXTR } from '../../../lib/txtr/constants';
import { CARS, type Car } from '../../../lib/txtr/content';
import { formatNum } from '../../../lib/txtr/format';
import type { TxtrProfile } from '../../../lib/txtr/profile';
import { BackButton, CartoonPanel, HardShadow, PanelTitle, ScreenScrim } from './Panel';

interface GarageOverlayProps {
  profile: TxtrProfile;
  /** Live backend points — cars are bought with the same currency as everything else. */
  points: number | null;
  /** Car id currently being charged to the backend. */
  buying: string | null;
  landscape: boolean;
  insets: { top: number; bottom: number };
  fontFamily?: string;
  /** Increments whenever a purchase was refused — drives the `nope` shake. */
  deniedTick: number;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
  onBack: () => void;
}

/** The CSS `.thumb`: roof band over a body/shade split, with a dark window. */
export function CarThumb({ car, size = 1, dim }: { car: Car; size?: number; dim?: boolean }) {
  const w = 54 * size;
  const h = 80 * size;
  return (
    <View
      style={[
        styles.thumb,
        {
          width: w,
          height: h,
          backgroundColor: car.body,
          borderTopLeftRadius: 18 * size,
          borderTopRightRadius: 18 * size,
          borderBottomLeftRadius: 14 * size,
          borderBottomRightRadius: 14 * size,
        },
        dim && styles.thumbDim,
      ]}
    >
      <View style={[styles.thumbRoof, { backgroundColor: car.roof }]} />
      <View style={[styles.thumbShade, { backgroundColor: car.shade }]} />
      <View style={styles.thumbWindow} />
    </View>
  );
}

function CarCard({
  car,
  owned,
  selected,
  affordable,
  buying,
  landscape,
  fontFamily,
  onBuy,
  onEquip,
}: {
  car: Car;
  owned: boolean;
  selected: boolean;
  affordable: boolean;
  buying: boolean;
  landscape: boolean;
  fontFamily?: string;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
}) {
  const action = selected ? (
    <View style={[styles.carBtn, styles.carBtnDisabled]}>
      <Text style={styles.carBtnText} allowFontScaling={false}>
        Equipped
      </Text>
    </View>
  ) : owned ? (
    <Pressable onPress={() => onEquip(car.id)} style={styles.carBtnPress}>
      <View style={[styles.carBtn, styles.carBtnEquip]}>
        <Text style={[styles.carBtnText, styles.carBtnTextLight]} allowFontScaling={false}>
          Equip
        </Text>
      </View>
    </Pressable>
  ) : (
    <Pressable onPress={() => onBuy(car.id)} style={styles.carBtnPress} disabled={buying}>
      <View style={[styles.carBtn, affordable ? styles.carBtnBuy : styles.carBtnLocked]}>
        {buying ? (
          <ActivityIndicator size="small" color={TXTR.ink} />
        ) : (
          <Text
            style={[styles.carBtnText, !affordable && styles.carBtnTextMuted]}
            allowFontScaling={false}
          >
            ◈ {formatNum(car.price)}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.cardWrap, landscape && styles.cardWrapLand]}>
      <HardShadow depth={5} radius={16}>
        <View style={[styles.card, selected && styles.cardSelected]}>
          <CarThumb car={car} size={landscape ? 0.86 : 1} dim={!owned} />
          <Text
            style={[styles.carName, fontFamily ? { fontFamily } : null]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {car.name}
          </Text>
          {action}
        </View>
      </HardShadow>
    </View>
  );
}

export default function GarageOverlay({
  profile,
  points,
  buying,
  landscape,
  insets,
  fontFamily,
  deniedTick,
  onBuy,
  onEquip,
  onBack,
}: GarageOverlayProps) {
  const shake = useRef(new Animated.Value(0)).current;
  const firstTick = useRef(deniedTick);

  useEffect(() => {
    if (deniedTick === firstTick.current) return;
    shake.setValue(0);
    Animated.timing(shake, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [deniedTick, shake]);

  const translateX = shake.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -6, 0, 6, 0],
  });

  return (
    <ScreenScrim insets={insets}>
      <CartoonPanel wide landscape={landscape} maxHeight={undefined}>
        <View style={styles.head}>
          <BackButton onPress={onBack} />
          <PanelTitle fontFamily={fontFamily} style={styles.headTitle}>
            Garage
          </PanelTitle>
          <Animated.Text
            style={[styles.coinBal, fontFamily ? { fontFamily } : null, { transform: [{ translateX }] }]}
            allowFontScaling={false}
          >
            ◈ <Text style={styles.coinBalValue}>{points === null ? '—' : formatNum(points)}</Text>
          </Animated.Text>
        </View>

        <View style={styles.grid}>
          {CARS.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              owned={profile.ownedCars.includes(car.id)}
              selected={profile.selectedCar === car.id}
              affordable={(points ?? 0) >= car.price}
              buying={buying === car.id}
              landscape={landscape}
              fontFamily={fontFamily}
              onBuy={onBuy}
              onEquip={onEquip}
            />
          ))}
        </View>
      </CartoonPanel>
    </ScreenScrim>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headTitle: {
    flex: 1,
    marginBottom: 0,
    textAlign: 'left',
  },
  coinBal: {
    fontSize: 19,
    fontWeight: '900',
    color: TXTR.ink,
  },
  coinBalValue: {
    color: TXTR.yellowDark,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardWrap: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  cardWrapLand: {
    flexBasis: '22%',
    maxWidth: '25%',
  },
  card: {
    backgroundColor: TXTR.paper2,
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  cardSelected: {
    backgroundColor: '#eafff5',
  },
  thumb: {
    borderWidth: 3,
    borderColor: TXTR.ink,
    overflow: 'hidden',
  },
  thumbDim: {
    opacity: 0.55,
  },
  thumbRoof: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '26%',
  },
  thumbShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '55%',
    bottom: 0,
  },
  thumbWindow: {
    position: 'absolute',
    left: '18%',
    top: '30%',
    width: '64%',
    height: '18%',
    backgroundColor: '#16263b',
    borderWidth: 2,
    borderColor: TXTR.ink,
    borderRadius: 6,
  },
  carName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: TXTR.ink,
    marginVertical: 8,
    textAlign: 'center',
  },
  carBtnPress: {
    alignSelf: 'stretch',
  },
  carBtn: {
    alignSelf: 'stretch',
    borderWidth: 3,
    borderColor: TXTR.ink,
    borderRadius: 12,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: TXTR.paper,
  },
  carBtnDisabled: {
    opacity: 0.6,
  },
  carBtnEquip: {
    backgroundColor: TXTR.green,
  },
  carBtnBuy: {
    backgroundColor: TXTR.yellow,
  },
  carBtnLocked: {
    backgroundColor: '#e6e6ee',
  },
  carBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: TXTR.ink,
  },
  carBtnTextLight: {
    color: '#ffffff',
  },
  carBtnTextMuted: {
    color: '#999999',
  },
});
