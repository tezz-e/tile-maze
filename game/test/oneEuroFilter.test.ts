import { describe, it, expect } from 'vitest';
import { OneEuroFilter } from '../src/input/OneEuroFilter.js';

describe('Adaptive One Euro Filter', () => {
  it('suppresses micro-tremors and noise when signal is stationary at rest', () => {
    const filter = new OneEuroFilter(1.0, 0.4);

    // Initial value at 0.0
    let timestamp = 1000;
    filter.filter(0.0, timestamp);

    // Inject 20 frames of micro-noise ±0.03
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

    // High velocity flick should quickly reach responsive level (> 0.55)
    // without suffering from lagging speed estimate
    expect(out).toBeGreaterThan(0.55);
  });

  it('does not suffer from lag-induced speed inflation when returning to steady state at rest', () => {
    const filter = new OneEuroFilter(1.0, 0.4);

    let timestamp = 1000;
    filter.filter(0.0, timestamp);

    // Fast flick from 0.0 to 1.0
    timestamp += 16.6;
    filter.filter(1.0, timestamp);
    const speedDuringFlick = filter.lastDerivative;
    expect(speedDuringFlick).toBeGreaterThan(4);

    // Signal holds steady at 1.0 for ~400ms (25 frames at rest)
    for (let i = 0; i < 25; i++) {
      timestamp += 16.6;
      filter.filter(1.0, timestamp);
    }

    // Because derivative is computed from previous raw samples (1.0 - 1.0 = 0),
    // derivative decays to ~0 rather than remaining inflated by filter lag
    expect(filter.lastDerivative).toBeLessThan(0.5);
    // And output settles cleanly at the steady-state target value
    expect(filter.filter(1.0, timestamp + 16.6)).toBeGreaterThan(0.95);
  });
});
