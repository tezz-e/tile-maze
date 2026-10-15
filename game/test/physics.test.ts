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
    // 1. Nose down forward (-pitch) -> gz must be negative (accelerating towards -Z)
    physics.updateGravity(-1.0, 0.0);
    // @ts-expect-error accessing private Rapier world for test verification
    const gravForward = physics.world.gravity;
    expect(gravForward.z).toBeLessThan(-0.5);
    expect(gravForward.x).toBeCloseTo(0, 2);

    // 2. Nose up backward (+pitch) -> gz must be positive (accelerating towards +Z)
    physics.updateGravity(1.0, 0.0);
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
    // Give initial speed
    // @ts-expect-error accessing marbleBody
    physics.marbleBody.setLinvel({ x: 2.0, y: 0, z: 0 }, true);

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
});
