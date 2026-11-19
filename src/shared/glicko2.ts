/**
 * Pure TypeScript Glicko-2 Rating System
 * Based on Professor Mark E. Glickman's Glicko-2 specification.
 */

export interface GlickoPlayer {
  rating: number; // e.g., 1200
  rd: number; // Rating deviation, e.g., 350 -> 50
  vol: number; // Volatility, e.g., 0.06
}

export interface GlickoUpdateResult {
  newRating: number;
  newRd: number;
  newVol: number;
  delta: number;
}

const GLICKO_SCALE = 173.7178;
const TAU = 0.5;
const EPSILON = 0.000001;

function toMu(rating: number): number {
  return (rating - 1500) / GLICKO_SCALE;
}

function toPhi(rd: number): number {
  return rd / GLICKO_SCALE;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export function calculateGlicko2Update(
  player: GlickoPlayer,
  opponent: GlickoPlayer,
  score: 1 | 0.5 | 0
): GlickoUpdateResult {
  const mu = toMu(player.rating);
  const phi = toPhi(Math.max(30, Math.min(350, player.rd || 150)));
  const sigma = Math.max(0.01, Math.min(0.15, player.vol || 0.06));

  const muJ = toMu(opponent.rating);
  const phiJ = toPhi(Math.max(30, Math.min(350, opponent.rd || 150)));

  const gPhiJ = g(phiJ);
  const eVal = E(mu, muJ, phiJ);

  const v = 1 / (gPhiJ * gPhiJ * eVal * (1 - eVal));
  const delta = v * gPhiJ * (score - eVal);

  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const expX = Math.exp(x);
    const phiSq = phi * phi;
    const dSq = delta * delta;
    const num1 = expX * (dSq - phiSq - v - expX);
    const den1 = 2 * Math.pow(phiSq + v + expX, 2);
    return num1 / den1 - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 50) {
      k++;
    }
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let iter = 0;
  while (Math.abs(B - A) > EPSILON && iter < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    iter++;
  }

  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gPhiJ * (score - eVal);

  const newRating = Math.max(100, Math.round(GLICKO_SCALE * newMu + 1500));
  const newRd = Math.max(30, Math.min(350, Math.round(GLICKO_SCALE * newPhi)));

  return {
    newRating,
    newRd,
    newVol: Number(newSigma.toFixed(5)),
    delta: newRating - Math.round(player.rating),
  };
}
