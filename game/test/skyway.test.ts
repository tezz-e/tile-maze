import * as THREE from 'three';
import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { LEVELS } from '../src/levels/LevelData.js';
import { TextureGenerator } from '../src/world/TextureGenerator.js';
import { SkyEnvironment } from '../src/world/Environment.js';

describe('Skyway Obstacles & Physics Mechanics', () => {
  let physics: PhysicsWorld;
  let bouncerTriggered = false;
  let boostTriggered = false;
  let checkpointTriggered = false;

  beforeAll(async () => {
    physics = new PhysicsWorld({
      onWallImpact: () => {},
      onHoleFall: () => {},
      onCheckpoint: () => {
        checkpointTriggered = true;
      },
      onGoalReached: () => {},
      onBoostPad: () => {
        boostTriggered = true;
      },
      onBouncer: () => {
        bouncerTriggered = true;
      },
    });
    await physics.init();
    physics.loadLevel(LEVELS[0]);
  });

  it('spawns Bruno Simon kinematic spinners and advances rotation angles', () => {
    const spinners = physics.getSpinners();
    expect(spinners.length).toBeGreaterThan(0);

    const initialAngle = spinners[0].angle;
    physics.step(0.05);
    const updatedAngle = spinners[0].angle;

    // Angle should change according to dt * speed
    expect(updatedAngle).not.toBe(initialAngle);
  });

  it('detects and registers bouncers from level data', () => {
    const bouncers = physics.getBouncers();
    expect(bouncers.length).toBeGreaterThan(0);
  });

  it('tracks checkpoint progress accurately with 4 checkpoints on Level 1', () => {
    const progress = physics.getCheckpointProgress();
    expect(progress.total).toBe(4);
    expect(progress.current).toBe(0);
  });

  it('verifies all 4 courses flow from South (start) to North (goal) for the follow-camera', () => {
    LEVELS.forEach((level) => {
      let startY = -1;
      let goalY = -1;
      level.grid.forEach((row, r) => {
        if (row.includes('S')) startY = r;
        if (row.includes('G')) goalY = r;
      });
      expect(startY).toBeGreaterThan(goalY);
    });
  });

  it('launches marble upwards within realistic arcade arc when landing on BlockBouncer', () => {
    const bouncers = physics.getBouncers();
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

    const pillarTex = TextureGenerator.createPillarTexture(0xf472b6, false);
    expect(pillarTex).toBeDefined();
    pillarTex.dispose();

    const windowTex = TextureGenerator.createPillarWindowTexture();
    expect(windowTex).toBeDefined();
    windowTex.dispose();
  });

  it('validates all 4 levels have distinct themes with valid lighting, sky and wall parameters', () => {
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

      // L1-L3 walls must not be near-black (side luminance > 0.25)
      if (level.id < 4) {
        expect(sideLum).toBeGreaterThan(0.25);
      } else {
        // L4 neon edge glow
        expect(level.theme.wallStripeEmissiveIntensity).toBeGreaterThan(1.0);
      }

      // Verify pillar palette
      expect(level.theme.pillarPalette).toBeDefined();
      expect(level.theme.pillarPalette.length).toBeGreaterThanOrEqual(6);

      const themedSky = TextureGenerator.createSkyEquirectangular(
        level.theme.skyTop,
        level.theme.skyBottom,
        level.id === 4
      );
      expect(themedSky).toBeDefined();
      themedSky.dispose();
    });
  });

  it('guarantees cloud clearance outside track boundaries on all 4 levels', () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      toneMappingExposure: 1.0,
      shadowMap: {},
    } as any;
    const env = new SkyEnvironment(scene, mockRenderer);

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

  it('verifies Level 4 wide track (~21m) specifically pushes clouds to |x| > 13.5m and has zero cloud intersection', () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      toneMappingExposure: 1.0,
      shadowMap: {},
    } as any;
    const env = new SkyEnvironment(scene, mockRenderer);
    const l4 = LEVELS[3];
    const boardWidth = l4.grid[0].length * l4.cellSize;
    const boardDepth = l4.grid.length * l4.cellSize;
    expect(boardWidth).toBeCloseTo(21.0, 1);

    env.adjustCloudClearance(boardWidth, boardDepth);
    const flankClouds = env.getFlankCloudPositions();
    flankClouds.forEach((pos) => {
      expect(Math.abs(pos.x)).toBeGreaterThan(13.5);
      expect(pos.y).toBeLessThanOrEqual(-1.6);
    });

    // Zero cloud mesh intersection with wide track
    expect(env.hasCloudTrackIntersection(boardWidth, boardDepth, l4.wallHeight)).toBe(false);
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
});
