import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { LEVELS } from '../src/levels/LevelData.js';
import { TextureGenerator } from '../src/world/TextureGenerator.js';

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
  });
});
