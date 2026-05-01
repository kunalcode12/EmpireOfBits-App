import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Animated, Easing, ImageBackground, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ChessBoard } from '../components/ChessBoard';
import { ChessPiece } from '../components/ChessPiece';
import { DrawResignControls } from '../components/DrawResignControls';
import { Timer } from '../components/Timer';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useChessGame } from '../hooks/useChessGame';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import { applyMoveToBoard, boardToFenPlacement, isKingInCheck, oppositeColor, parseFen, squareToCoords, type ChessMove, type Color, type PromotionPiece } from '../utils/chessHelpers';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function GameScreen() {
  const auth = useAuth();
  const game = useGame();
  const [chatDraft, setChatDraft] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewPly, setViewPly] = useState(game.moves.length);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const lastChatCountRef = useRef(game.chat.length);
  const orientation: Color = game.color ?? 'w';
  const myName = auth.user?.username ?? 'You';
  const opponentName = game.opponentName ?? 'Opponent';
  const ownSeconds = orientation === 'w' ? game.timers.white : game.timers.black;
  const opponentSeconds = orientation === 'w' ? game.timers.black : game.timers.white;
  const ownActive = game.turn === orientation;
  const opponentActive = !ownActive;
  const replayStates = useMemo(() => {
    const initial = parseFen(START_FEN);
    let board = initial.board;
    let turn: Color = initial.turn;
    const snapshots: Array<{ board: typeof board; turn: Color; checkSquare: ReturnType<typeof isKingInCheck> }> = [
      { board, turn, checkSquare: isKingInCheck(board, turn) },
    ];
    game.moves.forEach((move) => {
      const from = squareToCoords(move.from);
      const to = squareToCoords(move.to);
      const movingPiece = board[from.row]?.[from.col];
      const isCastleLike = movingPiece?.type === 'k' && Math.abs(to.col - from.col) === 2;
      const replayMove: ChessMove = isCastleLike
        ? { ...move, castle: (to.col > from.col ? 'king' : 'queen') as 'king' | 'queen' }
        : move;
      board = applyMoveToBoard(board, replayMove);
      turn = oppositeColor(turn);
      snapshots.push({ board, turn, checkSquare: isKingInCheck(board, turn) });
    });
    return snapshots;
  }, [game.moves]);
  const safePly = Math.max(0, Math.min(viewPly, game.moves.length));
  const viewingLatest = safePly === game.moves.length;
  const replayState = replayStates[safePly] ?? replayStates[replayStates.length - 1];
  const displayFen = viewingLatest ? game.fen : `${boardToFenPlacement(replayState.board)} ${replayState.turn} - - 0 1`;
  const chess = useChessGame(displayFen, game.color, replayState.turn, game.makeMove);
  const interactionsDisabled =
    game.phase !== 'active' ||
    !game.color ||
    game.turn !== game.color ||
    game.opponentDisconnected ||
    !viewingLatest;
  const sortedChat = useMemo(
    () => [...game.chat].sort((a, b) => a.timestamp - b.timestamp).slice(-20),
    [game.chat],
  );
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkTranslateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    if (!game.toast) return undefined;
    const id = setTimeout(game.clearToast, 2200);
    return () => clearTimeout(id);
  }, [game.toast, game.clearToast]);

  useEffect(() => {
    if (!game.toast) return;
    if (/draw/i.test(game.toast) && /(reject|decline)/i.test(game.toast)) {
      setActionsOpen(false);
    }
  }, [game.toast]);

  useEffect(() => {
    setViewPly(game.moves.length);
  }, [game.moves.length]);

  useEffect(() => {
    if (chatOpen) setUnreadChatCount(0);
  }, [chatOpen]);

  useEffect(() => {
    const previousCount = lastChatCountRef.current;
    const currentCount = game.chat.length;
    if (currentCount > previousCount) {
      const incoming = currentCount - previousCount;
      if (!chatOpen) setUnreadChatCount((count) => count + incoming);
    }
    lastChatCountRef.current = currentCount;
  }, [game.chat.length, chatOpen]);

  useEffect(() => {
    if (!game.checkAlert) return undefined;
    checkOpacity.setValue(0);
    checkTranslateY.setValue(-8);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(checkOpacity, {
          toValue: 1,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(checkTranslateY, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1500),
      Animated.parallel([
        Animated.timing(checkOpacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(checkTranslateY, {
          toValue: -8,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    const id = setTimeout(game.clearCheckAlert, 2000);
    return () => clearTimeout(id);
  }, [game.checkAlertToken, game.checkAlert, game.clearCheckAlert, checkOpacity, checkTranslateY]);

  return (
    <ImageBackground source={require('../assets/images/backimg.png')} style={styles.screen} resizeMode="cover">
      <View pointerEvents="none" style={styles.tableGlossTop} />
      <View pointerEvents="none" style={styles.tableGlossMid} />
      <View pointerEvents="none" style={styles.tableGlossBottom} />
      <View pointerEvents="none" style={styles.woodGrainA} />
      <View pointerEvents="none" style={styles.woodGrainB} />
      <View pointerEvents="none" style={styles.woodGrainC} />
      <View pointerEvents="none" style={styles.woodGrainD} />
      <View pointerEvents="none" style={styles.woodGrainE} />
      <View pointerEvents="none" style={styles.woodGrainF} />
      <View pointerEvents="none" style={styles.woodPoreA} />
      <View pointerEvents="none" style={styles.woodPoreB} />
      <View pointerEvents="none" style={styles.woodPoreC} />
      <View pointerEvents="none" style={styles.woodVignette} />
      <View pointerEvents="none" style={styles.tableCrackOne} />
      <View pointerEvents="none" style={styles.tableCrackTwo} />
      <View pointerEvents="none" style={styles.tableCrackThree} />
      {game.checkAlert && (
        <Animated.View
          style={[
            styles.checkBannerWrap,
            {
              opacity: checkOpacity,
              transform: [{ translateY: checkTranslateY }],
            },
          ]}
        >
          <Text style={styles.checkBannerText}>Check</Text>
        </Animated.View>
      )}
      <View style={styles.content}>
        <View style={styles.retroHeader}>
          <Text style={styles.retroHeaderText}>EMPIRE OF BITS - ARCADE CHESS</Text>
        </View>
        {game.opponentDisconnected && <Text style={styles.banner}>Opponent disconnected - waiting for them to return...</Text>}
        <View style={styles.playerRow}>
          <View>
            <Text style={styles.playerLabel}>Opponent</Text>
            <Text style={styles.nameLabel}>{opponentName}</Text>
            <Text style={styles.status}>{opponentActive ? 'Thinking' : 'Waiting'}</Text>
          </View>
          <Timer seconds={opponentSeconds} label={orientation === 'w' ? 'Black' : 'White'} active={opponentActive} />
        </View>

        <View style={styles.boardWrap}>
          <ChessBoard
            board={viewingLatest ? chess.board : replayState.board}
            orientation={orientation}
            selected={viewingLatest ? chess.selected : null}
            legalTargets={viewingLatest ? chess.legalTargets : []}
            lastMove={viewingLatest ? game.lastMove : safePly > 0 ? game.moves[safePly - 1] : null}
            checkSquare={viewingLatest ? chess.checkSquare : replayState.checkSquare}
            disabled={interactionsDisabled}
            onSquarePress={chess.tapSquare}
          />
        </View>

        <View style={styles.playerRow}>
          <View>
            <Text style={styles.playerLabel}>You</Text>
            <Text style={styles.nameLabel}>{myName}</Text>
            <Text style={[styles.status, ownActive && styles.activeStatus]}>{ownActive ? 'Your move' : 'Opponent turn'}</Text>
          </View>
          <Timer seconds={ownSeconds} label={orientation === 'w' ? 'White' : 'Black'} active={ownActive} />
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomTab} onPress={() => setActionsOpen(true)}>
          <MaterialCommunityIcons name="format-list-bulleted-square" size={20} color={colors.text} />
          <Text style={styles.bottomTabText}>Actions</Text>
        </Pressable>
        <Pressable
          style={styles.bottomTab}
          onPress={() => {
            setUnreadChatCount(0);
            setChatOpen(true);
          }}
        >
          <MaterialCommunityIcons name="chat-outline" size={20} color={colors.text} />
          <Text style={styles.bottomTabText}>Chat</Text>
          {unreadChatCount > 0 && (
            <View style={styles.chatTabBadge}>
              <Text style={styles.chatTabBadgeText}>{unreadChatCount > 99 ? '99+' : String(unreadChatCount)}</Text>
            </View>
          )}
        </Pressable>
        <Pressable style={[styles.navTab, safePly <= 0 && styles.disabled]} disabled={safePly <= 0} onPress={() => setViewPly((curr) => Math.max(0, curr - 1))}>
          <Text style={styles.bottomTabText}>{'<'}</Text>
        </Pressable>
        <Pressable
          style={[styles.navTab, viewingLatest && styles.disabled]}
          disabled={viewingLatest}
          onPress={() => setViewPly((curr) => Math.min(game.moves.length, curr + 1))}
        >
          <Text style={styles.bottomTabText}>{'>'}</Text>
        </Pressable>
      </View>
      {game.toast && <Text style={styles.toast}>{game.toast}</Text>}

      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, styles.actionsModal]}>
            <View style={styles.actionsHeader}>
              <Text style={styles.modalTitle}>Game Actions</Text>
              <Pressable style={styles.closeButton} onPress={() => setActionsOpen(false)}>
                <Text style={styles.closeText}>X</Text>
              </Pressable>
            </View>
            <DrawResignControls
              onOfferDraw={game.offerDrawGame}
              onResign={game.resignGame}
              disabled={game.phase !== 'active' || game.opponentDisconnected}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <View style={styles.chatScreen}>
          <View style={styles.chatHeader}>
            <Pressable style={styles.backButton} onPress={() => setChatOpen(false)}>
              <Text style={styles.backButtonText}>{'<'}</Text>
            </Pressable>
            <Text style={styles.chatHeaderTitle}>Game Chat</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.chatList}>
            {sortedChat.length === 0 ? (
              <Text style={styles.chatPlaceholder}>No messages yet.</Text>
            ) : (
              sortedChat.map((item, index) => {
                const mine = Number(auth.user?.id) === item.sender;
                return (
                  <View key={`${item.timestamp}-${index}`} style={[styles.chatBubble, mine ? styles.chatBubbleMine : styles.chatBubbleOther]}>
                    <Text style={styles.chatSender}>{mine ? 'You' : opponentName}</Text>
                    <Text style={styles.chatText}>{item.message}</Text>
                  </View>
                );
              })
            )}
          </View>
          <View style={styles.chatComposerRow}>
            <TextInput
              value={chatDraft}
              onChangeText={setChatDraft}
              placeholder="Type a message"
              placeholderTextColor={colors.subtleText}
              style={styles.chatInput}
              onSubmitEditing={() => {
                game.sendChatMessage(chatDraft);
                setChatDraft('');
              }}
            />
            <Pressable
              style={styles.chatSend}
              onPress={() => {
                game.sendChatMessage(chatDraft);
                setChatDraft('');
              }}
            >
              <Text style={styles.chatSendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PromotionModal visible={Boolean(chess.pendingPromotion)} color={orientation} onPick={chess.choosePromotion} onCancel={chess.cancelPromotion} />
      <DrawOfferModal visible={game.drawOfferIncoming} onAccept={game.acceptDrawOffer} onReject={game.rejectDrawOffer} />
    </ImageBackground>
  );
}

function PromotionModal({
  visible,
  color,
  onPick,
  onCancel,
}: {
  visible: boolean;
  color: Color;
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const options: PromotionPiece[] = ['q', 'r', 'b', 'n'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Promote pawn</Text>
          <View style={styles.promotionRow}>
            {options.map((piece) => (
              <Pressable key={piece} style={styles.promotionButton} onPress={() => onPick(piece)}>
                <ChessPiece piece={{ color, type: piece }} size={52} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DrawOfferModal({ visible, onAccept, onReject }: { visible: boolean; onAccept: () => void; onReject: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modal, styles.drawModal]}>
          <View style={styles.drawBadge}>
            <Text style={styles.drawBadgeText}>DRAW OFFER</Text>
          </View>
          <Text style={styles.modalTitle}>Opponent offered a draw</Text>
          <Text style={styles.drawSubtitle}>Accept to finish this game as a draw, or decline to keep playing.</Text>
          <View style={styles.modalActions}>
            <Pressable style={[styles.modalButton, styles.declineButton]} onPress={onReject}>
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, styles.acceptButton]} onPress={onAccept}>
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#4a3220',
  },
  tableGlossTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(255,232,198,0.12)',
  },
  tableGlossMid: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    height: '10%',
    backgroundColor: 'rgba(255,225,184,0.06)',
  },
  tableGlossBottom: {
    position: 'absolute',
    bottom: '6%',
    left: 0,
    right: 0,
    height: '12%',
    backgroundColor: 'rgba(255,220,170,0.05)',
  },
  woodGrainA: {
    position: 'absolute',
    left: '-8%',
    top: '8%',
    width: '128%',
    height: 18,
    backgroundColor: 'rgba(104,63,33,0.26)',
    transform: [{ rotate: '-2deg' }],
  },
  woodGrainB: {
    position: 'absolute',
    left: '-4%',
    top: '28%',
    width: '124%',
    height: 14,
    backgroundColor: 'rgba(96,56,28,0.22)',
    transform: [{ rotate: '1deg' }],
  },
  woodGrainC: {
    position: 'absolute',
    left: '-10%',
    top: '56%',
    width: '134%',
    height: 16,
    backgroundColor: 'rgba(93,54,26,0.24)',
    transform: [{ rotate: '-1.2deg' }],
  },
  woodGrainD: {
    position: 'absolute',
    left: '-6%',
    top: '78%',
    width: '126%',
    height: 13,
    backgroundColor: 'rgba(88,50,24,0.2)',
    transform: [{ rotate: '1deg' }],
  },
  woodGrainE: {
    position: 'absolute',
    left: '-7%',
    top: '18%',
    width: '130%',
    height: 8,
    backgroundColor: 'rgba(119,73,39,0.16)',
    transform: [{ rotate: '0.5deg' }],
  },
  woodGrainF: {
    position: 'absolute',
    left: '-5%',
    top: '68%',
    width: '126%',
    height: 9,
    backgroundColor: 'rgba(117,69,37,0.14)',
    transform: [{ rotate: '-0.6deg' }],
  },
  woodPoreA: {
    position: 'absolute',
    left: '22%',
    top: '32%',
    width: 2,
    height: 26,
    borderRadius: 2,
    backgroundColor: 'rgba(60,31,16,0.16)',
  },
  woodPoreB: {
    position: 'absolute',
    right: '26%',
    top: '52%',
    width: 2,
    height: 22,
    borderRadius: 2,
    backgroundColor: 'rgba(60,31,16,0.14)',
  },
  woodPoreC: {
    position: 'absolute',
    left: '48%',
    top: '74%',
    width: 1.5,
    height: 18,
    borderRadius: 2,
    backgroundColor: 'rgba(60,31,16,0.14)',
  },
  woodVignette: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 18,
    borderColor: 'rgba(34,18,10,0.14)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  tableCrackOne: {
    position: 'absolute',
    left: '8%',
    top: '16%',
    width: 2,
    height: '42%',
    backgroundColor: 'rgba(42,20,9,0.28)',
    transform: [{ rotate: '-12deg' }],
  },
  tableCrackTwo: {
    position: 'absolute',
    right: '10%',
    bottom: '14%',
    width: 2,
    height: '36%',
    backgroundColor: 'rgba(42,20,9,0.26)',
    transform: [{ rotate: '20deg' }],
  },
  tableCrackThree: {
    position: 'absolute',
    left: '44%',
    top: '58%',
    width: 1.5,
    height: '24%',
    backgroundColor: 'rgba(42,20,9,0.22)',
    transform: [{ rotate: '-6deg' }],
  },
  retroHeader: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#a77445',
    backgroundColor: '#4b3220',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  retroHeaderText: {
    color: '#ffe1ab',
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 1.1,
  },
  banner: {
    color: colors.warning,
    backgroundColor: '#5a3e27',
    borderRadius: radii.sm,
    padding: spacing.md,
    fontWeight: '800',
    textAlign: 'center',
  },
  checkBannerWrap: {
    backgroundColor: '#5f432a',
    borderRadius: radii.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#b58350',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  checkBannerText: {
    color: '#f7e8b0',
    fontWeight: '900',
    textAlign: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#9f6f42',
    backgroundColor: '#4a3322',
    padding: spacing.md,
  },
  playerLabel: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '900',
  },
  nameLabel: {
    color: colors.subtleText,
    fontSize: typography.small,
    fontWeight: '700',
    marginTop: 1,
  },
  status: {
    color: colors.mutedText,
    marginTop: 2,
    fontWeight: '700',
  },
  activeStatus: {
    color: colors.accent,
  },
  boardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#935f36',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: '#3d2b1d',
  },
  bottomTab: {
    position: 'relative',
    flex: 1,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#a26f42',
    backgroundColor: '#563a23',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chatTabBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#d64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTabBadgeText: {
    color: '#fff',
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  navTab: {
    width: 52,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#a26f42',
    backgroundColor: '#563a23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  bottomTabText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '800',
  },
  chatScreen: {
    flex: 1,
    backgroundColor: '#2d1f14',
    padding: spacing.md,
    gap: spacing.sm,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  chatHeaderTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
  },
  headerSpacer: {
    width: 38,
  },
  actionsModal: {
    gap: spacing.lg,
  },
  actionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  closeText: {
    color: colors.text,
    fontWeight: '900',
  },
  chatList: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  chatPlaceholder: {
    color: colors.subtleText,
    fontStyle: 'italic',
  },
  chatBubble: {
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  chatBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#2f3b2d',
    borderColor: '#6f8d4f',
  },
  chatBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
  },
  chatSender: {
    color: colors.subtleText,
    fontSize: typography.tiny,
    fontWeight: '800',
  },
  chatText: {
    color: colors.text,
  },
  chatComposerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    paddingHorizontal: spacing.sm,
  },
  chatSend: {
    minWidth: 70,
    minHeight: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendText: {
    color: colors.text,
    fontWeight: '900',
  },
  toast: {
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '800',
    paddingBottom: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  drawModal: {
    borderColor: '#55623f',
    backgroundColor: '#1e2220',
  },
  drawBadge: {
    alignSelf: 'center',
    backgroundColor: '#2f3b2d',
    borderWidth: 1,
    borderColor: '#6f8d4f',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  drawBadgeText: {
    color: '#d9efb8',
    fontWeight: '900',
    fontSize: typography.tiny,
    letterSpacing: 0.6,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
    textAlign: 'center',
  },
  promotionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  promotionButton: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  drawSubtitle: {
    color: colors.mutedText,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
  },
  declineButton: {
    backgroundColor: '#2c2323',
    borderColor: '#a15b5b',
    borderWidth: 1,
  },
  acceptButton: {
    backgroundColor: colors.accent,
  },
  secondaryText: {
    color: colors.mutedText,
    fontWeight: '900',
  },
  declineText: {
    color: '#ffb4b4',
    fontWeight: '900',
  },
  acceptText: {
    color: colors.text,
    fontWeight: '900',
  },
});
