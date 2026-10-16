import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';
import { LEVELS, type LevelTheme, type LevelDef } from '../levels/LevelData.js';

/**
 * Skyway Environment & Atmosphere
 * Creates the bright sunny sky island, cloud sea bed, pastel pillar monoliths,
 * and warm directional lighting with contact shadows.
 */
export class SkyEnvironment {
  public group: THREE.Group;
  public pillarsGroup: THREE.Group = new THREE.Group();
  public skyRingsGroup: THREE.Group = new THREE.Group();
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
  private pillarMaterials: THREE.Material[] = [];
  private pillarTextures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.add(this.pillarsGroup);
    this.group.add(this.skyRingsGroup);
    scene.add(this.group);

    this.initSkyAndLighting(scene, renderer);
    this.createCloudSea();
    this.rebuildPillars(LEVELS[0].theme, false);
    this.createDecorativeSkyRings();
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

    // Atmospheric Fog - soft haze at distance, leaving track razor sharp with high contrast
    scene.fog = new THREE.Fog(0xf0f9ff, 65, 220);

    // 2. Warm Sun Directional Light
    this.dirLight = new THREE.DirectionalLight(0xfffaf0, 2.6);
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

    // 3. Hemisphere Ambient (crisp sky + ground bounce with deep shadow contrast)
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x94a3b8, 0.85);
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
      flatShading: false,
    });

    // Cloud puff sphere geometry with higher-detail subdivision (level 3 for smooth organic puffs)
    const puffGeo = new THREE.IcosahedronGeometry(1, 3);
    this.cloudInstMesh = new THREE.InstancedMesh(puffGeo, this.cloudMat, this.cloudCount);
    this.cloudInstMesh.receiveShadow = true;

    this.group.add(this.cloudInstMesh);
    this.clouds.push(this.cloudInstMesh);
    this.cloudClusters.push({ mesh: this.cloudInstMesh, baseY: -6.5, phase: Math.random() * 10 });

    this.adjustCloudClearance(this.currentBoardWidth, this.currentBoardDepth);
  }

  /**
   * Computes the 3D bounding envelope of the track including base tray and walls.
   */
  public static computeTrackBounds(boardWidth: number, boardDepth: number, wallHeight: number = 0.5): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    bottomY: number;
    topY: number;
  } {
    return {
      minX: -boardWidth / 2 - 0.4,
      maxX: boardWidth / 2 + 0.4,
      minZ: -boardDepth / 2 - 0.4,
      maxZ: boardDepth / 2 + 0.4,
      bottomY: -0.65,
      topY: wallHeight + 0.2,
    };
  }

  /**
   * Dynamically repositions cloud clusters to guarantee zero mesh intersection with the track:
   * Flank clouds are pushed outward (|x| - scaleX > boardWidth / 2 + 0.8) and kept below track curb.
   * Clouds under or overlapping the track horizontal bounding box are pushed strictly below the base tray.
   */
  public adjustCloudClearance(boardWidth: number, boardDepth: number = 40): void {
    this.currentBoardWidth = boardWidth;
    this.currentBoardDepth = boardDepth;
    if (!this.cloudInstMesh) return;

    const dummy = new THREE.Object3D();
    const halfW = boardWidth / 2;
    const halfD = boardDepth / 2;

    for (let i = 0; i < this.cloudCount; i++) {
      let x: number, z: number, y: number;
      let scaleX: number, scaleY: number, scaleZ: number;

      if (i < 130) {
        // High billowing flank clouds: scaled and pushed outward so the entire mesh envelope
        // clears the track curbs horizontally (|x| - scaleX > halfW + 0.8).
        scaleX = 2.4 + Math.random() * 2.2;
        scaleY = 1.4 + Math.random() * 1.8;
        scaleZ = 2.4 + Math.random() * 2.2;

        const side = i % 2 === 0 ? 1 : -1;
        const flankDistance = halfW + scaleX + 0.9 + Math.random() * 3.5;
        x = side * flankDistance;
        z = (Math.random() - 0.5) * (boardDepth + 20);
        // Kept at or below -1.8 to ensure beautiful billow below track surface
        y = -1.8 - Math.random() * 2.2;
      } else if (i < 280) {
        // Midground cumulus formations
        scaleX = 3.0 + Math.random() * 3.5;
        scaleY = 1.8 + Math.random() * 2.2;
        scaleZ = 3.0 + Math.random() * 3.5;

        const angle = Math.random() * Math.PI * 2;
        const dist = halfW + 6 + Math.random() * 25;
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * (halfD + 8 + Math.random() * 20);
        y = -4.5 - Math.random() * 4.0;

        // If cloud mesh horizontal envelope overlaps track footprint, push strictly below base tray
        if (Math.abs(x) - scaleX < halfW + 0.6 && Math.abs(z) - scaleZ < halfD + 0.6) {
          y = -scaleY - 1.5 - Math.random() * 2.0;
        }
      } else {
        // Deep wide sea spread across radius
        scaleX = 3.5 + Math.random() * 4.0;
        scaleY = 2.0 + Math.random() * 2.5;
        scaleZ = 3.5 + Math.random() * 4.0;

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(halfW + 8, 14 + Math.random() * 55);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = -7.5 - Math.random() * 5.0;

        if (Math.abs(x) - scaleX < halfW + 0.6 && Math.abs(z) - scaleZ < halfD + 0.6) {
          y = -scaleY - 2.0 - Math.random() * 3.0;
        }
      }

      dummy.position.set(x, y, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      dummy.updateMatrix();
      this.cloudInstMesh.setMatrixAt(i, dummy.matrix);
    }

    this.cloudInstMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Verifies whether any cloud mesh instance intersects the track volume.
   * Takes breathing undulation (+0.35 in Y) into account.
   */
  public hasCloudTrackIntersection(boardWidth: number, boardDepth: number, wallHeight: number = 0.5): boolean {
    if (!this.cloudInstMesh) return false;
    const bounds = SkyEnvironment.computeTrackBounds(boardWidth, boardDepth, wallHeight);
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < this.cloudCount; i++) {
      this.cloudInstMesh.getMatrixAt(i, mat);
      mat.decompose(pos, rot, scale);

      // Max undulation peak is +0.35 in Y
      const meshTop = pos.y + scale.y + 0.35;
      const meshBottom = pos.y - scale.y - 0.35;
      const meshLeft = pos.x - scale.x;
      const meshRight = pos.x + scale.x;
      const meshFront = pos.z - scale.z;
      const meshBack = pos.z + scale.z;

      const overlapX = meshLeft < bounds.maxX && meshRight > bounds.minX;
      const overlapZ = meshFront < bounds.maxZ && meshBack > bounds.minZ;
      const overlapY = meshBottom < bounds.topY && meshTop > bounds.bottomY;

      if (overlapX && overlapZ && overlapY) {
        return true;
      }
    }
    return false;
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
   * Builds textured architectural monolith pillars according to the level theme palette,
   * adding stone block seams, horizontal banding, subtle vertical gradient, grass caps/trees for day themes,
   * and glowing window strips for night themes.
   */
  public rebuildPillars(theme: LevelTheme, isNight: boolean = false): void {
    // 1. Clear and dispose old pillar textures and materials cleanly to prevent VRAM memory leaks
    for (const t of this.pillarTextures) {
      t.dispose();
    }
    this.pillarTextures = [];

    for (const m of this.pillarMaterials) {
      m.dispose();
    }
    this.pillarMaterials = [];

    while (this.pillarsGroup.children.length > 0) {
      const child = this.pillarsGroup.children[0];
      this.pillarsGroup.remove(child);
      child.traverse((node: any) => {
        if (node.geometry) node.geometry.dispose();
      });
    }

    // 2. Prepare themed materials with procedural stone textures and window strips
    const palette = theme.pillarPalette || [0xfbcfe8, 0xbae6fd, 0xa7f3d0, 0xfef08a, 0xe2e8f0, 0xc7d2fe];
    const windowTex = isNight ? TextureGenerator.createPillarWindowTexture() : null;
    if (windowTex) {
      this.pillarTextures.push(windowTex);
    }

    const pillarMatPool = palette.map((colHex) => {
      const stoneTex = TextureGenerator.createPillarTexture(colHex, isNight);
      this.pillarTextures.push(stoneTex);
      const matParams: THREE.MeshStandardMaterialParameters = {
        map: stoneTex,
        roughness: isNight ? 0.45 : 0.6,
        metalness: isNight ? 0.35 : 0.08,
      };
      if (isNight && windowTex) {
        matParams.emissive = new THREE.Color(0xffffff);
        matParams.emissiveMap = windowTex;
        matParams.emissiveIntensity = 1.6;
      }
      const mat = new THREE.MeshStandardMaterial(matParams);
      this.pillarMaterials.push(mat);
      return mat;
    });

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const treeFoliageColor = theme.fogColor === 0xfecdd3 ? 0x84cc16 : theme.fogColor === 0xe9d5ff ? 0xa855f7 : 0x16a34a;
    const foliageMat = new THREE.MeshStandardMaterial({ color: treeFoliageColor, roughness: 0.5, flatShading: true });

    // Grass cap material for day themes
    const grassColor = theme.fogColor === 0xfecdd3 ? 0xca8a04 : theme.fogColor === 0xe9d5ff ? 0xa855f7 : 0x22c55e;
    const grassMat = new THREE.MeshStandardMaterial({ color: grassColor, roughness: 0.7, metalness: 0.05 });
    this.pillarMaterials.push(trunkMat, foliageMat, grassMat);

    const mastMat = isNight ? new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 }) : null;
    const beaconMat = isNight ? new THREE.MeshStandardMaterial({
      color: 0x00f5ff,
      emissive: 0x00f5ff,
      emissiveIntensity: 2.2,
    }) : null;
    if (mastMat) this.pillarMaterials.push(mastMat);
    if (beaconMat) this.pillarMaterials.push(beaconMat);

    // 3. Multi-tier architectural pillar definitions with varied widths, depths, and heights
    const pillarDefs = [
      { x: -17, z: -10, w: 4.8, d: 4.8, h: 20, colorIdx: 0, hasTree: true, hasStep: true },
      { x: -24, z: 8, w: 6.2, d: 5.5, h: 26, colorIdx: 1, hasTree: true, hasStep: false },
      { x: 19, z: -14, w: 4.2, d: 4.6, h: 18, colorIdx: 3, hasTree: true, hasStep: true },
      { x: 23, z: 12, w: 5.5, d: 5.5, h: 22, colorIdx: 4, hasTree: false, hasStep: true },
      { x: -15, z: -26, w: 6.5, d: 6.5, h: 28, colorIdx: 2, hasTree: true, hasStep: true },
      { x: 17, z: -32, w: 5.2, d: 5.2, h: 27, colorIdx: 0, hasTree: true, hasStep: false },
      { x: -30, z: -18, w: 7.5, d: 7.5, h: 32, colorIdx: 4, hasTree: true, hasStep: true },
      { x: 30, z: -4, w: 5.6, d: 5.6, h: 24, colorIdx: 1, hasTree: false, hasStep: false },
      { x: 0, z: -42, w: 7.5, d: 7.5, h: 18, colorIdx: 4, hasTree: true, hasStep: true }, // Stepped monolith behind finish (lowered to leave sky clear)
      { x: -9, z: 24, w: 4.6, d: 4.6, h: 16, colorIdx: 5, hasTree: true, hasStep: false },
      { x: 13, z: 26, w: 4.2, d: 4.2, h: 15, colorIdx: 3, hasTree: false, hasStep: false },
      // Distant monoliths softly faded by fog
      { x: -38, z: -38, w: 8.5, d: 8.5, h: 40, colorIdx: 2, hasTree: false, hasStep: true },
      { x: 40, z: -30, w: 7.5, d: 7.5, h: 38, colorIdx: 5, hasTree: false, hasStep: true },
      { x: -28, z: 22, w: 5.8, d: 5.8, h: 22, colorIdx: 0, hasTree: true, hasStep: false },
      { x: 26, z: 32, w: 5.2, d: 5.2, h: 20, colorIdx: 1, hasTree: false, hasStep: false },
    ];

    pillarDefs.forEach((p) => {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = new THREE.Mesh(geo, pillarMatPool[p.colorIdx % pillarMatPool.length]);
      mesh.position.set(p.x, p.h / 2 - 12, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.pillarsGroup.add(mesh);

      let topY = p.h - 12;

      // Secondary stepped upper terrace block
      if (p.hasStep) {
        const stepH = 2.4;
        const stepGeo = new THREE.BoxGeometry(p.w * 0.65, stepH, p.d * 0.65);
        const stepMesh = new THREE.Mesh(stepGeo, pillarMatPool[(p.colorIdx + 1) % pillarMatPool.length]);
        stepMesh.position.set(p.x, topY + stepH / 2, p.z);
        stepMesh.castShadow = true;
        stepMesh.receiveShadow = true;
        this.pillarsGroup.add(stepMesh);
        topY += stepH;
      }

      if (!isNight) {
        // Lush grass cap on top of pillar
        const grassGeo = new THREE.BoxGeometry(p.w * (p.hasStep ? 0.68 : 1.03), 0.32, p.d * (p.hasStep ? 0.68 : 1.03));
        const grassMesh = new THREE.Mesh(grassGeo, grassMat);
        grassMesh.position.set(p.x, topY + 0.16, p.z);
        grassMesh.castShadow = true;
        grassMesh.receiveShadow = true;
        this.pillarsGroup.add(grassMesh);
        topY += 0.32;

        // Low-poly Pine Tree on top
        if (p.hasTree) {
          const treeGroup = new THREE.Group();
          treeGroup.position.set(p.x, topY, p.z);

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

          this.pillarsGroup.add(treeGroup);
        }
      } else {
        // Night theme: antenna mast & beacon on tall monoliths
        if ((p.hasTree || p.hasStep) && mastMat && beaconMat) {
          const mastGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8);
          const mast = new THREE.Mesh(mastGeo, mastMat);
          mast.position.set(p.x, topY + 1.6, p.z);
          this.pillarsGroup.add(mast);

          const beaconGeo = new THREE.SphereGeometry(0.2, 12, 12);
          const beacon = new THREE.Mesh(beaconGeo, beaconMat);
          beacon.position.set(p.x, topY + 3.2, p.z);
          this.pillarsGroup.add(beacon);
        }
      }
    });
  }

  private decorativeRings: THREE.Mesh[] = [];

  /**
   * Spawns decorative celestial rings in the deep background far from the track,
   * clearly distinguished from golden course checkpoints (slender, muted silver-slate, slow rotation).
   */
  private createDecorativeSkyRings(): void {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.65,
      roughness: 0.35,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
    });
    const skyRings = [
      { x: -32, y: 15, z: -26, scale: 0.85, rotY: 0.4 },
      { x: 34, y: 18, z: -38, scale: 1.0, rotY: -0.5 },
      { x: -38, y: 19, z: 16, scale: 0.8, rotY: 0.8 },
      { x: 36, y: 16, z: 24, scale: 0.9, rotY: 1.2 },
    ];

    this.decorativeRings = [];
    skyRings.forEach((r) => {
      const torusGeo = new THREE.TorusGeometry(0.55 * r.scale, 0.045 * r.scale, 16, 32);
      const ringMesh = new THREE.Mesh(torusGeo, ringMat);
      ringMesh.position.set(r.x, r.y, r.z);
      ringMesh.rotation.y = r.rotY;
      ringMesh.castShadow = false;
      this.skyRingsGroup.add(ringMesh);
      this.decorativeRings.push(ringMesh);
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
    this.hemiLight.intensity = isNight ? 0.6 : 0.65;

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
      this.cloudMat.emissive.setHex(0x1e3a5f);
      this.cloudMat.emissiveIntensity = 0.45;
    } else {
      this.cloudMat.roughness = 0.75;
      this.cloudMat.emissive.setHex(0x000000);
      this.cloudMat.emissiveIntensity = 0.0;
    }

    // 7. Update Exposure
    this.renderer.toneMappingExposure = theme.exposure;

    // 8. Rebuild Themed Monolith Pillars
    this.rebuildPillars(theme, isNight);
  }

  /**
   * Slowly undulates the cloud sea bed to make the world breathe.
   */
  public update(timeSec: number): void {
    for (const c of this.cloudClusters) {
      c.mesh.position.y = Math.sin(timeSec * 0.4 + c.phase) * 0.3;
    }
    for (let i = 0; i < this.decorativeRings.length; i++) {
      const ring = this.decorativeRings[i];
      ring.rotation.y += 0.002 * (i % 2 === 0 ? 1 : -1);
      ring.rotation.x = Math.sin(timeSec * 0.15 + i) * 0.12;
    }
  }
}
