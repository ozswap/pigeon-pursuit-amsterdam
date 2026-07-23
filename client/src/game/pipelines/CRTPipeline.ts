import Phaser from 'phaser';

const fragShader = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCRTEnabled;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  if (uCRTEnabled < 0.5) {
    gl_FragColor = texture2D(uMainSampler, uv);
    return;
  }
  vec2 centered = uv * 2.0 - 1.0;
  vec2 offset = centered.yx / vec2(8.0, 8.0);
  vec2 distorted = centered + centered * offset * offset;
  uv = clamp((distorted + 1.0) * 0.5, 0.001, 0.999);
  vec4 col;
  col.r = texture2D(uMainSampler, uv + vec2(-0.001, 0.0)).r;
  col.g = texture2D(uMainSampler, uv).g;
  col.b = texture2D(uMainSampler, uv + vec2(0.001, 0.0)).b;
  col.a = 1.0;
  // Subtle scanline phase via uTime; low amplitude avoids visible flicker (App flicker warning is cosmetic).
  float scanline = sin(uv.y * uResolution.y * 3.14159 + uTime * 2.0) * 0.04;
  col.rgb -= scanline;
  float vignette = 1.0 - dot(centered, centered) * 0.20;
  col.rgb *= vignette;
  gl_FragColor = col;
}
`;

let crtEnabled = true;

export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, name: 'CRT', fragShader });
  }

  onPreRender() {
    this.set2f('uResolution', this.game.config.width as number, this.game.config.height as number);
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uCRTEnabled', crtEnabled ? 1 : 0);
  }
}

export function isCRTPipelineEnabled(): boolean {
  return crtEnabled;
}

export function registerCRTPipeline(camera: Phaser.Cameras.Scene2D.Camera, game: Phaser.Game) {
  if (game.renderer.type !== Phaser.WEBGL) return;
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.pipelines.has('CRT')) {
    renderer.pipelines.addPostPipeline('CRT', CRTPipeline);
  }
  camera.setPostPipeline('CRT');
}

function getGameCamera(game: Phaser.Game): Phaser.Cameras.Scene2D.Camera | null {
  const scene = game.scene.getScene('Game');
  if (!scene?.scene.isActive() && !scene?.scene.isPaused()) return null;
  return scene.cameras.main;
}

export function setCRTPipelineEnabled(game: Phaser.Game, enabled: boolean) {
  crtEnabled = enabled;
  game.registry.set('crtEnabled', enabled);
  if (game.renderer.type !== Phaser.WEBGL) return;

  const camera = getGameCamera(game);
  if (!camera) return;

  if (enabled) {
    registerCRTPipeline(camera, game);
  } else {
    camera.resetPostPipeline();
  }
}

export function toggleCRTPipeline(game: Phaser.Game): boolean {
  setCRTPipelineEnabled(game, !crtEnabled);
  return crtEnabled;
}
