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
  vec2 offset = centered.yx / vec2(6.0, 5.0);
  vec2 distorted = centered + centered * offset * offset;
  uv = (distorted + 1.0) * 0.5;
  vec4 col;
  col.r = texture2D(uMainSampler, uv + vec2(-0.002, 0.0)).r;
  col.g = texture2D(uMainSampler, uv).g;
  col.b = texture2D(uMainSampler, uv + vec2(0.002, 0.0)).b;
  col.a = 1.0;
  float scanline = sin(uv.y * uResolution.y * 3.14159) * 0.08;
  col.rgb -= scanline;
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  if (lum > 0.8) col.rgb += 0.05;
  float vignette = 1.0 - dot(centered, centered) * 0.35;
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

export function registerCRTPipeline(game: Phaser.Game) {
  if (game.renderer.type === Phaser.WEBGL) {
    const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!renderer.pipelines.has('CRT')) {
      renderer.pipelines.addPostPipeline('CRT', CRTPipeline);
    }
    const scene = game.scene.getScenes(true)[0];
    scene?.cameras.main.setPostPipeline('CRT');
  }
}

export function setCRTPipelineEnabled(_game: Phaser.Game, enabled: boolean) {
  crtEnabled = enabled;
}

export function toggleCRTPipeline(game: Phaser.Game): boolean {
  crtEnabled = !crtEnabled;
  const scene = game.scene.getScenes(true)[0];
  if (!scene) return crtEnabled;
  if (!crtEnabled && game.renderer.type === Phaser.WEBGL) {
    scene.cameras.main.resetPostPipeline();
  } else if (crtEnabled) {
    registerCRTPipeline(game);
  }
  return crtEnabled;
}
