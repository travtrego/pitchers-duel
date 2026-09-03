import { LEVEL_QUALITY } from '../engine/opponents';
import type { PlayerPitcher, Ratings } from '../engine/player';
import { makeRng } from '../engine/rng';
import {
  addLine,
  emptyTotals,
  era,
  kPerNine,
  xpForStart,
  type SeasonTotals,
  type StartLine,
} from './sim';
import { applyRep, fameBonus, NEUTRAL, xpMultiplier, type Reputation } from './reputation';
import {
  advanceLeague,
  gamesBack,
  newStandings,
  raceNote,
  type StandingsState,
} from './standings';
import { SCENES, type Scene, type SceneAction, type SceneChoice } from './story';
import {
  AA_OPPONENTS,
  AAA_OPPONENTS,
  COLLEGE_OPPONENTS,
  COLLEGES,
  PRO_TEAMS,
  collegeById,
  proTeamById,
} from './teams';

export type Level = 'COLLEGE' | 'AA' | 'AAA' | 'MLB';

export interface ScheduledGame {
  opponent: string;
  quality: number;
}

export interface SeasonRecord {
  label: string;
  level: Level;
  team: string;
  totals: SeasonTotals;
}

export interface CareerState {
  version: 1;
  player: PlayerPitcher;
  xp: number;
  age: number;
  path: 'college' | 'pro' | null;
  level: Level;
  collegeId?: string;
  orgId?: string;
  collegeYear: number;
  seasonYear: number;
  startIndex: number;
  schedule: ScheduledGame[];
  season: SeasonTotals;
  seasonLines: StartLine[];
  history: SeasonRecord[];
  flags: Record<string, string | number | boolean>;
  sceneQueue: string[];
  rngSeed: number;
  /** Clubhouse standing and fame, moved by the choices you make in scenes. */
  reputation: Reputation;
  /** Your club's record and the race around it. */
  standings: StandingsState;
}

export const SEASON_LENGTH: Record<Level, number> = {
  COLLEGE: 8,
  AA: 10,
  AAA: 10,
  MLB: 14,
};

export function newCareer(player: PlayerPitcher, seed: number): CareerState {
  return {
    version: 1,
    player,
    xp: 0,
    age: 18,
    path: null,
    level: 'COLLEGE',
    collegeYear: 0,
    seasonYear: 1,
    startIndex: 0,
    schedule: [],
    season: emptyTotals(),
    seasonLines: [],
    history: [],
    flags: {},
    sceneQueue: ['origin'],
    rngSeed: seed,
    reputation: NEUTRAL,
    standings: newStandings([]),
  };
}

function opponentPool(level: Level): string[] {
  if (level === 'COLLEGE') return COLLEGE_OPPONENTS;
  if (level === 'AA') return AA_OPPONENTS;
  if (level === 'AAA') return AAA_OPPONENTS;
  return PRO_TEAMS.map((t) => `${t.city} ${t.name}`);
}

/** Rivals your club chases at a given level. */
export function rivalsFor(cs: CareerState, level: Level): string[] {
  return opponentPool(level)
    .filter((o) => o !== teamName({ ...cs, level }))
    .slice(0, 5);
}

export function buildSchedule(cs: CareerState, level: Level): ScheduledGame[] {
  const rng = makeRng(cs.rngSeed + cs.seasonYear * 101);
  const pool = opponentPool(level).filter((o) => o !== teamName(cs));
  const games: ScheduledGame[] = [];
  for (let i = 0; i < SEASON_LENGTH[level]; i++) {
    games.push({
      opponent: pool[Math.floor(rng.next() * pool.length)],
      quality: Math.max(0.2, LEVEL_QUALITY[level] + rng.range(-0.06, 0.06)),
    });
  }
  return games;
}

export function teamName(cs: CareerState): string {
  if (cs.level === 'COLLEGE' && cs.collegeId) {
    const c = collegeById(cs.collegeId);
    return `${c.name} ${c.nickname}`;
  }
  if (cs.orgId) {
    const t = proTeamById(cs.orgId);
    if (cs.level === 'MLB') return `${t.city} ${t.name}`;
    return cs.level === 'AAA' ? t.aaa : t.aa;
  }
  return 'Free Agent';
}

/** Your club's quality, for run support and bullpen. */
export function teamStrength(cs: CareerState): number {
  if (cs.level === 'COLLEGE') return 0.45;
  const org = cs.orgId ? proTeamById(cs.orgId).strength : 0.6;
  return cs.level === 'MLB' ? org : 0.5 + org * 0.15;
}

export function levelLabel(level: Level): string {
  return level === 'COLLEGE' ? 'College' : level === 'MLB' ? 'Federal League' : level;
}

// ---------------------------------------------------------------------------
// Scenes: static from story.ts, dynamic built here.
// ---------------------------------------------------------------------------

export function getScene(id: string, cs: CareerState): Scene {
  if (SCENES[id]) return SCENES[id];
  if (id === 'college-offers') return buildCollegeOffers(cs);
  if (id === 'draft-day') return buildDraftDay(cs);
  if (id === 'season-end') return buildSeasonEnd(cs);
  throw new Error(`Unknown scene: ${id}`);
}

function buildCollegeOffers(cs: CareerState): Scene {
  const rng = makeRng(cs.rngSeed + 7);
  const shuffled = [...COLLEGES].sort(() => rng.next() - 0.5).slice(0, 3);
  return {
    id: 'college-offers',
    title: 'The Offers',
    setting: 'Three letters, three futures',
    lines: [
      {
        speaker: 'NARRATOR',
        text: 'Three programs want you badly enough to say so in writing. Your high-school coach says all three produce arms. Your mom likes whichever one does laundry.',
      },
    ],
    choices: shuffled.map((c) => ({
      label: `${c.name} ${c.nickname} — ${c.town}`,
      response: `${c.perkLabel}.`,
      action: { type: 'commit-college', collegeId: c.id },
    })),
  };
}

interface DraftResult {
  round: number;
  teamId: string;
  toAAA: boolean;
  bonusXp: number;
}

export function computeDraft(cs: CareerState): DraftResult {
  const collegeTotals = cs.history
    .filter((h) => h.level === 'COLLEGE')
    .reduce((acc, h) => addTotals(acc, h.totals), emptyTotals());
  const all = addTotals(collegeTotals, cs.season);
  const exposure = cs.collegeId && collegeById(cs.collegeId).perk === 'exposure' ? 25 : 0;
  const score =
    kPerNine(all) * 6 -
    era(all) * 8 +
    all.qualityStarts * 3 +
    all.wins * 4 +
    exposure +
    fameBonus(cs.reputation) +
    40;
  const rng = makeRng(cs.rngSeed + 13);
  const teamId = PRO_TEAMS[Math.floor(rng.next() * PRO_TEAMS.length)].id;
  if (score >= 95) return { round: 1, teamId, toAAA: true, bonusXp: 300 };
  if (score >= 70) return { round: 2, teamId, toAAA: false, bonusXp: 150 };
  return { round: Math.min(10, Math.max(4, Math.round(12 - score / 10))), teamId, toAAA: false, bonusXp: 50 };
}

function addTotals(a: SeasonTotals, b: SeasonTotals): SeasonTotals {
  return {
    starts: a.starts + b.starts,
    outs: a.outs + b.outs,
    hits: a.hits + b.hits,
    runs: a.runs + b.runs,
    strikeouts: a.strikeouts + b.strikeouts,
    walks: a.walks + b.walks,
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    qualityStarts: a.qualityStarts + b.qualityStarts,
  };
}

function buildDraftDay(cs: CareerState): Scene {
  const d = computeDraft(cs);
  const team = proTeamById(d.teamId);
  const roundWord =
    d.round === 1 ? 'first round' : d.round === 2 ? 'second round' : `round ${d.round}`;
  return {
    id: 'draft-day',
    title: 'Draft Day',
    setting: 'Living room — everyone you have ever met is here',
    lines: [
      {
        speaker: 'TV',
        text: `“With their ${roundWord} selection, the ${team.city} ${team.name} select...” — and then your name, pronounced almost correctly, on national television.`,
      },
      {
        speaker: 'NARRATOR',
        text: d.toAAA
          ? 'The room detonates. A first-rounder. The org wants you close to the big club — you start at Triple-A.'
          : 'The room detonates anyway. A pro. You’ll report to Double-A and earn the rest.',
      },
    ],
    choices: [
      {
        label: `Sign with ${team.city}`,
        effects: { xp: d.bonusXp },
        action: { type: 'sign-draft' },
      },
    ],
  };
}

function buildSeasonEnd(cs: CareerState): Scene {
  const e = era(cs.season);
  const promo = pendingPromotion(cs);
  const lines = [
    {
      speaker: 'NARRATOR',
      text: `Season in the books: ${cs.season.wins}-${cs.season.losses}, ${e.toFixed(2)} ERA, ${cs.season.strikeouts} strikeouts across ${cs.season.starts} starts for ${teamName(cs)}.`,
    },
  ];
  if (cs.level === 'COLLEGE') {
    lines.push({
      speaker: 'COACH',
      text:
        cs.collegeYear >= 3
          ? 'Three years. You came in a thrower and you leave a pitcher. Go get drafted.'
          : 'Decent year. Hit the weight room, come back nastier — the conference sure will.',
    });
  } else if (promo === 'AAA') {
    lines.push({ speaker: 'MANAGER', text: 'The org’s moving you up to Triple-A. One step from the show. Don’t unpack.' });
  } else if (promo === 'MLB') {
    lines.push({ speaker: 'MANAGER', text: 'They called about you today. Not to me — about you. Go home, rest the arm. You’re a big leaguer in spring.' });
  } else if (cs.level !== 'MLB') {
    lines.push({ speaker: 'MANAGER', text: 'The numbers say one more year here. The numbers are annoyingly hard to argue with. Make them argue for you next season.' });
  } else {
    lines.push({ speaker: 'MANAGER', text: 'Get some rest. Spring training has a way of showing up early.' });
  }
  return {
    id: 'season-end',
    title: `Season ${cs.seasonYear} Complete`,
    setting: teamName(cs),
    lines,
    choices: [{ label: 'On to next season', action: { type: 'advance-season' } }],
  };
}

/** A one-line read on the club's season, for the hub. */
export function seasonRace(cs: CareerState): string {
  return raceNote(cs.standings, teamName(cs), Math.max(0, cs.schedule.length - cs.startIndex));
}

/** Games behind the leader. */
export function behind(cs: CareerState): number {
  return gamesBack(cs.standings, teamName(cs));
}

/** What promotion, if any, this season's numbers have earned. */
export function pendingPromotion(cs: CareerState): Level | null {
  if (cs.level === 'COLLEGE' || cs.level === 'MLB') return null;
  if (cs.season.starts === 0) return null;
  const e = era(cs.season);
  const k9 = kPerNine(cs.season);
  if (cs.level === 'AA' && (e < 4.0 || k9 > 9.5)) return 'AAA';
  if (cs.level === 'AAA' && (e < 3.7 || k9 > 9.0)) return 'MLB';
  return null;
}

// ---------------------------------------------------------------------------
// The reducer: scene choices and completed starts are the only inputs.
// ---------------------------------------------------------------------------

export function applyChoice(cs: CareerState, scene: Scene, choice: SceneChoice): CareerState {
  let next: CareerState = { ...cs, sceneQueue: cs.sceneQueue.filter((s) => s !== scene.id) };

  if (choice.effects) {
    if (choice.effects.xp) next = { ...next, xp: next.xp + choice.effects.xp };
    if (choice.effects.ratings) {
      const r: Ratings = { ...next.player.ratings };
      for (const [k, v] of Object.entries(choice.effects.ratings)) {
        r[k as keyof Ratings] = Math.min(99, r[k as keyof Ratings] + (v ?? 0));
      }
      next = { ...next, player: { ...next.player, ratings: r } };
    }
    if (choice.effects.flags) next = { ...next, flags: { ...next.flags, ...choice.effects.flags } };
    if (choice.effects.rep) {
      next = { ...next, reputation: applyRep(next.reputation, choice.effects.rep) };
    }
  }

  return applyAction(next, choice.action);
}

function applyAction(cs: CareerState, action: SceneAction): CareerState {
  switch (action.type) {
    case 'continue':
      return cs;
    case 'goto-scene':
      return { ...cs, sceneQueue: [action.sceneId, ...cs.sceneQueue] };
    case 'commit-college': {
      const next: CareerState = {
        ...cs,
        path: 'college',
        level: 'COLLEGE',
        collegeId: action.collegeId,
        collegeYear: 1,
        sceneQueue: [...cs.sceneQueue, 'college-arrival', 'first-start'],
      };
      return {
        ...next,
        schedule: buildSchedule(next, 'COLLEGE'),
        standings: newStandings(rivalsFor(next, 'COLLEGE')),
      };
    }
    case 'sign-pro': {
      const rng = makeRng(cs.rngSeed + 3);
      const orgId = PRO_TEAMS[Math.floor(rng.next() * PRO_TEAMS.length)].id;
      const next: CareerState = {
        ...cs,
        path: 'pro',
        level: 'AA',
        orgId,
        sceneQueue: [...cs.sceneQueue, 'pro-arrival', 'first-start'],
      };
      return {
        ...next,
        schedule: buildSchedule(next, 'AA'),
        standings: newStandings(rivalsFor(next, 'AA')),
      };
    }
    case 'sign-draft': {
      const d = computeDraft(cs);
      const level: Level = d.toAAA ? 'AAA' : 'AA';
      const archived = archiveSeason(cs);
      const next: CareerState = {
        ...archived,
        orgId: d.teamId,
        level,
        path: 'college',
        age: cs.age + 1,
        seasonYear: cs.seasonYear + 1,
        sceneQueue: [...archived.sceneQueue, 'pro-arrival'],
      };
      return {
        ...next,
        schedule: buildSchedule(next, level),
        standings: newStandings(rivalsFor(next, level)),
      };
    }
    case 'advance-season': {
      const promo = pendingPromotion(cs);
      const archived = archiveSeason(cs);
      let level = cs.level;
      let queue = [...archived.sceneQueue];
      let collegeYear = cs.collegeYear;

      if (cs.level === 'COLLEGE') {
        collegeYear = cs.collegeYear + 1;
      } else if (promo === 'AAA') {
        level = 'AAA';
        queue.push('callup-aaa');
      } else if (promo === 'MLB') {
        level = 'MLB';
        queue.push('callup-mlb', 'mlb-debut');
      }
      if (cs.level === 'MLB' && era(cs.season) < 3.0 && cs.season.starts >= SEASON_LENGTH.MLB) {
        queue.push('award');
      }

      const next: CareerState = {
        ...archived,
        level,
        collegeYear,
        age: cs.age + 1,
        seasonYear: cs.seasonYear + 1,
        sceneQueue: queue,
      };
      return {
        ...next,
        schedule: buildSchedule(next, level),
        standings: newStandings(rivalsFor(next, level)),
      };
    }
  }
}

function archiveSeason(cs: CareerState): CareerState {
  const record: SeasonRecord = {
    label: `Year ${cs.seasonYear}`,
    level: cs.level,
    team: teamName(cs),
    totals: cs.season,
  };
  return {
    ...cs,
    history: [...cs.history, record],
    season: emptyTotals(),
    seasonLines: [],
    startIndex: 0,
    flags: { ...cs.flags, roughPatchSeen: false },
  };
}

/** Record a finished start and queue whatever stories it earns. */
export function recordStart(cs: CareerState, line: StartLine): CareerState {
  const season = addLine(cs.season, line);
  const xp = Math.round(
    xpForStart(line) *
      (cs.level === 'COLLEGE' && cs.collegeId && collegeById(cs.collegeId).perk === 'coaching'
        ? 1.65
        : cs.level === 'COLLEGE'
          ? 1.4
          : 1) *
      xpMultiplier(cs.reputation),
  );

  const queue = [...cs.sceneQueue];
  const gem = line.strikeouts >= 10 || (line.outs >= 21 && line.runs <= 1);
  if (gem && !queue.includes('gem')) queue.push('gem');
  if (
    season.starts >= 3 &&
    era(season) > 6 &&
    !cs.flags.roughPatchSeen &&
    !queue.includes('rough-patch')
  ) {
    queue.push('rough-patch');
  }

  // Your club plays four more games between this start and your next one.
  const standings = advanceLeague(
    cs.standings,
    cs.rngSeed + cs.seasonYear * 977 + cs.startIndex * 31,
    line.decision === 'W' ? true : line.decision === 'L' ? false : null,
    teamStrength(cs),
  );

  const startIndex = cs.startIndex + 1;
  const seasonDone = startIndex >= cs.schedule.length;
  if (seasonDone) {
    if (cs.level === 'COLLEGE' && cs.collegeYear >= 3) queue.push('draft-day');
    else queue.push('season-end');
  }

  return {
    ...cs,
    season,
    standings,
    seasonLines: [...cs.seasonLines, line],
    xp: cs.xp + xp,
    startIndex,
    flags: {
      ...cs.flags,
      roughPatchSeen: cs.flags.roughPatchSeen === true || queue.includes('rough-patch'),
      lastStartXp: xp,
    },
    sceneQueue: queue,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const SAVE_KEY = 'pitchers-duel-career';

export function saveCareer(cs: CareerState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cs));
  } catch {
    // Private browsing or quota — the game keeps running unsaved.
  }
}

export function loadCareer(): CareerState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const cs = JSON.parse(raw) as CareerState;
    return cs.version === 1 ? migrate(cs) : null;
  } catch {
    return null;
  }
}

export function clearCareer(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do.
  }
}

// ---------------------------------------------------------------------------
// Save codes
//
// localStorage is one browser on one machine, and clearing site data takes a
// career with it. A save code is the whole state as text the player can copy
// somewhere safe and paste into any other browser.
// ---------------------------------------------------------------------------

/** Encode to base64 with full Unicode support — team names carry accents. */
export function exportCode(cs: CareerState): string {
  const json = JSON.stringify(cs);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export class SaveCodeError extends Error {}

export function importCode(code: string): CareerState {
  let parsed: unknown;
  try {
    const binary = atob(code.trim().replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SaveCodeError('That does not look like a save code.');
  }
  if (!isCareerState(parsed)) {
    throw new SaveCodeError('That code is from an incompatible version.');
  }
  return parsed;
}

/** Structural check, so a corrupt or foreign code cannot crash the game. */
function isCareerState(v: unknown): v is CareerState {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Partial<CareerState>;
  return (
    c.version === 1 &&
    typeof c.xp === 'number' &&
    typeof c.seasonYear === 'number' &&
    typeof c.startIndex === 'number' &&
    Array.isArray(c.schedule) &&
    Array.isArray(c.history) &&
    Array.isArray(c.sceneQueue) &&
    typeof c.player === 'object' &&
    c.player !== null &&
    Array.isArray((c.player as PlayerPitcher).arsenal) &&
    typeof (c.player as PlayerPitcher).ratings === 'object'
  );
}

/**
 * Fill in anything a save from an older build is missing, so adding a feature
 * never orphans somebody's career.
 */
export function migrate(cs: CareerState): CareerState {
  return {
    ...cs,
    reputation: cs.reputation ?? NEUTRAL,
    standings: cs.standings ?? newStandings([]),
    flags: cs.flags ?? {},
    seasonLines: cs.seasonLines ?? [],
  };
}
