import RAPIER from '@dimforge/rapier3d-compat';
import type { LevelDef } from '../levels/LevelData.js';

export interface CollisionCallbacks {
  onWallImpact: (intensity: number) => void;
  onHoleFall: () => void;
  onCheckpoint: (checkpointIndex: number) => void;
  onGoalReached: () => void;
  onBoostPad: () => void;
  onBouncer?: () => void;
}

export interface SpinnerObject {
  rigidBody: RAPIER.RigidBody;
  position: { x: number; y: number; z: number };
  angle: number;
  speed: number;
}

export interface BouncerObject {
  rigidBody: RAPIER.RigidBody;
  position: { x: number; y: number; z: number };
}

const BASE_GRAVITY = -9.81;
export const MAX_BOARD_TILT_RAD = (18.0 * Math.PI) / 180.0; // 18 degrees maximum physical tilt

export class PhysicsWorld {
  public world!: RAPIER.World;
  public marbleBody!: RAPIER.RigidBody;
  public marbleCollider!: RAPIER.Collider;
  private wallColliders: RAPIER.Collider[] = [];
  private sensorColliders: Map<
    number,
    { type: 'hole' | 'checkpoint' | 'goal' | 'boost' | 'bouncer'; index?: number }
  > = new Map();
  private spinners: SpinnerObject[] = [];
  private bouncers: BouncerObject[] = [];
  private callbacks: CollisionCallbacks;
  private eventQueue!: RAPIER.EventQueue;

  private isInitialized = false;
  private lastCheckpointPos = { x: 0, y: 0.5, z: 0 };
  private totalCheckpoints = 0;
  private currentCheckpointIndex = 0;

  constructor(callbacks: CollisionCallbacks) {
    this.callbacks = callbacks;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await RAPIER.init();

    this.world = new RAPIER.World({ x: 0, y: BASE_GRAVITY, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.isInitialized = true;
  }

  /**
   * Builds physical geometry for the chosen level, including spinners,
   * spring bouncers, boost ramps, and golden ring checkpoints.
   */
  public loadLevel(level: LevelDef): { startPos: { x: number; y: number; z: number } } {
    // Clear previous colliders and rigid bodies
    if (this.marbleBody) {
      this.world.removeRigidBody(this.marbleBody);
    }
    for (const spin of this.spinners) {
      this.world.removeRigidBody(spin.rigidBody);
    }
    for (const bnc of this.bouncers) {
      this.world.removeRigidBody(bnc.rigidBody);
    }
    this.spinners = [];
    this.bouncers = [];
    this.wallColliders = [];
    this.sensorColliders.clear();
    this.currentCheckpointIndex = 0;

    const grid = level.grid;
    const rows = grid.length;
    const cols = grid[0].length;
    const cellSize = level.cellSize;

    const boardWidth = cols * cellSize;
    const boardDepth = rows * cellSize;

    // Center offset
    const originX = -boardWidth / 2;
    const originZ = -boardDepth / 2;

    // 1. Static Floor Collider (underneath the board)
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0);
    const floorBody = this.world.createRigidBody(floorDesc);
    const floorColliderDesc = RAPIER.ColliderDesc.cuboid(boardWidth / 2 + 1.0, 0.25, boardDepth / 2 + 1.0)
      .setFriction(0.4)
      .setRestitution(0.15);
    this.world.createCollider(floorColliderDesc, floorBody);

    let startX = 0;
    let startZ = 0;
    let checkpointCount = 0;

    // 2. Iterate Level Grid to build walls, obstacles and sensors
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        const cx = originX + c * cellSize + cellSize / 2;
        const cz = originZ + r * cellSize + cellSize / 2;

        if (cell === '#') {
          // Wall / Curb Barrier Collider
          const wallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, level.wallHeight / 2, cz);
          const wallBody = this.world.createRigidBody(wallDesc);
          const wallColDesc = RAPIER.ColliderDesc.cuboid(cellSize / 2, level.wallHeight / 2, cellSize / 2)
            .setFriction(0.3)
            .setRestitution(0.4)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(wallColDesc, wallBody);
          this.wallColliders.push(col);
        } else if (cell === 'S') {
          startX = cx;
          startZ = cz;
        } else if (cell === 'P') {
          // Bruno Simon BlockSpinner: Red dual-arm kinematic rotating obstacle
          const initialAngle = (this.spinners.length * Math.PI) / 3;
          const halfAngle = initialAngle / 2;
          const spinDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(cx, 0.25, cz)
            .setRotation({
              x: 0,
              y: Math.sin(halfAngle),
              z: 0,
              w: Math.cos(halfAngle),
            });
          const spinBody = this.world.createRigidBody(spinDesc);
          // Span across two arms
          const armHalfLength = cellSize * 0.72;
          const spinColDesc = RAPIER.ColliderDesc.cuboid(armHalfLength, 0.12, 0.12)
            .setFriction(0.4)
            .setRestitution(0.75)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          this.world.createCollider(spinColDesc, spinBody);

          // Alternate rotation direction per spinner
          const speedDir = this.spinners.length % 2 === 0 ? 2.5 : -2.5;
          this.spinners.push({
            rigidBody: spinBody,
            position: { x: cx, y: 0.25, z: cz },
            angle: initialAngle,
            speed: speedDir,
          });
        } else if (cell === 'J') {
          // Bruno Simon BlockBouncer / Spring launch pad
          const bncDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0.1, cz);
          const bncBody = this.world.createRigidBody(bncDesc);
          const bncColDesc = RAPIER.ColliderDesc.cylinder(0.2, cellSize * 0.42)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(bncColDesc, bncBody);
          this.sensorColliders.set(col.handle, { type: 'bouncer' });
          this.bouncers.push({ rigidBody: bncBody, position: { x: cx, y: 0.1, z: cz } });
        } else if (cell === 'R' || cell === 'B') {
          // Speed Boost Ramp / Pad
          const boostDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0.15, cz);
          const boostBody = this.world.createRigidBody(boostDesc);
          const boostColDesc = RAPIER.ColliderDesc.cuboid(cellSize * 0.45, 0.2, cellSize * 0.45)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(boostColDesc, boostBody);
          this.sensorColliders.set(col.handle, { type: 'boost' });
        } else if (cell === 'C' || cell === 'O') {
          // Floating Golden Ring Checkpoint Gate
          const cpDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0.5, cz);
          const cpBody = this.world.createRigidBody(cpDesc);
          const cpColDesc = RAPIER.ColliderDesc.cylinder(0.5, cellSize * 0.45)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(cpColDesc, cpBody);
          this.sensorColliders.set(col.handle, { type: 'checkpoint', index: checkpointCount++ });
        } else if (cell === 'G') {
          // Checkered Finish Line Goal Arch
          const goalDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0.4, cz);
          const goalBody = this.world.createRigidBody(goalDesc);
          const goalColDesc = RAPIER.ColliderDesc.cylinder(0.5, cellSize * 0.5)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(goalColDesc, goalBody);
          this.sensorColliders.set(col.handle, { type: 'goal' });
        } else if (cell === 'H') {
          // Hazard Hole Sensor Trigger
          const holeDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0.2, cz);
          const holeBody = this.world.createRigidBody(holeDesc);
          const holeColDesc = RAPIER.ColliderDesc.cylinder(0.3, cellSize * 0.38)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(holeColDesc, holeBody);
          this.sensorColliders.set(col.handle, { type: 'hole' });
        }
      }
    }

    this.totalCheckpoints = checkpointCount;

    // 3. Spawn Dynamic Marble RigidBody
    const marbleRadius = 0.32;
    const marbleDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startX, marbleRadius + 0.1, startZ)
      .setLinearDamping(0.3)
      .setAngularDamping(0.18)
      .setCcdEnabled(true); // Continuous Collision Detection
    this.marbleBody = this.world.createRigidBody(marbleDesc);

    const marbleColliderDesc = RAPIER.ColliderDesc.ball(marbleRadius)
      .setDensity(2.5) // Chrome steel density feel
      .setFriction(0.4)
      .setRestitution(0.35)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.marbleCollider = this.world.createCollider(marbleColliderDesc, this.marbleBody);

    this.lastCheckpointPos = { x: startX, y: marbleRadius + 0.1, z: startZ };
    return { startPos: { x: startX, y: marbleRadius + 0.1, z: startZ } };
  }

  /**
   * Rotated Gravity Engine:
   * Dynamically aligns Rapier's global gravity vector according to board tilt.
   */
  public updateGravity(pitchNorm: number, rollNorm: number): void {
    const pitchRad = pitchNorm * MAX_BOARD_TILT_RAD;
    const rollRad = rollNorm * MAX_BOARD_TILT_RAD;

    const gx = -BASE_GRAVITY * Math.sin(rollRad);
    const gz = BASE_GRAVITY * Math.sin(pitchRad);
    const gy = BASE_GRAVITY * Math.cos(pitchRad) * Math.cos(rollRad);

    this.world.gravity = { x: gx, y: gy, z: gz };
  }

  /**
   * Applies discrete actions (Nitro boost, shake jump).
   */
  public applyAction(boost: boolean, shake: boolean, dt: number = 0.016): void {
    if (!this.marbleBody) return;

    if (shake) {
      const pos = this.marbleBody.translation();
      // Shake-to-Jump vertical pop - only when grounded (y near floor ~0.32)
      if (pos.y < 0.45) {
        this.marbleBody.applyImpulse({ x: 0, y: 1.6, z: 0 }, true);
      }
    }

    const MAX_SPEED = 7.5;
    const MAX_BOOST_SPEED = 13.0;
    const vel = this.marbleBody.linvel();
    const speed = Math.hypot(vel.x, vel.z);

    if (boost) {
      if (speed > 0.1 && speed < MAX_BOOST_SPEED) {
        const dirX = vel.x / speed;
        const dirZ = vel.z / speed;
        const boostImpulse = Math.min(18.0 * dt, MAX_BOOST_SPEED - speed);
        this.marbleBody.applyImpulse({ x: dirX * boostImpulse, y: 0, z: dirZ * boostImpulse }, true);
      }
    } else if (speed > MAX_SPEED) {
      // Natural dampening back to max normal speed
      const dampRatio = Math.max(0.5, (speed - (speed - MAX_SPEED) * 5.0 * dt) / speed);
      this.marbleBody.setLinvel({ x: vel.x * dampRatio, y: vel.y, z: vel.z * dampRatio }, true);
    }
  }

  /**
   * Advances physics simulation by fixed delta time dt,
   * stepping Rapier kinematic spinners and collision events.
   */
  public step(dt: number): void {
    if (!this.isInitialized || !this.marbleBody) return;

    // 1. Advance Kinematic Spinners (Bruno Simon Lesson 53)
    for (const spin of this.spinners) {
      spin.angle += spin.speed * dt;
      // Y-axis rotation quaternion: { x: 0, y: sin(theta/2), z: 0, w: cos(theta/2) }
      const halfAngle = spin.angle / 2;
      spin.rigidBody.setNextKinematicRotation({
        x: 0,
        y: Math.sin(halfAngle),
        z: 0,
        w: Math.cos(halfAngle),
      });
    }

    // 2. Step Rapier World
    this.world.step(this.eventQueue);

    // 3. Process collisions and triggers
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;

      const isMarble1 = handle1 === this.marbleCollider.handle;
      const isMarble2 = handle2 === this.marbleCollider.handle;
      if (!isMarble1 && !isMarble2) return;

      const otherHandle = isMarble1 ? handle2 : handle1;

      // Check if other collider is a sensor trigger
      if (this.sensorColliders.has(otherHandle)) {
        const sensor = this.sensorColliders.get(otherHandle)!;
        if (sensor.type === 'hole') {
          this.callbacks.onHoleFall();
        } else if (sensor.type === 'checkpoint') {
          const pos = this.marbleBody.translation();
          this.lastCheckpointPos = { x: pos.x, y: pos.y + 0.1, z: pos.z };
          const idx = sensor.index ?? 0;
          this.currentCheckpointIndex = Math.max(this.currentCheckpointIndex, idx + 1);
          this.callbacks.onCheckpoint(idx);
        } else if (sensor.type === 'goal') {
          this.callbacks.onGoalReached();
        } else if (sensor.type === 'boost') {
          // Speed Boost Ramp: forward propulsion along travel heading (or -Z towards goal if slow)
          const vel = this.marbleBody.linvel();
          const speed = Math.hypot(vel.x, vel.z);
          if (speed > 0.1) {
            const dirX = vel.x / speed;
            const dirZ = vel.z / speed;
            this.marbleBody.applyImpulse({ x: dirX * 6.5, y: 0.35, z: dirZ * 6.5 }, true);
          } else {
            this.marbleBody.applyImpulse({ x: 0, y: 0.35, z: -6.5 }, true);
          }
          this.callbacks.onBoostPad();
        } else if (sensor.type === 'bouncer') {
          // BlockBouncer: Launch marble vertically into satisfying ~1.9m arcade arc
          const vel = this.marbleBody.linvel();
          this.marbleBody.setLinvel({ x: vel.x * 0.9, y: 6.2, z: vel.z * 0.9 }, true);
          if (this.callbacks.onBouncer) {
            this.callbacks.onBouncer();
          }
        }
      } else {
        // Wall / Spinner impact
        const vel = this.marbleBody.linvel();
        const speed = Math.hypot(vel.x, vel.y, vel.z);
        if (speed > 0.8) {
          const intensity = Math.min(speed / 8.0, 1.0);
          this.callbacks.onWallImpact(intensity);
        }
      }
    });

    // Check if marble fell off the board into the cloud sea
    const pos = this.marbleBody.translation();
    if (pos.y < -3.5) {
      this.callbacks.onHoleFall();
      this.respawnAtLastCheckpoint();
    }
  }

  public respawnAtLastCheckpoint(): void {
    if (!this.marbleBody) return;
    this.marbleBody.setTranslation(
      { x: this.lastCheckpointPos.x, y: this.lastCheckpointPos.y, z: this.lastCheckpointPos.z },
      true
    );
    this.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  public getMarblePosition(): { x: number; y: number; z: number } {
    if (!this.marbleBody) return { x: 0, y: 0, z: 0 };
    return this.marbleBody.translation();
  }

  public getMarbleRotation(): { x: number; y: number; z: number; w: number } {
    if (!this.marbleBody) return { x: 0, y: 0, z: 0, w: 1 };
    return this.marbleBody.rotation();
  }

  public getMarbleSpeed(): number {
    if (!this.marbleBody) return 0;
    const v = this.marbleBody.linvel();
    return Math.hypot(v.x, v.z);
  }

  public getSpinners(): SpinnerObject[] {
    return this.spinners;
  }

  public getBouncers(): BouncerObject[] {
    return this.bouncers;
  }

  public getCheckpointProgress(): { current: number; total: number } {
    return {
      current: this.currentCheckpointIndex,
      total: Math.max(this.totalCheckpoints, 1),
    };
  }
}
