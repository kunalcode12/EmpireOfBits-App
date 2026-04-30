import type { Color, PieceType } from '../utils/chessHelpers';

export type PieceCode =
  | 'wK'
  | 'wQ'
  | 'wR'
  | 'wB'
  | 'wN'
  | 'wP'
  | 'bK'
  | 'bQ'
  | 'bR'
  | 'bB'
  | 'bN'
  | 'bP';

export interface PieceAsset {
  code: PieceCode;
  color: Color;
  type: PieceType;
  paths: string[];
}

const pathsByType: Record<PieceType, string[]> = {
  k: [
    'M45 12h10v10h10v9H55v10H45V31H35v-9h10V12z',
    'M31 86h38l-3-14H34l-3 14z',
    'M34 68c1-16 7-27 16-27s15 11 16 27H34z',
    'M27 92h46v8H27v-8z',
  ],
  q: [
    'M24 33l9 30h34l9-30-14 14-12-27-12 27-14-14z',
    'M35 69h30l4 17H31l4-17z',
    'M27 92h46v8H27v-8z',
    'M20 27a7 7 0 1114 0 7 7 0 01-14 0zm23-8a7 7 0 1114 0 7 7 0 01-14 0zm23 8a7 7 0 1114 0 7 7 0 01-14 0z',
  ],
  r: [
    'M29 18h10v10h8V18h10v10h8V18h10v23H29V18z',
    'M34 45h32v28H34V45z',
    'M30 76h40l4 12H26l4-12z',
    'M24 92h52v8H24v-8z',
  ],
  b: [
    'M50 14c9 9 15 18 15 30 0 12-6 20-15 20s-15-8-15-20c0-12 6-21 15-30z',
    'M45 32l18 18-7 7-18-18 7-7z',
    'M34 69h32l4 17H30l4-17z',
    'M25 92h50v8H25v-8z',
  ],
  n: [
    'M29 83c3-22 2-35 15-48l-4-11c17 2 31 16 31 34v25H29z',
    'M42 35c6-10 17-15 27-12-4 10-11 18-22 22l-5-10z',
    'M34 87h40v13H26l8-13z',
    'M43 46l-9 8 6 4 8-8-5-4z',
  ],
  p: [
    'M50 20a14 14 0 110 28 14 14 0 010-28z',
    'M39 54h22l5 24H34l5-24z',
    'M29 82h42l5 10H24l5-10z',
    'M23 94h54v6H23v-6z',
  ],
};

const makeAsset = (color: Color, type: PieceType): PieceAsset => ({
  code: `${color}${type.toUpperCase()}` as PieceCode,
  color,
  type,
  paths: pathsByType[type],
});

export const pieceAssets: Record<PieceCode, PieceAsset> = {
  wK: makeAsset('w', 'k'),
  wQ: makeAsset('w', 'q'),
  wR: makeAsset('w', 'r'),
  wB: makeAsset('w', 'b'),
  wN: makeAsset('w', 'n'),
  wP: makeAsset('w', 'p'),
  bK: makeAsset('b', 'k'),
  bQ: makeAsset('b', 'q'),
  bR: makeAsset('b', 'r'),
  bB: makeAsset('b', 'b'),
  bN: makeAsset('b', 'n'),
  bP: makeAsset('b', 'p'),
};

export const pieceCodeFor = (color: Color, type: PieceType): PieceCode =>
  `${color}${type.toUpperCase()}` as PieceCode;
