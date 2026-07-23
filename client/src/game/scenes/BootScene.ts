import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameScene } from './GameScene';

const SPRITES = '/assets/sprites';

const IMAGE_ASSETS: { key: string; path: string }[] = [
  { key: 'spr_player_pedal_0', path: `${SPRITES}/spr_player_pedal_0.png` },
  { key: 'spr_player_pedal_1', path: `${SPRITES}/spr_player_pedal_1.png` },
  { key: 'spr_player_pedal_2', path: `${SPRITES}/spr_player_pedal_2.png` },
  { key: 'spr_player_pedal_3', path: `${SPRITES}/spr_player_pedal_3.png` },
  { key: 'spr_player_idle', path: `${SPRITES}/spr_player_idle.png` },
  { key: 'spr_player_jump', path: `${SPRITES}/spr_player_jump.png` },
  { key: 'spr_pigeon_0', path: `${SPRITES}/spr_pigeon_0.png` },
  { key: 'spr_pigeon_1', path: `${SPRITES}/spr_pigeon_1.png` },
  { key: 'spr_pigeon_2', path: `${SPRITES}/spr_pigeon_2.png` },
  { key: 'spr_pigeon_3', path: `${SPRITES}/spr_pigeon_3.png` },
  { key: 'spr_pigeon_4', path: `${SPRITES}/spr_pigeon_4.png` },
  { key: 'spr_pastry_stack', path: `${SPRITES}/spr_pastry_stack.png` },
  { key: 'spr_pastry_single', path: `${SPRITES}/spr_pastry_single.png` },
  { key: 'spr_score_100', path: `${SPRITES}/spr_score_100.png` },
  { key: 'spr_level_complete', path: `${SPRITES}/spr_level_complete.png` },
  { key: 'spr_telegraph_arrow', path: `${SPRITES}/spr_telegraph_arrow.png` },
  { key: 'spr_smoke_0', path: `${SPRITES}/spr_smoke_0.png` },
  { key: 'spr_smoke_1', path: `${SPRITES}/spr_smoke_1.png` },
  { key: 'spr_smoke_2', path: `${SPRITES}/spr_smoke_2.png` },
  { key: 'spr_smoke_3', path: `${SPRITES}/spr_smoke_3.png` },
  { key: 'spr_smoke_4', path: `${SPRITES}/spr_smoke_4.png` },
  { key: 'spr_smoke_5', path: `${SPRITES}/spr_smoke_5.png` },
  { key: 'spr_fence_tile', path: `${SPRITES}/spr_fence_tile.png` },
  { key: 'bg_scene', path: `${SPRITES}/bg_scene.png` },
];

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
    input: {
      keyboard: true,
    },
    callbacks: {
      preBoot: (game) => {
        game.registry.set('crtEnabled', crtEnabled);
      },
    },
  });
}
