import type { Loc } from './types';

/** Half-width and half-height of the strike zone in zone units. */
export const ZONE_HALF = 1.5;
/** The aiming grid spans this far in each direction (5 cells of width 1). */
export const GRID_HALF = 2.5;

export function isStrike(loc: Loc): boolean {
  return Math.abs(loc.x) < ZONE_HALF && Math.abs(loc.y) < ZONE_HALF;
}

/**
 * Umpires do not call a rectangle. Pitches within a hair of the line get called
 * both ways, which is what makes living on the edges a real gamble.
 */
export function umpireCallsStrike(loc: Loc, roll: number): boolean {
  const worst = Math.max(Math.abs(loc.x), Math.abs(loc.y));
  const margin = worst - ZONE_HALF;
  if (margin < -0.35) return true;
  if (margin > 0.35) return false;
  // Linear fade across the 0.7-unit band straddling the line.
  const strikeProb = 0.5 - margin / 0.7;
  return roll < strikeProb;
}

export function distFromCenter(loc: Loc): number {
  return Math.hypot(loc.x, loc.y);
}

/**
 * How hittable a location is on its own merits, 0..1. Peaks middle-middle and
 * falls off toward the edges. This is the term that makes corners worth chasing
 * even though missing toward them costs you balls.
 */
export function heartQuality(loc: Loc): number {
  const d = distFromCenter(loc);
  return clamp01(1 - (d - 0.35) / 1.55);
}

/** How much a location *looks* like a strike to a hitter deciding to swing. */
export function strikeLook(loc: Loc): number {
  const worst = Math.max(Math.abs(loc.x), Math.abs(loc.y));
  return clamp01(1 - (worst - 0.9) / 1.5);
}

/** Snap a continuous location to a 5x5 grid cell index, for the UI heat display. */
export function cellFor(loc: Loc): { col: number; row: number } | null {
  const col = Math.floor((loc.x + GRID_HALF) / 1);
  const row = Math.floor((GRID_HALF - loc.y) / 1);
  if (col < 0 || col > 4 || row < 0 || row > 4) return null;
  return { col, row };
}

/** Center of a 5x5 grid cell, used as the aim point when the player clicks. */
export function cellCenter(col: number, row: number): Loc {
  return { x: col - 2, y: 2 - row };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
