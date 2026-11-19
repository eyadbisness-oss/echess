import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { ChessPieceSvg } from './ChessPieces';
import { ClassificationBadge } from './ClassificationBadge';
import { getBoardThemeById } from '../data/boardThemes';
import type { EngineEval, MoveClassification, PieceStyleId } from '../shared/chessTypes';
import { formatEvalDisplay } from '../engine/stockfishService';

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface ChessBoardProps {
  fen: string;
  orientation?: 'w' | 'b';
  interactive?: boolean;
  allowBothSides?: boolean;
  allowedColor?: 'w' | 'b';
  boardThemeId?: string;
  pieceStyle?: PieceStyleId;
  showCoordinates?: boolean;
  autoQueen?: boolean;
  lastMove?: { from: string; to: string } | null;
  moveClassification?: {
    square: string;
    classification: MoveClassification;
    label?: string;
  } | null;
  arrows?: BoardArrow[];
  highlightedSquares?: string[];
  onMove?: (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => boolean | void;
  onSquareClickCustom?: (square: Square) => void;
  sizeClass?: string;
  animationDurationMs?: number;
}

interface TrackedPiece {
  id: number;
  type: PieceSymbol;
  color: Color;
  square: Square;
  isMoving: boolean;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

function squareToCoords(sq: string, orientation: 'w' | 'b'): { x: number; y: number } {
  const fileIdx = FILES.indexOf(sq[0]);
  const rankIdx = RANKS.indexOf(sq[1]);
  const col = orientation === 'w' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'w' ? rankIdx : 7 - rankIdx;
  return { x: col * 100 + 50, y: row * 100 + 50 };
}

function squareToGridPos(sq: Square, orientation: 'w' | 'b'): { col: number; row: number } {
  const fileIdx = FILES.indexOf(sq[0]);
  const rankIdx = RANKS.indexOf(sq[1]);
  const col = orientation === 'w' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'w' ? rankIdx : 7 - rankIdx;
  return { col, row };
}

function manhattanDistance(a: Square, b: Square): number {
  return (
    Math.abs(FILES.indexOf(a[0]) - FILES.indexOf(b[0])) +
    Math.abs(Number(a[1]) - Number(b[1]))
  );
}

function extractRawPieces(chessInstance: Chess): { type: PieceSymbol; color: Color; square: Square }[] {
  const result: { type: PieceSymbol; color: Color; square: Square }[] = [];
  const board = chessInstance.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        result.push({
          type: piece.type,
          color: piece.color,
          square: `${FILES[c]}${8 - r}` as Square,
        });
      }
    }
  }
  return result;
}

function buildFreshPieces(chessInstance: Chess, allocId: () => number): TrackedPiece[] {
  return extractRawPieces(chessInstance).map((p) => ({
    id: allocId(),
    type: p.type,
    color: p.color,
    square: p.square,
    isMoving: false,
  }));
}

function reconcilePieces(
  prevPieces: TrackedPiece[],
  nextChess: Chess,
  lastMove: { from: string; to: string } | null,
  allocId: () => number
): { pieces: TrackedPiece[]; animate: boolean } {
  const nextRaw = extractRawPieces(nextChess);

  const prevBySq = new Map<string, TrackedPiece>();
  for (const p of prevPieces) prevBySq.set(p.square, p);

  const nextBySq = new Map<string, { type: PieceSymbol; color: Color; square: Square }>();
  for (const n of nextRaw) nextBySq.set(n.square, n);

  let diffCount = 0;
  for (const r of RANKS) {
    for (const f of FILES) {
      const sq = `${f}${r}`;
      const p = prevBySq.get(sq);
      const n = nextBySq.get(sq);
      if (p?.type !== n?.type || p?.color !== n?.color) {
        diffCount++;
      }
    }
  }

  if (diffCount === 0) {
    return {
      pieces: prevPieces.map((p) => ({ ...p, isMoving: false })),
      animate: false,
    };
  }

  // Full board reset / large position jump (e.g. jump to start, load FEN/PGN): snap cleanly
  if (diffCount > 4) {
    return {
      pieces: buildFreshPieces(nextChess, allocId),
      animate: false,
    };
  }

  const usedPrev = new Set<number>();
  const usedNext = new Set<number>();
  const matched: TrackedPiece[] = [];

  // 1. Keep stationary pieces in place with their existing IDs
  nextRaw.forEach((n, nIdx) => {
    const pIdx = prevPieces.findIndex(
      (p, idx) => !usedPrev.has(idx) && p.square === n.square && p.color === n.color && p.type === n.type
    );
    if (pIdx !== -1) {
      usedPrev.add(pIdx);
      usedNext.add(nIdx);
      matched.push({
        id: prevPieces[pIdx].id,
        type: n.type,
        color: n.color,
        square: n.square,
        isMoving: false,
      });
    }
  });

  // 2. Match explicit lastMove { from -> to } first (handles forward moves & promotions)
  if (lastMove?.from && lastMove?.to) {
    const pIdx = prevPieces.findIndex((p, idx) => !usedPrev.has(idx) && p.square === lastMove.from);
    const nIdx = nextRaw.findIndex((n, idx) => !usedNext.has(idx) && n.square === lastMove.to);
    if (pIdx !== -1 && nIdx !== -1 && prevPieces[pIdx].color === nextRaw[nIdx].color) {
      usedPrev.add(pIdx);
      usedNext.add(nIdx);
      matched.push({
        id: prevPieces[pIdx].id,
        type: nextRaw[nIdx].type,
        color: nextRaw[nIdx].color,
        square: nextRaw[nIdx].square,
        isMoving: true,
      });
    }
  }

  // 3. Greedy closest Manhattan match for same (color, type) — handles backward review steps & castling rooks
  const candidates: { pIdx: number; nIdx: number; dist: number }[] = [];
  prevPieces.forEach((p, pIdx) => {
    if (usedPrev.has(pIdx)) return;
    nextRaw.forEach((n, nIdx) => {
      if (usedNext.has(nIdx)) return;
      if (p.color === n.color && p.type === n.type) {
        candidates.push({ pIdx, nIdx, dist: manhattanDistance(p.square, n.square) });
      }
    });
  });
  candidates.sort((a, b) => a.dist - b.dist);
  for (const c of candidates) {
    if (usedPrev.has(c.pIdx) || usedNext.has(c.nIdx)) continue;
    usedPrev.add(c.pIdx);
    usedNext.add(c.nIdx);
    const n = nextRaw[c.nIdx];
    matched.push({
      id: prevPieces[c.pIdx].id,
      type: n.type,
      color: n.color,
      square: n.square,
      isMoving: true,
    });
  }

  // 4. Promotion fallback (e.g. stepping backward from promoted piece to pawn without matching lastMove)
  const promoCandidates: { pIdx: number; nIdx: number; dist: number }[] = [];
  prevPieces.forEach((p, pIdx) => {
    if (usedPrev.has(pIdx)) return;
    nextRaw.forEach((n, nIdx) => {
      if (usedNext.has(nIdx)) return;
      if (p.color !== n.color) return;
      const isPromoPair =
        (p.type === 'p' && (n.type === 'q' || n.type === 'r' || n.type === 'b' || n.type === 'n')) ||
        (n.type === 'p' && (p.type === 'q' || p.type === 'r' || p.type === 'b' || p.type === 'n'));
      if (!isPromoPair) return;
      const dist = manhattanDistance(p.square, n.square);
      if (dist <= 2) {
        promoCandidates.push({ pIdx, nIdx, dist });
      }
    });
  });
  promoCandidates.sort((a, b) => a.dist - b.dist);
  for (const c of promoCandidates) {
    if (usedPrev.has(c.pIdx) || usedNext.has(c.nIdx)) continue;
    usedPrev.add(c.pIdx);
    usedNext.add(c.nIdx);
    const n = nextRaw[c.nIdx];
    matched.push({
      id: prevPieces[c.pIdx].id,
      type: n.type,
      color: n.color,
      square: n.square,
      isMoving: true,
    });
  }

  // 5. Remaining newly appearing pieces (e.g. captured piece restored when stepping backward)
  nextRaw.forEach((n, nIdx) => {
    if (usedNext.has(nIdx)) return;
    matched.push({
      id: allocId(),
      type: n.type,
      color: n.color,
      square: n.square,
      isMoving: false,
    });
  });

  // Sort by stable ID so React keeps surviving DOM elements in place without reordering (preserves CSS transitions)
  matched.sort((a, b) => a.id - b.id);
  return { pieces: matched, animate: true };
}

export function ChessBoard({
  fen,
  orientation = 'w',
  interactive = true,
  allowBothSides = false,
  allowedColor,
  boardThemeId = 'emerald-arena',
  pieceStyle = 'neo',
  showCoordinates = true,
  autoQueen = false,
  lastMove = null,
  moveClassification = null,
  arrows = [],
  highlightedSquares = [],
  onMove,
  onSquareClickCustom,
  sizeClass = 'w-full max-w-[540px]',
  animationDurationMs = 210,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; color: 'w' | 'b' } | null>(null);
  const [userArrows, setUserArrows] = useState<BoardArrow[]>([]);
  const [rightDragStart, setRightDragStart] = useState<string | null>(null);

  const theme = useMemo(() => getBoardThemeById(boardThemeId), [boardThemeId]);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const nextIdRef = useRef(1);
  const allocId = () => nextIdRef.current++;

  const [trackedState, setTrackedState] = useState<{
    fen: string;
    pieces: TrackedPiece[];
    animate: boolean;
  }>(() => ({
    fen,
    pieces: buildFreshPieces(chess, () => nextIdRef.current++),
    animate: false,
  }));

  const prevOrientationRef = useRef(orientation);
  const skipNextAnimFromFenRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const orientationChanged = prevOrientationRef.current !== orientation;
    prevOrientationRef.current = orientation;

    if (trackedState.fen !== fen) {
      setSelectedSquare(null);
      setPendingPromotion(null);
      setRightDragStart(null);
      const skipForDrop = skipNextAnimFromFenRef.current === trackedState.fen;
      skipNextAnimFromFenRef.current = null;
      const result = reconcilePieces(trackedState.pieces, chess, lastMove, allocId);
      setTrackedState({
        fen,
        pieces:
          orientationChanged || skipForDrop
            ? result.pieces.map((p) => ({ ...p, isMoving: false }))
            : result.pieces,
        animate: orientationChanged || skipForDrop ? false : result.animate,
      });
    } else if (orientationChanged) {
      setTrackedState((prev) => ({
        fen: prev.fen,
        pieces: prev.pieces.map((p) => ({ ...p, isMoving: false })),
        animate: false,
      }));
    }
    if (!interactive) {
      setSelectedSquare(null);
      setPendingPromotion(null);
    }
  }, [fen, orientation, interactive, chess, lastMove, trackedState.fen, trackedState.pieces]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    try {
      const moves = chess.moves({ square: selectedSquare, verbose: true });
      for (const m of moves) {
        map.set(m.to, Boolean(m.captured));
      }
    } catch {
      // ignore invalid square
    }
    return map;
  }, [chess, selectedSquare]);

  const kingInCheckSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === turn) {
          return `${FILES[c]}${8 - r}`;
        }
      }
    }
    return null;
  }, [chess]);

  const displayRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  const canSelectPiece = (pieceColor: 'w' | 'b') => {
    if (!interactive) return false;
    if (allowBothSides) return pieceColor === chess.turn();
    if (allowedColor && pieceColor !== allowedColor) return false;
    return pieceColor === chess.turn();
  };

  const attemptMove = (from: Square, to: Square): 'moved' | 'promotion_modal' | 'invalid' => {
    const piece = chess.get(from);
    if (!piece) return 'invalid';

    const isPromotion =
      piece.type === 'p' &&
      ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

    const legal = chess.moves({ square: from, verbose: true }).some((m) => m.to === to);
    if (!legal) return 'invalid';

    if (isPromotion && !autoQueen) {
      setPendingPromotion({ from, to, color: piece.color });
      setSelectedSquare(null);
      return 'promotion_modal';
    }

    setSelectedSquare(null);
    setUserArrows([]);
    const res = onMove?.({ from, to, promotion: isPromotion ? 'q' : undefined });
    return res === false ? 'invalid' : 'moved';
  };

  const handleSquareClick = (sq: Square) => {
    if (onSquareClickCustom) {
      onSquareClickCustom(sq);
      return;
    }
    if (!interactive) return;

    if (userArrows.length > 0) setUserArrows([]);

    if (selectedSquare === sq) {
      setSelectedSquare(null);
      return;
    }

    if (selectedSquare && legalTargets.has(sq)) {
      attemptMove(selectedSquare, sq);
      return;
    }

    const piece = chess.get(sq);
    if (piece && canSelectPiece(piece.color)) {
      setSelectedSquare(sq);
    } else {
      setSelectedSquare(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, sq: Square) => {
    if (!interactive || onSquareClickCustom) {
      e.preventDefault();
      return;
    }
    const piece = chess.get(sq);
    if (!piece || !canSelectPiece(piece.color)) {
      e.preventDefault();
      return;
    }
    setSelectedSquare(sq);
    e.dataTransfer.setData('text/plain', sq);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, toSq: Square) => {
    e.preventDefault();
    const fromSq = (e.dataTransfer.getData('text/plain') || selectedSquare) as Square | null;
    if (!fromSq || fromSq === toSq) return;
    const dropSourceFen = fen;
    const outcome = attemptMove(fromSq, toSq);
    if (outcome === 'moved') {
      skipNextAnimFromFenRef.current = dropSourceFen;
      setTimeout(() => {
        if (skipNextAnimFromFenRef.current === dropSourceFen) {
          skipNextAnimFromFenRef.current = null;
        }
      }, 180);
    }
  };

  const handleRightMouseDown = (e: React.MouseEvent, sq: Square) => {
    if (e.button === 2) setRightDragStart(sq);
  };

  const handleRightMouseUp = (e: React.MouseEvent, sq: Square) => {
    if (e.button === 2 && rightDragStart) {
      if (rightDragStart !== sq) {
        setUserArrows((prev) => {
          const exists = prev.some((a) => a.from === rightDragStart && a.to === sq);
          return exists
            ? prev.filter((a) => !(a.from === rightDragStart && a.to === sq))
            : [...prev, { from: rightDragStart, to: sq, color: '#F59E0B' }];
        });
      }
      setRightDragStart(null);
    }
  };

  const allArrows = [...arrows, ...userArrows];

  return (
    <div
      dir="ltr"
      className={`relative aspect-square select-none rounded-lg border shadow-lg ${
        showCoordinates
          ? 'pl-5 pb-5 pt-1.5 pr-1.5 sm:pl-6 sm:pb-6 sm:pt-2 sm:pr-2'
          : 'p-1.5 sm:p-2'
      } ${sizeClass}`}
      style={{
        backgroundColor: theme.boardFrameBg,
        borderColor: theme.boardFrameBorder,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Outer Edge Algebraic Coordinates (Ranks 1-8 on Left, Files a-h on Bottom) */}
      {showCoordinates && (
        <>
          <div
            aria-hidden="true"
            className="absolute left-0 top-1.5 bottom-5 sm:top-2 sm:bottom-6 w-5 sm:w-6 grid grid-rows-8 pointer-events-none select-none"
          >
            {displayRanks.map((rank) => (
              <span
                key={`rank-${rank}`}
                className="flex items-center justify-center text-[10px] sm:text-[11px] font-mono font-semibold leading-none opacity-85"
                style={{ color: theme.coordDark }}
              >
                {rank}
              </span>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="absolute left-5 right-1.5 bottom-0 sm:left-6 sm:right-2 h-5 sm:h-6 grid grid-cols-8 pointer-events-none select-none"
          >
            {displayFiles.map((file) => (
              <span
                key={`file-${file}`}
                className="flex items-center justify-center text-[10px] sm:text-[11px] font-mono font-semibold leading-none opacity-85"
                style={{ color: theme.coordDark }}
              >
                {file}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="relative w-full h-full grid grid-cols-8 grid-rows-8 rounded overflow-hidden">
        {displayRanks.map((rank) =>
          displayFiles.map((file) => {
            const sq = `${file}${rank}` as Square;
            const fileIndex = FILES.indexOf(file);
            const rankIndex = Number(rank);
            const isLight = (fileIndex + rankIndex) % 2 === 1;
            const piece = chess.get(sq);
            const isSelected = selectedSquare === sq;
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const isLegal = legalTargets.has(sq);
            const isCapture = legalTargets.get(sq) === true;
            const isCheck = kingInCheckSquare === sq;
            const isCustomHighlight = highlightedSquares.includes(sq);

            const bgColor = isLight ? theme.lightSquare : theme.darkSquare;
            const texture = isLight ? theme.lightTextureCss : theme.darkTextureCss;

            return (
              <button
                key={sq}
                type="button"
                aria-label={`Square ${sq}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}` : ''}`}
                onClick={() => handleSquareClick(sq)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, sq)}
                onMouseDown={(e) => handleRightMouseDown(e, sq)}
                onMouseUp={(e) => handleRightMouseUp(e, sq)}
                className="relative flex items-center justify-center w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                style={{
                  backgroundColor: bgColor,
                  backgroundImage: texture,
                }}
              >
                {/* Last move highlight */}
                {isLast && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: isLight ? theme.lastMoveLight : theme.lastMoveDark }}
                  />
                )}

                {/* Selected square highlight */}
                {isSelected && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: theme.selectedBg }}
                  />
                )}

                {/* Custom hint/highlight */}
                {isCustomHighlight && (
                  <span className="absolute inset-0 pointer-events-none bg-amber-400/35 ring-2 ring-inset ring-amber-400" />
                )}

                {/* King in check indicator */}
                {isCheck && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(220,38,38,0.85) 0%, rgba(220,38,38,0.35) 60%, transparent 100%)',
                    }}
                  />
                )}

                {/* Legal move target indicator */}
                {isLegal && !isCapture && (
                  <span
                    className="w-[30%] h-[30%] rounded-full pointer-events-none z-10"
                    style={{ backgroundColor: theme.legalDotColor }}
                  />
                )}
                {isLegal && isCapture && (
                  <span
                    className="absolute inset-[6%] rounded-full border-[4px] pointer-events-none z-10"
                    style={{ borderColor: theme.legalDotColor }}
                  />
                )}
              </button>
            );
          })
        )}

        {/* GPU-Transformed Piece Layer (smooth sliding animations between squares) */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {trackedState.pieces.map((p) => {
            const { col, row } = squareToGridPos(p.square, orientation);
            const selectable = canSelectPiece(p.color);
            const isTarget = legalTargets.has(p.square);
            const canClick = interactive || Boolean(onSquareClickCustom);

            return (
              <div
                key={p.id}
                onClick={() => handleSquareClick(p.square)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, p.square)}
                onMouseDown={(e) => handleRightMouseDown(e, p.square)}
                onMouseUp={(e) => handleRightMouseUp(e, p.square)}
                className={`absolute top-0 left-0 w-[12.5%] h-[12.5%] flex items-center justify-center will-change-transform ${
                  p.isMoving ? 'z-30' : 'z-20'
                } ${canClick ? 'pointer-events-auto' : 'pointer-events-none'}`}
                style={{
                  transform: `translate3d(${col * 100}%, ${row * 100}%, 0)`,
                  transition: trackedState.animate
                    ? `transform ${animationDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`
                    : 'none',
                }}
              >
                <div
                  draggable={interactive && !onSquareClickCustom && selectable}
                  onDragStart={(e) => handleDragStart(e, p.square)}
                  className={`w-[84%] h-[84%] transition-transform duration-150 ${
                    selectable
                      ? 'cursor-grab active:cursor-grabbing hover:scale-[1.04]'
                      : isTarget || onSquareClickCustom
                      ? 'cursor-pointer'
                      : ''
                  }`}
                >
                  <ChessPieceSvg type={p.type} color={p.color} styleId={pieceStyle} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Chess.com-style Corner Move Classification Badge on Destination Square */}
        {moveClassification &&
          moveClassification.square &&
          moveClassification.square.length >= 2 &&
          (() => {
            const { col, row } = squareToGridPos(
              moveClassification.square as Square,
              orientation
            );
            if (col < 0 || col > 7 || row < 0 || row > 7) return null;
            return (
              <div
                className="absolute pointer-events-none z-40"
                style={{
                  left: `${(col + 1) * 12.5}%`,
                  top: `${row * 12.5}%`,
                  transform: 'translate(-78%, 8%)',
                }}
              >
                <ClassificationBadge
                  classification={moveClassification.classification}
                  label={moveClassification.label}
                  size="sm"
                />
              </div>
            );
          })()}

        {/* SVG Arrow Overlay (Engine Lines, Owner Lab, Hints, User Arrows) */}
        {allArrows.length > 0 && (
          <svg
            viewBox="0 0 800 800"
            className="absolute inset-0 w-full h-full pointer-events-none z-40"
          >
            <defs>
              {allArrows.map((arrow, idx) => {
                const color = arrow.color || '#10B981';
                return (
                  <marker
                    key={`m-${idx}`}
                    id={`arrowhead-${idx}`}
                    markerWidth="4"
                    markerHeight="4"
                    refX="2.5"
                    refY="2"
                    orient="auto"
                  >
                    <polygon points="0 0, 4 2, 0 4" fill={color} fillOpacity="0.88" />
                  </marker>
                );
              })}
            </defs>
            {allArrows.map((arrow, idx) => {
              if (!arrow.from || !arrow.to || arrow.from.length < 2 || arrow.to.length < 2) return null;
              const start = squareToCoords(arrow.from, orientation);
              const end = squareToCoords(arrow.to, orientation);
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const len = Math.hypot(dx, dy);
              if (len === 0) return null;
              const shorten = 22;
              const ex = end.x - (dx / len) * shorten;
              const ey = end.y - (dy / len) * shorten;
              const color = arrow.color || '#10B981';
              return (
                <line
                  key={`a-${idx}`}
                  x1={start.x}
                  y1={start.y}
                  x2={ex}
                  y2={ey}
                  stroke={color}
                  strokeOpacity="0.82"
                  strokeWidth="15"
                  strokeLinecap="round"
                  markerEnd={`url(#arrowhead-${idx})`}
                />
              );
            })}
          </svg>
        )}

        {/* Pawn Promotion Picker Modal */}
        {pendingPromotion && (
          <div
            onClick={() => setPendingPromotion(null)}
            className="animate-menu-backdrop absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="animate-menu-modal bg-[#151A22] border border-slate-700 rounded-xl p-4 shadow-2xl"
            >
              <p className="text-xs font-medium text-slate-300 mb-3 text-center">Promote Pawn</p>
              <div className="flex items-center gap-2">
                {(['q', 'r', 'b', 'n'] as const).map((promo) => (
                  <button
                    key={promo}
                    type="button"
                    onClick={() => {
                      const { from, to } = pendingPromotion;
                      setPendingPromotion(null);
                      onMove?.({ from, to, promotion: promo });
                    }}
                    className="w-14 h-14 p-2 rounded-lg bg-[#1E2530] hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-500 transition-[background-color,border-color,transform] duration-150 hover:scale-105 active:scale-95"
                  >
                    <ChessPieceSvg type={promo} color={pendingPromotion.color} styleId={pieceStyle} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function EvaluationBar({
  evaluation,
  orientation = 'w',
}: {
  evaluation: EngineEval | null;
  orientation?: 'w' | 'b';
}) {
  const whitePct = useMemo(() => {
    if (!evaluation) return 50;
    if (evaluation.mate !== null) {
      return evaluation.mate > 0 ? 100 : 0;
    }
    const clamped = Math.max(-1000, Math.min(1000, evaluation.cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.004 * clamped)) - 1);
  }, [evaluation]);

  const topIsWhite = orientation === 'b';
  const whiteHeight = `${whitePct.toFixed(1)}%`;
  const evalText = formatEvalDisplay(evaluation);
  const whiteWinning = evaluation ? (evaluation.mate !== null ? evaluation.mate > 0 : evaluation.cp >= 0) : true;

  return (
    <div
      className="relative w-7 h-full min-h-[320px] rounded-md overflow-hidden border border-slate-800 bg-[#181D25] flex flex-col justify-between select-none shrink-0"
      aria-label={`Engine evaluation ${evalText}`}
    >
      <div
        className="w-full transition-all duration-300"
        style={{
          height: topIsWhite ? whiteHeight : `${100 - whitePct}%`,
          backgroundColor: topIsWhite ? '#F1F5F9' : '#181D25',
        }}
      />
      <div
        className="w-full transition-all duration-300"
        style={{
          height: topIsWhite ? `${100 - whitePct}%` : whiteHeight,
          backgroundColor: topIsWhite ? '#181D25' : '#F1F5F9',
        }}
      />
      <span
        className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold tabular-nums px-0.5 ${
          whiteWinning ? 'bottom-1.5 text-slate-900' : 'top-1.5 text-slate-100'
        }`}
      >
        {evalText}
      </span>
    </div>
  );
}
