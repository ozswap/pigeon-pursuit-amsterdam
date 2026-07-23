export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

export const PHYSICS = {
  baseScrollSpeed: 300,
  gravity: 1200,
  jumpVelocity: -600,
  terminalVelocity: 800,
  jumpMaxHeight: 64,
  duckHitboxReduction: 0.4,
  speedUpMultiplier: 1.5,
  brakeMultiplier: 0.75,
  iFrameDuration: 1500,
  telegraphDuration: 800,
  startingPastries: 10,
  groundY: 150,
  playerX: 80,
};

export const HITBOX = {
  playerCore: { w: 24, h: 48 },
  pigeonBeak: { w: 12, h: 12 },
  cargoW: 16,
  cargoHPerPastry: 8,
};

export const SCORING = {
  dodge: 100,
  perfectDodge: 250,
  levelComplete: 1000,
  pastryBonus: 200,
  perfectWindowMs: 100,
};

export const PARALLAX = [
  { key: 'bg_scene', speed: 0.5, y: 16 },
  { key: 'bg_foreground', speed: 1.5, y: 140 },
];

export const STORAGE_KEYS = {
  bestScore: 'canal_courier_best_score',
  cumulative: 'canal_courier_cumulative',
  crtEnabled: 'canal_courier_crt',
  soundEnabled: 'canal_courier_sound',
  username: 'canal_courier_username',
  goldenBike: 'canal_courier_golden_bike',
};

export const GOLDEN_BIKE_THRESHOLD = 50_000;
