export type Color = 'w' | 'b';
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type Square = `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type BoardPiece = { color: Color; type: PieceType };
export type Board = (BoardPiece | null)[][];
export type CastleSide = 'K' | 'Q' | 'k' | 'q';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface FenState {
  board: Board;
  turn: Color;
  castling: CastleSide[];
  enPassant: Square | null;
  halfmove: number;
  fullmove: number;
}

export interface ChessMove {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  capture?: boolean;
  castle?: 'king' | 'queen';
  enPassant?: boolean;
  san?: string;
}

export const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const pieceLetters: Record<Exclude<PieceType, 'p'>, string> = {
  k: 'K',
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
};

const cloneBoard = (board: Board): Board => board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));

export const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

export const squareToCoords = (square: Square): { row: number; col: number } => ({
  col: files.indexOf(square[0] as (typeof files)[number]),
  row: 8 - Number(square[1]),
});

export const coordsToSquare = (row: number, col: number): Square | null => {
  if (row < 0 || row > 7 || col < 0 || col > 7) return null;
  return `${files[col]}${8 - row}` as Square;
};

const inBounds = (row: number, col: number) => row >= 0 && row < 8 && col >= 0 && col < 8;

export const oppositeColor = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export const pieceFromFenChar = (char: string): BoardPiece | null => {
  const lower = char.toLowerCase();
  if (!['k', 'q', 'r', 'b', 'n', 'p'].includes(lower)) return null;
  return { color: char === lower ? 'b' : 'w', type: lower as PieceType };
};

export const parseFen = (fen: string): FenState => {
  const [placement, turn = 'w', castling = '-', enPassant = '-', halfmove = '0', fullmove = '1'] = fen.split(' ');
  const rows = placement.split('/');
  const board: Board = rows.map((row) => {
    const parsed: (BoardPiece | null)[] = [];
    for (const char of row) {
      const empty = Number(char);
      if (Number.isInteger(empty) && empty > 0) {
        for (let i = 0; i < empty; i += 1) parsed.push(null);
      } else {
        parsed.push(pieceFromFenChar(char));
      }
    }
    while (parsed.length < 8) parsed.push(null);
    return parsed.slice(0, 8);
  });
  while (board.length < 8) board.push(Array<BoardPiece | null>(8).fill(null));

  return {
    board: board.slice(0, 8),
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling === '-' ? [] : (castling.split('').filter((c) => ['K', 'Q', 'k', 'q'].includes(c)) as CastleSide[]),
    enPassant: isSquare(enPassant) ? enPassant : null,
    halfmove: Number(halfmove) || 0,
    fullmove: Number(fullmove) || 1,
  };
};

export const boardToFenPlacement = (board: Board): string =>
  board
    .map((row) => {
      let empties = 0;
      let text = '';
      row.forEach((piece) => {
        if (!piece) {
          empties += 1;
          return;
        }
        if (empties) {
          text += String(empties);
          empties = 0;
        }
        const letter = piece.type === 'p' ? 'p' : pieceLetters[piece.type];
        text += piece.color === 'w' ? letter.toUpperCase() : letter.toLowerCase();
      });
      return text + (empties ? String(empties) : '');
    })
    .join('/');

const isPathClear = (board: Board, fromRow: number, fromCol: number, toRow: number, toCol: number) => {
  const rowStep = Math.sign(toRow - fromRow);
  const colStep = Math.sign(toCol - fromCol);
  let row = fromRow + rowStep;
  let col = fromCol + colStep;
  while (row !== toRow || col !== toCol) {
    if (board[row][col]) return false;
    row += rowStep;
    col += colStep;
  }
  return true;
};

export const findKing = (board: Board, color: Color): Square | null => {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece?.color === color && piece.type === 'k') return coordsToSquare(row, col);
    }
  }
  return null;
};

export const isSquareAttacked = (board: Board, square: Square, byColor: Color): boolean => {
  const { row: targetRow, col: targetCol } = squareToCoords(square);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.color !== byColor) continue;
      const rowDiff = targetRow - row;
      const colDiff = targetCol - col;
      const absRow = Math.abs(rowDiff);
      const absCol = Math.abs(colDiff);
      if (piece.type === 'p') {
        const dir = piece.color === 'w' ? -1 : 1;
        if (rowDiff === dir && absCol === 1) return true;
      }
      if (piece.type === 'n' && ((absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2))) return true;
      if (piece.type === 'k' && Math.max(absRow, absCol) === 1) return true;
      if (piece.type === 'b' && absRow === absCol && isPathClear(board, row, col, targetRow, targetCol)) return true;
      if (piece.type === 'r' && (row === targetRow || col === targetCol) && isPathClear(board, row, col, targetRow, targetCol)) return true;
      if (
        piece.type === 'q' &&
        (absRow === absCol || row === targetRow || col === targetCol) &&
        isPathClear(board, row, col, targetRow, targetCol)
      ) {
        return true;
      }
    }
  }
  return false;
};

export const isKingInCheck = (fenOrBoard: string | Board, color: Color): Square | null => {
  const board = typeof fenOrBoard === 'string' ? parseFen(fenOrBoard).board : fenOrBoard;
  const king = findKing(board, color);
  if (!king) return null;
  return isSquareAttacked(board, king, oppositeColor(color)) ? king : null;
};

const pushMove = (moves: ChessMove[], board: Board, from: Square, to: Square, extra: Partial<ChessMove> = {}) => {
  const target = board[squareToCoords(to).row][squareToCoords(to).col];
  moves.push({ from, to, capture: Boolean(target), ...extra });
};

const pseudoMovesForPiece = (state: FenState, from: Square): ChessMove[] => {
  const { board } = state;
  const { row, col } = squareToCoords(from);
  const piece = board[row][col];
  if (!piece) return [];
  const moves: ChessMove[] = [];
  const addStep = (rowDelta: number, colDelta: number) => {
    const to = coordsToSquare(row + rowDelta, col + colDelta);
    if (!to) return;
    const target = board[row + rowDelta][col + colDelta];
    if (!target || target.color !== piece.color) pushMove(moves, board, from, to);
  };
  const addSlide = (directions: [number, number][]) => {
    directions.forEach(([rowStep, colStep]) => {
      let nextRow = row + rowStep;
      let nextCol = col + colStep;
      while (inBounds(nextRow, nextCol)) {
        const to = coordsToSquare(nextRow, nextCol);
        if (!to) break;
        const target = board[nextRow][nextCol];
        if (!target) {
          pushMove(moves, board, from, to);
        } else {
          if (target.color !== piece.color) pushMove(moves, board, from, to);
          break;
        }
        nextRow += rowStep;
        nextCol += colStep;
      }
    });
  };

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? -1 : 1;
    const startRow = piece.color === 'w' ? 6 : 1;
    const promotionRow = piece.color === 'w' ? 0 : 7;
    const one = coordsToSquare(row + dir, col);
    if (one && !board[row + dir][col]) {
      if (row + dir === promotionRow) {
        (['q', 'r', 'b', 'n'] as PromotionPiece[]).forEach((promotion) => pushMove(moves, board, from, one, { promotion }));
      } else {
        pushMove(moves, board, from, one);
      }
      const two = coordsToSquare(row + dir * 2, col);
      if (row === startRow && two && !board[row + dir * 2][col]) pushMove(moves, board, from, two);
    }
    [-1, 1].forEach((colDelta) => {
      const to = coordsToSquare(row + dir, col + colDelta);
      if (!to) return;
      const target = board[row + dir][col + colDelta];
      if (target && target.color !== piece.color) {
        if (row + dir === promotionRow) {
          (['q', 'r', 'b', 'n'] as PromotionPiece[]).forEach((promotion) => pushMove(moves, board, from, to, { promotion }));
        } else {
          pushMove(moves, board, from, to);
        }
      } else if (state.enPassant === to) {
        pushMove(moves, board, from, to, { capture: true, enPassant: true });
      }
    });
  }

  if (piece.type === 'n') {
    [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([r, c]) => addStep(r, c));
  }
  if (piece.type === 'b') addSlide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
  if (piece.type === 'r') addSlide([[-1, 0], [1, 0], [0, -1], [0, 1]]);
  if (piece.type === 'q') addSlide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
  if (piece.type === 'k') {
    [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([r, c]) => addStep(r, c));
    const homeRow = piece.color === 'w' ? 7 : 0;
    const enemy = oppositeColor(piece.color);
    if (row === homeRow && col === 4 && !isSquareAttacked(board, from, enemy)) {
      const kingSide = piece.color === 'w' ? 'K' : 'k';
      const queenSide = piece.color === 'w' ? 'Q' : 'q';
      if (
        state.castling.includes(kingSide) &&
        !board[homeRow][5] &&
        !board[homeRow][6] &&
        !isSquareAttacked(board, coordsToSquare(homeRow, 5) as Square, enemy) &&
        !isSquareAttacked(board, coordsToSquare(homeRow, 6) as Square, enemy)
      ) {
        pushMove(moves, board, from, coordsToSquare(homeRow, 6) as Square, { castle: 'king' });
      }
      if (
        state.castling.includes(queenSide) &&
        !board[homeRow][1] &&
        !board[homeRow][2] &&
        !board[homeRow][3] &&
        !isSquareAttacked(board, coordsToSquare(homeRow, 3) as Square, enemy) &&
        !isSquareAttacked(board, coordsToSquare(homeRow, 2) as Square, enemy)
      ) {
        pushMove(moves, board, from, coordsToSquare(homeRow, 2) as Square, { castle: 'queen' });
      }
    }
  }
  return moves;
};

export const applyMoveToBoard = (board: Board, move: ChessMove): Board => {
  const next = cloneBoard(board);
  const from = squareToCoords(move.from);
  const to = squareToCoords(move.to);
  const piece = next[from.row][from.col];
  if (!piece) return next;
  next[from.row][from.col] = null;
  if (move.enPassant) next[from.row][to.col] = null;
  next[to.row][to.col] = move.promotion ? { color: piece.color, type: move.promotion } : piece;
  if (move.castle === 'king') {
    next[from.row][5] = next[from.row][7];
    next[from.row][7] = null;
  }
  if (move.castle === 'queen') {
    next[from.row][3] = next[from.row][0];
    next[from.row][0] = null;
  }
  return next;
};

export const generateLegalMoves = (fen: string, onlyFor?: Color): ChessMove[] => {
  const state = parseFen(fen);
  const color = onlyFor ?? state.turn;
  const moves: ChessMove[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== color) continue;
      const from = coordsToSquare(row, col);
      if (!from) continue;
      pseudoMovesForPiece(state, from).forEach((move) => {
        const next = applyMoveToBoard(state.board, move);
        if (!isKingInCheck(next, color)) moves.push(move);
      });
    }
  }
  return moves;
};

export const legalMovesFromSquare = (fen: string, square: Square): ChessMove[] => {
  const piece = parseFen(fen).board[squareToCoords(square).row][squareToCoords(square).col];
  if (!piece) return [];
  return generateLegalMoves(fen, piece.color).filter((move) => move.from === square);
};

export const moveNeedsPromotion = (fen: string, from: Square, to: Square): boolean => {
  const state = parseFen(fen);
  const source = squareToCoords(from);
  const piece = state.board[source.row][source.col];
  if (!piece || piece.type !== 'p') return false;
  const targetRank = Number(to[1]);
  return (piece.color === 'w' && targetRank === 8) || (piece.color === 'b' && targetRank === 1);
};

export const toAlgebraic = (fen: string, move: ChessMove): string => {
  const state = parseFen(fen);
  const piece = state.board[squareToCoords(move.from).row][squareToCoords(move.from).col];
  if (!piece) return `${move.from}-${move.to}`;
  if (move.castle === 'king') return 'O-O';
  if (move.castle === 'queen') return 'O-O-O';
  const prefix = piece.type === 'p' ? '' : pieceLetters[piece.type];
  const capture = move.capture ? 'x' : '';
  const pawnFile = piece.type === 'p' && move.capture ? move.from[0] : '';
  const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
  const next = applyMoveToBoard(state.board, move);
  const check = isKingInCheck(next, oppositeColor(piece.color)) ? '+' : '';
  return `${prefix}${pawnFile}${capture}${move.to}${promotion}${check}`;
};

export const normalizeBackendMove = (value: unknown): ChessMove | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const from = String(record.from ?? '');
  const to = String(record.to ?? '');
  const promotionRaw = record.promotion == null ? undefined : String(record.promotion).toLowerCase();
  if (!isSquare(from) || !isSquare(to)) return null;
  const promotion = promotionRaw && ['q', 'r', 'b', 'n'].includes(promotionRaw) ? (promotionRaw as PromotionPiece) : undefined;
  return { from, to, promotion };
};

export const formatMoveText = (move: ChessMove | null, index: number): string => {
  if (!move) return `${index + 1}. --`;
  return move.san ?? `${move.from}${move.to}${move.promotion ? move.promotion.toUpperCase() : ''}`;
};
