import { useEffect, useState } from 'react';
import type { Scene, SceneChoice } from '../../career/story';

interface Props {
  scene: Scene;
  onChoose: (choice: SceneChoice) => void;
}

/**
 * Plays a story beat: lines reveal one at a time, then the choices appear.
 * Picking one shows its response before moving on, so the conversation lands.
 */
export function StoryScreen({ scene, onChoose }: Props) {
  const [revealed, setRevealed] = useState(1);
  const [picked, setPicked] = useState<SceneChoice | null>(null);

  // Reset when a new scene arrives.
  useEffect(() => {
    setRevealed(1);
    setPicked(null);
  }, [scene.id]);

  const allShown = revealed >= scene.lines.length;

  const advance = () => {
    if (!allShown) setRevealed((r) => r + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!allShown) setRevealed((r) => r + 1);
        else if (picked) onChoose(picked);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allShown, picked, onChoose]);

  return (
    <div className="story" onClick={advance}>
      <div className="story-frame">
        <div className="story-kicker">STORY</div>
        <h2 className="story-title">{scene.title}</h2>
        <div className="story-setting">{scene.setting}</div>

        <div className="story-lines">
          {scene.lines.slice(0, revealed).map((line, i) => (
            <div key={i} className={`story-line ${line.speaker === 'NARRATOR' ? 'story-narr' : ''}`}>
              {line.speaker !== 'NARRATOR' && <span className="story-speaker">{line.speaker}</span>}
              <span className="story-text">{line.text}</span>
            </div>
          ))}
          {!allShown && <div className="story-more">▼ tap to continue</div>}
        </div>

        {allShown && !picked && (
          <div className="story-choices">
            {scene.choices.map((c, i) => (
              <button
                key={i}
                className="story-choice"
                onClick={(e) => {
                  e.stopPropagation();
                  if (c.response) setPicked(c);
                  else onChoose(c);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="story-response">
            <div className="story-line">
              <span className="story-text">{picked.response}</span>
            </div>
            <button
              className="primary-btn"
              onClick={(e) => {
                e.stopPropagation();
                onChoose(picked);
              }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
