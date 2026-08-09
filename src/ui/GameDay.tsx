import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { topGuess } from '../engine/batterAI';
import {
  currentBatter,
  currentGuess,
  currentSituation,
  newGame,
  nextInning,
  throwPitch,
  type ThrowResult,
} from '../engine/game';
import { makeRng } from '../engine/rng';
import type { Batter, GameState, Loc, MeterResult, PitchType, Situation } from '../engine/types';
import { bullpenLambda, finishGame, offenseLambda, runsInInning, type GameFinish, type StartLine } from '../career/sim';
import { Meter } from './Meter';
import { sound } from './sound';
import { Stage, type ExitKind, type Flight, type GhostTrail } from './Stage';

export interface GameDayResult {
  line: StartLine;
  finish: GameFinish;
}

interface Props {
  matchup: string;
  opponentName: string;
  arsenal: PitchType[];
  lineup: Batter[];
  throws: 'R' | 'L';
  staminaPerPitch: number;
  pitchLimit: number;
  maxInnings: number;
  /** Own club and opposition quality, for run support and the bullpen. */
  teamStrength: number;
  oppQuality: number;
  /** The pitcher's poise, 25–99. Decides how much of a jam he feels. */
  composure: number;
  scout: boolean;
  seed: number;
  onComplete: (result: GameDayResult) => void;
}

type Phase = 'pregame' | 'select' | 'meter' | 'flight' | 'result' | 'break' | 'postgame';

export function GameDay(props: Props) {
  const {
    matchup, opponentName, arsenal, lineup, throws, staminaPerPitch,
    pitchLimit, maxInnings, teamStrength, oppQuality, composure, scout, seed, onComplete,
  } = props;

  const rngRef = useRef(makeRng(seed));
  const [game, setGame] = useState<GameState>(() =>
    newGame({ arsenal, lineup, staminaPerPitch, composure }),
  );
  const [phase, setPhase] = useState<Phase>('pregame');
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [aim, setAim] = useState<Loc | null>(null);
  const [pending, setPending] = useState<ThrowResult | null>(null);
  const [ghosts, setGhosts] = useState<GhostTrail[]>([]);
  const [usRuns, setUsRuns] = useState(0);
  const [breakNote, setBreakNote] = useState('');
  const [paNote, setPaNote] = useState<string | null>(null);
  const [final, setFinal] = useState<GameDayResult | null>(null);
  const arrivedRef = useRef<ThrowResult | null>(null);

  const offLambda = useMemo(() => offenseLambda(teamStrength, oppQuality), [teamStrength, oppQuality]);
  const penLambda = useMemo(() => bullpenLambda(teamStrength, oppQuality), [teamStrength, oppQuality]);

  const batter = currentBatter(game);
  const situation = useMemo(() => currentSituation(game, usRuns), [game, usRuns]);
  const guess = useMemo(() => currentGuess(game, usRuns), [game, usRuns]);
  const selected = pitchId ? arsenal.find((p) => p.id === pitchId) ?? null : null;

  const usage = useMemo(() => {
    const u: Record<string, number> = {};
    for (const m of game.memory) if (m.thisPlateAppearance) u[m.pitchId] = (u[m.pitchId] ?? 0) + 1;
    return u;
  }, [game.memory]);

  const deliver = useCallback(
    (meter: MeterResult) => {
      if (!pitchId || !aim) return;
      const res = throwPitch(game, { pitchId, aim }, meter, rngRef.current, usRuns);
      setPending(res);
      setPhase('flight');
    },
    [aim, game, pitchId, usRuns],
  );

  const flight: Flight | null = useMemo(() => {
    if (phase !== 'flight' && phase !== 'result') return null;
    if (!pending || !selected) return null;
    return {
      actual: pending.debug.exec.actual,
      liveBreak: pending.debug.exec.liveBreak,
      velo: pending.outcome.velo,
      color: selected.color,
      hung: pending.outcome.hung,
      swing: pending.outcome.decision === 'swing',
      exit: exitKindOf(pending.outcome.kind, pending.outcome.batted),
    };
  }, [phase, pending, selected]);

  const onArrive = useCallback(() => {
    if (!pending || !selected) return;
    // One arrival per pitch, no matter how the stage re-renders behind it.
    if (arrivedRef.current === pending) return;
    arrivedRef.current = pending;
    const o = pending.outcome;

    // The soundtrack of the moment the ball gets there.
    if (o.kind === 'swinging_strike') {
      sound.whiff();
      sound.pop(o.velo * 0.96);
    } else if (o.kind === 'foul') {
      sound.crack(0.25);
    } else if (o.kind === 'in_play') {
      sound.crack(o.contactQuality ?? 0.5);
    } else {
      sound.pop(o.velo);
    }
    if (o.batted === 'home_run') sound.groan();
    else if (pending.paResult === 'strikeout') sound.cheer(0.6);
    else if (o.batted === 'double_play') sound.cheer(0.7);
    else if (pending.state.inningOver) sound.cheer(0.45);

    setGame(pending.state);
    setGhosts((g) =>
      [...g, {
        actual: pending.debug.exec.actual,
        liveBreak: pending.debug.exec.liveBreak,
        color: selected.color,
      }].slice(-4),
    );
    setPaNote(
      pending.paResult === 'strikeout'
        ? `${batter.name} STRUCK OUT`
        : pending.paResult === 'walk'
          ? `${batter.name} WALKS`
          : null,
    );
    setPhase('result');
  }, [pending, selected, batter.name]);

  const endStart = useCallback(
    (state: GameState, runsUs: number) => {
      const outs = state.inning * 3;
      const rng = rngRef.current;
      const finish = finishGame(rng, runsUs, state.runs, state.inning, outs, offLambda, penLambda);
      const line: StartLine = {
        opponent: opponentName,
        outs,
        hits: state.hits,
        runs: state.runs,
        strikeouts: state.strikeouts,
        walks: state.walks,
        pitches: state.pitcher.pitchCount,
        decision: finish.decision,
        finalUs: finish.finalUs,
        finalThem: finish.finalThem,
        qualityStart: outs >= 18 && state.runs <= 3,
      };
      setFinal({ line, finish });
      setPhase('postgame');
    },
    [offLambda, penLambda, opponentName],
  );

  const advanceAfterResult = useCallback(() => {
    setPaNote(null);
    setPitchId(null);
    setAim(null);
    setPending(null);
    if (!game.inningOver) {
      setPhase('select');
      return;
    }
    // Frame over: your own half gets simmed while you sit in the dugout.
    const scored = runsInInning(rngRef.current, offLambda);
    setUsRuns((r) => r + scored);
    setBreakNote(
      scored === 0
        ? 'Your side goes quietly.'
        : scored === 1
          ? 'Your side pushes a run across!'
          : `Your side puts up ${scored}!`,
    );
    setPhase('break');
  }, [game.inningOver, offLambda]);

  const mustExit = game.pitcher.pitchCount >= pitchLimit || game.inning >= maxInnings;

  const continuePitching = useCallback(() => {
    setGame(nextInning(game));
    setGhosts([]);
    setPhase('select');
  }, [game]);

  const handToPen = useCallback(() => {
    endStart(game, usRuns);
  }, [endStart, game, usRuns]);

  // Keyboard: numbers for pitches, space to advance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'select') {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < arsenal.length) setPitchId(arsenal[idx].id);
      } else if (phase === 'result' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        advanceAfterResult();
      } else if (phase === 'pregame' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        setPhase('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, arsenal, advanceAfterResult]);

  useEffect(() => {
    if (phase === 'select' && pitchId && aim) setPhase('meter');
  }, [phase, pitchId, aim]);

  const outcome = pending?.outcome ?? null;

  return (
    <div className="gameday">
      <div className="gameday-top">
        <ScoreBug
          game={game}
          usRuns={usRuns}
          opponent={opponentName}
          pitchLimit={pitchLimit}
        />
        {situation.stretch && (
          <div className={`leverage ${situation.effective > 0.4 ? 'leverage-hot' : ''}`}>
            <span className="leverage-label">
              {situation.risp ? 'RISP · STRETCH' : 'STRETCH'}
            </span>
            <span className="leverage-bar">
              <span className="leverage-fill" style={{ width: `${situation.effective * 100}%` }} />
            </span>
          </div>
        )}
        <MuteButton />
      </div>

      <div className="gameday-main">
        <aside className="gd-left">
          <BatterPanel
            batter={batter}
            guess={guess}
            arsenal={arsenal}
            scout={scout}
            situation={situation}
          />
          <div className="pitch-log panel">
            <div className="panel-title">Pitch log</div>
            <ol>
              {[...game.log].reverse().slice(0, 9).map((o, i) => (
                <li key={game.log.length - i}>
                  <span className="log-num">{game.log.length - i}</span>
                  <span
                    className="log-dot"
                    style={{ background: arsenal.find((p) => p.id === o.pitchId)?.color }}
                  />
                  <span className="log-text">{o.description}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <section className="gd-center">
          <div className="stage-wrap">
            <Stage
              throws={throws}
              batter={batter}
              flight={flight}
              onArrive={onArrive}
              ghosts={ghosts}
              aim={aim}
              onAim={setAim}
              aimEnabled={phase === 'select'}
            />

            {phase === 'pregame' && (
              <div className="overlay pregame-overlay">
                <div className="matchup-label">{matchup}</div>
                <div className="matchup-vs">vs {opponentName}</div>
                <button
                  className="primary-btn"
                  onClick={() => {
                    sound.warm();
                    setPhase('select');
                  }}
                >
                  Take the mound
                </button>
              </div>
            )}

            {(phase === 'result') && outcome && (
              <>
                <div className="velo-readout">
                  {Math.round(outcome.velo)}<span> MPH</span>
                </div>
                <div className="lower-third">
                  <div className="lt-kind">{bannerText(outcome.kind, outcome.batted)}</div>
                  <div className="lt-detail">{outcome.description}</div>
                  {paNote && <div className="lt-pa">{paNote}</div>}
                  {outcome.runsScored > 0 && (
                    <div className="lt-runs">{outcome.runsScored} RUN{outcome.runsScored > 1 ? 'S' : ''} SCORE{outcome.runsScored > 1 ? '' : 'S'}</div>
                  )}
                  <button className="primary-btn" onClick={advanceAfterResult}>
                    Next pitch <span className="hint">(Space)</span>
                  </button>
                </div>
              </>
            )}

            {phase === 'break' && (
              <div className="overlay break-overlay">
                <div className="break-title">END {ordinal(game.inning)}</div>
                <div className="break-note">{breakNote}</div>
                <div className="break-score">
                  YOU {usRuns} — {game.runs} {opponentName.toUpperCase()}
                </div>
                <div className="break-pitches">
                  {game.pitcher.pitchCount} pitches · limit {pitchLimit}
                </div>
                {mustExit ? (
                  <>
                    <div className="break-coach">
                      {game.inning >= maxInnings
                        ? 'That’s a full night’s work.'
                        : 'Coach is at the top step. That’s your night — heck of a run.'}
                    </div>
                    <button className="primary-btn" onClick={handToPen}>
                      Hit the showers
                    </button>
                  </>
                ) : (
                  <div className="break-actions">
                    <button className="primary-btn" onClick={continuePitching}>
                      Head back out
                    </button>
                    <button className="ghost-btn" onClick={handToPen}>
                      Hand it to the pen
                    </button>
                  </div>
                )}
              </div>
            )}

            {phase === 'postgame' && final && (
              <div className="overlay postgame-overlay">
                <div className="pg-final">FINAL</div>
                <div className="pg-score">
                  YOU {final.finish.finalUs} — {final.finish.finalThem} {opponentName.toUpperCase()}
                </div>
                <div className={`pg-decision pg-${final.line.decision}`}>
                  {final.line.decision === 'W' ? 'WIN' : final.line.decision === 'L' ? 'LOSS' : 'NO DECISION'}
                </div>
                <div className="pg-line">
                  {Math.floor(final.line.outs / 3)} IP · {final.line.hits} H · {final.line.runs} R ·{' '}
                  {final.line.strikeouts} K · {final.line.walks} BB · {final.line.pitches} pitches
                </div>
                {final.line.qualityStart && <div className="pg-qs">QUALITY START</div>}
                <button className="primary-btn" onClick={() => onComplete(final)}>
                  Continue
                </button>
              </div>
            )}

            {phase === 'select' && (
              <div className="prompt stage-prompt">
                {!pitchId ? 'Call your pitch' : !aim ? `${selected?.name} — pick your spot` : ''}
              </div>
            )}
          </div>

          {phase === 'meter' && selected && (
            <Meter
              pitch={selected}
              stamina={game.pitcher.stamina}
              pressure={situation.effective}
              onComplete={deliver}
            />
          )}
        </section>

        <aside className="gd-right">
          <div className="arsenal">
            {arsenal.map((p, i) => (
              <button
                key={p.id}
                className={`pitch-btn ${pitchId === p.id ? 'pitch-selected' : ''}`}
                style={{ borderColor: pitchId === p.id ? p.color : undefined }}
                disabled={phase !== 'select'}
                onClick={() => setPitchId(p.id)}
              >
                <div className="pitch-row">
                  <span className="pitch-key">{i + 1}</span>
                  <span className="pitch-dot" style={{ background: p.color }} />
                  <span className="pitch-name">{p.name}</span>
                  <span className="pitch-velo">{Math.round(p.velo)}</span>
                </div>
                {scout && (
                  <div className="sit-bar">
                    <div
                      className="sit-fill"
                      style={{
                        width: `${Math.min(100, (guess.typeWeights[p.id] ?? 0) * 220)}%`,
                        background: p.color,
                      }}
                    />
                  </div>
                )}
                <div className="pitch-usage">{usage[p.id] ? `${usage[p.id]}x this AB` : ' '}</div>
              </button>
            ))}
          </div>
          {selected && <p className="pitch-blurb panel">{selected.blurb}</p>}
        </aside>
      </div>
    </div>
  );
}

function exitKindOf(kind: string, batted?: string): ExitKind {
  if (kind === 'foul') return 'foul';
  if (kind !== 'in_play') return null;
  switch (batted) {
    case 'home_run':
      return 'hr';
    case 'groundout':
    case 'double_play':
      return 'ground';
    case 'flyout':
    case 'sac_fly':
      return 'fly';
    case 'popout':
      return 'popup';
    default:
      return 'line';
  }
}

function bannerText(kind: string, batted?: string): string {
  switch (kind) {
    case 'ball': return 'BALL';
    case 'called_strike': return 'STRIKE LOOKING';
    case 'swinging_strike': return 'SWINGING STRIKE';
    case 'foul': return 'FOUL';
    default:
      return (batted ?? 'in play').replace(/_/g, ' ').toUpperCase();
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function ScoreBug({
  game, usRuns, opponent, pitchLimit,
}: {
  game: GameState;
  usRuns: number;
  opponent: string;
  pitchLimit: number;
}) {
  return (
    <div className="scorebug">
      <div className="sb-team">
        <span className="sb-name">YOU</span>
        <span className="sb-score">{usRuns}</span>
      </div>
      <div className="sb-team">
        <span className="sb-name">{shortName(opponent)}</span>
        <span className="sb-score">{game.runs}</span>
      </div>
      <div className="sb-inning">▲ {game.inning}</div>
      <div className="sb-count">
        {game.balls}-{game.strikes}
        <span className="sb-outs">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`sb-outdot ${i < game.outs ? 'on' : ''}`} />
          ))}
        </span>
      </div>
      <div className="sb-bases">
        <span className={`sbb sbb-2 ${game.bases[1] ? 'on' : ''}`} />
        <span className={`sbb sbb-3 ${game.bases[2] ? 'on' : ''}`} />
        <span className={`sbb sbb-1 ${game.bases[0] ? 'on' : ''}`} />
      </div>
      <div className="sb-pc">
        <span className="sb-pc-num">{game.pitcher.pitchCount}</span>
        <span className="sb-pc-label">/{pitchLimit} P</span>
        <div className="stamina">
          <div
            className="stamina-fill"
            style={{
              width: `${game.pitcher.stamina * 100}%`,
              background:
                game.pitcher.stamina > 0.6 ? '#4fb477' : game.pitcher.stamina > 0.35 ? '#e0873c' : '#e8503a',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MuteButton() {
  const [muted, setMuted] = useState(sound.muted);
  return (
    <button
      className="ghost-btn mute-btn"
      onClick={() => {
        sound.setMuted(!muted);
        setMuted(!muted);
      }}
      aria-label={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

function shortName(name: string): string {
  const parts = name.split(' ');
  return parts[parts.length - 1].slice(0, 10).toUpperCase();
}

const TTO_LABEL = ['1st look', '2nd look', '3rd look', '4th look'];

function BatterPanel({
  batter, guess, arsenal, scout, situation,
}: {
  batter: Batter;
  guess: ReturnType<typeof currentGuess>;
  arsenal: PitchType[];
  scout: boolean;
  situation: Situation;
}) {
  const sitting = topGuess(guess, arsenal);
  const tto = Math.min(4, situation.timesThroughOrder);
  return (
    <div className="batter-card panel">
      <div className="batter-head">
        <span className="batter-name">{batter.name}</span>
        <span className="batter-hand">{batter.hand}HB</span>
      </div>
      <div className={`tto tto-${tto}`}>
        <span className="tto-label">{TTO_LABEL[tto - 1]}</span>
        <span className="tto-bar">
          <span className="tto-fill" style={{ width: `${guess.familiarity * 100}%` }} />
        </span>
        <span className="tto-note">
          {guess.familiarity > 0.55
            ? 'has your book'
            : guess.familiarity > 0.28
              ? 'picking you up'
              : 'cold'}
        </span>
      </div>
      <p className="batter-blurb">{batter.blurb}</p>
      <div className="ratings">
        {([['Contact', batter.contact], ['Power', batter.power], ['Eye', batter.discipline], ['Speed', batter.speed]] as const).map(
          ([label, v]) => (
            <div className="rating" key={label}>
              <span className="rating-label">{label}</span>
              <span className="rating-bar">
                <span className="rating-fill" style={{ width: `${v * 100}%` }} />
              </span>
            </div>
          ),
        )}
      </div>
      {scout && (
        <div className="read">
          <span className="read-label">Sitting on</span>
          <span className="read-value" style={{ color: sitting.pitch.color }}>
            {sitting.pitch.name}
          </span>
          <span className="read-pct">{Math.round(sitting.weight * 100)}%</span>
        </div>
      )}
    </div>
  );
}
