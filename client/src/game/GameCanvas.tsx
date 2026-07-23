import { useEffect, useRef, useCallback } from 'react';
import Phaser from 'phaser';
import { createGame } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { setCRTPipelineEnabled } from './pipelines/CRTPipeline';
import { STORAGE_KEYS } from './config';

export interface GameCanvasProps {
  active: boolean;
  crtEnabled: boolean;
  onGameEvent: (event: string, data?: Record<string, unknown>) => void;
  onReady: (game: Phaser.Game) => void;
}

export function GameCanvas({ active, crtEnabled, onGameEvent, onReady }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const handleGameEvent = useCallback(
    (event: string, data?: Record<string, unknown>) => onGameEvent(event, data),
    [onGameEvent]
  );

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = createGame(containerRef.current, crtEnabled);
    gameRef.current = game;

    game.events.once('ready', () => {
      setCRTPipelineEnabled(game, crtEnabled);
      onReady(game);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gameRef.current) {
      setCRTPipelineEnabled(gameRef.current, crtEnabled);
    }
  }, [crtEnabled]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;

    const scene = game.scene.getScene('Game') as GameScene | undefined;

    if (active) {
      if (scene?.scene.isPaused()) {
        scene.scene.resume();
      } else if (!scene?.scene.isActive()) {
        game.scene.start('Game', { onGameEvent: handleGameEvent });
      }
    } else if (scene && (scene.scene.isActive() || scene.scene.isPaused())) {
      game.scene.pause('Game');
    }
  }, [active, handleGameEvent]);

  useEffect(() => {
    const onVisibility = () => {
      const game = gameRef.current;
      if (!game) return;

      const scene = game.scene.getScene('Game') as GameScene | undefined;

      if (document.hidden) {
        if (scene?.scene.isActive() && !scene.scene.isPaused()) {
          game.scene.pause('Game');
          onGameEvent('pause');
        }
      } else if (scene?.scene.isPaused()) {
        onGameEvent('resume');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [onGameEvent]);

  return (
    <div
      ref={containerRef}
      className="game-canvas"
      style={{ imageRendering: 'pixelated' }}
      aria-label="Canal Courier game canvas"
    />
  );
}

export function restartGame(game: Phaser.Game) {
  const scene = game.scene.getScene('Game') as GameScene;
  if (scene) scene.restart();
  else game.scene.start('Game');
}

export function getGameState(game: Phaser.Game) {
  const scene = game.scene.getScene('Game') as GameScene | undefined;
  return {
    score: scene?.getScore() ?? 0,
    pastries: scene?.getPastries() ?? 0,
    level: scene?.getLevel() ?? 1,
    gameOver: scene?.isGameOver() ?? false,
    levelComplete: scene?.isLevelComplete() ?? false,
  };
}

export function saveBestScore(score: number) {
  const prev = parseInt(localStorage.getItem(STORAGE_KEYS.bestScore) ?? '0', 10);
  const isNewBest = score > prev;
  if (isNewBest) localStorage.setItem(STORAGE_KEYS.bestScore, String(score));
  const cumulative = parseInt(localStorage.getItem(STORAGE_KEYS.cumulative) ?? '0', 10) + score;
  localStorage.setItem(STORAGE_KEYS.cumulative, String(cumulative));
  return { cumulative, isNewBest };
}
