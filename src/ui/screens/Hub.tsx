import { useState } from 'react';
import {
  exportCode,
  levelLabel,
  seasonRace,
  teamName,
  type CareerState,
} from '../../career/career';
import { CLUBHOUSE_LABEL, clubhouseTier, fameLabel } from '../../career/reputation';
import { table, winPct } from '../../career/standings';
import { era, ipDisplay, kPerNine } from '../../career/sim';
import { PITCH_CATALOG, getCatalogPitch } from '../../engine/pitchCatalog';
import {
  MAX_ARSENAL,
  NEW_PITCH_COST,
  gradeCost,
  overall,
  ratingCost,
  type Ratings,
} from '../../engine/player';
import { collegeById } from '../../career/teams';

interface Props {
  career: CareerState;
  onPlayNext: () => void;
  onTrain: (key: keyof Ratings) => void;
  onUpgradePitch: (pitchId: string) => void;
  onLearnPitch: (pitchId: string) => void;
  onQuitToMenu: () => void;
}

const RATING_LABELS: [keyof Ratings, string][] = [
  ['velocity', 'Velocity'],
  ['command', 'Command'],
  ['movement', 'Movement'],
  ['stamina', 'Stamina'],
  ['composure', 'Composure'],
];

export function Hub({ career, onPlayNext, onTrain, onUpgradePitch, onLearnPitch, onQuitToMenu }: Props) {
  const [tab, setTab] = useState<'season' | 'develop' | 'league' | 'history'>('season');
  const [code, setCode] = useState<string | null>(null);
  const cs = career;
  const nextGame = cs.schedule[cs.startIndex];
  const labCollege =
    cs.level === 'COLLEGE' && cs.collegeId && collegeById(cs.collegeId).perk === 'lab';
  const upgradeDiscount = labCollege ? 0.75 : 1;

  return (
    <div className="hub">
      <header className="hub-head">
        <div>
          <div className="hub-kicker">
            {levelLabel(cs.level).toUpperCase()} · YEAR {cs.seasonYear} · AGE {cs.age}
          </div>
          <h2 className="hub-team">{teamName(cs)}</h2>
          <div className="hub-player">
            {cs.player.name} · {cs.player.throws}HP · OVR {overall(cs.player)}
          </div>
        </div>
        <div className="hub-head-right">
          <div className="hub-xp">
            <span className="hub-xp-num">{cs.xp}</span>
            <span className="hub-xp-label">DEV XP</span>
          </div>
          <button className="ghost-btn" onClick={onQuitToMenu}>Save & menu</button>
        </div>
      </header>

      <div className="hub-statstrip">
        <Stat label="Record" value={`${cs.season.wins}-${cs.season.losses}`} />
        <Stat label="ERA" value={cs.season.outs ? era(cs.season).toFixed(2) : '—'} />
        <Stat label="IP" value={ipDisplay(cs.season.outs)} />
        <Stat label="K" value={String(cs.season.strikeouts)} />
        <Stat label="K/9" value={cs.season.outs ? kPerNine(cs.season).toFixed(1) : '—'} />
        <Stat label="BB" value={String(cs.season.walks)} />
        <Stat label="QS" value={String(cs.season.qualityStarts)} />
      </div>

      {nextGame && (
        <div className="next-start panel">
          <div>
            <div className="panel-title">NEXT START — GAME {cs.startIndex + 1} OF {cs.schedule.length}</div>
            <div className="next-opp">vs {nextGame.opponent}</div>
            <div className="race-note">{seasonRace(cs)}</div>
          </div>
          <button className="primary-btn" onClick={onPlayNext}>
            Take the ball
          </button>
        </div>
      )}

      <nav className="hub-tabs">
        {(['season', 'develop', 'league', 'history'] as const).map((t) => (
          <button key={t} className={tab === t ? 'tab-on' : ''} onClick={() => setTab(t)}>
            {t === 'season'
              ? 'Game log'
              : t === 'develop'
                ? 'Development'
                : t === 'league'
                  ? 'League'
                  : 'Career'}
          </button>
        ))}
      </nav>

      {tab === 'season' && (
        <div className="panel">
          {cs.seasonLines.length === 0 ? (
            <div className="log-empty">No starts yet this season.</div>
          ) : (
            <table className="stat-table">
              <thead>
                <tr>
                  <th>Opp</th><th>IP</th><th>H</th><th>R</th><th>K</th><th>BB</th><th>P</th><th>Dec</th>
                </tr>
              </thead>
              <tbody>
                {cs.seasonLines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.opponent}</td>
                    <td>{ipDisplay(l.outs)}</td>
                    <td>{l.hits}</td>
                    <td>{l.runs}</td>
                    <td>{l.strikeouts}</td>
                    <td>{l.walks}</td>
                    <td>{l.pitches}</td>
                    <td className={`dec-${l.decision}`}>{l.decision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'develop' && (
        <div className="develop">
          <div className="panel">
            <div className="panel-title">RATINGS</div>
            {RATING_LABELS.map(([key, label]) => {
              const v = cs.player.ratings[key];
              const cost = ratingCost(v);
              return (
                <div className="dev-row" key={key}>
                  <span className="dev-label">{label}</span>
                  <span className="rating-bar dev-bar">
                    <span className="rating-fill" style={{ width: `${v}%` }} />
                  </span>
                  <b className="dev-val">{v}</b>
                  <button
                    className="ghost-btn dev-btn"
                    disabled={cs.xp < cost || v >= 99}
                    onClick={() => onTrain(key)}
                  >
                    +1 · {cost} XP
                  </button>
                </div>
              );
            })}
          </div>

          <div className="panel">
            <div className="panel-title">ARSENAL</div>
            {cs.player.arsenal.map((slot) => {
              const p = getCatalogPitch(slot.pitchId);
              const cost = Math.round(gradeCost(slot.grade) * upgradeDiscount);
              return (
                <div className="dev-row" key={slot.pitchId}>
                  <span className="pitch-dot" style={{ background: p.color }} />
                  <span className="dev-label">{p.name}</span>
                  <span className="rating-bar dev-bar">
                    <span className="rating-fill" style={{ width: `${slot.grade}%`, background: p.color }} />
                  </span>
                  <b className="dev-val">{slot.grade}</b>
                  <button
                    className="ghost-btn dev-btn"
                    disabled={cs.xp < cost || slot.grade >= 99}
                    onClick={() => onUpgradePitch(slot.pitchId)}
                  >
                    +4 · {cost} XP
                  </button>
                </div>
              );
            })}
            {labCollege && <div className="dev-note">Pitching lab: upgrades cost 25% less here.</div>}

            {cs.player.arsenal.length < MAX_ARSENAL && (
              <>
                <div className="panel-title dev-learn-title">
                  LEARN A PITCH — {NEW_PITCH_COST} XP
                </div>
                <div className="learn-grid">
                  {PITCH_CATALOG.filter(
                    (p) => !cs.player.arsenal.some((s) => s.pitchId === p.id),
                  ).map((p) => (
                    <button
                      key={p.id}
                      className="learn-card"
                      disabled={cs.xp < NEW_PITCH_COST}
                      onClick={() => onLearnPitch(p.id)}
                      title={p.blurb}
                    >
                      <span className="pitch-dot" style={{ background: p.color }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'league' && (
        <div className="develop">
          <div className="panel">
            <div className="panel-title">STANDINGS</div>
            {cs.standings.rivals.length === 0 ? (
              <div className="log-empty">The league table opens with the season.</div>
            ) : (
              <table className="stat-table">
                <thead>
                  <tr>
                    <th>Club</th><th>W</th><th>L</th><th>PCT</th>
                  </tr>
                </thead>
                <tbody>
                  {table(cs.standings, teamName(cs)).map((r) => (
                    <tr key={r.name} className={r.isYou ? 'row-you' : ''}>
                      <td>{r.name}</td>
                      <td>{r.wins}</td>
                      <td>{r.losses}</td>
                      <td>{winPct(r.wins, r.losses).toFixed(3).replace(/^0/, '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">REPUTATION</div>
            <div className="dev-row">
              <span className="dev-label">Clubhouse</span>
              <span className="rating-bar dev-bar">
                <span
                  className="rating-fill"
                  style={{
                    width: `${(cs.reputation.clubhouse + 100) / 2}%`,
                    background: cs.reputation.clubhouse < 0 ? '#e8503a' : '#4fb477',
                  }}
                />
              </span>
              <b className="dev-val">{cs.reputation.clubhouse}</b>
            </div>
            <div className="dev-row">
              <span className="dev-label">Fame</span>
              <span className="rating-bar dev-bar">
                <span
                  className="rating-fill"
                  style={{ width: `${(cs.reputation.fame + 100) / 2}%`, background: '#e8b23a' }}
                />
              </span>
              <b className="dev-val">{cs.reputation.fame}</b>
            </div>
            <div className="rep-labels">
              <span>{CLUBHOUSE_LABEL[clubhouseTier(cs.reputation)]}</span>
              <span>·</span>
              <span>{fameLabel(cs.reputation)}</span>
            </div>
            <div className="dev-note">
              How you answer coaches and reporters moves these. The room decides your leash in a
              slump; fame moves your draft stock and how fast the org calls.
            </div>

            <div className="panel-title dev-learn-title">SAVE CODE</div>
            <div className="dev-note">
              Your career lives in this browser. Copy this somewhere safe to carry it to another
              device — or back it up before clearing site data.
            </div>
            <div className="save-actions">
              <button className="ghost-btn" onClick={() => setCode(exportCode(cs))}>
                Show save code
              </button>
              {code && (
                <button
                  className="ghost-btn"
                  onClick={() => void navigator.clipboard?.writeText(code)}
                >
                  Copy
                </button>
              )}
            </div>
            {code && <textarea className="save-code" readOnly value={code} rows={4} />}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="panel">
          {cs.history.length === 0 ? (
            <div className="log-empty">Your story is just getting started.</div>
          ) : (
            <table className="stat-table">
              <thead>
                <tr>
                  <th>Year</th><th>Team</th><th>Level</th><th>W-L</th><th>ERA</th><th>IP</th><th>K</th>
                </tr>
              </thead>
              <tbody>
                {cs.history.map((h, i) => (
                  <tr key={i}>
                    <td>{h.label}</td>
                    <td>{h.team}</td>
                    <td>{levelLabel(h.level)}</td>
                    <td>{h.totals.wins}-{h.totals.losses}</td>
                    <td>{h.totals.outs ? era(h.totals).toFixed(2) : '—'}</td>
                    <td>{ipDisplay(h.totals.outs)}</td>
                    <td>{h.totals.strikeouts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-val">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
