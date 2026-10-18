import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { LEVELS } from '../src/levels/LevelData.js';

describe('PhysicsWorld - Rotated Gravity & Stability', () => {
  let physics: PhysicsWorld;

  beforeAll(async () => {
    physics = new PhysicsWorld({
      onWallImpact: () => {},
      onHoleFall: () => {},
      onCheckpoint: () => {},
      onGoalReached: () => {},
      onBoostPad: () => {},
    });
    await physics.init();
    physics.loadLevel(LEVELS[0]);
  });

  it('aligns rotated gravity vector with correct tilt signs', () => {
    // 1. Nose down forward (+pitch) -> gz must be negative (accelerating towards -Z)
    physics.updateGravity(1.0, 0.0);
    // @ts-expect-error accessing private Rapier world for test verification
    const gravForward = physics.world.gravity;
    expect(gravForward.z).toBeLessThan(-0.5);
    expect(gravForward.x).toBeCloseTo(0, 2);

    // 2. Nose up backward (-pitch) -> gz must be positive (accelerating towards +Z)
    physics.updateGravity(-1.0, 0.0);
    // @ts-expect-error accessing private Rapier world for test verification
    const gravBackward = physics.world.gravity;
    expect(gravBackward.z).toBeGreaterThan(0.5);
    expect(gravBackward.x).toBeCloseTo(0, 2);

    // 3. Tilt right (+roll) -> gx must be positive (accelerating towards +X)
    physics.updateGravity(0.0, 1.0);
    // @ts-expect-error accessing private Rapier world for test verification
    const gravRight = physics.world.gravity;
    expect(gravRight.x).toBeGreaterThan(0.5);
    expect(gravRight.z).toBeCloseTo(0, 2);

    // 4. Tilt left (-roll) -> gx must be negative (accelerating towards -X)
    physics.updateGravity(0.0, -1.0);
    // @ts-expect-error accessing private Rapier world for test verification
    const gravLeft = physics.world.gravity;
    expect(gravLeft.x).toBeLessThan(-0.5);
    expect(gravLeft.z).toBeCloseTo(0, 2);
  });

  it('caps marble velocity during sustained boost without speed explosion', () => {
    physics.loadLevel(LEVELS[0]);
    // Give initial speed northward along the runway corridor
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setLinvel({ x: 0, y: 0, z: -2.0 }, true);

    // Apply continuous boost over 120 frames (2 seconds)
    for (let i = 0; i < 120; i++) {
      physics.applyAction(true, false, 0.016);
      physics.step(0.016);
    }

    const speed = physics.getMarbleSpeed();
    // Speed should be capped and stable (less than or equal to MAX_BOOST_SPEED ~13.0)
    expect(speed).toBeLessThanOrEqual(14.0);
    expect(speed).toBeGreaterThan(5.0);
  });

  it('prevents air jumping when marble is not grounded', () => {
    physics.loadLevel(LEVELS[0]);
    // Place marble high in the air
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setTranslation({ x: 0, y: 5.0, z: 0 }, true);
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

    // Trigger shake while in mid-air
    physics.applyAction(false, true, 0.016);
    // @ts-expect-error accessing marbleBody
    const velMidAir = physics.marbleBody.linvel();
    // Vertical velocity should NOT increase because marble is not grounded
    expect(velMidAir.y).toBeCloseTo(0, 2);
  });

  it('allows marble to move freely in Level 2 after transitioning from Level 1', () => {
    physics.loadLevel(LEVELS[0]);
    physics.step(0.016);

    // Transition to Level 2
    physics.loadLevel(LEVELS[1]);
    const p0 = physics.getMarblePosition();

    // In Level 2, the open path from 'S' is towards the right (+roll) along Row 9
    physics.updateGravity(0.0, 1.0); // Tilt right

    for (let i = 0; i < 40; i++) {
      physics.step(0.016);
    }

    const p1 = physics.getMarblePosition();
    const distMoved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    expect(distMoved).toBeGreaterThan(0.2);
  });

  it('accelerates rotor speeds by 25% in Hard Mode compared to Medium Mode', () => {
    physics.loadLevel(LEVELS[1], 'medium');
    const mediumSpinners = physics.getSpinners();
    expect(mediumSpinners.length).toBeGreaterThan(0);
    const mediumSpeed = Math.abs(mediumSpinners[0].speed);

    physics.loadLevel(LEVELS[1], 'hard');
    const hardSpinners = physics.getSpinners();
    const hardSpeed = Math.abs(hardSpinners[0].speed);

    expect(hardSpeed).toBeCloseTo(mediumSpeed * 1.25, 4);
    expect(physics.getDifficulty()).toBe('hard');
  });

  it('generates physical safety guardrails in Easy Mode along exposed cliff edges', () => {
    physics.loadLevel(LEVELS[1], 'medium');
    let mediumColliders = 0;
    // @ts-expect-error accessing world for collider counting
    physics.world.forEachCollider(() => {
      mediumColliders++;
    });

    physics.loadLevel(LEVELS[1], 'easy');
    let easyColliders = 0;
    // @ts-expect-error accessing world for collider counting
    physics.world.forEachCollider(() => {
      easyColliders++;
    });

    // Easy mode should have significantly more colliders for safety barriers along open edges
    expect(easyColliders).toBeGreaterThan(mediumColliders + 10);
    expect(physics.getDifficulty()).toBe('easy');
  });

  it('preserves jump gap trajectory in Easy Mode so gap leaps are not blocked', () => {
    // Level 1 has a jump gap from (4, 4) north to (4, 2)
    physics.loadLevel(LEVELS[0], 'easy');
    const l1 = LEVELS[0];
    const cellSize = l1.cellSize;
    const originX = -(l1.grid[0].length * cellSize) / 2;
    const originZ = -(l1.grid.length * cellSize) / 2;
    const launchX = originX + 4 * cellSize + cellSize / 2;
    const launchZ = originZ + 4 * cellSize + cellSize / 2;

    // Place marble on launch ramp heading north towards goal
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setTranslation({ x: launchX, y: 0.8, z: launchZ }, true);
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setLinvel({ x: 0, y: 3.5, z: -8.0 }, true);

    for (let i = 0; i < 15; i++) {
      physics.step(0.016);
    }

    // Marble should have crossed north past the gap (z should be significantly less than launchZ)
    // @ts-expect-error accessing marbleBody
    const currentZ = physics.marbleBody.translation().z;
    expect(currentZ).toBeLessThan(launchZ - cellSize);
  });

  it('preserves Level 3 bouncer jump and island trajectory in Easy Mode without invisible walls', () => {
    physics.loadLevel(LEVELS[2], 'easy');
    const l3 = LEVELS[2];
    const cellSize = l3.cellSize;
    const originX = -(l3.grid[0].length * cellSize) / 2;
    const originZ = -(l3.grid.length * cellSize) / 2;

    // Launch from bouncy pad J at (9, 9)
    const jX = originX + 9 * cellSize + cellSize / 2;
    const jZ = originZ + 9 * cellSize + cellSize / 2;

    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setTranslation({ x: jX, y: 0.5, z: jZ }, true);
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setLinvel({ x: 0, y: 6.8, z: -5.0 }, true);

    for (let i = 0; i < 110; i++) {
      physics.step(0.016);
    }

    // @ts-expect-error accessing marbleBody
    const landedPos = physics.marbleBody.translation();
    // Marble should have crossed north across the gap into row 7 or beyond (z <= jZ - cellSize * 1.5)
    expect(landedPos.z).toBeLessThan(jZ - cellSize * 1.5);
    // Marble should be grounded on or near the floor (y <= 0.6m), not stuck at y=2.4m on a tall wall
    expect(landedPos.y).toBeLessThan(0.8);
  });
});

