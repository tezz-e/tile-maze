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

    // 4. Approach ramp cell (x=4, y=10) -> returns second hint
    const rampX = originX + 4 * l1.cellSize + l1.cellSize / 2;
    const rampZ = originZ + 10 * l1.cellSize + l1.cellSize / 2;
    expect(checkCoachHints({ x: rampX, z: rampZ }, l1, shown)).toBe('HOLD NITRO ON THE RAMP');

    // 5. Approach spinner cell (x=4, y=7) -> returns third hint
    const spinX = originX + 4 * l1.cellSize + l1.cellSize / 2;
    const spinZ = originZ + 7 * l1.cellSize + l1.cellSize / 2;
    expect(checkCoachHints({ x: spinX, z: spinZ }, l1, shown)).toBe('TIME YOUR PASS BETWEEN THE ARMS');

    // 6. Approach bounce pad cell (x=2, y=4) -> returns fourth hint
    const bncX = originX + 2 * l1.cellSize + l1.cellSize / 2;
    const bncZ = originZ + 4 * l1.cellSize + l1.cellSize / 2;
    expect(checkCoachHints({ x: bncX, z: bncZ }, l1, shown)).toBe('SHAKE TO JUMP (OPTIONAL)');
  });

  it('formats time with exact centisecond precision without IEEE-754 float drift', () => {
    const formatTime = (totalSecs: number): string => {
      const totalCentis = Math.round(totalSecs * 100);
      const mins = Math.floor(totalCentis / 6000);
      const secs = Math.floor((totalCentis % 6000) / 100);
      const cs = totalCentis % 100;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    };

    expect(formatTime(0)).toBe('00:00.00');
    expect(formatTime(75.2)).toBe('01:15.20');
    expect(formatTime(75.05)).toBe('01:15.05');
    expect(formatTime(125.99)).toBe('02:05.99');
    expect(formatTime(3599.99)).toBe('59:59.99');
  });
});
