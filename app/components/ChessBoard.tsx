import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, typography } from '../constants/theme';
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
  const boardSize = Math.min(width - 28, 390);
  const squareSize = boardSize / 8;
  const visualRows = orientation === 'w' ? ranks : [...ranks].reverse();
  const visualFiles = orientation === 'w' ? files : [...files].reverse();

  return (
    <View style={{ width: boardSize + 18 }}>
      <View style={styles.boardRow}>
        <View style={styles.rankColumn}>
          {visualRows.map((rank) => (
            <Text key={rank} style={[styles.coord, { height: squareSize }]}>
              {rank}
            </Text>
          ))}
        </View>
        <View style={[styles.board, { width: boardSize, height: boardSize }]}>
          {visualRows.map((rank) =>
            visualFiles.map((file) => {
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
                      backgroundColor: isLight ? colors.boardLight : colors.boardDark,
                    },
                  ]}
                >
                  {isLast && <View style={[styles.overlay, { backgroundColor: colors.boardLastMove }]} />}
                  {isSelected && <View style={[styles.overlay, { backgroundColor: colors.boardSelect }]} />}
                  {isCheck && <View style={styles.checkOverlay} />}
                  {piece && <ChessPiece piece={piece} size={squareSize * 0.84} />}
                  {isLegal && <View style={[styles.hint, piece && styles.captureHint]} />}
                </Pressable>
              );
            }),
          )}
        </View>
      </View>
      <View style={[styles.fileRow, { paddingLeft: 18, width: boardSize + 18 }]}>
        {visualFiles.map((file) => (
          <Text key={file} style={[styles.coord, { width: squareSize }]}>
            {file}
          </Text>
        ))}
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
  boardRow: {
    flexDirection: 'row',
  },
  rankColumn: {
    width: 18,
  },
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    borderRadius: 4,
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 4,
    borderColor: colors.boardHint,
    backgroundColor: 'transparent',
  },
  coord: {
    color: colors.mutedText,
    fontSize: typography.tiny,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    height: 18,
  },
});
