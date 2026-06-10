import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { getArenaItemImage } from '../../lib/arenaItemImages';
import { ARENA } from '../../lib/arenaTheme';
import { TIER_STYLE, tierForCost, type ShopEntry } from '../../lib/arenaShop';
import CornerBrackets from './CornerBrackets';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface ArenaShopCardProps {
  entry: ShopEntry;
  /** gun: owned. */
  owned: boolean;
  /** item: how many owned (stackable). */
  count: number;
  equipped: boolean;
  selected: boolean;
  onPress: () => void;
}

export default function ArenaShopCard({ entry, owned, count, equipped, selected, onPress }: ArenaShopCardProps) {
  const tier = TIER_STYLE[tierForCost(entry.cost)];
  const image = getArenaItemImage(entry.id);
  const gid = `tile_${entry.id}`;
  const accent = selected ? ARENA.ember : tier.main;
  const isGun = entry.category === 'gun';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { borderColor: accent, shadowColor: owned ? ARENA.teal : tier.glow },
        selected && styles.cardSelected,
      ]}
    >
      {/* gradient background */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${gid}_bg`} x1="0" y1="0" x2="0.15" y2="1">
            <Stop offset="0%" stopColor={tier.main} stopOpacity={selected ? 0.3 : 0.16} />
            <Stop offset="45%" stopColor="#1a140d" stopOpacity={0.96} />
            <Stop offset="100%" stopColor="#0c0905" stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id={`${gid}_halo`} cx="50%" cy="42%" r="52%">
            <Stop offset="0%" stopColor={entry.color} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={entry.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" rx={10} fill={`url(#${gid}_bg)`} />
        <Rect x={0} y={0} width="100%" height="100%" rx={10} fill={`url(#${gid}_halo)`} />
      </Svg>

      <CornerBrackets color={accent} size={14} thickness={selected ? 2.5 : 1.5} inset={4} />

      {/* rarity ribbon */}
      <View style={[styles.ribbon, { backgroundColor: tier.main }]}>
        <Text style={styles.ribbonText}>{tier.label}</Text>
      </View>

      {isGun && equipped && (
        <View style={[styles.cornerTag, { backgroundColor: ARENA.teal }]}>
          <Text style={styles.cornerTagText}>EQUIPPED</Text>
        </View>
      )}
      {isGun && owned && !equipped && (
        <View style={styles.ownedTag}>
          <MaterialCommunityIcons name="check-decagram" size={17} color={ARENA.teal} />
        </View>
      )}
      {!isGun && count > 0 && (
        <View style={[styles.cornerTag, { backgroundColor: ARENA.brass }]}>
          <Text style={styles.cornerTagText}>×{count}</Text>
        </View>
      )}

      {/* big art */}
      <View style={styles.artWrap}>
        {image ? (
          <Image source={image} style={styles.art} contentFit="contain" />
        ) : (
          <MaterialCommunityIcons name={entry.icon as IconName} size={88} color={entry.color} />
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>

      <View style={styles.priceChip}>
        <MaterialCommunityIcons name="hexagon-multiple" size={13} color={ARENA.brass} />
        <Text style={styles.priceText}>{entry.cost}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 168,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 8,
  },
  cardSelected: {
    shadowOpacity: 1,
    shadowRadius: 20,
    transform: [{ translateY: -5 }],
  },
  ribbon: {
    position: 'absolute',
    top: 0,
    left: 22,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ribbonText: {
    fontSize: 7,
    fontWeight: '900',
    color: ARENA.dark,
    letterSpacing: 0.5,
  },
  ownedTag: {
    position: 'absolute',
    top: 8,
    right: 9,
  },
  cornerTag: {
    position: 'absolute',
    top: 7,
    right: 7,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cornerTagText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#120c06',
    letterSpacing: 0.5,
  },
  artWrap: {
    width: 122,
    height: 122,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  art: {
    width: 116,
    height: 116,
  },
  name: {
    fontSize: 15,
    fontWeight: '900',
    color: ARENA.ink,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  priceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(236,181,63,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236,181,63,0.4)',
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 3,
    marginTop: 8,
  },
  priceText: {
    color: ARENA.brass,
    fontSize: 14,
    fontWeight: '900',
  },
});
