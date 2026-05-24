import { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateLegalMoves,
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

const up = (sq: string) => sq.toUpperCase();
const down = (sq: string) => sq.toLowerCase();

type Difficulty = 1 | 2 | 3 | 4 | 5;
type GameResult = 'win' | 'lose' | 'draw' | null;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const useComputerChessGame = (initialColor: Color = 'w') => {
  const engineRef = useRef<any>(null);
  const [fen, setFen] = useState(START_FEN);
  const [fenHistory, setFenHistory] = useState<string[]>([START_FEN]);
  const [playerColor, setPlayerColor] = useState<Color>(initialColor);
  const [isGameOver, setIsGameOver] = useState(false);
  const [result, setResult] = useState<GameResult>(null);
  const [resultReason, setResultReason] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(3);
  const [aiThinking, setAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState<ChessMove | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const createEngine = useCallback(() => {
    const { Game } = require('js-chess-engine');
    const engine = new Game();
    engineRef.current = engine;
    return engine;
  }, []);

  useEffect(() => {
    createEngine();
  }, [createEngine]);

  const currentFen = fen;
  const { board, turn } = parseFen(currentFen);
  const legalMoves = selected ? legalMovesFromSquare(currentFen, selected) : [];
  const legalTargets = legalMoves.map((m) => m.to);
  const checkSquare = isKingInCheck(currentFen, turn);

  const pushFen = useCallback((newFen: string) => {
    setFen(newFen);
    setFenHistory((prev) => [...prev, newFen]);
  }, []);

  const checkGameEnd = useCallback((engine: any) => {
    const state = engine.exportJson();
    if (state.checkMate) {
      setIsGameOver(true);
      const winnerColor: Color = state.turn === 'white' ? 'b' : 'w';
      setResult(winnerColor === playerColor ? 'win' : 'lose');
      setResultReason('Checkmate');
      return true;
    }
    if (state.staleMate || state.isFinished) {
      setIsGameOver(true);
      setResult('draw');
      setResultReason(state.staleMate ? 'Stalemate' : 'Draw');
      return true;
    }
    const newFen = engine.exportFEN() as string;
    const moves = generateLegalMoves(newFen);
    if (moves.length === 0) {
      setIsGameOver(true);
      const inCheck = isKingInCheck(newFen, parseFen(newFen).turn);
      if (inCheck) {
        const winnerColor: Color = parseFen(newFen).turn === 'w' ? 'b' : 'w';
        setResult(winnerColor === playerColor ? 'win' : 'lose');
        setResultReason('Checkmate');
      } else {
        setResult('draw');
        setResultReason('Stalemate');
      }
      return true;
    }
    return false;
  }, [playerColor]);

  const doAiMove = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || isGameOver) return;

    setAiThinking(true);
    const delay = 250 + Math.random() * 300;
    setTimeout(() => {
      if (!mountedRef.current || !engineRef.current) return;
      try {
        const aiResult = engine.aiMove(difficulty);
        const entries = Object.entries(aiResult);
        if (entries.length === 0) return;
        const [fromUp, toUp] = entries[0] as [string, string];
        const from = down(fromUp) as Square;
        const to = down(toUp) as Square;
        const newFen = engine.exportFEN() as string;
        const move: ChessMove = { from, to };
        if (!mountedRef.current) return;
        pushFen(newFen);
        setLastMove(move);
        setMoveCount((c) => c + 1);
        checkGameEnd(engine);
      } catch {
        // engine error
      } finally {
        if (mountedRef.current) setAiThinking(false);
      }
    }, delay);
  }, [difficulty, isGameOver, checkGameEnd, pushFen]);

  useEffect(() => {
    if (!engineRef.current || isGameOver) return;
    const currentTurn = parseFen(fen).turn;
    if (currentTurn !== playerColor && !aiThinking && moveCount === 0) {
      doAiMove();
    }
  }, [playerColor, fen, isGameOver, aiThinking, moveCount, doAiMove]);

  const executeMove = useCallback((move: ChessMove) => {
    const engine = engineRef.current;
    if (!engine || isGameOver) return;
    try {
      engine.move(up(move.from), up(move.to));
      const newFen = engine.exportFEN() as string;
      pushFen(newFen);
      setLastMove(move);
      setSelected(null);
      setMoveCount((c) => c + 1);
      if (!checkGameEnd(engine)) {
        doAiMove();
      }
    } catch {
      // illegal move
    }
  }, [isGameOver, checkGameEnd, doAiMove, pushFen]);

  const tapSquare = useCallback((square: string) => {
    if (!isSquare(square) || isGameOver || aiThinking) return;
    const currentTurn = parseFen(fen).turn;
    if (currentTurn !== playerColor) return;

    const coords = selected ? legalMovesFromSquare(fen, selected) : [];
    const targetMove = selected ? coords.find((m) => m.to === square) : undefined;

    if (selected && targetMove) {
      if (moveNeedsPromotion(fen, selected, targetMove.to)) {
        setPendingPromotion({ from: selected, to: targetMove.to });
        return;
      }
      executeMove(targetMove);
      return;
    }

    const { row, col } = { row: 8 - Number(square[1]), col: square.charCodeAt(0) - 97 };
    const piece = board[row]?.[col];
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (piece?.color === playerColor) setSelected(square as Square);
    else setSelected(null);
  }, [fen, selected, playerColor, isGameOver, aiThinking, board, executeMove]);

  const choosePromotion = useCallback((promotion: PromotionPiece) => {
    if (!pendingPromotion) return;
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.move(up(pendingPromotion.from), up(pendingPromotion.to));
      const newFen = engine.exportFEN() as string;
      const move: ChessMove = { from: pendingPromotion.from, to: pendingPromotion.to, promotion };
      pushFen(newFen);
      setLastMove(move);
      setSelected(null);
      setPendingPromotion(null);
      setMoveCount((c) => c + 1);
      if (!checkGameEnd(engine)) {
        doAiMove();
      }
    } catch {
      // ignore
    }
  }, [pendingPromotion, checkGameEnd, doAiMove, pushFen]);

  const cancelPromotion = useCallback(() => setPendingPromotion(null), []);

  const resign = useCallback(() => {
    if (isGameOver) return;
    setIsGameOver(true);
    setResult('lose');
    setResultReason('Resignation');
  }, [isGameOver]);

  const forceWin = useCallback((reason = 'Timeout') => {
    if (isGameOver) return;
    setIsGameOver(true);
    setResult('win');
    setResultReason(reason);
  }, [isGameOver]);

  const resetGame = useCallback((color: Color = 'w') => {
    const engine = createEngine();
    const startFen = engine.exportFEN() as string;
    setPlayerColor(color);
    setFen(startFen);
    setFenHistory([startFen]);
    setIsGameOver(false);
    setResult(null);
    setResultReason(null);
    setSelected(null);
    setPendingPromotion(null);
    setAiThinking(false);
    setLastMove(null);
    setMoveCount(0);
  }, [createEngine]);

  return {
    board,
    fen,
    fenHistory,
    turn,
    playerColor,
    isGameOver,
    result,
    resultReason,
    selected,
    legalTargets,
    checkSquare,
    lastMove,
    pendingPromotion,
    difficulty,
    aiThinking,
    moveCount,
    tapSquare,
    choosePromotion,
    cancelPromotion,
    setDifficulty,
    resetGame,
    resign,
    forceWin,
  };
};
