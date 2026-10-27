import { useCallback, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import RunnerScene from '../game/RunnerScene.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config.js';
import { playCoin, playCollision, playJump, playLevelUp, playSlide } from '../services/audioService.js';

export function useGame(containerRef, options = {}) {
  const gameRef = useRef(null);
  const sceneReadyRef = useRef(false);
  const pendingActionRef = useRef(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const getRunnerScene = useCallback(() => {
    if (!gameRef.current || !sceneReadyRef.current) return null;
    return gameRef.current.scene.getScene('RunnerScene');
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return undefined;

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
      scene.events.on('score-updated', (score) => optionsRef.current.onScore?.(score));
      scene.events.on('coin-collected', () => playCoin());
      scene.events.on('jump', () => playJump());
      scene.events.on('slide', () => playSlide());
      scene.events.on('level-up', (level) => {
        playLevelUp();
        optionsRef.current.onLevelUp?.(level);
      });
      scene.events.on('game-over', (result) => {
        playCollision();
        optionsRef.current.onGameOver?.(result);
      });
      scene.events.on('countdown', (value) => optionsRef.current.onCountdown?.(value));
      scene.events.on('auto-pause', () => optionsRef.current.onAutoPause?.());

      // Scene methods need the objects built in create(), which runs after the SVGs finish loading.
      scene.events.once(Phaser.Scenes.Events.CREATE, () => {
        if (gameRef.current !== game) return;
        sceneReadyRef.current = true;
        if (pendingActionRef.current === 'start') scene.startNewRun();
        else scene.showPreview();
        pendingActionRef.current = null;
      });
    });

    return () => {
      sceneReadyRef.current = false;
      gameRef.current = null;
      game.destroy(true);
      // Phaser defers canvas removal to its next tick, which never comes if the game has not booted yet.
      game.canvas?.remove();
    };
  }, [containerRef]);

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
