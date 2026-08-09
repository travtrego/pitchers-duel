import { describe, expect, it } from 'vitest';
import { makePlayer } from '../engine/player';
import {
  applyChoice,
  buildSchedule,
  getScene,
  newCareer,
  pendingPromotion,
  recordStart,
  SEASON_LENGTH,
  teamName,
  type CareerState,
} from './career';
import { era, finishGame, runsInInning, xpForStart, type StartLine } from './sim';
import { makeRng } from '../engine/rng';
import { COLLEGES, PRO_TEAMS } from './teams';

function freshCareer(): CareerState {
  return newCareer(makePlayer('Kid Cassidy', 'R', 'flamethrower', ['FF', 'SL', 'CH']), 42);
}

function playScene(cs: CareerState, sceneId: string, choiceIndex: number): CareerState {
  const scene = getScene(sceneId, cs);
  return applyChoice(cs, scene, scene.choices[choiceIndex]);
}

function lineOf(partial: Partial<StartLine>): StartLine {
  return {
    opponent: 'Testers',
    outs: 18,
    hits: 5,
    runs: 2,
    strikeouts: 6,
    walks: 2,
    pitches: 88,
    decision: 'ND',
    finalUs: 3,
    finalThem: 2,
    qualityStart: true,
    ...partial,
  };
}

describe('the fork', () => {
  it('starts every career at the kitchen table', () => {
    const cs = freshCareer();
    expect(cs.sceneQueue).toEqual(['origin']);
    expect(cs.path).toBeNull();
  });

  it('college path: origin -> offers -> committed with a schedule', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 0);
    expect(cs.sceneQueue[0]).toBe('college-offers');
    const offers = getScene('college-offers', cs);
    expect(offers.choices.length).toBe(3);
    cs = applyChoice(cs, offers, offers.choices[0]);
    expect(cs.path).toBe('college');
    expect(cs.collegeYear).toBe(1);
    expect(cs.collegeId).toBeTruthy();
    expect(cs.schedule.length).toBe(SEASON_LENGTH.COLLEGE);
    expect(COLLEGES.some((c) => teamName(cs).startsWith(c.name))).toBe(true);
  });

  it('pro path: signing sends you straight to Double-A', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 1);
    expect(cs.path).toBe('pro');
    expect(cs.level).toBe('AA');
    expect(cs.orgId).toBeTruthy();
    expect(cs.schedule.length).toBe(SEASON_LENGTH.AA);
    expect(cs.sceneQueue).toContain('pro-arrival');
  });
});

describe('seasons and promotion', () => {
  function proCareerAtSeasonEnd(runsPerStart: number, ks = 8): CareerState {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 1);
    for (let i = 0; i < SEASON_LENGTH.AA; i++) {
      cs = recordStart(cs, lineOf({ runs: runsPerStart, strikeouts: ks, decision: 'W' }));
    }
    return cs;
  }

  it('queues the season-end scene after the last start', () => {
    const cs = proCareerAtSeasonEnd(1);
    expect(cs.sceneQueue).toContain('season-end');
    expect(cs.season.starts).toBe(SEASON_LENGTH.AA);
  });

  it('promotes a dominant AA season to Triple-A', () => {
    let cs = proCareerAtSeasonEnd(1);
    expect(pendingPromotion(cs)).toBe('AAA');
    cs = playScene(cs, 'season-end', 0);
    expect(cs.level).toBe('AAA');
    expect(cs.seasonYear).toBe(2);
    expect(cs.age).toBe(19);
    expect(cs.season.starts).toBe(0);
    expect(cs.history.length).toBe(1);
    expect(cs.sceneQueue).toContain('callup-aaa');
  });

  it('keeps a bad season at the same level', () => {
    let cs = proCareerAtSeasonEnd(6, 4);
    expect(pendingPromotion(cs)).toBeNull();
    cs = playScene(cs, 'season-end', 0);
    expect(cs.level).toBe('AA');
  });

  it('sends a college senior to draft day, then a pro org', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 0);
    const offers = getScene('college-offers', cs);
    cs = applyChoice(cs, offers, offers.choices[0]);
    for (let year = 1; year <= 3; year++) {
      for (let i = 0; i < SEASON_LENGTH.COLLEGE; i++) {
        cs = recordStart(cs, lineOf({ runs: 1, strikeouts: 9, decision: 'W' }));
      }
      if (year < 3) cs = playScene(cs, 'season-end', 0);
    }
    expect(cs.sceneQueue).toContain('draft-day');
    cs = playScene(cs, 'draft-day', 0);
    expect(PRO_TEAMS.some((t) => t.id === cs.orgId)).toBe(true);
    expect(['AA', 'AAA']).toContain(cs.level);
    expect(cs.schedule.length).toBeGreaterThan(0);
  });
});

describe('story triggers', () => {
  it('rewards a gem with a postgame scene', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 1);
    cs = recordStart(cs, lineOf({ strikeouts: 12 }));
    expect(cs.sceneQueue).toContain('gem');
  });

  it('sends a struggling starter to the office, once per season', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 1);
    for (let i = 0; i < 3; i++) {
      cs = recordStart(cs, lineOf({ runs: 6, outs: 12, qualityStart: false, decision: 'L' }));
    }
    expect(cs.sceneQueue).toContain('rough-patch');
    const queueSize = cs.sceneQueue.length;
    cs = recordStart(cs, lineOf({ runs: 6, outs: 12, qualityStart: false, decision: 'L' }));
    expect(cs.sceneQueue.length).toBe(queueSize);
  });

  it('applies scene choice effects to ratings', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 1);
    const before = cs.player.ratings.command;
    const scene = getScene('rough-patch', cs);
    cs = applyChoice(cs, scene, scene.choices[0]);
    expect(cs.player.ratings.command).toBe(before + 2);
  });
});

describe('game finishing', () => {
  it('credits the win only with five innings and a held lead', () => {
    const rng = makeRng(1);
    const shortStart = finishGame(rng, 5, 1, 4, 12, 0.001, 0.001);
    expect(shortStart.decision).toBe('ND');
    const fullStart = finishGame(makeRng(1), 5, 1, 6, 18, 0.001, 0.001);
    expect(fullStart.decision).toBe('W');
  });

  it('hangs the loss on a starter who left trailing for good', () => {
    const res = finishGame(makeRng(2), 0, 4, 6, 18, 0.0001, 0.0001);
    expect(res.decision).toBe('L');
    expect(res.won).toBe(false);
  });

  it('always finishes with a winner', () => {
    for (let seed = 0; seed < 50; seed++) {
      const res = finishGame(makeRng(seed), 2, 2, 6, 18, 0.4, 0.4);
      expect(res.finalUs).not.toBe(res.finalThem);
    }
  });

  it('samples plausible inning scores', () => {
    const rng = makeRng(3);
    let total = 0;
    for (let i = 0; i < 1000; i++) total += runsInInning(rng, 0.5);
    const perInning = total / 1000;
    expect(perInning).toBeGreaterThan(0.2);
    expect(perInning).toBeLessThan(1.1);
  });
});

describe('economy', () => {
  it('pays more for dominance than survival', () => {
    const gem = xpForStart(lineOf({ outs: 27, strikeouts: 12, runs: 0, decision: 'W' }));
    const grind = xpForStart(lineOf({ outs: 15, strikeouts: 3, runs: 4, qualityStart: false }));
    expect(gem).toBeGreaterThan(grind * 2);
  });

  it('computes ERA on the 27-out scale', () => {
    expect(era({ ...lineToTotals(lineOf({ runs: 3, outs: 27 })) })).toBeCloseTo(3);
  });
});

function lineToTotals(line: StartLine) {
  return {
    starts: 1,
    outs: line.outs,
    hits: line.hits,
    runs: line.runs,
    strikeouts: line.strikeouts,
    walks: line.walks,
    wins: 0,
    losses: 0,
    qualityStarts: 0,
  };
}

describe('schedules', () => {
  it('builds the right length for each level and never schedules yourself', () => {
    let cs = freshCareer();
    cs = playScene(cs, 'origin', 1);
    const sched = buildSchedule(cs, 'AA');
    expect(sched.length).toBe(SEASON_LENGTH.AA);
    for (const g of sched) expect(g.opponent).not.toBe(teamName(cs));
  });
});
