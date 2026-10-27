import { useCallback, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import RunnerScene from '../game/RunnerScene.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config.js';
import { playCoin, playCollision, playJump, playLevelUp, playSlide } from '../services/audioService.js';

export const GAME_ENGINE = new URLSearchParams(window.location.search).get('moteur') === '3d' ? '3d' : '2d';

// Both engines expose the same events and the same showPreview / startNewRun / pauseRun / resumeRun methods.
function bindGameEvents(events, optionsRef) {
  events.on('score-updated', (score) => optionsRef.current.onScore?.(score));
  events.on('coin-collected', () => playCoin());
  events.on('jump', () => playJump());
  events.on('slide', () => playSlide());
  events.on('level-up', (level) => {
    playLevelUp();
    optionsRef.current.onLevelUp?.(level);
  });
  events.on('game-over', (result) => {
    playCollision();
    optionsRef.current.onGameOver?.(result);
  });
  events.on('countdown', (value) => optionsRef.current.onCountdown?.(value));
  events.on('auto-pause', () => optionsRef.current.onAutoPause?.());
}

export function useGame(containerRef, options = {}) {
  const gameRef = useRef(null);
  const sceneReadyRef = useRef(false);
  const pendingActionRef = useRef(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const getRunnerScene = useCallback(() => {
    if (!gameRef.current || !sceneReadyRef.current) return null;
    return GAME_ENGINE === '3d' ? gameRef.current : gameRef.current.scene.getScene('RunnerScene');
  }, []);

  const runPendingAction = useCallback((scene) => {
    sceneReadyRef.current = true;
    if (pendingActionRef.current === 'start') scene.startNewRun();
    else scene.showPreview();
    pendingActionRef.current = null;
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current || GAME_ENGINE !== '3d') return undefined;
    const container = containerRef.current;
    let runner = null;
    let disposed = false;

    import('../game3d/ThreeRunner.js').then(({ default: ThreeRunner }) => {
      if (disposed) return;
      runner = new ThreeRunner(container);
      gameRef.current = runner;
      bindGameEvents(runner.events, optionsRef);
      runPendingAction(runner);
    });

    return () => {
      disposed = true;
      sceneReadyRef.current = false;
      gameRef.current = null;
      runner?.destroy();
    };
  }, [containerRef, runPendingAction]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current || GAME_ENGINE !== '2d') return undefined;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [RunnerScene],
      render: { antialias: true, roundPixels: true },
      banner: false,
    });
    gameRef.current = game;

    game.events.once('ready', () => {
      if (gameRef.current !== game) return;
      const scene = game.scene.getScene('RunnerScene');
      bindGameEvents(scene.events, optionsRef);

      // Scene methods need the objects built in create(), which runs after the SVGs finish loading.
      scene.events.once(Phaser.Scenes.Events.CREATE, () => {
        if (gameRef.current !== game) return;
        runPendingAction(scene);
      });
    });

    return () => {
      sceneReadyRef.current = false;
      gameRef.current = null;
      game.destroy(true);
      // Phaser defers canvas removal to its next tick, which never comes if the game has not booted yet.
      game.canvas?.remove();
    };
  }, [containerRef, runPendingAction]);

  const startRun = useCallback(() => {
    const scene = getRunnerScene();
    if (scene) scene.startNewRun();
    else pendingActionRef.current = 'start';
  }, [getRunnerScene]);

  const showPreview = useCallback(() => {
    const scene = getRunnerScene();
    if (scene) scene.showPreview();
    else pendingActionRef.current = 'preview';
  }, [getRunnerScene]);

  const pause = useCallback(() => {
    getRunnerScene()?.pauseRun();
  }, [getRunnerScene]);

  const resume = useCallback(() => {
    getRunnerScene()?.resumeRun();
  }, [getRunnerScene]);

  return {
    startRun,
    showPreview,
    pause,
    resume,
  };
}
