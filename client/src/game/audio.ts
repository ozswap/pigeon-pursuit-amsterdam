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

const BGM_MELODY = [262, 294, 330, 349, 392, 349, 330, 294] as const;
const BGM_BASS = [131, 147, 165, 175, 196, 175, 165, 147] as const;

export class AudioManager {
  private enabled: boolean;
  private ctx: AudioContext | null = null;
  private bgmTimer: ReturnType<typeof setInterval> | null = null;
  private bgmStep = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stopBGM();
  }

  resume() {
    void this.ctx?.resume();
  }

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration = 0.1,
    type: OscillatorType = 'square',
    volume = 0.08,
    startOffset = 0,
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startOffset);
    osc.stop(ctx.currentTime + startOffset + duration);
  }

  private playArpeggio(notes: number[], noteLen = 0.06, volume = 0.06) {
    notes.forEach((freq, i) => this.playTone(freq, noteLen, 'square', volume, i * noteLen * 0.85));
  }

  playBell() {
    this.playTone(880, 0.06, 'sine', 0.1);
    this.playTone(1320, 0.08, 'sine', 0.06, 0.05);
    this.playTone(1760, 0.1, 'sine', 0.04, 0.1);
  }

  playDamage() {
    this.playTone(90, 0.25, 'sawtooth', 0.12);
    this.playTone(55, 0.35, 'square', 0.08, 0.05);
    this.playArpeggio([180, 140, 100, 70], 0.05, 0.05);
  }

  playScore() {
    this.playArpeggio([523, 659, 784], 0.07, 0.07);
  }

  playSwoop() {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  playLand() {
    this.playTone(180, 0.04, 'triangle', 0.06);
  }

  startBGM() {
    this.stopBGM();
    if (!this.enabled) return;
    this.bgmStep = 0;
    this.bgmTimer = setInterval(() => {
      const i = this.bgmStep % BGM_MELODY.length;
      this.playTone(BGM_MELODY[i], 0.14, 'triangle', 0.028);
      if (i % 2 === 0) {
        this.playTone(BGM_BASS[i], 0.2, 'triangle', 0.025);
      }
      this.bgmStep += 1;
    }, 280);
  }

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const audioManager = new AudioManager(true);
