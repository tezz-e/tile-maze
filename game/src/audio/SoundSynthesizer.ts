/**
 * Procedural Web Audio Synthesizer
 * Tiltmaze: Kinetic Edition
 * 
 * Synthesizes rolling, bounce, impact, hole fall, and win fanfares
 * with zero external audio assets.
 */

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollSource: AudioBufferSourceNode | null = null;
  private isRolling = false;
  private isMuted = false;

  constructor() {
    // AudioContext will be initialized on first user interaction to comply with browser autoplay policies
  }

  public resume(): void {
    this.initContext();
  }

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.initRollLoop();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private initRollLoop(): void {
    if (!this.ctx) return;

    // Generate 2 seconds of white noise buffer for continuous surface rolling sound
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(150, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start(0);

    this.rollSource = whiteNoise;
    this.rollFilter = filter;
    this.rollGain = gain;
    this.isRolling = true;
  }

  /**
   * Modulates the marble rolling noise according to speed (m/s).
   */
  public updateRollSpeed(speed: number): void {
    if (!this.ctx || !this.rollGain || !this.rollFilter || this.isMuted) return;

    const clampedSpeed = Math.min(Math.max(speed, 0), 15);
    const norm = clampedSpeed / 15;

    const targetGain = norm > 0.05 ? norm * 0.18 : 0.0001;
    const targetFreq = 120 + norm * 450;

    const now = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(targetGain, now, 0.05);
    this.rollFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);
  }

  /**
   * Resonant impact sound when marble collides with a wall or obstacle.
   */
  public playImpact(intensity: number): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const clampedIntensity = Math.min(Math.max(intensity, 0.1), 1.0);
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    // Frequency drops slightly on impact (metallic click)
    const baseFreq = 220 + clampedIntensity * 280;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(clampedIntensity * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Descending pitch drop when marble falls into a hazard hole.
   */
  public playHoleFall(): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.45);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.52);
  }

  /**
   * Harmonic chime when marble reaches a checkpoint.
   */
  public playCheckpoint(): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const notes = [523.25, 659.25]; // C5, E5
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  /**
   * Ascending arpeggio when marble reaches the goal!
   */
  public playWin(): void {
    this.playLevelCompleteChime();
  }

  /**
   * Ascending bell-like harmonic celebration chime for level completion.
   */
  public playLevelCompleteChime(): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    });
  }

  /**
   * Sudden air burst sound on phone shake / jump.
   */
  public playShake(): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * Nitro boost propulsion sound.
   */
  public playBoost(): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.25);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /**
   * High-energy spring twang sound when marble hits BlockBouncer spring pad.
   */
  public playSpring(): void {
    const ctx = this.initContext();
    if (this.isMuted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.28);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }
}
