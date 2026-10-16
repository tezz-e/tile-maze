import { describe, it, expect } from 'vitest';
import { LEVELS, validateLevelSolvability, checkCoachHints } from '../src/levels/LevelData.js';

describe('Level Geometry & Solvability Validator', () => {
  it('has exactly 4 hand-crafted progressive courses', () => {
    expect(LEVELS.length).toBe(4);
  });

  it('ensures every row of every level has the same length as the first row', () => {
    LEVELS.forEach((level) => {
      const expectedLen = level.grid[0].length;
      level.grid.forEach((row, rowIndex) => {
        expect(row.length, `Level ${level.id} row ${rowIndex} should have length ${expectedLen}`).toBe(expectedLen);
      });
    });
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

  it('verifies Level 1 contains the 4 tutorial coach hints', () => {
    const l1 = LEVELS[0];
    expect(l1.hints).toBeDefined();
    expect(l1.hints!.length).toBe(4);
    const texts = l1.hints!.map((h) => h.text);
    expect(texts).toContain('TILT YOUR PHONE TO ROLL');
    expect(texts).toContain('HOLD NITRO ON THE RAMP');
    expect(texts).toContain('TIME YOUR PASS BETWEEN THE ARMS');
    expect(texts).toContain('SHAKE TO JUMP (OPTIONAL)');
  });

  it('triggers coach hints only when near cell and at most once per session', () => {
    const l1 = LEVELS[0];
    const shown = new Set<string>();

    const rows = l1.grid.length;
    const cols = l1.grid[0].length;
    const originX = -(cols * l1.cellSize) / 2;
    const originZ = -(rows * l1.cellSize) / 2;

    // Start hint is at x=4, y=13
    const startX = originX + 4 * l1.cellSize + l1.cellSize / 2;
    const startZ = originZ + 13 * l1.cellSize + l1.cellSize / 2;

    // 1. Far away -> returns null
    const farPos = { x: startX + 10.0, z: startZ + 10.0 };
    expect(checkCoachHints(farPos, l1, shown)).toBeNull();

    // 2. Near start cell -> returns first hint
    const nearPos = { x: startX, z: startZ };
    const hint1 = checkCoachHints(nearPos, l1, shown);
    expect(hint1).toBe('TILT YOUR PHONE TO ROLL');
    expect(shown.has('TILT YOUR PHONE TO ROLL')).toBe(true);

    // 3. Near start cell again -> returns null (already shown once)
    expect(checkCoachHints(nearPos, l1, shown)).toBeNull();
  });
});
