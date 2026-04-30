import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChessBoard } from '../components/ChessBoard';
import { ChessPiece } from '../components/ChessPiece';
import { DrawResignControls } from '../components/DrawResignControls';
import { MoveHistory } from '../components/MoveHistory';
import { Timer } from '../components/Timer';
import { colors, radii, spacing, typography } from '../constants/theme';
import { useChessGame } from '../hooks/useChessGame';
import { useAuth } from '../store/AuthContext';
import { useGame } from '../store/GameContext';
import type { Color, PromotionPiece } from '../utils/chessHelpers';

export function GameScreen() {
  const auth = useAuth();
  const game = useGame();
  const chess = useChessGame(game.fen, game.color, game.turn, game.makeMove);
  const [chatDraft, setChatDraft] = useState('');
  const orientation: Color = game.color ?? 'w';
  const myName = auth.user?.username ?? 'You';
  const opponentName = game.opponentName ?? 'Opponent';
  const ownSeconds = orientation === 'w' ? game.timers.white : game.timers.black;
  const opponentSeconds = orientation === 'w' ? game.timers.black : game.timers.white;
  const ownActive = game.turn === orientation;
  const opponentActive = !ownActive;
  const interactionsDisabled =
    game.phase !== 'active' ||
    !game.color ||
    game.turn !== game.color ||
    game.opponentDisconnected;
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
          board={chess.board}
          orientation={orientation}
          selected={chess.selected}
          legalTargets={chess.legalTargets}
          lastMove={game.lastMove}
          checkSquare={chess.checkSquare}
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

      <DrawResignControls
        onOfferDraw={game.offerDrawGame}
        onResign={game.resignGame}
        disabled={game.phase !== 'active' || game.opponentDisconnected}
      />
      <MoveHistory moves={game.moves} />
      <View style={styles.chatCard}>
        <Text style={styles.chatTitle}>Chat</Text>
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
      {game.toast && <Text style={styles.toast}>{game.toast}</Text>}

      <PromotionModal visible={Boolean(chess.pendingPromotion)} color={orientation} onPick={chess.choosePromotion} onCancel={chess.cancelPromotion} />
      <DrawOfferModal visible={game.drawOfferIncoming} onAccept={game.acceptDrawOffer} onReject={game.rejectDrawOffer} />
    </ScrollView>
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
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  banner: {
    color: colors.warning,
    backgroundColor: '#3a3320',
    borderRadius: radii.sm,
    padding: spacing.md,
    fontWeight: '800',
    textAlign: 'center',
  },
  checkBannerWrap: {
    backgroundColor: '#4a3f1f',
    borderRadius: radii.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#8a7442',
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
  },
  chatCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chatTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: typography.body,
  },
  chatList: {
    minHeight: 72,
    maxHeight: 180,
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
