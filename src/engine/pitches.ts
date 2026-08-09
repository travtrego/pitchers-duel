import type { PitchType } from './types';

/**
 * A right-handed starter's arsenal.
 *
 * Tunnel groups matter more than any single rating here. The four-seam, sinker
 * and changeup all leave the hand looking alike ('hard'), which is why the
 * changeup plays up so much after you've been pumping fastballs. The slider and
 * curve each announce themselves a little earlier, so they buy their outs with
 * movement instead of disguise.
 */
export const ARSENAL: PitchType[] = [
  {
    id: 'FF',
    name: 'Four-Seam',
    abbrev: 'FF',
    velo: 96,
    break: { x: 0.1, y: 0.55 },
    controlDifficulty: 0.18,
    accuracyWindow: 0.13,
    whiff: 0.4,
    chase: 0.28,
    gb: 0.28,
    tunnel: 'hard',
    color: '#e8503a',
    blurb: 'Rides up. Beats hitters at the top of the zone, gets crushed at the belt.',
  },
  {
    id: 'SI',
    name: 'Sinker',
    abbrev: 'SI',
    velo: 94,
    break: { x: -0.75, y: -0.45 },
    controlDifficulty: 0.26,
    accuracyWindow: 0.12,
    whiff: 0.26,
    chase: 0.33,
    gb: 0.78,
    tunnel: 'hard',
    color: '#e0873c',
    blurb: 'Arm-side run, down. Not a bat-misser — a double-play pitch.',
  },
  {
    id: 'CH',
    name: 'Changeup',
    abbrev: 'CH',
    velo: 85,
    break: { x: -0.8, y: -0.75 },
    controlDifficulty: 0.38,
    accuracyWindow: 0.1,
    whiff: 0.54,
    chase: 0.62,
    gb: 0.62,
    tunnel: 'hard',
    color: '#4fb477',
    blurb: 'Fastball out of the hand, 11 mph slower. Only as good as the fastballs before it.',
  },
  {
    id: 'SL',
    name: 'Slider',
    abbrev: 'SL',
    velo: 87,
    break: { x: 0.95, y: -0.6 },
    controlDifficulty: 0.36,
    accuracyWindow: 0.1,
    whiff: 0.6,
    chase: 0.66,
    gb: 0.52,
    tunnel: 'sweep',
    color: '#3f8ee0',
    blurb: 'Glove-side sweep. Your put-away pitch off the plate with two strikes.',
  },
  {
    id: 'CB',
    name: 'Curveball',
    abbrev: 'CB',
    velo: 80,
    break: { x: 0.45, y: -1.45 },
    controlDifficulty: 0.5,
    accuracyWindow: 0.085,
    whiff: 0.55,
    chase: 0.46,
    gb: 0.6,
    tunnel: 'loop',
    color: '#9b6fd4',
    blurb: 'Huge depth, hardest to command. A hung curve is the worst pitch in baseball.',
  },
];

export const PITCH_BY_ID: Record<string, PitchType> = Object.fromEntries(
  ARSENAL.map((p) => [p.id, p]),
);

export function getPitch(id: string): PitchType {
  const p = PITCH_BY_ID[id];
  if (!p) throw new Error(`Unknown pitch: ${id}`);
  return p;
}

export function breakMagnitude(p: PitchType): number {
  return Math.hypot(p.break.x, p.break.y);
}
