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
  private blueTileTexture!: THREE.Texture;
  private blueTileMat!: THREE.MeshStandardMaterial;
  private yellowCurbMat!: THREE.MeshStandardMaterial;
  private levelMaterials: THREE.Material[] = [];
  private levelGeometries: THREE.BufferGeometry[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.initMaterials();
  }

  private initMaterials(): void {
    const tileTex = TextureGenerator.createBlueTiles();
    this.blueTileTexture = tileTex;
    this.blueTileMat = new THREE.MeshStandardMaterial({
      map: tileTex,
      roughness: 0.12,
      metalness: 0.22,
      envMapIntensity: 1.8,
    });

    this.yellowCurbMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Radiant warm yellow curb
      roughness: 0.22,
      metalness: 0.2,
      envMapIntensity: 1.3,
    });
  }

  private disposeHierarchy(obj: THREE.Object3D): void {
    obj.traverse((node: any) => {
      if (node.geometry && !this.levelGeometries.includes(node.geometry)) {
        node.geometry.dispose();
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((m: THREE.Material) => this.disposeMaterial(m));
        } else {
          this.disposeMaterial(node.material);
        }
      }
    });
  }

  private disposeMaterial(mat: THREE.Material): void {
    // Preserve persistent shared tile and curb materials, and level-shared materials disposed in buildLevel
    if (mat === this.blueTileMat || mat === this.yellowCurbMat || this.levelMaterials.includes(mat)) {
      return;
    }
    const standardMat = mat as THREE.MeshStandardMaterial;
    if (standardMat.map && standardMat.map !== this.blueTileTexture) {
      standardMat.map.dispose();
    }
    mat.dispose();
  }

  public buildLevel(level: LevelDef): void {
    // Clear and dispose previous level children to prevent VRAM memory leaks
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      this.disposeHierarchy(child);
    }
    for (const m of this.levelMaterials) {
      m.dispose();
    }
    this.levelMaterials = [];
    for (const g of this.levelGeometries) {
      g.dispose();
    }
    this.levelGeometries = [];
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

    const isNight = level.id === 4 || (level.theme && level.theme.sunIntensity < 2.0);

    if (isNight) {
      this.blueTileMat.emissive = new THREE.Color(0x0369a1);
      this.blueTileMat.emissiveIntensity = 0.35;
      this.yellowCurbMat.emissive = new THREE.Color(0xfacc15);
      this.yellowCurbMat.emissiveIntensity = 0.3;
    } else {
      this.blueTileMat.emissive = new THREE.Color(0x000000);
      this.blueTileMat.emissiveIntensity = 0.0;
      this.yellowCurbMat.emissive = new THREE.Color(0x000000);
      this.yellowCurbMat.emissiveIntensity = 0.0;
    }

    // Materials for obstacles
    const redArmMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Bright red rotor arms
      roughness: 0.2,
      metalness: 0.15,
    });
    const darkPivotMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.25,
      metalness: 0.8,
    });
    const chromeCapMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.15,
      metalness: 0.95,
      envMapIntensity: 2.0,
    });
    const darkCollarMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.5,
    });
    const chevronMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createChevrons(),
      roughness: 0.25,
      metalness: 0.1,
      emissive: isNight ? 0xf59e0b : 0xd97706,
      emissiveIntensity: isNight ? 0.75 : 0.35,
      side: THREE.DoubleSide,
    });
    const bouncerTargetMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.createTargetBouncer(),
      roughness: 0.25,
      metalness: 0.1,
      emissive: 0xf43f5e,
      emissiveIntensity: isNight ? 0.45 : 0.2,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 1.0,
      roughness: 0.08,
      emissive: isNight ? 0xfacc15 : 0xb45309,
      emissiveIntensity: isNight ? 0.85 : 0.35,
    });

    const theme = level.theme;
    const wallSideMat = new THREE.MeshStandardMaterial({
      color: theme?.wallSideColor ?? 0xe2e8f0,
      roughness: isNight ? 0.35 : 0.3,
      metalness: isNight ? 0.4 : 0.15,
      envMapIntensity: 1.2,
    });
    const wallTopMat = new THREE.MeshStandardMaterial({
      color: theme?.wallTopColor ?? 0xffffff,
      roughness: 0.22,
      metalness: isNight ? 0.3 : 0.1,
      envMapIntensity: 1.4,
    });
    const wallStripeMat = new THREE.MeshStandardMaterial({
      color: theme?.wallStripeColor ?? 0x38bdf8,
      emissive: new THREE.Color(theme?.wallStripeEmissive ?? 0x000000),
      emissiveIntensity: theme?.wallStripeEmissiveIntensity ?? 0.0,
      roughness: 0.15,
      metalness: 0.3,
      envMapIntensity: 1.6,
    });
    this.levelMaterials.push(wallSideMat, wallTopMat, wallStripeMat);

    const baseH = 0.16;
    const stripeShelfH = 0.02;
    const topCapH = 0.035;
    // Total visual curb height = 0.16 + 0.02 + 0.035 = 0.215m (43% of 0.50m collider)

    // Reusable shared geometries for low curb barriers
    const wallBaseGeo = new THREE.BoxGeometry(cellSize * 0.98, baseH, cellSize * 0.98);
    const wallStripeGeo = new THREE.BoxGeometry(cellSize * 0.90, stripeShelfH, cellSize * 0.90);
    const wallCapGeo = new THREE.BoxGeometry(cellSize * 0.78, topCapH, cellSize * 0.78);
    this.levelGeometries.push(wallBaseGeo, wallStripeGeo, wallCapGeo);

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
          // Low curb barrier (43% visual height), slightly beveled top cap, bright top stripe
          const wallGroup = new THREE.Group();
          wallGroup.position.set(cx, 0, cz);

          // Lower curb body (sides)
          const wallBase = new THREE.Mesh(wallBaseGeo, wallSideMat);
          wallBase.position.y = baseH / 2;
          wallBase.castShadow = true;
          wallBase.receiveShadow = true;
          wallGroup.add(wallBase);

          // Beveled perimeter shelf / stripe (bright top stripe / neon edge in L4)
          const wallStripe = new THREE.Mesh(wallStripeGeo, wallStripeMat);
          wallStripe.position.y = baseH + stripeShelfH / 2;
          wallStripe.castShadow = true;
          wallStripe.receiveShadow = true;
          wallGroup.add(wallStripe);

          // Top cap face (lighter than sides for top-down maze readability)
          const wallCap = new THREE.Mesh(wallCapGeo, wallTopMat);
          wallCap.position.y = baseH + stripeShelfH + topCapH / 2;
          wallCap.castShadow = true;
          wallCap.receiveShadow = true;
          wallGroup.add(wallCap);

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
          // Chunky Turnstile Rotor: Wide yellow floor rim + dark collar + slate hub + chrome cap + thick red bumper arms
          const spinGroup = new THREE.Group();
          spinGroup.position.set(cx, 0, cz);

          // Wide yellow floor hazard collar
          const baseCylGeo = new THREE.CylinderGeometry(cellSize * 0.48, cellSize * 0.52, 0.08, 32);
          const baseCyl = new THREE.Mesh(baseCylGeo, this.yellowCurbMat);
          baseCyl.position.y = 0.04;
          baseCyl.castShadow = true;
          spinGroup.add(baseCyl);

          // Recessed dark charcoal collar
          const collarGeo = new THREE.CylinderGeometry(cellSize * 0.34, cellSize * 0.36, 0.09, 32);
          const collar = new THREE.Mesh(collarGeo, darkCollarMat);
          collar.position.y = 0.045;
          collar.castShadow = true;
          spinGroup.add(collar);

          // Slate center pivot cylinder hub
          const pivotGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.52, 32);
          const pivot = new THREE.Mesh(pivotGeo, darkPivotMat);
          pivot.position.y = 0.26;
          pivot.castShadow = true;
          spinGroup.add(pivot);

          // Chrome top nut/pivot pin
          const topCapGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24);
          const topCap = new THREE.Mesh(topCapGeo, chromeCapMat);
          topCap.position.y = 0.53;
          topCap.castShadow = true;
          spinGroup.add(topCap);

          // Rotating dual arm group
          const rotorGroup = new THREE.Group();
          rotorGroup.position.y = 0.26;

          const armRadius = 0.14;
          const armLength = cellSize * 1.5;
          const armGeo = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 24);
          armGeo.rotateZ(Math.PI / 2); // Lie horizontal across X axis
          const rotorArm = new THREE.Mesh(armGeo, redArmMat);
          rotorArm.castShadow = true;
          rotorGroup.add(rotorArm);

          // Thick rounded hemispherical end caps
          const capGeo = new THREE.SphereGeometry(armRadius, 24, 24);
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
          // Circular Spring Target Bouncer: Yellow spring base + Charcoal platform + Bullseye target pad
          const bncGroup = new THREE.Group();
          bncGroup.position.set(cx, 0, cz);

          // Yellow spring pedestal base
          const springGeo = new THREE.CylinderGeometry(cellSize * 0.32, cellSize * 0.38, 0.12, 32);
          const spring = new THREE.Mesh(springGeo, this.yellowCurbMat);
          spring.position.y = 0.06;
          spring.castShadow = true;
          bncGroup.add(spring);

          // Dark rim platform disc
          const discGeo = new THREE.CylinderGeometry(cellSize * 0.45, cellSize * 0.45, 0.08, 32);
          const discMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.6 });
          const disc = new THREE.Mesh(discGeo, discMat);
          disc.position.y = 0.12;
          disc.castShadow = true;
          bncGroup.add(disc);

          // Bullseye concentric target disc with planar circular UVs
          const targetPadGeo = new THREE.CircleGeometry(cellSize * 0.42, 32);
          const targetPad = new THREE.Mesh(targetPadGeo, bouncerTargetMat);
          targetPad.rotation.x = -Math.PI / 2;
          targetPad.position.y = 0.165;
          targetPad.castShadow = true;
          bncGroup.add(targetPad);

          // Outer yellow accent bevel ring
          const ringGeo = new THREE.RingGeometry(cellSize * 0.41, cellSize * 0.45, 32);
          const ringMesh = new THREE.Mesh(ringGeo, this.yellowCurbMat);
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.y = 0.181;
          bncGroup.add(ringMesh);

          this.group.add(bncGroup);
          this.bouncerGroups.push(bncGroup);
        } else if (cell === 'R' || cell === 'B') {
          // Speed Boost Ramp: Incline wedge with white chevron arrows (>>) and side curbs
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

          // Chevrons overlay on inclined plane (facing up and backwards along slope)
          const chevPlaneGeo = new THREE.PlaneGeometry(rampWidth * 0.88, rampLength * 0.95);
          const chevMesh = new THREE.Mesh(chevPlaneGeo, chevronMat);
          chevMesh.rotation.x = -Math.PI / 2 + Math.atan2(rampHeight, rampLength);
          chevMesh.position.set(0, rampHeight / 2 + 0.05, 0);
          rampGroup.add(chevMesh);

          // Yellow side guide rails along flanks
          const guideRailGeo = new THREE.BoxGeometry(0.1, 0.15, rampLength);
          const leftRail = new THREE.Mesh(guideRailGeo, this.yellowCurbMat);
          leftRail.position.set(-rampWidth / 2 + 0.05, rampHeight / 2 + 0.04, 0);
          leftRail.rotation.x = -Math.atan2(rampHeight, rampLength);
          leftRail.castShadow = true;
          rampGroup.add(leftRail);

          const rightRail = new THREE.Mesh(guideRailGeo, this.yellowCurbMat);
          rightRail.position.set(rampWidth / 2 - 0.05, rampHeight / 2 + 0.04, 0);
          rightRail.rotation.x = -Math.atan2(rampHeight, rampLength);
          rightRail.castShadow = true;
          rampGroup.add(rightRail);

          this.group.add(rampGroup);
        } else if (cell === 'C' || cell === 'O') {
          // Floating Golden Ring Checkpoint Gate
          const ringGroup = new THREE.Group();
          ringGroup.position.set(cx, 0.65, cz);

          const ringMesh = new THREE.Mesh(
            new THREE.TorusGeometry(cellSize * 0.38, 0.075, 24, 48),
            ringMat
          );
          ringMesh.castShadow = true;
          ringGroup.add(ringMesh);

          // Inner golden glow aura disc
          const auraGeo = new THREE.RingGeometry(cellSize * 0.08, cellSize * 0.32, 32);
          const auraMat = new THREE.MeshBasicMaterial({
            color: 0xfef08a,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          });
          const auraMesh = new THREE.Mesh(auraGeo, auraMat);
          ringGroup.add(auraMesh);

          this.group.add(ringGroup);
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
    const curbHeight = 0.22;
    const curbThickness = 0.22;
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

    // 2. Animate floating golden rings (rotation + gentle vertical bobbing)
    for (const ring of this.goldenRings) {
      ring.rotation.y += dt * 1.5;
      ring.position.y = 0.65 + Math.sin(ring.rotation.y * 1.5) * 0.06;
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
