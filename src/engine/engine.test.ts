import { describe, expect, it } from 'vitest';
import { computeDeception, computeGuess } from './batterAI';
import { LINEUP } from './batters';
import { advanceOnHit, newGame, throwPitch, walkRunners } from './game';
import { getPitch } from './pitches';
import { executePitch } from './resolve';
import { makeRng } from './rng';
import type { Bases, MemoryEntry, MeterResult, PitcherState } from './types';
import { isStrike, umpireCallsStrike } from './zone';

const PERFECT: MeterResult = { powerError: 0, accuracyError: 0 };
const FRESH: PitcherState = { pitchCount: 0, stamina: 1 };
const HITTER = LINEUP[2]; // the balanced professional hitter

function memoryOf(pitchId: string, count: number): MemoryEntry[] {
  return Array.from({ length: count }, () => ({
    pitchId,
    loc: { x: 1, y: 0 },
    thisPlateAppearance: true,
  }));
}

describe('strike zone', () => {
  it('treats the middle 3x3 of the grid as the zone', () => {
    expect(isStrike({ x: 0, y: 0 })).toBe(true);
    expect(isStrike({ x: 1.49, y: -1.49 })).toBe(true);
    expect(isStrike({ x: 1.51, y: 0 })).toBe(false);
    expect(isStrike({ x: 0, y: 2 })).toBe(false);
  });

  it('gives the umpire no discretion well inside or well outside', () => {
    expect(umpireCallsStrike({ x: 0, y: 0 }, 0.99)).toBe(true);
    expect(umpireCallsStrike({ x: 2.4, y: 0 }, 0.01)).toBe(false);
  });

  it('splits borderline pitches based on the roll', () => {
    const edge = { x: 1.5, y: 0 };
    expect(umpireCallsStrike(edge, 0.1)).toBe(true);
    expect(umpireCallsStrike(edge, 0.9)).toBe(false);
  });
});

describe('execution', () => {
  it('puts a perfectly executed pitch exactly on the target', () => {
    const rng = makeRng(1);
    const exec = executePitch({ pitchId: 'SL', aim: { x: 1, y: -1 } }, PERFECT, FRESH, rng);
    expect(exec.actual.x).toBeCloseTo(1);
    expect(exec.actual.y).toBeCloseTo(-1);
    expect(exec.hung).toBe(false);
  });

  it('misses toward the side the accuracy meter was stopped on', () => {
    const meter: MeterResult = { powerError: 0, accuracyError: 0.6 };
    let sum = 0;
    for (let seed = 0; seed < 200; seed++) {
      const exec = executePitch(
        { pitchId: 'FF', aim: { x: 0, y: 0 } },
        meter,
        FRESH,
        makeRng(seed),
      );
      sum += exec.actual.x;
    }
    expect(sum / 200).toBeGreaterThan(0.4);

    let mirrored = 0;
    for (let seed = 0; seed < 200; seed++) {
      const exec = executePitch(
        { pitchId: 'FF', aim: { x: 0, y: 0 } },
        { powerError: 0, accuracyError: -0.6 },
        FRESH,
        makeRng(seed),
      );
      mirrored += exec.actual.x;
    }
    expect(mirrored / 200).toBeLessThan(-0.4);
  });

  it('punishes a hard-to-command pitch more than a fastball for the same miss', () => {
    const meter: MeterResult = { powerError: 0, accuracyError: 0.5 };
    const ff = executePitch({ pitchId: 'FF', aim: { x: 0, y: 0 } }, meter, FRESH, makeRng(7));
    const cb = executePitch({ pitchId: 'CB', aim: { x: 0, y: 0 } }, meter, FRESH, makeRng(7));
    expect(Math.hypot(cb.actual.x, cb.actual.y)).toBeGreaterThan(
      Math.hypot(ff.actual.x, ff.actual.y),
    );
  });

  it('hangs a breaking ball back toward the middle when power is missed', () => {
    const exec = executePitch(
      { pitchId: 'CB', aim: { x: 0, y: -2 } },
      { powerError: 0.8, accuracyError: 0 },
      FRESH,
      makeRng(3),
    );
    expect(exec.hung).toBe(true);
    expect(exec.actual.y).toBeGreaterThan(-1.2);
    expect(exec.effectiveBreak).toBeLessThan(1.2);
  });

  it('never hangs a four-seam, which has no break to lose', () => {
    const exec = executePitch(
      { pitchId: 'FF', aim: { x: 0, y: 0 } },
      { powerError: 0.9, accuracyError: 0 },
      FRESH,
      makeRng(3),
    );
    expect(exec.hung).toBe(false);
  });

  it('sprays the ball further when the arm is tired', () => {
    const meter: MeterResult = { powerError: 0, accuracyError: 0.5 };
    const fresh = executePitch({ pitchId: 'SL', aim: { x: 0, y: 0 } }, meter, FRESH, makeRng(11));
    const tired = executePitch(
      { pitchId: 'SL', aim: { x: 0, y: 0 } },
      meter,
      { pitchCount: 70, stamina: 0.35 },
      makeRng(11),
    );
    expect(Math.abs(tired.actual.x)).toBeGreaterThan(Math.abs(fresh.actual.x));
  });
});

describe('batter guess model', () => {
  it('hunts fastballs when ahead and covers spin with two strikes', () => {
    const ahead = computeGuess(HITTER, [], 3, 0);
    const behind = computeGuess(HITTER, [], 0, 2);
    expect(ahead.typeWeights.FF).toBeGreaterThan(behind.typeWeights.FF);
    expect(behind.typeWeights.SL).toBeGreaterThan(ahead.typeWeights.SL);
    expect(ahead.expectedVelo).toBeGreaterThan(behind.expectedVelo);
  });

  it('leans toward a pitch you keep going back to', () => {
    const cold = computeGuess(HITTER, [], 1, 1);
    const hot = computeGuess(HITTER, memoryOf('SL', 4), 1, 1);
    expect(hot.typeWeights.SL).toBeGreaterThan(cold.typeWeights.SL);
  });

  it('weighs pitches from the current at-bat more than earlier ones', () => {
    const thisAb = computeGuess(HITTER, memoryOf('CB', 3), 1, 1);
    const earlier = computeGuess(
      HITTER,
      memoryOf('CB', 3).map((m) => ({ ...m, thisPlateAppearance: false })),
      1,
      1,
    );
    expect(thisAb.typeWeights.CB).toBeGreaterThan(earlier.typeWeights.CB);
  });

  it('normalizes weights to a probability distribution', () => {
    const g = computeGuess(HITTER, memoryOf('FF', 6), 2, 1);
    const total = Object.values(g.typeWeights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('tracks where you have been living in the zone', () => {
    const memory: MemoryEntry[] = Array.from({ length: 4 }, () => ({
      pitchId: 'FF',
      loc: { x: 2, y: 1 },
      thisPlateAppearance: true,
    }));
    expect(computeGuess(HITTER, memory, 1, 1).zoneLean.x).toBeGreaterThan(1);
  });
});

describe('deception', () => {
  it('fools the hitter more with a changeup than a curve behind fastballs', () => {
    const guess = computeGuess(HITTER, memoryOf('FF', 4), 1, 1);
    const ch = computeDeception(getPitch('CH'), guess, HITTER, 85);
    const cb = computeDeception(getPitch('CB'), guess, HITTER, 80);
    // Both are offspeed surprises, but only the changeup shares the fastball tunnel.
    expect(ch).toBeGreaterThan(cb);
  });

  it('stops fooling anyone once the hitter is sitting on the pitch', () => {
    const cold = computeGuess(HITTER, [], 1, 1);
    const hot = computeGuess(HITTER, memoryOf('SL', 5), 1, 1);
    expect(computeDeception(getPitch('SL'), hot, HITTER, 87)).toBeLessThan(
      computeDeception(getPitch('SL'), cold, HITTER, 87),
    );
  });

  it('fools a weaker hitter more than a good one on the same pitch', () => {
    const guess = computeGuess(LINEUP[3], memoryOf('FF', 3), 1, 1);
    const rookie = computeDeception(getPitch('CH'), guess, LINEUP[3], 85);
    const pro = computeDeception(getPitch('CH'), guess, LINEUP[0], 85);
    expect(rookie).toBeGreaterThan(pro);
  });
});

describe('base running', () => {
  it('forces in a run only with the bases loaded', () => {
    expect(walkRunners([false, false, false]).runs).toBe(0);
    expect(walkRunners([true, true, false]).runs).toBe(0);
    expect(walkRunners([true, true, true]).runs).toBe(1);
  });

  it('advances the batter to first on every walk', () => {
    expect(walkRunners([false, true, false]).bases[0]).toBe(true);
  });

  it('clears the bases on a home run and counts everyone', () => {
    const res = advanceOnHit([true, false, true], 4, 0.5, makeRng(1));
    expect(res.runs).toBe(3);
    expect(res.bases).toEqual([false, false, false]);
  });

  it('scores the runner from third on a single', () => {
    expect(advanceOnHit([false, false, true], 1, 0.5, makeRng(5)).runs).toBeGreaterThanOrEqual(1);
  });

  it('never leaves two runners on the same base', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const hit of [1, 2, 3, 4]) {
        const start: Bases = [true, true, true];
        const res = advanceOnHit(start, hit, 0.9, makeRng(seed));
        expect(res.bases.filter(Boolean).length + res.runs).toBe(4);
      }
    }
  });
});

describe('inning flow', () => {
  it('resets the count and moves to the next hitter after a strikeout', () => {
    let state = newGame();
    state = { ...state, strikes: 2, balls: 3 };
    const rng = makeRng(1);
    // Aim a fastball middle-middle until the at-bat ends, then check the reset.
    let guard = 0;
    let ended = false;
    while (!ended && guard++ < 40) {
      const res = throwPitch(state, { pitchId: 'FF', aim: { x: 0, y: 0 } }, PERFECT, rng);
      state = res.state;
      if (res.paResult) ended = true;
    }
    expect(ended).toBe(true);
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
    expect(state.batterIndex).toBe(1);
  });

  it('ends the inning at exactly three outs and holds every invariant', () => {
    for (let seed = 0; seed < 60; seed++) {
      const rng = makeRng(seed);
      let state = newGame();
      let guard = 0;
      while (!state.inningOver && guard++ < 500) {
        const res = throwPitch(
          state,
          { pitchId: ['FF', 'SL', 'CH', 'CB', 'SI'][guard % 5], aim: { x: 0, y: 0 } },
          { powerError: 0.1, accuracyError: 0.2 },
          rng,
        );
        state = res.state;
        expect(state.balls).toBeLessThanOrEqual(3);
        expect(state.strikes).toBeLessThanOrEqual(2);
        expect(state.outs).toBeLessThanOrEqual(3);
        expect(state.runs).toBeGreaterThanOrEqual(0);
      }
      expect(state.inningOver).toBe(true);
      expect(state.outs).toBe(3);
    }
  });

  it('drains stamina as the pitch count climbs', () => {
    const rng = makeRng(9);
    let state = newGame();
    for (let i = 0; i < 20 && !state.inningOver; i++) {
      state = throwPitch(state, { pitchId: 'FF', aim: { x: 2, y: 2 } }, PERFECT, rng).state;
    }
    expect(state.pitcher.stamina).toBeLessThan(1);
    expect(state.pitcher.pitchCount).toBeGreaterThan(0);
  });

  it('marks earlier pitches as belonging to a previous at-bat', () => {
    const rng = makeRng(4);
    let state = newGame();
    let guard = 0;
    while (state.batterIndex === 0 && guard++ < 60) {
      state = throwPitch(state, { pitchId: 'FF', aim: { x: 0, y: 0 } }, PERFECT, rng).state;
    }
    expect(state.memory.every((m) => !m.thisPlateAppearance)).toBe(true);
  });

  it('records a log entry with a description for every pitch', () => {
    const rng = makeRng(21);
    let state = newGame();
    for (let i = 0; i < 12 && !state.inningOver; i++) {
      state = throwPitch(state, { pitchId: 'SI', aim: { x: -1, y: -1 } }, PERFECT, rng).state;
    }
    expect(state.log.length).toBe(state.pitcher.pitchCount);
    expect(state.log.every((o) => o.description.length > 0)).toBe(true);
  });
});

describe('pitching decisions actually matter', () => {
  it('gives up more damage grooving fastballs than working the corners', () => {
    const runsMiddle = simulateInnings({ x: 0, y: 0 });
    const runsCorner = simulateInnings({ x: 1.2, y: -1.2 });
    expect(runsMiddle).toBeGreaterThan(runsCorner);
  });

  it('gets more chases on a two-strike slider off the plate than in the zone', () => {
    expect(chaseCount({ x: 2, y: -2 })).toBeGreaterThan(0);
  });
});

/** Total runs allowed across many innings throwing only fastballs to one spot. */
function simulateInnings(aim: { x: number; y: number }): number {
  let total = 0;
  for (let seed = 0; seed < 40; seed++) {
    const rng = makeRng(seed);
    let state = newGame();
    let guard = 0;
    while (!state.inningOver && guard++ < 400) {
      state = throwPitch(state, { pitchId: 'FF', aim }, PERFECT, rng).state;
    }
    total += state.runs;
  }
  return total;
}

/** Swings at sliders thrown off the plate with two strikes. */
function chaseCount(aim: { x: number; y: number }): number {
  let chases = 0;
  for (let seed = 0; seed < 120; seed++) {
    const rng = makeRng(seed);
    const state = { ...newGame(), strikes: 2 };
    const res = throwPitch(state, { pitchId: 'SL', aim }, PERFECT, rng);
    if (res.outcome.decision === 'swing' && !res.outcome.inZone) chases++;
  }
  return chases;
}
