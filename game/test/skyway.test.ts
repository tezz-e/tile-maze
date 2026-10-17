import * as THREE from 'three';
import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld, mergeFloorTiles } from '../src/physics/PhysicsWorld.js';
import { LEVELS } from '../src/levels/LevelData.js';
import { TextureGenerator } from '../src/world/TextureGenerator.js';
import { SkyEnvironment } from '../src/world/Environment.js';
import { Board } from '../src/world/Board.js';

describe('Skyway Obstacles & Physics Mechanics', () => {
  let physics: PhysicsWorld;
  let bouncerTriggered = false;
  let boostTriggered = false;
  let checkpointTriggered = false;
  let goalReachedTriggered = false;
  let goalBlockedTriggered = false;
  let holeFallTriggered = false;
  let goalBlockedData = { reached: 0, total: 0 };

  beforeAll(async () => {
    physics = new PhysicsWorld({
      onWallImpact: () => {},
      onHoleFall: () => {
        holeFallTriggered = true;
      },
      onCheckpoint: () => {
        checkpointTriggered = true;
      },
      onGoalReached: () => {
        goalReachedTriggered = true;
      },
      onBoostPad: () => {
        boostTriggered = true;
      },
      onBouncer: () => {
        bouncerTriggered = true;
      },
      onGoalBlocked: (reached, total) => {
        goalBlockedTriggered = true;
        goalBlockedData = { reached, total };
      },
    });
    await physics.init();
    physics.loadLevel(LEVELS[0]);
  });

  it('spawns Bruno Simon kinematic spinners and advances rotation angles', () => {
    physics.loadLevel(LEVELS[1]); // Course 2: Serpent's Ridge features spinners
    const spinners = physics.getSpinners();
    expect(spinners.length).toBeGreaterThan(0);

    const initialAngle = spinners[0].angle;
    physics.step(0.05);
    const updatedAngle = spinners[0].angle;

    // Angle should change according to dt * speed
    expect(updatedAngle).not.toBe(initialAngle);
  });

  it('detects and registers bouncers from level data', () => {
    physics.loadLevel(LEVELS[2]); // Course 3: Twin Paths features spring bouncers
    const bouncers = physics.getBouncers();
    expect(bouncers.length).toBeGreaterThan(0);
  });

  it('tracks checkpoint progress accurately across all 6 hand-crafted levels', () => {
    // Level 1: 1 CP
    physics.loadLevel(LEVELS[0]);
    expect(physics.getCheckpointProgress().total).toBe(1);

    // Level 2: 2 CPs
    physics.loadLevel(LEVELS[1]);
    expect(physics.getCheckpointProgress().total).toBe(2);

    // Level 3: 2 CPs
    physics.loadLevel(LEVELS[2]);
    expect(physics.getCheckpointProgress().total).toBe(2);

    // Level 4: 3 CPs
    physics.loadLevel(LEVELS[3]);
    expect(physics.getCheckpointProgress().total).toBe(3);

    // Level 5: 3 CPs
    physics.loadLevel(LEVELS[4]);
    expect(physics.getCheckpointProgress().total).toBe(3);

    // Level 6: 3 CPs
    physics.loadLevel(LEVELS[5]);
    expect(physics.getCheckpointProgress().total).toBe(3);

    // Reset back to Level 1
    physics.loadLevel(LEVELS[0]);
  });

  it('blocks goal completion and triggers onGoalBlocked when required checkpoints remain', () => {
    physics.loadLevel(LEVELS[0]);
    goalBlockedTriggered = false;
    goalReachedTriggered = false;

    // Place marble over goal arch without clearing checkpoints
    const l1 = LEVELS[0];
    const cellSize = l1.cellSize;
    const originX = -(l1.grid[0].length * cellSize) / 2;
    const originZ = -(l1.grid.length * cellSize) / 2;
    const goalX = originX + 4 * cellSize + cellSize / 2;
    const goalZ = originZ + 1 * cellSize + cellSize / 2;

    physics.marbleBody.setTranslation({ x: goalX, y: 0.4, z: goalZ }, true);
    for (let i = 0; i < 5; i++) {
      physics.step(0.016);
    }

    expect(goalBlockedTriggered).toBe(true);
    expect(goalBlockedData.reached).toBe(0);
    expect(goalBlockedData.total).toBe(1);
    expect(goalReachedTriggered).toBe(false);
  });

  it('verifies course checkpoints flow with ordered sequence along progression', () => {
    LEVELS.forEach((level) => {
      let startY = -1;
      let goalY = -1;
      const cpCoords: Array<{ x: number; y: number }> = [];
      level.grid.forEach((row, r) => {
        if (row.includes('S')) startY = r;
        if (row.includes('G')) goalY = r;
        for (let c = 0; c < row.length; c++) {
          if (row[c] === 'C' || row[c] === 'O') {
            cpCoords.push({ x: c, y: r });
          }
        }
      });
      // Start is strictly south of goal
      expect(startY).toBeGreaterThan(goalY);

      if (level.checkpointOrder) {
        expect(level.checkpointOrder.length).toBe(cpCoords.length);
      } else {
        const cpRows = cpCoords.map((c) => c.y).sort((a, b) => b - a);
        expect(startY).toBeGreaterThan(cpRows[0]);
        for (let i = 1; i < cpRows.length; i++) {
          expect(cpRows[i - 1]).toBeGreaterThan(cpRows[i]);
        }
        expect(cpRows[cpRows.length - 1]).toBeGreaterThan(goalY);
      }
    });
  });

  it('indexes and triggers checkpoints in strict south-to-north sequence without premature unlock', () => {
    // Level 2 has 2 CPs: south CP at row 6, north CP at row 2, Start at row 9, Goal at row 1
    physics.loadLevel(LEVELS[1]);
    const l2 = LEVELS[1];
    const cellSize = l2.cellSize;
    const originX = -(l2.grid[0].length * cellSize) / 2;
    const originZ = -(l2.grid.length * cellSize) / 2;

    // Southern CP is at (2, 6)
    const cp1X = originX + 2 * cellSize + cellSize / 2;
    const cp1Z = originZ + 6 * cellSize + cellSize / 2;

    // Place marble over Southern CP
    physics.marbleBody.setTranslation({ x: cp1X, y: 0.5, z: cp1Z }, true);
    for (let i = 0; i < 5; i++) {
      physics.step(0.016);
    }

    // Touching the FIRST checkpoint should yield exactly progress 1 of 2, NOT 2 of 2!
    const progress = physics.getCheckpointProgress();
    expect(progress.current).toBe(1);
    expect(progress.total).toBe(2);
    expect(physics.allCheckpointsReached()).toBe(false);

    // Goal should STILL be blocked
    goalBlockedTriggered = false;
    const goalX = originX + 3 * cellSize + cellSize / 2;
    const goalZ = originZ + 1 * cellSize + cellSize / 2;
    physics.marbleBody.setTranslation({ x: goalX, y: 0.4, z: goalZ }, true);
    for (let i = 0; i < 5; i++) {
      physics.step(0.016);
    }
    expect(goalBlockedTriggered).toBe(true);
    expect(goalBlockedData.reached).toBe(1);
    expect(goalBlockedData.total).toBe(2);

    // Now touch Northern CP at (5, 2)
    const cp2X = originX + 5 * cellSize + cellSize / 2;
    const cp2Z = originZ + 2 * cellSize + cellSize / 2;
    physics.marbleBody.setTranslation({ x: cp2X, y: 0.5, z: cp2Z }, true);
    for (let i = 0; i < 5; i++) {
      physics.step(0.016);
    }

    // Now all 2 checkpoints reached!
    expect(physics.getCheckpointProgress().current).toBe(2);
    expect(physics.allCheckpointsReached()).toBe(true);

    // Now touching goal succeeds!
    goalReachedTriggered = false;
    physics.marbleBody.setTranslation({ x: goalX, y: 0.4, z: goalZ }, true);
    for (let i = 0; i < 5; i++) {
      physics.step(0.016);
    }
    expect(goalReachedTriggered).toBe(true);
  });

  it('launches marble upwards within realistic arcade arc when landing on BlockBouncer', () => {
    physics.loadLevel(LEVELS[2]); // Course 3 features BlockBouncer
    bouncerTriggered = false;
    const bouncers = physics.getBouncers();
    expect(bouncers.length).toBeGreaterThan(0);
    const bnc = bouncers[0];

    // Place marble directly over the bouncer and drop it
    physics.marbleBody.setTranslation({ x: bnc.position.x, y: 0.35, z: bnc.position.z }, true);
    physics.marbleBody.setLinvel({ x: 0, y: -1.0, z: 0 }, true);

    // Step physics to trigger sensor collision
    for (let i = 0; i < 5; i++) {
      physics.step(0.016);
    }

    expect(bouncerTriggered).toBe(true);
    const vel = physics.marbleBody.linvel();
    // Vertical velocity should be propelled upwards in bounded arcade range (~6.2 m/s)
    expect(vel.y).toBeGreaterThan(2.0);
    expect(vel.y).toBeLessThan(10.0);
  });

  it('generates textures for skyway visuals', () => {
    const skyTex = TextureGenerator.createSkyEquirectangular();
    expect(skyTex).toBeDefined();

    const tileTex = TextureGenerator.createBlueTiles();
    expect(tileTex).toBeDefined();

    const chevTex = TextureGenerator.createChevrons();
    expect(chevTex).toBeDefined();

    const checkTex = TextureGenerator.createFinishCheckered();
    expect(checkTex).toBeDefined();

    const goalPadTex = TextureGenerator.createChampionshipGoalPad();
    expect(goalPadTex).toBeDefined();
    goalPadTex.dispose();

    const energyGlyphTex = TextureGenerator.createCheckpointEnergyGlyph();
    expect(energyGlyphTex).toBeDefined();
    energyGlyphTex.dispose();

    const pillarTex = TextureGenerator.createPillarTexture(0xf472b6, false);
    expect(pillarTex).toBeDefined();
    pillarTex.dispose();

    const windowTex = TextureGenerator.createPillarWindowTexture();
    expect(windowTex).toBeDefined();
    windowTex.dispose();

    const marbleDecalTex = TextureGenerator.createMarbleDecal();
    expect(marbleDecalTex).toBeDefined();
    marbleDecalTex.dispose();
  });

  it('validates all 6 levels have distinct themes with valid lighting, sky and wall parameters', () => {
    LEVELS.forEach((level) => {
      expect(level.theme).toBeDefined();
      expect(level.theme.skyTop).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(level.theme.skyBottom).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(level.theme.sunIntensity).toBeGreaterThan(0);
      expect(level.theme.exposure).toBeGreaterThan(0.5);

      // Verify wall colors: top face must be lighter than side face
      expect(level.theme.wallSideColor).toBeDefined();
      expect(level.theme.wallTopColor).toBeDefined();
      expect(level.theme.wallStripeColor).toBeDefined();

      const topCol = new THREE.Color(level.theme.wallTopColor);
      const sideCol = new THREE.Color(level.theme.wallSideColor);
      // Top face luminance is greater than side face for readability
      const topLum = 0.299 * topCol.r + 0.587 * topCol.g + 0.114 * topCol.b;
      const sideLum = 0.299 * sideCol.r + 0.587 * sideCol.g + 0.114 * sideCol.b;
      expect(topLum).toBeGreaterThan(sideLum);

      // L1-L4 walls must not be near-black (side luminance > 0.25)
      if (level.id < 5) {
        expect(sideLum).toBeGreaterThan(0.25);
      } else if (level.id === 6) {
        // L6 neon edge glow
        expect(level.theme.wallStripeEmissiveIntensity).toBeGreaterThan(1.0);
      }

      // Verify pillar palette
      expect(level.theme.pillarPalette).toBeDefined();
      expect(level.theme.pillarPalette.length).toBeGreaterThanOrEqual(6);

      const themedSky = TextureGenerator.createSkyEquirectangular(
        level.theme.skyTop,
        level.theme.skyBottom,
        level.id === 6
      );
      expect(themedSky).toBeDefined();
      themedSky.dispose();
    });
  });

  it('guarantees cloud clearance outside track boundaries on all 6 levels', () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      toneMappingExposure: 1.0,
      shadowMap: {},
    } as any;
    const env = new SkyEnvironment(scene, mockRenderer);

    // Verify smooth shading and higher-detail icosahedron geometry
    expect(env.cloudMat.flatShading).toBe(false);
    expect((env.cloudInstMesh.geometry as any).parameters.detail).toBe(3);

    LEVELS.forEach((level) => {
      const boardWidth = level.grid[0].length * level.cellSize;
      const boardDepth = level.grid.length * level.cellSize;
      env.adjustCloudClearance(boardWidth, boardDepth);

      const flankClouds = env.getFlankCloudPositions();
      expect(flankClouds.length).toBe(130);

      const minClearanceX = boardWidth / 2 + 3.0;
      flankClouds.forEach((pos) => {
        // Flank cloud centers pushed outward (|x| > boardWidth / 2 + 3.0)
        expect(Math.abs(pos.x)).toBeGreaterThan(minClearanceX);
        // Kept below track curb (y <= -1.6)
        expect(pos.y).toBeLessThanOrEqual(-1.6);
      });

      // Assert track bounds computation
      const bounds = SkyEnvironment.computeTrackBounds(boardWidth, boardDepth, level.wallHeight);
      expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(boardWidth);
      expect(bounds.maxZ - bounds.minZ).toBeGreaterThanOrEqual(boardDepth);

      // Assert zero cloud mesh instances intersect or poke through track volume
      expect(env.hasCloudTrackIntersection(boardWidth, boardDepth, level.wallHeight)).toBe(false);
    });
  });

  it('verifies Level 6 wide track (~21m) specifically pushes clouds to |x| > 13.5m and has zero cloud intersection', () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      toneMappingExposure: 1.0,
      shadowMap: {},
    } as any;
    const env = new SkyEnvironment(scene, mockRenderer);
    const l6 = LEVELS[5];
    const boardWidth = l6.grid[0].length * l6.cellSize;
    const boardDepth = l6.grid.length * l6.cellSize;
    expect(boardWidth).toBeCloseTo(21.0, 1);

    env.adjustCloudClearance(boardWidth, boardDepth);
    const flankClouds = env.getFlankCloudPositions();
    flankClouds.forEach((pos) => {
      expect(Math.abs(pos.x)).toBeGreaterThan(13.5);
      expect(pos.y).toBeLessThanOrEqual(-1.6);
    });

    // Zero cloud mesh intersection with wide track
    expect(env.hasCloudTrackIntersection(boardWidth, boardDepth, l6.wallHeight)).toBe(false);
  });

  it('halves cloud mesh count and drops shadow map resolution in low quality mode', () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      toneMappingExposure: 1.0,
      shadowMap: {},
    } as any;
    const env = new SkyEnvironment(scene, mockRenderer);

    expect(env.cloudInstMesh.count).toBe(380);
    expect(env.dirLight.shadow.mapSize.width).toBe(2048);

    env.setQuality(true);
    expect(env.cloudInstMesh.count).toBe(190);
    expect(env.dirLight.shadow.mapSize.width).toBe(1024);

    env.setQuality(false);
    expect(env.cloudInstMesh.count).toBe(380);
    expect(env.dirLight.shadow.mapSize.width).toBe(2048);
  });

  it('drops marble freely into open valley air gap without catching on lower geometry and triggers respawn', () => {
    physics.loadLevel(LEVELS[0]);
    holeFallTriggered = false;

    const l1 = LEVELS[0];
    const cellSize = l1.cellSize;
    const originX = -(l1.grid[0].length * cellSize) / 2;
    const originZ = -(l1.grid.length * cellSize) / 2;

    // Row 3 in Level 1 is a true open air gap (' ')
    const airX = originX + 4 * cellSize + cellSize / 2;
    const airZ = originZ + 3 * cellSize + cellSize / 2;

    physics.marbleBody.setTranslation({ x: airX, y: 0.35, z: airZ }, true);
    physics.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

    // Marble should fall through y = 0 without getting caught by any monolithic floor
    for (let i = 0; i < 25; i++) {
      physics.step(0.016);
    }

    const pos = physics.marbleBody.translation();
    // Confirms no floor blocked the fall
    expect(pos.y).toBeLessThan(0);

    // Continue falling until fall threshold (-3.0) is crossed
    for (let i = 0; i < 60; i++) {
      physics.step(0.016);
    }

    expect(holeFallTriggered).toBe(true);
    // Marble should be cleanly respawned at the start checkpoint (y > 0)
    const respawnPos = physics.getMarblePosition();
    expect(respawnPos.y).toBeGreaterThan(0.3);
  });

  it('merges contiguous floor cells into larger combined box colliders to eliminate seam bounces', () => {
    LEVELS.forEach((level) => {
      const mergedRects = mergeFloorTiles(level.grid);
      let floorCellCount = 0;
      for (const row of level.grid) {
        for (const cell of row) {
          if (cell !== ' ') floorCellCount++;
        }
      }

      // Merging must significantly reduce collider count compared to 1x1 tiles
      expect(mergedRects.length).toBeLessThan(floorCellCount / 2);
      expect(mergedRects.length).toBeGreaterThan(0);

      // Verify every merged rectangle has valid bounds
      mergedRects.forEach((rect) => {
        expect(rect.width).toBeGreaterThanOrEqual(1);
        expect(rect.depth).toBeGreaterThanOrEqual(1);
      });
    });
  });

  it('renders 3D structural side-skirts underneath floor tiles and distinct hazard edge trims along open borders', () => {
    const board = new Board();

    // 1. Daytime level (Course 1)
    board.buildLevel(LEVELS[0]);
    expect(board.group.children.length).toBeGreaterThan(2);

    // Find instanced meshes
    const instMeshes = board.group.children.filter((c) => (c as any).isInstancedMesh);
    // Should have both the blue road deck and the dark structural underbody skirt
    expect(instMeshes.length).toBe(2);

    // Verify no monolithic base tray exists
    const hasMonolithicTray = board.group.children.some((c: any) => {
      if (c.geometry && c.geometry.parameters) {
        const p = c.geometry.parameters;
        return p.width > 12 && p.depth > 20 && p.height === 0.5;
      }
      return false;
    });
    expect(hasMonolithicTray).toBe(false);

    // 2. Night level (Course 6 Blackout Sanctum)
    board.buildLevel(LEVELS[5]);
    // Check that edge trims in night mode have vibrant cyan glow
    let foundCyanGlow = false;
    board.group.traverse((node: any) => {
      if (node.material && node.material.emissive) {
        const hex = node.material.emissive.getHex();
        if (hex === 0x00f5ff && node.material.emissiveIntensity >= 1.0) {
          foundCyanGlow = true;
        }
      }
    });
    expect(foundCyanGlow).toBe(true);
  });

  it('cleanly falls through Level 5 central chasm and Level 6 razor ridge edges', () => {
    // 1. Level 5 Central Chasm
    physics.loadLevel(LEVELS[4]);
    holeFallTriggered = false;
    const l5 = LEVELS[4];
    const cellSize = l5.cellSize;
    const originX5 = -(l5.grid[0].length * cellSize) / 2;
    const originZ5 = -(l5.grid.length * cellSize) / 2;

    // Drop in center of chasm (col 6, row 7)
    const chasmX = originX5 + 6 * cellSize + cellSize / 2;
    const chasmZ = originZ5 + 7 * cellSize + cellSize / 2;
    physics.marbleBody.setTranslation({ x: chasmX, y: 0.35, z: chasmZ }, true);
    physics.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

    for (let i = 0; i < 70; i++) {
      physics.step(0.016);
    }
    expect(holeFallTriggered).toBe(true);

    // 2. Level 6 Razor Ridge Edge
    physics.loadLevel(LEVELS[5]);
    holeFallTriggered = false;
    const l6 = LEVELS[5];
    const originX6 = -(l6.grid[0].length * cellSize) / 2;
    const originZ6 = -(l6.grid.length * cellSize) / 2;

    // Col 3, row 2 is abyss right beside the razor ridge
    const abyssX = originX6 + 3 * cellSize + cellSize / 2;
    const abyssZ = originZ6 + 2 * cellSize + cellSize / 2;
    physics.marbleBody.setTranslation({ x: abyssX, y: 0.35, z: abyssZ }, true);
    physics.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

    for (let i = 0; i < 70; i++) {
      physics.step(0.016);
    }
    expect(holeFallTriggered).toBe(true);
  });

  it('renders illuminated visual safety guardrails in Easy Mode and clean ridges in Medium/Hard Mode', () => {
    const board = new Board();

    board.buildLevel(LEVELS[1], 'medium');
    const mediumChildCount = board.group.children.length;

    board.buildLevel(LEVELS[1], 'easy');
    const easyChildCount = board.group.children.length;

    // Easy mode renders acrylic guardrails and glowing warning caps along exposed ridges
    expect(easyChildCount).toBeGreaterThan(mediumChildCount);

    board.buildLevel(LEVELS[1], 'hard');
    const hardChildCount = board.group.children.length;
    // Hard mode should match medium mode's clean ridge profile
    expect(hardChildCount).toBe(mediumChildCount);
  });
});
