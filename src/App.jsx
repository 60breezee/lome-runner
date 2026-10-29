import { useCallback, useEffect, useRef, useState } from 'react';
import GameHUD from './components/GameHUD.jsx';
import GameOver from './components/GameOver.jsx';
import InstallHelp from './components/InstallHelp.jsx';
import Instructions from './components/Instructions.jsx';
import MainMenu from './components/MainMenu.jsx';
import Pause from './components/Pause.jsx';
import { GAME_ENGINE, useGame } from './hooks/useGame.js';
import { useAppUpdate, useInstallPrompt } from './hooks/usePwa.js';
import { loadScoreData, saveScoreData } from './services/scoreStorage.js';
import { playClick, setAudioEnabled, startMusic, stopMusic, unlockAudio } from './services/audioService.js';

export default function App() {
  const canvasHostRef = useRef(null);
  const [screen, setScreen] = useState('menu');
  const [scoreData, setScoreData] = useState(loadScoreData);
  const [score, setScore] = useState({ distance: 0, coins: 0 });
  const [result, setResult] = useState(null);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [levelBanner, setLevelBanner] = useState(null);
  const levelBannerTimerRef = useRef(null);
  const { canPromptInstall, needsIosInstallHelp, promptInstall } = useInstallPrompt();
  const { updateAvailable, applyUpdate, dismissUpdate } = useAppUpdate();

  useEffect(() => {
    setAudioEnabled(scoreData.soundEnabled);
  }, [scoreData.soundEnabled]);

  const hideLevelBanner = useCallback(() => {
    window.clearTimeout(levelBannerTimerRef.current);
    setLevelBanner(null);
  }, []);

  useEffect(() => () => window.clearTimeout(levelBannerTimerRef.current), []);

  const gameControls = useGame(canvasHostRef, {
    onScore: setScore,
    onCountdown: (value) => setCountdown(value || null),
    onLevelUp: (level) => {
      window.clearTimeout(levelBannerTimerRef.current);
      setLevelBanner(level);
      levelBannerTimerRef.current = window.setTimeout(() => setLevelBanner(null), 1600);
    },
    onAutoPause: () => {
      stopMusic();
      setPaused((prevPaused) => {
        if (!prevPaused) gameControls.pause();
        return true;
      });
    },
    onGameOver: (gameResult) => {
      stopMusic();
      hideLevelBanner();
      setScoreData((prevData) => {
        const isNewRecord = gameResult.distance > prevData.bestScore;
        const nextData = isNewRecord ? { ...prevData, bestScore: gameResult.distance } : prevData;
        if (isNewRecord) saveScoreData(nextData);
        setResult({ ...gameResult, isNewRecord });
        return nextData;
      });
      setScreen('game-over');
    },
  });

  const startGame = useCallback(() => {
    unlockAudio();
    playClick();
    startMusic();
    setScore({ distance: 0, coins: 0 });
    setResult(null);
    setPaused(false);
    hideLevelBanner();
    setScreen('game');
    gameControls.startRun();
  }, [gameControls, hideLevelBanner]);

  const goToMenu = useCallback(() => {
    playClick();
    stopMusic();
    setPaused(false);
    setCountdown(null);
    hideLevelBanner();
    setScreen('menu');
    gameControls.showPreview();
  }, [gameControls, hideLevelBanner]);

  const pauseGame = useCallback(() => {
    playClick();
    stopMusic();
    gameControls.pause();
    setPaused(true);
  }, [gameControls]);

  const resumeGame = useCallback(() => {
    playClick();
    startMusic();
    gameControls.resume();
    setPaused(false);
  }, [gameControls]);

  const toggleSound = useCallback(() => {
    setScoreData((prevData) => {
      const nextData = { ...prevData, soundEnabled: !prevData.soundEnabled };
      saveScoreData(nextData);
      setAudioEnabled(nextData.soundEnabled);
      if (nextData.soundEnabled) {
        unlockAudio();
        playClick();
        if (screen === 'game' && !paused) startMusic();
      }
      return nextData;
    });
  }, [screen, paused]);

  const handleInstall = useCallback(() => {
    playClick();
    if (canPromptInstall) promptInstall();
    else setScreen('install-help');
  }, [canPromptInstall, promptInstall]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (screen === 'game' && (event.key === 'Escape' || event.key === 'p' || event.key === 'P')) {
        event.preventDefault();
        if (paused) resumeGame();
        else pauseGame();
      } else if ((screen === 'menu' || screen === 'game-over') && event.key === 'Enter') {
        if (document.activeElement?.tagName !== 'BUTTON') {
          event.preventDefault();
          startGame();
        }
      } else if ((screen === 'instructions' || screen === 'install-help') && event.key === 'Escape') {
        event.preventDefault();
        setScreen('menu');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, paused, pauseGame, resumeGame, startGame]);

  return (
    <main className="game-viewport" aria-label="Lomé Runner">
      <div className={`game-stage game-stage--${GAME_ENGINE}`}>
        <div ref={canvasHostRef} className="canvas-layer" />
        {screen === 'menu' && (
          <MainMenu
            bestScore={scoreData.bestScore}
            onPlay={startGame}
            onInstructions={() => {
              playClick();
              setScreen('instructions');
            }}
            soundEnabled={scoreData.soundEnabled}
            onToggleSound={toggleSound}
            onInstall={canPromptInstall || needsIosInstallHelp ? handleInstall : null}
          />
        )}
        {screen === 'install-help' && (
          <InstallHelp
            onBack={() => {
              playClick();
              setScreen('menu');
            }}
          />
        )}
        {updateAvailable && screen !== 'game' && (
          <div className="update-banner" role="status">
            <span>Nouvelle version disponible</span>
            <button className="update-button" type="button" onClick={applyUpdate}>Mettre à jour</button>
            <button className="update-dismiss" type="button" aria-label="Plus tard" onClick={dismissUpdate}>×</button>
          </div>
        )}
        {screen === 'instructions' && (
          <Instructions
            onBack={() => {
              playClick();
              setScreen('menu');
            }}
          />
        )}
        {screen === 'game' && (
          <>
            <GameHUD distance={score.distance} coins={score.coins} onPause={pauseGame} />
            {countdown && (
              <div className="countdown" aria-live="assertive">
                {countdown}
              </div>
            )}
            {levelBanner && (
              <div key={levelBanner} className="level-banner" aria-live="polite">
                NIVEAU {levelBanner} · ÇA ACCÉLÈRE !
              </div>
            )}
            {paused && <Pause onResume={resumeGame} onMenu={goToMenu} />}
          </>
        )}
        {screen === 'game-over' && result && (
          <GameOver
            result={result}
            bestScore={scoreData.bestScore}
            isNewRecord={result.isNewRecord}
            onReplay={startGame}
            onMenu={goToMenu}
          />
        )}
      </div>
    </main>
  );
}
