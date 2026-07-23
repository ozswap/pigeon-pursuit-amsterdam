import { useState, useEffect, useCallback, useRef } from 'react';
import Phaser from 'phaser';
import { GameCanvas, restartGame, saveBestScore } from './game/GameCanvas';
import { toggleCRTPipeline } from './game/pipelines/CRTPipeline';
import { audioManager } from './game/audio';
import { STORAGE_KEYS, GOLDEN_BIKE_THRESHOLD } from './game/config';
import {
  createSession,
  submitScore,
  fetchLeaderboard,
  sendTelemetry,
  type LeaderboardEntry,
} from './api/client';
import './App.css';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover' | 'levelcomplete';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [crtEnabled, setCrtEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.crtEnabled) !== 'false'
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.soundEnabled) !== 'false'
  );
  const [username, setUsername] = useState(
    () => localStorage.getItem(STORAGE_KEYS.username) ?? 'Rider'
  );
  const [bestScore, setBestScore] = useState(
    () => parseInt(localStorage.getItem(STORAGE_KEYS.bestScore) ?? '0', 10)
  );
  const [finalScore, setFinalScore] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showEpilepsyWarning, setShowEpilepsyWarning] = useState(true);
  const gameRef = useRef<Phaser.Game | null>(null);
  const loadStart = useRef(performance.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && screen === 'playing') setScreen('paused');
      if (e.key === 'Escape' && screen === 'paused') setScreen('playing');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  useEffect(() => {
    createSession();
    fetchLeaderboard().then(setLeaderboard);
  }, []);

  const handleGameEvent = useCallback(
    async (event: string, data?: Record<string, unknown>) => {
      sendTelemetry(event, data);

      if (event === 'game_over' || event === 'level_complete') {
        const score = (data?.score as number) ?? 0;
        const pastries = (data?.pastries as number) ?? 0;
        const level = (data?.level as number) ?? 1;
        const cumulative = saveBestScore(score);
        setBestScore(Math.max(bestScore, score));
        setFinalScore(score);

        if (cumulative >= GOLDEN_BIKE_THRESHOLD) {
          localStorage.setItem(STORAGE_KEYS.goldenBike, 'true');
        }

        const r = await submitScore(username, score, pastries, level);
        setRank(r);
        fetchLeaderboard().then(setLeaderboard);

        setScreen(event === 'level_complete' ? 'levelcomplete' : 'gameover');
      }
    },
    [username, bestScore]
  );

  const startGame = () => {
    setShowEpilepsyWarning(false);
    setScreen('playing');
    sendTelemetry('menu_play_clicked');
  };

  const handleReady = (game: Phaser.Game) => {
    gameRef.current = game;
    const loadTime = performance.now() - loadStart.current;
    sendTelemetry('game_load_complete', { ms: loadTime });
    game.scene.start('Game', { onGameEvent: handleGameEvent });
  };

  const toggleCRT = () => {
    const next = !crtEnabled;
    setCrtEnabled(next);
    localStorage.setItem(STORAGE_KEYS.crtEnabled, String(next));
    if (gameRef.current) toggleCRTPipeline(gameRef.current);
    sendTelemetry('crt_filter_toggled', { enabled: next });
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
    if (gameRef.current) {
      restartGame(gameRef.current);
      gameRef.current.scene.start('Game', { onGameEvent: handleGameEvent });
    }
    setScreen('playing');
    setRank(null);
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

      <div className="game-wrapper">
        <GameCanvas
          active={screen === 'playing'}
          crtEnabled={crtEnabled}
          onGameEvent={handleGameEvent}
          onReady={handleReady}
        />

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
                  aria-label="Leaderboard username"
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
            <p className="best-score">Best: {bestScore}</p>
            <LeaderboardPanel entries={leaderboard} />
          </div>
        )}

        {screen === 'paused' && (
          <div className="overlay pause-overlay" role="dialog" aria-label="Pause menu">
            <h2>PAUSED</h2>
            <button onClick={() => setScreen('playing')}>Resume</button>
            <button onClick={handleRestart}>Restart</button>
            <button onClick={toggleCRT}>Toggle CRT ({crtEnabled ? 'ON' : 'OFF'})</button>
            <button onClick={toggleSound}>Sound ({soundEnabled ? 'ON' : 'OFF'})</button>
            <button onClick={() => setScreen('menu')}>Main Menu</button>
          </div>
        )}

        {(screen === 'gameover' || screen === 'levelcomplete') && (
          <div className="overlay end-overlay" role="dialog">
            <h2>{screen === 'levelcomplete' ? 'LEVEL COMPLETE!' : 'GAME OVER'}</h2>
            <p className="final-score">Score: {finalScore}</p>
            {rank && <p className="rank">Global Rank: #{rank}</p>}
            <button className="btn-primary" onClick={handleRestart} autoFocus>
              Ride Again
            </button>
            <button onClick={() => setScreen('menu')}>Main Menu</button>
            <LeaderboardPanel entries={leaderboard} />
          </div>
        )}
      </div>

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

      <footer className="controls-hint">
        Space/↑ Jump · ↓ Duck · → Speed · ← Brake · Tap right to jump on mobile
      </footer>
    </div>
  );
}

function LeaderboardPanel({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="leaderboard-empty">Leaderboard warming up…</p>;
  }
  return (
    <div className="leaderboard">
      <h3>Weekly Top 10</h3>
      <ol>
        {entries.map((e, i) => (
          <li key={`${e.username}-${e.created_at}`}>
            <span className="lb-rank">{i + 1}.</span>
            <span className="lb-name">{e.username}</span>
            <span className="lb-score">{e.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
