import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';

/**
 * Skyway Environment & Atmosphere
 * Creates the bright sunny sky island, cloud sea bed, pastel pillar monoliths,
 * and warm directional lighting with contact shadows.
 */
export class SkyEnvironment {
  public group: THREE.Group;
  public dirLight!: THREE.DirectionalLight;
  private clouds: THREE.InstancedMesh[] = [];
  private cloudClusters: Array<{ mesh: THREE.InstancedMesh; baseY: number; phase: number }> = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.initSkyAndLighting(scene, renderer);
    this.createCloudSea();
    this.createPastelPillars();
  }

  private initSkyAndLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    // 1. Equirectangular Sky & Reflections
    const skyTexture = TextureGenerator.createSkyEquirectangular();
    scene.background = skyTexture;

    // Generate PMREM for crisp chrome marble and track reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(skyTexture).texture;

    // Atmospheric Fog
    scene.fog = new THREE.FogExp2(0xbae6fd, 0.009);

    // 2. Warm Sun Directional Light
    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    this.dirLight.position.set(16, 28, 16);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    this.dirLight.shadow.bias = -0.0005;

    const d = 24;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    scene.add(this.dirLight);
    scene.add(this.dirLight.target);

    // 3. Hemisphere Ambient (warm sunlit sky + warm ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0xfef08a, 1.1);
    scene.add(hemiLight);

    // Gentle sun flare / rim light
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
    rimLight.position.set(-15, 12, -15);
    scene.add(rimLight);
  }

  /**
   * Spawns a vast sea of fluffy white/cream 3D cloud clusters underneath the track.
   */
  private createCloudSea(): void {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });

    // Cloud puff sphere geometry
    const puffGeo = new THREE.IcosahedronGeometry(1, 2);
    const count = 180;
    const instMesh = new THREE.InstancedMesh(puffGeo, cloudMat, count);
    instMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      // Spread across x: -60..60, z: -60..60
      const angle = Math.random() * Math.PI * 2;
      const radius = 8 + Math.random() * 55;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -6.5 - Math.random() * 5.0;

      const scaleX = 2.5 + Math.random() * 3.5;
      const scaleY = 1.2 + Math.random() * 1.8;
      const scaleZ = 2.5 + Math.random() * 3.5;

      dummy.position.set(x, y, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
      dummy.updateMatrix();
      instMesh.setMatrixAt(i, dummy.matrix);
    }

    instMesh.instanceMatrix.needsUpdate = true;
    this.group.add(instMesh);
    this.cloudClusters.push({ mesh: instMesh, baseY: -7, phase: Math.random() * 10 });
  }

  /**
   * Spawns the iconic pastel pillar blocks and floating landmarks from the screenshot.
   */
  private createPastelPillars(): void {
    // Pastel color palette matching screenshot:
    // blush pink, soft cyan, sky blue, pastel yellow, light slate stone
    const colors = [0xf472b6, 0x93c5fd, 0x60a5fa, 0xfde047, 0xcbd5e1, 0x86efac];

    const pillarMatPool = colors.map(
      (col) =>
        new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.5,
          metalness: 0.1,
          flatShading: true,
        })
    );

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6, flatShading: true });

    // Define landmarks at varied angles and distances around the track
    const pillarDefs = [
      { x: -16, z: -10, w: 4.5, d: 4.5, h: 18, colorIdx: 0, hasTree: true },
      { x: -22, z: 8, w: 5.5, d: 5.5, h: 22, colorIdx: 1, hasTree: true },
      { x: 18, z: -14, w: 4.0, d: 4.0, h: 16, colorIdx: 3, hasTree: true },
      { x: 22, z: 12, w: 5.0, d: 5.0, h: 20, colorIdx: 4, hasTree: false },
      { x: -14, z: -26, w: 6.0, d: 6.0, h: 24, colorIdx: 2, hasTree: true },
      { x: 16, z: -30, w: 5.0, d: 5.0, h: 25, colorIdx: 0, hasTree: true },
      { x: -28, z: -18, w: 6.5, d: 6.5, h: 28, colorIdx: 4, hasTree: true },
      { x: 28, z: -4, w: 5.0, d: 5.0, h: 21, colorIdx: 1, hasTree: false },
      { x: 0, z: -38, w: 7.0, d: 7.0, h: 30, colorIdx: 4, hasTree: true }, // Big pillar behind finish arch
      { x: -8, z: 22, w: 4.5, d: 4.5, h: 15, colorIdx: 5, hasTree: true },
      { x: 12, z: 24, w: 4.0, d: 4.0, h: 14, colorIdx: 3, hasTree: false },
    ];

    pillarDefs.forEach((p) => {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = new THREE.Mesh(geo, pillarMatPool[p.colorIdx]);
      mesh.position.set(p.x, p.h / 2 - 12, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);

      // Low-poly Pine Tree on top
      if (p.hasTree) {
        const topY = p.h - 12;
        const treeGroup = new THREE.Group();
        treeGroup.position.set(p.x + (Math.random() - 0.5) * (p.w * 0.4), topY, p.z + (Math.random() - 0.5) * (p.d * 0.4));

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

    // Decorative floating golden rings in the sky (matching screenshot background)
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
   * Slowly undulates the cloud sea bed to make the world breathe.
   */
  public update(timeSec: number): void {
    for (const c of this.cloudClusters) {
      c.mesh.position.y = Math.sin(timeSec * 0.4 + c.phase) * 0.3;
    }
  }
}
