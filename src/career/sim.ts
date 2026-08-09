import type { Rng } from '../engine/rng';

/**
 * Everything that happens in a game other than your own pitches: your team's
 * offense, the bullpen after you leave, and the pitcher-decision bookkeeping.
 */

/** Sample runs for one offensive half-inning given an expected-runs rate. */
export function runsInInning(rng: Rng, lambda: number): number {
  let runs = 0;
  let q = 1 - Math.exp(-lambda);
  while (rng.chance(q) && runs < 8) {
    runs++;
    q *= 0.55;
  }
  return runs;
}

/** Expected runs per inning for your own lineup against this opposition. */
export function offenseLambda(teamStrength: number, oppQuality: number): number {
  return Math.max(0.12, 0.52 + teamStrength * 0.35 - oppQuality * 0.45);
}

/** Expected runs per inning the bullpen allows once you're out of the game. */
export function bullpenLambda(teamStrength: number, oppQuality: number): number {
  return Math.max(0.15, 0.3 + oppQuality * 0.5 - teamStrength * 0.3);
}

export interface GameFinish {
  finalUs: number;
  finalThem: number;
  won: boolean;
  /** W, L or ND for the starter. */
  decision: 'W' | 'L' | 'ND';
  /** Innings the bullpen threw. */
  bullpenInnings: number;
}

/**
 * Finish a game after the starter departs (or after nine if he goes the
 * distance), then work out his decision by the standard rules-lite version:
 * leave with a lead your team never gives back (and five full innings) and the
 * win is yours; leave trailing in a game your team never ties and the loss is.
 */
export function finishGame(
  rng: Rng,
  usThroughExit: number,
  themThroughExit: number,
  inningsPitched: number,
  outsRecorded: number,
  offLambda: number,
  penLambda: number,
): GameFinish {
  let us = usThroughExit;
  let them = themThroughExit;
  const leadAtExit = us - them;
  let leadLost = false;
  let deficitErased = them <= us;

  let inn = inningsPitched;
  let bullpenInnings = 0;
  // Play out remaining regulation innings, then extras if needed (capped).
  while (inn < 9 || us === them) {
    inn++;
    if (inn > 13) {
      // Somebody wins the marathon; coin-flip weighted by the two rates.
      if (rng.chance(offLambda / (offLambda + penLambda))) us++;
      else them++;
      break;
    }
    them += runsInInning(rng, penLambda);
    bullpenInnings++;
    us += runsInInning(rng, offLambda);
    if (leadAtExit > 0 && them >= us) leadLost = true;
    if (leadAtExit < 0 && us >= them) deficitErased = true;
  }

  const won = us > them;
  let decision: GameFinish['decision'] = 'ND';
  if (won && leadAtExit > 0 && !leadLost && outsRecorded >= 15) decision = 'W';
  else if (!won && leadAtExit < 0 && !deficitErased) decision = 'L';

  return { finalUs: us, finalThem: them, won, decision, bullpenInnings };
}

// ---------------------------------------------------------------------------
// Stat lines
// ---------------------------------------------------------------------------

export interface StartLine {
  opponent: string;
  outs: number;
  hits: number;
  runs: number;
  strikeouts: number;
  walks: number;
  pitches: number;
  decision: 'W' | 'L' | 'ND';
  finalUs: number;
  finalThem: number;
  qualityStart: boolean;
}

export interface SeasonTotals {
  starts: number;
  outs: number;
  hits: number;
  runs: number;
  strikeouts: number;
  walks: number;
  wins: number;
  losses: number;
  qualityStarts: number;
}

export function emptyTotals(): SeasonTotals {
  return { starts: 0, outs: 0, hits: 0, runs: 0, strikeouts: 0, walks: 0, wins: 0, losses: 0, qualityStarts: 0 };
}

export function addLine(t: SeasonTotals, line: StartLine): SeasonTotals {
  return {
    starts: t.starts + 1,
    outs: t.outs + line.outs,
    hits: t.hits + line.hits,
    runs: t.runs + line.runs,
    strikeouts: t.strikeouts + line.strikeouts,
    walks: t.walks + line.walks,
    wins: t.wins + (line.decision === 'W' ? 1 : 0),
    losses: t.losses + (line.decision === 'L' ? 1 : 0),
    qualityStarts: t.qualityStarts + (line.qualityStart ? 1 : 0),
  };
}

export function era(t: SeasonTotals): number {
  if (t.outs === 0) return 0;
  return (t.runs * 27) / t.outs;
}

export function kPerNine(t: SeasonTotals): number {
  if (t.outs === 0) return 0;
  return (t.strikeouts * 27) / t.outs;
}

export function ipDisplay(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/** XP a start earns. Pitching well is the only economy in the game. */
export function xpForStart(line: StartLine): number {
  let xp =
    line.outs * 8 +
    line.strikeouts * 12 -
    line.runs * 10 +
    (line.qualityStart ? 60 : 0) +
    (line.decision === 'W' ? 40 : 0);
  return Math.max(15, Math.round(xp));
}
