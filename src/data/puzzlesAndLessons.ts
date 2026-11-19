export interface ChessPuzzle {
  id: string;
  title: string;
  fen: string;
  moves: string[]; // UCI moves: [playerMove1, opponentAutoReply1, playerMove2, ...]
  rating: number;
  theme: string;
  hint: string;
  explanation: string;
  isDaily?: boolean;
}

export interface ChessLesson {
  id: string;
  title: string;
  category: 'opening' | 'middlegame' | 'endgame' | 'checkmate';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  fen: string;
  solutionMoves: string[]; // UCI moves
  hint: string;
  coachNote: string;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - 1);
  return getLocalDateKey(dt);
}

export function getRecentDateKeys(
  days: number = 7,
  fromDate: Date = new Date()
): { key: string; shortDay: string; dayNum: string }[] {
  const result: { key: string; shortDay: string; dayNum: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() - i);
    result.push({
      key: getLocalDateKey(dt),
      shortDay: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: String(dt.getDate()),
    });
  }
  return result;
}

export function getDailyPuzzleForDate(
  puzzles: ChessPuzzle[],
  dateKey: string
): ChessPuzzle {
  const pool = puzzles.length > 0 ? puzzles : BUILT_IN_PUZZLES;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
  const index = Math.abs(dayNumber) % pool.length;
  return pool[index];
}

export const BUILT_IN_PUZZLES: ChessPuzzle[] = [
  {
    id: 'daily-back-rank',
    title: 'Back Rank Execution',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    moves: ['d1d8'],
    rating: 900,
    theme: 'Back Rank',
    hint: 'Black’s king is boxed in behind its own f7, g7, and h7 pawns.',
    explanation: 'Rd8# delivers immediate checkmate on the back rank because Black has no escape square.',
    isDaily: true,
  },
  {
    id: 'puz-arabian-mate',
    title: 'Classic Arabian Mate',
    fen: '7k/7p/5N2/8/8/8/8/6RK w - - 0 1',
    moves: ['g1g8'],
    rating: 1080,
    theme: 'Checkmate',
    hint: 'The knight on f6 guards g8 and cuts off h7.',
    explanation: 'Rg8# is the classic Arabian Mate: the knight protects the rook and seals the h7 escape square.',
  },
  {
    id: 'puz-smothered-mate',
    title: 'Philidor’s Smothered Mate',
    fen: 'r5rk/6pp/7N/8/8/8/6PP/7K w - - 0 1',
    moves: ['h6f7'],
    rating: 1180,
    theme: 'Checkmate',
    hint: 'A cornered king surrounded by its own rook and pawns is vulnerable to a knight jump.',
    explanation: 'Nf7# is a pure smothered checkmate—Black’s g8 rook and g7/h7 pawns block every flight square.',
  },
  {
    id: 'puz-royal-fork',
    title: 'Royal Family Fork',
    fen: 'r3k2r/pp3ppp/2n5/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
    moves: ['d5c7'],
    rating: 1020,
    theme: 'Fork',
    hint: 'Find a knight jump that checks the king and attacks a rook simultaneously.',
    explanation: 'Nc7+ forks the Black king on e8 and the rook on a8, winning material cleanly.',
  },
  {
    id: 'puz-file-pin',
    title: 'Absolute File Pin',
    fen: '4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1',
    moves: ['e2e7'],
    rating: 880,
    theme: 'Pin',
    hint: 'The Black queen is pinned to the king along the e-file.',
    explanation: 'Rxe7+ wins the queen immediately because it is pinned along the open e-file.',
  },
  {
    id: 'puz-anastasia-mate',
    title: 'Anastasia’s Mate',
    fen: '6rk/4N1pp/8/8/8/4R3/8/6K1 w - - 0 1',
    moves: ['e7g6', 'h7g6', 'e3h3'],
    rating: 1380,
    theme: 'Checkmate',
    hint: 'Force the h7 pawn away with a knight check, then swing the rook onto the h-file!',
    explanation: '1.Ng6+ forces 1...hxg6, opening the h-file for 2.Rh3#—a textbook Anastasia’s Mate.',
  },
  {
    id: 'puz-ladder-mate',
    title: 'Two-Rook Lawn Mower',
    fen: '4k3/8/8/8/8/8/R7/1R4K1 w - - 0 1',
    moves: ['b1b8', 'e8d7', 'a2a7'],
    rating: 850,
    theme: 'Checkmate',
    hint: 'Cut the king off on the 8th rank, then push forward with the second rook.',
    explanation: 'Rb8+ drives the king down to the 7th rank, and Ra7+ keeps the king trapped on the edge.',
  },
  {
    id: 'puz-skewer-queen',
    title: 'Diagonal Bishop Strike',
    fen: '4k3/8/6q1/8/8/8/2B5/4K3 w - - 0 1',
    moves: ['c2g6'],
    rating: 920,
    theme: 'Skewer',
    hint: 'Look along the b1-h7 diagonal.',
    explanation: 'Bxg6+ captures the queen with check.',
  },
  {
    id: 'puz-skewer-battery',
    title: 'Rook Pin on the d-File',
    fen: '3k4/8/8/3q4/8/8/8/R5K1 w - - 0 1',
    moves: ['a1d1'],
    rating: 1120,
    theme: 'Pin',
    hint: 'Pin the queen directly to its king along the d-file.',
    explanation: 'Rd1 pins Black’s queen on d5 directly to the king on d8, winning the queen next move.',
  },
  {
    id: 'puz-deflection-1',
    title: 'Deflecting the Back Rank',
    fen: '3r2k1/5ppp/8/8/8/8/1Q3PPP/3R2K1 w - - 0 1',
    moves: ['d1d8'],
    rating: 1090,
    theme: 'Deflection',
    hint: 'Strike along the open d-file to deliver back-rank mate.',
    explanation: 'Rxd8# eliminates the defending rook and delivers immediate back-rank checkmate.',
  },
  {
    id: 'puz-discovered-check',
    title: 'Discovered Check Capture',
    fen: '3qk3/8/8/8/3B4/8/3R4/4K3 w - - 0 1',
    moves: ['d4b6', 'e8e7', 'b6d8'],
    rating: 1360,
    theme: 'Discovered Attack',
    hint: 'Move the bishop out of the d-file to uncover a check and attack the Black queen.',
    explanation: 'Bb6+ uncovers a check from the rook on d2 while attacking the Black queen on d8.',
  },
  {
    id: 'puz-queen-rook-battery',
    title: 'Queen & Rook Back-Rank Mate',
    fen: '6k1/5ppp/8/8/8/2Q5/5PPP/4R1K1 w - - 0 1',
    moves: ['e1e8'],
    rating: 960,
    theme: 'Back Rank',
    hint: 'Black’s back rank has zero defenders.',
    explanation: 'Re8# delivers immediate back-rank checkmate against the trapped king.',
  },
  {
    id: 'puz-promotion-tactic',
    title: 'Breakthrough Promotion',
    fen: '8/3P2k1/8/8/8/8/8/6K1 w - - 0 1',
    moves: ['d7d8q'],
    rating: 820,
    theme: 'Endgame',
    hint: 'Advance the passed pawn to the 8th rank and promote to a queen.',
    explanation: 'd8=Q creates an overwhelming queen advantage to convert the endgame.',
  },
  {
    id: 'puz-boden-mate',
    title: 'Boden’s Cross-Diagonal Mate',
    fen: '2kr4/pp1n4/2p5/8/5B2/2B5/PPP5/2K5 w - - 0 1',
    moves: ['c3a5'],
    rating: 1480,
    theme: 'Fork',
    hint: 'Attack the trapped rook on d8 and cut off the c7 square.',
    explanation: 'Ba5 skewers and traps the rook on d8 while tightening the dark-square bind around Black’s king.',
  },
];

export const BUILT_IN_LESSONS: ChessLesson[] = [
  {
    id: 'lesson-center-control',
    title: '01. Control the Center Immediately',
    category: 'opening',
    difficulty: 'Beginner',
    summary: 'Occupy e4/d4 with pawns on move one to claim space and free your bishops.',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    solutionMoves: ['e2e4'],
    hint: 'Push the king’s pawn two squares forward.',
    coachNote: '1.e4 claims central squares d5 and f5 and opens diagonals for both your queen and light-squared bishop.',
  },
  {
    id: 'lesson-italian-f7',
    title: '02. Targeting the Weak f7 Square',
    category: 'opening',
    difficulty: 'Beginner',
    summary: 'In open games, f7 is initially defended only by the Black king. Develop your bishop aggressively.',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    solutionMoves: ['f1c4'],
    hint: 'Place your light-squared bishop on the a2-g8 diagonal aiming at f7.',
    coachNote: '3.Bc4 initiates the Italian Game, developing a piece rapidly while pressuring f7.',
  },
  {
    id: 'lesson-castling-safety',
    title: '03. Safeguard Your King Early',
    category: 'opening',
    difficulty: 'Beginner',
    summary: 'Castle kingside to tuck your king behind pawns and bring your rook into the game.',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    solutionMoves: ['e1g1'],
    hint: 'Move your king two squares toward the h1 rook.',
    coachNote: 'Castling connects your defense and activates the h1 rook toward the central e-file.',
  },
  {
    id: 'lesson-knight-fork-mid',
    title: '04. Spotting the Double Attack',
    category: 'middlegame',
    difficulty: 'Intermediate',
    summary: 'Knights excel at jumping into enemy territory to attack two high-value pieces at once.',
    fen: 'r3k2r/pp3ppp/2n5/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
    solutionMoves: ['d5c7'],
    hint: 'Check the Black king and attack the a8 rook on the same move.',
    coachNote: 'Nc7+ gives check while simultaneously attacking the rook on a8—Black cannot save both.',
  },
  {
    id: 'lesson-pin-exploitation',
    title: '05. Pile Up on the Pinned Piece',
    category: 'middlegame',
    difficulty: 'Intermediate',
    summary: 'When an enemy piece is pinned to its king, capture or pile attackers onto it.',
    fen: '4k3/4n3/8/8/8/8/4R3/4K3 w - - 0 1',
    solutionMoves: ['e2e7'],
    hint: 'The knight on e7 cannot move without exposing the Black king.',
    coachNote: 'Rxe7+ wins the pinned knight cleanly because it is immobilized along the e-file.',
  },
  {
    id: 'lesson-king-opposition',
    title: '06. Endgame King Opposition',
    category: 'endgame',
    difficulty: 'Intermediate',
    summary: 'In King and Pawn endgames, step diagonally forward to outflank the defending king.',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    solutionMoves: ['e6d6'],
    hint: 'Step to d6 to clear the e6 square and outflank the Black king.',
    coachNote: 'Kd6 outflanks Black’s king, allowing e6-e7-e8=Q with unstoppable force.',
  },
  {
    id: 'lesson-lucena-push',
    title: '07. Queening with Rook Support',
    category: 'endgame',
    difficulty: 'Advanced',
    summary: 'Promote your passed pawn when your rook shields the promotion square.',
    fen: '1R6/4P1k1/8/8/8/8/8/6K1 w - - 0 1',
    solutionMoves: ['e7e8q'],
    hint: 'Your e7 pawn is ready to promote on e8.',
    coachNote: 'e8=Q converts the rook endgame immediately.',
  },
  {
    id: 'lesson-back-rank-mate',
    title: '08. Back Rank Checkmate Pattern',
    category: 'checkmate',
    difficulty: 'Beginner',
    summary: 'Punish an unventilated king trapped behind its own castled pawns.',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    solutionMoves: ['d1d8'],
    hint: 'Send your rook all the way to the 8th rank.',
    coachNote: 'Rd8# is a fundamental checkmate every chess player must recognize instantly.',
  },
  {
    id: 'lesson-queen-king-mate',
    title: '09. King & Queen Checkmates',
    category: 'checkmate',
    difficulty: 'Beginner',
    summary: 'Deliver checkmate with the Queen supported directly by your own King.',
    fen: '4k3/8/4K3/6Q1/8/8/8/8 w - - 0 1',
    solutionMoves: ['g5e7'],
    hint: 'Bring the Queen directly onto e7 where your King on e6 protects it.',
    coachNote: 'Qe7# is the classic kiss-of-death checkmate—the king on e6 guards e7 and cuts off d7/f7.',
  },
  {
    id: 'lesson-scholar-defense',
    title: '10. Two-Rook Mate Coordination',
    category: 'checkmate',
    difficulty: 'Intermediate',
    summary: 'Use two rooks on adjacent ranks to drive the enemy king to the edge and deliver mate.',
    fen: '4k3/R7/8/8/8/8/1R6/6K1 w - - 0 1',
    solutionMoves: ['b2b8'],
    hint: 'Your rook on a7 already guards the 7th rank—deliver check on the 8th rank!',
    coachNote: 'Rb8# completes the ladder checkmate cleanly in one move.',
  },
];
