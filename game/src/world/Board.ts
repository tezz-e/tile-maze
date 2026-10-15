import * as THREE from 'three';
import type { LevelDef } from '../levels/LevelData.js';
import { MAX_BOARD_TILT_RAD, type SpinnerObject } from '../physics/PhysicsWorld.js';
import { TextureGenerator } from './TextureGenerator.js';

export class Board {
  public group: THREE.Group;
  private spinnerMeshes: Array<{ group: THREE.Group; index: number }> = [];
  private goldenRings: THREE.Mesh[] = [];
  private bouncerGroups: THREE.Group[] = [];
  private finishArch: THREE.Group | null = null;
  private blueTileMat!: THREE.MeshStandardMaterial;
  private yellowCurbMat!: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.initMaterials();
  }

  private initMaterials(): void {
    const tileTex = TextureGenerator.createBlueTiles();
    this.blueTileMat = new THREE.MeshStandardMaterial({
      map: tileTex,
      roughness: 0.22,
      metalness: 0.12,
      envMapIntensity: 1.3,
    });

    this.yellowCurbMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Radiant warm yellow curb
      roughness: 0.35,
      metalness: 0.15,
    });
  }

  public buildLevel(level: LevelDef): void {
    // Clear previous children
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
    this.spinnerMeshes = [];
    this.goldenRings = [];
    this.bouncerGroups = [];
    this.finishArch = null;

    const grid = level.grid;
    const rows = grid.length;
    const cols = grid[0].length;
    const cellSize = level.cellSize;

    const boardWidth = cols * cellSize;
    const boardDepth = rows * cellSize;
    const originX = -boardWidth / 2;
    const originZ = -boardDepth / 2;

    // Outer subtle base tray
    const baseGeo = new THREE.BoxGeometry(boardWidth + 0.6, 0.5, boardDepth + 0.6);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.2,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, -0.3, 0);
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // Track Tile InstancedMesh for maximum performance
    let floorTileCount = 0;
    let wallCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell !== ' ') floorTileCount++;
        if (cell === '#') wallCount++;
      }
    }

    const tileGeo = new THREE.BoxGeometry(cellSize, 0.2, cellSize);
    const tileInstanced = new THREE.InstancedMesh(tileGeo, this.blueTileMat, floorTileCount);
    tileInstanced.receiveShadow = true;
    tileInstanced.castShadow = true;

    const dummy = new THREE.Object3D();
    let tileIdx = 0;

    // Materials for obstacles
    const redArmMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Bright red rotor arms
      roughness: 0.25,
      metalness: 0.2,
    });
    const darkPivotMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.8,
    });
    const chevronMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createChevrons(),
      roughness: 0.3,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.45,
    });

    let spinnerCount = 0;

    // Populate Level Grid Tiles & Obstacles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell === ' ') continue;

        const cx = originX + c * cellSize + cellSize / 2;
        const cz = originZ + r * cellSize + cellSize / 2;

        // Place blue floor tile
        dummy.position.set(cx, -0.1, cz);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tileInstanced.setMatrixAt(tileIdx++, dummy.matrix);

        // Curbs on edges adjacent to outer border or open air
        this.addCurbsIfNeeded(grid, r, c, rows, cols, cx, cz, cellSize);

        if (cell === '#') {
          // Wall Barrier: Modern slate pillar with yellow curb base
          const wallGroup = new THREE.Group();
          wallGroup.position.set(cx, 0, cz);

          const wallCapGeo = new THREE.BoxGeometry(cellSize * 0.96, level.wallHeight, cellSize * 0.96);
          const wallCapMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.4,
            metalness: 0.6,
          });
          const wallCap = new THREE.Mesh(wallCapGeo, wallCapMat);
          wallCap.position.y = level.wallHeight / 2;
          wallCap.castShadow = true;
          wallCap.receiveShadow = true;
          wallGroup.add(wallCap);

          // Yellow curb base accent
          const wallBaseGeo = new THREE.BoxGeometry(cellSize, 0.12, cellSize);
          const wallBase = new THREE.Mesh(wallBaseGeo, this.yellowCurbMat);
          wallBase.position.y = 0.06;
          wallBase.castShadow = true;
          wallGroup.add(wallBase);

          this.group.add(wallGroup);
        } else if (cell === 'S') {
          // Start Spawn Pad: Blue circular landing graphic with glowing ring
          const startGeo = new THREE.CylinderGeometry(cellSize * 0.42, cellSize * 0.42, 0.04, 32);
          const startMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x0369a1,
            emissiveIntensity: 0.35,
            roughness: 0.3,
          });
          const startMesh = new THREE.Mesh(startGeo, startMat);
          startMesh.position.set(cx, 0.02, cz);
          this.group.add(startMesh);

          // Outer yellow accent ring
          const ringGeo = new THREE.RingGeometry(cellSize * 0.4, cellSize * 0.46, 32);
          const ringMesh = new THREE.Mesh(ringGeo, this.yellowCurbMat);
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.set(cx, 0.03, cz);
          this.group.add(ringMesh);
        } else if (cell === 'P') {
          // Bruno Simon BlockSpinner: Yellow base + Dark pivot + Red dual-arm rotor
          const spinGroup = new THREE.Group();
          spinGroup.position.set(cx, 0, cz);

          // Yellow round base
          const baseCylGeo = new THREE.CylinderGeometry(cellSize * 0.38, cellSize * 0.42, 0.08, 32);
          const baseCyl = new THREE.Mesh(baseCylGeo, this.yellowCurbMat);
          baseCyl.position.y = 0.04;
          baseCyl.castShadow = true;
          spinGroup.add(baseCyl);

          // Dark center pivot cylinder
          const pivotGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.48, 24);
          const pivot = new THREE.Mesh(pivotGeo, darkPivotMat);
          pivot.position.y = 0.24;
          pivot.castShadow = true;
          spinGroup.add(pivot);

          // Rotating dual arm group
          const rotorGroup = new THREE.Group();
          rotorGroup.position.y = 0.25;

          const armLength = cellSize * 1.45;
          const armGeo = new THREE.CylinderGeometry(0.1, 0.1, armLength, 16);
          armGeo.rotateZ(Math.PI / 2); // Lie horizontal across X axis
          const rotorArm = new THREE.Mesh(armGeo, redArmMat);
          rotorArm.castShadow = true;
          rotorGroup.add(rotorArm);

          // Red rounded end caps
          const capGeo = new THREE.SphereGeometry(0.1, 16, 16);
          const cap1 = new THREE.Mesh(capGeo, redArmMat);
          cap1.position.x = armLength / 2;
          rotorGroup.add(cap1);

          const cap2 = new THREE.Mesh(capGeo, redArmMat);
          cap2.position.x = -armLength / 2;
          rotorGroup.add(cap2);

          spinGroup.add(rotorGroup);
          this.group.add(spinGroup);

          this.spinnerMeshes.push({ group: rotorGroup, index: spinnerCount++ });
        } else if (cell === 'J') {
          // Bruno Simon BlockBouncer: Circular grey disc with pink target bullseye rings
          const bncGroup = new THREE.Group();
          bncGroup.position.set(cx, 0, cz);

          // Yellow spring base cylinder
          const springGeo = new THREE.CylinderGeometry(cellSize * 0.28, cellSize * 0.32, 0.12, 24);
          const spring = new THREE.Mesh(springGeo, this.yellowCurbMat);
          spring.position.y = 0.06;
          bncGroup.add(spring);

          // Dark rim platform disc
          const discGeo = new THREE.CylinderGeometry(cellSize * 0.44, cellSize * 0.44, 0.08, 32);
          const discMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
          const disc = new THREE.Mesh(discGeo, discMat);
          disc.position.y = 0.12;
          disc.castShadow = true;
          bncGroup.add(disc);

          // Concentric Bullseye rings
          const pinkMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide });
          const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

          // Outer pink ring
          const r1 = new THREE.Mesh(new THREE.RingGeometry(cellSize * 0.28, cellSize * 0.42, 32), pinkMat);
          r1.rotation.x = -Math.PI / 2;
          r1.position.y = 0.165;
          bncGroup.add(r1);

          // Middle white ring
          const r2 = new THREE.Mesh(new THREE.RingGeometry(cellSize * 0.14, cellSize * 0.28, 32), whiteMat);
          r2.rotation.x = -Math.PI / 2;
          r2.position.y = 0.166;
          bncGroup.add(r2);

          // Center pink core button
          const r3 = new THREE.Mesh(new THREE.CircleGeometry(cellSize * 0.14, 32), pinkMat);
          r3.rotation.x = -Math.PI / 2;
          r3.position.y = 0.167;
          bncGroup.add(r3);

          this.group.add(bncGroup);
          this.bouncerGroups.push(bncGroup);
        } else if (cell === 'R' || cell === 'B') {
          // Speed Boost Ramp: Incline wedge with white chevron arrows (>>)
          const rampGroup = new THREE.Group();
          rampGroup.position.set(cx, 0, cz);

          const rampWidth = cellSize * 0.88;
          const rampLength = cellSize * 0.95;
          const rampHeight = 0.32;

          // Inclined wedge shape
          const shape = new THREE.Shape();
          shape.moveTo(-rampLength / 2, 0.02);
          shape.lineTo(rampLength / 2, rampHeight);
          shape.lineTo(rampLength / 2, 0);
          shape.lineTo(-rampLength / 2, 0);
          shape.closePath();

          const extrudeSettings = {
            steps: 1,
            depth: rampWidth,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.03,
            bevelSegments: 2,
          };
          const wedgeGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          wedgeGeo.center();

          const wedge = new THREE.Mesh(wedgeGeo, this.yellowCurbMat);
          wedge.position.set(0, rampHeight / 2, 0);
          wedge.rotation.y = Math.PI / 2; // Slope rises along -Z
          wedge.castShadow = true;
          rampGroup.add(wedge);

          // Chevrons overlay on inclined plane
          const chevPlaneGeo = new THREE.PlaneGeometry(rampWidth * 0.88, rampLength * 0.95);
          const chevMesh = new THREE.Mesh(chevPlaneGeo, chevronMat);
          chevMesh.rotation.x = -Math.PI / 2 - Math.atan2(rampHeight, rampLength);
          chevMesh.position.set(0, rampHeight / 2 + 0.03, 0);
          rampGroup.add(chevMesh);

          this.group.add(rampGroup);
        } else if (cell === 'C' || cell === 'O') {
          // Floating Golden Ring Checkpoint Gate
          const ringMesh = new THREE.Mesh(
            new THREE.TorusGeometry(cellSize * 0.35, 0.065, 16, 32),
            ringMat
          );
          ringMesh.position.set(cx, 0.65, cz);
          ringMesh.castShadow = true;
          this.group.add(ringMesh);
          this.goldenRings.push(ringMesh);

          // Floor circular accent
          const disc = new THREE.Mesh(
            new THREE.RingGeometry(cellSize * 0.3, cellSize * 0.42, 24),
            new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
          );
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(cx, 0.02, cz);
          this.group.add(disc);
        } else if (cell === 'G') {
          // Checkered Finish Line Archway matching the screenshot!
          const archGroup = new THREE.Group();
          archGroup.position.set(cx, 0, cz);

          const archWidth = cellSize * 1.5;
          const archHeight = 2.8;

          // Two metallic pillars
          const pillarGeo = new THREE.BoxGeometry(0.24, archHeight, 0.24);
          const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });

          const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
          leftPillar.position.set(-archWidth / 2, archHeight / 2, 0);
          leftPillar.castShadow = true;
          archGroup.add(leftPillar);

          const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
          rightPillar.position.set(archWidth / 2, archHeight / 2, 0);
          rightPillar.castShadow = true;
          archGroup.add(rightPillar);

          // Horizontal banner holding checkered flag texture
          const bannerGeo = new THREE.BoxGeometry(archWidth + 0.4, 0.55, 0.1);
          const bannerMat = new THREE.MeshStandardMaterial({
            map: TextureGenerator.createFinishCheckered(),
            roughness: 0.3,
          });
          const banner = new THREE.Mesh(bannerGeo, bannerMat);
          banner.position.set(0, archHeight - 0.2, 0);
          banner.castShadow = true;
          archGroup.add(banner);

          // Pink/red pennant flags on top of each pillar
          const flagMat = new THREE.MeshStandardMaterial({
            color: 0xf43f5e,
            side: THREE.DoubleSide,
            roughness: 0.4,
          });
          const flagPoleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12);
          const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });

          [-archWidth / 2, archWidth / 2].forEach((xPos) => {
            const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
            pole.position.set(xPos, archHeight + 0.4, 0);
            archGroup.add(pole);

            // Triangle pennant flag
            const flagShape = new THREE.Shape();
            flagShape.moveTo(0, 0);
            flagShape.lineTo(0.5, -0.18);
            flagShape.lineTo(0, -0.36);
            flagShape.closePath();
            const flagMesh = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), flagMat);
            flagMesh.position.set(xPos + 0.04, archHeight + 0.7, 0);
            archGroup.add(flagMesh);
          });

          // Emerald landing goal pad
          const goalPadGeo = new THREE.CylinderGeometry(cellSize * 0.45, cellSize * 0.45, 0.04, 32);
          const goalPadMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.5,
            roughness: 0.2,
          });
          const goalPad = new THREE.Mesh(goalPadGeo, goalPadMat);
          goalPad.position.set(0, 0.02, 0);
          archGroup.add(goalPad);

          this.group.add(archGroup);
          this.finishArch = archGroup;
        } else if (cell === 'H') {
          // Hazard Hole visual
          const holeGeo = new THREE.CylinderGeometry(cellSize * 0.35, cellSize * 0.35, 0.42, 24);
          const holeMat = new THREE.MeshStandardMaterial({
            color: 0x030712,
            roughness: 0.9,
            metalness: 0.1,
          });
          const holeMesh = new THREE.Mesh(holeGeo, holeMat);
          holeMesh.position.set(cx, -0.01, cz);

          const ringGeo = new THREE.RingGeometry(cellSize * 0.33, cellSize * 0.38, 24);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.set(cx, 0.01, cz);

          this.group.add(holeMesh);
          this.group.add(ringMesh);
        }
      }
    }

    tileInstanced.instanceMatrix.needsUpdate = true;
    this.group.add(tileInstanced);
  }

  /**
   * Adds raised yellow curb guardrails on track edges bordering open air or track borders.
   */
  private addCurbsIfNeeded(
    grid: string[],
    r: number,
    c: number,
    rows: number,
    cols: number,
    cx: number,
    cz: number,
    cellSize: number
  ): void {
    const curbHeight = 0.26;
    const curbThickness = 0.2;
    const curbLength = cellSize;

    // Check North (r - 1)
    if (r === 0 || grid[r - 1][c] === ' ') {
      this.spawnCurbSegment(cx, cz - cellSize / 2 + curbThickness / 2, curbLength, curbThickness, curbHeight);
    }
    // Check South (r + 1)
    if (r === rows - 1 || grid[r + 1][c] === ' ') {
      this.spawnCurbSegment(cx, cz + cellSize / 2 - curbThickness / 2, curbLength, curbThickness, curbHeight);
    }
    // Check West (c - 1)
    if (c === 0 || grid[r][c - 1] === ' ') {
      this.spawnCurbSegment(cx - cellSize / 2 + curbThickness / 2, cz, curbThickness, curbLength, curbHeight);
    }
    // Check East (c + 1)
    if (c === cols - 1 || grid[r][c + 1] === ' ') {
      this.spawnCurbSegment(cx + cellSize / 2 - curbThickness / 2, cz, curbThickness, curbLength, curbHeight);
    }
  }

  private spawnCurbSegment(x: number, z: number, sx: number, sz: number, h: number): void {
    const geo = new THREE.BoxGeometry(sx * 0.96, h, sz * 0.96);
    const mesh = new THREE.Mesh(geo, this.yellowCurbMat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /**
   * Synchronizes visual obstacles (spinners, floating rings) with physics & time.
   */
  public update(dt: number, spinners: SpinnerObject[]): void {
    // 1. Sync kinematic spinner rotors
    for (const spinMesh of this.spinnerMeshes) {
      if (spinMesh.index < spinners.length) {
        const physSpin = spinners[spinMesh.index];
        spinMesh.group.rotation.y = physSpin.angle;
      }
    }

    // 2. Animate floating golden rings
    for (const ring of this.goldenRings) {
      ring.rotation.y += dt * 1.5;
    }
  }

  /**
   * The skyway track is anchored in world space to maintain exact 1:1 synchronization
   * with Rapier physics colliders and the floor at y = 0.
   * Tilt steering responsiveness is conveyed through dynamic marble physics and follow-camera banking.
   */
  public setTilt(_pitchNorm: number, _rollNorm: number): void {
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
  }
}
