import * as THREE from 'three';
import type { LevelDef } from '../levels/LevelData.js';
import { LEVEL_JUMP_EDGES } from '../levels/LevelData.js';
import { MAX_BOARD_TILT_RAD, type SpinnerObject, type DifficultyMode } from '../physics/PhysicsWorld.js';
import { TextureGenerator } from './TextureGenerator.js';

function isJumpGapEdge(levelId: number, c: number, r: number, edge: 'north' | 'south' | 'east' | 'west'): boolean {
  const jumps = LEVEL_JUMP_EDGES[levelId];
  if (!jumps) return false;
  for (const j of jumps) {
    if (j.from.x === c && j.from.y === r) {
      if (j.to.y < j.from.y && edge === 'north') return true;
      if (j.to.y > j.from.y && edge === 'south') return true;
      if (j.to.x < j.from.x && edge === 'west') return true;
      if (j.to.x > j.from.x && edge === 'east') return true;
    }
    if (j.to.x === c && j.to.y === r) {
      if (j.from.y < j.to.y && edge === 'north') return true;
      if (j.from.y > j.to.y && edge === 'south') return true;
      if (j.from.x < j.to.x && edge === 'west') return true;
      if (j.from.x > j.to.x && edge === 'east') return true;
    }
  }
  return false;
}

export interface CheckpointVisual {
  index: number;
  group: THREE.Group;
  ringGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  auraMesh: THREE.Mesh;
  emitterLensMat: THREE.MeshStandardMaterial;
  fadingMaterials: THREE.Material[];
  isCollected: boolean;
  fadeProgress: number;
  baseY: number;
}

export class Board {
  public group: THREE.Group;
  private spinnerMeshes: Array<{ group: THREE.Group; index: number }> = [];
  private goldenRings: Array<{ group: THREE.Group; mesh: THREE.Mesh }> = [];
  private checkpoints: CheckpointVisual[] = [];
  private animTime: number = 0;
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

  public buildLevel(level: LevelDef, difficulty: DifficultyMode = 'medium'): void {
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
    this.checkpoints = [];
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

    const isNight = level.id === 6 || (level.theme && level.theme.sunIntensity < 2.0);

    // Track Tile InstancedMesh for high performance
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

    // 3D Structural Underbody Side-Skirts:
    // Extends 0.45m underneath each tile (total platform depth 0.65m)
    // so the course looks like a solid elevated 3D skyway rather than flat paper.
    const skirtGeo = new THREE.BoxGeometry(cellSize * 0.98, 0.45, cellSize * 0.98);
    this.levelGeometries.push(skirtGeo);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x090d16 : 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
    });
    this.levelMaterials.push(skirtMat);
    const skirtInstanced = new THREE.InstancedMesh(skirtGeo, skirtMat, floorTileCount);
    skirtInstanced.receiveShadow = true;
    skirtInstanced.castShadow = true;

    // High-Contrast Hazard Edge Trim & Glowing Neon Strip:
    // Rendered along exposed borders facing ' ' abyss without a # wall.
    // In Blackout Sanctum / night mode, glows with vibrant cyan neon (0x00f5ff).
    const edgeTrimMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x00f5ff : 0xfacc15,
      emissive: new THREE.Color(isNight ? 0x00f5ff : 0xd97706),
      emissiveIntensity: isNight ? 1.6 : 0.45,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.levelMaterials.push(edgeTrimMat);

    const dummy = new THREE.Object3D();
    let tileIdx = 0;

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

    const trimHeight = 0.035;
    const trimThickness = 0.12;
    const trimLength = cellSize;
    const hTrimGeo = new THREE.BoxGeometry(trimLength * 0.98, trimHeight, trimThickness * 0.98);
    const vTrimGeo = new THREE.BoxGeometry(trimThickness * 0.98, trimHeight, trimLength * 0.98);
    this.levelGeometries.push(hTrimGeo, vTrimGeo);

    // Easy Mode Safety Guardrails (0.28m translucent acrylic panels with glowing caps)
    const railH = 0.28;
    const capH = 0.04;
    const railThick = 0.05;
    const capThick = 0.07;
    const railLength = cellSize * 0.98;

    let panelGeoH: THREE.BufferGeometry | null = null;
    let capGeoH: THREE.BufferGeometry | null = null;
    let panelGeoV: THREE.BufferGeometry | null = null;
    let capGeoV: THREE.BufferGeometry | null = null;
    let acrylicMat: THREE.MeshStandardMaterial | null = null;
    let warningCapMat: THREE.MeshStandardMaterial | null = null;

    if (difficulty === 'easy') {
      panelGeoH = new THREE.BoxGeometry(railLength, railH, railThick);
      capGeoH = new THREE.BoxGeometry(railLength, capH, capThick);
      panelGeoV = new THREE.BoxGeometry(railThick, railH, railLength);
      capGeoV = new THREE.BoxGeometry(capThick, capH, railLength);
      this.levelGeometries.push(panelGeoH, capGeoH, panelGeoV, capGeoV);

      acrylicMat = new THREE.MeshStandardMaterial({
        color: isNight ? 0x00f5ff : 0x38bdf8,
        transparent: true,
        opacity: 0.55,
        roughness: 0.1,
        metalness: 0.1,
        envMapIntensity: 1.5,
      });
      warningCapMat = new THREE.MeshStandardMaterial({
        color: theme?.wallStripeColor ?? (isNight ? 0x00f5ff : 0xfacc15),
        emissive: new THREE.Color(theme?.wallStripeColor ?? (isNight ? 0x00f5ff : 0xfacc15)),
        emissiveIntensity: isNight ? 1.5 : 0.85,
        roughness: 0.2,
        metalness: 0.3,
      });
      this.levelMaterials.push(acrylicMat, warningCapMat);
    }

    const checkpointCells: Array<{ c: number; r: number; cx: number; cz: number }> = [];

    // Populate Level Grid Tiles & Obstacles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell === ' ') continue;

        const cx = originX + c * cellSize + cellSize / 2;
        const cz = originZ + r * cellSize + cellSize / 2;

        // 1. Place blue ceramic road deck tile (top surface at y = 0)
        dummy.position.set(cx, -0.1, cz);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tileInstanced.setMatrixAt(tileIdx, dummy.matrix);

        // 2. Place dark structural underbody side-skirt (0.45m thickness below deck)
        dummy.position.set(cx, -0.425, cz);
        dummy.updateMatrix();
        skirtInstanced.setMatrixAt(tileIdx++, dummy.matrix);

        // 3. Hazard Edge Trim / Warning Bevel:
        // Rendered whenever a walkable tile borders an open ' ' abyss tile without a # wall
        if (cell !== '#') {
          this.addEdgeTrimsIfNeeded(grid, r, c, rows, cols, cx, cz, cellSize, edgeTrimMat, hTrimGeo, vTrimGeo);
          if (difficulty === 'easy' && acrylicMat && warningCapMat && panelGeoH && capGeoH && panelGeoV && capGeoV) {
            this.addSafetyGuardrailsIfNeeded(
              level.id,
              grid,
              r,
              c,
              rows,
              cols,
              cx,
              cz,
              cellSize,
              acrylicMat,
              warningCapMat,
              panelGeoH,
              capGeoH,
              panelGeoV,
              capGeoV
            );
          }
        }

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
          checkpointCells.push({ c, r, cx, cz });
        } else if (cell === 'G') {
          // High-Tech Championship Podium & Finish Archway
          const archGroup = new THREE.Group();
          archGroup.position.set(cx, 0, cz);

          const archWidth = cellSize * 1.5;
          const archHeight = 2.8;

          // 1. Multi-tiered Championship Podium Base
          // Tier 1 (Titanium Dais)
          const tier1Geo = new THREE.CylinderGeometry(cellSize * 0.52, cellSize * 0.56, 0.08, 32);
          const tier1Mat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            metalness: 0.85,
            roughness: 0.2,
          });
          const tier1 = new THREE.Mesh(tier1Geo, tier1Mat);
          tier1.position.y = 0.04;
          tier1.castShadow = true;
          tier1.receiveShadow = true;
          archGroup.add(tier1);

          // Tier 2 (Polished Chrome Step)
          const tier2Geo = new THREE.CylinderGeometry(cellSize * 0.48, cellSize * 0.48, 0.04, 32);
          const tier2Mat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            metalness: 0.9,
            roughness: 0.15,
            envMapIntensity: 1.8,
          });
          const tier2 = new THREE.Mesh(tier2Geo, tier2Mat);
          tier2.position.y = 0.08;
          tier2.castShadow = true;
          tier2.receiveShadow = true;
          archGroup.add(tier2);

          // Tier 3: Checkered Championship Landing Pad Deck
          const goalPadTex = TextureGenerator.createChampionshipGoalPad();
          const goalPadMat = new THREE.MeshStandardMaterial({
            map: goalPadTex,
            roughness: 0.2,
            metalness: 0.35,
            emissive: isNight ? 0x10b981 : 0x059669,
            emissiveIntensity: isNight ? 0.9 : 0.5,
            side: THREE.DoubleSide,
          });
          this.levelMaterials.push(goalPadMat);
          const goalPadGeo = new THREE.CircleGeometry(cellSize * 0.46, 32);
          const goalPad = new THREE.Mesh(goalPadGeo, goalPadMat);
          goalPad.rotation.x = -Math.PI / 2;
          goalPad.position.y = 0.102;
          goalPad.receiveShadow = true;
          archGroup.add(goalPad);

          // Outer glowing emerald neon rim
          const emeraldRimGeo = new THREE.RingGeometry(cellSize * 0.45, cellSize * 0.48, 32);
          const emeraldRimMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            side: THREE.DoubleSide,
          });
          const emeraldRim = new THREE.Mesh(emeraldRimGeo, emeraldRimMat);
          emeraldRim.rotation.x = -Math.PI / 2;
          emeraldRim.position.y = 0.104;
          archGroup.add(emeraldRim);

          // Soft vertical beacon light column rising into the sky
          const beamGeo = new THREE.CylinderGeometry(cellSize * 0.40, cellSize * 0.40, archHeight * 1.5, 32, 1, true);
          const beamMat = new THREE.MeshBasicMaterial({
            color: 0x34d399,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const beam = new THREE.Mesh(beamGeo, beamMat);
          beam.position.y = (archHeight * 1.5) / 2;
          archGroup.add(beam);

          // 2. Archway Pillars
          const pillarGeo = new THREE.BoxGeometry(0.24, archHeight, 0.24);
          const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.25 });

          const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
          leftPillar.position.set(-archWidth / 2, archHeight / 2, 0);
          leftPillar.castShadow = true;
          archGroup.add(leftPillar);

          const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
          rightPillar.position.set(archWidth / 2, archHeight / 2, 0);
          rightPillar.castShadow = true;
          archGroup.add(rightPillar);

          // Stadium beacon floodlights on pillars
          const floodlightGeo = new THREE.BoxGeometry(0.32, 0.2, 0.32);
          const floodlightMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x10b981,
            emissiveIntensity: isNight ? 1.6 : 1.2,
            roughness: 0.1,
          });
          [-archWidth / 2, archWidth / 2].forEach((xPos) => {
            const floodlight = new THREE.Mesh(floodlightGeo, floodlightMat);
            floodlight.position.set(xPos, archHeight, 0);
            archGroup.add(floodlight);
          });

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

    skirtInstanced.instanceMatrix.needsUpdate = true;
    this.group.add(skirtInstanced);

    // Sort checkpoints to match Rapier PhysicsWorld indexing exactly
    if (level.checkpointOrder && level.checkpointOrder.length === checkpointCells.length) {
      checkpointCells.sort((a, b) => {
        const idxA = level.checkpointOrder!.findIndex((p) => p.x === a.c && p.y === a.r);
        const idxB = level.checkpointOrder!.findIndex((p) => p.x === b.c && p.y === b.r);
        return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
      });
    } else {
      checkpointCells.sort((a, b) => b.r - a.r || a.c - b.c);
    }

    // Build sleek, low-profile futuristic holographic checkpoints
    for (let i = 0; i < checkpointCells.length; i++) {
      const { cx, cz } = checkpointCells[i];
      const gateGroup = new THREE.Group();
      gateGroup.position.set(cx, 0, cz);

      const fadingMaterials: THREE.Material[] = [];

      // 1. Low-profile floor emitter pod dais (0.05m high)
      const pedestalGeo = new THREE.CylinderGeometry(cellSize * 0.40, cellSize * 0.44, 0.05, 32);
      this.levelGeometries.push(pedestalGeo);
      const pedestalMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.25,
        metalness: 0.85,
        transparent: true,
        opacity: 1.0,
      });
      fadingMaterials.push(pedestalMat);
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = 0.025;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      gateGroup.add(pedestal);

      // 2. Holographic emitter floor glyph with glowing circuits
      const glyphTex = TextureGenerator.createCheckpointEnergyGlyph();
      const glyphGeo = new THREE.CircleGeometry(cellSize * 0.35, 32);
      this.levelGeometries.push(glyphGeo);
      const glyphMat = new THREE.MeshStandardMaterial({
        map: glyphTex,
        roughness: 0.2,
        metalness: 0.4,
        emissive: isNight ? 0x38bdf8 : 0x0ea5e9,
        emissiveIntensity: isNight ? 1.6 : 1.0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      });
      (glyphMat as any)._initialEmissive = glyphMat.emissiveIntensity;
      fadingMaterials.push(glyphMat);
      const glyphMesh = new THREE.Mesh(glyphGeo, glyphMat);
      glyphMesh.rotation.x = -Math.PI / 2;
      glyphMesh.position.y = 0.052;
      gateGroup.add(glyphMesh);

      // Outer illuminated neon rim
      const rimGeo = new THREE.RingGeometry(cellSize * 0.35, cellSize * 0.39, 32);
      this.levelGeometries.push(rimGeo);
      const rimMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      fadingMaterials.push(rimMat);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.rotation.x = -Math.PI / 2;
      rimMesh.position.y = 0.053;
      gateGroup.add(rimMesh);

      // 3. Low-profile flanking micro-emitters (height only 0.12m - clear sightlines)
      const pylonSpacing = cellSize * 0.42;
      const miniNodeGeo = new THREE.CylinderGeometry(0.04, 0.065, 0.10, 16);
      const nodeLensGeo = new THREE.SphereGeometry(0.03, 12, 12);
      const laserBeamGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.30, 8);
      this.levelGeometries.push(miniNodeGeo, nodeLensGeo, laserBeamGeo);

      const nodeMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.2,
        transparent: true,
        opacity: 1.0,
      });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.2,
        roughness: 0.1,
        transparent: true,
        opacity: 1.0,
      });
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
      });
      fadingMaterials.push(nodeMat, lensMat, beamMat);

      [-pylonSpacing, pylonSpacing].forEach((px) => {
        const node = new THREE.Mesh(miniNodeGeo, nodeMat);
        node.position.set(px, 0.05, 0);
        node.castShadow = true;
        gateGroup.add(node);

        const lens = new THREE.Mesh(nodeLensGeo, lensMat);
        lens.position.set(px, 0.11, 0);
        gateGroup.add(lens);

        const beam = new THREE.Mesh(laserBeamGeo, beamMat);
        beam.position.set(px, 0.26, 0);
        gateGroup.add(beam);
      });

      // 4. Floating Holographic Energy Ring hovering at y = 0.42m
      const ringSubGroup = new THREE.Group();
      const baseY = 0.42;
      ringSubGroup.position.set(0, baseY, 0);

      const ringGeo = new THREE.TorusGeometry(cellSize * 0.32, 0.045, 16, 48);
      this.levelGeometries.push(ringGeo);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: isNight ? 1.8 : 1.2,
        roughness: 0.15,
        metalness: 0.85,
        transparent: true,
        opacity: 0.95,
      });
      fadingMaterials.push(ringMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.castShadow = true;
      ringSubGroup.add(ringMesh);

      // Inner glowing energy shield disc
      const auraGeo = new THREE.RingGeometry(cellSize * 0.06, cellSize * 0.27, 32);
      this.levelGeometries.push(auraGeo);
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      fadingMaterials.push(auraMat);
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      ringSubGroup.add(auraMesh);

      // Gyroscopic micro-orbital ring
      const orbitGeo = new THREE.TorusGeometry(cellSize * 0.35, 0.012, 8, 36);
      this.levelGeometries.push(orbitGeo);
      const orbitMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      });
      fadingMaterials.push(orbitMat);
      const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
      orbitMesh.rotation.x = 0.4;
      ringSubGroup.add(orbitMesh);

      gateGroup.add(ringSubGroup);
      this.group.add(gateGroup);

      // Record initial opacities for fade dissolve
      fadingMaterials.forEach((m) => {
        (m as any)._initialOpacity = (m as any).opacity ?? 1.0;
      });
      this.levelMaterials.push(...fadingMaterials);

      this.checkpoints.push({
        index: i,
        group: gateGroup,
        ringGroup: ringSubGroup,
        ringMesh,
        auraMesh,
        emitterLensMat: glyphMat,
        fadingMaterials,
        isCollected: false,
        fadeProgress: 0,
        baseY,
      });
      this.goldenRings.push({ group: ringSubGroup, mesh: ringMesh });
    }
  }

  /**
   * Whenever a walkable tile borders an open ' ' abyss tile without a # wall,
   * renders a distinct high-contrast edge trim / low lip warning bevel (or glowing cyan neon
   * strip in Blackout Sanctum) so the player has clear 3D depth perception of cliff drop-offs.
   */
  private addEdgeTrimsIfNeeded(
    grid: string[],
    r: number,
    c: number,
    rows: number,
    cols: number,
    cx: number,
    cz: number,
    cellSize: number,
    trimMat: THREE.Material,
    hTrimGeo: THREE.BufferGeometry,
    vTrimGeo: THREE.BufferGeometry
  ): void {
    const trimHeight = 0.035;
    const trimThickness = 0.12;

    // Check North (r - 1)
    if (r === 0 || grid[r - 1][c] === ' ') {
      this.spawnTrimSegment(cx, cz - cellSize / 2 + trimThickness / 2, trimHeight, trimMat, hTrimGeo);
    }
    // Check South (r + 1)
    if (r === rows - 1 || grid[r + 1][c] === ' ') {
      this.spawnTrimSegment(cx, cz + cellSize / 2 - trimThickness / 2, trimHeight, trimMat, hTrimGeo);
    }
    // Check West (c - 1)
    if (c === 0 || grid[r][c - 1] === ' ') {
      this.spawnTrimSegment(cx - cellSize / 2 + trimThickness / 2, cz, trimHeight, trimMat, vTrimGeo);
    }
    // Check East (c + 1)
    if (c === cols - 1 || grid[r][c + 1] === ' ') {
      this.spawnTrimSegment(cx + cellSize / 2 - trimThickness / 2, cz, trimHeight, trimMat, vTrimGeo);
    }
  }

  private spawnTrimSegment(x: number, z: number, h: number, mat: THREE.Material, geo: THREE.BufferGeometry): void {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /**
   * Renders elevated translucent acrylic safety guardrails (0.28m) with glowing warning caps
   * along all exposed abyss borders in Easy Mode, confirming safety bumpers are active.
   */
  private addSafetyGuardrailsIfNeeded(
    levelId: number,
    grid: string[],
    r: number,
    c: number,
    rows: number,
    cols: number,
    cx: number,
    cz: number,
    cellSize: number,
    acrylicMat: THREE.Material,
    capMat: THREE.Material,
    panelGeoH: THREE.BufferGeometry,
    capGeoH: THREE.BufferGeometry,
    panelGeoV: THREE.BufferGeometry,
    capGeoV: THREE.BufferGeometry
  ): void {
    const railH = 0.28;
    const capH = 0.04;
    const trimThickness = 0.12;

    const spawnRail = (gx: number, gz: number, isH: boolean) => {
      const panel = new THREE.Mesh(isH ? panelGeoH : panelGeoV, acrylicMat);
      panel.position.set(gx, railH / 2, gz);
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.group.add(panel);

      const cap = new THREE.Mesh(isH ? capGeoH : capGeoV, capMat);
      cap.position.set(gx, railH + capH / 2, gz);
      cap.castShadow = true;
      cap.receiveShadow = true;
      this.group.add(cap);
    };

    // North
    if ((r === 0 || !grid[r - 1] || grid[r - 1][c] === ' ') && !isJumpGapEdge(levelId, c, r, 'north')) {
      spawnRail(cx, cz - cellSize / 2 + trimThickness / 2, true);
    }
    // South
    if ((r === rows - 1 || !grid[r + 1] || grid[r + 1][c] === ' ') && !isJumpGapEdge(levelId, c, r, 'south')) {
      spawnRail(cx, cz + cellSize / 2 - trimThickness / 2, true);
    }
    // West
    if ((c === 0 || grid[r][c - 1] === ' ') && !isJumpGapEdge(levelId, c, r, 'west')) {
      spawnRail(cx - cellSize / 2 + trimThickness / 2, cz, false);
    }
    // East
    if ((c === cols - 1 || grid[r][c + 1] === ' ') && !isJumpGapEdge(levelId, c, r, 'east')) {
      spawnRail(cx + cellSize / 2 - trimThickness / 2, cz, false);
    }
  }

  /**
   * Triggers the collection and fade-away dissolve animation for the checkpoint at idx.
   */
  public collectCheckpoint(idx: number): void {
    if (idx >= 0 && idx < this.checkpoints.length) {
      const cp = this.checkpoints[idx];
      if (!cp.isCollected) {
        cp.isCollected = true;
      }
    }
  }

  /**
   * Resets all checkpoint visuals back to their initial uncollected state.
   */
  public resetCheckpoints(): void {
    for (const cp of this.checkpoints) {
      cp.isCollected = false;
      cp.fadeProgress = 0;
      cp.group.visible = true;
      cp.ringGroup.position.y = cp.baseY;
      cp.ringGroup.scale.set(1, 1, 1);
      for (const m of cp.fadingMaterials) {
        (m as any).opacity = (m as any)._initialOpacity ?? 1.0;
      }
      if (cp.emitterLensMat) {
        cp.emitterLensMat.emissiveIntensity = (cp.emitterLensMat as any)._initialEmissive ?? 1.0;
      }
    }
  }

  /**
   * Synchronizes visual obstacles (spinners, checkpoints) with physics & time.
   */
  public update(dt: number, spinners: SpinnerObject[]): void {
    // 1. Sync kinematic spinner rotors
    for (const spinMesh of this.spinnerMeshes) {
      if (spinMesh.index < spinners.length) {
        const physSpin = spinners[spinMesh.index];
        spinMesh.group.rotation.y = physSpin.angle;
      }
    }

    // 2. Animate Checkpoint Holographic Rings (rotation, hover bobbing, and collection fade-away)
    this.animTime += dt;
    for (const cp of this.checkpoints) {
      if (!cp.group.visible) continue;

      if (cp.isCollected) {
        // Smooth dissolve and fade-away animation on collection
        cp.fadeProgress = Math.min(1.0, cp.fadeProgress + dt * 2.2);
        const inv = 1.0 - cp.fadeProgress;

        // Shockwave expansion & upward drift
        const scale = 1.0 + cp.fadeProgress * 0.75;
        cp.ringGroup.scale.set(scale, scale, scale);
        cp.ringGroup.position.y += dt * 1.6;
        cp.ringMesh.rotation.y += dt * 4.5;

        // Smoothly fade out opacity of all checkpoint materials
        for (const m of cp.fadingMaterials) {
          const initOp = (m as any)._initialOpacity ?? 1.0;
          (m as any).opacity = initOp * inv;
        }

        // Dim emitter lens glow
        if (cp.emitterLensMat) {
          const initEmissive = (cp.emitterLensMat as any)._initialEmissive ?? 1.0;
          cp.emitterLensMat.emissiveIntensity = initEmissive * inv;
        }

        if (cp.fadeProgress >= 1.0) {
          cp.group.visible = false;
        }
      } else {
        // Idle gentle hover bobbing and rotation
        cp.ringMesh.rotation.y += dt * 1.8;
        cp.ringGroup.position.y = cp.baseY + Math.sin(this.animTime * 2.5 + cp.index) * 0.04;
      }
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
