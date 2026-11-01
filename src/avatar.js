import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FaceRig } from './face-rig.js';
import { HandRig } from './hand-rig.js';
import { FootRig } from './foot-rig.js';
import { LandmarkFilter, clamp, damp, midpoint, vecDistance } from './filters.js';
import { getGlowTexture, glowPointMaterial } from './glow.js';

const UP = new THREE.Vector3(0, 1, 0);

const BONE_DEFS = [
  { a: 33, b: 34, r: 0.026, torso: true },
  { a: 23, b: 24, r: 0.05 },
  { a: 11, b: 12, r: 0.03 },
  { a: 23, b: 25, r: 0.048 },
  { a: 25, b: 27, r: 0.036 },
  { a: 24, b: 26, r: 0.048 },
  { a: 26, b: 28, r: 0.036 },
  { a: 11, b: 13, r: 0.038 },
  { a: 13, b: 15, r: 0.028 },
  { a: 12, b: 14, r: 0.038 },
  { a: 14, b: 16, r: 0.028 },
  { a: 34, b: 36, r: 0.022 },
];

const JOINT_DEFS = [
  { i: 11, r: 0.026 },
  { i: 12, r: 0.026 },
  { i: 13, r: 0.02 },
  { i: 14, r: 0.02 },
  { i: 15, r: 0.017 },
  { i: 16, r: 0.017 },
  { i: 23, r: 0.024 },
  { i: 24, r: 0.024 },
  { i: 25, r: 0.025 },
  { i: 26, r: 0.025 },
  { i: 27, r: 0.02 },
  { i: 28, r: 0.02 },
];

function makeRadialTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(95,245,255,0.32)');
  g.addColorStop(0.22, 'rgba(95,245,255,0.16)');
  g.addColorStop(0.55, 'rgba(95,245,255,0.035)');
  g.addColorStop(1, 'rgba(95,245,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#0d3d4d');
  sky.addColorStop(0.42, '#071c26');
  sky.addColorStop(0.56, '#030b11');
  sky.addColorStop(1, '#010305');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);

  const blob = (x, y, radius, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  blob(110, 66, 128, 'rgba(95,245,255,0.9)');
  blob(392, 112, 116, 'rgba(255,79,196,0.5)');
  blob(300, 34, 96, 'rgba(167,139,250,0.6)');

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}

function makeTorsoGeometry() {
  const profile = [
    new THREE.Vector2(0.0, -0.5),
    new THREE.Vector2(0.26, -0.49),
    new THREE.Vector2(0.38, -0.4),
    new THREE.Vector2(0.45, -0.22),
    new THREE.Vector2(0.49, -0.02),
    new THREE.Vector2(0.5, 0.2),
    new THREE.Vector2(0.5, 0.36),
    new THREE.Vector2(0.44, 0.45),
    new THREE.Vector2(0.26, 0.5),
    new THREE.Vector2(0.0, 0.5),
  ];
  return new THREE.LatheGeometry(profile, 22);
}

export class AvatarScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x03060b, 0.038);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x04070c, 0);
    this.scene.background = null;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.9;
    this.renderer.domElement.setAttribute('aria-label', 'Live 3D motion capture scene');
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
    this.camera.position.set(0, 0.12, 3.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.02, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 6.5;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 2.2;
    this.controls.zoomSpeed = 0.75;
    this.controls.rotateSpeed = 0.65;
    this.hasInteracted = false;
    this.controls.addEventListener('start', () => {
      this.hasInteracted = true;
    });

    this.layerVisibility = {
      body: true,
      face: true,
      hands: true,
      feet: true,
      particles: true,
      ground: true,
    };

    this.poseFilter = new LandmarkFilter(33, { minCutoff: 2.6, beta: 0.7 });
    this.headPosition = new THREE.Vector3(0, 0.62, 0);
    this.headQuaternion = new THREE.Quaternion();
    this.headTargetQuaternion = new THREE.Quaternion();
    this.headRadius = 0.085;
    this.headVisible = false;
    this.lastMode = null;
    this.lastPoseTime = 0;
    this.motionEnergy = 0;
    this.prevMotion = null;
    this.rigPoints = Array.from({ length: 40 }, () => ({ x: 0, y: 0, z: 0 }));

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();

    this.buildLights();
    this.buildGround();
    this.buildParticles();
    this.buildBody();
    this.buildHandsAndFeet();

    this.faceRig = new FaceRig();
    this.headGroup.add(this.faceRig.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /* ------------------------------------------------------------------ *
   * Scene construction
   * ------------------------------------------------------------------ */

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x7fdcff, 0x04060a, 1.2));

    const key = new THREE.DirectionalLight(0xa8f6ff, 2.2);
    key.position.set(1.4, 2.6, 3.2);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x7c4dff, 1.6);
    rim.position.set(-2.4, 1.2, -1.5);
    this.scene.add(rim);

    const violet = new THREE.PointLight(0x9b6bff, 9, 9, 2);
    violet.position.set(-2.1, 1.1, 1.6);
    this.scene.add(violet);

    const magenta = new THREE.PointLight(0xff4fc4, 7, 8, 2);
    magenta.position.set(2.2, -0.2, 1.2);
    this.scene.add(magenta);

    const front = new THREE.PointLight(0x5ff5ff, 4, 6, 2);
    front.position.set(0, 0.45, 2.3);
    this.scene.add(front);
  }

  buildGround() {
    this.groundGroup = new THREE.Group();
    this.scene.add(this.groundGroup);

    const grid = new THREE.GridHelper(16, 32, 0x1f7186, 0x0a2630);
    grid.position.y = -0.955;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    grid.material.depthWrite = false;
    this.groundGroup.add(grid);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.16, 64),
      new THREE.MeshStandardMaterial({
        color: 0x06121a,
        metalness: 0.8,
        roughness: 0.36,
        transparent: true,
        opacity: 0.78,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.952;
    this.groundGroup.add(disc);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(1.16, 0.006, 4, 128),
      new THREE.MeshBasicMaterial({
        color: 0x5ff5ff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = -0.95;
    this.groundGroup.add(edge);
    this.edgeRing = edge;

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({
        map: makeRadialTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.951;
    this.groundGroup.add(glow);
    this.groundGlow = glow;

    this.rings = [];
    const ringDefs = [
      { r: 0.82, color: 0x5ff5ff, opacity: 0.28, speed: 0.7, phase: 0 },
      { r: 1.16, color: 0x5ff5ff, opacity: 0.2, speed: 0.55, phase: 1.6 },
      { r: 1.52, color: 0xa78bfa, opacity: 0.16, speed: 0.42, phase: 3.1 },
      { r: 1.95, color: 0xff5ecf, opacity: 0.1, speed: 0.32, phase: 4.4 },
    ];
    for (const def of ringDefs) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(def.r, def.r + 0.004, 96),
        new THREE.MeshBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: def.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.949;
      this.groundGroup.add(ring);
      this.rings.push({ mesh: ring, ...def });
    }
  }

  buildParticles() {
    const count = 520;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cA = new THREE.Color(0x5ff5ff);
    const cB = new THREE.Color(0xa78bfa);
    const cC = new THREE.Color(0xff5ecf);
    const temp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.36 + Math.random() * 1.8;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = -0.9 + Math.random() * 2.45;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      const pick = Math.random();
      temp.copy(pick < 0.55 ? cA : pick < 0.88 ? cB : cC);
      temp.multiplyScalar(0.55 + Math.random() * 0.45);
      colors[i * 3] = temp.r;
      colors[i * 3 + 1] = temp.g;
      colors[i * 3 + 2] = temp.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.013,
      map: getGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      alphaTest: 0.001,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  buildBody() {
    this.bodyGroup = new THREE.Group();
    this.scene.add(this.bodyGroup);

    this.boneMaterial = new THREE.MeshStandardMaterial({
      color: 0x081820,
      emissive: new THREE.Color(0x1fb8cc),
      emissiveIntensity: 0.2,
      metalness: 0.9,
      roughness: 0.18,
    });
    this.boneGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5ff5ff,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.torsoMaterial = new THREE.MeshStandardMaterial({
      color: 0x061820,
      emissive: new THREE.Color(0x0a6a7c),
      emissiveIntensity: 0.24,
      metalness: 0.75,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x9df8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.bones = BONE_DEFS.map((def) => {
      const material = def.torso ? this.torsoMaterial : this.boneMaterial;
      const mesh = new THREE.Mesh(boneGeometry, material);
      mesh.frustumCulled = false;
      this.bodyGroup.add(mesh);

      const glow = new THREE.Mesh(boneGeometry, this.boneGlowMaterial);
      glow.frustumCulled = false;
      this.bodyGroup.add(glow);

      const wire = def.torso ? new THREE.Mesh(boneGeometry, this.wireMaterial) : null;
      if (wire) {
        wire.frustumCulled = false;
        this.bodyGroup.add(wire);
      }

      return { ...def, mesh, glow, wire };
    });

    const sphereGeometry = new THREE.SphereGeometry(1, 12, 10);
    this.jointMaterial = new THREE.MeshBasicMaterial({ color: 0xa9fbff });
    this.joints = JOINT_DEFS.map((def) => {
      const mesh = new THREE.Mesh(sphereGeometry, this.jointMaterial);
      mesh.scale.setScalar(def.r);
      mesh.frustumCulled = false;
      this.bodyGroup.add(mesh);
      return { ...def, mesh };
    });

    this.jointGlowPositions = new Float32Array(JOINT_DEFS.length * 3);
    const jointGlowGeo = new THREE.BufferGeometry();
    jointGlowGeo.setAttribute('position', new THREE.BufferAttribute(this.jointGlowPositions, 3));
    this.jointGlow = new THREE.Points(jointGlowGeo, glowPointMaterial(0x8ef8ff, 0.09, 0.5));
    this.jointGlow.frustumCulled = false;
    this.bodyGroup.add(this.jointGlow);

    // Chest and pelvis volumes give the skeleton a body silhouette.
    const torsoGeometry = makeTorsoGeometry();
    this.chest = new THREE.Mesh(torsoGeometry, this.torsoMaterial);
    this.chest.frustumCulled = false;
    this.bodyGroup.add(this.chest);

    this.chestWire = new THREE.Mesh(torsoGeometry, this.wireMaterial);
    this.chestWire.frustumCulled = false;
    this.bodyGroup.add(this.chestWire);

    this.pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), this.torsoMaterial);
    this.pelvis.frustumCulled = false;
    this.bodyGroup.add(this.pelvis);

    this.pelvisWire = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), this.wireMaterial);
    this.pelvisWire.frustumCulled = false;
    this.bodyGroup.add(this.pelvisWire);

    this.headGroup = new THREE.Group();
    this.bodyGroup.add(this.headGroup);

    const headGeo = new THREE.IcosahedronGeometry(1, 1);
    this.headMesh = new THREE.Mesh(
      headGeo,
      new THREE.MeshStandardMaterial({
        color: 0x0a1e28,
        emissive: new THREE.Color(0x14707f),
        emissiveIntensity: 0.35,
        metalness: 0.7,
        roughness: 0.28,
        flatShading: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.headMesh.frustumCulled = false;
    this.headMesh.renderOrder = 0;
    this.headGroup.add(this.headMesh);

    this.headWireMaterial = new THREE.MeshBasicMaterial({
      color: 0x7cecff,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.headWire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), this.headWireMaterial);
    this.headWire.frustumCulled = false;
    this.headWire.renderOrder = 1;
    this.headGroup.add(this.headWire);

    this.headHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.007, 4, 96),
      new THREE.MeshBasicMaterial({
        color: 0xa78bfa,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.headHalo.rotation.x = Math.PI / 2;
    this.headGroup.add(this.headHalo);

    this.headHalo2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.005, 4, 96),
      new THREE.MeshBasicMaterial({
        color: 0x5ff5ff,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.headHalo2.rotation.set(Math.PI / 2.4, 0.4, 0);
    this.headGroup.add(this.headHalo2);
  }

  buildHandsAndFeet() {
    this.handL = new HandRig(0xff5ecf);
    this.handR = new HandRig(0xff5ecf);
    this.scene.add(this.handL.group, this.handR.group);

    this.footL = new FootRig(0xb8ff5c);
    this.footR = new FootRig(0xb8ff5c);
    this.scene.add(this.footL.group, this.footR.group);
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  setFaceConnections(connections) {
    this.faceRig.setConnections(connections);
  }

  setLayer(name, visible) {
    if (!(name in this.layerVisibility)) return;
    this.layerVisibility[name] = visible;
    if (name === 'particles') this.particles.visible = visible;
    if (name === 'ground') this.groundGroup.visible = visible;
    if (name === 'body') this.bodyGroup.visible = visible;
    if (name === 'hands') {
      this.handL.group.visible = visible && this.handL.group.visible;
      this.handR.group.visible = visible && this.handR.group.visible;
    }
    if (name === 'feet') {
      this.footL.group.visible = visible && this.footL.group.visible;
      this.footR.group.visible = visible && this.footR.group.visible;
    }
    if (name === 'face') this.faceRig.group.visible = visible && this.faceRig.group.visible;
  }

  resetView() {
    this.hasInteracted = false;
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    if (!this.hasInteracted) {
      const portrait = this.camera.aspect < 0.82;
      this.camera.position.set(0, portrait ? 0.16 : 0.12, portrait ? 6.25 : 3.5);
      this.controls.target.set(0, portrait ? 0.04 : 0.02, 0);
      this.controls.update();
    }
  }

  update(frame, dt, time) {
    if (frame.mode !== this.lastMode) {
      this.poseFilter.reset();
      this.lastMode = frame.mode;
    }

    const world = frame.pose?.world;
    if (world) {
      this.lastPoseTime = time;
      const smooth = this.poseFilter.filter(world, time);
      this.updateBody(smooth, frame, dt, time);
    } else if (time - this.lastPoseTime > 0.55) {
      this.bodyGroup.visible = false;
      this.handL.group.visible = false;
      this.handR.group.visible = false;
      this.footL.group.visible = false;
      this.footR.group.visible = false;
    }

    this.updateHands(frame);
    this.updateFeet(frame);
    this.updateFace(frame, time);
    this.updateEnvironment(dt, time, frame);

    this.bodyGroup.visible = this.layerVisibility.body && !!world;
    if (!this.layerVisibility.hands) {
      this.handL.group.visible = false;
      this.handR.group.visible = false;
    }
    if (!this.layerVisibility.feet) {
      this.footL.group.visible = false;
      this.footR.group.visible = false;
    }
    if (!this.layerVisibility.face) this.faceRig.group.visible = false;
  }

  updateBody(points, frame, dt, time) {
    const p = this.rigPoints;
    for (let i = 0; i < 33; i++) {
      const src = points[i];
      const dst = p[i];
      dst.x = src.x;
      dst.y = src.y;
      dst.z = src.z;
    }

    const hipMid = midpoint(p[23], p[24]);
    const shoulderMid = midpoint(p[11], p[12]);
    p[33].x = hipMid.x;
    p[33].y = hipMid.y;
    p[33].z = hipMid.z;
    p[34].x = shoulderMid.x;
    p[34].y = shoulderMid.y;
    p[34].z = shoulderMid.z;

    const earMid = midpoint(p[7], p[8]);
    const shoulderToHead = this._v1.set(
      earMid.x - shoulderMid.x,
      earMid.y - shoulderMid.y,
      earMid.z - shoulderMid.z,
    );
    if (shoulderToHead.lengthSq() < 1e-5) shoulderToHead.set(0, 1, 0);
    shoulderToHead.normalize();

    const earDistance = vecDistance(p[7], p[8]);
    this.headRadius = clamp(earDistance * 0.78, 0.078, 0.155);

    const headCenter = this._v2.set(
      earMid.x + shoulderToHead.x * this.headRadius * 0.05,
      earMid.y + shoulderToHead.y * this.headRadius * 0.05,
      earMid.z + shoulderToHead.z * this.headRadius * 0.05,
    );
    p[35].x = headCenter.x;
    p[35].y = headCenter.y;
    p[35].z = headCenter.z;

    // Neck ends at the base of the skull rather than the head centre, so the
    // collar bone and its glow never cover the face mesh.
    p[36].x = headCenter.x - shoulderToHead.x * this.headRadius * 0.95;
    p[36].y = headCenter.y - shoulderToHead.y * this.headRadius * 0.95;
    p[36].z = headCenter.z - shoulderToHead.z * this.headRadius * 0.95;

    // Head basis: local +X points to image right, +Y is up, +Z faces the camera.
    const xAxis = this._v1.set(p[8].x - p[7].x, p[8].y - p[7].y, p[8].z - p[7].z);
    if (xAxis.lengthSq() < 1e-5) xAxis.set(1, 0, 0);
    xAxis.normalize();
    const upHint = this._v3.set(
      earMid.x - shoulderMid.x,
      earMid.y - shoulderMid.y,
      earMid.z - shoulderMid.z,
    );
    if (upHint.lengthSq() < 1e-5) upHint.set(0, 1, 0);
    upHint.normalize();

    const zAxis = new THREE.Vector3().crossVectors(xAxis, upHint);
    if (zAxis.lengthSq() < 1e-5) zAxis.set(0, 0, 1);
    zAxis.normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

    this._m.makeBasis(xAxis, yAxis, zAxis);
    this.headTargetQuaternion.setFromRotationMatrix(this._m);

    const posLambda = 1 - Math.exp(-24 * dt);
    const rotLambda = 1 - Math.exp(-20 * dt);
    this.headPosition.lerp(headCenter, posLambda);
    this.headQuaternion.slerp(this.headTargetQuaternion, rotLambda);

    this.headGroup.position.copy(this.headPosition);
    this.headGroup.quaternion.copy(this.headQuaternion);
    this.headMesh.scale.setScalar(this.headRadius);
    this.headWire.scale.setScalar(this.headRadius * 1.005);
    this.headHalo.scale.setScalar(this.headRadius);
    this.headHalo2.scale.setScalar(this.headRadius);
    this.headVisible = true;

    // Bones.
    for (const bone of this.bones) {
      const a = p[bone.a];
      const b = p[bone.b];
      this._v1.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = this._v1.length();
      if (len < 1e-4) {
        bone.mesh.visible = false;
        bone.glow.visible = false;
        if (bone.wire) bone.wire.visible = false;
        continue;
      }
      bone.mesh.visible = true;
      bone.glow.visible = true;
      if (bone.wire) bone.wire.visible = true;

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const midZ = (a.z + b.z) / 2;
      this._q.setFromUnitVectors(UP, this._v1.normalize());

      const sx = bone.torso ? bone.r * 1.42 : bone.r;
      const sz = bone.torso ? bone.r * 0.86 : bone.r;

      bone.mesh.position.set(midX, midY, midZ);
      bone.mesh.quaternion.copy(this._q);
      bone.mesh.scale.set(sx, len, sz);

      bone.glow.position.set(midX, midY, midZ);
      bone.glow.quaternion.copy(this._q);
      bone.glow.scale.set(sx * 1.9, len, sz * 1.9);

      if (bone.wire) {
        bone.wire.position.set(midX, midY, midZ);
        bone.wire.quaternion.copy(this._q);
        bone.wire.scale.set(sx * 1.01, len, sz * 1.01);
      }
    }

    // Joints.
    for (let i = 0; i < this.joints.length; i++) {
      const joint = this.joints[i];
      const src = p[joint.i];
      joint.mesh.position.set(src.x, src.y, src.z);
      this.jointGlowPositions[i * 3] = src.x;
      this.jointGlowPositions[i * 3 + 1] = src.y;
      this.jointGlowPositions[i * 3 + 2] = src.z;
    }
    this.jointGlow.geometry.getAttribute('position').needsUpdate = true;

    // Chest + pelvis.
    const torsoDir = this._v2.set(
      shoulderMid.x - hipMid.x,
      shoulderMid.y - hipMid.y,
      shoulderMid.z - hipMid.z,
    );
    const torsoLength = Math.max(0.2, torsoDir.length());
    if (torsoDir.lengthSq() < 1e-5) torsoDir.set(0, 1, 0);
    this._q.setFromUnitVectors(UP, torsoDir.normalize());

    const shoulderWidth = vecDistance(p[11], p[12]);
    const torsoWidth = clamp(shoulderWidth * 0.78, 0.22, 0.34);
    const chestX = (hipMid.x + shoulderMid.x) / 2;
    const chestY = (hipMid.y + shoulderMid.y) / 2;
    const chestZ = (hipMid.z + shoulderMid.z) / 2;
    this.chest.position.set(chestX, chestY, chestZ);
    this.chest.quaternion.copy(this._q);
    this.chest.scale.set(torsoWidth, torsoLength, torsoWidth * 0.56);
    this.chestWire.position.set(chestX, chestY, chestZ);
    this.chestWire.quaternion.copy(this._q);
    this.chestWire.scale.set(torsoWidth * 1.012, torsoLength * 1.004, torsoWidth * 0.566);

    this.pelvis.position.set(hipMid.x, hipMid.y, hipMid.z);
    this.pelvis.quaternion.copy(this._q);
    this.pelvis.scale.set(this.headRadius * 1.08, this.headRadius * 0.72, this.headRadius * 0.86);
    this.pelvisWire.position.copy(this.pelvis.position);
    this.pelvisWire.quaternion.copy(this._q);
    this.pelvisWire.scale.set(
      this.headRadius * 1.092,
      this.headRadius * 0.728,
      this.headRadius * 0.87,
    );

    // Motion energy.
    const motionSamples = [p[15], p[16], p[23], p[24], p[27], p[28]];
    if (this.prevMotion && frame.mode !== 'demo') {
      let total = 0;
      for (let i = 0; i < motionSamples.length; i++) {
        const a = this.prevMotion[i];
        const b = motionSamples[i];
        total += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      }
      const speed = total / Math.max(0.001, dt);
      const target = clamp(speed * 0.65, 0, 1);
      this.motionEnergy = damp(this.motionEnergy, target, 6, dt);
    } else if (frame.metrics?.energy !== undefined) {
      this.motionEnergy = damp(this.motionEnergy, frame.metrics.energy, 5, dt);
    }
    this.prevMotion = motionSamples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
  }

  updateHands(frame) {
    const hands = frame.hands ?? [];
    let left = hands.find((h) => h.handedness === 'Left');
    let right = hands.find((h) => h.handedness === 'Right');
    if (!left && hands.length === 1) left = hands[0];
    if (!right && hands.length === 2 && left === hands[0]) right = hands[1];
    if (left && right && left === right) right = null;

    if (left) this.handL.update(left.world, left.confidence ?? 1, left.demo ? 1.5 : 1);
    else this.handL.group.visible = false;

    if (right) this.handR.update(right.world, right.confidence ?? 1, right.demo ? 1.5 : 1);
    else this.handR.group.visible = false;
  }

  updateFeet(frame) {
    const pose = frame.pose;
    if (!pose?.world) {
      this.footL.group.visible = false;
      this.footR.group.visible = false;
      return;
    }
    const p = this.rigPoints;
    const conf = pose.feetConfidence ?? 1;
    this.footL.update(p[27], p[29], p[31], conf);
    this.footR.update(p[28], p[30], p[32], conf);
  }

  updateFace(frame, time) {
    if (!frame.face || !frame.pose?.world || !this.headVisible) {
      this.faceRig.group.visible = false;
      return;
    }
    this.faceRig.update(frame.face, this.headRadius, time);
  }

  updateEnvironment(dt, time, frame) {
    if (frame.mode === 'demo' && frame.metrics?.energy !== undefined) {
      this.motionEnergy = damp(this.motionEnergy, frame.metrics.energy, 4, dt);
    }

    this.particles.rotation.y += dt * 0.018;
    this.particles.position.y = Math.sin(time * 0.28) * 0.03;

    for (const ring of this.rings) {
      const pulse = 0.5 + 0.5 * Math.sin(time * ring.speed + ring.phase);
      const s = 1 + pulse * 0.025 + this.motionEnergy * 0.02;
      ring.mesh.scale.setScalar(s);
      ring.mesh.material.opacity = ring.opacity * (0.65 + pulse * 0.35 + this.motionEnergy * 0.2);
    }
    if (this.edgeRing) {
      this.edgeRing.material.opacity = 0.25 + 0.15 * Math.sin(time * 1.4) ** 2;
    }
    if (this.groundGlow) {
      this.groundGlow.material.opacity = 0.4 + this.motionEnergy * 0.3;
    }

    this.headHalo.rotation.z += dt * 0.35;
    this.headHalo2.rotation.z -= dt * 0.22;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    const source = this.renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    const scale = canvas.width / 1440;
    ctx.font = `${Math.max(11, Math.round(13 * scale))}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = 'rgba(200, 240, 250, 0.62)';
    ctx.fillText('KINETIC / MOTION LAB', 28 * scale, canvas.height - 26 * scale);
    ctx.textAlign = 'right';
    ctx.fillText('REAL-TIME 3D CAPTURE', canvas.width - 28 * scale, canvas.height - 26 * scale);
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `kinetic-capture-${Date.now()}.png`;
    link.click();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material?.dispose?.();
    });
  }
}
