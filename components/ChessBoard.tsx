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
    <View style={[styles.boardShell, { width: boardSize, height: boardSize }]}>
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
        <View pointerEvents="none" style={styles.crackMainOne} />
        <View pointerEvents="none" style={styles.crackMainTwo} />
        <View pointerEvents="none" style={styles.crackMainThree} />
        <View pointerEvents="none" style={styles.crackBranchOne} />
        <View pointerEvents="none" style={styles.crackBranchTwo} />
        <View pointerEvents="none" style={styles.crackBranchThree} />
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
    overflow: 'hidden',
  },
  board: {
    flexDirection: 'column',
    overflow: 'hidden'
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
  crackMainOne: {
    position: 'absolute',
    left: '14%',
    top: '8%',
    width: 1.8,
    height: '58%',
    backgroundColor: 'rgba(58, 30, 16, 0.28)',
    transform: [{ rotate: '16deg' }],
  },
  crackMainTwo: {
    position: 'absolute',
    right: '18%',
    top: '26%',
    width: 1.6,
    height: '50%',
    backgroundColor: 'rgba(56, 28, 14, 0.24)',
    transform: [{ rotate: '-22deg' }],
  },
  crackMainThree: {
    position: 'absolute',
    left: '46%',
    bottom: '8%',
    width: 1.4,
    height: '34%',
    backgroundColor: 'rgba(52, 26, 13, 0.22)',
    transform: [{ rotate: '-8deg' }],
  },
  crackBranchOne: {
    position: 'absolute',
    left: '21%',
    top: '36%',
    width: 1,
    height: '16%',
    backgroundColor: 'rgba(48, 24, 12, 0.2)',
    transform: [{ rotate: '-34deg' }],
  },
  crackBranchTwo: {
    position: 'absolute',
    right: '24%',
    top: '48%',
    width: 1,
    height: '14%',
    backgroundColor: 'rgba(49, 24, 12, 0.18)',
    transform: [{ rotate: '31deg' }],
  },
  crackBranchThree: {
    position: 'absolute',
    left: '52%',
    top: '64%',
    width: 0.8,
    height: '12%',
    backgroundColor: 'rgba(46, 22, 10, 0.17)',
    transform: [{ rotate: '-26deg' }],
  },
});
