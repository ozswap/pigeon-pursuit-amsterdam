import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameScene } from './GameScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const raw = '/assets/raw';
    this.load.image('cyclist_sheet', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c-ca4a9e5b-2a6c-49f3-b201-856e3f761e0b.png`);
    this.load.image('pigeon_sheet', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__1_-d23e3af7-b5a2-4089-bf0c-f73a0c07def1.png`);
    this.load.image('pigeon_sheet2', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__2_-d63e7c63-ecb6-466b-863f-2b579849766d.png`);
    this.load.image('pastry_stack', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__3_-e12ca839-68e9-47be-b729-a391c8194d63.png`);
    this.load.image('score_100', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__4_-61cacb89-86d2-40a0-a17e-f448def1053a.png`);
    this.load.image('pastry_single', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__5_-b38897b1-da5a-4c56-bd10-dd038c73a4dd.png`);
    this.load.image('level_complete', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__6_-402e31e6-7859-41d6-8fdf-72eea1c74994.png`);
    this.load.image('bg_parallax', `${raw}/Gemini_Generated_Image_rl2cnerl2cnerl2c__6_-402e31e6-7859-41d6-8fdf-72eea1c74994.png`);
  }

  create() {
    this.textures.get('cyclist_sheet').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('pigeon_sheet').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('pigeon_sheet2').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('pastry_stack').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('pastry_single').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('score_100').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('level_complete').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('bg_parallax').setFilter(Phaser.Textures.FilterMode.NEAREST);

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
