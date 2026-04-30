import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../constants/theme';
import { pieceAssets, pieceCodeFor } from '../constants/pieceAssets';
import type { BoardPiece } from '../utils/chessHelpers';

interface Props {
  piece: BoardPiece;
  size: number;
}

export function ChessPiece({ piece, size }: Props) {
  const asset = pieceAssets[pieceCodeFor(piece.color, piece.type)];
  const fill = piece.color === 'w' ? colors.whitePiece : colors.blackPiece;
  const stroke = piece.color === 'w' ? colors.blackPiece : colors.whitePiece;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {asset.paths.map((path, index) => (
        <Path key={`${asset.code}-${index}`} d={path} fill={fill} stroke={stroke} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </Svg>
  );
}
