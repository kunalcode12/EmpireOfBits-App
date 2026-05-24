import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChessBoard } from '../components/ChessBoard';
import { Timer } from '../components/Timer';
import { useComputerChessGame } from '../hooks/useComputerChessGame';
import { useAuth } from '../store/AuthContext';
import { usePoints } from '../store/PointsContext';
import { savePendingCelebration } from '../utils/storageHelper';
import { getUserRatingById } from '../api/authApi';
import { parseFen, type Color, type PromotionPiece } from '../utils/chessHelpers';

const BG = '#05050F';
const GREEN = '#4ade80';
const RED = '#ef4444';
const MUTED = '#71717a';
const INK = '#f5f5f5';
const HAIRLINE_HI = 'rgba(255,255,255,0.14)';

const RUNE_MAP: Record<string, string> = {
  E: 'ᛖ', M: 'ᛗ', P: 'ᛈ', I: 'ᛁ', R: 'ᚱ',
  O: 'ᛟ', F: 'ᚠ', B: 'ᛒ', T: 'ᛏ', S: 'ᛊ',
  ' ': '  ',
};
const EMPIRE_RUNES = 'EMPIRE OF BITS'.split('').map((c) => RUNE_MAP[c] ?? c).join('');
const RUNE_LINE = `${EMPIRE_RUNES}   ᛉ   ${EMPIRE_RUNES}   ✦   ${EMPIRE_RUNES}   ᚷ   `;
const ROW_CONFIGS = [
  { opacity: 0.15, size: 20, offset: 0 }, { opacity: 0.10, size: 17, offset: -44 },
  { opacity: 0.17, size: 23, offset: 18 }, { opacity: 0.11, size: 18, offset: -22 },
  { opacity: 0.14, size: 21, offset: 36 }, { opacity: 0.09, size: 16, offset: -10 },
  { opacity: 0.16, size: 22, offset: 8 }, { opacity: 0.10, size: 19, offset: -38 },
  { opacity: 0.15, size: 20, offset: 26 }, { opacity: 0.11, size: 17, offset: -16 },
  { opacity: 0.17, size: 24, offset: 42 }, { opacity: 0.09, size: 18, offset: -6 },
  { opacity: 0.14, size: 21, offset: 14 }, { opacity: 0.10, size: 16, offset: -30 },
  { opacity: 0.16, size: 20, offset: 22 }, { opacity: 0.11, size: 23, offset: -48 },
];

function RunicBackground() {
  return (
    <View pointerEvents="none" style={styles.bgContainer}>
      {ROW_CONFIGS.map((cfg, i) => (
        <View key={i} style={[styles.bgRow, { marginLeft: cfg.offset }]}>
          <Text style={[styles.bgRuneText, { opacity: cfg.opacity, fontSize: cfg.size }]} numberOfLines={1}>
            {RUNE_LINE}
          </Text>
        </View>
      ))}
    </View>
  );
}

const WIN_POINTS = 60;
const DRAW_POINTS = 5;

const PROMOTION_PIECES: { piece: PromotionPiece; icon: string }[] = [
  { piece: 'q', icon: 'chess-queen' },
  { piece: 'r', icon: 'chess-rook' },
  { piece: 'b', icon: 'chess-bishop' },
  { piece: 'n', icon: 'chess-knight' },
];

export function ComputerChessScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ color?: string; time?: string }>();
  const initialColor: Color = params.color === 'b' ? 'b' : 'w';
  const timeMinutes = params.time === '10' ? 10 : 5;
  const initialSeconds = timeMinutes * 60;
  const auth = useAuth();
  const game = useComputerChessGame(initialColor);
  const { applyPointsDelta, refreshPoints } = usePoints();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [resignModalOpen, setResignModalOpen] = useState(false);
  const [viewPly, setViewPly] = useState(0);
  const resultHandledRef = useRef(false);
  const [playerRating, setPlayerRating] = useState<number | null>(auth.user?.rating ?? null);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId) return;
    void getUserRatingById(userId)
      .then((r) => setPlayerRating(r))
      .catch(() => {});
  }, [auth.user?.id]);

  const [playerMs, setPlayerMs] = useState(initialSeconds * 1000);
  const [computerMs, setComputerMs] = useState(initialSeconds * 1000);
  const lastTickRef = useRef<number | null>(null);

  const playerTimerActive = game.turn === game.playerColor && !game.isGameOver && game.moveCount > 0;
  const computerTimerActive = game.turn !== game.playerColor && !game.isGameOver && game.moveCount > 0;
  const anyTimerActive = playerTimerActive || computerTimerActive;

  useEffect(() => {
    if (!anyTimerActive) {
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - (lastTickRef.current ?? now);
      lastTickRef.current = now;
      if (playerTimerActive) {
        setPlayerMs((prev) => Math.max(0, prev - elapsed));
      } else if (computerTimerActive) {
        setComputerMs((prev) => Math.max(0, prev - elapsed));
      }
    }, 100);
    return () => clearInterval(id);
  }, [anyTimerActive, playerTimerActive, computerTimerActive]);

  useEffect(() => {
    if (game.isGameOver) return;
    if (playerMs <= 0) game.resign();
  }, [playerMs, game]);

  useEffect(() => {
    if (game.isGameOver) return;
    if (computerMs <= 0) game.forceWin('Timeout');
  }, [computerMs, game]);

  const playerSeconds = Math.ceil(playerMs / 1000);
  const computerSeconds = Math.ceil(computerMs / 1000);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    setViewPly(game.fenHistory.length - 1);
  }, [game.fenHistory.length]);

  const myName = auth.user?.username ?? 'You';
  const ownActive = game.turn === game.playerColor && !game.aiThinking && !game.isGameOver;
  const opponentActive = game.turn !== game.playerColor && game.aiThinking;

  const viewingCurrent = viewPly === game.fenHistory.length - 1;
  const viewBoard = viewingCurrent ? game.board : parseFen(game.fenHistory[viewPly] ?? game.fen).board;

  const handleResign = useCallback(() => {
    setResignModalOpen(false);
    setActionsOpen(false);
    game.resign();
  }, [game]);

  useEffect(() => {
    if (!game.isGameOver || resultHandledRef.current) return;
    resultHandledRef.current = true;
    const delta = game.result === 'win' ? WIN_POINTS : game.result === 'draw' ? DRAW_POINTS : 0;
    const outcome = game.result === 'win' ? 'win' : 'lose';

    const finish = async () => {
      let newPoints: number | null = null;
      if (delta > 0) {
        try {
          newPoints = await applyPointsDelta(delta);
          await refreshPoints();
        } catch { /* ignore */ }
      }
      try {
        await savePendingCelebration({
          outcome: game.result === 'draw' ? 'win' : outcome,
          pointsDelta: delta,
          newPoints,
          newRating: null,
          ratingChange: null,
          createdAt: Date.now(),
        });
      } catch { /* ignore */ }
      router.replace({
        pathname: '/computer-result' as any,
        params: {
          result: game.result ?? 'draw',
          reason: game.resultReason ?? 'Game Over',
          points: String(delta),
          moves: String(game.moveCount),
        },
      });
    };
    void finish();
  }, [game.isGameOver, game.result, game.resultReason, game.moveCount, applyPointsDelta, refreshPoints]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <RunicBackground />

      {/* Opponent (Computer) info + timer */}
      <View style={styles.playerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.playerLabel}>Opponent</Text>
          <Text style={styles.nameLabel}>Computer</Text>
          <Text style={styles.statusText}>
            {game.isGameOver ? 'Game Over' : opponentActive ? 'Thinking...' : 'Waiting'}
          </Text>
        </View>
        <Timer
          seconds={computerSeconds}
          label={timeMinutes === 10 ? '10 min' : '5 min'}
          active={computerTimerActive}
        />
      </View>

      {/* Board */}
      <View style={styles.boardWrap}>
        <ChessBoard
          board={viewBoard}
          orientation={game.playerColor}
          selected={viewingCurrent ? game.selected : null}
          legalTargets={viewingCurrent ? game.legalTargets : []}
          lastMove={viewingCurrent ? game.lastMove : null}
          checkSquare={viewingCurrent ? game.checkSquare : null}
          disabled={!viewingCurrent || game.isGameOver || game.aiThinking || game.turn !== game.playerColor}
          onSquarePress={game.tapSquare}
        />
      </View>

      {/* Player info + timer */}
      <View style={styles.playerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.playerLabel}>You</Text>
          <Text style={styles.nameLabel}>{myName}</Text>
          {typeof playerRating === 'number' ? (
            <Text style={styles.ratingLabel}>Rating: {playerRating}</Text>
          ) : null}
          <Text style={[styles.statusText, ownActive && styles.activeStatus]}>
            {game.isGameOver ? 'Game Over' : ownActive ? 'Your move' : 'Opponent turn'}
          </Text>
        </View>
        <Timer
          seconds={playerSeconds}
          label={timeMinutes === 10 ? '10 min' : '5 min'}
          active={playerTimerActive}
        />
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          style={styles.bottomTab}
          onPress={() => setActionsOpen(true)}
          disabled={game.isGameOver}
        >
          <MaterialCommunityIcons name="cog-outline" size={18} color={game.isGameOver ? MUTED : '#f0d9b5'} />
          <Text style={[styles.bottomTabText, game.isGameOver && { color: MUTED }]}>Actions</Text>
        </Pressable>
        <Pressable
          style={[styles.navBtn, viewPly <= 0 && styles.navBtnDisabled]}
          disabled={viewPly <= 0}
          onPress={() => setViewPly((p) => Math.max(0, p - 1))}
        >
          <Text style={styles.navBtnText}>{'<'}</Text>
        </Pressable>
        <Pressable
          style={[styles.navBtn, viewPly >= game.fenHistory.length - 1 && styles.navBtnDisabled]}
          disabled={viewPly >= game.fenHistory.length - 1}
          onPress={() => setViewPly((p) => Math.min(game.fenHistory.length - 1, p + 1))}
        >
          <Text style={styles.navBtnText}>{'>'}</Text>
        </Pressable>
      </View>

      {/* Actions modal */}
      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Actions</Text>
              <Pressable style={styles.modalClose} onPress={() => setActionsOpen(false)}>
                <Text style={styles.modalCloseText}>X</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.resignRow}
              onPress={() => { setActionsOpen(false); setResignModalOpen(true); }}
            >
              <MaterialCommunityIcons name="flag-outline" size={18} color={RED} />
              <Text style={styles.resignRowText}>Resign</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Resign confirmation */}
      <Modal visible={resignModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Resign Game?</Text>
            <Text style={styles.resignSubtext}>This counts as a loss.</Text>
            <View style={styles.resignActions}>
              <Pressable style={styles.resignConfirmBtn} onPress={handleResign}>
                <MaterialCommunityIcons name="flag" size={16} color="#fff" />
                <Text style={styles.resignConfirmText}>RESIGN</Text>
              </Pressable>
              <Pressable style={styles.resignCancelBtn} onPress={() => setResignModalOpen(false)}>
                <Text style={styles.resignCancelText}>CONTINUE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Promotion modal */}
      <Modal visible={!!game.pendingPromotion} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Promote Pawn</Text>
            <View style={styles.promoRow}>
              {PROMOTION_PIECES.map(({ piece, icon }) => (
                <Pressable key={piece} style={styles.promoBtn} onPress={() => game.choosePromotion(piece)}>
                  <MaterialCommunityIcons
                    name={icon as any}
                    size={36}
                    color={game.playerColor === 'w' ? '#1e1e1e' : '#e8e8e8'}
                  />
                </Pressable>
              ))}
            </View>
            <Pressable onPress={game.cancelPromotion}>
              <Text style={styles.promoCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  bgContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'hidden', justifyContent: 'space-around', paddingVertical: 4,
  },
  bgRow: { overflow: 'hidden' },
  bgRuneText: {
    color: '#d4900a', fontWeight: '300', letterSpacing: 5,
    textShadowColor: '#b86c04', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 10,
  },
  playerLabel: {
    color: MUTED, fontWeight: '800', textTransform: 'uppercase',
    fontSize: 10, letterSpacing: 1,
  },
  nameLabel: { color: INK, fontSize: 16, fontWeight: '900' },
  ratingLabel: { color: MUTED, fontSize: 12, fontWeight: '800', marginTop: 2 },
  statusText: { color: MUTED, fontSize: 11, fontWeight: '700', marginTop: 2 },
  activeStatus: { color: GREEN },
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#3d2b1d', borderTopWidth: 1, borderTopColor: '#5a3d28',
    paddingTop: 8, paddingHorizontal: 8, gap: 6,
  },
  bottomTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#5a3d28', backgroundColor: '#4a3424',
  },
  bottomTabText: {
    color: '#f0d9b5', fontWeight: '800', fontSize: 13,
  },
  navBtn: {
    width: 52, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#5a3d28', backgroundColor: '#4a3424',
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: { color: '#f0d9b5', fontWeight: '900', fontSize: 18 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 320, borderRadius: 14, borderWidth: 1,
    borderColor: '#3f3c38', backgroundColor: '#262421',
    padding: 18, gap: 12, alignItems: 'center',
  },
  modalHeader: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  modalTitle: { color: INK, fontWeight: '900', fontSize: 16 },
  modalClose: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1,
    borderColor: '#3f3c38', backgroundColor: '#312e2b',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { color: INK, fontWeight: '900', fontSize: 12 },
  resignRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)',
  },
  resignRowText: { color: RED, fontWeight: '800', fontSize: 14 },
  resignSubtext: { color: MUTED, fontSize: 13, textAlign: 'center' },
  resignActions: { width: '100%', gap: 10 },
  resignConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: RED, borderRadius: 8, paddingVertical: 14,
  },
  resignConfirmText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  resignCancelBtn: {
    alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    borderWidth: 1, borderColor: '#3f3c38', backgroundColor: '#312e2b', paddingVertical: 12,
  },
  resignCancelText: { color: MUTED, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  promoRow: { flexDirection: 'row', gap: 12 },
  promoBtn: {
    width: 58, height: 58, borderRadius: 12, borderWidth: 1.5, borderColor: HAIRLINE_HI,
    backgroundColor: '#f1f1f1', alignItems: 'center', justifyContent: 'center',
  },
  promoCancelText: { color: MUTED, fontSize: 13, fontWeight: '700', paddingVertical: 4 },
});
