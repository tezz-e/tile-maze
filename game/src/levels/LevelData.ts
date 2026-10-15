/**
 * Level Definitions & BFS Solvability Validator
 * Tiltmaze: Kinetic Edition - Skyway Courses
 */

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  grid: string[];
  cellSize: number; // In meters
  wallHeight: number;
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
    subtitle: 'Sunny cloud sea - Spinners, boost ramps, and 5 golden ring checkpoints',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '#########',
      '#...G...#',
      '#...C...#',
      '#..P....#',
      '#...R...#',
      '#...C...#',
      '#....P..#',
      '#...C...#',
      '#..P....#',
      '#...C...#',
      '#J..R...#',
      '#...C...#',
      '#...S...#',
      '#########',
    ],
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
  },
  {
    id: 4,
    name: "Master's Labyrinth",
    subtitle: 'The ultimate skyway championship - Reflexes and velocity',
    cellSize: 1.4,
    wallHeight: 0.5,
    grid: [
      '###############',
      '#....C......R.G#',
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
