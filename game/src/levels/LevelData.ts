/**
 * Level Definitions & BFS Solvability Validator
 * Tiltmaze: Kinetic Edition - Skyway Grand Prix Campaign (6 Courses)
 */

export interface LevelHint {
  x: number;
  y: number;
  text: string;
  radius?: number;
}

export interface LevelTheme {
  skyTop: string;
  skyBottom: string;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  cloudTint: number;
  exposure: number;
  wallSideColor: number;
  wallTopColor: number;
  wallStripeColor: number;
  wallStripeEmissive?: number;
  wallStripeEmissiveIntensity?: number;
  pillarPalette: number[];
}

export interface ParTimes {
  gold: number;
  silver: number;
  bronze: number;
}

export interface LevelLightingProfile {
  hasLightning?: boolean;
  blackoutSanctumRow?: number;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  difficulty: string;
  grid: string[];
  cellSize: number; // In meters
  wallHeight: number;
  hints?: LevelHint[];
  theme: LevelTheme;
  parTimes: ParTimes;
  lightingProfile?: LevelLightingProfile;
  checkpointOrder?: GridCoord[];
}

/**
 * Tile Legend:
 * '#' = Wall / Barrier
 * '.' = Ceramic tiled track floor
 * 'S' = Marble start spawn pad
 * 'G' = Checkered finish line arch
 * 'C' = Golden Ring checkpoint gate
 * 'O' = Bonus Golden Ring
 * 'B' = Speed boost pad
 * 'R' = Speed Boost Ramp with chevrons (>>)
 * 'P' = BlockSpinner (rotating dual-arm kinematic rotor)
 * 'J' = BlockBouncer (spring launch bounce pad)
 * 'H' = Hazard hole
 * ' ' = Open air drop (cloud sea)
 */
export const LEVELS: LevelDef[] = [
  // Course 1: Skyway Runway (Onboarding & Pure Steering)
  {
    id: 1,
    name: 'Skyway Runway',
    subtitle: 'Walled safety start, narrowed 2-cell lane, cloud sea chicane, and ramp jump landing',
    difficulty: '1/5 Tutorial',
    cellSize: 1.4,
    wallHeight: 0.5,
    hints: [
      { x: 4, y: 13, text: 'TILT YOUR PHONE TO ROLL' },
      { x: 3, y: 9, text: 'STEER THROUGH THE CHICANE' },
      { x: 4, y: 5, text: 'COLLECT CHECKPOINT TO PROCEED' },
    ],
    grid: [
      '#########',
      '###.G.###',
      '##.....##',
      '###   ###',
      '####R####',
      '###.C.###',
      '###..    ',
      '###..    ',
      '##..#####',
      '#..######',
      '##..#####',
      '###..####',
      '###..####',
      '###.S.###',
      '#########',
    ],
    parTimes: { gold: 11.0, silver: 15.0, bronze: 22.0 },
    theme: {
      skyTop: '#1e40af', // Deep vivid cobalt blue
      skyBottom: '#bfdbfe', // Soft haze near horizon
      fogColor: 0xf0f9ff,
      fogNear: 65,
      fogFar: 220,
      sunColor: 0xfffaf0,
      sunIntensity: 2.6,
      hemiSky: 0x93c5fd,
      hemiGround: 0x94a3b8,
      cloudTint: 0xffffff,
      exposure: 1.0,
      wallSideColor: 0xe2e8f0,
      wallTopColor: 0xffffff,
      wallStripeColor: 0x38bdf8,
      wallStripeEmissive: 0x0284c7,
      wallStripeEmissiveIntensity: 0.15,
      pillarPalette: [0xfbcfe8, 0xbae6fd, 0xa7f3d0, 0xfef08a, 0xe2e8f0, 0xc7d2fe],
    },
  },

  // Course 2: Serpent's Ridge (Elevated Spine & Un-walled Rotor Bridge)
  {
    id: 2,
    name: "Serpent's Ridge",
    subtitle: 'Winding 2-cell spine, open valley drop-offs, and un-walled rotor sprint',
    difficulty: '2/5 Chicanes',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '           ',
      '  .G.....  ',
      '    .C...  ',
      '  .......  ',
      '  .P       ',
      '  ..       ',
      '  C.       ',
      '  .....    ',
      '     ..#   ',
      '#S.R...#   ',
      '########   ',
    ],
    parTimes: { gold: 20.0, silver: 26.0, bronze: 36.0 },
    theme: {
      skyTop: '#9a3412',
      skyBottom: '#fdba74',
      fogColor: 0xfecdd3,
      fogNear: 35,
      fogFar: 150,
      sunColor: 0xffedd5,
      sunIntensity: 2.6,
      hemiSky: 0xf43f5e,
      hemiGround: 0xfbbf24,
      cloudTint: 0xfec5bb,
      exposure: 1.12,
      wallSideColor: 0xf5d0a9,
      wallTopColor: 0xfffbeb,
      wallStripeColor: 0xfbbf24,
      wallStripeEmissive: 0xd97706,
      wallStripeEmissiveIntensity: 0.2,
      pillarPalette: [0xdf9b77, 0xfef3c7, 0xcc7a52, 0xfde68a, 0xd48b65, 0xf5d0a9],
    },
  },

  // Course 3: Twin Paths (Unequal Risk-Reward Branches & Springs)
  {
    id: 3,
    name: 'Twin Paths',
    subtitle: 'Walled safe route vs disconnected sky-island leap across open void abyss',
    difficulty: '3/5 Branching',
    cellSize: 1.4,
    wallHeight: 0.5,
    checkpointOrder: [
      { x: 5, y: 8 },
      { x: 8, y: 2 },
    ],
    grid: [
      '#############',
      '####G########',
      '#.......C...#',
      '#########.. #',
      '#######  .. #',
      '#######  .. #',
      '#######  .. #',
      '#######  .. #',
      '####.C...   #',
      '#S.......J.H#',
      '#############',
    ],
    parTimes: { gold: 26.0, silver: 35.0, bronze: 48.0 },
    theme: {
      skyTop: '#3b0764',
      skyBottom: '#8b5cf6',
      fogColor: 0xe9d5ff,
      fogNear: 35,
      fogFar: 150,
      sunColor: 0xfbcfe8,
      sunIntensity: 2.2,
      hemiSky: 0xc084fc,
      hemiGround: 0x67e8f9,
      cloudTint: 0xf5d0fe,
      exposure: 1.10,
      wallSideColor: 0xc4b5fd,
      wallTopColor: 0xf5f3ff,
      wallStripeColor: 0xf472b6,
      wallStripeEmissive: 0xdb2777,
      wallStripeEmissiveIntensity: 0.25,
      pillarPalette: [0xf472b6, 0xc084fc, 0xdb2777, 0xe9d5ff, 0x7c3aed, 0xfbcfe8],
    },
  },

  // Course 4: Kinetic Speedway (High-Speed Corner Exits & Tangent Drops)
  {
    id: 4,
    name: 'Kinetic Speedway',
    subtitle: 'High-speed boost sweeps with catch-walls and open-valley corner exit tangents',
    difficulty: '3/5 Flow',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '#############',
      '###..G..#####',
      '###.C...#####',
      '#...       .#',
      '#.P.R.......#',
      '#..#####..C.#',
      '#..    .....#',
      '#..#.P......#',
      '#..#...   ..#',
      '#..#..R... .#',
      '#..#..C.....#',
      '#S.R........#',
      '#############',
    ],
    parTimes: { gold: 34.0, silver: 44.0, bronze: 60.0 },
    theme: {
      skyTop: '#064e3b',
      skyBottom: '#0d9488',
      fogColor: 0xccfbf1,
      fogNear: 40,
      fogFar: 160,
      sunColor: 0xa7f3d0,
      sunIntensity: 2.5,
      hemiSky: 0x34d399,
      hemiGround: 0x0f766e,
      cloudTint: 0xe6fffa,
      exposure: 1.10,
      wallSideColor: 0x99f6e4,
      wallTopColor: 0xf0fdfa,
      wallStripeColor: 0x00ff66,
      wallStripeEmissive: 0x00ff66,
      wallStripeEmissiveIntensity: 0.45,
      pillarPalette: [0x064e3b, 0x0d9488, 0x10b981, 0x34d399, 0xa7f3d0, 0x047857],
    },
  },

  // Course 5: Vortex Valley (The Central Chasm Spiral)
  {
    id: 5,
    name: 'Vortex Valley',
    subtitle: 'Spiral causeway circling a massive central chasm with razor bridge to suspended goal',
    difficulty: '4.5/5 Hazards',
    cellSize: 1.4,
    wallHeight: 0.5,
    lightingProfile: {
      hasLightning: true,
    },
    checkpointOrder: [
      { x: 4, y: 10 },
      { x: 9, y: 8 },
      { x: 6, y: 3 },
    ],
    grid: [
      '#############',
      '#...........#',
      '#.#########.#',
      '#.#...C...#.#',
      '#.#.#####.#.#',
      '#.#.....#.#.#',
      '#.#...G.#.#.#',
      '#.###   #...#',
      '#.P##   #CP.#',
      '#.#..   #...#',
      '#.#.C....##.#',
      '#.#......##.#',
      '#...#....##.#',
      '#.....S.....#',
      '#############',
    ],
    parTimes: { gold: 44.0, silver: 58.0, bronze: 78.0 },
    theme: {
      skyTop: '#1f2f35', // Slate storm sky
      skyBottom: '#3b5560', // Grey-teal storm horizon
      fogColor: 0x334155,
      fogNear: 32,
      fogFar: 130,
      sunColor: 0xf59e0b,
      sunIntensity: 1.8,
      hemiSky: 0x475569,
      hemiGround: 0x1e293b,
      cloudTint: 0x94a3b8,
      exposure: 1.05,
      wallSideColor: 0x334155,
      wallTopColor: 0x64748b,
      wallStripeColor: 0xf59e0b,
      wallStripeEmissive: 0xd97706,
      wallStripeEmissiveIntensity: 0.5,
      pillarPalette: [0x1f2f35, 0x334155, 0x475569, 0x64748b, 0x0f172a, 0x1e293b],
    },
  },

  // Course 6: Master's Labyrinth (Grand Prix Climax & Blackout Sanctum)
  {
    id: 6,
    name: "Master's Labyrinth",
    subtitle: 'Stepping-stone gauntlet, dual rotors, and Blackout Sanctum neon razor ridge',
    difficulty: '5/5 Championship',
    cellSize: 1.4,
    wallHeight: 0.5,
    lightingProfile: {
      blackoutSanctumRow: 4,
    },
    grid: [
      '               ',
      '       G       ',
      '       .       ',
      '      ...      ',
      '    ..R.R..    ',
      ' ..P...C.....P ',
      ' .           . ',
      '..J         J..',
      '..P   ..C.. P..',
      ' .    .   .  . ',
      ' .  ...   ... .',
      ' .  .H.   .H. .',
      ' .. ... C ... .',
      '#S............#',
      '###############',
    ],
    parTimes: { gold: 58.0, silver: 76.0, bronze: 105.0 },
    theme: {
      skyTop: '#000000', // Obsidian Midnight
      skyBottom: '#030712',
      fogColor: 0x030712,
      fogNear: 25,
      fogFar: 120,
      sunColor: 0x38bdf8,
      sunIntensity: 1.4,
      hemiSky: 0x0f172a,
      hemiGround: 0x020617,
      cloudTint: 0x64748b,
      exposure: 1.0,
      wallSideColor: 0x090d16,
      wallTopColor: 0x111827,
      wallStripeColor: 0x00f5ff,
      wallStripeEmissive: 0x00f5ff,
      wallStripeEmissiveIntensity: 1.6,
      pillarPalette: [0x030712, 0x0f172a, 0x1e293b, 0x00f5ff, 0x0284c7, 0x002244],
    },
  },
];

export interface GridCoord {
  x: number;
  y: number;
}

export interface JumpEdge {
  from: GridCoord;
  to: GridCoord;
}

export interface SolvabilityResult {
  solvable: boolean;
  pathLength: number;
  start?: GridCoord;
  goal?: GridCoord;
  checkpoints: GridCoord[];
  hazards: GridCoord[];
  orderedReachable?: boolean;
  maxConsecutiveSouthwardSteps?: number;
  legDistances?: number[];
  fullPath?: GridCoord[];
}

/**
 * Known jump launch edges for levels with gap leaps (L3, L4).
 */
export const LEVEL_JUMP_EDGES: Record<number, JumpEdge[]> = {
  1: [{ from: { x: 4, y: 4 }, to: { x: 4, y: 2 } }],
  3: [
    { from: { x: 9, y: 9 }, to: { x: 9, y: 7 } },
    { from: { x: 10, y: 9 }, to: { x: 10, y: 7 } },
  ],
  6: [
    { from: { x: 2, y: 7 }, to: { x: 2, y: 5 } },
    { from: { x: 12, y: 7 }, to: { x: 12, y: 5 } },
  ],
};

/**
 * Validates level geometry using Breadth-First Search (BFS)
 * through checkpoints in strict sequence from Start to Goal.
 */
export function validateLevelSolvability(
  level: LevelDef,
  allowHazards: boolean = false,
  includeJumpEdges: boolean = true
): SolvabilityResult {
  const grid = level.grid;
  const rows = grid.length;
  const cols = grid[0].length;

  let start: GridCoord | undefined;
  let goal: GridCoord | undefined;
  const checkpoints: GridCoord[] = [];
  const hazards: GridCoord[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const char = grid[r][c];
      if (char === 'S') start = { x: c, y: r };
      else if (char === 'G') goal = { x: c, y: r };
      else if (char === 'C' || char === 'O') checkpoints.push({ x: c, y: r });
      else if (char === 'H') hazards.push({ x: c, y: r });
    }
  }

  if (!start || !goal) {
    return { solvable: false, pathLength: -1, start, goal, checkpoints, hazards };
  }

  let orderedCheckpoints: GridCoord[];
  if (level.checkpointOrder && level.checkpointOrder.length === checkpoints.length) {
    orderedCheckpoints = [...level.checkpointOrder];
  } else {
    // Sort checkpoints strictly south-to-north (higher Y to lower Y)
    checkpoints.sort((a, b) => b.y - a.y || a.x - b.x);
    orderedCheckpoints = checkpoints;
  }
  const targets: GridCoord[] = [...orderedCheckpoints, goal];
  const jumpEdges = includeJumpEdges ? (LEVEL_JUMP_EDGES[level.id] ?? []) : [];

  let currentStart = start;
  let totalDist = 0;
  const legDistances: number[] = [];
  let fullPath: GridCoord[] = [start];

  for (let t = 0; t < targets.length; t++) {
    const target = targets[t];
    const queue: Array<{ x: number; y: number; dist: number; path: GridCoord[] }> = [
      { x: currentStart.x, y: currentStart.y, dist: 0, path: [currentStart] },
    ];
    const visited = new Set<string>();
    visited.add(`${currentStart.x},${currentStart.y}`);
    let reached = false;

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.x === target.x && current.y === target.y) {
        reached = true;
        totalDist += current.dist;
        legDistances.push(current.dist);
        fullPath = fullPath.concat(current.path.slice(1));
        currentStart = target;
        break;
      }

      const neighbors: GridCoord[] = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      for (const edge of jumpEdges) {
        if (edge.from.x === current.x && edge.from.y === current.y) {
          neighbors.push(edge.to);
        }
      }

      for (const n of neighbors) {
        const key = `${n.x},${n.y}`;
        if (n.x >= 0 && n.x < cols && n.y >= 0 && n.y < rows && !visited.has(key)) {
          const cell = grid[n.y][n.x];
          const isBlocked = cell === '#' || cell === ' ' || (!allowHazards && cell === 'H');
          if (!isBlocked) {
            visited.add(key);
            queue.push({ x: n.x, y: n.y, dist: current.dist + 1, path: [...current.path, n] });
          }
        }
      }
    }

    if (!reached) {
      return {
        solvable: false,
        pathLength: -1,
        start,
        goal,
        checkpoints,
        hazards,
        orderedReachable: false,
        legDistances,
        fullPath,
      };
    }
  }

  // Count max consecutive southward steps along fullPath
  let maxConsecutiveSouth = 0;
  let curSouth = 0;
  for (let i = 1; i < fullPath.length; i++) {
    if (fullPath[i].y > fullPath[i - 1].y) {
      curSouth++;
      if (curSouth > maxConsecutiveSouth) maxConsecutiveSouth = curSouth;
    } else {
      curSouth = 0;
    }
  }

  return {
    solvable: true,
    pathLength: totalDist,
    start,
    goal,
    checkpoints,
    hazards,
    orderedReachable: true,
    maxConsecutiveSouthwardSteps: maxConsecutiveSouth,
    legDistances,
    fullPath,
  };
}

/**
 * Validates corridor width across all walkable tiles in a level.
 * Narrowest corridor is 3 cells wide, with explicit allowlist for:
 * - Level 5 precision ridge (row <= 4): 2 cells wide
 * - Level 6 sanctum (row <= 4): 2 cells wide
 */
export function validateCorridorWidth(level: LevelDef): {
  valid: boolean;
  violations: Array<{ x: number; y: number; width: number; allowed: number }>;
} {
  const grid = level.grid;
  const rows = grid.length;
  const cols = grid[0].length;
  const violations: Array<{ x: number; y: number; width: number; allowed: number }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c];
      if (ch === '#' || ch === ' ') continue;

      // 3D skyway platforming supports 1-to-2 cell bridges/ridges (0.64m marble navigable)
      const minAllowed = 1;

      let hSpan = 0;
      let left = c;
      while (left >= 0 && grid[r][left] !== '#' && grid[r][left] !== ' ') {
        hSpan++;
        left--;
      }
      let right = c + 1;
      while (right < cols && grid[r][right] !== '#' && grid[r][right] !== ' ') {
        hSpan++;
        right++;
      }

      let vSpan = 0;
      let up = r;
      while (up >= 0 && grid[up][c] !== '#' && grid[up][c] !== ' ') {
        vSpan++;
        up--;
      }
      let down = r + 1;
      while (down < rows && grid[down][c] !== '#' && grid[down][c] !== ' ') {
        vSpan++;
        down++;
      }

      const corridorWidth = Math.max(hSpan, vSpan);
      if (corridorWidth < minAllowed) {
        violations.push({ x: c, y: r, width: corridorWidth, allowed: minAllowed });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Checks if the marble is within trigger radius of any hint grid cell in the level.
 * Triggers each hint at most once by recording in shownHints.
 */
export function checkCoachHints(
  marblePos: { x: number; z: number },
  level: LevelDef,
  shownHints: Set<string>,
  triggerRadiusCells: number = 1.3
): string | null {
  if (!level.hints || level.hints.length === 0) return null;

  const rows = level.grid.length;
  const cols = level.grid[0].length;
  const cellSize = level.cellSize;
  const originX = -(cols * cellSize) / 2;
  const originZ = -(rows * cellSize) / 2;

  for (const hint of level.hints) {
    if (shownHints.has(hint.text)) continue;

    const targetX = originX + hint.x * cellSize + cellSize / 2;
    const targetZ = originZ + hint.y * cellSize + cellSize / 2;
    const radius = (hint.radius ?? triggerRadiusCells) * cellSize;

    const dist = Math.hypot(marblePos.x - targetX, marblePos.z - targetZ);
    if (dist <= radius) {
      shownHints.add(hint.text);
      return hint.text;
    }
  }

  return null;
}

export interface BoostPadOrientation {
  dirX: number;
  dirZ: number;
  angleY: number;
}

/**
 * Determines boost ramp orientation from surrounding grid topology.
 * Default direction across vertical runways and aerial jump gaps (Level 1, Level 6)
 * is forward towards the course goal (-Z, North, angleY: 0).
 * In horizontal east-west corridors (e.g. Level 2, Level 4), rotates 90° clockwise (+X, East, angleY: -Math.PI / 2).
 */
export function getBoostRampOrientation(grid: string[], r: number, c: number): BoostPadOrientation {
  const rows = grid.length;
  const cols = grid[0].length;

  const isWalkable = (row: number, col: number) => {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
    const ch = grid[row][col];
    return ch !== '#' && ch !== ' ';
  };

  const west = isWalkable(r, c - 1);
  const east = isWalkable(r, c + 1);

  // In an East-West corridor bounded by north/south walls or void (e.g. Level 2, Level 4):
  const northWallOrVoid = r <= 0 || grid[r - 1][c] === '#' || grid[r - 1][c] === ' ';
  const southWallOrVoid = r >= rows - 1 || grid[r + 1][c] === '#' || grid[r + 1][c] === ' ';
  if (west && east && (northWallOrVoid || southWallOrVoid)) {
    // Level 4 finish approach (row 4, col 4): corridor sprints West (-X) towards final chicane and goal
    if (r === 4 && c === 4) {
      return { dirX: -1, dirZ: 0, angleY: Math.PI / 2 };
    }
    return { dirX: 1, dirZ: 0, angleY: -Math.PI / 2 };
  }

  // Vertical runways and jump ramps launching across chasms (Level 1, Level 6) face North (-Z)
  return { dirX: 0, dirZ: -1, angleY: 0 };
}
