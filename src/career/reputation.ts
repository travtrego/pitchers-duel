/**
 * Reputation.
 *
 * The story sets flags when you answer a reporter or a coach; this is where
 * they get spent. Two independent axes, because they are genuinely different
 * things: the clubhouse cares whether you are easy to be around, the front
 * office cares whether you are worth the roster spot.
 */

export interface Reputation {
  /** -100..100. Earned by humility and honesty, spent by swagger. */
  clubhouse: number;
  /** -100..100. Earned by results, and by being the guy fans show up for. */
  fame: number;
}

export const NEUTRAL: Reputation = { clubhouse: 0, fame: 0 };

export function clamp(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

export function applyRep(rep: Reputation, delta: Partial<Reputation>): Reputation {
  return {
    clubhouse: clamp(rep.clubhouse + (delta.clubhouse ?? 0)),
    fame: clamp(rep.fame + (delta.fame ?? 0)),
  };
}

export type RepTier = 'beloved' | 'respected' | 'neutral' | 'prickly' | 'toxic';

export function clubhouseTier(rep: Reputation): RepTier {
  if (rep.clubhouse >= 55) return 'beloved';
  if (rep.clubhouse >= 20) return 'respected';
  if (rep.clubhouse <= -55) return 'toxic';
  if (rep.clubhouse <= -20) return 'prickly';
  return 'neutral';
}

export const CLUBHOUSE_LABEL: Record<RepTier, string> = {
  beloved: 'Beloved in the room',
  respected: 'Respected teammate',
  neutral: 'Keeps to himself',
  prickly: 'Rubs people wrong',
  toxic: 'Clubhouse problem',
};

export function fameLabel(rep: Reputation): string {
  if (rep.fame >= 70) return 'Face of the franchise';
  if (rep.fame >= 40) return 'Fan favorite';
  if (rep.fame >= 15) return 'Getting noticed';
  if (rep.fame <= -30) return 'Booed at home';
  return 'Just another arm';
}

/**
 * A well-liked pitcher gets a longer leash in a slump; a clubhouse problem
 * gets pulled early and buried. Scales the ERA threshold the org tolerates
 * before it starts asking questions.
 */
export function patienceMultiplier(rep: Reputation): number {
  return 1 + rep.clubhouse / 400;
}

/**
 * Fame moves the needle on draft stock and call-up timing — the org is a
 * business, and a pitcher who sells tickets gets the look first.
 */
export function fameBonus(rep: Reputation): number {
  return rep.fame / 5;
}

/** Development XP is slightly cheaper when coaches like working with you. */
export function xpMultiplier(rep: Reputation): number {
  return 1 + Math.max(0, rep.clubhouse) / 500;
}
