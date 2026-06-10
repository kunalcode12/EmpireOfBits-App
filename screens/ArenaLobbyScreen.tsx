import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Font from 'expo-font';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArenaLoader from '../components/arena/ArenaLoader';
import ArenaScreenBackground from '../components/arena/ArenaScreenBackground';
import CornerBrackets from '../components/arena/CornerBrackets';
import { getArenaItemImage } from '../lib/arenaItemImages';
import { findShopEntry, TIER_STYLE, tierForCost, type ShopEntry } from '../lib/arenaShop';
import { ARENA } from '../lib/arenaTheme';
import { useArena } from '../store/ArenaContext';
import { useArenaInventory } from '../store/ArenaInventoryContext';
import { useAuth } from '../store/AuthContext';
import { usePoints } from '../store/PointsContext';
import { lockLandscape, lockPortrait } from '../utils/orientation';

const ENTRY_COST = 50;

const PRESS_START_2P_URI = 'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';
const VT323_URI = 'https://github.com/google/fonts/raw/main/ofl/vt323/VT323-Regular.ttf';
const PIXEL_FONT = 'PressStart2P';
const RETRO_FONT = 'VT323';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function ArenaLobbyScreen() {
  const insets = useSafeAreaInsets();
  const { arena, joinArenaQueue, cancelArenaQueue, resetArena, clearToast } = useArena();
  const { user } = useAuth();
  const { points, refreshPoints } = usePoints();
  const { guns, items, equippedGun, equipGun } = useArenaInventory();

  const [fontsReady, setFontsReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    lockLandscape();
    Font.loadAsync({ [PIXEL_FONT]: PRESS_START_2P_URI, [RETRO_FONT]: VT323_URI })
      .then(() => setFontsReady(true))
      .catch(() => {});
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [blink]);

  useEffect(() => {
    if (arena.phase === 'matchmaking') {
      setJoining(false);
      const start = Date.now();
      timerRef.current = setInterval(() => setElapsed(Date.now() - start), 500);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [arena.phase]);

  const navigatedRef = useRef(false);

  useEffect(() => {
    if (navigatedRef.current) return;
    if (arena.phase === 'countdown' || arena.phase === 'active') {
      navigatedRef.current = true;
      setTimeout(() => { router.replace('/arena-blitz' as never); }, 100);
    }
    if (arena.phase === 'finished') {
      navigatedRef.current = true;
      setJoining(false);
      if (arena.result) {
        router.replace('/arena-result' as never);
      } else {
        Alert.alert('Arena', 'Match was cancelled');
        resetArena();
      }
    }
  }, [arena.phase, arena.result, resetArena]);

  useEffect(() => {
    const t = setTimeout(() => { void refreshPoints().catch(() => {}); }, 600);
    return () => clearTimeout(t);
  }, [arena.phase, refreshPoints]);

  useEffect(() => {
    if (arena.toast) {
      Alert.alert('Arena', arena.toast);
      clearToast();
      setJoining(false);
      joiningRef.current = false;
      void refreshPoints().catch(() => {});
    }
  }, [arena.toast, clearToast, refreshPoints]);

  const handleEnter = useCallback(async () => {
    if (joiningRef.current || arena.phase !== 'idle') return;
    if ((points ?? 0) < ENTRY_COST) {
      Alert.alert('Not enough points', `You need at least ${ENTRY_COST} points to enter.`);
      return;
    }
    joiningRef.current = true;
    setJoining(true);
    try {
      await joinArenaQueue({ equippedGun, items, ownedGuns: guns });
    } catch {
      joiningRef.current = false;
      setJoining(false);
      Alert.alert('Error', 'Failed to join queue.');
    }
  }, [arena.phase, points, joinArenaQueue, equippedGun, items, guns]);

  const handleCancel = useCallback(() => {
    cancelArenaQueue();
    joiningRef.current = false;
    setJoining(false);
  }, [cancelArenaQueue]);

  const handleBack = useCallback(() => {
    if (arena.phase === 'matchmaking') handleCancel();
    resetArena();
    lockPortrait();
    router.back();
  }, [arena.phase, handleCancel, resetArena]);

  const openShop = useCallback(() => { router.push('/arena-shop' as never); }, []);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const pf = fontsReady ? PIXEL_FONT : undefined;
  const rf = fontsReady ? RETRO_FONT : undefined;
  const showMatchmaking = arena.phase === 'matchmaking' || joining;
  const ownedGunEntries = guns.map(findShopEntry).filter((e): e is ShopEntry => !!e);
  const ownedItemEntries = Object.keys(items)
    .map(findShopEntry)
    .filter((e): e is ShopEntry => !!e && (items[e.id] ?? 0) > 0);
  const hasGear = ownedGunEntries.length > 0 || ownedItemEntries.length > 0;

  const glowOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });
  const canAfford = (points ?? 0) >= ENTRY_COST;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingLeft: insets.left + 14, paddingRight: insets.right + 14 }]}>
      <ArenaScreenBackground scanlines />

      {showMatchmaking ? (
        <View style={styles.matchmaking}>
          {arena.phase === 'matchmaking' ? <ArenaLoader size={124} color={ARENA.ember} /> : <ActivityIndicator size="large" color={ARENA.brass} />}
          <Animated.Text style={[styles.searchText, rf && { fontFamily: rf, fontSize: 30 }, { opacity: blink.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
            {arena.phase === 'matchmaking' ? 'SEARCHING FOR OPPONENT…' : 'CONNECTING…'}
          </Animated.Text>
          {arena.phase === 'matchmaking' && (
            <Text style={[styles.elapsedText, rf && { fontFamily: rf, fontSize: 40 }]}>{formatElapsed(elapsed)}</Text>
          )}
          <Pressable style={styles.cancelBtn} onPress={handleCancel}>
            <MaterialCommunityIcons name="close-circle-outline" size={16} color={ARENA.danger} />
            <Text style={styles.cancelText}>CANCEL</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="chevron-back" size={22} color={ARENA.ember} />
            </Pressable>

            <View style={styles.marquee}>
              <View style={styles.marqueeStripe} />
              <MaterialCommunityIcons name="chevron-right" size={16} color={ARENA.ember} />
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.marqueeTitle, pf && { fontFamily: pf }]}>ARENA BLITZ</Text>
                <Text style={[styles.marqueeSub, rf && { fontFamily: rf, fontSize: 15 }]}>1V1 ARENA SHOOTER</Text>
              </View>
              <MaterialCommunityIcons name="chevron-left" size={16} color={ARENA.ember} />
            </View>

            <View style={styles.creditsPill}>
              <MaterialCommunityIcons name="hexagon-multiple" size={14} color={ARENA.brass} />
              <Text style={[styles.creditsValue, rf && { fontFamily: rf, fontSize: 22 }]}>{points ?? '—'}</Text>
            </View>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <View style={styles.leftCol}>
              {/* Player card */}
              <View style={styles.playerCard}>
                <CornerBrackets color={ARENA.ember} size={14} thickness={1.5} inset={5} />
                <View style={styles.p1Badge}>
                  <Text style={[styles.p1Text, pf && { fontFamily: pf, fontSize: 13 }]}>P1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoreLabel}>OPERATOR</Text>
                  <Text style={styles.scoreName} numberOfLines={1}>{user?.username ?? 'PLAYER'}</Text>
                </View>
                <View style={[styles.statBox, { borderColor: 'rgba(45,212,191,0.45)' }]}>
                  <Text style={styles.statLbl}>RANK</Text>
                  <Text style={[styles.statNum, { color: ARENA.teal }, rf && { fontFamily: rf, fontSize: 28 }]}>{arena.playerRating ?? '—'}</Text>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.actionsRow}>
                <Pressable style={[styles.enterBtn, !canAfford && { opacity: 0.55 }]} onPress={handleEnter} disabled={joining}>
                  <Animated.View style={[styles.enterGlow, { opacity: glowOpacity }]} pointerEvents="none" />
                  <MaterialCommunityIcons name="sword-cross" size={18} color={ARENA.dark} />
                  <Text style={[styles.enterText, pf && { fontFamily: pf }]}>ENTER</Text>
                  <View style={styles.crChip}>
                    <Text style={styles.crText}>{ENTRY_COST} CR</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.armoryBtn} onPress={openShop}>
                  <MaterialCommunityIcons name="storefront" size={18} color={ARENA.teal} />
                  <Text style={styles.armoryText}>ARMORY</Text>
                </Pressable>
              </View>
            </View>

            {/* Loadout */}
            <View style={styles.rightCol}>
              <CornerBrackets color={ARENA.brass} size={14} thickness={1.5} inset={6} />
              <View style={styles.loadoutHeader}>
                <MaterialCommunityIcons name="bag-personal" size={16} color={ARENA.ember} />
                <Text style={styles.loadoutTitle}>LOADOUT</Text>
                <Pressable style={styles.armoryLink} onPress={openShop}>
                  <MaterialCommunityIcons name="plus" size={13} color={ARENA.teal} />
                  <Text style={styles.armoryLinkText}>ARMORY</Text>
                </Pressable>
              </View>

              {!hasGear ? (
                <View style={styles.emptyLoadout}>
                  <MaterialCommunityIcons name="package-variant" size={30} color={ARENA.dim} />
                  <Text style={styles.emptyText}>NO GEAR YET</Text>
                  <Pressable style={styles.emptyCta} onPress={openShop}>
                    <Text style={styles.emptyCtaText}>OPEN ARMORY →</Text>
                  </Pressable>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
                  {/* WEAPON */}
                  <Text style={styles.sectionLabel}>WEAPON {ownedGunEntries.length > 1 ? '· TAP TO EQUIP' : ''}</Text>
                  {ownedGunEntries.length === 0 ? (
                    <View style={styles.defaultGun}>
                      <MaterialCommunityIcons name="pistol" size={20} color={ARENA.dim} />
                      <Text style={styles.defaultGunText}>BLASTER (DEFAULT)</Text>
                    </View>
                  ) : (
                    <View style={styles.gunRow}>
                      {ownedGunEntries.map((e) => {
                        const isEq = equippedGun === e.id;
                        const img = getArenaItemImage(e.id);
                        return (
                          <Pressable
                            key={e.id}
                            onPress={() => void equipGun(e.id)}
                            style={[styles.gunChip, isEq && { borderColor: ARENA.teal, backgroundColor: 'rgba(45,212,191,0.12)' }]}
                          >
                            {img ? (
                              <Image source={img} style={styles.gunChipArt} contentFit="contain" />
                            ) : (
                              <MaterialCommunityIcons name={e.icon as IconName} size={26} color={e.color} />
                            )}
                            {isEq && (
                              <View style={styles.eqDot}>
                                <MaterialCommunityIcons name="check" size={9} color={ARENA.dark} />
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* ITEMS */}
                  <Text style={[styles.sectionLabel, { marginTop: 12 }]}>ITEMS · BROUGHT TO MATCH</Text>
                  {ownedItemEntries.length === 0 ? (
                    <Text style={styles.noItems}>No consumables — buy some in the Armory.</Text>
                  ) : (
                    <View style={styles.slotGrid}>
                      {ownedItemEntries.map((e) => {
                        const tier = TIER_STYLE[tierForCost(e.cost)];
                        const img = getArenaItemImage(e.id);
                        return (
                          <View key={e.id} style={[styles.slot, { borderColor: tier.main }]}>
                            <View style={styles.slotCount}>
                              <Text style={styles.slotCountText}>×{items[e.id] ?? 0}</Text>
                            </View>
                            {img ? (
                              <Image source={img} style={styles.slotArt} contentFit="contain" />
                            ) : (
                              <MaterialCommunityIcons name={e.icon as IconName} size={28} color={e.color} />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ARENA.bg,
  },

  // top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,122,51,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,51,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  marquee: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(20,15,10,0.85)',
    borderWidth: 1.5,
    borderColor: ARENA.ember,
    borderRadius: 10,
    paddingVertical: 8,
    overflow: 'hidden',
    shadowColor: ARENA.ember,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 5,
  },
  marqueeStripe: {
    position: 'absolute',
    left: -30,
    top: -20,
    width: 50,
    height: 90,
    backgroundColor: 'rgba(255,122,51,0.16)',
    transform: [{ rotate: '20deg' }],
  },
  marqueeTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: ARENA.brass,
    letterSpacing: 1,
    textShadowColor: ARENA.emberDeep,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  marqueeSub: {
    fontSize: 10,
    fontWeight: '800',
    color: ARENA.teal,
    letterSpacing: 4,
    marginTop: 5,
  },
  creditsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(236,181,63,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(236,181,63,0.5)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  creditsValue: {
    color: ARENA.brass,
    fontSize: 15,
    fontWeight: '900',
  },

  // body
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 10,
  },
  leftCol: {
    flex: 1.15,
    justifyContent: 'center',
    gap: 16,
  },
  rightCol: {
    flex: 1,
    backgroundColor: ARENA.panel,
    borderWidth: 1.5,
    borderColor: 'rgba(236,181,63,0.32)',
    borderRadius: 12,
    padding: 14,
    shadowColor: ARENA.brass,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },

  // player card
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ARENA.panel,
    borderWidth: 1.5,
    borderColor: 'rgba(255,122,51,0.3)',
    borderRadius: 12,
    padding: 14,
  },
  p1Badge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,122,51,0.16)',
    borderWidth: 1.5,
    borderColor: ARENA.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  p1Text: {
    fontSize: 16,
    fontWeight: '900',
    color: ARENA.ember,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: ARENA.dim,
    letterSpacing: 2,
  },
  scoreName: {
    fontSize: 18,
    fontWeight: '900',
    color: ARENA.ink,
    marginTop: 2,
  },
  statBox: {
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statLbl: {
    fontSize: 8,
    fontWeight: '800',
    color: ARENA.dim,
    letterSpacing: 1.5,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 28,
  },

  // actions
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  enterBtn: {
    flex: 1.35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    backgroundColor: ARENA.ember,
    borderRadius: 10,
    overflow: 'hidden',
  },
  enterGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff7e6',
  },
  enterText: {
    fontSize: 14,
    fontWeight: '900',
    color: ARENA.dark,
    letterSpacing: 1,
  },
  crChip: {
    backgroundColor: 'rgba(18,12,6,0.85)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  crText: {
    fontSize: 10,
    fontWeight: '900',
    color: ARENA.brass,
  },
  armoryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    backgroundColor: 'rgba(45,212,191,0.08)',
    borderWidth: 1.5,
    borderColor: ARENA.teal,
    borderRadius: 10,
    shadowColor: ARENA.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 4,
  },
  armoryText: {
    fontSize: 14,
    fontWeight: '900',
    color: ARENA.teal,
    letterSpacing: 1,
  },

  // loadout
  loadoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  loadoutTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: ARENA.ember,
    letterSpacing: 2,
  },
  armoryLink: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(45,212,191,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.5)',
  },
  armoryLinkText: {
    color: ARENA.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: ARENA.dim,
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  defaultGun: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: ARENA.line,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  defaultGunText: {
    color: ARENA.dim,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  gunRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gunChip: {
    width: 64,
    height: 56,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: ARENA.line,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gunChipArt: {
    width: 46,
    height: 40,
  },
  eqDot: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ARENA.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noItems: {
    color: ARENA.dim,
    fontSize: 11,
    fontWeight: '600',
  },
  slotCount: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: ARENA.brass,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 2,
  },
  slotCountText: {
    color: '#120c06',
    fontSize: 9,
    fontWeight: '900',
  },
  emptyLoadout: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: ARENA.dim,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  emptyCta: {
    borderWidth: 1.5,
    borderColor: ARENA.teal,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  emptyCtaText: {
    color: ARENA.teal,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingBottom: 6,
  },
  slot: {
    width: 64,
    height: 64,
    borderRadius: 9,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  slotArt: {
    width: 46,
    height: 46,
  },
  slotEmpty: {
    width: 64,
    height: 64,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,240,214,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // matchmaking
  matchmaking: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchText: {
    fontSize: 15,
    fontWeight: '900',
    color: ARENA.ink,
    letterSpacing: 2,
    marginTop: 18,
    textShadowColor: ARENA.ember,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  elapsedText: {
    fontSize: 24,
    fontWeight: '900',
    color: ARENA.brass,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderWidth: 1.5,
    borderColor: ARENA.danger,
    borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.08)',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '900',
    color: ARENA.danger,
    letterSpacing: 1,
  },
});
