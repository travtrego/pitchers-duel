import { useState } from 'react';
import { importCode, SaveCodeError, type CareerState } from '../../career/career';

interface Props {
  hasSave: boolean;
  saveName?: string;
  onContinue: () => void;
  onNewCareer: () => void;
  onExhibition: () => void;
  onImport: (cs: CareerState) => void;
}

export function MainMenu({
  hasSave,
  saveName,
  onContinue,
  onNewCareer,
  onExhibition,
  onImport,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tryImport = () => {
    try {
      onImport(importCode(code));
    } catch (e) {
      setError(e instanceof SaveCodeError ? e.message : 'Could not read that code.');
    }
  };

  return (
    <div className="menu">
      <div className="menu-card">
        <div className="menu-kicker">FEDERAL BASEBALL LEAGUE PRESENTS</div>
        <h1 className="menu-title">
          PITCHER'S <span>DUEL</span>
        </h1>
        <div className="menu-tag">Sixty feet, six inches. Everything else is decoration.</div>

        {!importing ? (
          <div className="menu-actions">
            {hasSave && (
              <button className="primary-btn menu-btn" onClick={onContinue}>
                Continue{saveName ? ` — ${saveName}` : ''}
              </button>
            )}
            <button
              className={`${hasSave ? 'ghost-btn' : 'primary-btn'} menu-btn`}
              onClick={onNewCareer}
            >
              New career
            </button>
            <button className="ghost-btn menu-btn" onClick={onExhibition}>
              Exhibition inning
            </button>
            <button
              className="ghost-btn menu-btn"
              onClick={() => {
                setImporting(true);
                setError(null);
              }}
            >
              Load save code
            </button>
          </div>
        ) : (
          <div className="menu-actions">
            <textarea
              className="save-code"
              rows={4}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              placeholder="Paste your save code here"
              aria-label="Save code"
            />
            {error && <div className="save-error">{error}</div>}
            <button className="primary-btn menu-btn" disabled={!code.trim()} onClick={tryImport}>
              Load career
            </button>
            <button className="ghost-btn menu-btn" onClick={() => setImporting(false)}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
