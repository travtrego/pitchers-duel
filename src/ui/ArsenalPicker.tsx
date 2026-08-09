import { ARSENAL } from '../engine/pitches';
import type { Guess } from '../engine/types';

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
  guess: Guess;
  /** How many of each pitch you have thrown this at-bat. */
  usage: Record<string, number>;
  showGuess: boolean;
}

export function ArsenalPicker({ selected, onSelect, disabled, guess, usage, showGuess }: Props) {
  return (
    <div className="arsenal">
      {ARSENAL.map((p, i) => {
        const weight = guess.typeWeights[p.id] ?? 0;
        return (
          <button
            key={p.id}
            className={`pitch-btn ${selected === p.id ? 'pitch-selected' : ''}`}
            style={{ borderColor: selected === p.id ? p.color : undefined }}
            disabled={disabled}
            onClick={() => onSelect(p.id)}
          >
            <div className="pitch-row">
              <span className="pitch-key">{i + 1}</span>
              <span className="pitch-dot" style={{ background: p.color }} />
              <span className="pitch-name">{p.name}</span>
              <span className="pitch-velo">{p.velo}</span>
            </div>
            {showGuess && (
              <div className="sit-bar" title="How much the hitter is sitting on this pitch">
                <div
                  className="sit-fill"
                  style={{ width: `${Math.min(100, weight * 220)}%`, background: p.color }}
                />
              </div>
            )}
            <div className="pitch-usage">
              {usage[p.id] ? `thrown ${usage[p.id]}x this AB` : ' '}
            </div>
          </button>
        );
      })}
    </div>
  );
}
