import { useMemo, useState } from 'react';
import {
  isKingInCheck,
  isSquare,
  legalMovesFromSquare,
  moveNeedsPromotion,
  parseFen,
  type ChessMove,
  type Color,
  type PromotionPiece,
  type Square,
} from '../utils/chessHelpers';

export const useChessGame = (fen: string, playerColor: Color | null, activeTurn: Color, makeMove: (move: ChessMove) => void) => {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const board = useMemo(() => parseFen(fen).board, [fen]);
  const legalMoves = useMemo(() => (selected ? legalMovesFromSquare(fen, selected) : []), [fen, selected]);
  const checkSquare = useMemo(() => isKingInCheck(fen, activeTurn), [fen, activeTurn]);

  const tapSquare = (square: string) => {
    if (!isSquare(square) || !playerColor || playerColor !== activeTurn) return;
    const coords = legalMoves.find((move) => move.to === square);
    if (selected && coords) {
      if (moveNeedsPromotion(fen, selected, coords.to)) {
        setPendingPromotion({ from: selected, to: coords.to });
        return;
      }
      makeMove(coords);
      setSelected(null);
      return;
    }
    const { row, col } = { row: 8 - Number(square[1]), col: square.charCodeAt(0) - 97 };
    const piece = board[row]?.[col];
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (piece?.color === playerColor) setSelected(square);
    else setSelected(null);
  };

  const choosePromotion = (promotion: PromotionPiece) => {
    if (!pendingPromotion) return;
    const move = legalMovesFromSquare(fen, pendingPromotion.from).find((candidate) => candidate.to === pendingPromotion.to && candidate.promotion === promotion);
    if (move) makeMove(move);
    setPendingPromotion(null);
    setSelected(null);
  };

  return {
    board,
    selected,
    legalMoves,
    legalTargets: legalMoves.map((move) => move.to),
    checkSquare,
    pendingPromotion,
    tapSquare,
    choosePromotion,
    cancelPromotion: () => setPendingPromotion(null),
  };
};
