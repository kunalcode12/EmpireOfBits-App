import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AimStick from '../components/arena/AimStick';
import ArenaCanvas, { type BombAimState } from '../components/arena/ArenaCanvas';
import ArenaHUD from '../components/arena/ArenaHUD';
import BombAimPad from '../components/arena/BombAimPad';
import BombButton from '../components/arena/BombButton';
import Joystick from '../components/arena/Joystick';
import ReactiveOverlay from '../components/arena/ReactiveOverlay';
import { useVorldArenaSession } from '../hooks/useVorldArenaSession';
import { getArenaItemImage } from '../lib/arenaItemImages';
import { findShopEntry, WEAPON_TO_GUN_ID } from '../lib/arenaShop';
import { useArena } from '../store/ArenaContext';
import { useArenaInventory } from '../store/ArenaInventoryContext';
import { lockLandscape, lockPortrait } from '../utils/orientation';
import { connectArenaSocket } from '../websockets/arenaSocket';

const BG = '#040406';
const GOLD_GLOW = '#FFD700';
const BOMB_ITEMS = new Set(['item_grenade', 'item_freeze']);

export default function ArenaBlitzScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { arena, sendInput, clearItemEvent, useItem, throwBomb, switchGun } = useArena();
  const { guns: ownedGuns } = useArenaInventory();

  // Vorld TV reactive session (connection / countdown / boost / item-drop).
  // No-op unless Reactive Arcade is enabled — never affects core gameplay.
  const reactive = useVorldArenaSession();

  const dxRef = useRef(0);
  const dyRef = useRef(0);
  const shootRef = useRef(false);
  const aimRef = useRef({ x: 0, y: 0 }); // smoothed aim actually sent to server
  const aimTargetRef = useRef({ x: 0, y: 0 }); // raw aim from the stick
  const [aiming, setAiming] = useState(false);
  const [bombAim, setBombAim] = useState<BombAimState | null>(null);
  const [armedBomb, setArmedBomb] = useState<{ itemId: string; type: 'frag' | 'cryo'; color: string } | null>(null);

  // Lock landscape for the battle. Lobby & result are landscape too, so we DON'T
  // restore portrait on unmount (avoids flicker); each exit-to-tabs path locks
  // portrait explicitly instead.
  useEffect(() => {
    lockLandscape();
  }, []);

  useEffect(() => {
    connectArenaSocket().catch(() => {});
  }, []);

  // Input sending loop at ~30fps (twin-stick: move + aim)
  useEffect(() => {
    const interval = setInterval(() => {
      if (arena.phase === 'active') {
        // Smoothly ROTATE the sent aim toward the stick target so the gun
        // direction glides (and bullets follow it) instead of snapping — and
        // crucially this rotates the short way around, so you can swing the aim
        // all the way to the opposite side while still firing.
        const t = aimTargetRef.current;
        const a = aimRef.current;
        if (t.x === 0 && t.y === 0) {
          aimRef.current = { x: 0, y: 0 };
        } else if (a.x === 0 && a.y === 0) {
          aimRef.current = { x: t.x, y: t.y }; // first engage: snap to direction
        } else {
          const cur = Math.atan2(a.y, a.x);
          const tgt = Math.atan2(t.y, t.x);
          let diff = tgt - cur;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const MAX_STEP = 0.5; // cap ~28°/tick so big swings stay smooth
          let step = diff * 0.5;
          if (step > MAX_STEP) step = MAX_STEP;
          if (step < -MAX_STEP) step = -MAX_STEP;
          const na = cur + step;
          aimRef.current = { x: Math.cos(na), y: Math.sin(na) };
        }
        sendInput(dxRef.current, dyRef.current, shootRef.current, aimRef.current.x, aimRef.current.y);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [arena.phase, sendInput]);

  // Navigate to result when finished
  useEffect(() => {
    if (arena.phase === 'finished' && arena.result) {
      const t = setTimeout(() => {
        router.replace('/arena-result' as never);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [arena.phase, arena.result]);

  // If phase goes idle (no game), go back to the (portrait) arcade tab
  useEffect(() => {
    if (arena.phase === 'idle') {
      lockPortrait();
      router.replace('/(tabs)/play' as never);
    }
  }, [arena.phase]);

  // Stable self id (arena.self is a fresh object every tick — don't depend on it
  // in effects, or timeouts get reset 20x/sec and never fire).
  const selfIdRef = useRef<number | null>(null);
  useEffect(() => {
    selfIdRef.current = arena.self?.id ?? null;
  }, [arena.self?.id]);

  // Haptic feedback when taking damage (fires once per hit event)
  useEffect(() => {
    if (arena.hitFlash && selfIdRef.current != null && arena.hitFlash.targetId === selfIdRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
  }, [arena.hitFlash]);

  // Buzz when an item lands on me, and auto-dismiss the item banner after 3s.
  useEffect(() => {
    const ev = arena.itemEvent;
    if (!ev) return;
    if (selfIdRef.current != null && ev.targetPlayerId === selfIdRef.current) {
      Haptics.impactAsync(
        ev.kind === 'sabotage' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
      ).catch(() => {});
    }
    const t = setTimeout(() => clearItemEvent(), 3000);
    return () => clearTimeout(t);
  }, [arena.itemEvent, clearItemEvent]);

  const handleMove = useCallback((dx: number, dy: number) => {
    dxRef.current = dx;
    dyRef.current = dy;
  }, []);

  // ── Gun aim stick (twin-stick) ──
  const handleAimStart = useCallback(() => {
    shootRef.current = true;
    setAiming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);
  const handleAimMove = useCallback((x: number, y: number) => {
    aimTargetRef.current = { x, y };
  }, []);
  const handleAimEnd = useCallback(() => {
    shootRef.current = false;
    aimTargetRef.current = { x: 0, y: 0 };
    aimRef.current = { x: 0, y: 0 };
    setAiming(false);
  }, []);

  // ── Bombs: tap to EQUIP (arm) → drag the throw pad to aim → release to throw ──
  const handleArmBomb = useCallback((itemId: string, type: 'frag' | 'cryo', color: string) => {
    // stop gun fire while bomb-aiming
    shootRef.current = false;
    aimRef.current = { x: 0, y: 0 };
    setAiming(false);
    setArmedBomb((prev) => {
      if (prev && prev.itemId === itemId) {
        // tapping the armed bomb again disarms it
        setBombAim(null);
        return null;
      }
      // arm: show a straight-ahead preview (canvas defaults to facing dir)
      setBombAim({ dirX: 0, dirY: 0, power: 0, type });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return { itemId, type, color };
    });
  }, []);
  const handleBombAimMove = useCallback((dirX: number, dirY: number, power: number) => {
    setBombAim((prev) => (prev ? { ...prev, dirX, dirY, power } : prev));
  }, []);
  const handleBombThrow = useCallback((itemId: string, dirX: number, dirY: number, power: number) => {
    throwBomb(itemId, dirX, dirY, power);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setArmedBomb(null);
    setBombAim(null);
  }, [throwBomb]);
  const handleBombCancel = useCallback(() => {
    setArmedBomb(null);
    setBombAim(null);
  }, []);

  // Auto-disarm an equipped bomb if it runs out, we die, or the round ends.
  const armedId = armedBomb?.itemId ?? null;
  const armedCount = armedId ? arena.items[armedId] ?? 0 : 0;
  const selfAlive = !!arena.self?.alive;
  useEffect(() => {
    if (!armedId) return;
    if (armedCount <= 0 || !selfAlive || arena.phase !== 'active') {
      setArmedBomb(null);
      setBombAim(null);
    }
  }, [armedId, armedCount, selfAlive, arena.phase]);

  // Self-buff items (tap to use)
  const handleUseItem = useCallback((itemId: string) => {
    useItem(itemId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [useItem]);

  // Live gun switching (tap an owned gun to equip it mid-match)
  const handleSwitchGun = useCallback((gunId: string) => {
    switchGun(gunId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [switchGun]);

  // Countdown overlay
  const countdownScale = useRef(new Animated.Value(2)).current;
  const countdownOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (arena.phase === 'countdown') {
      countdownScale.setValue(2);
      countdownOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(countdownScale, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(countdownOpacity, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [arena.countdownSec, arena.phase]);

  const selfHp = arena.self?.hp ?? 0;
  const selfMaxHp = arena.self?.maxHp ?? 100;
  const oppHp = arena.opponent?.hp ?? 0;
  const oppMaxHp = arena.opponent?.maxHp ?? 100;
  const weapon = arena.self?.weapon ?? 'blaster';
  const ammo = arena.self?.ammo ?? -1;
  const shield = arena.self?.shield ?? 0;
  const selfKills = arena.self?.kills ?? 0;
  const oppKills = arena.opponent?.kills ?? 0;

  // ── Vorld actor labels (Player1/Player2) — only shown when Reactive is on ──
  // playerNumber (1 or 2) comes from the arena match payload; the opponent is
  // simply the other number. Vorld targets actors as "Player1"/"Player2".
  const pn = arena.playerNumber;
  const selfLabel = reactive.reactiveOn && pn ? `PLAYER ${pn}` : null;
  const oppLabel = reactive.reactiveOn && pn ? `PLAYER ${pn === 1 ? 2 : 1}` : null;

  // Consumable item buttons (from this player's match item counts)
  const allItemButtons = Object.entries(arena.items)
    .filter(([, n]) => n > 0)
    .map(([id, count]) => {
      const entry = findShopEntry(id);
      return { id, count, name: entry?.name ?? id, icon: entry?.icon ?? 'help-circle', color: entry?.color ?? '#fff' };
    });
  const buffButtons = allItemButtons.filter((b) => !BOMB_ITEMS.has(b.id));
  const bombButtons = allItemButtons.filter((b) => BOMB_ITEMS.has(b.id));

  // ── Landscape-aware sizing ──
  const sidePad = Math.max(insets.left, insets.right, 12);

  return (
    <View style={styles.root}>
      {/* Full-screen camera canvas */}
      <View style={StyleSheet.absoluteFill}>
        <ArenaCanvas
          self={arena.self}
          opponent={arena.opponent}
          projectiles={arena.projectiles}
          powerups={arena.powerups}
          obstacles={arena.obstacles}
          dangerZone={arena.dangerZone}
          grenades={arena.grenades}
          detonation={arena.detonation}
          hitFlash={arena.hitFlash}
          aiming={aiming}
          bombAim={bombAim}
          holdingBomb={armedBomb?.type ?? null}
          viewportWidth={winW}
          viewportHeight={winH}
          worldSize={arena.mapData?.width ?? 1000}
          selfLabel={selfLabel}
          oppLabel={oppLabel}
          selfName={arena.playerName}
          oppName={arena.opponentName}
        />
      </View>

      {/* HUD overlay */}
      <View style={[styles.hud, { top: insets.top + 6, left: sidePad + 6, right: sidePad + 6 }]}>
        <ArenaHUD
          selfHp={selfHp}
          selfMaxHp={selfMaxHp}
          opponentHp={oppHp}
          opponentMaxHp={oppMaxHp}
          timeMs={arena.timeRemainingMs}
          weapon={weapon}
          ammo={ammo}
          selfShield={shield}
          selfKills={selfKills}
          opponentKills={oppKills}
        />
      </View>

      {/* Controls overlay bottom corners */}
      <View
        pointerEvents="box-none"
        style={[styles.joystickArea, { left: sidePad, bottom: insets.bottom + 18 }]}
      >
        <Joystick onMove={handleMove} size={132} color="#00F5FF" />
      </View>
      <View
        pointerEvents="box-none"
        style={[styles.fireArea, { right: sidePad, bottom: insets.bottom + 16 }]}
      >
        {armedBomb ? (
          <BombAimPad
            itemId={armedBomb.itemId}
            type={armedBomb.type}
            color={armedBomb.color}
            count={arena.items[armedBomb.itemId] ?? 0}
            onAimMove={handleBombAimMove}
            onThrow={handleBombThrow}
            onCancel={handleBombCancel}
          />
        ) : (
          <AimStick
            weapon={weapon}
            ammo={ammo}
            disabled={!!arena.self?.disarmed}
            onAimStart={handleAimStart}
            onAimMove={handleAimMove}
            onAimEnd={handleAimEnd}
          />
        )}
      </View>

      {/* Bomb buttons (tap to equip / arm) — above the fire stick */}
      {arena.phase === 'active' && bombButtons.length > 0 && (
        <View style={[styles.bombBar, { right: sidePad + 4, bottom: insets.bottom + 156 }]} pointerEvents="box-none">
          {bombButtons.map(({ id, icon, color, count }) => (
            <BombButton
              key={id}
              itemId={id}
              type={id === 'item_grenade' ? 'frag' : 'cryo'}
              icon={icon}
              color={color}
              count={count}
              armed={armedBomb?.itemId === id}
              disabled={!arena.self?.alive}
              onArm={handleArmBomb}
            />
          ))}
        </View>
      )}

      {/* Live gun switcher — owned guns, tap to equip mid-match (left edge) */}
      {arena.phase === 'active' && ownedGuns.length > 0 && (
        <View style={[styles.gunBar, { left: sidePad }]} pointerEvents="box-none">
          {ownedGuns.map((gunId) => {
            const img = getArenaItemImage(gunId);
            const entry = findShopEntry(gunId);
            const color = entry?.color ?? '#fff';
            const active = WEAPON_TO_GUN_ID[weapon] === gunId;
            const dead = !arena.self?.alive;
            return (
              <Pressable
                key={gunId}
                onPress={() => handleSwitchGun(gunId)}
                disabled={dead || active}
                style={[
                  styles.gunBtn,
                  { borderColor: color },
                  active && { backgroundColor: color + '2e', borderWidth: 2.4, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 9, elevation: 7 },
                  dead && { opacity: 0.4 },
                ]}
              >
                {img ? (
                  <Image source={img} style={styles.gunBtnArt} contentFit="contain" />
                ) : (
                  <MaterialCommunityIcons name={(entry?.icon ?? 'pistol') as never} size={24} color={color} />
                )}
                {active && <View style={[styles.gunActiveDot, { backgroundColor: color }]} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Self-buff item bar (tap to use) — bottom center */}
      {arena.phase === 'active' && buffButtons.length > 0 && (
        <View style={[styles.itemBar, { bottom: insets.bottom + 22 }]} pointerEvents="box-none">
          {buffButtons.map(({ id, icon, color, count }) => {
            const img = getArenaItemImage(id);
            const dead = !arena.self?.alive;
            return (
              <Pressable
                key={id}
                onPress={() => handleUseItem(id)}
                disabled={dead}
                style={[styles.itemBtn, { borderColor: color }, dead && { opacity: 0.4 }]}
              >
                {img ? (
                  <Image source={img} style={styles.itemBtnArt} contentFit="contain" />
                ) : (
                  <MaterialCommunityIcons name={icon as never} size={26} color={color} />
                )}
                <View style={styles.itemBtnCount}>
                  <Text style={styles.itemBtnCountText}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Countdown overlay */}
      {arena.phase === 'countdown' && (
        <View style={styles.overlay} pointerEvents="none">
          <Animated.Text
            style={[
              styles.countdownText,
              { transform: [{ scale: countdownScale }], opacity: countdownOpacity },
            ]}
          >
            {arena.countdownSec > 0 ? arena.countdownSec : 'GO!'}
          </Animated.Text>
        </View>
      )}

      {/* Game over overlay */}
      {arena.phase === 'finished' && arena.result && (
        <View style={styles.overlay} pointerEvents="none">
          <Text
            style={[
              styles.resultHeadline,
              {
                color:
                  arena.result.result === 'win'
                    ? '#22c55e'
                    : arena.result.result === 'lose'
                      ? '#ef4444'
                      : GOLD_GLOW,
              },
            ]}
          >
            {arena.result.result === 'win'
              ? 'VICTORY!'
              : arena.result.result === 'lose'
                ? 'DEFEATED'
                : 'DRAW'}
          </Text>
          <Text style={styles.resultReason}>{arena.result.reason.replace(/_/g, ' ').toUpperCase()}</Text>
          <Text style={styles.resultStat}>+{arena.result.pointsAwarded} PTS</Text>
        </View>
      )}

      {/* Disconnect toast */}
      {arena.toast && (
        <View style={styles.toastBar} pointerEvents="none">
          <Text style={styles.toastText}>{arena.toast}</Text>
        </View>
      )}

      {/* Reactive (Vorld TV) overlay: countdown / boost popup / item-drop notifications */}
      {arena.phase !== 'finished' && (
        <ReactiveOverlay
          countdown={reactive.countdown}
          celebration={reactive.celebration}
          toasts={reactive.toasts}
          reconnecting={reactive.reconnecting}
          itemEvent={arena.itemEvent}
          topInset={insets.top}
          sidePad={sidePad}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  hud: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  joystickArea: {
    position: 'absolute',
  },
  fireArea: {
    position: 'absolute',
  },
  itemBar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  bombBar: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 12,
  },
  gunBar: {
    position: 'absolute',
    top: '26%',
    flexDirection: 'column',
    gap: 9,
  },
  gunBtn: {
    width: 46,
    height: 46,
    borderRadius: 11,
    borderWidth: 1.6,
    backgroundColor: 'rgba(8,9,16,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  gunBtnArt: {
    width: 34,
    height: 34,
  },
  gunActiveDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  itemBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'rgba(8,9,16,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBtnArt: {
    width: 36,
    height: 36,
  },
  itemBtnCount: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#ecb53f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBtnCountText: {
    color: '#120c06',
    fontSize: 11,
    fontWeight: '900',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  countdownText: {
    fontSize: 84,
    fontWeight: '900',
    color: GOLD_GLOW,
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  resultHeadline: {
    fontSize: 40,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  resultReason: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    marginTop: 8,
    letterSpacing: 2,
  },
  resultStat: {
    fontSize: 26,
    fontWeight: '900',
    color: GOLD_GLOW,
    marginTop: 12,
  },
  toastBar: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    backgroundColor: 'rgba(239,68,68,0.85)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 50,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
