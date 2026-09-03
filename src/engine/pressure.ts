import type { Bases, Situation } from './types';
import { clamp01 } from './zone';

/**
 * Leverage, and what it does to a pitcher.
 *
 * Runners on base do not change the strike zone, but they change everything
 * about how it feels to throw into it: you work from the stretch, a walk is
 * suddenly expensive, and a mistake stops being a single. This is the term
 * that makes the seventh with two on play differently from the first with the
 * bases empty, and the only rating that fights it is composure.
 */

export interface PressureInputs {
  bases: Bases;
  outs: number;
  inning: number;
  /** Your runs minus theirs. A one-run lead is the tightest place to stand. */
  runDiff: number;
  /** Which trip through the order the hitter at the plate is on, 1-based. */
  timesThroughOrder: number;
}

/** Raw squeeze of the situation, 0..1, before any poise is applied. */
export function situationPressure({ bases, outs, inning, runDiff }: PressureInputs): number {
  let p = 0;
  if (bases[0]) p += 0.14;
  if (bases[1]) p += 0.24;
  if (bases[2]) p += 0.3;
  if (bases[0] && bases[1] && bases[2]) p += 0.1;

  // Late innings tighten everything, and a tight game more so.
  p += Math.min(0.24, Math.max(0, inning - 5) * 0.06);
  if (Math.abs(runDiff) <= 1) p += 0.12;
  else if (Math.abs(runDiff) >= 5) p -= 0.1;

  // Nobody out with men on is the vice; two outs is the release valve.
  if (outs === 0) p *= 1.1;
  else if (outs === 2) p *= 0.72;

  return clamp01(p);
}

/**
 * Composure blunts pressure. A 99-composure arm feels about a quarter of what
 * a 25-composure arm feels in the same spot.
 */
export function effectivePressure(raw: number, composure: number): number {
  const poise = clamp01(composure / 99);
  return clamp01(raw * (1.15 - poise * 0.85));
}

export function makeSituation(inputs: PressureInputs, composure: number): Situation {
  const pressure = situationPressure(inputs);
  return {
    pressure,
    effective: effectivePressure(pressure, composure),
    risp: inputs.bases[1] || inputs.bases[2],
    stretch: inputs.bases[0] || inputs.bases[1] || inputs.bases[2],
    timesThroughOrder: inputs.timesThroughOrder,
  };
}

/** A calm, empty-bases, first-look situation, for tests and defaults. */
export const CALM: Situation = {
  pressure: 0,
  effective: 0,
  risp: false,
  stretch: false,
  timesThroughOrder: 1,
};

/**
 * How much narrower the meter's forgiving window gets under pressure. Pitching
 * from the stretch with a runner on third is genuinely harder to execute.
 */
export function pressureWindowScale(effective: number): number {
  return 1 - effective * 0.38;
}

/** How much quicker the bar sweeps under pressure. */
export function pressureSpeedScale(effective: number): number {
  return 1 + effective * 0.22;
}

/** Stress pitches cost more than routine ones. */
export function pressureStaminaScale(effective: number): number {
  return 1 + effective * 0.5;
}
