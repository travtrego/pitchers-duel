import { makeRng, type Rng } from './rng';
import type { Batter } from './types';
import { clamp01 } from './zone';

const FIRST = [
  'A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'I.', 'J.',
  'K.', 'L.', 'M.', 'N.', 'O.', 'P.', 'R.', 'S.', 'T.', 'V.', 'W.',
];

const LAST = [
  'Alvarez', 'Bishop', 'Calloway', 'Delgado', 'Eastman', 'Fontaine', 'Guerrero',
  'Hobbs', 'Iverson', 'Jenks', 'Kowalski', 'Lindqvist', 'Maddox', 'Nakamura',
  'Okafor', 'Pemberton', 'Quill', 'Rourke', 'Santana', 'Trujillo', 'Uehara',
  'Vance', 'Whitfield', 'Yoder', 'Zambrano', 'Ashcroft', 'Beaumont', 'Castellanos',
  'Draper', 'Ellsworth', 'Fairbanks', 'Grimaldi', 'Holloway', 'Ibarra', 'Jessup',
];

const ARCH_BLURBS: [string, (b: Batter) => boolean][] = [
  ['Sits dead-red and swings for the fences. Expand the zone or pay.', (b) => b.power > 0.72 && b.discipline < 0.45],
  ['Will not chase. Make him hit your pitch or walk him trying.', (b) => b.discipline > 0.75],
  ['Slap hitter with wheels. Anything on the ground is a footrace.', (b) => b.speed > 0.78 && b.power < 0.45],
  ['Free swinger. First-pitch anything, and he means it.', (b) => b.aggression > 0.75],
  ['Professional at-bat every time. Adjusts fast — do not repeat yourself.', (b) => b.contact > 0.7],
  ['Dangerous mistake hitter. Fine with everything except the middle.', () => true],
];

/**
 * Generate a nine-man order around a level quality, 0..1. College bats sit
 * near 0.4; a big-league heart of the order pushes 0.9. Every lineup gets a
 * spread so there is always a masher to avoid and a soft landing below him.
 */
export function generateLineup(seed: number, quality: number, teamName: string): Batter[] {
  const rng = makeRng(seed);
  const order: Batter[] = [];
  // Classic shape: table-setters up top, damage in the middle, outs at the end.
  const slotShape = [0.02, 0.03, 0.08, 0.1, 0.05, 0, -0.04, -0.08, -0.12];
  for (let i = 0; i < 9; i++) {
    const q = clamp01(quality + slotShape[i] + rng.range(-0.06, 0.06));
    const b = generateBatter(rng, q, i);
    order.push({ ...b, id: `${teamName}-${i}` });
  }
  return order;
}

function generateBatter(rng: Rng, q: number, slot: number): Batter {
  const name = `${FIRST[Math.floor(rng.next() * FIRST.length)]} ${LAST[Math.floor(rng.next() * LAST.length)]}`;
  const spread = (base: number, wobble: number) => clamp01(base + rng.range(-wobble, wobble));

  // Middle-order bats trade contact for power; the top of the order reverses it.
  const powerTilt = slot >= 2 && slot <= 4 ? 0.15 : -0.05;
  const b: Batter = {
    id: '',
    name,
    hand: rng.chance(0.6) ? 'R' : 'L',
    contact: spread(q * 0.85 + 0.12 - powerTilt * 0.4, 0.1),
    power: spread(q * 0.8 + powerTilt, 0.14),
    discipline: spread(q * 0.75 + 0.08, 0.16),
    speed: spread(0.5, 0.28),
    aggression: spread(0.55, 0.22),
    sitFastball: spread(0.62, 0.16),
    blurb: '',
  };
  b.blurb = ARCH_BLURBS.find(([, test]) => test(b))![0];
  return b;
}

/** Opponent quality baselines by level of ball. */
export const LEVEL_QUALITY: Record<string, number> = {
  COLLEGE: 0.4,
  AA: 0.54,
  AAA: 0.65,
  MLB: 0.78,
};
