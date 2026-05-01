import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors } from '../constants/theme';
import { coordsToSquare, files, ranks, squareToCoords, type Board, type ChessMove, type Color, type Square } from '../utils/chessHelpers';
import { ChessPiece } from './ChessPiece';

interface Props {
  board: Board;
  orientation: Color;
  selected: Square | null;
  legalTargets: Square[];
  lastMove: ChessMove | null;
  checkSquare: Square | null;
  disabled: boolean;
  onSquarePress: (square: Square) => void;
}

export function ChessBoard({ board, orientation, selected, legalTargets, lastMove, checkSquare, disabled, onSquarePress }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.floor(Math.min(width - 28, 390) / 8) * 8;
  const squareSize = boardSize / 8;
  const visualRows = orientation === 'w' ? ranks : [...ranks].reverse();
  const visualFiles = orientation === 'w' ? files : [...files].reverse();

  return (
    <View style={[styles.boardShell, { width: boardSize + 12 }]}>
      <View style={styles.logoPlate}>
        <Text style={styles.logoPlateText}>E B</Text>
      </View>
      <View style={styles.frameGlow}>
        <View style={[styles.board, { width: boardSize, height: boardSize }]}>
          {visualRows.map((rank) => (
            <View key={`rank-${rank}`} style={[styles.rankStrip, { height: squareSize }]}>
              {visualFiles.map((file) => {
                const square = `${file}${rank}` as Square;
                const { row, col } = squareToCoords(square);
                const piece = board[row][col];
                const isLight = (row + col) % 2 === 0;
                const isSelected = selected === square;
                const isLegal = legalTargets.includes(square);
                const isLast = lastMove?.from === square || lastMove?.to === square;
                const isCheck = checkSquare === square;
                return (
                  <Pressable
                    key={square}
                    disabled={disabled}
                    onPress={() => onSquarePress(square)}
                    style={[
                      styles.square,
                      {
                        width: squareSize,
                        height: squareSize,
                        backgroundColor: isLight ? '#dbbc8e' : '#9a663d',
                      },
                    ]}
                  >
                    <View style={[styles.squareShade, isLight ? styles.lightShade : styles.darkShade]} />
                    {isLast && <View style={[styles.overlay, { backgroundColor: colors.boardLastMove }]} />}
                    {isSelected && <View style={[styles.overlay, { backgroundColor: colors.boardSelect }]} />}
                    {isCheck && <View style={styles.checkOverlay} />}
                    {piece && (
                      <View style={styles.pieceWrap}>
                        <ChessPiece piece={piece} size={squareSize * 0.86} />
                      </View>
                    )}
                    {isLegal && <View style={[styles.hint, piece && styles.captureHint]} />}
                  </Pressable>
                );
              })}
            </View>
          ))}
          <View pointerEvents="none" style={styles.boardInnerTopGlow} />
          <View pointerEvents="none" style={styles.boardInnerBottomShade} />
          <View pointerEvents="none" style={styles.crackOne} />
          <View pointerEvents="none" style={styles.crackTwo} />
          <View pointerEvents="none" style={styles.crackThree} />
          <View pointerEvents="none" style={styles.ebWatermarkWrap}>
            <Text style={styles.ebWatermark}>EB</Text>
          </View>
        </View>
      </View>
      <View style={styles.cornerBadgeRight}>
        <Text style={styles.cornerBadgeText}>EMPIRE OF BITS</Text>
      </View>
    </View>
  );
}

export const squareFromVisualIndex = (orientation: Color, visualRow: number, visualCol: number): Square | null => {
  const row = orientation === 'w' ? visualRow : 7 - visualRow;
  const col = orientation === 'w' ? visualCol : 7 - visualCol;
  return coordsToSquare(row, col);
};

const styles = StyleSheet.create({
  boardShell: {
    borderRadius: 14,
    backgroundColor: '#332315',
    borderWidth: 1,
    borderColor: '#91643d',
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 11,
  },
  logoPlate: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#513620',
    borderWidth: 1,
    borderColor: '#bf8752',
    marginBottom: 6,
  },
  logoPlateText: {
    color: '#ffe2ae',
    letterSpacing: 2,
    fontSize: 10,
    fontWeight: '900',
  },
  frameGlow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a57345',
    backgroundColor: '#3d2a19',
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  board: {
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#be8755',
  },
  rankStrip: {
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareShade: {
    ...StyleSheet.absoluteFillObject,
  },
  lightShade: {
    backgroundColor: 'rgba(255,248,232,0.15)',
  },
  darkShade: {
    backgroundColor: 'rgba(49,24,11,0.22)',
  },
  pieceWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.44,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(214,79,79,0.48)',
  },
  hint: {
    position: 'absolute',
    width: '28%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: colors.boardHint,
  },
  captureHint: {
    width: '86%',
    height: '86%',
    borderWidth: 3,
    borderColor: colors.boardHint,
    backgroundColor: 'transparent',
  },
  boardInnerTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(255,240,206,0.16)',
  },
  boardInnerBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '26%',
    backgroundColor: 'rgba(36,18,9,0.2)',
  },
  crackOne: {
    position: 'absolute',
    left: '16%',
    top: '12%',
    width: 2,
    height: '56%',
    backgroundColor: 'rgba(61,30,15,0.28)',
    transform: [{ rotate: '18deg' }],
  },
  crackTwo: {
    position: 'absolute',
    right: '22%',
    bottom: '18%',
    width: 2,
    height: '38%',
    backgroundColor: 'rgba(61,30,15,0.24)',
    transform: [{ rotate: '-26deg' }],
  },
  crackThree: {
    position: 'absolute',
    left: '42%',
    top: '54%',
    width: 1.5,
    height: '30%',
    backgroundColor: 'rgba(61,30,15,0.2)',
    transform: [{ rotate: '-8deg' }],
  },
  ebWatermarkWrap: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    opacity: 0.16,
  },
  ebWatermark: {
    color: '#f6d8a1',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 2,
  },
  cornerBadgeRight: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#513620',
    borderWidth: 1,
    borderColor: '#bf8752',
  },
  cornerBadgeText: {
    color: '#ffe2ae',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
