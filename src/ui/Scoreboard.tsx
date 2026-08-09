import type { GameState } from '../engine/types';

export function Scoreboard({ state }: { state: GameState }) {
  const dots = (n: number, total: number, cls: string) =>
    Array.from({ length: total }, (_, i) => (
      <span key={i} className={`dot ${i < n ? cls : 'dot-off'}`} />
    ));

  return (
    <div className="scoreboard">
      <div className="sb-block">
        <div className="sb-label">Count</div>
        <div className="sb-count">
          {state.balls}–{state.strikes}
        </div>
      </div>
      <div className="sb-block">
        <div className="sb-label">Balls</div>
        <div className="dots">{dots(state.balls, 3, 'dot-ball')}</div>
        <div className="sb-label">Strikes</div>
        <div className="dots">{dots(state.strikes, 2, 'dot-strike')}</div>
        <div className="sb-label">Outs</div>
        <div className="dots">{dots(state.outs, 3, 'dot-out')}</div>
      </div>
      <div className="sb-block">
        <div className="sb-label">Bases</div>
        <div className="diamond">
          <span className={`base base-2 ${state.bases[1] ? 'base-on' : ''}`} />
          <span className={`base base-3 ${state.bases[2] ? 'base-on' : ''}`} />
          <span className={`base base-1 ${state.bases[0] ? 'base-on' : ''}`} />
        </div>
      </div>
      <div className="sb-block sb-stats">
        <div>
          <span className="sb-label">Runs</span>
          <span className="sb-num">{state.runs}</span>
        </div>
        <div>
          <span className="sb-label">Hits</span>
          <span className="sb-num">{state.hits}</span>
        </div>
        <div>
          <span className="sb-label">K</span>
          <span className="sb-num">{state.strikeouts}</span>
        </div>
        <div>
          <span className="sb-label">BB</span>
          <span className="sb-num">{state.walks}</span>
        </div>
      </div>
      <div className="sb-block">
        <div className="sb-label">Pitch count</div>
        <div className="sb-num">{state.pitcher.pitchCount}</div>
        <div className="sb-label">Arm</div>
        <div className="stamina">
          <div
            className="stamina-fill"
            style={{
              width: `${state.pitcher.stamina * 100}%`,
              background: state.pitcher.stamina > 0.6 ? '#4fb477' : state.pitcher.stamina > 0.35 ? '#e0873c' : '#e8503a',
            }}
          />
        </div>
      </div>
    </div>
  );
}
