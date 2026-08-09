import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyChoice,
  clearCareer,
  getScene,
  loadCareer,
  newCareer,
  recordStart,
  saveCareer,
  teamName,
  teamStrength,
  type CareerState,
} from '../career/career';
import type { StartLine } from '../career/sim';
import type { SceneChoice } from '../career/story';
import { LINEUP } from '../engine/batters';
import { generateLineup, LEVEL_QUALITY } from '../engine/opponents';
import { ARSENAL } from '../engine/pitches';
import {
  deriveArsenal,
  gradeCost,
  learnPitch,
  NEW_PITCH_COST,
  pitchLimit,
  ratingCost,
  staminaPerPitch,
  trainRating,
  upgradePitch,
  type PlayerPitcher,
  type Ratings,
} from '../engine/player';
import { collegeById } from '../career/teams';
import { GameDay, type GameDayResult } from './GameDay';
import { CreatePitcher } from './screens/CreatePitcher';
import { Hub } from './screens/Hub';
import { MainMenu } from './screens/MainMenu';
import { StoryScreen } from './screens/StoryScreen';

type Screen = 'menu' | 'create' | 'career' | 'exhibition';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [career, setCareer] = useState<CareerState | null>(() => loadCareer());
  const [inGame, setInGame] = useState(false);

  // Persist on every career change so a closed tab never loses a season.
  useEffect(() => {
    if (career) saveCareer(career);
  }, [career]);

  const startNewCareer = useCallback((player: PlayerPitcher) => {
    const cs = newCareer(player, Math.floor(Math.random() * 2 ** 31));
    clearCareer();
    setCareer(cs);
    setScreen('career');
  }, []);

  const onChoose = useCallback(
    (choice: SceneChoice) => {
      setCareer((cs) => {
        if (!cs) return cs;
        const scene = getScene(cs.sceneQueue[0], cs);
        return applyChoice(cs, scene, choice);
      });
    },
    [],
  );

  const onGameComplete = useCallback((result: GameDayResult) => {
    setInGame(false);
    setCareer((cs) => (cs ? recordStart(cs, result.line) : cs));
  }, []);

  const spend = useCallback((cost: number, apply: (p: PlayerPitcher) => PlayerPitcher) => {
    setCareer((cs) => {
      if (!cs || cs.xp < cost) return cs;
      return { ...cs, xp: cs.xp - cost, player: apply(cs.player) };
    });
  }, []);

  const onTrain = useCallback(
    (key: keyof Ratings) => {
      if (!career) return;
      spend(ratingCost(career.player.ratings[key]), (p) => trainRating(p, key));
    },
    [career, spend],
  );

  const onUpgradePitch = useCallback(
    (pitchId: string) => {
      if (!career) return;
      const slot = career.player.arsenal.find((s) => s.pitchId === pitchId);
      if (!slot) return;
      const lab =
        career.level === 'COLLEGE' &&
        career.collegeId &&
        collegeById(career.collegeId).perk === 'lab';
      spend(Math.round(gradeCost(slot.grade) * (lab ? 0.75 : 1)), (p) => upgradePitch(p, pitchId));
    },
    [career, spend],
  );

  const onLearnPitch = useCallback(
    (pitchId: string) => {
      spend(NEW_PITCH_COST, (p) => learnPitch(p, pitchId));
    },
    [spend],
  );

  // ------------------------------------------------------------------
  // Career game day wiring
  // ------------------------------------------------------------------
  const gameProps = useMemo(() => {
    if (!career || !inGame) return null;
    const next = career.schedule[career.startIndex];
    if (!next) return null;
    const seed = career.rngSeed + career.seasonYear * 1000 + career.startIndex * 17;
    return {
      matchup: `${teamName(career)} · Year ${career.seasonYear}`,
      opponentName: next.opponent,
      arsenal: deriveArsenal(career.player),
      lineup: generateLineup(seed, next.quality, next.opponent),
      throws: career.player.throws,
      staminaPerPitch: staminaPerPitch(career.player),
      pitchLimit: pitchLimit(career.player, career.level),
      maxInnings: 9,
      teamStrength: teamStrength(career),
      oppQuality: next.quality,
      seed: seed + 1,
    };
  }, [career, inGame]);

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  if (screen === 'menu') {
    return (
      <MainMenu
        hasSave={career !== null}
        saveName={career?.player.name}
        onContinue={() => setScreen('career')}
        onNewCareer={() => setScreen('create')}
        onExhibition={() => setScreen('exhibition')}
      />
    );
  }

  if (screen === 'create') {
    return <CreatePitcher onCreate={startNewCareer} onBack={() => setScreen('menu')} />;
  }

  if (screen === 'exhibition') {
    return (
      <GameDay
        matchup="Exhibition"
        opponentName="Harbor City Nine"
        arsenal={ARSENAL}
        lineup={LINEUP}
        throws="R"
        staminaPerPitch={0.009}
        pitchLimit={60}
        maxInnings={3}
        teamStrength={0.6}
        oppQuality={LEVEL_QUALITY.AA}
        scout
        seed={Math.floor(Math.random() * 2 ** 31)}
        onComplete={() => setScreen('menu')}
      />
    );
  }

  // Career screen: story scenes take priority, then game day, then the hub.
  if (!career) {
    setScreen('menu');
    return null;
  }

  if (career.sceneQueue.length > 0) {
    const scene = getScene(career.sceneQueue[0], career);
    return <StoryScreen scene={scene} onChoose={onChoose} />;
  }

  if (inGame && gameProps) {
    return <GameDay {...gameProps} scout onComplete={onGameComplete} />;
  }

  return (
    <Hub
      career={career}
      onPlayNext={() => setInGame(true)}
      onTrain={onTrain}
      onUpgradePitch={onUpgradePitch}
      onLearnPitch={onLearnPitch}
      onQuitToMenu={() => setScreen('menu')}
    />
  );
}

// Re-exported for tests that want to build a line without playing.
export type { StartLine };
