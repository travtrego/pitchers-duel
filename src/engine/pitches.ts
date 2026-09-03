import { CATALOG_BY_ID, getCatalogPitch } from './pitchCatalog';
import type { PitchType } from './types';

/**
 * The default five-pitch mix, used by exhibition mode and as the engine's
 * fallback when no created pitcher is supplied. The full list of every pitch in
 * the game lives in pitchCatalog.ts.
 */
export const ARSENAL: PitchType[] = ['FF', 'SI', 'CH', 'SL', 'CB'].map(getCatalogPitch);

export const PITCH_BY_ID: Record<string, PitchType> = CATALOG_BY_ID;

export function getPitch(id: string): PitchType {
  return getCatalogPitch(id);
}

export function breakMagnitude(p: PitchType): number {
  return Math.hypot(p.break.x, p.break.y);
}
