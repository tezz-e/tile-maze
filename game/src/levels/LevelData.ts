/**
 * Level Definitions & BFS Solvability Validator
 * Tiltmaze: Kinetic Edition - Skyway Courses
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

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  grid: string[];
  cellSize: number; // In meters
  wallHeight: number;
  hints?: LevelHint[];
  theme: LevelTheme;
}

/**
 * Tile Legend:
 * '#' = Wall / Barrier
 * '.' = Blue ceramic tiled track floor
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
  {
    id: 1,
    name: 'Skyway Runway',
    subtitle: 'Guided flight tutorial - Narrow corridor, boost ramp, rotor arm timing, and launch pad',
    cellSize: 1.4,
    wallHeight: 0.5,
    hints: [
      { x: 4, y: 13, text: 'TILT YOUR PHONE TO ROLL' },
      { x: 4, y: 10, text: 'HOLD NITRO ON THE RAMP' },
      { x: 4, y: 7, text: 'TIME YOUR PASS BETWEEN THE ARMS' },
      { x: 2, y: 4, text: 'SHAKE TO JUMP (OPTIONAL)', radius: 1.5 },
    ],
    grid: [
      '#########',
      '####G####',
      '####C####',
      '###...###',
      '##J...###',
      '###.C.###',
      '##..P..##',
      '###.C.###',
      '###...###',
      '####R####',
      '###...###',
      '###.C.###',
      '##.....##',
      '#...S...#',
      '#########',
    ],
    theme: {
      skyTop: '#1e3a8a',
      skyBottom: '#60a5fa',
      fogColor: 0xdbeafe,
      fogNear: 40,
      fogFar: 160,
      sunColor: 0xfff7ed,
      sunIntensity: 2.4,
      hemiSky: 0xbae6fd,
      hemiGround: 0xfef08a,
      cloudTint: 0xffffff,
      exposure: 1.15,
      wallSideColor: 0xe2e8f0, // Light cream/white stone sides
      wallTopColor: 0xffffff, // Pure white stone top cap
      wallStripeColor: 0x38bdf8, // Bright azure top stripe
      wallStripeEmissive: 0x0284c7,
      wallStripeEmissiveIntensity: 0.15,
      pillarPalette: [0xfbcfe8, 0xbae6fd, 0xa7f3d0, 0xfef08a, 0xe2e8f0, 0xc7d2fe],
    },
  },
  {
    id: 2,
    name: "Serpent's Ridge",
    subtitle: 'Winding chicanes and dynamic rotor gauntlets',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '###########',
      '#G.C...#..#',
      '###..#.#.R#',
      '#....#.#..#',
      '#.####.#.P#',
      '#...J..#..#',
      '#.####.##.#',
      '#...P#..C.#',
      '#....#.##.#',
      '#S.R.#....#',
      '###########',
    ],
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
      cloudTint: 0xfec5bb, // Warm glowing pink-peach
      exposure: 1.12,
      wallSideColor: 0xf5d0a9, // Light warm sandstone sides
      wallTopColor: 0xfffbeb, // Very light warm sandstone top face
      wallStripeColor: 0xfbbf24, // Bright warm golden top stripe
      wallStripeEmissive: 0xd97706,
      wallStripeEmissiveIntensity: 0.2,
      pillarPalette: [0xc2410c, 0xfef3c7, 0xea580c, 0xfde68a, 0xd97736, 0xf5d0a9],
    },
  },
  {
    id: 3,
    name: 'Twin Paths & Boosts',
    subtitle: 'Nitro speed ramps, spring shortcuts, and golden rings',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '#############',
      '#...R.....#G#',
      '#.###.###.#.#',
      '#...#.P.#...#',
      '###.#.###.###',
      '#...#J..#...#',
      '#.###.#.###.#',
      '#.P...#...C.#',
      '#.###.#####.#',
      '#S..#...R...#',
      '#############',
    ],
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
      wallSideColor: 0xc4b5fd, // Light lavender sides
      wallTopColor: 0xf5f3ff, // Light lavender-white top face
      wallStripeColor: 0xf472b6, // Bright neon rose top stripe
      wallStripeEmissive: 0xdb2777,
      wallStripeEmissiveIntensity: 0.25,
      pillarPalette: [0xf472b6, 0xc084fc, 0xdb2777, 0xe9d5ff, 0x7c3aed, 0xfbcfe8],
    },
  },
  {
    id: 4,
    name: "Master's Labyrinth",
    subtitle: 'The ultimate skyway championship - Reflexes and velocity',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '###############',
      '#....C.....R.G#',
      '#.##.########.#',
      '#..R.#...P....#',
      '####.#.###.####',
      '#....#...#..J.#',
      '#.######.#.##.#',
      '#..#...#.#..P.#',
      '##.#.#.#.####.#',
      '#..P.#.#....C.#',
      '#.##.#.######.#',
      '#S...#...R...H#',
      '###############',
    ],
    theme: {
      skyTop: '#030712',
      skyBottom: '#0f172a',
      fogColor: 0x0f172a,
      fogNear: 30,
      fogFar: 140,
      sunColor: 0x93c5fd,
      sunIntensity: 1.6,
      hemiSky: 0x1e293b,
      hemiGround: 0x0f172a,
      cloudTint: 0x8fa3bf, // Soft blue-gray, never dark
      exposure: 1.05,
      wallSideColor: 0x0f172a, // Dark navy sides
      wallTopColor: 0x1e293b, // Slate-navy top face (lighter than sides)
      wallStripeColor: 0x06b6d4, // Strong cyan top edge line
      wallStripeEmissive: 0x00f5ff, // Emissive cyan neon glow
      wallStripeEmissiveIntensity: 1.8,
      pillarPalette: [0x1e293b, 0x334155, 0x0f172a, 0x273549, 0x475569, 0x1e3a8a],
    },
  },
];

export interface GridCoord {
  x: number;
  y: number;
}

export interface SolvabilityResult {
  solvable: boolean;
  pathLength: number;
  start?: GridCoord;
  goal?: GridCoord;
  checkpoints: GridCoord[];
  hazards: GridCoord[];
}

/**
 * Validates level geometry using Breadth-First Search (BFS)
 * to verify that the start position can reach the goal without passing through hazards or walls.
 */
export function validateLevelSolvability(level: LevelDef): SolvabilityResult {
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

  // BFS Queue
  const queue: Array<{ x: number; y: number; dist: number }> = [{ ...start, dist: 0 }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);

  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === goal.x && current.y === goal.y) {
      return {
        solvable: true,
        pathLength: current.dist,
        start,
        goal,
        checkpoints,
        hazards,
      };
    }

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = `${nx},${ny}`;

      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited.has(key)) {
        const cell = grid[ny][nx];
        // Walls (#), Hazards (H), and open sky (' ') block safe traversal
        if (cell !== '#' && cell !== 'H' && cell !== ' ') {
          visited.add(key);
          queue.push({ x: nx, y: ny, dist: current.dist + 1 });
        }
      }
    }
  }

  return {
    solvable: false,
    pathLength: -1,
    start,
    goal,
    checkpoints,
    hazards,
  };
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

