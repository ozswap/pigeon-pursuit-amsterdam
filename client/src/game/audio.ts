/** Lightweight score obfuscation deterrent (PRD §24) */
const XOR_KEY = 0x5a3c;

export function obfuscateScore(score: number): number {
  return score ^ XOR_KEY ^ (score << 3);
}

export function deobfuscateScore(obfuscated: number): number {
  let score = obfuscated ^ XOR_KEY;
  score = score ^ (score << 3);
  return score;
}

export class AudioManager {
  private enabled: boolean;
  private ctx: AudioContext | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  playTone(freq: number, duration = 0.1, type: OscillatorType = 'square') {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playBell() {
    this.playTone(880, 0.05);
    setTimeout(() => this.playTone(880, 0.05), 80);
  }

  playDamage() {
    this.playTone(120, 0.2, 'sawtooth');
  }

  playScore() {
    this.playTone(660, 0.08);
  }

  playSwoop() {
    this.playTone(200, 0.15, 'triangle');
  }
}

export const audioManager = new AudioManager(true);
