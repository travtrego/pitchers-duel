import { getCatalogPitch } from './pitchCatalog';
import type { PitchType } from './types';
import { clamp } from './zone';

/** All ratings run 25–99, scouting-scale style. */
export interface Ratings {
  /** Raw arm speed. Adds or subtracts real velocity on every pitch. */
  velocity: number;
  /** Shrinks meter punishment and widens accuracy windows. */
  command: number;
  /** Sharpens break on everything you throw. */
  movement: number;
  /** How slowly the tank drains and how late the windows stay wide. */
  stamina: number;
  /** Poise. Reserved for runners-on/meter pressure effects as they grow. */
  composure: number;
}

export interface ArsenalSlot {
  pitchId: string;
  /** 25–99. A pitch you barely know versus one you own. */
  grade: number;
}

export interface PlayerPitcher {
  name: string;
  throws: 'R' | 'L';
  archetypeId: string;
  ratings: Ratings;
  arsenal: ArsenalSlot[];
}

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  ratings: Ratings;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'flamethrower',
    name: 'Flamethrower',
    tagline: 'Triple-digit dreams, map-of-the-world command. The scouts drool anyway.',
    ratings: { velocity: 84, command: 45, movement: 55, stamina: 60, composure: 52 },
  },
  {
    id: 'surgeon',
    name: 'The Surgeon',
    tagline: 'Paints corners at 89. Never beats himself; makes hitters do the losing.',
    ratings: { velocity: 55, command: 84, movement: 60, stamina: 62, composure: 68 },
  },
  {
    id: 'junkballer',
    name: 'Junkballer',
    tagline: 'Nothing straight, nothing hard, nothing comfortable. A magician with a grudge.',
    ratings: { velocity: 42, command: 68, movement: 86, stamina: 58, composure: 60 },
  },
  {
    id: 'workhorse',
    name: 'Workhorse',
    tagline: 'Good at everything, great at lasting. Still throwing strikes in the eighth.',
    ratings: { velocity: 66, command: 63, movement: 58, stamina: 86, composure: 62 },
  },
];

export const MAX_ARSENAL = 5;
export const STARTING_PITCHES = 3;

/** Grades your first three pitches arrive with, best-first. */
export const STARTING_GRADES = [58, 52, 46];

export function archetypeById(id: string): Archetype {
  const a = ARCHETYPES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown archetype: ${id}`);
  return a;
}

export function makePlayer(
  name: string,
  throws: 'R' | 'L',
  archetypeId: string,
  pitchIds: string[],
): PlayerPitcher {
  const arch = archetypeById(archetypeId);
  return {
    name,
    throws,
    archetypeId,
    ratings: { ...arch.ratings },
    arsenal: pitchIds.slice(0, STARTING_PITCHES).map((pitchId, i) => ({
      pitchId,
      grade: STARTING_GRADES[i] ?? 45,
    })),
  };
}

/**
 * Scale a catalog pitch by the pitcher who throws it.
 *
 * Velocity comes from the arm; command tames both meter punishment and window
 * size; movement sharpens break; and the pitch's own grade — how well you
 * actually know it — boosts its bat-missing qualities across the board.
 */
export function derivePitch(slot: ArsenalSlot, ratings: Ratings): PitchType {
  const base = getCatalogPitch(slot.pitchId);
  const g = slot.grade;
  const veloShift = (ratings.velocity - 70) * 0.12;
  // A lefty's break mirrors: arm side is the other side.
  return {
    ...base,
    velo: Math.round((base.velo + veloShift) * 10) / 10,
    accuracyWindow: base.accuracyWindow * (0.72 + ratings.command * 0.0035 + g * 0.0018),
    controlDifficulty: base.controlDifficulty * clamp(1.28 - ratings.command * 0.004 - g * 0.0018, 0.55, 1.35),
    break: {
      x: base.break.x * (0.78 + ratings.movement * 0.003 + g * 0.0015),
      y: base.break.y * (0.78 + ratings.movement * 0.003 + g * 0.0015),
    },
    whiff: clamp(base.whiff * (0.72 + g * 0.0045), 0.05, 0.9),
    chase: clamp(base.chase * (0.76 + g * 0.004), 0.05, 0.9),
  };
}

export function deriveArsenal(player: PlayerPitcher): PitchType[] {
  const arsenal = player.arsenal.map((slot) => {
    const p = derivePitch(slot, player.ratings);
    return player.throws === 'L' ? { ...p, break: { x: -p.break.x, y: p.break.y } } : p;
  });
  return arsenal;
}

/** Stamina rating → drain per pitch. 25 stamina tires twice as fast as 99. */
export function staminaPerPitch(player: PlayerPitcher): number {
  return 0.0135 - (player.ratings.stamina / 99) * 0.007;
}

/** Pitch limit a coach will let you run to, by level of ball. */
export function pitchLimit(player: PlayerPitcher, level: string): number {
  const base =
    level === 'COLLEGE' ? 85 : level === 'AA' ? 90 : level === 'AAA' ? 95 : 105;
  return base + Math.round((player.ratings.stamina - 60) / 4);
}

// ---------------------------------------------------------------------------
// Development: everything below spends XP earned on the mound.
// ---------------------------------------------------------------------------

export function ratingCost(current: number): number {
  return 50 + Math.max(0, current - 60) * 8;
}

export function gradeCost(current: number): number {
  return 70 + Math.max(0, current - 60) * 6;
}

export const NEW_PITCH_COST = 350;
export const NEW_PITCH_GRADE = 40;

export function trainRating(player: PlayerPitcher, key: keyof Ratings): PlayerPitcher {
  const v = player.ratings[key];
  if (v >= 99) return player;
  return { ...player, ratings: { ...player.ratings, [key]: Math.min(99, v + 1) } };
}

export function upgradePitch(player: PlayerPitcher, pitchId: string): PlayerPitcher {
  return {
    ...player,
    arsenal: player.arsenal.map((s) =>
      s.pitchId === pitchId ? { ...s, grade: Math.min(99, s.grade + 4) } : s,
    ),
  };
}

export function learnPitch(player: PlayerPitcher, pitchId: string): PlayerPitcher {
  if (player.arsenal.length >= MAX_ARSENAL) return player;
  if (player.arsenal.some((s) => s.pitchId === pitchId)) return player;
  return {
    ...player,
    arsenal: [...player.arsenal, { pitchId, grade: NEW_PITCH_GRADE }],
  };
}

/** A one-line scouting label for the overall arm, for menus and broadcasts. */
export function overall(player: PlayerPitcher): number {
  const r = player.ratings;
  const gradeAvg =
    player.arsenal.reduce((a, s) => a + s.grade, 0) / Math.max(1, player.arsenal.length);
  return Math.round(
    r.velocity * 0.22 + r.command * 0.26 + r.movement * 0.18 + r.stamina * 0.14 + gradeAvg * 0.2,
  );
}
