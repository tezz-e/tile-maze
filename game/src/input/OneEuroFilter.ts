/**
 * Adaptive One Euro Filter
 * 
 * Provides jitter reduction at low velocities (rest) while eliminating lag
 * during high-speed movements.
 * 
 * Reference: Casiez et al., "1 € Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Human-Computer Interaction", CHI 2012.
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(val: number, alpha: number): number {
    this.y = val;
    if (this.s === null) {
      this.s = val;
      return val;
    }
    this.s = alpha * val + (1.0 - alpha) * this.s;
    return this.s;
  }

  public lastRaw(): number | null {
    return this.y;
  }

  public lastFiltered(): number | null {
    return this.s;
  }

  public reset(val?: number): void {
    if (val !== undefined) {
      this.y = val;
      this.s = val;
    } else {
      this.y = null;
      this.s = null;
    }
  }
}

export class OneEuroFilter {
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  /**
   * @param minCutoff Minimum cutoff frequency in Hz (lower = smoother at rest)
   * @param beta Speed coefficient (higher = faster response to quick changes)
   * @param dCutoff Cutoff frequency for derivative in Hz
   */
  constructor(
    public minCutoff: number = 1.0,
    public beta: number = 0.4,
    public dCutoff: number = 1.0
  ) {}

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Filter value x at timestamp (in seconds or milliseconds).
   */
  public filter(x: number, timestamp: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      this.dxFilter.filter(0, 1.0);
      return this.xFilter.filter(x, 1.0);
    }

    // Convert ms to seconds if timestamp delta is in milliseconds (> 0.5ms)
    const rawDt = timestamp - this.lastTime;
    const dt = rawDt > 0.5 ? rawDt / 1000.0 : rawDt;

    if (dt <= 0) {
      return this.xFilter.lastFiltered() ?? x;
    }

    this.lastTime = timestamp;
    const rate = dt > 0.0001 ? 1.0 / dt : 60.0;

    // Estimate derivative from previous RAW sample (Casiez et al. 2012)
    const prevRaw = this.xFilter.lastRaw() ?? x;
    const dx = (x - prevRaw) * rate;

    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // Dynamic cutoff frequency
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter value with dynamic cutoff
    return this.xFilter.filter(x, this.alpha(rate, cutoff));
  }

  public reset(value?: number): void {
    if (value !== undefined) {
      this.xFilter.reset(value);
      this.dxFilter.reset(0);
    } else {
      this.xFilter.reset();
      this.dxFilter.reset();
    }
    this.lastTime = null;
  }

  public get lastDerivative(): number {
    return this.dxFilter.lastFiltered() ?? 0;
  }
}
