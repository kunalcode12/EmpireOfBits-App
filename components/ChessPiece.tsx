import React from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { pieceAssets, pieceCodeFor } from '../constants/pieceAssets';
import type { BoardPiece } from '../utils/chessHelpers';

interface Props {
  piece: BoardPiece;
  size: number;
}

export function ChessPiece({ piece, size }: Props) {
  const asset = pieceAssets[pieceCodeFor(piece.color, piece.type)];
  const idBase = `${asset.code}-${Math.round(size)}`;
  const fillId = `${idBase}-fill`;
  const sheenId = `${idBase}-sheen`;
  const stroke = piece.color === 'w' ? '#59371e' : '#cbb8a0';
  const shadowColor = piece.color === 'w' ? 'rgba(45,25,12,0.26)' : 'rgba(12,8,6,0.5)';
  const whiteStops = ['#fffef8', '#f8ebd3', '#e7c89a'] as const;
  const blackStops = ['#4f3423', '#2c1b11', '#16100b'] as const;
  const stops = piece.color === 'w' ? whiteStops : blackStops;
  const sheenTop = piece.color === 'w' ? 'rgba(255,255,255,0.44)' : 'rgba(255,235,210,0.16)';
  const sheenMid = piece.color === 'w' ? 'rgba(255,255,255,0.12)' : 'rgba(255,235,210,0.04)';
  const sheenOpacity = piece.color === 'w' ? 0.44 : 0.22;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={stops[0]} />
          <Stop offset="45%" stopColor={stops[1]} />
          <Stop offset="100%" stopColor={stops[2]} />
        </LinearGradient>
        <LinearGradient id={sheenId} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={sheenTop} />
          <Stop offset="55%" stopColor={sheenMid} />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </LinearGradient>
      </Defs>
      <G transform="translate(1.8,2.2)">
        {asset.paths.map((path, index) => (
          <Path key={`${asset.code}-shadow-${index}`} d={path} fill={shadowColor} opacity={0.72} />
        ))}
      </G>
      {asset.paths.map((path, index) => (
        <Path key={`${asset.code}-base-${index}`} d={path} fill={`url(#${fillId})`} stroke={stroke} strokeWidth={3.45} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {asset.paths.map((path, index) => (
        <Path key={`${asset.code}-shine-${index}`} d={path} fill={`url(#${sheenId})`} opacity={sheenOpacity} />
      ))}
    </Svg>
  );
}
