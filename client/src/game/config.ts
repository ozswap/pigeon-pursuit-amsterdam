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
  telegraphDuration: 1000,
  perfectDodgeWindow: 18,
  startingPastries: 10,
  groundY: 150,
  playerX: 80,
  jumpBufferMs: 100,
  coyoteTimeMs: 80,
};

/** Level progression — distance gates and variant unlocks. */
export const PROGRESSION = {
  levelDistance: 3000,
  levelCompleteDistance: 24000,
  flockUnlockLevel: 5,
  divebomberUnlockLevel: 4,
};

/** Pigeon spawn pacing — gentler early curve, ramps with distance. */
export const SPAWN = {
  initialDelay: 2.5,
  baseInterval: 3.0,
  minInterval: 1.3,
  rampPerMeter: 0.00055,
};

export const HITBOX = {
  playerCore: { w: 24, h: 48 },
  pigeonBeak: { w: 14, h: 14 },
};

export const SCORING = {
  dodge: 100,
  perfectDodge: 250,
  levelComplete: 1000,
  pastryBonus: 200,
};

/** Parallax layers — sky is a solid color in GameScene, not an image. */
export const PARALLAX = [
  { key: 'bg_buildings', speed: 0.15, y: 16, height: 42 },
  { key: 'bg_canal', speed: 0.32, y: 57, height: 34 },
  { key: 'bg_path', speed: 0.65, y: 90, height: 30 },
  { key: 'spr_fence_tile', speed: 1.0, y: 122, height: 38, tileScale: 1 },
] as const;

/** Hazy Amsterdam sky sampled from level-complete left panel art. */
export const SKY_COLOR = 0x696e92;

export const STORAGE_KEYS = {
  bestScore: 'canal_courier_best_score',
  cumulative: 'canal_courier_cumulative',
  crtEnabled: 'canal_courier_crt',
  soundEnabled: 'canal_courier_sound',
  controlsSeen: 'canal_courier_controls_seen',
  username: 'canal_courier_username',
  goldenBike: 'canal_courier_golden_bike',
};

export const GOLDEN_BIKE_THRESHOLD = 50_000;
