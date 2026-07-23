import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameScene } from './GameScene';
import cyclistSheet from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c-381f7157-9da0-4d3c-85f7-12cd1f0f95c7.png';
import pigeonSheet from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c__1_-d795843a-11ba-4728-9c55-000a1c69810f.png';
import pigeonSheet2 from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c__2_-d4d27ed2-1de3-4945-938a-65763d8624a2.png';
import pastryStack from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c__3_-e9a8ac8b-6c58-47fa-a9ac-65e674b72812.png';
import score100 from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c__4_-2f846216-a6bf-4330-bd62-ff4bf5635033.png';
import pastrySingle from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c__5_-fdedc523-7aa3-4f45-bacd-e4aefa5c975e.png';
import levelComplete from '../../../public/assets/raw/Gemini_Generated_Image_rl2cnerl2cnerl2c__6_-b6fa4ed8-ef4d-4418-b743-7583ac80adbe.png';
import telegraphArrow from '../../../public/assets/raw/Gemini_Generated_Image_miqebhmiqebhmiqe__1_-4ee5f804-ee6e-4ee1-955f-5ba59cbe07eb.png';
import smokeVfx from '../../../public/assets/raw/Gemini_Generated_Image_miqebhmiqebhmiqe__2_-112391b5-f155-4757-8d16-35bbee94a205.png';
import fenceTile from '../../../public/assets/raw/Gemini_Generated_Image_miqebhmiqebhmiqe__3_-0e37e756-f43c-4d99-807f-7e603fbabad1.png';

const TEXTURE_KEYS = [
  'cyclist_sheet',
  'pigeon_sheet',
  'pigeon_sheet2',
  'pastry_stack',
  'pastry_single',
  'score_100',
  'level_complete',
  'bg_parallax',
  'telegraph_arrow',
  'smoke_vfx',
  'fence_tile',
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('cyclist_sheet', cyclistSheet);
    this.load.image('pigeon_sheet', pigeonSheet);
    this.load.image('pigeon_sheet2', pigeonSheet2);
    this.load.image('pastry_stack', pastryStack);
    this.load.image('score_100', score100);
    this.load.image('pastry_single', pastrySingle);
    this.load.image('level_complete', levelComplete);
    this.load.image('bg_parallax', levelComplete);
    this.load.image('telegraph_arrow', telegraphArrow);
    this.load.image('smoke_vfx', smokeVfx);
    this.load.image('fence_tile', fenceTile);
  }

  create() {
    for (const key of TEXTURE_KEYS) {
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
