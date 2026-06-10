import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Font from 'expo-font';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CornerBrackets from '../components/arena/CornerBrackets';
import { getArenaItemImage } from '../lib/arenaItemImages';
import { findShopEntry } from '../lib/arenaShop';
import { ARENA } from '../lib/arenaTheme';
import { useArena } from '../store/ArenaContext';
import { useArenaInventory } from '../store/ArenaInventoryContext';
import { usePoints } from '../store/PointsContext';
import { lockLandscape, lockPortrait } from '../utils/orientation';

const GREEN = '#22c55e';
const RED = ARENA.danger;

const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';
const PIXEL_FONT = 'PressStart2P';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function ArenaResultScreen() {
  const insets = useSafeAreaInsets();
  const { arena, resetArena } = useArena();
  const { refreshPoints } = usePoints();
  const { consumeItems } = useArenaInventory();
  const result = arena.result;

  const [pixelReady, setPixelReady] = useState(false);
  const consumedRef = useRef(false);

  useEffect(() => {
    lockLandscape();
    Font.loadAsync({ [PIXEL_FONT]: PRESS_START_2P_URI }).then(() => setPixelReady(true)).catch(() => {});
  }, []);

  useEffect(() => {
    void refreshPoints();
  }, [refreshPoints]);

  // Consume the items the server reported used — exactly once.
  useEffect(() => {
    if (consumedRef.current) return;
    if (result?.itemsUsed && Object.keys(result.itemsUsed).length > 0) {
      consumedRef.current = true;
      void consumeItems(result.itemsUsed).catch(() => {});
    }
  }, [result?.itemsUsed, consumeItems]);

  const usedEntries = useMemo(() => {
    const used = result?.itemsUsed ?? {};
    return Object.entries(used)
      .map(([id, n]) => ({ entry: findShopEntry(id), id, n }))
      .filter((x) => x.entry);
  }, [result?.itemsUsed]);

  const remainingTotal = useMemo(() => {
    const rem = result?.itemsRemaining ?? {};
    return Object.values(rem).reduce((a, b) => a + b, 0);
  }, [result?.itemsRemaining]);

  const goArcade = () => {
    resetArena();
    lockPortrait();
    router.replace('/(tabs)/play' as never);
  };

  const playAgain = () => {
    resetArena();
    router.replace('/arena-lobby' as never);
  };

  if (!result) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.noResult}>No result data</Text>
        <Pressable style={[styles.btn, { borderColor: ARENA.ember }]} onPress={goArcade}>
          <Text style={[styles.btnText, { color: ARENA.ember }]}>ARCADE</Text>
        </Pressable>
      </View>
    );
  }

  const pf = pixelReady ? PIXEL_FONT : undefined;
  const won = result.result === 'win';
  const lost = result.result === 'lose';
  const headlineColor = won ? GREEN : lost ? RED : ARENA.brass;
  const headline = won ? 'VICTORY' : lost ? 'DEFEATED' : 'DRAW';
  const ratingDelta = result.arenaRatingDelta ?? 0;
  const entryCost = result.entryCost ?? 50;
  const net = (result.pointsAwarded ?? 0) - entryCost;
  const durationSec = Math.round((result.durationMs ?? 0) / 1000);
  const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingLeft: insets.left + 18, paddingRight: insets.right + 18 }]}>
      {/* Headline */}
      <View style={styles.headlineWrap}>
        <MaterialCommunityIcons
          name={won ? 'trophy' : lost ? 'skull-outline' : 'handshake'}
          size={26}
          color={headlineColor}
        />
        <Text style={[styles.headline, { color: headlineColor }, pf && { fontFamily: pf }]}>{headline}</Text>
      </View>
      <Text style={styles.reason}>{(result.reason ?? '').replace(/_/g, ' ').toUpperCase()}</Text>

      {/* Cards */}
      <View style={styles.cardsRow}>
        {/* Match stats */}
        <View style={[styles.card, { borderColor: 'rgba(255,122,51,0.4)', shadowColor: ARENA.ember }]}>
          <CornerBrackets color={ARENA.ember} size={13} thickness={1.5} inset={5} />
          <Text style={[styles.cardTitle, { color: ARENA.ember }]}>MATCH</Text>
          <StatRow label="YOUR HP" value={`${result.yourHp ?? 0}`} />
          <StatRow label="OPP HP" value={`${result.opponentHp ?? 0}`} />
          <StatRow label="YOUR KILLS" value={`${result.yourKills ?? 0}`} />
          <StatRow label="OPP KILLS" value={`${result.opponentKills ?? 0}`} />
          <StatRow label="DURATION" value={durationStr} />
        </View>

        {/* Points */}
        <View style={[styles.card, { borderColor: 'rgba(236,181,63,0.45)', shadowColor: ARENA.brass }]}>
          <CornerBrackets color={ARENA.brass} size={13} thickness={1.5} inset={5} />
          <Text style={[styles.cardTitle, { color: ARENA.brass }]}>POINTS</Text>
          <StatRow label="ENTRY FEE" value={`-${entryCost}`} valueColor={RED} />
          <StatRow label="REWARD" value={`+${result.pointsAwarded ?? 0}`} valueColor={GREEN} />
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>NET</Text>
            <Text style={[styles.netValue, { color: net >= 0 ? GREEN : RED }]}>{net >= 0 ? '+' : ''}{net}</Text>
          </View>
          {result.newArenaRating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>RANK {result.newArenaRating}</Text>
              <Text style={[styles.ratingDelta, { color: ratingDelta >= 0 ? GREEN : RED }]}>
                {ratingDelta >= 0 ? '+' : ''}{ratingDelta}
              </Text>
            </View>
          )}
        </View>

        {/* Gear used */}
        <View style={[styles.card, { borderColor: 'rgba(45,212,191,0.4)', shadowColor: ARENA.teal }]}>
          <CornerBrackets color={ARENA.teal} size={13} thickness={1.5} inset={5} />
          <Text style={[styles.cardTitle, { color: ARENA.teal }]}>GEAR USED</Text>
          {usedEntries.length === 0 ? (
            <View style={styles.gearEmpty}>
              <MaterialCommunityIcons name="package-variant-closed" size={26} color={ARENA.dim} />
              <Text style={styles.gearEmptyText}>No items used</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {usedEntries.map(({ entry, id, n }) => {
                const img = getArenaItemImage(id);
                return (
                  <View key={id} style={styles.gearRow}>
                    <View style={[styles.gearIcon, { borderColor: entry!.color }]}>
                      {img ? (
                        <Image source={img} style={styles.gearArt} contentFit="contain" />
                      ) : (
                        <MaterialCommunityIcons name={entry!.icon as IconName} size={18} color={entry!.color} />
                      )}
                    </View>
                    <Text style={styles.gearName} numberOfLines={1}>{entry!.name}</Text>
                    <Text style={styles.gearCount}>×{n}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <Text style={styles.remainingText}>{remainingTotal} ITEM{remainingTotal === 1 ? '' : 'S'} LEFT IN ARMORY</Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.btns}>
        <Pressable style={[styles.btn, styles.primaryBtn]} onPress={playAgain}>
          <MaterialCommunityIcons name="restart" size={16} color={ARENA.dark} />
          <Text style={[styles.btnText, { color: ARENA.dark }]}>PLAY AGAIN</Text>
        </Pressable>
        <Pressable style={[styles.btn, { borderColor: ARENA.dim }]} onPress={goArcade}>
          <Text style={[styles.btnText, { color: ARENA.dim }]}>ARCADE</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ARENA.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  headline: {
    fontSize: 28,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    letterSpacing: 1,
  },
  reason: {
    fontSize: 10,
    fontWeight: '800',
    color: ARENA.dim,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 12,
  },
  cardsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: ARENA.panel,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ARENA.dim,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '900',
    color: ARENA.ink,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ARENA.line,
  },
  netLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: ARENA.ink,
    letterSpacing: 1,
  },
  netValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: ARENA.dim,
    letterSpacing: 1,
  },
  ratingDelta: {
    fontSize: 14,
    fontWeight: '900',
  },
  gearEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  gearEmptyText: {
    fontSize: 11,
    fontWeight: '700',
    color: ARENA.dim,
  },
  gearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gearIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearArt: {
    width: 22,
    height: 22,
  },
  gearName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: ARENA.ink,
  },
  gearCount: {
    fontSize: 13,
    fontWeight: '900',
    color: ARENA.brass,
  },
  remainingText: {
    fontSize: 9,
    fontWeight: '800',
    color: ARENA.dim,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ARENA.line,
  },
  btns: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
    paddingBottom: 6,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderWidth: 2,
    borderRadius: 10,
  },
  primaryBtn: {
    backgroundColor: ARENA.ember,
    borderColor: ARENA.ember,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  noResult: {
    color: ARENA.dim,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
});
