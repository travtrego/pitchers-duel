import { topGuess } from '../engine/batterAI';
import type { Batter, Guess } from '../engine/types';

interface Props {
  batter: Batter;
  guess: Guess;
  showRead: boolean;
}

function Rating({ label, value }: { label: string; value: number }) {
  return (
    <div className="rating">
      <span className="rating-label">{label}</span>
      <span className="rating-bar">
        <span className="rating-fill" style={{ width: `${value * 100}%` }} />
      </span>
    </div>
  );
}

export function BatterCard({ batter, guess, showRead }: Props) {
  const sitting = topGuess(guess);
  return (
    <div className="batter-card">
      <div className="batter-head">
        <span className="batter-name">{batter.name}</span>
        <span className="batter-hand">{batter.hand}HH</span>
      </div>
      <p className="batter-blurb">{batter.blurb}</p>
      <div className="ratings">
        <Rating label="Contact" value={batter.contact} />
        <Rating label="Power" value={batter.power} />
        <Rating label="Eye" value={batter.discipline} />
        <Rating label="Speed" value={batter.speed} />
      </div>
      {showRead && (
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
