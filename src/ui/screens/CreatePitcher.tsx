import { useMemo, useState } from 'react';
import { PITCH_CATALOG } from '../../engine/pitchCatalog';
import {
  ARCHETYPES,
  STARTING_GRADES,
  STARTING_PITCHES,
  makePlayer,
  overall,
  type PlayerPitcher,
} from '../../engine/player';
import type { SpeedClass } from '../../engine/types';

interface Props {
  onCreate: (player: PlayerPitcher) => void;
  onBack: () => void;
}

const CLASS_LABEL: Record<SpeedClass, string> = {
  hard: 'Fastballs',
  breaking: 'Breaking balls',
  offspeed: 'Offspeed',
};

export function CreatePitcher({ onCreate, onBack }: Props) {
  const [name, setName] = useState('');
  const [throws, setThrows] = useState<'R' | 'L'>('R');
  const [archetypeId, setArchetypeId] = useState(ARCHETYPES[0].id);
  const [picks, setPicks] = useState<string[]>([]);

  const togglePitch = (id: string) => {
    setPicks((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < STARTING_PITCHES ? [...p, id] : p,
    );
  };

  const preview = useMemo(() => {
    if (picks.length !== STARTING_PITCHES) return null;
    return makePlayer(name.trim() || 'You', throws, archetypeId, picks);
  }, [name, throws, archetypeId, picks]);

  const ready = picks.length === STARTING_PITCHES && name.trim().length > 0;

  return (
    <div className="create">
      <div className="create-head">
        <button className="ghost-btn" onClick={onBack}>← Back</button>
        <h2>BUILD YOUR ARM</h2>
        <div className="create-ovr">
          {preview ? <>OVR <b>{overall(preview)}</b></> : ' '}
        </div>
      </div>

      <div className="create-row">
        <label className="create-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={22}
          />
        </label>
        <div className="create-field">
          <span>Throws</span>
          <div className="toggle">
            {(['R', 'L'] as const).map((h) => (
              <button
                key={h}
                className={throws === h ? 'toggle-on' : ''}
                onClick={() => setThrows(h)}
              >
                {h === 'R' ? 'Right' : 'Left'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">ARCHETYPE</div>
      <div className="arch-grid">
        {ARCHETYPES.map((a) => (
          <button
            key={a.id}
            className={`arch-card ${archetypeId === a.id ? 'arch-selected' : ''}`}
            onClick={() => setArchetypeId(a.id)}
          >
            <div className="arch-name">{a.name}</div>
            <div className="arch-tag">{a.tagline}</div>
            <div className="arch-ratings">
              {([['VEL', a.ratings.velocity], ['CMD', a.ratings.command], ['MVT', a.ratings.movement], ['STA', a.ratings.stamina]] as const).map(
                ([label, v]) => (
                  <div key={label} className="arch-rating">
                    <span>{label}</span>
                    <b>{v}</b>
                  </div>
                ),
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="section-title">
        ARSENAL — pick {STARTING_PITCHES} ({picks.length}/{STARTING_PITCHES}); pick order sets your best pitch
      </div>
      {(['hard', 'breaking', 'offspeed'] as SpeedClass[]).map((cls) => (
        <div key={cls} className="pitch-class">
          <div className="pitch-class-label">{CLASS_LABEL[cls]}</div>
          <div className="pitch-pick-grid">
            {PITCH_CATALOG.filter((p) => p.speedClass === cls).map((p) => {
              const idx = picks.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  className={`pick-card ${idx >= 0 ? 'pick-selected' : ''}`}
                  style={idx >= 0 ? { borderColor: p.color } : undefined}
                  onClick={() => togglePitch(p.id)}
                >
                  <div className="pick-head">
                    <span className="pitch-dot" style={{ background: p.color }} />
                    <span className="pick-name">{p.name}</span>
                    <span className="pick-velo">{p.velo}</span>
                  </div>
                  <div className="pick-blurb">{p.blurb}</div>
                  {idx >= 0 && (
                    <div className="pick-grade">Grade {STARTING_GRADES[idx] ?? 45}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="create-footer">
        <button className="primary-btn" disabled={!ready} onClick={() => preview && onCreate(preview)}>
          Begin the story
        </button>
        {!ready && (
          <span className="create-hint">
            {!name.trim() ? 'Enter a name. ' : ''}
            {picks.length !== STARTING_PITCHES ? `Pick ${STARTING_PITCHES - picks.length} more pitch${STARTING_PITCHES - picks.length === 1 ? '' : 'es'}.` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
