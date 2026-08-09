import type { Loc, PitchOutcome } from '../engine/types';
import { cellCenter, GRID_HALF } from '../engine/zone';

interface Props {
  aim: Loc | null;
  onAim: (loc: Loc) => void;
  disabled: boolean;
  lastPitch: PitchOutcome | null;
  /** Recent locations, newest last, for the sequencing trail. */
  trail: { loc: Loc; color: string }[];
}

/** Convert zone units to a 0..100 percentage across the grid box. */
function pct(v: number): number {
  return ((v + GRID_HALF) / (GRID_HALF * 2)) * 100;
}

/**
 * The 5x5 aiming grid. The middle 3x3 is the strike zone; the outer ring is
 * where you go when you want a chase.
 */
export function ZoneGrid({ aim, onAim, disabled, lastPitch, trail }: Props) {
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const center = cellCenter(col, row);
      const inZone = Math.abs(center.x) < 1.5 && Math.abs(center.y) < 1.5;
      const selected = aim && aim.x === center.x && aim.y === center.y;
      cells.push(
        <button
          key={`${row}-${col}`}
          className={[
            'cell',
            inZone ? 'cell-zone' : 'cell-chase',
            selected ? 'cell-selected' : '',
          ].join(' ')}
          disabled={disabled}
          onClick={() => onAim(center)}
          aria-label={`Aim ${inZone ? 'in zone' : 'off the plate'} at column ${col + 1}, row ${row + 1}`}
        />,
      );
    }
  }

  return (
    <div className="zone-wrap">
      <div className="zone-grid">
        {cells}
        <div className="zone-box" />
        {trail.map((t, i) => (
          <div
            key={i}
            className="trail-dot"
            style={{
              left: `${pct(t.loc.x)}%`,
              bottom: `${pct(t.loc.y)}%`,
              background: t.color,
              opacity: 0.18 + (i / Math.max(1, trail.length - 1)) * 0.4,
            }}
          />
        ))}
        {lastPitch && (
          <>
            <div
              className="aim-marker"
              style={{ left: `${pct(lastPitch.aim.x)}%`, bottom: `${pct(lastPitch.aim.y)}%` }}
            />
            <div
              className={`ball-marker ${lastPitch.hung ? 'ball-hung' : ''}`}
              style={{
                left: `${pct(lastPitch.actual.x)}%`,
                bottom: `${pct(lastPitch.actual.y)}%`,
              }}
            />
          </>
        )}
      </div>
      <div className="zone-caption">Catcher's view · outer ring is off the plate</div>
    </div>
  );
}
