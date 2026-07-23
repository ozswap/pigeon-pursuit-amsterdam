import { useState, useEffect, useCallback, useRef } from 'react';
import Phaser from 'phaser';
import { GameCanvas, restartGame, saveBestScore } from './game/GameCanvas';
import { toggleCRTPipeline } from './game/pipelines/CRTPipeline';
import { audioManager } from './game/audio';
import { STORAGE_KEYS, GOLDEN_BIKE_THRESHOLD } from './game/config';
import './App.css';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover' | 'levelcomplete';

function useCoarsePointer() {
  const [coarsePointer, setCoarsePointer] = useState(
    () => window.matchMedia('(pointer: coarse)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setCoarsePointer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return coarsePointer;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [crtEnabled, setCrtEnabled] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.crtEnabled);
    if (stored !== null) return stored !== 'false';
    return !window.matchMedia('(pointer: coarse)').matches;
  });
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.soundEnabled) !== 'false'
  );
  const [username, setUsername] = useState(
    () => localStorage.getItem(STORAGE_KEYS.username) ?? 'Rider'
  );
  const [bestScore, setBestScore] = useState(() => {
    const parsed = parseInt(localStorage.getItem(STORAGE_KEYS.bestScore) ?? '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [goldenUnlock, setGoldenUnlock] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [beatBest, setBeatBest] = useState(false);
  const [showControlsHint, setShowControlsHint] = useState(
    () => localStorage.getItem(STORAGE_KEYS.controlsSeen) !== 'true'
  );
  const [showEpilepsyWarning, setShowEpilepsyWarning] = useState(true);
  const touchDevice = useCoarsePointer();
  const gameRef = useRef<Phaser.Game | null>(null);
  const visibilityPausedRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && screen === 'playing') setScreen('paused');
      if (e.key === 'Escape' && screen === 'paused') {
        visibilityPausedRef.current = false;
        audioManager.resume();
        setScreen('playing');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  const handleGameEvent = useCallback((event: string, data?: Record<string, unknown>) => {
    if (event === 'pause') {
      setScreen((prev) => {
        if (prev === 'playing') {
          visibilityPausedRef.current = true;
          return 'paused';
        }
        return prev;
      });
      return;
    }

    if (event === 'resume') {
      if (visibilityPausedRef.current) {
        visibilityPausedRef.current = false;
        audioManager.resume();
        setScreen((prev) => (prev === 'paused' ? 'playing' : prev));
      }
      return;
    }

    if (event === 'game_over' || event === 'level_complete') {
      const score = (data?.score as number) ?? 0;
      const hadGolden = localStorage.getItem(STORAGE_KEYS.goldenBike) === 'true';
      const { cumulative, isNewBest } = saveBestScore(score);
      if (isNewBest) setBeatBest(true);
      const stored = parseInt(localStorage.getItem(STORAGE_KEYS.bestScore) ?? '0', 10);
      setBestScore(Number.isFinite(stored) ? stored : 0);
      setFinalScore(score);

      if (cumulative >= GOLDEN_BIKE_THRESHOLD) {
        localStorage.setItem(STORAGE_KEYS.goldenBike, 'true');
        if (!hadGolden) setGoldenUnlock(true);
      }

      setScreen(event === 'level_complete' ? 'levelcomplete' : 'gameover');
    }
  }, []);

  const startGame = () => {
    setShowEpilepsyWarning(false);
    setBeatBest(false);
    setGoldenUnlock(false);
    visibilityPausedRef.current = false;
    audioManager.resume();
    if (showControlsHint) {
      localStorage.setItem(STORAGE_KEYS.controlsSeen, 'true');
      setShowControlsHint(false);
    }
    if (gameRef.current) {
      restartGame(gameRef.current);
      gameRef.current.scene.start('Game', { onGameEvent: handleGameEvent });
    }
    setScreen('playing');
  };

  const handleReady = (game: Phaser.Game) => {
    gameRef.current = game;
  };

  const toggleCRT = () => {
    const next = !crtEnabled;
    setCrtEnabled(next);
    localStorage.setItem(STORAGE_KEYS.crtEnabled, String(next));
    if (gameRef.current) toggleCRTPipeline(gameRef.current);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    audioManager.setEnabled(next);
    localStorage.setItem(STORAGE_KEYS.soundEnabled, String(next));
  };

  useEffect(() => {
    audioManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const saveUsername = (name: string) => {
    const trimmed = name.slice(0, 16);
    setUsername(trimmed);
    localStorage.setItem(STORAGE_KEYS.username, trimmed);
  };

  const handleRestart = () => {
    setBeatBest(false);
    setGoldenUnlock(false);
    visibilityPausedRef.current = false;
    audioManager.resume();
    if (gameRef.current) {
      restartGame(gameRef.current);
      gameRef.current.scene.start('Game', { onGameEvent: handleGameEvent });
    }
    setScreen('playing');
  };

  const hasGoldenBike = localStorage.getItem(STORAGE_KEYS.goldenBike) === 'true';

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="title-logo" aria-label="Canal Courier Pigeon Peril">
          Canal Courier
          <span className="subtitle">Pigeon Peril</span>
        </h1>
      </header>

      <div className={`game-wrapper${screen === 'playing' ? ' game-wrapper--playing' : ''}`}>
        <GameCanvas
          active={screen === 'playing'}
          crtEnabled={crtEnabled}
          onGameEvent={handleGameEvent}
          onReady={handleReady}
        />

        {screen === 'playing' && touchDevice && (
          <div className="touch-zones" aria-hidden="true">
            <div className="touch-zone touch-zone-left">← BRAKE</div>
            <div className="touch-zone touch-zone-right">JUMP →</div>
          </div>
        )}

        {screen === 'menu' && (
          <div className="overlay menu-overlay" role="dialog" aria-label="Main menu">
            {showEpilepsyWarning && (
              <p className="epilepsy-warning">
                This game includes CRT flicker effects. Toggle CRT in settings if sensitive to flashing lights.
              </p>
            )}
            <button className="btn-primary pulse" onClick={startGame} autoFocus>
              CLICK TO RIDE
            </button>
            <div className="menu-settings">
              <label>
                Username
                <input
                  type="text"
                  maxLength={16}
                  value={username}
                  onChange={(e) => saveUsername(e.target.value)}
                  aria-label="Username"
                />
              </label>
              <label className="toggle">
                <input type="checkbox" checked={crtEnabled} onChange={toggleCRT} />
                CRT Filter {crtEnabled ? 'ON' : 'OFF'}
              </label>
              <label className="toggle">
                <input type="checkbox" checked={soundEnabled} onChange={toggleSound} />
                Sound {soundEnabled ? 'ON' : 'OFF'}
              </label>
            </div>
            {hasGoldenBike && <p className="golden-bike">🏆 Golden Bicycle Unlocked!</p>}
            <p className={`best-score ${beatBest ? 'best-score-new' : ''}`}>
              Best: {bestScore}
              {beatBest && <span className="new-record"> NEW!</span>}
            </p>
          </div>
        )}

        {screen === 'paused' && (
          <div className="overlay pause-overlay" role="dialog" aria-label="Pause menu">
            <h2>PAUSED</h2>
            <button onClick={() => {
              visibilityPausedRef.current = false;
              audioManager.resume();
              setScreen('playing');
            }}>Resume</button>
            <button onClick={handleRestart}>Restart</button>
            <div className="menu-settings">
              <label className="toggle">
                <input type="checkbox" checked={crtEnabled} onChange={toggleCRT} />
                CRT Filter {crtEnabled ? 'ON' : 'OFF'}
              </label>
              <label className="toggle">
                <input type="checkbox" checked={soundEnabled} onChange={toggleSound} />
                Sound {soundEnabled ? 'ON' : 'OFF'}
              </label>
            </div>
            <button onClick={() => setScreen('menu')}>Main Menu</button>
          </div>
        )}

        {(screen === 'gameover' || screen === 'levelcomplete') && (
          <div
            className={`overlay end-overlay ${screen === 'levelcomplete' ? 'end-overlay-win' : 'end-overlay-loss'}`}
            role="dialog"
          >
            <p className="end-emoji">{screen === 'levelcomplete' ? '🎉' : '🥯💨'}</p>
            <h2>{screen === 'levelcomplete' ? 'LEVEL COMPLETE!' : 'GAME OVER'}</h2>
            <p className="final-score">
              Score: <span className="score-value">{finalScore}</span>
            </p>
            {beatBest && (
              <p className="new-best-banner">★ NEW BEST SCORE! ★</p>
            )}
            {goldenUnlock && <p className="golden-bike">🏆 Golden Bicycle Unlocked!</p>}
            <p className="end-best">Best: {bestScore}</p>
            <button className="btn-primary" onClick={handleRestart} autoFocus>
              Ride Again
            </button>
            <button onClick={() => setScreen('menu')}>Main Menu</button>
          </div>
        )}

        {screen === 'playing' && (
          <button
            className="pause-btn"
            onClick={() => setScreen('paused')}
            aria-label="Pause game"
            tabIndex={0}
          >
            ⏸
          </button>
        )}
      </div>

      {showControlsHint && screen !== 'playing' && (
        <footer className="controls-hint">
          <span className="controls-hint-desktop">
            Space/↑ Jump · ↓ Duck · → Speed · ← Brake
          </span>
          <span className="controls-hint-mobile">Tap right: Jump · Tap left: Brake</span>
        </footer>
      )}
    </div>
  );
}
