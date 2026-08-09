interface Props {
  hasSave: boolean;
  saveName?: string;
  onContinue: () => void;
  onNewCareer: () => void;
  onExhibition: () => void;
}

export function MainMenu({ hasSave, saveName, onContinue, onNewCareer, onExhibition }: Props) {
  return (
    <div className="menu">
      <div className="menu-card">
        <div className="menu-kicker">FEDERAL BASEBALL LEAGUE PRESENTS</div>
        <h1 className="menu-title">
          PITCHER'S <span>DUEL</span>
        </h1>
        <div className="menu-tag">Sixty feet, six inches. Everything else is decoration.</div>
        <div className="menu-actions">
          {hasSave && (
            <button className="primary-btn menu-btn" onClick={onContinue}>
              Continue{saveName ? ` — ${saveName}` : ''}
            </button>
          )}
          <button className={`${hasSave ? 'ghost-btn' : 'primary-btn'} menu-btn`} onClick={onNewCareer}>
            New career
          </button>
          <button className="ghost-btn menu-btn" onClick={onExhibition}>
            Exhibition inning
          </button>
        </div>
      </div>
    </div>
  );
}
