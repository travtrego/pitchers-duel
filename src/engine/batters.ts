import type { Batter } from './types';

/**
 * Four hitters with genuinely different ways of beating you, so that a single
 * inning forces you to change your approach rather than find one good sequence
 * and repeat it.
 */
export const LINEUP: Batter[] = [
  {
    id: 'ortega',
    name: 'D. Ortega',
    hand: 'L',
    contact: 0.82,
    power: 0.24,
    discipline: 0.86,
    speed: 0.88,
    aggression: 0.34,
    sitFastball: 0.62,
    blurb: 'Leadoff. Will not chase, fouls off everything, beats out anything on the ground.',
  },
  {
    id: 'brand',
    name: 'M. Brand',
    hand: 'R',
    contact: 0.55,
    power: 0.94,
    discipline: 0.31,
    speed: 0.3,
    aggression: 0.85,
    sitFastball: 0.78,
    blurb: 'Cleanup. Sits dead-red and swings hard. Expand the zone or watch it leave.',
  },
  {
    id: 'kessler',
    name: 'A. Kessler',
    hand: 'R',
    contact: 0.74,
    power: 0.63,
    discipline: 0.7,
    speed: 0.48,
    aggression: 0.56,
    sitFastball: 0.5,
    blurb: 'Professional hitter. Adjusts inside the at-bat faster than anyone in the order.',
  },
  {
    id: 'nyquist',
    name: 'P. Nyquist',
    hand: 'L',
    contact: 0.47,
    power: 0.58,
    discipline: 0.22,
    speed: 0.6,
    aggression: 0.79,
    sitFastball: 0.71,
    blurb: 'Rookie. Buries himself chasing spin below the zone — but he can turn on a mistake.',
  },
];

export function batterAt(index: number): Batter {
  return LINEUP[index % LINEUP.length];
}
