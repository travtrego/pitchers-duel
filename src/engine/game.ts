import { batterAt } from './batters';
import { computeDeception, computeGuess, swingProbability } from './batterAI';
import { getPitch } from './pitches';
import {
  executePitch,
  foulProbability,
  resolveContact,
  timingError,
  whiffProbability,
  type ContactResult,
  type Execution,
} from './resolve';
import type { Rng } from './rng';
import { makeRng } from './rng';
import type {
  Bases,
  Batter,
  BattedBallKind,
  GameState,
  Guess,
  MeterResult,
  PitchCall,
  PitchOutcome,
} from './types';
import { clamp01, umpireCallsStrike } from './zone';

export const STAMINA_PER_PITCH = 0.009;

export function newGame(): GameState {
  return {
    inning: 1,
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [false, false, false],
    runs: 0,
    hits: 0,
    walks: 0,
    strikeouts: 0,
    batterIndex: 0,
    pitcher: { pitchCount: 0, stamina: 1 },
    memory: [],
    log: [],
    inningOver: false,
  };
}

export function currentBatter(state: GameState): Batter {
  return batterAt(state.batterIndex);
}

/** What the hitter is sitting on right now. Exposed so the UI can hint at it. */
export function currentGuess(state: GameState): Guess {
  return computeGuess(currentBatter(state), state.memory, state.balls, state.strikes);
}

interface BaseAdvance {
  bases: Bases;
  runs: number;
}

export function walkRunners(bases: Bases): BaseAdvance {
  const b: Bases = [...bases];
  if (!b[0]) {
    b[0] = true;
    return { bases: b, runs: 0 };
  }
  if (!b[1]) {
    b[1] = true;
    return { bases: b, runs: 0 };
  }
  if (!b[2]) {
    b[2] = true;
    return { bases: b, runs: 0 };
  }
  return { bases: b, runs: 1 };
}

export function advanceOnHit(
  bases: Bases,
  hitBases: number,
  speed: number,
  rng: Rng,
): BaseAdvance {
  const out: Bases = [false, false, false];
  let runs = 0;

  if (hitBases >= 4) {
    return { bases: out, runs: 1 + bases.filter(Boolean).length };
  }

  if (hitBases === 3) {
    runs = bases.filter(Boolean).length;
    out[2] = true;
    return { bases: out, runs };
  }

  if (hitBases === 2) {
    if (bases[2]) runs++;
    if (bases[1]) runs++;
    if (bases[0]) {
      if (rng.chance(0.45 + speed * 0.2)) runs++;
      else out[2] = true;
    }
    out[1] = true;
    return { bases: out, runs };
  }

  // Single.
  if (bases[2]) runs++;
  if (bases[1]) {
    if (rng.chance(0.55 + speed * 0.2)) runs++;
    else out[2] = true;
  }
  if (bases[0]) {
    if (!out[2] && rng.chance(0.26)) out[2] = true;
    else out[1] = true;
  }
  out[0] = true;
  return { bases: out, runs };
}

interface OutResult {
  bases: Bases;
  runs: number;
  outs: number;
  kind: BattedBallKind;
}

function resolveOut(
  bases: Bases,
  outsBefore: number,
  contact: ContactResult,
  batter: Batter,
  rng: Rng,
): OutResult {
  const b: Bases = [...bases];

  if (contact.trajectory === 'ground') {
    if (b[0] && outsBefore < 2 && rng.chance(0.44 * (1 - batter.speed * 0.5))) {
      b[0] = false;
      // With nobody out the run from third scores ahead of the second out;
      // with one out the double play ends the inning and it does not.
      let runs = 0;
      if (b[2] && outsBefore === 0) {
        b[2] = false;
        runs = 1;
      }
      if (b[1]) {
        b[1] = false;
        b[2] = true;
      }
      return { bases: b, runs, outs: 2, kind: 'double_play' };
    }
    let runs = 0;
    if (b[2] && outsBefore < 2 && rng.chance(0.55)) {
      b[2] = false;
      runs = 1;
    }
    if (b[0]) {
      // Runner moves up on the play often enough to matter.
      if (!b[1] && rng.chance(0.5)) {
        b[0] = false;
        b[1] = true;
      }
    }
    return { bases: b, runs, outs: 1, kind: 'groundout' };
  }

  if (contact.trajectory === 'line') {
    return { bases: b, runs: 0, outs: 1, kind: 'lineout' };
  }

  if (contact.trajectory === 'popup') {
    return { bases: b, runs: 0, outs: 1, kind: 'popout' };
  }

  // Fly ball. Deep enough to score a runner from third with less than two outs.
  if (b[2] && outsBefore < 2 && rng.chance(0.55 + contact.quality * 0.3)) {
    b[2] = false;
    return { bases: b, runs: 1, outs: 1, kind: 'sac_fly' };
  }
  return { bases: b, runs: 0, outs: 1, kind: 'flyout' };
}

function hitName(hitBases: number): BattedBallKind {
  if (hitBases >= 4) return 'home_run';
  if (hitBases === 3) return 'triple';
  if (hitBases === 2) return 'double';
  return 'single';
}

const TRAJECTORY_WORD: Record<string, string> = {
  ground: 'ground ball',
  line: 'line drive',
  fly: 'fly ball',
  popup: 'pop up',
};

function describe(
  outcome: Omit<PitchOutcome, 'description'>,
  batter: Batter,
  contact: ContactResult | null,
): string {
  const pitch = getPitch(outcome.pitchId);
  const velo = `${pitch.abbrev} ${Math.round(outcome.velo)}`;
  switch (outcome.kind) {
    case 'ball':
      return `${velo} — ball${outcome.hung ? ', hung but off the plate' : ''}.`;
    case 'called_strike':
      return outcome.deception > 0.45
        ? `${velo} — called strike, ${batter.name} froze.`
        : `${velo} — called strike.`;
    case 'swinging_strike':
      return `${velo} — swing and miss.`;
    case 'foul':
      return `${velo} — fouled off.`;
    case 'in_play': {
      const word = contact ? TRAJECTORY_WORD[contact.trajectory] : 'ball in play';
      switch (outcome.batted) {
        case 'home_run':
          return `${velo} — ${outcome.hung ? 'hung, and it is gone. ' : ''}HOME RUN, ${batter.name}.`;
        case 'triple':
          return `${velo} — triple into the gap.`;
        case 'double':
          return `${velo} — double, ${word}.`;
        case 'single':
          return `${velo} — single on a ${word}.`;
        case 'double_play':
          return `${velo} — ${word}, turned two.`;
        case 'sac_fly':
          return `${velo} — sacrifice fly, run scores.`;
        default:
          return `${velo} — ${word}, out.`;
      }
    }
  }
}

export interface ThrowResult {
  state: GameState;
  outcome: PitchOutcome;
  /** Set when this pitch ended the plate appearance. */
  paResult?: 'strikeout' | 'walk' | 'in_play';
  /** Diagnostics the UI can show after the pitch. */
  debug: { guess: Guess; deception: number; swingProb: number; exec: Execution };
}

/**
 * Throw one pitch and advance the game.
 *
 * Returns a new state rather than mutating, so the UI can keep the previous
 * frame around for animation and the tests can replay from a fixture.
 */
export function throwPitch(
  state: GameState,
  call: PitchCall,
  meter: MeterResult,
  rng: Rng = makeRng(Date.now()),
): ThrowResult {
  const batter = currentBatter(state);
  const pitch = getPitch(call.pitchId);
  const guess = computeGuess(batter, state.memory, state.balls, state.strikes);
  const exec = executePitch(call, meter, state.pitcher, rng);
  const deception = computeDeception(pitch, guess, batter, exec.velo);
  const swingProb = swingProbability(
    exec.actual,
    pitch,
    batter,
    guess,
    deception,
    exec.inZone,
    state.balls,
    state.strikes,
  );

  const next: GameState = {
    ...state,
    bases: [...state.bases] as Bases,
    memory: [...state.memory],
    log: [...state.log],
    pitcher: { ...state.pitcher },
  };

  next.pitcher.pitchCount += 1;
  next.pitcher.stamina = clamp01(1 - next.pitcher.pitchCount * STAMINA_PER_PITCH);
  next.memory.push({
    pitchId: call.pitchId,
    loc: exec.actual,
    thisPlateAppearance: true,
  });

  const swung = rng.chance(swingProb);
  let contact: ContactResult | null = null;
  let kind: PitchOutcome['kind'];
  let batted: BattedBallKind | undefined;
  let runsScored = 0;
  let outsRecorded = 0;
  let paResult: ThrowResult['paResult'];

  if (!swung) {
    kind = umpireCallsStrike(exec.actual, rng.next()) ? 'called_strike' : 'ball';
  } else {
    const timing = timingError(exec, guess, batter, deception);
    if (rng.chance(whiffProbability(exec, batter, call.pitchId, timing))) {
      kind = 'swinging_strike';
    } else {
      contact = resolveContact(exec, batter, call.pitchId, timing, rng);
      if (rng.chance(foulProbability(contact.quality, batter, state.strikes))) {
        kind = 'foul';
      } else {
        kind = 'in_play';
      }
    }
  }

  if (kind === 'ball') {
    next.balls += 1;
    if (next.balls >= 4) {
      const adv = walkRunners(next.bases);
      next.bases = adv.bases;
      runsScored = adv.runs;
      next.runs += adv.runs;
      next.walks += 1;
      paResult = 'walk';
    }
  } else if (kind === 'called_strike' || kind === 'swinging_strike') {
    next.strikes += 1;
    if (next.strikes >= 3) {
      outsRecorded = 1;
      next.outs += 1;
      next.strikeouts += 1;
      paResult = 'strikeout';
    }
  } else if (kind === 'foul') {
    if (next.strikes < 2) next.strikes += 1;
  } else if (kind === 'in_play' && contact) {
    paResult = 'in_play';
    if (contact.hitBases > 0) {
      const adv = advanceOnHit(next.bases, contact.hitBases, batter.speed, rng);
      next.bases = adv.bases;
      runsScored = adv.runs;
      next.runs += adv.runs;
      next.hits += 1;
      batted = hitName(contact.hitBases);
    } else {
      const res = resolveOut(next.bases, next.outs, contact, batter, rng);
      const outsAfter = Math.min(3, next.outs + res.outs);
      outsRecorded = outsAfter - next.outs;
      next.outs = outsAfter;
      next.bases = res.bases;
      // Runs never count when the third out is recorded on the same play.
      runsScored = next.outs >= 3 ? 0 : res.runs;
      next.runs += runsScored;
      batted = res.kind;
    }
  }

  if (paResult) {
    next.balls = 0;
    next.strikes = 0;
    next.batterIndex += 1;
    // The next hitter watched from the on-deck circle but did not live it.
    next.memory = next.memory.map((m) => ({ ...m, thisPlateAppearance: false }));
  }

  if (next.outs >= 3) {
    next.outs = 3;
    next.inningOver = true;
  }

  const partial: Omit<PitchOutcome, 'description'> = {
    pitchId: call.pitchId,
    aim: call.aim,
    actual: exec.actual,
    velo: exec.velo,
    inZone: exec.inZone,
    hung: exec.hung,
    decision: swung ? 'swing' : 'take',
    kind,
    batted,
    contactQuality: contact?.quality,
    deception,
    runsScored,
    outsRecorded,
  };
  const outcome: PitchOutcome = {
    ...partial,
    description: describe(partial, batter, contact),
  };
  next.log.push(outcome);

  return { state: next, outcome, paResult, debug: { guess, deception, swingProb, exec } };
}
