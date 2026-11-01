import * as THREE from 'three';
import { glowPointMaterial, neonLineMaterial } from './glow.js';

const UP = new THREE.Vector3(0, 1, 0);

export class FootRig {
  constructor(color = 0xb8ff5c) {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.geometry = new THREE.CapsuleGeometry(1, 2, 4, 12);
    this.material = new THREE.MeshStandardMaterial({
      color: 0x102006,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.42,
      metalness: 0.45,
      roughness: 0.32,
      transparent: true,
      opacity: 0.9,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Mesh(this.geometry, this.glowMaterial);
    this.glow.frustumCulled = false;
    this.group.add(this.glow);

    this.toePositions = new Float32Array(3);
    const toeGeo = new THREE.BufferGeometry();
    toeGeo.setAttribute('position', new THREE.BufferAttribute(this.toePositions, 3));
    this.toeGlow = new THREE.Points(toeGeo, glowPointMaterial(color, 0.05, 0.85));
    this.toeGlow.frustumCulled = false;
    this.group.add(this.toeGlow);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.14, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.setScalar(0.09);
    this.group.add(this.ring);

    this._dir = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  update(ankle, heel, toe, confidence = 1) {
    if (!ankle || !heel || !toe) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    this._dir.set(toe.x - heel.x, toe.y - heel.y, toe.z - heel.z);
    const length = Math.max(0.08, this._dir.length());
    this._dir.normalize();
    this._q.setFromUnitVectors(UP, this._dir);

    this._mid.set(
      (heel.x + toe.x) / 2,
      (heel.y + toe.y) / 2,
      (heel.z + toe.z) / 2,
    );

    const width = 0.038;
    const thickness = 0.03;
    const scaleY = (length + 0.06) / 4;

    this.mesh.position.copy(this._mid);
    this.mesh.quaternion.copy(this._q);
    this.mesh.scale.set(width, scaleY, thickness);

    this.glow.position.copy(this._mid);
    this.glow.quaternion.copy(this._q);
    this.glow.scale.set(width * 1.65, scaleY * 1.08, thickness * 1.75);

    this.toePositions[0] = toe.x;
    this.toePositions[1] = toe.y;
    this.toePositions[2] = toe.z;
    this.toeGlow.geometry.getAttribute('position').needsUpdate = true;

    this.ring.position.set(ankle.x, -0.945, ankle.z);
    this.ring.material.opacity = 0.1 + 0.2 * confidence;

    this.material.emissiveIntensity = 0.4 + 0.35 * confidence;
  }
}
