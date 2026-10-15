import { describe, it, expect } from 'vitest';
import { LEVELS, validateLevelSolvability } from '../src/levels/LevelData.js';

describe('Level Geometry & Solvability Validator', () => {
  it('has exactly 4 hand-crafted progressive courses', () => {
    expect(LEVELS.length).toBe(4);
  });

  LEVELS.forEach((level) => {
    it(`validates that Level ${level.id} ("${level.name}") is solvable via BFS`, () => {
      const result = validateLevelSolvability(level);

      expect(result.start).toBeDefined();
      expect(result.goal).toBeDefined();
      expect(result.solvable).toBe(true);
      expect(result.pathLength).toBeGreaterThan(5);

      // Verify bounds
      const rows = level.grid.length;
      const cols = level.grid[0].length;
      expect(result.start!.x).toBeGreaterThanOrEqual(0);
      expect(result.start!.x).toBeLessThan(cols);
      expect(result.start!.y).toBeGreaterThanOrEqual(0);
      expect(result.start!.y).toBeLessThan(rows);
    });
  });

  it('detects an unsolvable blocked level correctly', () => {
    const blockedLevel = {
      id: 99,
      name: 'Blocked Level',
      subtitle: 'Testing blocked path',
      cellSize: 1.0,
      wallHeight: 0.5,
      grid: [
        '#####',
        '#S#G#',
        '#####',
      ],
    };

    const result = validateLevelSolvability(blockedLevel);
    expect(result.solvable).toBe(false);
    expect(result.pathLength).toBe(-1);
  });
});
