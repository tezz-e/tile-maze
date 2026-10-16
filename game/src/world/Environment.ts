import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';
import type { LevelTheme } from '../levels/LevelData.js';

/**
 * Skyway Environment & Atmosphere
 * Creates the bright sunny sky island, cloud sea bed, pastel pillar monoliths,
 * and warm directional lighting with contact shadows.
 */
export class SkyEnvironment {
  public group: THREE.Group;
  public dirLight!: THREE.DirectionalLight;
  public hemiLight!: THREE.HemisphereLight;
  public rimLight!: THREE.DirectionalLight;
  public cloudMat!: THREE.MeshStandardMaterial;
  public clouds: THREE.InstancedMesh[] = [];
  public cloudClusters: Array<{ mesh: THREE.InstancedMesh; baseY: number; phase: number }> = [];
  public cloudInstMesh!: THREE.InstancedMesh;
  public readonly cloudCount = 380;
  private currentBoardWidth = 14;
  private currentBoardDepth = 30;

  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private currentSkyTexture: THREE.Texture | null = null;
  private currentEnvTexture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.initSkyAndLighting(scene, renderer);
    this.createCloudSea();
    this.createPastelPillars();
  }

  private initSkyAndLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    // 1. Equirectangular Sky & Reflections
    const skyTexture = TextureGenerator.createSkyEquirectangular();
    this.currentSkyTexture = skyTexture;
    scene.background = skyTexture;

    // Generate PMREM for crisp chrome marble and track reflections
    try {
      if (renderer && (renderer as any).capabilities) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const envTexture = pmrem.fromEquirectangular(skyTexture).texture;
        this.currentEnvTexture = envTexture;
        scene.environment = envTexture;
        pmrem.dispose();
      }
    } catch {
      // Headless / mock environment fallback
    }

    // Atmospheric Fog - soft cyan haze fading gently at distance, leaving near track razor sharp
    scene.fog = new THREE.Fog(0xdbeafe, 40, 160);

    // 2. Warm Sun Directional Light
    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 2.4);
    this.dirLight.position.set(16, 28, 16);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 90;
    this.dirLight.shadow.bias = -0.0004;

    const d = 26;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    scene.add(this.dirLight);
    scene.add(this.dirLight.target);

    // 3. Hemisphere Ambient (warm sunlit sky + warm ground bounce)
    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0xfef08a, 1.2);
    scene.add(this.hemiLight);

    // Gentle sun flare / rim light from opposite angle to catch marble & cloud rims
    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.75);
    this.rimLight.position.set(-16, 14, -16);
    scene.add(this.rimLight);
  }

  /**
   * Spawns a vast, dense sea of fluffy white/cream 3D cloud clusters underneath and billowing around the track.
   */
  private createCloudSea(): void {
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.02,
      flatShading: true,
    });

    // Cloud puff sphere geometry
    const puffGeo = new THREE.IcosahedronGeometry(1, 2);
    this.cloudInstMesh = new THREE.InstancedMesh(puffGeo, this.cloudMat, this.cloudCount);
    this.cloudInstMesh.receiveShadow = true;

    this.group.add(this.cloudInstMesh);
    this.clouds.push(this.cloudInstMesh);
    this.cloudClusters.push({ mesh: this.cloudInstMesh, baseY: -6.5, phase: Math.random() * 10 });

    this.adjustCloudClearance(this.currentBoardWidth, this.currentBoardDepth);
  }

  /**
   * Dynamically repositions cloud clusters to guarantee clearance outside the track boundaries:
   * Flank cloud centers are pushed outward (|x| > boardWidth / 2 + 3.0) and kept below track curb (y <= -1.6).
   */
  public adjustCloudClearance(boardWidth: number, boardDepth: number = 40): void {
    this.currentBoardWidth = boardWidth;
    this.currentBoardDepth = boardDepth;
    if (!this.cloudInstMesh) return;

    const dummy = new THREE.Object3D();
    const flankDistX = boardWidth / 2 + 3.0;

    const flankCenters = [
      { x: -flankDistX - 1.0, z: -8 },
      { x: -flankDistX - 2.5, z: 2 },
      { x: -flankDistX - 1.5, z: 12 },
      { x: -flankDistX - 3.0, z: 20 },
      { x: -flankDistX - 0.5, z: -18 },
      { x: flankDistX + 1.0, z: -8 },
      { x: flankDistX + 2.5, z: 2 },
      { x: flankDistX + 1.5, z: 12 },
      { x: flankDistX + 3.0, z: 20 },
      { x: flankDistX + 0.5, z: -18 },
    ];

    const clusterCenters = [
      { x: -boardWidth / 2 - 8, z: -14 },
      { x: boardWidth / 2 + 8, z: -12 },
      { x: -boardWidth / 2 - 12, z: 16 },
      { x: boardWidth / 2 + 10, z: 18 },
      { x: 0, z: -boardDepth / 2 - 12 },
      { x: -boardWidth / 2 - 18, z: -2 },
      { x: boardWidth / 2 + 16, z: -2 },
      { x: 0, z: boardDepth / 2 + 12 },
    ];

    for (let i = 0; i < this.cloudCount; i++) {
      let x: number, z: number, y: number;
      let scaleX: number, scaleY: number, scaleZ: number;

      if (i < 130) {
        // High billowing clouds hugging the track curbs (guaranteed |x| > boardWidth/2 + 3.0 and y <= -1.6)
        const center = flankCenters[i % flankCenters.length];
        const offsetAng = Math.random() * Math.PI * 2;
        const offsetDist = Math.random() * 3.5;
        if (center.x < 0) {
          x = center.x - Math.abs(Math.cos(offsetAng) * offsetDist);
        } else {
          x = center.x + Math.abs(Math.cos(offsetAng) * offsetDist);
        }
        z = center.z + Math.sin(offsetAng) * offsetDist;
        // Below track curb level (y <= -1.6)
        y = -1.6 - Math.random() * 2.2;

        scaleX = 2.6 + Math.random() * 2.8;
        scaleY = 1.6 + Math.random() * 2.0;
        scaleZ = 2.6 + Math.random() * 2.8;
      } else if (i < 280) {
        // Clustered midground cumulus formations
        const center = clusterCenters[i % clusterCenters.length];
        const offsetAng = Math.random() * Math.PI * 2;
        const offsetDist = Math.random() * 10;
        x = center.x + Math.cos(offsetAng) * offsetDist;
        z = center.z + Math.sin(offsetAng) * offsetDist;
        y = -4.5 - Math.random() * 4.0;

        // If inside track bounding box horizontally, push deep down
        if (Math.abs(x) < flankDistX && Math.abs(z) < boardDepth / 2 + 3) {
          y = Math.min(y, -6.0);
        }

        scaleX = 3.0 + Math.random() * 4.0;
        scaleY = 1.8 + Math.random() * 2.5;
        scaleZ = 3.0 + Math.random() * 4.0;
      } else {
        // Deep wide sea spread across radius
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(flankDistX + 3, 12 + Math.random() * 60);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = -7.5 - Math.random() * 6.0;

        scaleX = 3.5 + Math.random() * 4.5;
        scaleY = 2.0 + Math.random() * 2.8;
        scaleZ = 3.5 + Math.random() * 4.5;
      }

      dummy.position.set(x, y, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      dummy.updateMatrix();
      this.cloudInstMesh.setMatrixAt(i, dummy.matrix);
    }

    this.cloudInstMesh.instanceMatrix.needsUpdate = true;
  }

  public getFlankCloudPositions(): { x: number; y: number; z: number }[] {
    const list: { x: number; y: number; z: number }[] = [];
    if (!this.cloudInstMesh) return list;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < 130; i++) {
      this.cloudInstMesh.getMatrixAt(i, mat);
      mat.decompose(pos, rot, scale);
      list.push({ x: pos.x, y: pos.y, z: pos.z });
    }
    return list;
  }

  public setQuality(low: boolean): void {
    if (this.dirLight) {
      const mapSize = low ? 1024 : 2048;
      this.dirLight.shadow.mapSize.set(mapSize, mapSize);
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null;
      }
    }
    if (this.cloudInstMesh) {
      this.cloudInstMesh.count = low ? Math.floor(this.cloudCount / 2) : this.cloudCount;
      this.cloudInstMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Spawns the iconic pastel pillar blocks and floating landmarks from the reference artwork.
   */
  private createPastelPillars(): void {
    // Pastel color palette matching reference:
    // blush pink, soft cyan, sky blue, pastel yellow, light slate stone, soft mint
    const colors = [0xf472b6, 0x93c5fd, 0x60a5fa, 0xfde047, 0xcbd5e1, 0x86efac];

    const pillarMatPool = colors.map(
      (col) =>
        new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.45,
          metalness: 0.1,
          flatShading: true,
        })
    );

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5, flatShading: true });

    // Stepped monolith definitions with multi-tier architecture
    const pillarDefs = [
      { x: -16, z: -10, w: 4.8, d: 4.8, h: 18, colorIdx: 0, hasTree: true, hasStep: true },
      { x: -22, z: 8, w: 5.5, d: 5.5, h: 22, colorIdx: 1, hasTree: true, hasStep: false },
      { x: 18, z: -14, w: 4.2, d: 4.2, h: 16, colorIdx: 3, hasTree: true, hasStep: true },
      { x: 22, z: 12, w: 5.2, d: 5.2, h: 20, colorIdx: 4, hasTree: false, hasStep: true },
      { x: -14, z: -26, w: 6.2, d: 6.2, h: 24, colorIdx: 2, hasTree: true, hasStep: true },
      { x: 16, z: -30, w: 5.2, d: 5.2, h: 25, colorIdx: 0, hasTree: true, hasStep: false },
      { x: -28, z: -18, w: 6.8, d: 6.8, h: 28, colorIdx: 4, hasTree: true, hasStep: true },
      { x: 28, z: -4, w: 5.2, d: 5.2, h: 21, colorIdx: 1, hasTree: false, hasStep: false },
      { x: 0, z: -38, w: 7.5, d: 7.5, h: 32, colorIdx: 4, hasTree: true, hasStep: true }, // Big stepped monolith behind finish
      { x: -8, z: 22, w: 4.6, d: 4.6, h: 15, colorIdx: 5, hasTree: true, hasStep: false },
      { x: 12, z: 24, w: 4.2, d: 4.2, h: 14, colorIdx: 3, hasTree: false, hasStep: false },
    ];

    pillarDefs.forEach((p) => {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = new THREE.Mesh(geo, pillarMatPool[p.colorIdx]);
      mesh.position.set(p.x, p.h / 2 - 12, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);

      let topY = p.h - 12;

      // Secondary stepped upper terrace block
      if (p.hasStep) {
        const stepH = 2.4;
        const stepGeo = new THREE.BoxGeometry(p.w * 0.65, stepH, p.d * 0.65);
        const stepMesh = new THREE.Mesh(stepGeo, pillarMatPool[(p.colorIdx + 1) % colors.length]);
        stepMesh.position.set(p.x, topY + stepH / 2, p.z);
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        this.group.add(stepMesh);
        topY += stepH;
      }

      // Low-poly Pine Tree on top
      if (p.hasTree) {
        const treeGroup = new THREE.Group();
        treeGroup.position.set(p.x + (Math.random() - 0.5) * (p.w * 0.3), topY, p.z + (Math.random() - 0.5) * (p.d * 0.3));

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.4;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Foliage cone tiers
        const tier1 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 6), foliageMat);
        tier1.position.y = 1.1;
        tier1.castShadow = true;
        treeGroup.add(tier1);

        const tier2 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 6), foliageMat);
        tier2.position.y = 1.7;
        tier2.castShadow = true;
        treeGroup.add(tier2);

        this.group.add(treeGroup);
      }
    });

    // Decorative floating golden rings in the sky (matching reference background)
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.4,
    });
    const skyRings = [
      { x: -10, y: 7, z: -15, scale: 1.6, rotY: 0.3 },
      { x: 12, y: 8, z: -22, scale: 2.0, rotY: -0.4 },
      { x: -18, y: 11, z: -32, scale: 2.2, rotY: 0.8 },
      { x: 15, y: 6, z: 5, scale: 1.4, rotY: 1.1 },
    ];

    skyRings.forEach((r) => {
      const torusGeo = new THREE.TorusGeometry(0.8 * r.scale, 0.12 * r.scale, 16, 32);
      const ringMesh = new THREE.Mesh(torusGeo, ringMat);
      ringMesh.position.set(r.x, r.y, r.z);
      ringMesh.rotation.y = r.rotY;
      ringMesh.castShadow = true;
      this.group.add(ringMesh);
    });
  }

  /**
   * Applies level theme to sky background, PMREM environment, fog, lights, and cloud materials.
   * Disposes old textures to prevent memory leaks.
   */
  public applyTheme(theme: LevelTheme, isNight: boolean = false): void {
    // 1. Dispose old textures to avoid GPU memory leaks
    if (this.currentSkyTexture) {
      this.currentSkyTexture.dispose();
    }
    if (this.currentEnvTexture) {
      this.currentEnvTexture.dispose();
    }

    // 2. Generate new sky canvas texture
    const skyTexture = TextureGenerator.createSkyEquirectangular(
      theme.skyTop,
      theme.skyBottom,
      isNight
    );
    this.currentSkyTexture = skyTexture;
    this.scene.background = skyTexture;

    // 3. Regenerate PMREM environment for chrome marble & tile reflections
    try {
      if (this.renderer && (this.renderer as any).capabilities) {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader();
        const envTexture = pmrem.fromEquirectangular(skyTexture).texture;
        this.currentEnvTexture = envTexture;
        this.scene.environment = envTexture;
        pmrem.dispose();
      }
    } catch {
      // Headless / mock fallback
    }

    // 4. Update Fog
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(theme.fogColor);
      this.scene.fog.near = theme.fogNear;
      this.scene.fog.far = theme.fogFar;
    } else {
      this.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);
    }

    // 5. Update Lights
    this.dirLight.color.setHex(theme.sunColor);
    this.dirLight.intensity = theme.sunIntensity;

    this.hemiLight.color.setHex(theme.hemiSky);
    this.hemiLight.groundColor.setHex(theme.hemiGround);

    if (isNight) {
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.25;
    } else {
      this.rimLight.color.setHex(0x7dd3fc);
      this.rimLight.intensity = 0.75;
    }

    // 6. Update Cloud Material tint & emissive
    this.cloudMat.color.setHex(theme.cloudTint);
    if (isNight) {
      this.cloudMat.roughness = 0.55;
      this.cloudMat.emissive.setHex(0x0a192f);
      this.cloudMat.emissiveIntensity = 0.35;
    } else {
      this.cloudMat.roughness = 0.75;
      this.cloudMat.emissive.setHex(0x000000);
      this.cloudMat.emissiveIntensity = 0.0;
    }

    // 7. Update Exposure
    this.renderer.toneMappingExposure = theme.exposure;
  }

  /**
   * Slowly undulates the cloud sea bed to make the world breathe.
   */
  public update(timeSec: number): void {
    for (const c of this.cloudClusters) {
      c.mesh.position.y = Math.sin(timeSec * 0.4 + c.phase) * 0.3;
    }
  }
}
