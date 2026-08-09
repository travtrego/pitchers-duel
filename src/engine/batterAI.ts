import { ARSENAL, getPitch } from './pitches';
import type { Batter, Guess, Loc, MemoryEntry, PitchType } from './types';
import { clamp01, strikeLook } from './zone';

/** Pitches a hitter thinks of as "hard stuff" when he sits fastball. */
const HARD = ['FF', 'SI'];

/**
 * How much the hitter leans on hard stuff in each count. Hitters hunt fastballs
 * when they're ahead and start covering spin once they have two strikes.
 */
function fastballLean(balls: number, strikes: number): number {
  if (balls === 3 && strikes === 0) return 2.2;
  if (balls === 3 && strikes === 1) return 1.8;
  if (balls === 2 && strikes === 0) return 1.7;
  if (balls === 3) return 1.05;
  if (balls === 2 && strikes === 1) return 1.25;
  if (balls === 1 && strikes === 0) return 1.1;
  if (strikes === 2) return balls >= 2 ? 0.8 : 0.62;
  if (strikes === 1) return 0.92;
  return 1;
}

/** Willingness to swing at a strike, by count. */
export function zoneSwingRate(balls: number, strikes: number): number {
  if (balls === 3 && strikes === 0) return 0.06;
  if (strikes === 2) return balls === 3 ? 0.8 : 0.74;
  if (balls === 3) return 0.56;
  if (balls === 2 && strikes === 0) return 0.5;
  if (balls === 0 && strikes === 0) return 0.4;
  if (strikes === 1) return 0.6;
  return 0.52;
}

/** Multiplier on chasing pitches out of the zone, by count. */
export function chaseRate(balls: number, strikes: number): number {
  if (balls === 3 && strikes === 0) return 0.03;
  if (balls === 3 && strikes === 1) return 0.2;
  if (strikes === 2) return 1.45;
  if (balls === 2 && strikes === 0) return 0.28;
  if (balls === 3) return 0.75;
  if (balls === 2) return 0.5;
  if (strikes === 1) return 0.78;
  return 0.55;
}

/**
 * Builds what the hitter is looking for on the next pitch.
 *
 * Three forces combine: his standing preference, the leverage of the count, and
 * — the one that makes pitch selection a skill — what you have actually been
 * throwing him. Repeat a pitch and his weight on it climbs, which raises his
 * contact quality and kills your deception on it.
 */
export function computeGuess(
  batter: Batter,
  memory: MemoryEntry[],
  balls: number,
  strikes: number,
): Guess {
  const weights: Record<string, number> = {};
  const lean = fastballLean(balls, strikes);

  for (const p of ARSENAL) {
    const isHard = HARD.includes(p.id);
    const base = isHard
      ? (batter.sitFastball * (p.id === 'FF' ? 0.55 : 0.45)) * lean
      : ((1 - batter.sitFastball) / (ARSENAL.length - HARD.length)) * (2 - lean) * 0.9;
    weights[p.id] = Math.max(0.01, base);
  }

  // Sequencing memory: recent pitches pull the hitter's expectation toward them.
  const recent = memory.slice(-8);
  let leanX = 0;
  let leanY = 0;
  let leanTotal = 0;
  for (let i = 0; i < recent.length; i++) {
    const entry = recent[i];
    const recency = Math.pow(0.76, recent.length - 1 - i);
    const w = (entry.thisPlateAppearance ? 1 : 0.32) * recency;
    weights[entry.pitchId] = (weights[entry.pitchId] ?? 0.01) + w * 0.34;
    leanX += entry.loc.x * w;
    leanY += entry.loc.y * w;
    leanTotal += w;
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(weights)) weights[k] /= total;

  let expectedVelo = 0;
  for (const p of ARSENAL) expectedVelo += weights[p.id] * p.velo;

  const aggression = clamp01(
    zoneSwingRate(balls, strikes) * (0.7 + 0.6 * batter.aggression),
  );

  return {
    typeWeights: weights,
    zoneLean: leanTotal > 0 ? { x: leanX / leanTotal, y: leanY / leanTotal } : { x: 0, y: 0 },
    aggression,
    expectedVelo,
  };
}

/**
 * How badly the hitter is fooled, 0..1.
 *
 * Being wrong about the pitch is only half of it — the other half is whether the
 * pitch he *was* looking for shares a tunnel with the one you threw. A changeup
 * behind fastballs is devastating; a curveball behind fastballs is merely a
 * different pitch, because he picks the shape up out of the hand.
 */
export function computeDeception(
  thrown: PitchType,
  guess: Guess,
  batter: Batter,
  actualVelo: number,
): number {
  const match = guess.typeWeights[thrown.id] ?? 0.2;
  const surprise = clamp01(1 - match / 0.45);

  let tunnelShare = 0;
  for (const p of ARSENAL) {
    if (p.tunnel === thrown.tunnel) tunnelShare += guess.typeWeights[p.id] ?? 0;
  }
  const tunnelFactor = 0.6 + 0.7 * Math.max(0, tunnelShare - match);

  const veloSurprise = clamp01(Math.abs(guess.expectedVelo - actualVelo) / 14);
  const recognition = 0.55 + 0.45 * (1 - batter.contact);

  return clamp01((surprise * 0.7 + veloSurprise * 0.5) * tunnelFactor * recognition);
}

/** Probability the hitter offers at this pitch. */
export function swingProbability(
  loc: Loc,
  thrown: PitchType,
  batter: Batter,
  guess: Guess,
  deception: number,
  inZone: boolean,
  balls: number,
  strikes: number,
): number {
  const look = strikeLook(loc);

  // Leaning the right way on location makes him quicker to pull the trigger.
  const locAgreement = clamp01(
    1 - Math.hypot(loc.x - guess.zoneLean.x, loc.y - guess.zoneLean.y) / 3.5,
  );

  if (inZone) {
    const base = guess.aggression * (0.78 + 0.3 * locAgreement);
    // A well-disguised pitch on the edge can freeze him for a called strike.
    const freeze = deception * thrown.chase * 0.3;
    return clamp01(base * (1 - freeze));
  }

  const base =
    chaseRate(balls, strikes) *
    thrown.chase *
    (1 - batter.discipline * 0.85) *
    (0.35 + 0.9 * look) *
    (0.7 + 0.8 * deception) *
    (0.6 + 0.6 * batter.aggression);
  return clamp01(base);
}

export function topGuess(guess: Guess): { pitch: PitchType; weight: number } {
  let bestId = ARSENAL[0].id;
  for (const p of ARSENAL) {
    if ((guess.typeWeights[p.id] ?? 0) > (guess.typeWeights[bestId] ?? 0)) bestId = p.id;
  }
  return { pitch: getPitch(bestId), weight: guess.typeWeights[bestId] };
}
