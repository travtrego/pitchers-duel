import { makeRng } from '../engine/rng';
import type { Rng } from '../engine/rng';

/**
 * League context around your starts.
 *
 * Your club plays every day whether or not you are on the mound, so the rest
 * of the schedule is simmed: the games you start are decided by you, and the
 * four in between are decided by a coin weighted to team quality. The point is
 * that a September start should feel different when you are two back than when
 * you are eliminated.
 */

export interface TeamRecord {
  name: string;
  wins: number;
  losses: number;
  /** True for the club you pitch for. */
  isYou: boolean;
}

/** Games the club plays between each of your starts. */
export const GAMES_BETWEEN_STARTS = 4;

export function gamesPlayed(startsMade: number): number {
  return startsMade * (1 + GAMES_BETWEEN_STARTS);
}

/**
 * Sim the games you did not pitch, between one start and the next.
 * Returns wins added.
 */
export function simBetweenStarts(rng: Rng, teamStrength: number): number {
  let wins = 0;
  for (let i = 0; i < GAMES_BETWEEN_STARTS; i++) {
    if (rng.chance(0.34 + teamStrength * 0.34)) wins++;
  }
  return wins;
}

export interface StandingsState {
  /** Your club's record, including your own decisions. */
  wins: number;
  losses: number;
  /** Rivals, in no particular order; sorted for display. */
  rivals: TeamRecord[];
}

export function newStandings(rivalNames: string[]): StandingsState {
  return { wins: 0, losses: 0, rivals: rivalNames.map((name) => ({ name, wins: 0, losses: 0, isYou: false })) };
}

/**
 * Advance the league by one turn of the rotation: your club plays five games
 * (your start plus four), and so does everyone else.
 */
export function advanceLeague(
  standings: StandingsState,
  seed: number,
  youWon: boolean | null,
  teamStrength: number,
  rivalStrength = 0.5,
): StandingsState {
  const rng = makeRng(seed);
  const extraWins = simBetweenStarts(rng, teamStrength);
  const extraLosses = GAMES_BETWEEN_STARTS - extraWins;

  // Your own start counts only when it produced a decision for the club.
  const ownWin = youWon === true ? 1 : 0;
  const ownLoss = youWon === false ? 1 : 0;

  const rivals = standings.rivals.map((r) => {
    let w = 0;
    for (let i = 0; i < 1 + GAMES_BETWEEN_STARTS; i++) {
      if (rng.chance(0.32 + rivalStrength * 0.36)) w++;
    }
    return { ...r, wins: r.wins + w, losses: r.losses + (1 + GAMES_BETWEEN_STARTS - w) };
  });

  return {
    wins: standings.wins + extraWins + ownWin,
    losses: standings.losses + extraLosses + ownLoss,
    rivals,
  };
}

export function winPct(w: number, l: number): number {
  return w + l === 0 ? 0 : w / (w + l);
}

/** Full table, your club included, best record first. */
export function table(standings: StandingsState, yourTeam: string): TeamRecord[] {
  const rows: TeamRecord[] = [
    { name: yourTeam, wins: standings.wins, losses: standings.losses, isYou: true },
    ...standings.rivals,
  ];
  return rows.sort((a, b) => winPct(b.wins, b.losses) - winPct(a.wins, a.losses));
}

/** Games behind the leader. Zero means you are in first. */
export function gamesBack(standings: StandingsState, yourTeam: string): number {
  const rows = table(standings, yourTeam);
  const leader = rows[0];
  const you = rows.find((r) => r.isYou)!;
  if (leader.isYou) return 0;
  return Math.max(0, ((leader.wins - you.wins) + (you.losses - leader.losses)) / 2);
}

/** A one-line read on where the club stands, for the hub and pregame. */
export function raceNote(standings: StandingsState, yourTeam: string, gamesLeft: number): string {
  const gb = gamesBack(standings, yourTeam);
  const place = table(standings, yourTeam).findIndex((r) => r.isYou) + 1;
  if (standings.wins + standings.losses === 0) return 'Season opens tonight.';
  if (gb === 0) return `First place. ${gamesLeft} start${gamesLeft === 1 ? '' : 's'} left to hold it.`;
  if (gb <= 2) return `${gb.toFixed(1)} back, ${ordinalPlace(place)} place. Every start counts now.`;
  if (gb <= 6) return `${gb.toFixed(1)} back in ${ordinalPlace(place)}. Still live.`;
  return `${gb.toFixed(1)} back. Play for next year — and your own numbers.`;
}

function ordinalPlace(n: number): string {
  return n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`;
}
