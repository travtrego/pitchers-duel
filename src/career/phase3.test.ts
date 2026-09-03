import { describe, expect, it } from 'vitest';
import { makePlayer } from '../engine/player';
import { makeRng } from '../engine/rng';
import {
  applyChoice,
  exportCode,
  getScene,
  importCode,
  migrate,
  newCareer,
  recordStart,
  SaveCodeError,
  seasonRace,
  teamName,
  type CareerState,
} from './career';
import {
  applyRep,
  clubhouseTier,
  fameBonus,
  NEUTRAL,
  patienceMultiplier,
  xpMultiplier,
} from './reputation';
import {
  advanceLeague,
  gamesBack,
  GAMES_BETWEEN_STARTS,
  newStandings,
  simBetweenStarts,
  table,
  winPct,
} from './standings';
import type { StartLine } from './sim';

function freshCareer(): CareerState {
  return newCareer(makePlayer('Duke Barlow', 'R', 'flamethrower', ['FF', 'SL', 'CH']), 42);
}

function signPro(cs: CareerState): CareerState {
  const scene = getScene('origin', cs);
  return applyChoice(cs, scene, scene.choices[1]);
}

function lineOf(partial: Partial<StartLine> = {}): StartLine {
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

describe('standings', () => {
  it('plays the whole rotation turn, not just your start', () => {
    const s = advanceLeague(newStandings(['A', 'B']), 1, true, 0.6);
    expect(s.wins + s.losses).toBe(1 + GAMES_BETWEEN_STARTS);
  });

  it('credits your decision to the club', () => {
    const won = advanceLeague(newStandings([]), 5, true, 0.5);
    const lost = advanceLeague(newStandings([]), 5, false, 0.5);
    expect(won.wins).toBe(lost.wins + 1);
    expect(lost.losses).toBe(won.losses + 1);
  });

  it('leaves a no-decision off the club record for that game', () => {
    const nd = advanceLeague(newStandings([]), 5, null, 0.5);
    expect(nd.wins + nd.losses).toBe(GAMES_BETWEEN_STARTS);
  });

  it('gives every rival the same number of games as you', () => {
    let s = newStandings(['A', 'B', 'C']);
    for (let i = 0; i < 4; i++) s = advanceLeague(s, i, true, 0.6);
    for (const r of s.rivals) expect(r.wins + r.losses).toBe(4 * (1 + GAMES_BETWEEN_STARTS));
  });

  it('wins more often with a better club', () => {
    let strong = 0;
    let weak = 0;
    for (let seed = 0; seed < 200; seed++) {
      strong += simBetweenStarts(makeRng(seed), 0.9);
      weak += simBetweenStarts(makeRng(seed), 0.2);
    }
    expect(strong).toBeGreaterThan(weak);
  });

  it('sorts the table by win percentage with you in it', () => {
    const s: ReturnType<typeof newStandings> = {
      wins: 10,
      losses: 2,
      rivals: [
        { name: 'Middling', wins: 6, losses: 6, isYou: false },
        { name: 'Terrible', wins: 1, losses: 11, isYou: false },
      ],
    };
    const rows = table(s, 'Yours');
    expect(rows[0].name).toBe('Yours');
    expect(rows[0].isYou).toBe(true);
    expect(rows[2].name).toBe('Terrible');
  });

  it('reports zero games back when you lead', () => {
    const s = { wins: 10, losses: 2, rivals: [{ name: 'X', wins: 5, losses: 7, isYou: false }] };
    expect(gamesBack(s, 'Yours')).toBe(0);
  });

  it('computes games back the standard way', () => {
    // Leader 10-2, you 6-6: (10-6 + 6-2) / 2 = 4 games back.
    const s = { wins: 6, losses: 6, rivals: [{ name: 'X', wins: 10, losses: 2, isYou: false }] };
    expect(gamesBack(s, 'Yours')).toBe(4);
  });

  it('handles an empty record without dividing by zero', () => {
    expect(winPct(0, 0)).toBe(0);
    expect(gamesBack(newStandings([]), 'Yours')).toBe(0);
  });

  it('advances the club as a career records starts', () => {
    let cs = signPro(freshCareer());
    expect(cs.standings.wins + cs.standings.losses).toBe(0);
    cs = recordStart(cs, lineOf({ decision: 'W' }));
    expect(cs.standings.wins + cs.standings.losses).toBe(1 + GAMES_BETWEEN_STARTS);
    expect(cs.standings.wins).toBeGreaterThan(0);
  });

  it('gives the hub something to say about the race', () => {
    let cs = signPro(freshCareer());
    expect(seasonRace(cs)).toMatch(/opens tonight/i);
    cs = recordStart(cs, lineOf({ decision: 'W' }));
    expect(seasonRace(cs).length).toBeGreaterThan(10);
  });
});

describe('reputation', () => {
  it('starts neutral and clamps at the extremes', () => {
    expect(NEUTRAL.clubhouse).toBe(0);
    expect(applyRep(NEUTRAL, { clubhouse: 500 }).clubhouse).toBe(100);
    expect(applyRep(NEUTRAL, { fame: -500 }).fame).toBe(-100);
  });

  it('tiers the clubhouse read', () => {
    expect(clubhouseTier({ clubhouse: 70, fame: 0 })).toBe('beloved');
    expect(clubhouseTier({ clubhouse: 0, fame: 0 })).toBe('neutral');
    expect(clubhouseTier({ clubhouse: -70, fame: 0 })).toBe('toxic');
  });

  it('buys patience with the room and stock with the fans', () => {
    expect(patienceMultiplier({ clubhouse: 80, fame: 0 })).toBeGreaterThan(1);
    expect(patienceMultiplier({ clubhouse: -80, fame: 0 })).toBeLessThan(1);
    expect(fameBonus({ clubhouse: 0, fame: 100 })).toBeGreaterThan(
      fameBonus({ clubhouse: 0, fame: 0 }),
    );
  });

  it('never penalizes XP for being disliked, only rewards being liked', () => {
    expect(xpMultiplier({ clubhouse: -100, fame: 0 })).toBe(1);
    expect(xpMultiplier({ clubhouse: 100, fame: 0 })).toBeGreaterThan(1);
  });

  it('moves when a scene choice says it should', () => {
    let cs = signPro(freshCareer());
    cs = recordStart(cs, lineOf({ strikeouts: 12 }));
    expect(cs.sceneQueue).toContain('gem');
    const scene = getScene('gem', cs);
    const humble = applyChoice(cs, scene, scene.choices[1]);
    const cocky = applyChoice(cs, scene, scene.choices[0]);
    expect(humble.reputation.clubhouse).toBeGreaterThan(cocky.reputation.clubhouse);
    expect(cocky.reputation.fame).toBeGreaterThan(humble.reputation.fame);
  });

  it('lets a well-liked pitcher develop slightly faster', () => {
    const base = signPro(freshCareer());
    const liked: CareerState = { ...base, reputation: { clubhouse: 100, fame: 0 } };
    const after = recordStart(base, lineOf());
    const afterLiked = recordStart(liked, lineOf());
    expect(afterLiked.xp).toBeGreaterThan(after.xp);
  });
});

describe('save codes', () => {
  it('round-trips a career exactly', () => {
    let cs = signPro(freshCareer());
    cs = recordStart(cs, lineOf({ decision: 'W', strikeouts: 9 }));
    const back = importCode(exportCode(cs));
    expect(back).toEqual(cs);
  });

  it('survives non-ascii names', () => {
    const cs = newCareer(makePlayer('José Peña-Ruiz', 'L', 'surgeon', ['SI', 'ST', 'CC']), 1);
    expect(importCode(exportCode(cs)).player.name).toBe('José Peña-Ruiz');
  });

  it('tolerates whitespace from a sloppy paste', () => {
    const cs = signPro(freshCareer());
    const code = exportCode(cs);
    const messy = `  ${code.slice(0, 20)}\n${code.slice(20)}  `;
    expect(importCode(messy).player.name).toBe(cs.player.name);
  });

  it('rejects junk instead of crashing', () => {
    expect(() => importCode('not a save code')).toThrow(SaveCodeError);
    expect(() => importCode('')).toThrow(SaveCodeError);
    // Valid base64, valid JSON, wrong shape.
    expect(() => importCode(btoa('{"hello":"world"}'))).toThrow(SaveCodeError);
  });

  it('rejects a save whose player is malformed', () => {
    const bad = btoa(JSON.stringify({ version: 1, xp: 0, seasonYear: 1, startIndex: 0, schedule: [], history: [], sceneQueue: [], player: null }));
    expect(() => importCode(bad)).toThrow(SaveCodeError);
  });

  it('back-fills fields missing from an older save', () => {
    const cs = signPro(freshCareer());
    const old = { ...cs } as Partial<CareerState>;
    delete old.reputation;
    delete old.standings;
    const fixed = migrate(old as CareerState);
    expect(fixed.reputation).toEqual(NEUTRAL);
    expect(fixed.standings.rivals).toEqual([]);
    expect(fixed.player.name).toBe(cs.player.name);
  });

  it('keeps the club identity through a round trip', () => {
    const cs = signPro(freshCareer());
    expect(teamName(importCode(exportCode(cs)))).toBe(teamName(cs));
  });
});
