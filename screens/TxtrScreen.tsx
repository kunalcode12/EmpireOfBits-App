import * as Font from 'expo-font';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TxtrCanvas from '../components/txtr/TxtrCanvas';
import TxtrFx, { type TxtrFxHandle } from '../components/txtr/TxtrFx';
import TxtrHud, { type HudSnapshot } from '../components/txtr/TxtrHud';
import TxtrSteer from '../components/txtr/TxtrSteer';
import EntryOverlay from '../components/txtr/overlays/EntryOverlay';
import GameOverOverlay, { type GameOverData } from '../components/txtr/overlays/GameOverOverlay';
import GarageOverlay from '../components/txtr/overlays/GarageOverlay';
import PauseOverlay from '../components/txtr/overlays/PauseOverlay';
import StartOverlay from '../components/txtr/overlays/StartOverlay';
import TrophiesOverlay from '../components/txtr/overlays/TrophiesOverlay';
import { txtrAudio } from '../lib/txtr/audio';
import {
  COMBO_TIME,
  FREDOKA_BOLD_FONT,
  FREDOKA_BOLD_URI,
  FREDOKA_FONT,
  FREDOKA_URI,
  TXTR,
} from '../lib/txtr/constants';
import { CARS, DIFFICULTIES, findCar, type Achievement, type DifficultyId } from '../lib/txtr/content';
import {
  createWorld,
  moveLane,
  mphOf,
  resetToMenu,
  settle,
  setViewport,
  startRun,
  update,
  type World,
} from '../lib/txtr/engine';
import {
  addPendingAward,
  defaultProfile,
  equipCar,
  finalizeRun,
  flushProfile,
  grantCar,
  loadProfile,
  setDifficulty as persistDifficulty,
  setMuted as persistMuted,
  settlePendingAward,
  type TxtrProfile,
} from '../lib/txtr/profile';
import { clamp, dailySeed, mulberry32 } from '../lib/txtr/rng';
import { usePoints } from '../store/PointsContext';
import { lockLandscape, lockPortrait } from '../utils/orientation';

/** A run costs this many points; coins collected are paid back as points. */
export const TXTR_ENTRY_COST = 50;

// ─── TXTR ────────────────────────────────────────────────────────────────────
// A five-lane endless runner: dodge traffic, chain coins and near misses into a
// score multiplier, spend the coins in the garage. This screen owns the run's
// state machine and every overlay; the simulation lives in lib/txtr/engine.ts
// and the scene is drawn by components/txtr/TxtrCanvas.tsx, which also drives
// the frame loop.

type Overlay = 'start' | 'none' | 'pause' | 'over' | 'garage' | 'trophies' | 'entry';
type Phase = 'menu' | 'playing' | 'paused' | 'gameover';

interface Task {
  id: number;
  fn: () => void;
  remaining: number;
}

// Only really short viewports drop the combo block (the CSS max-height rule);
// a normal landscape phone keeps it, just tightened up.
const COMPACT_HEIGHT = 300;

export default function TxtrScreen() {
  // The frame loop writes through refs during render (the pattern used by
  // components/arena/ArenaCanvas.tsx); opting this component out of the React
  // Compiler keeps those writes honest.
  'use no memo';

  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ paid?: string }>();
  const { points, pointsLoading, refreshPoints, applyPointsDelta } = usePoints();
  const pointsRef = useRef<number | null>(points);
  pointsRef.current = points;

  /* --- entry credit ------------------------------------------------------- */
  // The arcade charges the fee before pushing us here. That credit buys exactly
  // one run: starting a run spends it, and leaving without starting refunds it.
  const creditRef = useRef(params.paid === '1');
  const [hasCredit, setHasCredit] = useState(params.paid === '1');
  const setCredit = useCallback((next: boolean) => {
    creditRef.current = next;
    setHasCredit(next);
  }, []);
  const [entryRetry, setEntryRetry] = useState(false);
  const [entryCharging, setEntryCharging] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [buyingCar, setBuyingCar] = useState<string | null>(null);

  /* --- profile / fonts --------------------------------------------------- */
  const [profile, setProfile] = useState<TxtrProfile>(() => defaultProfile());
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // TXTR plays in landscape: a five-lane road needs the width. Every exit path
    // restores portrait for the rest of the app.
    lockLandscape();
    void refreshPoints().catch(() => {});
    void loadProfile().then(async (p) => {
      if (!alive) return;
      setProfile(p);
      txtrAudio.setMuted(p.muted);
      // Coins from a run whose credit call failed (offline, etc.) are retried
      // the next time the game opens, so nothing a player earned is ever lost.
      if (p.pendingAward > 0) {
        try {
          await applyPointsDelta(p.pendingAward);
          if (!alive) return;
          const settled = settlePendingAward(p, p.pendingAward);
          profileRef.current = settled;
          setProfile(settled);
        } catch {
          // stays pending for the next attempt
        }
      }
    });
    // Best-effort font load, each face independently so one 404 can't kill both.
    Font.loadAsync({ [FREDOKA_FONT]: FREDOKA_URI })
      .then(() => alive && setFontsReady(true))
      .catch(() => {});
    Font.loadAsync({ [FREDOKA_BOLD_FONT]: FREDOKA_BOLD_URI }).catch(() => {});
    return () => {
      alive = false;
      flushProfile();
      lockPortrait();
    };
    // mount-only: the points helpers are stable for this screen's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fontFamily = fontsReady ? FREDOKA_FONT : undefined;

  /* --- layout ------------------------------------------------------------ */
  const [rootH, setRootH] = useState(winH);
  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    setRootH(e.nativeEvent.layout.height);
  }, []);

  const [phase, setPhaseState] = useState<Phase>('menu');
  const phaseRef = useRef<Phase>('menu');
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const runLive = phase !== 'menu';
  const gameH = Math.round(rootH);
  const landscape = winW > winH;
  const compact = gameH < COMPACT_HEIGHT;
  const sidePad = Math.max(insets.left, insets.right, landscape ? 18 : 12);

  /* --- world ------------------------------------------------------------- */
  const worldRef = useRef<World | null>(null);
  if (worldRef.current === null) {
    worldRef.current = createWorld(winW, winH, DIFFICULTIES[profile.difficulty] ?? DIFFICULTIES.normal);
  }
  const world = worldRef.current;

  useEffect(() => {
    setViewport(world, winW, gameH);
  }, [world, winW, gameH]);

  /* --- refs used by the frame loop --------------------------------------- */
  const fxRef = useRef<TxtrFxHandle>(null);
  const tasksRef = useRef<Task[]>([]);
  const taskIdRef = useRef(0);

  const [overlay, setOverlay] = useState<Overlay>('start');
  const overlayRef = useRef<Overlay>('start');
  const setOverlayBoth = useCallback((next: Overlay) => {
    overlayRef.current = next;
    setOverlay(next);
  }, []);

  const [daily, setDaily] = useState(false);
  const dailyRef = useRef(false);
  const [deniedTick, setDeniedTick] = useState(0);
  const [gameOver, setGameOver] = useState<GameOverData | null>(null);
  const pendingUnlocksRef = useRef<Achievement[]>([]);

  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    best: 0,
    coins: 0,
    mph: mphOf(DIFFICULTIES.normal.startSpeed),
    combo: 0,
    mult: 1,
    comboFrac: 0,
    shield: false,
    magnet: 0,
    boost: 0,
  });

  /* --- pausable scheduler ------------------------------------------------ */
  const schedule = useCallback((fn: () => void, delayMs: number) => {
    taskIdRef.current += 1;
    tasksRef.current.push({ id: taskIdRef.current, fn, remaining: delayMs });
  }, []);

  const clearTasks = useCallback(() => {
    tasksRef.current = [];
  }, []);

  const tickTasks = useCallback((dtMs: number) => {
    const tasks = tasksRef.current;
    if (tasks.length === 0) return;
    const due: Task[] = [];
    for (const t of tasks) {
      t.remaining -= dtMs;
      if (t.remaining <= 0) due.push(t);
    }
    if (due.length === 0) return;
    tasksRef.current = tasks.filter((t) => !due.includes(t));
    for (const t of due) t.fn();
  }, []);

  /* --- run lifecycle ------------------------------------------------------ */
  const showGameOver = useCallback(() => {
    setOverlayBoth('over');
    if (pendingUnlocksRef.current.length > 0) txtrAudio.achievement();
  }, [setOverlayBoth]);

  /** Credits the coins collected this run to the backend points balance. */
  const bankCoins = useCallback(
    async (amount: number) => {
      if (amount <= 0) {
        setGameOver((prev) => (prev ? { ...prev, awardState: 'banked' } : prev));
        return;
      }
      // Record the debt first: if the call fails the coins survive a restart.
      const owed = addPendingAward(profileRef.current, amount);
      profileRef.current = owed;
      setProfile(owed);
      try {
        await applyPointsDelta(amount);
        const settled = settlePendingAward(profileRef.current, amount);
        profileRef.current = settled;
        setProfile(settled);
        setGameOver((prev) => (prev ? { ...prev, awardState: 'banked' } : prev));
      } catch {
        setGameOver((prev) => (prev ? { ...prev, awardState: 'failed' } : prev));
      }
    },
    [applyPointsDelta],
  );

  const handleCrash = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    clearTasks();

    const result = finalizeRun(profileRef.current, w);
    profileRef.current = result.profile;
    setProfile(result.profile);
    pendingUnlocksRef.current = result.unlocked;

    const earned = w.coins;
    setGameOver({
      score: w.score,
      newBest: result.newBest,
      coins: earned,
      nearMisses: w.run.nearMisses,
      bestMult: w.run.bestMult,
      topMph: w.run.topMph,
      distance: w.distance,
      unlocked: result.unlocked,
      awardState: earned > 0 ? 'pending' : 'banked',
    });
    setPhase('gameover');
    schedule(showGameOver, 780);
    void bankCoins(earned);
  }, [bankCoins, clearTasks, schedule, setPhase, showGameOver]);

  const startGame = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    clearTasks();
    fxRef.current?.clear();
    setGameOver(null);
    pendingUnlocksRef.current = [];

    const seeded = dailyRef.current ? mulberry32(dailySeed()) : Math.random;
    startRun(w, {
      difficultyId: profileRef.current.difficulty,
      daily: dailyRef.current,
      rng: seeded,
    });
    setOverlayBoth('none');
    setPhase('playing');
  }, [clearTasks, setOverlayBoth, setPhase]);

  /**
   * Every run has to be paid for. If the entry fee from the arcade (or a
   * previous top-up) is still unspent it is consumed here; otherwise the till
   * opens and the fee is charged before the run begins.
   */
  const requestStart = useCallback(
    (retry: boolean) => {
      if (creditRef.current) {
        setCredit(false);
        startGame();
        return;
      }
      setEntryRetry(retry);
      setEntryError(null);
      setOverlayBoth('entry');
      void refreshPoints().catch(() => {});
    },
    [refreshPoints, setCredit, setOverlayBoth, startGame],
  );

  const handleEntryConfirm = useCallback(async () => {
    if (entryCharging) return;
    const balance = pointsRef.current;
    if (balance === null || balance < TXTR_ENTRY_COST) {
      setEntryError(null);
      void refreshPoints().catch(() => {});
      return;
    }
    setEntryCharging(true);
    setEntryError(null);
    try {
      await applyPointsDelta(-TXTR_ENTRY_COST);
      txtrAudio.purchase();
      setCredit(false); // consumed immediately by the run we are about to start
      startGame();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Could not charge the entry fee.');
    } finally {
      setEntryCharging(false);
    }
  }, [applyPointsDelta, entryCharging, refreshPoints, setCredit, startGame]);

  const pauseGame = useCallback(() => {
    const w = worldRef.current;
    if (!w || w.state !== 'playing') return;
    w.state = 'paused';
    setPhase('paused');
    setOverlayBoth('pause');
  }, [setOverlayBoth, setPhase]);

  const resumeGame = useCallback(() => {
    const w = worldRef.current;
    if (!w || w.state !== 'paused') return;
    w.state = 'playing';
    setPhase('playing');
    setOverlayBoth('none');
  }, [setOverlayBoth, setPhase]);

  const goMenu = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    clearTasks();
    fxRef.current?.clear();
    // Wipe the wreck (and its leftover shake / flash / debris) so the menu shows
    // the same calm empty road you get on a cold open.
    resetToMenu(w);
    setPhase('menu');
    setOverlayBoth('start');
  }, [clearTasks, setOverlayBoth, setPhase]);

  const exitToArcade = useCallback(() => {
    flushProfile();
    lockPortrait();
    // Paid but never played: hand the entry fee straight back, the same way the
    // chess lobby refunds when you back out before a match starts.
    if (creditRef.current) {
      creditRef.current = false;
      void applyPointsDelta(TXTR_ENTRY_COST).catch(() => {});
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/play' as never);
  }, [applyPointsDelta]);

  /* --- frame loop --------------------------------------------------------- */
  const drainEvents = useCallback(
    (w: World) => {
      if (w.events.length === 0) return;
      const events = w.events.splice(0, w.events.length);
      for (const ev of events) {
        switch (ev.kind) {
          case 'popup':
            fxRef.current?.popup(ev.text, ev.x, ev.y, ev.style);
            break;
          case 'banner':
            fxRef.current?.banner(ev.main, ev.sub, ev.style);
            break;
          case 'sfx':
            txtrAudio.play(ev.cue, ev.level);
            break;
          case 'crash':
            handleCrash();
            break;
          default:
            break;
        }
      }
    },
    [handleCrash],
  );

  const frameImpl = (dt: number) => {
    const w = worldRef.current;
    if (!w) return;
    if (w.state === 'playing') update(w, dt);
    // A finished run still eases out: the crash shake, the white flash and the
    // debris keep decaying instead of freezing on screen.
    else if (w.state === 'gameover') settle(w, dt);
    if (w.state !== 'paused') tickTasks(dt * 1000);
    drainEvents(w);
  };
  const frameRef = useRef(frameImpl);
  frameRef.current = frameImpl;
  const onFrame = useCallback((dt: number) => {
    frameRef.current(dt);
  }, []);

  /* --- HUD snapshot (20Hz — the scene itself runs at 60) ------------------- */
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'paused') return;
    const id = setInterval(() => {
      const w = worldRef.current;
      if (!w) return;
      setHud({
        score: w.score,
        best: profileRef.current.best,
        coins: w.coins,
        mph: mphOf(w.speed),
        combo: w.combo,
        mult: w.mult,
        comboFrac: clamp(w.comboTimer / COMBO_TIME, 0, 1),
        shield: w.shield,
        magnet: w.magnet,
        boost: w.boost,
      });
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  /* --- app lifecycle / back button ---------------------------------------- */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && worldRef.current?.state === 'playing') pauseGame();
    });
    return () => sub.remove();
  }, [pauseGame]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = overlayRef.current;
      if (current === 'garage' || current === 'trophies' || current === 'entry') {
        if (entryCharging) return true;
        txtrAudio.uiBack();
        setOverlayBoth(phaseRef.current === 'gameover' ? 'over' : 'start');
        return true;
      }
      if (phaseRef.current === 'playing') {
        pauseGame();
        return true;
      }
      if (current === 'pause') {
        resumeGame();
        return true;
      }
      // The wreck screen only leads two ways: pay to retry, or out.
      exitToArcade();
      return true;
    });
    return () => sub.remove();
  }, [entryCharging, exitToArcade, pauseGame, resumeGame, setOverlayBoth]);

  useEffect(
    () => () => {
      clearTasks();
      flushProfile();
    },
    [clearTasks],
  );

  /* --- handlers ----------------------------------------------------------- */
  const handleSteer = useCallback((dir: number) => {
    const w = worldRef.current;
    if (!w) return;
    moveLane(w, dir);
  }, []);

  const handleMute = useCallback(() => {
    const next = persistMuted(profileRef.current, !profileRef.current.muted);
    profileRef.current = next;
    setProfile(next);
    txtrAudio.setMuted(next.muted);
  }, []);

  const handleTogglePause = useCallback(() => {
    txtrAudio.uiClick();
    if (phaseRef.current === 'playing') pauseGame();
    else if (phaseRef.current === 'paused') resumeGame();
  }, [pauseGame, resumeGame]);

  const handleSelectDifficulty = useCallback((id: DifficultyId) => {
    txtrAudio.uiClick();
    const next = persistDifficulty(profileRef.current, id);
    profileRef.current = next;
    setProfile(next);
  }, []);

  const handleToggleDaily = useCallback(() => {
    txtrAudio.uiClick();
    dailyRef.current = !dailyRef.current;
    setDaily(dailyRef.current);
  }, []);

  const handleBuyCar = useCallback(
    async (id: string) => {
      if (buyingCar) return;
      const car = CARS.find((c) => c.id === id);
      if (!car || profileRef.current.ownedCars.includes(id)) return;
      if ((pointsRef.current ?? 0) < car.price) {
        txtrAudio.denied();
        setDeniedTick((t) => t + 1);
        return;
      }
      setBuyingCar(id);
      try {
        // Charge the backend first — ownership is only recorded once paid.
        await applyPointsDelta(-car.price);
        const next = grantCar(profileRef.current, id);
        if (next) {
          profileRef.current = next;
          setProfile(next);
        }
        txtrAudio.purchase();
      } catch {
        txtrAudio.denied();
        setDeniedTick((t) => t + 1);
      } finally {
        setBuyingCar(null);
      }
    },
    [applyPointsDelta, buyingCar],
  );

  const handleEquipCar = useCallback((id: string) => {
    const next = equipCar(profileRef.current, id);
    if (!next) return;
    profileRef.current = next;
    setProfile(next);
    txtrAudio.uiClick();
  }, []);

  const openGarage = useCallback(() => {
    txtrAudio.uiClick();
    setOverlayBoth('garage');
  }, [setOverlayBoth]);

  const openTrophies = useCallback(() => {
    txtrAudio.uiClick();
    setOverlayBoth('trophies');
  }, [setOverlayBoth]);

  const closeSubOverlay = useCallback(() => {
    txtrAudio.uiBack();
    setOverlayBoth(phaseRef.current === 'gameover' ? 'over' : 'start');
  }, [setOverlayBoth]);

  const handlePlay = useCallback(() => {
    txtrAudio.uiClick();
    void txtrAudio.arm();
    requestStart(false);
  }, [requestStart]);

  const handleRetry = useCallback(() => {
    txtrAudio.uiClick();
    requestStart(true);
  }, [requestStart]);

  const handleEntryCancel = useCallback(() => {
    txtrAudio.uiBack();
    // Back to wherever the request came from: the wreck, or the menu.
    setOverlayBoth(phaseRef.current === 'gameover' ? 'over' : 'start');
  }, [setOverlayBoth]);

  const car = useMemo(() => findCar(profile.selectedCar), [profile.selectedCar]);
  const scrimInsets = useMemo(
    () => ({ top: insets.top, bottom: insets.bottom }),
    [insets.top, insets.bottom],
  );

  /* --- render -------------------------------------------------------------- */
  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <View style={[styles.stage, { width: winW, height: gameH }]}>
        <TxtrCanvas
          world={world}
          car={car}
          width={winW}
          height={gameH}
          onFrame={onFrame}
          fontFamily={fontFamily}
        />
        <TxtrFx ref={fxRef} fontFamily={fontFamily} bannerTop={gameH * 0.28} />
      </View>

      <TxtrSteer
        onSteer={handleSteer}
        width={winW}
        height={gameH}
        buttonsBottom={insets.bottom + (landscape ? 16 : 28)}
        sidePad={sidePad}
        enabled={phase === 'playing'}
      />

      {runLive && (
        <TxtrHud
          hud={hud}
          muted={profile.muted}
          paused={phase === 'paused'}
          compact={compact}
          dense={landscape}
          topInset={insets.top}
          sidePad={sidePad}
          fontFamily={fontFamily}
          onPause={handleTogglePause}
          onMute={handleMute}
        />
      )}

      {overlay === 'start' && (
        <StartOverlay
          profile={profile}
          points={points}
          cost={TXTR_ENTRY_COST}
          paid={hasCredit}
          daily={daily}
          landscape={landscape}
          insets={scrimInsets}
          fontFamily={fontFamily}
          onPlay={handlePlay}
          onGarage={openGarage}
          onTrophies={openTrophies}
          onToggleDaily={handleToggleDaily}
          onSelectDifficulty={handleSelectDifficulty}
          onExit={exitToArcade}
        />
      )}

      {overlay === 'pause' && (
        <PauseOverlay
          landscape={landscape}
          insets={scrimInsets}
          fontFamily={fontFamily}
          onResume={() => {
            txtrAudio.uiClick();
            resumeGame();
          }}
          onRestart={() => {
            txtrAudio.uiClick();
            requestStart(true);
          }}
          onMenu={() => {
            txtrAudio.uiBack();
            goMenu();
          }}
        />
      )}

      {overlay === 'over' && gameOver && (
        <GameOverOverlay
          data={gameOver}
          retryCost={TXTR_ENTRY_COST}
          landscape={landscape}
          insets={scrimInsets}
          fontFamily={fontFamily}
          onRetry={handleRetry}
          onExit={exitToArcade}
        />
      )}

      {overlay === 'entry' && (
        <EntryOverlay
          cost={TXTR_ENTRY_COST}
          balance={points}
          loading={pointsLoading}
          charging={entryCharging}
          error={entryError}
          retry={entryRetry}
          landscape={landscape}
          insets={scrimInsets}
          fontFamily={fontFamily}
          onConfirm={() => void handleEntryConfirm()}
          onCancel={handleEntryCancel}
          onExit={exitToArcade}
        />
      )}

      {overlay === 'garage' && (
        <GarageOverlay
          profile={profile}
          points={points}
          buying={buyingCar}
          landscape={landscape}
          insets={scrimInsets}
          fontFamily={fontFamily}
          deniedTick={deniedTick}
          onBuy={(id) => void handleBuyCar(id)}
          onEquip={handleEquipCar}
          onBack={closeSubOverlay}
        />
      )}

      {overlay === 'trophies' && (
        <TrophiesOverlay
          profile={profile}
          points={points}
          landscape={landscape}
          insets={scrimInsets}
          fontFamily={fontFamily}
          onBack={closeSubOverlay}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TXTR.sky,
  },
  stage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
