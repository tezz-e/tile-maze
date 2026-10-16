import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';

/**
 * Liquid-Mirror Chrome Marble
 * High-polish reflective chrome sphere reflecting sky, clouds, and track tiles,
 * accented with a golden-orange racing decal insignia.
 */
export class Marble {
  public mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;

  constructor(radius: number = 0.32) {
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    const decalTex = TextureGenerator.createMarbleDecal();

    // Liquid-mirror chrome material reflecting the PMREM sky and track
    this.material = new THREE.MeshStandardMaterial({
      map: decalTex,
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.03,
      envMapIntensity: 2.2,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
  }

  public update(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; w: number },
    speed: number
  ): void {
    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    // Subtle dynamic chrome sheen scaling with rolling speed
    this.material.envMapIntensity = 2.2 + Math.min(0.8, (speed / 12.0) * 0.6);
  }
}
