import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameScene } from './GameScene';

const SPRITES = '/assets/sprites';

/** Every texture the game loads — individual PNGs only, no runtime cropping. */
const IMAGE_ASSETS: { key: string; path: string }[] = [
  // Player
  'spr_player_pedal_0',
  'spr_player_pedal_1',
  'spr_player_pedal_2',
  'spr_player_pedal_3',
  'spr_player_idle',
  'spr_player_jump',
  // Pigeons
  'spr_pigeon_0',
  'spr_pigeon_1',
  'spr_pigeon_2',
  'spr_pigeon_3',
  'spr_pigeon_4',
  // Pickups & UI
  'spr_pastry_stack',
  'spr_pastry_single',
  'spr_score_100',
  'spr_level_complete',
  'spr_telegraph_arrow',
  // VFX
  'spr_smoke_0',
  'spr_smoke_1',
  'spr_smoke_2',
  'spr_smoke_3',
  'spr_smoke_4',
  'spr_smoke_5',
  // Parallax
  'bg_buildings',
  'bg_canal',
  'bg_path',
  'spr_fence_tile',
].map((key) => ({ key, path: `${SPRITES}/${key}.png` }));

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    for (const { key, path } of IMAGE_ASSETS) {
      this.load.image(key, path);
    }
  }

  create() {
    for (const { key } of IMAGE_ASSETS) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.registry.set('loadTime', performance.now());
    this.events.emit('assets-ready');
  }
}

export function createGame(parent: HTMLElement, crtEnabled: boolean): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: '#1a1a2e',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, GameScene],
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
    },
    fps: { target: 60, forceSetTimeOut: false },
    input: { keyboard: true },
    callbacks: {
      preBoot: (game) => {
        game.registry.set('crtEnabled', crtEnabled);
      },
    },
  });
}
