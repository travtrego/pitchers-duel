import { describe, expect, it } from 'vitest';
import { computeDeception, computeGuess } from './batterAI';
import { LINEUP } from './batters';
import {
  advanceOnHit,
  currentSituation,
  newGame,
  nextInning,
  throwPitch,
  timesThroughOrder,
  walkRunners,
} from './game';
import { ARSENAL, getPitch } from './pitches';
import { PITCH_CATALOG } from './pitchCatalog';
import {
  ARCHETYPES,
  deriveArsenal,
  derivePitch,
  makePlayer,
  staminaPerPitch,
} from './player';
import { generateLineup } from './opponents';
import {
  CALM,
  effectivePressure,
  makeSituation,
  pressureStaminaScale,
  situationPressure,
} from './pressure';
import { executePitch, resolveContact, whiffProbability } from './resolve';
import { makeRng } from './rng';
import type { Bases, MemoryEntry, MeterResult, PitcherState } from './types';
import { isStrike, umpireCallsStrike } from './zone';

const PERFECT: MeterResult = { powerError: 0, accuracyError: 0 };
const FRESH: PitcherState = { pitchCount: 0, stamina: 1 };
const HITTER = LINEUP[2]; // the balanced professional hitter

function memoryOf(pitchId: string, count: number, batterId = HITTER.id): MemoryEntry[] {
  return Array.from({ length: count }, () => ({
    pitchId,
    loc: { x: 1, y: 0 },
    thisPlateAppearance: true,
    batterId,
  }));
}

/** A situation on the Nth trip through the order, bases empty. */
function look(n: number) {
  return { ...CALM, timesThroughOrder: n };
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

describe('pitch catalog', () => {
  it('has 18 distinct pitches', () => {
    expect(PITCH_CATALOG.length).toBe(18);
    expect(new Set(PITCH_CATALOG.map((p) => p.id)).size).toBe(18);
  });

  it('keeps every offspeed pitch except the knuckleball in the fastball tunnel', () => {
    for (const p of PITCH_CATALOG.filter((x) => x.speedClass === 'offspeed' && !x.flutter)) {
      expect(p.tunnel).toBe('hard');
    }
  });
});

describe('execution', () => {
  it('puts a perfectly executed pitch exactly on the target', () => {
    const rng = makeRng(1);
    const exec = executePitch(getPitch('SL'), { x: 1, y: -1 }, PERFECT, FRESH, rng);
    expect(exec.actual.x).toBeCloseTo(1);
    expect(exec.actual.y).toBeCloseTo(-1);
    expect(exec.hung).toBe(false);
  });

  it('misses toward the side the accuracy meter was stopped on', () => {
    const meter: MeterResult = { powerError: 0, accuracyError: 0.6 };
    let sum = 0;
    for (let seed = 0; seed < 200; seed++) {
      const exec = executePitch(getPitch('FF'), { x: 0, y: 0 }, meter, FRESH, makeRng(seed));
      sum += exec.actual.x;
    }
    expect(sum / 200).toBeGreaterThan(0.4);

    let mirrored = 0;
    for (let seed = 0; seed < 200; seed++) {
      const exec = executePitch(
        getPitch('FF'),
        { x: 0, y: 0 },
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
    const ff = executePitch(getPitch('FF'), { x: 0, y: 0 }, meter, FRESH, makeRng(7));
    const cb = executePitch(getPitch('CB'), { x: 0, y: 0 }, meter, FRESH, makeRng(7));
    expect(Math.hypot(cb.actual.x, cb.actual.y)).toBeGreaterThan(
      Math.hypot(ff.actual.x, ff.actual.y),
    );
  });

  it('hangs a breaking ball back toward the middle when power is missed', () => {
    const exec = executePitch(
      getPitch('CB'),
      { x: 0, y: -2 },
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
      getPitch('FF'),
      { x: 0, y: 0 },
      { powerError: 0.9, accuracyError: 0 },
      FRESH,
      makeRng(3),
    );
    expect(exec.hung).toBe(false);
  });

  it('sprays the ball further when the arm is tired', () => {
    const meter: MeterResult = { powerError: 0, accuracyError: 0.5 };
    const fresh = executePitch(getPitch('SL'), { x: 0, y: 0 }, meter, FRESH, makeRng(11));
    const tired = executePitch(
      getPitch('SL'),
      { x: 0, y: 0 },
      meter,
      { pitchCount: 70, stamina: 0.35 },
      makeRng(11),
    );
    expect(Math.abs(tired.actual.x)).toBeGreaterThan(Math.abs(fresh.actual.x));
  });

  it('wanders a knuckleball even on a perfect meter', () => {
    let moved = 0;
    for (let seed = 0; seed < 50; seed++) {
      const exec = executePitch(getPitch('KN'), { x: 0, y: 0 }, PERFECT, FRESH, makeRng(seed));
      moved += Math.hypot(exec.actual.x, exec.actual.y);
    }
    expect(moved / 50).toBeGreaterThan(0.3);
  });
});

describe('batter guess model', () => {
  it('hunts fastballs when ahead and covers spin with two strikes', () => {
    const ahead = computeGuess(HITTER, [], 3, 0, ARSENAL);
    const behind = computeGuess(HITTER, [], 0, 2, ARSENAL);
    expect(ahead.typeWeights.FF).toBeGreaterThan(behind.typeWeights.FF);
    expect(behind.typeWeights.SL).toBeGreaterThan(ahead.typeWeights.SL);
    expect(ahead.expectedVelo).toBeGreaterThan(behind.expectedVelo);
  });

  it('leans toward a pitch you keep going back to', () => {
    const cold = computeGuess(HITTER, [], 1, 1, ARSENAL);
    const hot = computeGuess(HITTER, memoryOf('SL', 4), 1, 1, ARSENAL);
    expect(hot.typeWeights.SL).toBeGreaterThan(cold.typeWeights.SL);
  });

  it('weighs pitches from the current at-bat more than earlier ones', () => {
    const thisAb = computeGuess(HITTER, memoryOf('CB', 3), 1, 1, ARSENAL);
    const earlier = computeGuess(
      HITTER,
      memoryOf('CB', 3).map((m) => ({ ...m, thisPlateAppearance: false })),
      1,
      1,
      ARSENAL,
    );
    expect(thisAb.typeWeights.CB).toBeGreaterThan(earlier.typeWeights.CB);
  });

  it('normalizes weights to a probability distribution', () => {
    const g = computeGuess(HITTER, memoryOf('FF', 6), 2, 1, ARSENAL);
    const total = Object.values(g.typeWeights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('tracks where you have been living in the zone', () => {
    const memory: MemoryEntry[] = Array.from({ length: 4 }, () => ({
      pitchId: 'FF',
      loc: { x: 2, y: 1 },
      thisPlateAppearance: true,
      batterId: HITTER.id,
    }));
    expect(computeGuess(HITTER, memory, 1, 1, ARSENAL).zoneLean.x).toBeGreaterThan(1);
  });
});

describe('deception', () => {
  it('fools the hitter more with a changeup than a curve behind fastballs', () => {
    const guess = computeGuess(HITTER, memoryOf('FF', 4), 1, 1, ARSENAL);
    const ch = computeDeception(getPitch('CH'), guess, HITTER, 85, ARSENAL);
    const cb = computeDeception(getPitch('CB'), guess, HITTER, 80, ARSENAL);
    // Both are offspeed surprises, but only the changeup shares the fastball tunnel.
    expect(ch).toBeGreaterThan(cb);
  });

  it('stops fooling anyone once the hitter is sitting on the pitch', () => {
    const cold = computeGuess(HITTER, [], 1, 1, ARSENAL);
    const hot = computeGuess(HITTER, memoryOf('SL', 5), 1, 1, ARSENAL);
    expect(computeDeception(getPitch('SL'), hot, HITTER, 87, ARSENAL)).toBeLessThan(
      computeDeception(getPitch('SL'), cold, HITTER, 87, ARSENAL),
    );
  });

  it('fools a weaker hitter more than a good one on the same pitch', () => {
    const guess = computeGuess(LINEUP[3], memoryOf('FF', 3), 1, 1, ARSENAL);
    const rookie = computeDeception(getPitch('CH'), guess, LINEUP[3], 85, ARSENAL);
    const pro = computeDeception(getPitch('CH'), guess, LINEUP[0], 85, ARSENAL);
    expect(rookie).toBeGreaterThan(pro);
  });
});

describe('created pitchers', () => {
  it('derives a hotter fastball for a bigger arm', () => {
    const flame = makePlayer('A', 'R', 'flamethrower', ['FF', 'SL', 'CH']);
    const surgeon = makePlayer('B', 'R', 'surgeon', ['FF', 'SL', 'CH']);
    const ff1 = derivePitch(flame.arsenal[0], flame.ratings);
    const ff2 = derivePitch(surgeon.arsenal[0], surgeon.ratings);
    expect(ff1.velo).toBeGreaterThan(ff2.velo);
    // And the surgeon commands it far better.
    expect(ff2.accuracyWindow).toBeGreaterThan(ff1.accuracyWindow);
  });

  it('mirrors break for a lefty', () => {
    const righty = makePlayer('R', 'R', 'workhorse', ['SL', 'FF', 'CH']);
    const lefty = makePlayer('L', 'L', 'workhorse', ['SL', 'FF', 'CH']);
    expect(deriveArsenal(righty)[0].break.x).toBeGreaterThan(0);
    expect(deriveArsenal(lefty)[0].break.x).toBeLessThan(0);
  });

  it('drains a low-stamina arm faster', () => {
    const horse = makePlayer('H', 'R', 'workhorse', ['FF', 'SL', 'CH']);
    const flame = makePlayer('F', 'R', 'flamethrower', ['FF', 'SL', 'CH']);
    expect(staminaPerPitch(horse)).toBeLessThan(staminaPerPitch(flame));
  });

  it('offers four archetypes with distinct identities', () => {
    expect(ARCHETYPES.length).toBe(4);
    const velos = ARCHETYPES.map((a) => a.ratings.velocity);
    expect(new Set(velos).size).toBeGreaterThan(2);
  });
});

describe('generated lineups', () => {
  it('produces nine hitters shaped like a batting order', () => {
    const order = generateLineup(42, 0.6, 'Test');
    expect(order.length).toBe(9);
    // Heart of the order out-slugs the bottom.
    const heart = (order[2].power + order[3].power) / 2;
    const bottom = (order[7].power + order[8].power) / 2;
    expect(heart).toBeGreaterThan(bottom);
  });

  it('is deterministic for a seed', () => {
    expect(generateLineup(7, 0.5, 'X')[0].name).toBe(generateLineup(7, 0.5, 'X')[0].name);
  });
});

describe('times through the order', () => {
  it('builds a hitter’s book only from pitches he personally saw', () => {
    const his = computeGuess(HITTER, memoryOf('SL', 5, HITTER.id), 1, 1, ARSENAL);
    const someoneElses = computeGuess(HITTER, memoryOf('SL', 5, 'other-guy'), 1, 1, ARSENAL);
    expect(his.typeWeights.SL).toBeGreaterThan(someoneElses.typeWeights.SL);
  });

  it('climbs familiarity with each trip to the plate', () => {
    const first = computeGuess(HITTER, [], 0, 0, ARSENAL, look(1));
    const third = computeGuess(HITTER, [], 0, 0, ARSENAL, look(3));
    expect(third.familiarity).toBeGreaterThan(first.familiarity);
    expect(third.timesFaced).toBe(3);
  });

  it('burns off deception by the third look', () => {
    const memory = memoryOf('FF', 6);
    const first = computeGuess(HITTER, memory, 1, 1, ARSENAL, look(1));
    const third = computeGuess(HITTER, memory, 1, 1, ARSENAL, look(3));
    expect(computeDeception(getPitch('CH'), third, HITTER, 85, ARSENAL)).toBeLessThan(
      computeDeception(getPitch('CH'), first, HITTER, 85, ARSENAL),
    );
  });

  it('leaves the knuckleball alone — there is nothing to learn', () => {
    const memory = memoryOf('KN', 6);
    const arsenal = [getPitch('KN'), getPitch('FF')];
    const first = computeGuess(HITTER, memory, 1, 1, arsenal, look(1));
    const third = computeGuess(HITTER, memory, 1, 1, arsenal, look(3));
    const a = computeDeception(getPitch('KN'), first, HITTER, 76, arsenal);
    const b = computeDeception(getPitch('KN'), third, HITTER, 76, arsenal);
    expect(b).toBeCloseTo(a, 5);
  });

  it('dries up whiffs and sharpens contact as familiarity grows', () => {
    const exec = executePitch(getPitch('SL'), { x: 1.2, y: -1.2 }, PERFECT, FRESH, makeRng(2));
    const cold = whiffProbability(exec, HITTER, getPitch('SL'), 0.5, 0);
    const known = whiffProbability(exec, HITTER, getPitch('SL'), 0.5, 0.8);
    expect(known).toBeLessThan(cold);

    const coldQ = resolveContact(exec, HITTER, getPitch('SL'), 0.5, makeRng(9), 0).quality;
    const knownQ = resolveContact(exec, HITTER, getPitch('SL'), 0.5, makeRng(9), 0.8).quality;
    expect(knownQ).toBeGreaterThan(coldQ);
  });

  it('counts trips through a real lineup as the order turns over', () => {
    const state = newGame();
    expect(timesThroughOrder(state)).toBe(1);
    expect(timesThroughOrder({ ...state, batterIndex: state.lineup.length })).toBe(2);
    expect(timesThroughOrder({ ...state, batterIndex: state.lineup.length * 2 })).toBe(3);
  });

  it('tags every pitch in memory with who was in the box', () => {
    const rng = makeRng(6);
    let s = newGame();
    for (let i = 0; i < 10 && !s.inningOver; i++) {
      s = throwPitch(s, { pitchId: 'FF', aim: { x: 0, y: 0 } }, PERFECT, rng).state;
    }
    expect(s.memory.length).toBeGreaterThan(0);
    expect(s.memory.every((m) => typeof m.batterId === 'string' && m.batterId.length > 0)).toBe(true);
  });
});

describe('pressure', () => {
  const base = { bases: [false, false, false] as Bases, outs: 1, inning: 1, runDiff: 3, timesThroughOrder: 1 };

  it('is nothing with the bases empty early in a comfortable game', () => {
    expect(situationPressure(base)).toBeLessThan(0.1);
  });

  it('climbs with runners, and further the closer they are to scoring', () => {
    const first = situationPressure({ ...base, bases: [true, false, false] });
    const third = situationPressure({ ...base, bases: [false, false, true] });
    const loaded = situationPressure({ ...base, bases: [true, true, true] });
    expect(third).toBeGreaterThan(first);
    expect(loaded).toBeGreaterThan(third);
  });

  it('eases with two outs and tightens with none', () => {
    const jam = { ...base, bases: [true, true, false] as Bases };
    expect(situationPressure({ ...jam, outs: 2 })).toBeLessThan(situationPressure({ ...jam, outs: 0 }));
  });

  it('tightens late in a one-run game and relaxes in a blowout', () => {
    const jam = { ...base, bases: [false, true, false] as Bases, inning: 8 };
    expect(situationPressure({ ...jam, runDiff: 1 })).toBeGreaterThan(
      situationPressure({ ...jam, runDiff: 7 }),
    );
  });

  it('lets a poised arm feel far less of the same jam', () => {
    const raw = situationPressure({ ...base, bases: [true, true, true], outs: 0, inning: 8, runDiff: 1 });
    expect(effectivePressure(raw, 99)).toBeLessThan(effectivePressure(raw, 25) * 0.55);
  });

  it('never exceeds its bounds', () => {
    const worst = situationPressure({ bases: [true, true, true], outs: 0, inning: 9, runDiff: 0, timesThroughOrder: 3 });
    expect(worst).toBeLessThanOrEqual(1);
    expect(effectivePressure(worst, 25)).toBeLessThanOrEqual(1);
  });

  it('flags the stretch and scoring position', () => {
    const s = makeSituation({ ...base, bases: [true, false, true] }, 60);
    expect(s.stretch).toBe(true);
    expect(s.risp).toBe(true);
    const empty = makeSituation(base, 60);
    expect(empty.stretch).toBe(false);
    expect(empty.risp).toBe(false);
  });

  it('makes hitters more aggressive with men in scoring position', () => {
    const calm = computeGuess(HITTER, [], 1, 1, ARSENAL, CALM);
    const risp = computeGuess(HITTER, [], 1, 1, ARSENAL, {
      ...CALM,
      risp: true,
      stretch: true,
    });
    expect(risp.aggression).toBeGreaterThan(calm.aggression);
  });

  it('charges more stamina for stress pitches', () => {
    expect(pressureStaminaScale(0.8)).toBeGreaterThan(pressureStaminaScale(0));
  });

  it('drains a jam-filled inning harder than a quiet one', () => {
    const quiet = newGame({ composure: 60 });
    const jam = { ...newGame({ composure: 60 }), bases: [true, true, true] as Bases, inning: 8 };
    const rng1 = makeRng(4);
    const rng2 = makeRng(4);
    const afterQuiet = throwPitch(quiet, { pitchId: 'FF', aim: { x: 0, y: 0 } }, PERFECT, rng1).state;
    const afterJam = throwPitch(jam, { pitchId: 'FF', aim: { x: 0, y: 0 } }, PERFECT, rng2).state;
    expect(afterJam.pitcher.stamina).toBeLessThan(afterQuiet.pitcher.stamina);
  });

  it('lets composure show up in the game state', () => {
    const nervous = newGame({ composure: 25 });
    const ice = newGame({ composure: 99 });
    const bases: Bases = [true, true, true];
    expect(currentSituation({ ...ice, bases, inning: 8 }).effective).toBeLessThan(
      currentSituation({ ...nervous, bases, inning: 8 }).effective,
    );
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

  it('rolls to a fresh frame but keeps the arm and the hitters` memory', () => {
    const rng = makeRng(2);
    let state = newGame();
    let guard = 0;
    while (!state.inningOver && guard++ < 300) {
      state = throwPitch(state, { pitchId: 'FF', aim: { x: 1, y: 1 } }, PERFECT, rng).state;
    }
    const before = state;
    const after = nextInning(state);
    expect(after.inning).toBe(before.inning + 1);
    expect(after.outs).toBe(0);
    expect(after.bases).toEqual([false, false, false]);
    expect(after.inningOver).toBe(false);
    expect(after.pitcher.pitchCount).toBe(before.pitcher.pitchCount);
    expect(after.memory.length).toBe(before.memory.length);
    expect(after.runs).toBe(before.runs);
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

  it('runs a full game with a created pitcher against a generated lineup', () => {
    const player = makePlayer('Kid', 'L', 'junkballer', ['SI', 'ST', 'VC']);
    const state0 = newGame({
      arsenal: deriveArsenal(player),
      lineup: generateLineup(5, 0.55, 'Rails'),
      staminaPerPitch: staminaPerPitch(player),
    });
    const rng = makeRng(31);
    let state = state0;
    let guard = 0;
    while (!state.inningOver && guard++ < 500) {
      const id = state.arsenal[guard % state.arsenal.length].id;
      state = throwPitch(state, { pitchId: id, aim: { x: -1, y: -1 } }, PERFECT, rng).state;
    }
    expect(state.inningOver).toBe(true);
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
