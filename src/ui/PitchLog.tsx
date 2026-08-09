import { getPitch } from '../engine/pitches';
import type { PitchOutcome } from '../engine/types';

export function PitchLog({ log }: { log: PitchOutcome[] }) {
  const recent = [...log].reverse().slice(0, 12);
  return (
    <div className="pitch-log">
      <div className="panel-title">Pitch log</div>
      {recent.length === 0 && <div className="log-empty">No pitches thrown yet.</div>}
      <ol>
        {recent.map((o, i) => {
          const p = getPitch(o.pitchId);
          return (
            <li key={log.length - i}>
              <span className="log-num">{log.length - i}</span>
              <span className="log-dot" style={{ background: p.color }} />
              <span className="log-text">{o.description}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
