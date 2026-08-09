import { breakMagnitude } from './pitches';
import type { Batter, Guess, Loc, MeterResult, PitcherState, PitchType } from './types';
import type { Rng } from './rng';
import { clamp, clamp01, heartQuality, isStrike } from './zone';

export interface Execution {
  actual: Loc;
  velo: number;
  /** True when a weak power stop flattened a breaking ball into the middle. */
  hung: boolean;
  /** Movement actually generated, after any power shortfall. */
  effectiveBreak: number;
  /** The break the ball actually took, for the flight animation. */
  liveBreak: Loc;
  inZone: boolean;
}

/**
 * Turns intent plus meter input into where the ball actually goes.
 *
 * Two independent failure modes, which is the point of a three-stop meter:
 * missing the power stop leaves the pitch flat and drifting back over the
 * plate, while missing the accuracy stop sprays it off target. A hung curveball
 * and a curveball in the dirt are different mistakes with different prices.
 */
export function executePitch(
  pitch: PitchType,
  aim: Loc,
  meter: MeterResult,
  pitcher: PitcherState,
  rng: Rng,
): Execution {
  // A knuckleball's break is rolled fresh every throw — that's the whole pitch.
  const liveBreak: Loc = pitch.flutter
    ? { x: rng.range(-1.2, 1.2), y: rng.range(-1.3, 0.3) }
    : { ...pitch.break };
  const bMag = pitch.flutter ? Math.hypot(liveBreak.x, liveBreak.y) : breakMagnitude(pitch);

  const fatigue = 1 + (1 - pitcher.stamina) * 0.95;
  const aimDist = Math.hypot(aim.x, aim.y);
  // Reaching for a corner is harder to execute than working the middle.
  const reach = 1 + 0.3 * Math.max(0, aimDist - 1.2);

  const missMag =
    Math.abs(meter.accuracyError) * (1.5 + pitch.controlDifficulty * 2.1) * fatigue * reach;

  // The side you stopped on decides which way you miss; the rest is spray.
  const side = meter.accuracyError >= 0 ? 1 : -1;
  let x = aim.x + side * missMag * 0.75 + rng.normal() * missMag * 0.3;
  let y = aim.y + rng.normal() * missMag * 0.62;

  // The knuckleball's wander lands somewhere near the aim no matter how good
  // the meter was — command of it is a contradiction in terms.
  if (pitch.flutter) {
    x += liveBreak.x * 0.45;
    y += liveBreak.y * 0.45;
  }

  const shortfall = clamp01(meter.powerError);
  const hung = !pitch.flutter && shortfall > 0.35 && bMag > 0.8;
  if (hung) {
    // A pitch without its power drifts back toward the middle and sits up.
    const drift = (shortfall - 0.35) * bMag * 0.62;
    x += (0 - x) * clamp01(drift);
    y += (0 - y) * clamp01(drift) + drift * 0.75;
  }

  const velo =
    pitch.velo * (0.95 + 0.05 * (1 - shortfall)) - (1 - pitcher.stamina) * 2.6;
  const effectiveBreak = bMag * (1 - shortfall * 0.55);

  const actual = { x, y };
  return { actual, velo, hung, effectiveBreak, liveBreak, inZone: isStrike(actual) };
}

export type Trajectory = 'ground' | 'line' | 'fly' | 'popup';

export interface ContactResult {
  quality: number;
  trajectory: Trajectory;
  /** 0 = out, 1 = single, 2 = double, 3 = triple, 4 = home run. */
  hitBases: 0 | 1 | 2 | 3 | 4;
}

/** How far off the hitter's timing is, 0..1. Drives both whiffs and weak contact. */
export function timingError(
  exec: Execution,
  guess: Guess,
  batter: Batter,
  deception: number,
): number {
  const veloSurprise = clamp01(Math.abs(guess.expectedVelo - exec.velo) / 14);
  const movement = (exec.effectiveBreak / 1.7) * (1 - batter.contact * 0.55);
  return clamp01(veloSurprise * 0.55 + deception * 0.62 + movement * 0.28);
}

export function whiffProbability(
  exec: Execution,
  batter: Batter,
  pitch: PitchType,
  timing: number,
): number {
  const locDifficulty = 1 - heartQuality(exec.actual);
  let p =
    pitch.whiff *
    (0.3 + 0.78 * timing) *
    (0.45 + 0.75 * locDifficulty) *
    (1.2 - batter.contact * 0.62);
  if (!exec.inZone) p *= 1.3;
  if (exec.hung) p *= 0.45;
  return clamp(p, 0.02, 0.85);
}

/** Resolve a swing that made contact into a trajectory and a result. */
export function resolveContact(
  exec: Execution,
  batter: Batter,
  pitch: PitchType,
  timing: number,
  rng: Rng,
): ContactResult {
  let quality =
    (0.42 + 0.5 * batter.contact) *
    (1 - timing * 0.72) *
    (0.45 + 0.62 * heartQuality(exec.actual));
  if (exec.hung) quality *= 1.35;
  quality = clamp01(quality + rng.normal() * 0.09);

  // Ground/fly split comes from the pitch, nudged upward on good contact.
  const groundLean = pitch.gb * (1 - quality * 0.45);
  let trajectory: Trajectory;
  if (quality > 0.62) {
    trajectory = rng.chance(groundLean * 0.55) ? 'ground' : 'line';
  } else if (quality > 0.4) {
    trajectory = rng.chance(groundLean) ? 'ground' : 'fly';
  } else {
    trajectory = rng.chance(groundLean) ? 'ground' : 'popup';
  }

  let hitBases: ContactResult['hitBases'] = 0;
  if (quality > 0.8 && trajectory !== 'ground' && trajectory !== 'popup') {
    const hrChance = ((quality - 0.8) / 0.2) * (0.22 + 0.62 * batter.power);
    if (rng.chance(hrChance)) hitBases = 4;
    else if (rng.chance(0.42 + 0.2 * batter.power)) hitBases = 2;
    else hitBases = 1;
  } else if (quality > 0.62) {
    if (rng.chance(trajectory === 'ground' ? 0.42 : 0.6)) hitBases = 1;
    else if (rng.chance(0.08 + 0.12 * batter.speed)) hitBases = 2;
  } else if (quality > 0.4) {
    if (rng.chance(trajectory === 'ground' ? 0.2 : 0.12)) hitBases = 1;
  } else {
    // Weak contact only sneaks through for a runner.
    if (trajectory === 'ground' && rng.chance(0.05 + 0.1 * batter.speed)) hitBases = 1;
  }

  if (hitBases === 2 && trajectory !== 'ground' && batter.speed > 0.8 && rng.chance(0.12)) {
    hitBases = 3;
  }

  return { quality, trajectory, hitBases };
}

/** Chance a swing that isn't a whiff goes foul rather than into play. */
export function foulProbability(quality: number, batter: Batter, strikes: number): number {
  const protect = strikes === 2 ? 0.14 * batter.contact : 0;
  return clamp(0.24 + 0.45 * (1 - quality) + protect, 0.15, 0.78);
}
