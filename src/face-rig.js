import * as THREE from 'three';
import { glowPointMaterial, neonLineMaterial } from './glow.js';

const VIOLET = 0xa78bfa;
const WHITE = 0xf2feff;
const CYAN = 0x5ff5ff;
const PINK = 0xff8ad8;

const makeLine = (material, count, loop = false) => {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = loop
    ? new THREE.LineLoop(geometry, material)
    : new THREE.LineSegments(geometry, material);
  line.frustumCulled = false;
  return { line, positions, geometry };
};

const setPoint = (array, index, x, y, z) => {
  array[index * 3] = x;
  array[index * 3 + 1] = y;
  array[index * 3 + 2] = z;
};

export class FaceRig {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.realGroup = new THREE.Group();
    this.realGroup.visible = false;
    this.group.add(this.realGroup);

    this.demoGroup = new THREE.Group();
    this.demoGroup.visible = false;
    this.group.add(this.demoGroup);

    this.connections = null;
    this.realBuilt = false;
    this.real = null;

    this.buildDemo();
    this.group.traverse((object) => {
      object.renderOrder = 20;
    });
  }

  /* ------------------------------------------------------------------ *
   * Real MediaPipe face mesh
   * ------------------------------------------------------------------ */

  setConnections(connections) {
    if (!connections || this.realBuilt) return;
    this.connections = connections;
    this.buildReal(connections);
  }

  buildReal(connections) {
    const tesselation = connections.tesselation ?? [];
    const tesselationPositions = new Float32Array(tesselation.length * 2 * 3);
    const tessGeo = new THREE.BufferGeometry();
    tessGeo.setAttribute('position', new THREE.BufferAttribute(tesselationPositions, 3));
    const tess = new THREE.LineSegments(tessGeo, neonLineMaterial(VIOLET, 0.16));
    tess.frustumCulled = false;
    this.realGroup.add(tess);

    const pointPositions = new Float32Array(478 * 3);
    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    const points = new THREE.Points(pointGeo, glowPointMaterial(0xd3c6ff, 0.0055, 0.85));
    points.frustumCulled = false;
    this.realGroup.add(points);

    const contour = (connectionList, material) => {
      const list = connectionList ?? [];
      const positions = new Float32Array(list.length * 2 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.LineSegments(geometry, material);
      line.frustumCulled = false;
      this.realGroup.add(line);
      return { line, positions, list, geometry };
    };

    const lip = contour(connections.lips, neonLineMaterial(PINK, 0.95));
    const leftEye = contour(connections.leftEye, neonLineMaterial(WHITE, 0.95));
    const rightEye = contour(connections.rightEye, neonLineMaterial(WHITE, 0.95));
    const leftBrow = contour(connections.leftBrow, neonLineMaterial(VIOLET, 0.8));
    const rightBrow = contour(connections.rightBrow, neonLineMaterial(VIOLET, 0.8));
    const oval = contour(connections.oval, neonLineMaterial(VIOLET, 0.42));
    const leftIris = contour(connections.leftIris, neonLineMaterial(CYAN, 1));
    const rightIris = contour(connections.rightIris, neonLineMaterial(CYAN, 1));

    const irisPositions = new Float32Array(10 * 3);
    const irisGeo = new THREE.BufferGeometry();
    irisGeo.setAttribute('position', new THREE.BufferAttribute(irisPositions, 3));
    const irisPoints = new THREE.Points(irisGeo, glowPointMaterial(WHITE, 0.012, 1));
    irisPoints.frustumCulled = false;
    this.realGroup.add(irisPoints);

    const mouthGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({
        color: PINK,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.realGroup.add(mouthGlow);

    this.real = {
      tesselation,
      tesselationPositions,
      tess: {
        line: tess,
        positions: tesselationPositions,
        list: tesselation,
        geometry: tessGeo,
      },
      pointPositions,
      pointGeo,
      points,
      lip,
      leftEye,
      rightEye,
      leftBrow,
      rightBrow,
      oval,
      leftIris,
      rightIris,
      irisPositions,
      irisGeo,
      irisPoints,
      mouthGlow,
      lipCenter: new THREE.Vector3(),
      lipIndices: [61, 291, 13, 14, 78, 308, 82, 312, 87, 317, 178, 402],
    };
    this.realBuilt = true;
    this.realGroup.traverse((object) => {
      object.renderOrder = 20;
    });
  }

  updateReal(face) {
    const landmarks = face.landmarks;
    if (!landmarks || landmarks.length < 468) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const lm of landmarks) {
      if (lm.x < minX) minX = lm.x;
      if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y;
      if (lm.y > maxY) maxY = lm.y;
      if (lm.z < minZ) minZ = lm.z;
      if (lm.z > maxZ) maxZ = lm.z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, 1e-5);
    const s = 2.0 / span;

    const { pointPositions, pointGeo } = this.real;
    const real = this.real;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      pointPositions[i * 3] = (lm.x - cx) * s;
      pointPositions[i * 3 + 1] = -(lm.y - cy) * s;
      pointPositions[i * 3 + 2] = 0.95 - (lm.z - cz) * s * 0.45;
    }
    pointGeo.getAttribute('position').needsUpdate = true;

    const fill = (entry, list) => {
      if (!list?.length) return;
      const arr = entry.positions;
      for (let i = 0; i < list.length; i++) {
        const a = list[i].start ?? list[i][0];
        const b = list[i].end ?? list[i][1];
        const pa = pointPositions;
        const offset = i * 6;
        arr[offset] = pa[a * 3];
        arr[offset + 1] = pa[a * 3 + 1];
        arr[offset + 2] = pa[a * 3 + 2];
        arr[offset + 3] = pa[b * 3];
        arr[offset + 4] = pa[b * 3 + 1];
        arr[offset + 5] = pa[b * 3 + 2];
      }
      entry.geometry.getAttribute('position').needsUpdate = true;
    };

    fill(real.tess, real.tesselation);
    fill(real.lip, real.lip.list);
    fill(real.leftEye, real.leftEye.list);
    fill(real.rightEye, real.rightEye.list);
    fill(real.leftBrow, real.leftBrow.list);
    fill(real.rightBrow, real.rightBrow.list);
    fill(real.oval, real.oval.list);
    fill(real.leftIris, real.leftIris.list);
    fill(real.rightIris, real.rightIris.list);

    const irisIndices = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
    for (let i = 0; i < irisIndices.length; i++) {
      const idx = irisIndices[i];
      real.irisPositions[i * 3] = pointPositions[idx * 3];
      real.irisPositions[i * 3 + 1] = pointPositions[idx * 3 + 1];
      real.irisPositions[i * 3 + 2] = pointPositions[idx * 3 + 2] + 0.012;
    }
    real.irisGeo.getAttribute('position').needsUpdate = true;

    let lx = 0;
    let ly = 0;
    let lz = 0;
    for (const idx of real.lipIndices) {
      lx += pointPositions[idx * 3];
      ly += pointPositions[idx * 3 + 1];
      lz += pointPositions[idx * 3 + 2];
    }
    const n = real.lipIndices.length;
    real.lipCenter.set(lx / n, ly / n, lz / n + 0.03);
    real.mouthGlow.position.copy(real.lipCenter);
    real.mouthGlow.scale.set(0.22, 0.018 + (face.jawOpen ?? 0) * 0.1, 1);
    real.mouthGlow.material.opacity = 0.08 + (face.jawOpen ?? 0) * 0.28;
  }

  /* ------------------------------------------------------------------ *
   * Procedural demo face
   * ------------------------------------------------------------------ */

  buildDemo() {
    const nx = 21;
    const ny = 27;
    const points = [];
    const lines = [];
    const indexAt = new Map();

    for (let iy = 0; iy < ny; iy++) {
      const v = (iy / (ny - 1)) * 2 - 1;
      for (let ix = 0; ix < nx; ix++) {
        const u = (ix / (nx - 1)) * 2 - 1;
        const x = u * 0.94;
        const y = v * 1.12;
        const ellipse = (x / 0.98) ** 2 + (y / 1.16) ** 2;
        if (ellipse > 1) continue;
        const z =
          0.56 +
          0.44 * Math.sqrt(Math.max(0, 1 - ellipse * 0.72)) +
          0.24 * Math.exp(-((x / 0.17) ** 2 + ((y + 0.04) / 0.44) ** 2));
        const idx = points.length / 3;
        points.push(x, -y, z);
        indexAt.set(`${ix},${iy}`, idx);
        if (ix > 0 && indexAt.has(`${ix - 1},${iy}`)) {
          lines.push(indexAt.get(`${ix - 1},${iy}`), idx);
        }
        if (iy > 0 && indexAt.has(`${ix},${iy - 1}`)) {
          lines.push(indexAt.get(`${ix},${iy - 1}`), idx);
        }
      }
    }

    const gridPositions = new Float32Array(points);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPositions, 3));
    gridGeo.setIndex(lines);
    const grid = new THREE.LineSegments(gridGeo, neonLineMaterial(VIOLET, 0.24));
    grid.frustumCulled = false;
    this.demoGroup.add(grid);

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(gridPositions.slice(), 3));
    const gridPoints = new THREE.Points(pointGeo, glowPointMaterial(0xcbb8ff, 0.01, 0.55));
    gridPoints.frustumCulled = false;
    this.demoGroup.add(gridPoints);

    const oval = makeLine(neonLineMaterial(VIOLET, 0.55), 64, true);
    const eyeL = makeLine(neonLineMaterial(WHITE, 0.95), 32, true);
    const eyeR = makeLine(neonLineMaterial(WHITE, 0.95), 32, true);
    const irisL = makeLine(neonLineMaterial(CYAN, 1), 20, true);
    const irisR = makeLine(neonLineMaterial(CYAN, 1), 20, true);
    const browL = makeLine(neonLineMaterial(VIOLET, 0.85), 8, false);
    const browR = makeLine(neonLineMaterial(VIOLET, 0.85), 8, false);
    const lips = makeLine(neonLineMaterial(PINK, 0.95), 34, true);
    const nose = makeLine(neonLineMaterial(VIOLET, 0.45), 3, false);
    const scan = makeLine(neonLineMaterial(CYAN, 0.35), 2, false);

    const mouthGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({
        color: PINK,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    mouthGlow.position.set(0, -0.51, 0.99);
    this.demoGroup.add(mouthGlow);

    this.demoGroup.add(
      oval.line,
      eyeL.line,
      eyeR.line,
      irisL.line,
      irisR.line,
      browL.line,
      browR.line,
      lips.line,
      nose.line,
      scan.line,
      mouthGlow,
    );

    this.demo = {
      oval,
      eyeL,
      eyeR,
      irisL,
      irisR,
      browL,
      browR,
      lips,
      nose,
      scan,
      mouthGlow,
      eyeCenters: { left: { x: -0.34, y: 0.18 }, right: { x: 0.34, y: 0.18 } },
      eyeRadius: { x: 0.17, y: 0.082 },
      time: 0,
    };

    this.drawDemoStatic();
  }

  drawDemoStatic() {
    const { oval, nose, browL, browR } = this.demo;

    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      setPoint(oval.positions, i, Math.cos(a) * 0.96, Math.sin(a) * 1.12, 0.54);
    }
    oval.geometry.getAttribute('position').needsUpdate = true;

    // Nose bridge + two nostril strokes.
    setPoint(nose.positions, 0, 0, 0.08, 1.1);
    setPoint(nose.positions, 1, 0, -0.29, 1.03);
    setPoint(nose.positions, 2, -0.075, -0.27, 1.02);
    setPoint(nose.positions, 3, 0, -0.29, 1.03);
    setPoint(nose.positions, 4, 0.075, -0.27, 1.02);
    setPoint(nose.positions, 5, 0, -0.29, 1.03);
    nose.geometry.getAttribute('position').needsUpdate = true;

    for (const [entry, cx] of [
      [browL, -0.34],
      [browR, 0.34],
    ]) {
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const x = cx + (t - 0.5) * 0.36;
        const y = 0.34 + Math.sin(t * Math.PI) * 0.032;
        setPoint(entry.positions, i * 2, x, y, 1.03);
        if (i < 3) {
          const t2 = (i + 1) / 3;
          const x2 = cx + (t2 - 0.5) * 0.36;
          const y2 = 0.34 + Math.sin(t2 * Math.PI) * 0.032;
          setPoint(entry.positions, i * 2 + 1, x2, y2, 1.03);
        } else {
          setPoint(entry.positions, i * 2 + 1, x, y, 1.03);
        }
      }
      entry.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  updateDemo(face, time) {
    const demo = this.demo;
    const blink = face.blink ?? 0;
    const jaw = face.jawOpen ?? 0;
    const smile = face.smile ?? 0;
    const brow = face.brow ?? 0;
    const gazeX = face.gazeX ?? 0;
    const gazeY = face.gazeY ?? 0;

    const drawEye = (entry, iris, cx, cy) => {
      const ry = demo.eyeRadius.y * (1 - blink * 0.94);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        setPoint(
          entry.positions,
          i,
          cx + Math.cos(a) * demo.eyeRadius.x,
          cy + Math.sin(a) * ry,
          1.045,
        );
      }
      entry.geometry.getAttribute('position').needsUpdate = true;

      const ix = cx + gazeX * 0.06;
      const iy = cy + gazeY * 0.042;
      const ir = 0.05;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        setPoint(
          iris.positions,
          i,
          ix + Math.cos(a) * ir,
          iy + Math.sin(a) * ir * Math.max(0.08, 1 - blink * 0.94),
          1.06,
        );
      }
      iris.geometry.getAttribute('position').needsUpdate = true;
    };

    drawEye(demo.eyeL, demo.irisL, demo.eyeCenters.left.x, demo.eyeCenters.left.y);
    drawEye(demo.eyeR, demo.irisR, demo.eyeCenters.right.x, demo.eyeCenters.right.y);

    for (const [entry, cx] of [
      [demo.browL, -0.34],
      [demo.browR, 0.34],
    ]) {
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const x = cx + (t - 0.5) * 0.36;
        const y = 0.34 + brow * 0.07 + Math.sin(t * Math.PI) * 0.032;
        setPoint(entry.positions, i * 2, x, y, 1.03);
        if (i < 3) {
          const t2 = (i + 1) / 3;
          const x2 = cx + (t2 - 0.5) * 0.36;
          const y2 = 0.34 + brow * 0.07 + Math.sin(t2 * Math.PI) * 0.032;
          setPoint(entry.positions, i * 2 + 1, x2, y2, 1.03);
        } else {
          setPoint(entry.positions, i * 2 + 1, x, y, 1.03);
        }
      }
      entry.geometry.getAttribute('position').needsUpdate = true;
    }

    const w = 0.285;
    const baseY = -0.51;
    const upperCount = 17;
    for (let i = 0; i < upperCount; i++) {
      const t = i / (upperCount - 1);
      const x = (t * 2 - 1) * w;
      const corner = (x / w) ** 2;
      const y =
        baseY +
        0.022 +
        0.03 * Math.sin(t * Math.PI) +
        smile * 0.035 * corner +
        smile * 0.008;
      setPoint(demo.lips.positions, i, x, y, 1.04);
    }
    for (let i = 0; i < upperCount; i++) {
      const t = 1 - i / (upperCount - 1);
      const x = (t * 2 - 1) * w;
      const corner = (x / w) ** 2;
      const y =
        baseY -
        0.022 -
        0.03 * Math.sin(t * Math.PI) -
        jaw * 0.13 * Math.sin(t * Math.PI) +
        smile * 0.035 * corner -
        smile * 0.004;
      setPoint(demo.lips.positions, upperCount + i, x, y, 1.04);
    }
    demo.lips.geometry.getAttribute('position').needsUpdate = true;

    demo.mouthGlow.position.set(0, baseY - 0.01, 0.995);
    demo.mouthGlow.scale.set(w * 0.82, 0.012 + jaw * 0.105, 1);
    demo.mouthGlow.material.opacity = 0.08 + jaw * 0.3;

    const scanY = Math.sin(time * 0.9) * 0.98;
    setPoint(demo.scan.positions, 0, -0.86, scanY, 1.12);
    setPoint(demo.scan.positions, 1, 0.86, scanY, 1.12);
    demo.scan.geometry.getAttribute('position').needsUpdate = true;
    demo.scan.line.material.opacity = 0.18 + 0.16 * Math.sin(time * 2.2) ** 2;
  }

  update(face, headRadius, time) {
    if (!face || !face.detected) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.scale.setScalar(headRadius * 1.02);
    this.group.position.z = headRadius * 0.02;

    if (face.demo) {
      this.realGroup.visible = false;
      this.demoGroup.visible = true;
      this.updateDemo(face, time);
      return;
    }

    if (!this.realBuilt || !face.landmarks) {
      this.group.visible = false;
      return;
    }

    this.demoGroup.visible = false;
    this.realGroup.visible = true;
    this.updateReal(face);
  }
}
