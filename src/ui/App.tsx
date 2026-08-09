import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentBatter, currentGuess, newGame, throwPitch } from '../engine/game';
import { ARSENAL, getPitch } from '../engine/pitches';
import { makeRng } from '../engine/rng';
import type { GameState, Loc, MeterResult, PitchOutcome } from '../engine/types';
import { ArsenalPicker } from './ArsenalPicker';
import { BatterCard } from './BatterCard';
import { Meter } from './Meter';
import { PitchLog } from './PitchLog';
import { Scoreboard } from './Scoreboard';
import { ZoneGrid } from './ZoneGrid';

type Phase = 'select' | 'meter' | 'result' | 'over';

export function App() {
  const [state, setState] = useState<GameState>(newGame);
  const [phase, setPhase] = useState<Phase>('select');
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [aim, setAim] = useState<Loc | null>(null);
  const [last, setLast] = useState<PitchOutcome | null>(null);
  const [scout, setScout] = useState(true);
  const [paNote, setPaNote] = useState<string | null>(null);
  const rngRef = useRef(makeRng(Math.floor(Math.random() * 2 ** 31)));

  const batter = currentBatter(state);
  const guess = useMemo(() => currentGuess(state), [state]);

  const usage = useMemo(() => {
    const u: Record<string, number> = {};
    for (const m of state.memory) {
      if (m.thisPlateAppearance) u[m.pitchId] = (u[m.pitchId] ?? 0) + 1;
    }
    return u;
  }, [state.memory]);

  const trail = useMemo(
    () =>
      state.memory
        .slice(-5)
        .map((m) => ({ loc: m.loc, color: getPitch(m.pitchId).color })),
    [state.memory],
  );

  const deliver = useCallback(
    (meter: MeterResult) => {
      if (!pitchId || !aim) return;
      const res = throwPitch(state, { pitchId, aim }, meter, rngRef.current);
      setState(res.state);
      setLast(res.outcome);
      setPaNote(
        res.paResult === 'strikeout'
          ? `${batter.name} struck out.`
          : res.paResult === 'walk'
            ? `${batter.name} walked.`
            : null,
      );
      setPhase(res.state.inningOver ? 'over' : 'result');
    },
    [aim, batter.name, pitchId, state],
  );

  const nextPitch = useCallback(() => {
    setPhase('select');
    setPitchId(null);
    setAim(null);
    setPaNote(null);
  }, []);

  const restart = useCallback(() => {
    rngRef.current = makeRng(Math.floor(Math.random() * 2 ** 31));
    setState(newGame());
    setLast(null);
    setPaNote(null);
    setPitchId(null);
    setAim(null);
    setPhase('select');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'select') {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < ARSENAL.length) setPitchId(ARSENAL[idx].id);
      } else if (phase === 'result' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        nextPitch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, nextPitch]);

  // Committing to a pitch and a spot arms the meter.
  useEffect(() => {
    if (phase === 'select' && pitchId && aim) setPhase('meter');
  }, [phase, pitchId, aim]);

  const selected = pitchId ? getPitch(pitchId) : null;

  return (
    <div className="app">
      <header>
        <h1>
          Pitcher's <span>Duel</span>
        </h1>
        <div className="header-right">
          <label className="scout-toggle">
            <input type="checkbox" checked={scout} onChange={(e) => setScout(e.target.checked)} />
            Scout view
          </label>
          <button className="ghost-btn" onClick={restart}>
            New inning
          </button>
        </div>
      </header>

      <Scoreboard state={state} />

      <main>
        <section className="left">
          <BatterCard batter={batter} guess={guess} showRead={scout} />
          <PitchLog log={state.log} />
        </section>

        <section className="center">
          <ZoneGrid
            aim={aim}
            onAim={setAim}
            disabled={phase !== 'select'}
            lastPitch={phase === 'result' || phase === 'over' ? last : null}
            trail={trail}
          />

          {phase === 'meter' && selected && (
            <Meter pitch={selected} stamina={state.pitcher.stamina} onComplete={deliver} />
          )}

          {(phase === 'result' || phase === 'over') && last && (
            <div className="result">
              <div className="result-line">{last.description}</div>
              <div className="result-meta">
                <span>
                  {last.inZone ? 'In the zone' : 'Off the plate'} · {last.decision === 'swing' ? 'he offered' : 'he took it'}
                </span>
                <span className="fooled">
                  Fooled
                  <span className="fooled-bar">
                    <span className="fooled-fill" style={{ width: `${last.deception * 100}%` }} />
                  </span>
                </span>
              </div>
              {paNote && <div className="pa-note">{paNote}</div>}
              {phase === 'result' && (
                <button className="primary-btn" onClick={nextPitch}>
                  Next pitch <span className="hint">(Space)</span>
                </button>
              )}
            </div>
          )}

          {phase === 'over' && (
            <div className="inning-over">
              <h2>Side retired</h2>
              <p>
                {state.runs} run{state.runs === 1 ? '' : 's'} · {state.hits} hit
                {state.hits === 1 ? '' : 's'} · {state.strikeouts} K · {state.walks} BB ·{' '}
                {state.pitcher.pitchCount} pitches
              </p>
              <button className="primary-btn" onClick={restart}>
                Take the mound again
              </button>
            </div>
          )}

          {phase === 'select' && (
            <div className="prompt">
              {!pitchId
                ? 'Pick your pitch (1–5)'
                : !aim
                  ? `${selected?.name} — now pick your spot`
                  : ''}
            </div>
          )}
        </section>

        <section className="right">
          <ArsenalPicker
            selected={pitchId}
            onSelect={setPitchId}
            disabled={phase !== 'select'}
            guess={guess}
            usage={usage}
            showGuess={scout}
          />
          {selected && <p className="pitch-blurb">{selected.blurb}</p>}
        </section>
      </main>
    </div>
  );
}
