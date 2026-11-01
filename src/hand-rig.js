import * as THREE from 'three';
import { glowPointMaterial, neonLineMaterial } from './glow.js';

export const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const TIPS = [4, 8, 12, 16, 20];

export class HandRig {
  constructor(color = 0xff5ecf) {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.bonePositions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3);
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute('position', new THREE.BufferAttribute(this.bonePositions, 3));
    this.bones = new THREE.LineSegments(boneGeo, neonLineMaterial(color, 0.92));
    this.bones.frustumCulled = false;
    this.group.add(this.bones);

    this.jointPositions = new Float32Array(21 * 3);
    const jointGeo = new THREE.BufferGeometry();
    jointGeo.setAttribute('position', new THREE.BufferAttribute(this.jointPositions, 3));
    this.joints = new THREE.Points(jointGeo, glowPointMaterial(color, 0.04, 0.95));
    this.joints.frustumCulled = false;
    this.group.add(this.joints);

    this.tipPositions = new Float32Array(TIPS.length * 3);
    const tipGeo = new THREE.BufferGeometry();
    tipGeo.setAttribute('position', new THREE.BufferAttribute(this.tipPositions, 3));
    this.tips = new THREE.Points(tipGeo, glowPointMaterial(0xffffff, 0.06, 0.95));
    this.tips.frustumCulled = false;
    this.group.add(this.tips);

    this.palmPositions = new Float32Array(3 * 3);
    const palmGeo = new THREE.BufferGeometry();
    palmGeo.setAttribute('position', new THREE.BufferAttribute(this.palmPositions, 3));
    palmGeo.setIndex([0, 1, 2]);
    this.palm = new THREE.Mesh(
      palmGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.palm.frustumCulled = false;
    this.group.add(this.palm);
  }

  update(points, confidence = 1, scale = 1) {
    if (!points || points.length < 21) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const wrist = points[0];
    const p = (i) => {
      const point = points[i];
      if (scale === 1) return point;
      return {
        x: wrist.x + (point.x - wrist.x) * scale,
        y: wrist.y + (point.y - wrist.y) * scale,
        z: wrist.z + (point.z - wrist.z) * scale,
      };
    };

    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const [a, b] = HAND_CONNECTIONS[i];
      const pa = p(a);
      const pb = p(b);
      const offset = i * 6;
      this.bonePositions[offset] = pa.x;
      this.bonePositions[offset + 1] = pa.y;
      this.bonePositions[offset + 2] = pa.z;
      this.bonePositions[offset + 3] = pb.x;
      this.bonePositions[offset + 4] = pb.y;
      this.bonePositions[offset + 5] = pb.z;
    }
    this.bones.geometry.getAttribute('position').needsUpdate = true;

    for (let i = 0; i < 21; i++) {
      const point = p(i);
      this.jointPositions[i * 3] = point.x;
      this.jointPositions[i * 3 + 1] = point.y;
      this.jointPositions[i * 3 + 2] = point.z;
    }
    this.joints.geometry.getAttribute('position').needsUpdate = true;

    for (let i = 0; i < TIPS.length; i++) {
      const point = p(TIPS[i]);
      this.tipPositions[i * 3] = point.x;
      this.tipPositions[i * 3 + 1] = point.y;
      this.tipPositions[i * 3 + 2] = point.z;
    }
    this.tips.geometry.getAttribute('position').needsUpdate = true;

    const palm = [p(0), p(5), p(17)];
    for (let i = 0; i < 3; i++) {
      this.palmPositions[i * 3] = palm[i].x;
      this.palmPositions[i * 3 + 1] = palm[i].y;
      this.palmPositions[i * 3 + 2] = palm[i].z;
    }
    this.palm.geometry.getAttribute('position').needsUpdate = true;

    const alpha = Math.min(1, Math.max(0.25, confidence));
    this.bones.material.opacity = 0.92 * alpha;
    this.joints.material.opacity = 0.95 * alpha;
  }

  dispose() {
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material?.dispose?.();
    });
  }
}
