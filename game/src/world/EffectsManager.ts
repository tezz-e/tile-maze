import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';

interface TrailParticle {
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  scale: number;
  active: boolean;
}

interface BurstParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  active: boolean;
}

interface DustParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  active: boolean;
}

export class EffectsManager {
  public group: THREE.Group;

  // 1. Marble Trail
  private readonly MAX_TRAIL = 40;
  private maxTrailActive = 40;
  private trailParticles: TrailParticle[] = [];
  private trailMesh!: THREE.InstancedMesh;
  private trailTimer = 0;

  // 2. Golden Ring / Checkpoint Burst
  private readonly MAX_BURST = 28;
  private burstParticles: BurstParticle[] = [];
  private burstMesh!: THREE.InstancedMesh;

  // 3. Landing Dust Puff
  private readonly MAX_DUST = 16;
  private dustParticles: DustParticle[] = [];
  private dustMesh!: THREE.InstancedMesh;

  // 4. Blob Shadow
  private shadowMesh!: THREE.Mesh;
  private shadowMat!: THREE.MeshBasicMaterial;

  // Reusable dummy for matrix updates (zero per-frame allocation)
  private dummy = new THREE.Object3D();
  private hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.group = new THREE.Group();
    this.initTrail();
    this.initBurst();
    this.initDust();
    this.initBlobShadow();
  }

  private initTrail(): void {
    const geo = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    this.trailMesh = new THREE.InstancedMesh(geo, mat, this.MAX_TRAIL);
    this.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.MAX_TRAIL; i++) {
      this.trailParticles.push({
        x: 0,
        y: -100,
        z: 0,
        life: 0,
        maxLife: 0.4,
        scale: 1,
        active: false,
      });
      this.trailMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.trailMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.trailMesh);
  }

  private initBurst(): void {
    const geo = new THREE.TetrahedronGeometry(0.1, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
    });
    this.burstMesh = new THREE.InstancedMesh(geo, mat, this.MAX_BURST);
    this.burstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.MAX_BURST; i++) {
      this.burstParticles.push({
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.6,
        active: false,
      });
      this.burstMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.burstMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.burstMesh);
  }

  private initDust(): void {
    const geo = new THREE.SphereGeometry(0.07, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.5,
    });
    this.dustMesh = new THREE.InstancedMesh(geo, mat, this.MAX_DUST);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.MAX_DUST; i++) {
      this.dustParticles.push({
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.35,
        scale: 1,
        active: false,
      });
      this.dustMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.dustMesh);
  }

  private initBlobShadow(): void {
    const shadowGeo = new THREE.CircleGeometry(0.36, 24);
    const shadowTex = TextureGenerator.createBlobShadow();
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.set(0, 0.015, 0);
    this.group.add(this.shadowMesh);
  }

  public update(
    dt: number,
    marblePos: { x: number; y: number; z: number },
    marbleSpeed: number,
    isBoosting: boolean
  ): void {
    // 1. Update Blob Shadow
    this.updateBlobShadow(marblePos);

    // 2. Spawn and Update Marble Trail
    this.updateTrail(dt, marblePos, marbleSpeed, isBoosting);

    // 3. Update Checkpoint Burst Particles
    this.updateBurst(dt);

    // 4. Update Landing Dust Particles
    this.updateDust(dt);
  }

  private updateBlobShadow(marblePos: { x: number; y: number; z: number }): void {
    this.shadowMesh.position.x = marblePos.x;
    this.shadowMesh.position.z = marblePos.z;

    // Track is at y=0, marble radius ~0.32
    const heightAboveTrack = Math.max(0, marblePos.y - 0.32);
    if (marblePos.y < -0.4) {
      // Marble fell off track
      this.shadowMat.opacity = 0;
    } else {
      const scale = Math.max(0.2, 1.0 - heightAboveTrack * 0.28);
      const opacity = Math.max(0.0, 0.55 - heightAboveTrack * 0.22);
      this.shadowMesh.scale.set(scale, scale, 1);
      this.shadowMat.opacity = opacity;
    }
  }

  public setQuality(low: boolean): void {
    this.maxTrailActive = low ? 20 : 40;
    this.trailMesh.count = this.maxTrailActive;
    for (let i = this.maxTrailActive; i < this.MAX_TRAIL; i++) {
      if (this.trailParticles[i]) {
        this.trailParticles[i].active = false;
        this.trailMesh.setMatrixAt(i, this.hiddenMatrix);
      }
    }
    this.trailMesh.instanceMatrix.needsUpdate = true;
  }

  private updateTrail(
    dt: number,
    marblePos: { x: number; y: number; z: number },
    marbleSpeed: number,
    isBoosting: boolean
  ): void {
    // Spawn trail particles when moving
    this.trailTimer += dt;
    // Faster speed = higher spawn rate
    const spawnInterval = isBoosting ? 0.015 : marbleSpeed > 2.0 ? 0.03 : 0.06;

    if (marbleSpeed > 0.6 && this.trailTimer >= spawnInterval) {
      this.trailTimer = 0;
      // Find inactive or oldest particle within active range
      let slot = -1;
      for (let i = 0; i < this.maxTrailActive; i++) {
        if (!this.trailParticles[i].active) {
          slot = i;
          break;
        }
      }
      if (slot === -1) {
        // Recycle oldest
        let lowestLife = Infinity;
        slot = 0;
        for (let i = 0; i < this.maxTrailActive; i++) {
          if (this.trailParticles[i].life < lowestLife) {
            lowestLife = this.trailParticles[i].life;
            slot = i;
          }
        }
      }

      const p = this.trailParticles[slot];
      p.active = true;
      p.x = marblePos.x;
      p.y = marblePos.y;
      p.z = marblePos.z;
      // Trail lifetime scales with speed (fade quickly at low speed)
      p.maxLife = isBoosting ? 0.45 : Math.min(0.35, 0.12 + (marbleSpeed / 12) * 0.23);
      p.life = p.maxLife;
      p.scale = isBoosting ? 1.3 : 1.0;
    }

    // Step active trail particles
    let trailNeedsUpdate = false;
    for (let i = 0; i < this.maxTrailActive; i++) {
      const p = this.trailParticles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.trailMesh.setMatrixAt(i, this.hiddenMatrix);
        trailNeedsUpdate = true;
      } else {
        const progress = p.life / p.maxLife; // 1 -> 0
        const currentScale = progress * p.scale;
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.scale.setScalar(currentScale);
        this.dummy.updateMatrix();
        this.trailMesh.setMatrixAt(i, this.dummy.matrix);
        trailNeedsUpdate = true;
      }
    }

    if (trailNeedsUpdate) {
      this.trailMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public triggerCheckpointBurst(pos: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.MAX_BURST; i++) {
      const p = this.burstParticles[i];
      p.active = true;
      p.x = pos.x;
      p.y = pos.y + 0.2;
      p.z = pos.z;

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.2) * (Math.PI * 0.5);
      const speed = 2.8 + Math.random() * 3.8;

      p.vx = Math.cos(angle) * Math.cos(elevation) * speed;
      p.vy = Math.sin(elevation) * speed + 1.8;
      p.vz = Math.sin(angle) * Math.cos(elevation) * speed;

      p.maxLife = 0.55 + Math.random() * 0.25;
      p.life = p.maxLife;
    }
  }

  /**
   * Expanding celebratory ring and upward fountain burst for level complete.
   * Reuses the existing pooled InstancedMesh burst particles with zero allocations.
   */
  public triggerVictoryBurst(pos: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.MAX_BURST; i++) {
      const p = this.burstParticles[i];
      p.active = true;
      p.x = pos.x;
      p.y = pos.y + 0.15;
      p.z = pos.z;

      if (i < 16) {
        // Celebratory horizontal ring expansion
        const angle = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const speed = 3.6 + Math.random() * 2.0;
        p.vx = Math.cos(angle) * speed;
        p.vy = 1.4 + Math.random() * 1.6;
        p.vz = Math.sin(angle) * speed;
        p.maxLife = 0.75 + Math.random() * 0.35;
      } else {
        // High vertical fountain burst
        const angle = ((i - 16) / 12) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 1.2 + Math.random() * 1.8;
        p.vx = Math.cos(angle) * speed;
        p.vy = 4.8 + Math.random() * 2.2;
        p.vz = Math.sin(angle) * speed;
        p.maxLife = 0.85 + Math.random() * 0.4;
      }
      p.life = p.maxLife;
    }
  }

  private updateBurst(dt: number): void {
    let burstNeedsUpdate = false;
    for (let i = 0; i < this.MAX_BURST; i++) {
      const p = this.burstParticles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.burstMesh.setMatrixAt(i, this.hiddenMatrix);
        burstNeedsUpdate = true;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt; // Gravity

        const progress = p.life / p.maxLife;
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.scale.setScalar(progress * 1.2);
        this.dummy.updateMatrix();
        this.burstMesh.setMatrixAt(i, this.dummy.matrix);
        burstNeedsUpdate = true;
      }
    }

    if (burstNeedsUpdate) {
      this.burstMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public triggerLandingPuff(pos: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.MAX_DUST; i++) {
      const p = this.dustParticles[i];
      p.active = true;
      p.x = pos.x;
      p.y = 0.04;
      p.z = pos.z;

      const angle = (i / this.MAX_DUST) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speed = 1.4 + Math.random() * 1.6;

      p.vx = Math.cos(angle) * speed;
      p.vy = 0.3 + Math.random() * 0.4;
      p.vz = Math.sin(angle) * speed;

      p.maxLife = 0.3 + Math.random() * 0.15;
      p.life = p.maxLife;
      p.scale = 1.0;
    }
  }

  private updateDust(dt: number): void {
    let dustNeedsUpdate = false;
    for (let i = 0; i < this.MAX_DUST; i++) {
      const p = this.dustParticles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dustMesh.setMatrixAt(i, this.hiddenMatrix);
        dustNeedsUpdate = true;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        const progress = p.life / p.maxLife;
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.scale.setScalar(progress * 1.4);
        this.dummy.updateMatrix();
        this.dustMesh.setMatrixAt(i, this.dummy.matrix);
        dustNeedsUpdate = true;
      }
    }

    if (dustNeedsUpdate) {
      this.dustMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public reset(): void {
    for (let i = 0; i < this.MAX_TRAIL; i++) {
      this.trailParticles[i].active = false;
      this.trailMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.trailMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.MAX_BURST; i++) {
      this.burstParticles[i].active = false;
      this.burstMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.burstMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.MAX_DUST; i++) {
      this.dustParticles[i].active = false;
      this.dustMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
  }
}
