import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { getArenaItemImage } from '../../lib/arenaItemImages';
import { ARENA } from '../../lib/arenaTheme';
import { TIER_STYLE, tierForCost, type ShopEntry } from '../../lib/arenaShop';
import CornerBrackets from './CornerBrackets';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface ArenaItemDetailProps {
  entry: ShopEntry;
  affordable: boolean;
  busy: boolean;
  gunOwned: boolean;
  equipped: boolean;
  count: number;
  onBuy: () => void;
  onEquip: () => void;
  onClose: () => void;
}

export default function ArenaItemDetail({ entry, affordable, busy, gunOwned, equipped, count, onBuy, onEquip, onClose }: ArenaItemDetailProps) {
  const tier = TIER_STYLE[tierForCost(entry.cost)];
  const image = getArenaItemImage(entry.id);
  const isGun = entry.category === 'gun';

  return (
    <View style={[styles.panel, { borderColor: tier.main, shadowColor: tier.glow }]}>
      <CornerBrackets color={tier.main} size={16} thickness={2} inset={6} />

      {/* header */}
      <View style={styles.header}>
        <View style={[styles.catTag, { borderColor: entry.color }]}>
          <MaterialCommunityIcons name={entry.category === 'gun' ? 'pistol' : 'flask-round-bottom'} size={12} color={entry.color} />
          <Text style={[styles.catText, { color: entry.color }]}>{entry.category === 'gun' ? 'WEAPON' : 'ITEM'}</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={20} color={ARENA.dim} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
        {/* hero art */}
        <View style={styles.heroWrap}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id={`detail_${entry.id}`} cx="50%" cy="50%" r="55%">
                <Stop offset="0%" stopColor={entry.color} stopOpacity={0.5} />
                <Stop offset="100%" stopColor={entry.color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill={`url(#detail_${entry.id})`} />
          </Svg>
          {image ? (
            <Image source={image} style={styles.heroArt} contentFit="contain" />
          ) : (
            <MaterialCommunityIcons name={entry.icon as IconName} size={110} color={entry.color} />
          )}
        </View>

        {/* title + rarity */}
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
          <View style={[styles.rarityPill, { backgroundColor: tier.main }]}>
            <Text style={styles.rarityText}>{tier.label}</Text>
          </View>
        </View>

        <Text style={styles.desc}>{entry.description}</Text>

        {/* stats */}
        <Text style={styles.statsHeader}>STATS</Text>
        <View style={styles.statsBox}>
          {entry.stats.map((s) => (
            <View key={s.label} style={styles.statRow}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <View style={styles.statTrack}>
                <View style={[styles.statFill, { width: `${Math.max(4, s.value)}%`, backgroundColor: entry.color }]} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* owned status */}
      {(isGun ? gunOwned : count > 0) && (
        <View style={styles.ownedRow}>
          <MaterialCommunityIcons name={isGun ? 'check-decagram' : 'package-variant'} size={13} color={ARENA.teal} />
          <Text style={styles.ownedRowText}>
            {isGun ? (equipped ? 'EQUIPPED' : 'IN ARMORY') : `OWNED ×${count}`}
          </Text>
        </View>
      )}

      {/* buy / equip footer */}
      <View style={styles.footer}>
        <View style={styles.priceBox}>
          <MaterialCommunityIcons name="hexagon-multiple" size={16} color={ARENA.brass} />
          <Text style={[styles.priceText, !affordable && { color: ARENA.danger }]}>{entry.cost}</Text>
        </View>

        {isGun && gunOwned && equipped ? (
          <View style={[styles.buyBtn, styles.equippedBtn]}>
            <MaterialCommunityIcons name="shield-check" size={18} color={ARENA.teal} />
            <Text style={[styles.buyText, { color: ARENA.teal }]}>EQUIPPED</Text>
          </View>
        ) : isGun && gunOwned ? (
          <Pressable style={[styles.buyBtn, styles.equipBtn]} onPress={onEquip}>
            <MaterialCommunityIcons name="shield-sword" size={18} color={ARENA.dark} />
            <Text style={[styles.buyText, { color: ARENA.dark }]}>EQUIP</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.buyBtn, { backgroundColor: affordable ? ARENA.ember : 'rgba(255,255,255,0.06)', borderColor: ARENA.ember }, busy && { opacity: 0.6 }]}
            onPress={onBuy}
            disabled={busy || !affordable}
          >
            <MaterialCommunityIcons name="cart-plus" size={17} color={affordable ? ARENA.dark : ARENA.dim} />
            <Text style={[styles.buyText, { color: affordable ? ARENA.dark : ARENA.dim }]}>
              {busy ? 'BUYING…' : !affordable ? 'NEED PTS' : isGun ? 'BUY GUN' : count > 0 ? 'BUY MORE' : 'BUY'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: ARENA.panelSolid,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroArt: {
    width: 154,
    height: 132,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 21,
    fontWeight: '900',
    color: ARENA.ink,
    letterSpacing: 0.3,
  },
  rarityPill: {
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rarityText: {
    fontSize: 8,
    fontWeight: '900',
    color: ARENA.dark,
    letterSpacing: 0.5,
  },
  desc: {
    fontSize: 12,
    fontWeight: '600',
    color: ARENA.dim,
    lineHeight: 17,
    marginTop: 8,
  },
  statsHeader: {
    fontSize: 10,
    fontWeight: '900',
    color: ARENA.ember,
    letterSpacing: 2,
    marginTop: 14,
    marginBottom: 6,
  },
  statsBox: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    width: 64,
    fontSize: 11,
    fontWeight: '800',
    color: ARENA.dim,
  },
  statTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  statFill: {
    height: '100%',
    borderRadius: 4,
  },
  statValue: {
    width: 26,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '900',
    color: ARENA.ink,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ARENA.line,
  },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  priceText: {
    color: ARENA.brass,
    fontSize: 20,
    fontWeight: '900',
  },
  buyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  equipBtn: {
    borderColor: ARENA.teal,
    backgroundColor: ARENA.teal,
  },
  equippedBtn: {
    borderColor: ARENA.teal,
    backgroundColor: 'rgba(45,212,191,0.12)',
  },
  ownedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  ownedRowText: {
    color: ARENA.teal,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  buyText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
