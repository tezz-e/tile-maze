import { describe, it, expect } from 'vitest';
import { LEVELS, validateLevelSolvability, validateCorridorWidth, checkCoachHints, getBoostRampOrientation } from '../src/levels/LevelData.js';

describe('Level Geometry & Solvability Validator', () => {
  it('has exactly 6 hand-crafted progressive courses', () => {
    expect(LEVELS.length).toBe(6);
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

  it('strictly escalates safe path step counts across courses 1 through 6', () => {
    const lengths = LEVELS.map((lvl) => validateLevelSolvability(lvl).pathLength);
    expect(lengths).toEqual([15, 20, 22, 28, 39, 47]);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThan(lengths[i - 1]);
    }
  });

  it('validates Level 3 unequal branching: safe route (25 steps) vs risky jump shortcut (22 steps)', () => {
    const l3 = LEVELS[2];
    const safeResult = validateLevelSolvability(l3, false, false);
    expect(safeResult.solvable).toBe(true);
    expect(safeResult.pathLength).toBe(25);

    const riskyResult = validateLevelSolvability(l3, false, true);
    expect(riskyResult.solvable).toBe(true);
    expect(riskyResult.pathLength).toBe(22);
    expect(riskyResult.pathLength).toBeLessThan(safeResult.pathLength);
  });

  it('requires aerial jump edge to solve Level 1 over the cloud sea gap', () => {
    const l1 = LEVELS[0];
    const withoutJump = validateLevelSolvability(l1, false, false);
    expect(withoutJump.solvable).toBe(false);

    const withJump = validateLevelSolvability(l1, false, true);
    expect(withJump.solvable).toBe(true);
    expect(withJump.pathLength).toBe(15);
  });

  it('verifies Level 4 contains Kinetic Speedway mechanics: boost sweeps, catch-walls, and open abyss exits', () => {
    const l4 = LEVELS[3];
    const gridStr = l4.grid.join('');
    expect((gridStr.match(/R/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((gridStr.match(/#/g) || []).length).toBeGreaterThan(0);
    expect((gridStr.match(/ /g) || []).length).toBeGreaterThan(0);
  });

  it('verifies Level 6 contains required mechanics: dual rotors, spring leap, ramps, and optional hazard hole', () => {
    const l6 = LEVELS[5];
    const gridStr = l6.grid.join('');
    expect((gridStr.match(/P/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((gridStr.match(/J/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((gridStr.match(/R/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((gridStr.match(/H/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('verifies all 6 courses satisfy minimum corridor width rules', () => {
    LEVELS.forEach((level) => {
      const res = validateCorridorWidth(level);
      expect(res.valid, `Level ${level.id} corridor violations: ${JSON.stringify(res.violations)}`).toBe(true);
    });
  });

  it('verifies all 6 levels maintain camera-honest flow with <= 3 consecutive southward steps', () => {
    LEVELS.forEach((level) => {
      const res = validateLevelSolvability(level);
      expect(res.solvable).toBe(true);
      expect(res.maxConsecutiveSouthwardSteps).toBeLessThanOrEqual(3);
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

  it('verifies Level 1 contains the 3 tutorial coach hints', () => {
    const l1 = LEVELS[0];
    expect(l1.hints).toBeDefined();
    expect(l1.hints!.length).toBe(3);
    const texts = l1.hints!.map((h) => h.text);
    expect(texts).toContain('TILT YOUR PHONE TO ROLL');
    expect(texts).toContain('STEER THROUGH THE CHICANE');
    expect(texts).toContain('COLLECT CHECKPOINT TO PROCEED');
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

    // 4. Approach chicane cell (x=3, y=9) -> returns second hint
    const chicaneX = originX + 3 * l1.cellSize + l1.cellSize / 2;
    const chicaneZ = originZ + 9 * l1.cellSize + l1.cellSize / 2;
    expect(checkCoachHints({ x: chicaneX, z: chicaneZ }, l1, shown)).toBe('STEER THROUGH THE CHICANE');

    // 5. Approach checkpoint cell (x=4, y=5) -> returns third hint
    const cpX = originX + 4 * l1.cellSize + l1.cellSize / 2;
    const cpZ = originZ + 5 * l1.cellSize + l1.cellSize / 2;
    expect(checkCoachHints({ x: cpX, z: cpZ }, l1, shown)).toBe('COLLECT CHECKPOINT TO PROCEED');
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

  it('correctly aligns boost ramps: Level 1 launches forward (North, -Z) across gap, Level 2 launches East (+X)', () => {
    // Level 1: Launch ramp at row 4, col 4 must face North (-Z) across the chasm towards the goal
    const l1 = LEVELS[0];
    const l1Ramp = getBoostRampOrientation(l1.grid, 4, 4);
    expect(l1Ramp.dirZ).toBe(-1);
    expect(l1Ramp.dirX).toBe(0);
    expect(l1Ramp.angleY).toBe(0);

    // Level 2: Horizontal runway ramp at row 9, col 3 must face East (+X) along the corridor
    const l2 = LEVELS[1];
    const l2Ramp = getBoostRampOrientation(l2.grid, 9, 3);
    expect(l2Ramp.dirX).toBe(1);
    expect(l2Ramp.dirZ).toBe(0);
    expect(l2Ramp.angleY).toBe(-Math.PI / 2);
  });
});

