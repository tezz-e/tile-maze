import { describe, it, expect } from 'vitest';
import { OneEuroFilter } from '../src/input/OneEuroFilter.js';

describe('Adaptive One Euro Filter', () => {
  it('suppresses micro-tremors and noise when signal is stationary at rest', () => {
    const filter = new OneEuroFilter(1.0, 0.4);

    // Initial value at 0.0
    let timestamp = 1000;
    filter.filter(0.0, timestamp);

    // Inject 10 frames of micro-noise ±0.03
    let filteredVal = 0.0;
    for (let i = 0; i < 20; i++) {
      timestamp += 16.6; // ~60Hz
      const noise = (Math.sin(i * 1.5) * 0.03);
      filteredVal = filter.filter(noise, timestamp);
    }

    // Filtered output should be significantly damped towards 0
    expect(Math.abs(filteredVal)).toBeLessThan(0.015);
  });

  it('rapidly follows fast flicks without phase lag', () => {
    const filter = new OneEuroFilter(1.0, 0.4);

    let timestamp = 1000;
    filter.filter(0.0, timestamp);

    // Sudden rapid jump from 0.0 to 1.0 within 3 frames
    let out = 0.0;
    for (let i = 1; i <= 3; i++) {
      timestamp += 16.6;
      out = filter.filter(1.0, timestamp);
    }

    // High velocity flick should quickly reach close to 1.0
    expect(out).toBeGreaterThan(0.65);
  });
});
