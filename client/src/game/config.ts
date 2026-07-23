export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

export const PHYSICS = {
  baseScrollSpeed: 300,
  gravity: 1200,
  jumpVelocity: -600,
  terminalVelocity: 800,
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
};

export const SCORING = {
  dodge: 100,
  perfectDodge: 250,
  levelComplete: 1000,
  pastryBonus: 200,
};

/** Parallax layers — sky is a solid color in GameScene, not an image. */
export const PARALLAX = [
  { key: 'bg_buildings', speed: 0.25, y: 18, height: 45 },
  { key: 'bg_canal', speed: 0.5, y: 62, height: 36 },
  { key: 'bg_path', speed: 0.85, y: 98, height: 32 },
  { key: 'spr_fence_tile', speed: 1.4, y: 142, height: 38, tileScale: 1 },
] as const;

export const SKY_COLOR = 0x6a9ab8;

export const STORAGE_KEYS = {
  bestScore: 'canal_courier_best_score',
  cumulative: 'canal_courier_cumulative',
  crtEnabled: 'canal_courier_crt',
  soundEnabled: 'canal_courier_sound',
  username: 'canal_courier_username',
  goldenBike: 'canal_courier_golden_bike',
};

export const GOLDEN_BIKE_THRESHOLD = 50_000;
