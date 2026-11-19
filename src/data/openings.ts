import { Chess } from 'chess.js';

export interface OpeningContinuation {
  san: string;
  eco: string;
  name: string;
  games: number;
  whiteWinPct: number;
  drawPct: number;
  blackWinPct: number;
}

export interface OpeningInfo {
  eco: string;
  name: string;
  plan: string;
}

interface BookLine {
  moves: string[];
  eco: string;
  name: string;
  plan: string;
}

export const OPENING_BOOK_LINES: BookLine[] = [
  { moves: ['e4'], eco: 'B00', name: "King's Pawn Opening", plan: 'Controls d5 and f5 while opening lines for the queen and bishop.' },
  { moves: ['e4', 'e5'], eco: 'C20', name: "King's Pawn Game", plan: 'Symmetrical central claim leading to open tactical battles.' },
  { moves: ['e4', 'e5', 'Nf3'], eco: 'C40', name: "King's Knight Opening", plan: 'Develops with tempo by attacking Black’s e5 pawn.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], eco: 'C44', name: "King's Knight: Normal", plan: 'Defends e5 naturally while fighting for the d4 square.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], eco: 'C60', name: 'Ruy Lopez (Spanish Opening)', plan: 'Applies indirect pressure on e5 by pinning or harassing the c6 knight.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], eco: 'C70', name: 'Ruy Lopez: Morphy Defense', plan: 'Questions the Spanish bishop immediately and prepares ...b5.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'], eco: 'C78', name: 'Ruy Lopez: Closed', plan: 'White completes kingside safety before building a c3-d4 center.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], eco: 'C50', name: 'Italian Game', plan: 'Targets the sensitive f7 square and prepares quick castling.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], eco: 'C50', name: 'Giuoco Piano', plan: 'Classical fight for d4 with c3 and d4 or slow c3-d3 maneuvering.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], eco: 'C55', name: 'Two Knights Defense', plan: 'Sharp counterattack against e4 inviting tactical complications.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], eco: 'C45', name: 'Scotch Game', plan: 'Opens the center immediately for active piece play.' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], eco: 'C42', name: 'Petrov Defense', plan: 'Solid symmetrical counterattack on the e4 pawn.' },
  { moves: ['e4', 'e5', 'Nc3'], eco: 'C25', name: 'Vienna Game', plan: 'Supports e4 and keeps f4 open for a flexible kingside attack.' },
  { moves: ['e4', 'c5'], eco: 'B20', name: 'Sicilian Defense', plan: 'Asymmetrical counter-fight for the d4 square and c-file.' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], eco: 'B90', name: 'Sicilian Najdorf', plan: 'Dynamic imbalance: White attacks on the kingside, Black counters on the c-file.' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'], eco: 'B34', name: 'Sicilian Accelerated Dragon', plan: 'Fianchettoes the dark-squared bishop to pressure d4 and the long diagonal.' },
  { moves: ['e4', 'c5', 'c3'], eco: 'B22', name: 'Sicilian Alapin', plan: 'Prepares a broad d4 pawn center without allowing typical Najdorf theory.' },
  { moves: ['e4', 'e6'], eco: 'C00', name: 'French Defense', plan: 'Solid structure preparing an immediate ...d5 challenge to e4.' },
  { moves: ['e4', 'e6', 'd4', 'd5'], eco: 'C00', name: 'French Defense: Main Line', plan: 'Tests White’s center; Black often counters with ...c5.' },
  { moves: ['e4', 'c6'], eco: 'B10', name: 'Caro-Kann Defense', plan: 'Supports ...d5 without blocking the light-squared c8 bishop.' },
  { moves: ['e4', 'c6', 'd4', 'd5'], eco: 'B12', name: 'Caro-Kann: Main Line', plan: 'Leads to rock-solid pawn structure and strong endgame prospects.' },
  { moves: ['e4', 'd5'], eco: 'B01', name: 'Scandinavian Defense', plan: 'Challenges e4 immediately on move one to open central files.' },
  { moves: ['d4'], eco: 'A40', name: "Queen's Pawn Opening", plan: 'Claims central space with immediate queen protection.' },
  { moves: ['d4', 'd5'], eco: 'D00', name: "Queen's Pawn Game", plan: 'Symmetrical central control preventing e4.' },
  { moves: ['d4', 'd5', 'c4'], eco: 'D06', name: "Queen's Gambit", plan: 'Offers the c-pawn to deflect Black’s central d5 pawn.' },
  { moves: ['d4', 'd5', 'c4', 'e6'], eco: 'D30', name: "Queen's Gambit Declined", plan: 'Maintains a sturdy d5 foothold while preparing ...Nf6 and ...Be7.' },
  { moves: ['d4', 'd5', 'c4', 'c6'], eco: 'D10', name: 'Slav Defense', plan: 'Defends d5 while keeping the c8 bishop free to develop.' },
  { moves: ['d4', 'd5', 'Bf4'], eco: 'D02', name: 'London System', plan: 'Harmonic pyramid setup with Bf4, e3, Nf3, and c3.' },
  { moves: ['d4', 'Nf6'], eco: 'A45', name: 'Indian Defense', plan: 'Flexible knight development preventing immediate e4.' },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], eco: 'E60', name: "King's Indian Defense", plan: 'Allows a broad White center to counterattack it later with ...e5 or ...c5.' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], eco: 'E20', name: 'Nimzo-Indian Defense', plan: 'Pins the c3 knight to control e4 and double White’s pawns.' },
  { moves: ['c4'], eco: 'A10', name: 'English Opening', plan: 'Controls d5 from the flank and leads to rich positional transpositions.' },
  { moves: ['Nf3'], eco: 'A04', name: 'Réti Opening', plan: 'Hypermodern control of d4 and e5 with pieces before committing center pawns.' },
];

const MASTER_CONTINUATIONS_BY_FEN = new Map<string, OpeningContinuation[]>();
const BOOK_INFO_BY_FEN = new Map<string, OpeningInfo>();

function buildOpeningIndex() {
  if (BOOK_INFO_BY_FEN.size > 0) return;
  for (const line of OPENING_BOOK_LINES) {
    const chess = new Chess();
    let valid = true;
    for (let i = 0; i < line.moves.length; i++) {
      const parentFen = chess.fen().split(' ').slice(0, 4).join(' ');
      const mv = chess.move(line.moves[i]);
      if (!mv) {
        valid = false;
        break;
      }
      if (i === line.moves.length - 1 && valid) {
        const fenKey = chess.fen().split(' ').slice(0, 4).join(' ');
        BOOK_INFO_BY_FEN.set(fenKey, {
          eco: line.eco,
          name: line.name,
          plan: line.plan,
        });
        const existing = MASTER_CONTINUATIONS_BY_FEN.get(parentFen) || [];
        if (!existing.some((c) => c.san === mv.san)) {
          const baseGames = Math.max(12000, 320000 - line.moves.length * 42000);
          existing.push({
            san: mv.san,
            eco: line.eco,
            name: line.name,
            games: baseGames,
            whiteWinPct: 37,
            drawPct: 33,
            blackWinPct: 30,
          });
          MASTER_CONTINUATIONS_BY_FEN.set(parentFen, existing);
        }
      }
    }
  }
}

buildOpeningIndex();

export function detectOpeningFromMoves(sanMoves: string[]): OpeningInfo {
  const chess = new Chess();
  let matched: OpeningInfo = {
    eco: 'A00',
    name: 'Starting Position',
    plan: 'Develop knights and bishops toward the center and safeguard your king.',
  };
  for (const san of sanMoves.slice(0, 18)) {
    const mv = chess.move(san);
    if (!mv) break;
    const fenKey = chess.fen().split(' ').slice(0, 4).join(' ');
    const info = BOOK_INFO_BY_FEN.get(fenKey);
    if (info) {
      matched = info;
    }
  }
  return matched;
}

export function isBookPosition(fen: string): boolean {
  const fenKey = fen.split(' ').slice(0, 4).join(' ');
  return BOOK_INFO_BY_FEN.has(fenKey);
}

export function getOpeningContinuations(fen: string): OpeningContinuation[] {
  const fenKey = fen.split(' ').slice(0, 4).join(' ');
  return MASTER_CONTINUATIONS_BY_FEN.get(fenKey) || [];
}
