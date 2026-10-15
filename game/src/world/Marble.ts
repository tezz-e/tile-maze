import * as THREE from 'three';

/**
 * Liquid-Mirror Chrome Marble
 * High-polish reflective chrome sphere reflecting sky, clouds, and track tiles.
 */
export class Marble {
  public mesh: THREE.Mesh;

  constructor(radius: number = 0.32) {
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    // Liquid-mirror chrome material reflecting the PMREM sky and track
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 0.02,
      envMapIntensity: 2.2,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
  }

  public update(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; w: number },
    _speed: number
  ): void {
    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }
}
