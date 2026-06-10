import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as Font from 'expo-font';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sellPoints } from '../api/authApi';
import ArenaItemDetail from '../components/arena/ArenaItemDetail';
import ArenaScreenBackground from '../components/arena/ArenaScreenBackground';
import ArenaShopCard from '../components/arena/ArenaShopCard';
import { SOLANA_RPC_URL } from '../constants/solana';
import { ARENA } from '../lib/arenaTheme';
import { ARENA_GUNS, ARENA_SHOP_ITEMS, findShopEntry, type ShopCategory, type ShopEntry } from '../lib/arenaShop';
import { useAuth } from '../store/AuthContext';
import { useArenaInventory } from '../store/ArenaInventoryContext';
import { usePoints } from '../store/PointsContext';
import { lockLandscape, lockPortrait } from '../utils/orientation';

const PRESS_START_2P_URI =
  'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf';
const PIXEL_FONT = 'PressStart2P';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// ─── Solana points trade (buy/sell) ──────────────────────────────────────────
const TREASURY_WALLET = 'HfYqSJrCeWwzKU2JMboEb7dPmQhT23Trqat1ch4ZwiUd';
const TRADE_FEE_BUFFER_LAMPORTS = 10_000;
const SWIPE_KNOB = 46;
// Buy bundles — linear 0.001 SOL per 100 points.
const BUY_TIERS: { points: number; sol: number }[] = [
  { points: 100, sol: 0.001 },
  { points: 200, sol: 0.002 },
  { points: 500, sol: 0.005 },
  { points: 1000, sol: 0.01 },
];
// Sell is a fixed treasury payout (server decides the rate).
const SELL_POINTS = 100;
const SELL_SOL = 0.001;

type TradeStage = 'review' | 'processing' | 'success';
type TradeGuard = { title: string; message: string; wallet?: boolean } | null;

export default function ArenaShopScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { points, refreshPoints, applyPointsDelta, setPoints } = usePoints();
  const { isGunOwned, itemCount, equippedGun, addGun, addItem, equipGun } = useArenaInventory();
  const auth = useAuth();
  const solanaWallet = useEmbeddedSolanaWallet();
  const connectionRef = useRef(new Connection(SOLANA_RPC_URL, 'confirmed'));

  const [pixelReady, setPixelReady] = useState(false);
  const [tab, setTab] = useState<ShopCategory>('gun');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);
  const toastY = useRef(new Animated.Value(-70)).current;

  const sidebarW = Math.min(400, Math.max(300, winW * 0.46));
  const slide = useRef(new Animated.Value(sidebarW + 60)).current;

  useEffect(() => {
    lockLandscape();
    Font.loadAsync({ [PIXEL_FONT]: PRESS_START_2P_URI }).then(() => setPixelReady(true)).catch(() => {});
    void refreshPoints();
  }, [refreshPoints]);

  const openSidebar = useCallback(
    (id: string) => {
      setSelectedId(id);
      Animated.timing(slide, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    },
    [slide],
  );

  const closeSidebar = useCallback(() => {
    Animated.timing(slide, { toValue: sidebarW + 60, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setSelectedId(null);
    });
  }, [slide, sidebarW]);

  const showToast = useCallback(
    (text: string, color: string) => {
      setToast({ text, color });
      toastY.setValue(-70);
      Animated.sequence([
        Animated.timing(toastY, { toValue: 0, duration: 260, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(toastY, { toValue: -70, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setToast(null));
    },
    [toastY],
  );

  // ─── Solana trade state ────────────────────────────────────────────────────
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeStage, setTradeStage] = useState<TradeStage>('review');
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [tradeResult, setTradeResult] = useState('');
  const [selectedTier, setSelectedTier] = useState(0);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [guard, setGuard] = useState<TradeGuard>(null);
  const [swipeActive, setSwipeActive] = useState(false);
  const [swipeFillPx, setSwipeFillPx] = useState(0);

  const sheetY = useRef(new Animated.Value(2000)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeMaxRef = useRef(220);
  swipeMaxRef.current = Math.max(180, Math.min(340, winW * 0.4));
  const stageRef = useRef<TradeStage>('review');
  const busyRef = useRef(false);
  const triggerRef = useRef<() => void>(() => {});

  const walletAddress =
    solanaWallet.status === 'connected' && solanaWallet.wallets?.[0]
      ? solanaWallet.wallets[0].address
      : null;

  const fetchSolBalance = useCallback(async () => {
    if (!walletAddress) { setSolBalance(null); return; }
    setSolLoading(true);
    try {
      const lamports = await connectionRef.current.getBalance(new PublicKey(walletAddress));
      setSolBalance(lamports / LAMPORTS_PER_SOL);
    } catch {
      setSolBalance(null);
    } finally {
      setSolLoading(false);
    }
  }, [walletAddress]);

  const closeTrade = useCallback(() => {
    if (tradeBusy) return;
    Animated.timing(sheetY, { toValue: winH, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setTradeOpen(false);
    });
  }, [tradeBusy, sheetY, winH]);

  const openTrade = useCallback((mode: 'BUY' | 'SELL') => {
    if (mode === 'SELL' && (points ?? 0) < SELL_POINTS) {
      setGuard({ title: 'NOT ENOUGH POINTS', message: `You need at least ${SELL_POINTS} points to sell. You have ${points ?? 0}.` });
      return;
    }
    if (!walletAddress) {
      setGuard({ title: 'WALLET REQUIRED', message: 'Create or connect your Privy Solana wallet to trade points.', wallet: true });
      return;
    }
    setTradeMode(mode);
    setTradeStage('review');
    setTradeStatus(null);
    setTradeResult('');
    setSelectedTier(0);
    swipeX.setValue(0);
    setSwipeFillPx(0);
    setTradeOpen(true);
    void fetchSolBalance();
    sheetY.setValue(winH);
    Animated.spring(sheetY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  }, [points, walletAddress, fetchSolBalance, sheetY, swipeX, winH]);

  const goToWallet = useCallback(() => {
    setGuard(null);
    setTradeOpen(false);
    lockPortrait();
    router.push('/wallet' as never);
  }, []);

  const executeBuy = useCallback(async () => {
    if (tradeBusy) return;
    const tier = BUY_TIERS[selectedTier] ?? BUY_TIERS[0];
    if (!walletAddress || !solanaWallet.wallets?.[0]) {
      setGuard({ title: 'WALLET REQUIRED', message: 'Create or connect your Privy Solana wallet first.', wallet: true });
      return;
    }
    if (!auth.user) {
      Alert.alert('Buy points', 'Your account is still syncing. Try again in a moment.');
      return;
    }
    setTradeBusy(true);
    setTradeStage('processing');
    setTradeStatus('Checking wallet balance...');
    try {
      const fromPubkey = new PublicKey(walletAddress);
      const toPubkey = new PublicKey(TREASURY_WALLET);
      const lamports = Math.round(tier.sol * LAMPORTS_PER_SOL);
      const balance = await connectionRef.current.getBalance(fromPubkey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
      if (balance < lamports + TRADE_FEE_BUFFER_LAMPORTS) {
        setTradeStage('review');
        setTradeBusy(false);
        setTradeStatus(null);
        setGuard({
          title: 'INSUFFICIENT SOL',
          message: `You need ${tier.sol} SOL (plus a small mainnet fee) to buy ${tier.points} points. Add SOL to your wallet and try again.`,
          wallet: true,
        });
        return;
      }
      setTradeStatus('Awaiting Privy wallet approval...');
      const { blockhash } = await connectionRef.current.getLatestBlockhash('confirmed');
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey }).add(
        SystemProgram.transfer({ fromPubkey, toPubkey, lamports }),
      );
      const provider = await solanaWallet.wallets[0].getProvider();
      const txResult = (await provider.request({
        method: 'signAndSendTransaction',
        params: { transaction: tx, connection: connectionRef.current },
      })) as { signature?: string };

      setTradeStatus('Confirmed. Crediting points...');
      const updated = await applyPointsDelta(tier.points);
      await refreshPoints();
      void fetchSolBalance();
      setTradeResult(
        `Sent ${tier.sol} SOL\n+${tier.points} POINTS\nBalance: ${updated}${
          txResult.signature ? `\nTx: ${txResult.signature.slice(0, 18)}...` : ''
        }`,
      );
      setTradeStage('success');
    } catch (error) {
      setTradeStage('review');
      Alert.alert('Buy failed', error instanceof Error ? error.message : 'Unable to complete purchase.');
    } finally {
      setTradeBusy(false);
      setTradeStatus(null);
    }
  }, [tradeBusy, selectedTier, walletAddress, solanaWallet, auth.user, applyPointsDelta, refreshPoints, fetchSolBalance]);

  const executeSell = useCallback(async () => {
    if (tradeBusy) return;
    if (!walletAddress || !solanaWallet.wallets?.[0]) {
      setGuard({ title: 'WALLET REQUIRED', message: 'Create or connect your Privy Solana wallet first.', wallet: true });
      return;
    }
    if (!auth.user) {
      Alert.alert('Sell points', 'Your account is still syncing. Try again in a moment.');
      return;
    }
    if ((points ?? 0) < SELL_POINTS) {
      Alert.alert('Sell points', `You need at least ${SELL_POINTS} points to sell.`);
      return;
    }
    setTradeBusy(true);
    setTradeStage('processing');
    setTradeStatus('Awaiting Privy wallet signature...');
    try {
      const provider = await solanaWallet.wallets[0].getProvider();
      await provider.request({
        method: 'signMessage',
        params: { message: `Sell confirmation: redeem ${SELL_POINTS} points for ${SELL_SOL} SOL on mainnet` },
      });
      setTradeStatus('Processing treasury payout...');
      const sellResponse = await sellPoints(walletAddress);
      setPoints(sellResponse.points);
      await refreshPoints();
      void fetchSolBalance();
      setTradeResult(
        `${sellResponse.payoutSol} SOL paid out\n-${sellResponse.pointsSpent} POINTS\nBalance: ${sellResponse.points}\nTx: ${sellResponse.txSignature.slice(0, 18)}...`,
      );
      setTradeStage('success');
    } catch (error) {
      setTradeStage('review');
      Alert.alert('Sell failed', error instanceof Error ? error.message : 'Unable to complete sell.');
    } finally {
      setTradeBusy(false);
      setTradeStatus(null);
    }
  }, [tradeBusy, walletAddress, solanaWallet, auth.user, points, refreshPoints, setPoints, fetchSolBalance]);

  const triggerTrade = useCallback(() => {
    if (tradeBusy || tradeStage !== 'review') return;
    void (tradeMode === 'BUY' ? executeBuy() : executeSell());
  }, [tradeBusy, tradeStage, tradeMode, executeBuy, executeSell]);

  useEffect(() => {
    stageRef.current = tradeStage;
    busyRef.current = tradeBusy;
    triggerRef.current = triggerTrade;
  }, [tradeStage, tradeBusy, triggerTrade]);

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) && stageRef.current === 'review' && !busyRef.current,
      onPanResponderGrant: () => setSwipeActive(true),
      onPanResponderMove: (_, g) => {
        const max = swipeMaxRef.current;
        const clamped = Math.max(0, Math.min(g.dx, max));
        swipeX.setValue(clamped);
        setSwipeFillPx(clamped);
      },
      onPanResponderRelease: (_, g) => {
        setSwipeActive(false);
        const max = swipeMaxRef.current;
        if (g.dx >= max * 0.85) {
          setSwipeFillPx(max);
          Animated.timing(swipeX, { toValue: max, duration: 120, useNativeDriver: true }).start(() => triggerRef.current());
          return;
        }
        setSwipeFillPx(0);
        Animated.spring(swipeX, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        setSwipeActive(false);
        setSwipeFillPx(0);
        Animated.spring(swipeX, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const handleBuyPoints = useCallback(() => {
    openTrade('BUY');
  }, [openTrade]);

  const handleBuy = useCallback(
    async (entry: ShopEntry) => {
      if (entry.comingSoon || busyId) return;
      const isGun = entry.category === 'gun';
      if (isGun && isGunOwned(entry.id)) return; // guns are one-time
      if ((points ?? 0) < entry.cost) {
        Alert.alert(
          'Not enough points',
          `${entry.name} costs ${entry.cost} points. You have ${points ?? 0}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Buy points', onPress: handleBuyPoints },
          ],
        );
        return;
      }
      setBusyId(entry.id);
      try {
        await applyPointsDelta(-entry.cost);
        if (isGun) await addGun(entry.id);
        else await addItem(entry.id);
        showToast(isGun ? `Unlocked ${entry.name}!` : `Bought ${entry.name}!`, ARENA.teal);
      } catch {
        Alert.alert('Purchase failed', 'Could not complete the purchase. Try again.');
        void refreshPoints();
      } finally {
        setBusyId(null);
      }
    },
    [points, busyId, isGunOwned, applyPointsDelta, addGun, addItem, showToast, handleBuyPoints, refreshPoints],
  );

  const handleEquip = useCallback((entry: ShopEntry) => {
    void equipGun(entry.id);
    showToast(`Equipped ${entry.name}`, ARENA.teal);
  }, [equipGun, showToast]);

  const switchTab = useCallback((t: ShopCategory) => {
    setTab(t);
    closeSidebar();
  }, [closeSidebar]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const pf = pixelReady ? PIXEL_FONT : undefined;
  const entries = tab === 'gun' ? ARENA_GUNS : ARENA_SHOP_ITEMS;
  const selectedEntry = selectedId ? findShopEntry(selectedId) : null;
  const backdropOpacity = slide.interpolate({ inputRange: [0, sidebarW + 60], outputRange: [0.62, 0] });

  const shortAddr = (a: string | null) => (a ? `${a.slice(0, 6)}...${a.slice(-6)}` : 'Your Wallet');
  const swipeAccent = tradeMode === 'BUY' ? ARENA.ember : ARENA.rose;
  const swipeBar = (
    <View style={styles.swipeSection}>
      <Text style={styles.swipeLabel}>SWIPE TO {tradeMode === 'BUY' ? 'BUY' : 'SELL'}</Text>
      <View style={[styles.swipeTrack, { width: swipeMaxRef.current + SWIPE_KNOB + 8 }]}>
        {swipeFillPx > 0 ? <View style={[styles.swipeFill, { width: swipeFillPx + SWIPE_KNOB, backgroundColor: swipeAccent + '44' }]} /> : null}
        <Animated.View
          style={[styles.swipeKnob, { backgroundColor: swipeAccent }, swipeActive && styles.swipeKnobActive, { transform: [{ translateX: swipeX }] }]}
          {...swipeResponder.panHandlers}
        >
          <MaterialCommunityIcons name="chevron-double-right" size={22} color={ARENA.dark} />
        </Animated.View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingLeft: insets.left + 14, paddingRight: insets.right + 14 }]}>
      <ArenaScreenBackground />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="chevron-back" size={22} color={ARENA.ember} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, pf && { fontFamily: pf }]}>ARMORY</Text>
          <Text style={styles.subtitle}>TAP AN ITEM TO INSPECT</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.sellBtn} onPress={() => openTrade('SELL')}>
            <MaterialCommunityIcons name="cash-minus" size={16} color={ARENA.rose} />
            <Text style={styles.sellBtnText}>SELL</Text>
          </Pressable>
          <View style={styles.pointsPill}>
            <MaterialCommunityIcons name="hexagon-multiple" size={16} color={ARENA.brass} />
            <Text style={styles.pointsValue}>{points ?? '—'}</Text>
            <Pressable style={styles.pointsPlus} onPress={() => openTrade('BUY')}>
              <Ionicons name="add" size={18} color={ARENA.dark} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabButton label="GUNS" icon="pistol" color={ARENA.ember} active={tab === 'gun'} onPress={() => switchTab('gun')} />
        <TabButton label="ITEMS" icon="flask-round-bottom" color={ARENA.teal} active={tab === 'item'} onPress={() => switchTab('item')} />
      </View>

      {/* Tiles */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
        {entries.map((entry) => (
          <ArenaShopCard
            key={entry.id}
            entry={entry}
            owned={isGunOwned(entry.id)}
            count={itemCount(entry.id)}
            equipped={equippedGun === entry.id}
            selected={selectedId === entry.id}
            onPress={() => openSidebar(entry.id)}
          />
        ))}
        <View style={styles.soonCard}>
          <MaterialCommunityIcons name="lock-outline" size={40} color={ARENA.dim} />
          <Text style={styles.soonText}>MORE GEAR{'\n'}COMING SOON</Text>
        </View>
      </ScrollView>

      {/* Backdrop + detail sidebar */}
      {selectedId && (
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={selectedEntry ? 'auto' : 'none'}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
        </Animated.View>
      )}
      <Animated.View
        style={[
          styles.sidebar,
          { width: sidebarW, top: insets.top + 8, bottom: 12, right: insets.right + 12, transform: [{ translateX: slide }] },
        ]}
        pointerEvents={selectedEntry ? 'auto' : 'none'}
      >
        {selectedEntry && (
          <ArenaItemDetail
            entry={selectedEntry}
            affordable={(points ?? 0) >= selectedEntry.cost}
            busy={busyId === selectedEntry.id}
            gunOwned={isGunOwned(selectedEntry.id)}
            equipped={equippedGun === selectedEntry.id}
            count={itemCount(selectedEntry.id)}
            onBuy={() => void handleBuy(selectedEntry)}
            onEquip={() => handleEquip(selectedEntry)}
            onClose={closeSidebar}
          />
        )}
      </Animated.View>

      {/* Purchase toast */}
      {toast && (
        <Animated.View
          style={[styles.toast, { borderColor: toast.color, shadowColor: toast.color, transform: [{ translateY: toastY }], top: insets.top + 10 }]}
          pointerEvents="none"
        >
          <MaterialCommunityIcons name="check-circle" size={18} color={toast.color} />
          <Text style={[styles.toastText, { color: toast.color }]}>{toast.text}</Text>
        </Animated.View>
      )}

      {/* ─── Solana trade drawer (full-screen sheet) ─── */}
      {tradeOpen && (
        <View style={[styles.tradeOverlay, { top: -(insets.top + 6), left: -(insets.left + 14), right: -(insets.right + 14), bottom: 0 }]}>
          <Pressable style={styles.tradeBackdrop} onPress={closeTrade} />
          <Animated.View
            style={[
              styles.tradeSheet,
              {
                transform: [{ translateY: sheetY }],
                paddingTop: insets.top + 14,
                paddingBottom: insets.bottom + 14,
                paddingLeft: insets.left + 18,
                paddingRight: insets.right + 18,
              },
            ]}
          >
            <View style={styles.tradeHeader}>
              <Pressable onPress={closeTrade} style={styles.tradeBack} disabled={tradeBusy} hitSlop={12}>
                <Ionicons name="chevron-back" size={18} color={ARENA.ember} />
                <Text style={styles.tradeBackText}>BACK</Text>
              </Pressable>
              <View style={styles.tradeTitleWrap}>
                <Text style={[styles.tradeTitle, pf && { fontFamily: pf }]} numberOfLines={1}>
                  {tradeMode === 'BUY' ? 'BUY POINTS' : 'SELL POINTS'}
                </Text>
              </View>
              <View style={styles.solPill}>
                <MaterialCommunityIcons name="alpha-s-circle" size={15} color={ARENA.teal} />
                {solLoading ? (
                  <ActivityIndicator size="small" color={ARENA.teal} />
                ) : (
                  <Text style={styles.solPillText}>{solBalance != null ? `${solBalance.toFixed(3)}` : '--'}</Text>
                )}
                <Pressable onPress={() => void fetchSolBalance()} hitSlop={8}>
                  <MaterialCommunityIcons name="refresh" size={13} color={ARENA.brass} />
                </Pressable>
              </View>
            </View>
            <View style={styles.tradeDivider} />

            <ScrollView
              style={styles.tradeScroll}
              contentContainerStyle={styles.tradeScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {tradeStage === 'review' && tradeMode === 'BUY' && (
                <View style={styles.tradeBody}>
                  <Text style={styles.tradeKicker}>CHOOSE A BUNDLE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierRow}>
                    {BUY_TIERS.map((t, i) => {
                      const sel = selectedTier === i;
                      const tooPoor = solBalance != null && solBalance < t.sol;
                      return (
                        <Pressable
                          key={t.points}
                          onPress={() => setSelectedTier(i)}
                          style={[styles.tierCard, sel && styles.tierCardSel, tooPoor && !sel && { opacity: 0.6 }]}
                        >
                          <Text style={[styles.tierPts, sel && { color: ARENA.brass }]}>{t.points}</Text>
                          <Text style={styles.tierPtsLabel}>POINTS</Text>
                          <View style={[styles.tierDivider, sel && { backgroundColor: ARENA.ember }]} />
                          <View style={styles.tierSolRow}>
                            <MaterialCommunityIcons name="alpha-s-circle" size={13} color={sel ? ARENA.teal : ARENA.tealDeep} />
                            <Text style={[styles.tierSol, sel && { color: ARENA.teal }]}>{t.sol}</Text>
                          </View>
                          {tooPoor && <Text style={styles.tierLow}>LOW SOL</Text>}
                          {sel && (
                            <View style={styles.tierCheck}>
                              <MaterialCommunityIcons name="check" size={12} color={ARENA.dark} />
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.flowWrap}>
                    <View style={styles.flowRow}>
                      <Text style={styles.flowLabel}>FROM</Text>
                      <Text style={styles.flowValue} numberOfLines={1}>{shortAddr(walletAddress)}</Text>
                    </View>
                    <View style={styles.flowRow}>
                      <Text style={styles.flowLabel}>TO</Text>
                      <Text style={styles.flowValue}>{`${TREASURY_WALLET.slice(0, 6)}...${TREASURY_WALLET.slice(-6)}`}</Text>
                    </View>
                  </View>
                  {swipeBar}
                </View>
              )}

              {tradeStage === 'review' && tradeMode === 'SELL' && (
                <View style={styles.tradeBody}>
                  <View style={styles.sellIconRing}>
                    <MaterialCommunityIcons name="cash-minus" size={34} color={ARENA.rose} />
                  </View>
                  <Text style={styles.tradeBig}>SELL {SELL_POINTS} POINTS</Text>
                  <Text style={styles.tradeKicker}>{SELL_POINTS} POINTS  →  {SELL_SOL} SOL</Text>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>YOUR POINTS</Text>
                    <Text style={styles.statValue}>{points ?? '--'}</Text>
                  </View>
                  <View style={styles.flowWrap}>
                    <View style={styles.flowRow}>
                      <Text style={styles.flowLabel}>FROM</Text>
                      <Text style={styles.flowValue}>Treasury Wallet</Text>
                    </View>
                    <View style={styles.flowRow}>
                      <Text style={styles.flowLabel}>TO</Text>
                      <Text style={styles.flowValue} numberOfLines={1}>{shortAddr(walletAddress)}</Text>
                    </View>
                  </View>
                  {swipeBar}
                </View>
              )}

              {tradeStage === 'processing' && (
                <View style={styles.tradeBody}>
                  <ActivityIndicator size="large" color={ARENA.teal} />
                  <Text style={styles.tradeBig}>PROCESSING</Text>
                  <Text style={styles.tradeKicker}>{tradeStatus ?? 'Working...'}</Text>
                </View>
              )}

              {tradeStage === 'success' && (
                <View style={styles.tradeBody}>
                  <View style={styles.successRing}>
                    <MaterialCommunityIcons name="check" size={36} color={ARENA.teal} />
                  </View>
                  <Text style={[styles.tradeBig, { color: ARENA.teal }]}>SUCCESS</Text>
                  <Text style={styles.tradeResult}>{tradeResult}</Text>
                  <Pressable style={styles.doneBtn} onPress={closeTrade}>
                    <Text style={styles.doneBtnText}>DONE</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {/* ─── Trade guard modal (wallet / insufficient funds) ─── */}
      {guard && (
        <View style={[styles.guardOverlay, { top: -(insets.top + 6), left: -(insets.left + 14), right: -(insets.right + 14), bottom: 0 }]}>
          <Pressable style={styles.guardBackdrop} onPress={() => setGuard(null)} />
          <View style={styles.guardCard}>
            <MaterialCommunityIcons
              name={guard.wallet ? 'wallet-outline' : 'alert-circle-outline'}
              size={36}
              color={guard.wallet ? ARENA.brass : ARENA.rose}
            />
            <Text style={styles.guardTitle}>{guard.title}</Text>
            <Text style={styles.guardMsg}>{guard.message}</Text>
            <View style={styles.guardBtns}>
              <Pressable style={styles.guardCancel} onPress={() => setGuard(null)}>
                <Text style={styles.guardCancelText}>DISMISS</Text>
              </Pressable>
              {guard.wallet && (
                <Pressable style={styles.guardGo} onPress={goToWallet}>
                  <MaterialCommunityIcons name="wallet-plus-outline" size={15} color={ARENA.dark} />
                  <Text style={styles.guardGoText}>GO TO WALLET</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function TabButton({ label, icon, color, active, onPress }: { label: string; icon: IconName; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && { backgroundColor: color, borderColor: color, shadowColor: color }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={17} color={active ? ARENA.dark : color} />
      <Text style={[styles.tabText, { color: active ? ARENA.dark : ARENA.dim }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ARENA.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,122,51,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,51,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: ARENA.brass,
    letterSpacing: 3,
    textShadowColor: ARENA.emberDeep,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  subtitle: {
    fontSize: 8,
    fontWeight: '800',
    color: ARENA.ember,
    letterSpacing: 2,
    marginTop: 3,
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(236,181,63,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(236,181,63,0.5)',
    borderRadius: 8,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    shadowColor: ARENA.brass,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  pointsValue: {
    color: ARENA.brass,
    fontSize: 16,
    fontWeight: '900',
  },
  pointsPlus: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: ARENA.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: ARENA.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  cardRow: {
    gap: 14,
    paddingVertical: 8,
    paddingRight: 18,
    alignItems: 'flex-start',
  },
  soonCard: {
    width: 168,
    minHeight: 244,
    borderWidth: 1.5,
    borderColor: ARENA.line,
    borderStyle: 'dashed',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  soonText: {
    color: ARENA.dim,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sidebar: {
    position: 'absolute',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: ARENA.panelSolid,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 20,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ─── Header trade buttons ───
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,93,122,0.5)',
    backgroundColor: 'rgba(255,93,122,0.1)',
  },
  sellBtnText: {
    color: ARENA.rose,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ─── Trade drawer ───
  tradeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  tradeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tradeSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a140d',
    borderTopWidth: 3,
    borderColor: ARENA.ember,
  },
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  tradeBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,122,51,0.55)',
    backgroundColor: 'rgba(255,122,51,0.14)',
  },
  tradeBackText: {
    color: ARENA.ember,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tradeTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  tradeTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: ARENA.brass,
    letterSpacing: 2,
    textShadowColor: ARENA.ember,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  tradeDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,122,51,0.3)',
    marginBottom: 4,
  },
  solPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(45,212,191,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(45,212,191,0.55)',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  solPillText: {
    color: ARENA.teal,
    fontSize: 13,
    fontWeight: '900',
  },
  tradeScroll: {
    flex: 1,
  },
  tradeScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  tradeBody: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    width: '100%',
  },
  tradeKicker: {
    color: '#d8c9ad',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  tradeBig: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  tradeResult: {
    color: ARENA.dim,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 20,
  },
  tierRow: {
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
  },
  tierCard: {
    width: 120,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(243,234,214,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    gap: 2,
  },
  tierCardSel: {
    borderColor: ARENA.ember,
    backgroundColor: 'rgba(255,122,51,0.2)',
    borderWidth: 2.5,
    shadowColor: ARENA.ember,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    elevation: 9,
  },
  tierPts: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
  },
  tierPtsLabel: {
    color: ARENA.dim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  tierDivider: {
    width: 50,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(243,234,214,0.2)',
    marginVertical: 8,
  },
  tierSolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tierSol: {
    color: ARENA.tealDeep,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tierLow: {
    marginTop: 5,
    color: ARENA.rose,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tierCheck: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ARENA.ember,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1a140d',
  },
  flowWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  sellIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: 'rgba(255,93,122,0.6)',
    backgroundColor: 'rgba(255,93,122,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBox: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ARENA.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  statLabel: {
    color: ARENA.dim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  statValue: {
    color: ARENA.brass,
    fontSize: 22,
    fontWeight: '900',
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '78%',
    maxWidth: 460,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: ARENA.line,
  },
  flowLabel: {
    color: ARENA.dim,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  flowValue: {
    color: ARENA.ink,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
    marginLeft: 12,
  },
  swipeSection: {
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  swipeLabel: {
    color: ARENA.brass,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  swipeTrack: {
    height: SWIPE_KNOB + 8,
    borderRadius: (SWIPE_KNOB + 8) / 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(243,234,214,0.22)',
    justifyContent: 'center',
    padding: 4,
  },
  swipeFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: (SWIPE_KNOB + 8) / 2,
  },
  swipeKnob: {
    width: SWIPE_KNOB,
    height: SWIPE_KNOB,
    borderRadius: SWIPE_KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  swipeKnobActive: {
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 9,
  },
  successRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: ARENA.teal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45,212,191,0.1)',
  },
  doneBtn: {
    marginTop: 6,
    paddingHorizontal: 44,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: ARENA.teal,
  },
  doneBtnText: {
    color: ARENA.dark,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // ─── Guard modal ───
  guardOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  guardCard: {
    width: '80%',
    maxWidth: 440,
    backgroundColor: ARENA.panelSolid,
    borderWidth: 1.5,
    borderColor: 'rgba(236,181,63,0.4)',
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 10,
  },
  guardTitle: {
    color: ARENA.ink,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  guardMsg: {
    color: ARENA.dim,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  guardBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  guardCancel: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: ARENA.line,
  },
  guardCancelText: {
    color: ARENA.dim,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  guardGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: ARENA.brass,
  },
  guardGoText: {
    color: ARENA.dark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
