import * as THREE from 'three';

const TAU = Math.PI * 2;

const V_UP = new THREE.Vector3(0, 1, 0);
const V_DOWN = new THREE.Vector3(0, -1, 0);
const V_FORWARD = new THREE.Vector3(0, 0, 1);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e1 = new THREE.Euler();
const _m1 = new THREE.Matrix4();
const _identity = new THREE.Quaternion();
const _aimV = new THREE.Vector3();
const _aimQ1 = new THREE.Quaternion();
const _aimQ2 = new THREE.Quaternion();
const _w0 = new THREE.Quaternion();
const _w1 = new THREE.Quaternion();
const _w2 = new THREE.Quaternion();
const _w3 = new THREE.Quaternion();
const _w4 = new THREE.Quaternion();
const _w5 = new THREE.Quaternion();
const _w6 = new THREE.Quaternion();
const _basis = { left: new THREE.Vector3(), up: new THREE.Vector3(), forward: new THREE.Vector3() };

function makeLensShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.058, 0.004);
  s.bezierCurveTo(-0.05, 0.037, -0.008, 0.053, 0.032, 0.04);
  s.bezierCurveTo(0.068, 0.026, 0.078, -0.012, 0.045, -0.033);
  s.bezierCurveTo(0.018, -0.05, -0.028, -0.044, -0.05, -0.018);
  s.bezierCurveTo(-0.058, -0.008, -0.059, -0.001, -0.058, 0.004);
  return s;
}

export class Spidey {
  constructor(textures) {
    this.textures = textures;
    this.group = new THREE.Group();
    this.group.name = 'PeterParker';
    this.poseActive = false;
    this.hasFace = false;
    this.demoMode = true;
    this.masked = true;
    this._lastPoseAt = 0;
    this._lastFaceAt = 0;
    this._smooth = 0.075;
    this._breath = 0;

    this.face = {
      yaw: 0, pitch: 0, roll: 0,
      blink: 0, jaw: 0, smile: 0, brow: 0, angry: 0,
    };
    this.faceTarget = { ...this.face };
    this._blend = Object.create(null);

    this._lm = Array.from({ length: 33 }, () => new THREE.Vector3());

    this._buildMaterials();
    this._buildRig();
    this._buildMaskHead();
    this._buildPeterHead();
    this._buildBody();

    this._setMasked(true);
    this.applyIdleTargets(0, 0, 0.01);
  }

  /* ------------------------------------------------------------------ */
  /* Materials                                                           */
  /* ------------------------------------------------------------------ */

  _buildMaterials() {
    const t = this.textures;
    const redMap = t.red.clone();
    redMap.needsUpdate = true;
    redMap.wrapS = redMap.wrapT = THREE.RepeatWrapping;
    redMap.repeat.set(1.7, 1.7);

    const blueMap = t.blue.clone();
    blueMap.needsUpdate = true;
    blueMap.wrapS = blueMap.wrapT = THREE.RepeatWrapping;
    blueMap.repeat.set(1.7, 1.7);

    this.materials = {
      red: new THREE.MeshStandardMaterial({
        map: redMap,
        color: 0xffffff,
        roughness: 0.48,
        metalness: 0.08,
      }),
      blue: new THREE.MeshStandardMaterial({
        map: blueMap,
        color: 0xffffff,
        roughness: 0.62,
        metalness: 0.04,
      }),
      mask: new THREE.MeshStandardMaterial({
        map: t.mask,
        roughness: 0.48,
        metalness: 0.05,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: 0x0a0a0f,
        roughness: 0.5,
        metalness: 0.25,
      }),
      lens: new THREE.MeshStandardMaterial({
        color: 0xe6efff,
        emissive: 0xa9c8ff,
        emissiveIntensity: 0.38,
        roughness: 0.22,
        metalness: 0.3,
        side: THREE.DoubleSide,
      }),
      lensRim: new THREE.MeshStandardMaterial({
        color: 0x05060a,
        roughness: 0.5,
        metalness: 0.05,
        side: THREE.DoubleSide,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: 0xe3b08b,
        roughness: 0.62,
        metalness: 0.02,
      }),
      skinShade: new THREE.MeshStandardMaterial({
        color: 0xcf9673,
        roughness: 0.65,
      }),
      hair: new THREE.MeshStandardMaterial({
        color: 0x2d1c13,
        roughness: 0.82,
        metalness: 0.02,
      }),
      eyeWhite: new THREE.MeshStandardMaterial({
        color: 0xf3efe8,
        roughness: 0.22,
        metalness: 0.0,
      }),
      iris: new THREE.MeshStandardMaterial({
        color: 0x5d3c26,
        roughness: 0.28,
      }),
      pupil: new THREE.MeshBasicMaterial({ color: 0x100c0a }),
      mouth: new THREE.MeshStandardMaterial({
        color: 0x4a201d,
        roughness: 0.7,
      }),
      emblem: new THREE.MeshStandardMaterial({
        map: t.emblem,
        transparent: true,
        alphaTest: 0.35,
        roughness: 0.48,
        metalness: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.DoubleSide,
      }),
      silver: new THREE.MeshStandardMaterial({
        color: 0x9aa6bb,
        roughness: 0.3,
        metalness: 0.8,
      }),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Rig                                                                 */
  /* ------------------------------------------------------------------ */

  _buildRig() {
    this.root = this.group;

    const hips = new THREE.Group();
    hips.position.set(0, 0.92, 0);
    this.group.add(hips);
    this.hips = hips;

    const spine = new THREE.Group();
    spine.position.set(0, 0.035, 0);
    hips.add(spine);
    this.spine = spine;

    const chest = new THREE.Group();
    chest.position.set(0, 0.285, 0);
    spine.add(chest);
    this.chest = chest;

    const neck = new THREE.Group();
    neck.position.set(0, 0.29, 0);
    chest.add(neck);
    this.neck = neck;

    const head = new THREE.Group();
    head.position.set(0, 0.075, 0);
    neck.add(head);
    this.head = head;

    const headTilt = new THREE.Group();
    head.add(headTilt);
    this.headTilt = headTilt;

    this._buildLeg('L', hips, 0.098);
    this._buildLeg('R', hips, -0.098);
    this._buildArm('L', chest, 0.205);
    this._buildArm('R', chest, -0.205);
  }

  _buildLeg(side, parent, x) {
    const sign = side === 'L' ? 1 : -1;
    const hip = new THREE.Group();
    hip.position.set(x, -0.03, 0);
    parent.add(hip);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.082, 0.29, 4, 12),
      this.materials.blue
    );
    thigh.position.y = -0.19;
    thigh.castShadow = false;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.415;
    hip.add(knee);

    const kneeCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.077, 12, 10),
      this.materials.blue
    );
    kneeCap.scale.set(1.02, 0.9, 1.05);
    knee.add(kneeCap);

    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.068, 0.28, 4, 12),
      this.materials.red
    );
    shin.position.y = -0.18;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -0.39;
    knee.add(ankle);

    const foot = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, 0.13, 3, 10),
      this.materials.red
    );
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1.02, 1, 0.92);
    foot.position.set(0, -0.028, 0.068);
    ankle.add(foot);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.018, 0.2),
      this.materials.dark
    );
    sole.position.set(0, -0.06, 0.068);
    ankle.add(sole);

    const bootTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.074, 0.074, 0.035, 14, 1, true),
      this.materials.dark
    );
    bootTrim.position.y = 0.015;
    knee.add(bootTrim);

    this[`hip${side}`] = hip;
    this[`knee${side}`] = knee;
    this[`ankle${side}`] = ankle;
    this[`thigh${side}`] = thigh;
    this[`foot${side}`] = foot;
  }

  _buildArm(side, parent, x) {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.21, 0);
    parent.add(shoulder);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 14, 12),
      this.materials.red
    );
    cap.scale.set(1.03, 0.88, 0.98);
    shoulder.add(cap);

    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.062, 0.2, 4, 12),
      this.materials.blue
    );
    upperArm.position.y = -0.15;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.305;
    shoulder.add(elbow);

    const elbowCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 12, 10),
      this.materials.blue
    );
    elbow.add(elbowCap);

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.056, 0.19, 4, 12),
      this.materials.red
    );
    forearm.position.y = -0.14;
    elbow.add(forearm);

    const wrist = new THREE.Group();
    wrist.position.y = -0.285;
    elbow.add(wrist);

    const shooter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.061, 0.061, 0.025, 14, 1, true),
      this.materials.silver
    );
    shooter.position.y = 0.012;
    wrist.add(shooter);

    const hand = new THREE.Group();
    hand.position.y = -0.012;
    wrist.add(hand);

    const palm = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 10),
      this.materials.red
    );
    palm.scale.set(1, 1.32, 0.62);
    palm.position.y = -0.045;
    hand.add(palm);

    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.015, 0.035, 2, 6),
      this.materials.red
    );
    thumb.position.set(side === 'L' ? -0.04 : 0.04, -0.035, 0.02);
    thumb.rotation.z = side === 'L' ? 0.9 : -0.9;
    thumb.rotation.x = 0.35;
    hand.add(thumb);

    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0095, 0.032, 2, 6),
        this.materials.red
      );
      finger.position.set((i - 1.5) * 0.023, -0.116, 0.004);
      finger.rotation.z = (i - 1.5) * 0.05;
      hand.add(finger);
    }

    this[`shoulder${side}`] = shoulder;
    this[`elbow${side}`] = elbow;
    this[`wrist${side}`] = wrist;
    this[`hand${side}`] = hand;
  }

  _buildBody() {
    // Pelvis + belt.
    const pelvis = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 18, 14),
      this.materials.blue
    );
    pelvis.scale.set(1.0, 0.72, 0.78);
    pelvis.position.y = -0.012;
    this.hips.add(pelvis);

    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.016, 6, 28),
      this.materials.dark
    );
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.8, 1);
    belt.position.y = 0.035;
    this.hips.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.038, 0.02),
      this.materials.silver
    );
    buckle.position.set(0, 0.035, 0.148);
    this.hips.add(buckle);

    // Abdomen.
    const abdomen = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.12, 4, 16),
      this.materials.red
    );
    abdomen.scale.set(0.99, 1, 0.78);
    abdomen.position.y = 0.12;
    this.spine.add(abdomen);

    // Chest.
    const chestMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.183, 0.15, 4, 20),
      this.materials.red
    );
    chestMesh.scale.set(1.08, 1, 0.81);
    chestMesh.position.y = 0.1;
    this.chest.add(chestMesh);
    this.chestMesh = chestMesh;

    // Trapezius bridge between chest and neck.
    const traps = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 18, 12),
      this.materials.red
    );
    traps.scale.set(1.12, 0.42, 0.72);
    traps.position.y = 0.27;
    this.chest.add(traps);

    // Collar.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.077, 0.012, 6, 20),
      this.materials.dark
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.015;
    this.neck.add(collar);

    // Front emblem.
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.205, 0.255),
      this.materials.emblem
    );
    emblem.position.set(0, 0.112, 0.15);
    emblem.rotation.x = -0.045;
    this.chest.add(emblem);

    // Back emblem.
    const backEmblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.19, 0.235),
      this.materials.emblem
    );
    backEmblem.position.set(0, 0.112, -0.15);
    backEmblem.rotation.y = Math.PI;
    backEmblem.rotation.x = 0.045;
    this.chest.add(backEmblem);

    // Neck (suit collar) + skin neck for unmasked mode.
    const suitNeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.078, 0.16, 14),
      this.materials.red
    );
    suitNeck.position.y = 0.075;
    this.neck.add(suitNeck);

    const skinNeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.059, 0.071, 0.16, 14),
      this.materials.skin
    );
    skinNeck.position.y = 0.075;
    this.neck.add(skinNeck);

    this.suitNeck = suitNeck;
    this.skinNeck = skinNeck;
  }

  _buildMaskHead() {
    const g = new THREE.Group();
    this.headTilt.add(g);
    this.maskGroup = g;

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 26, 22),
      this.materials.mask
    );
    skull.scale.set(0.95, 1.07, 0.99);
    skull.position.y = 0.095;
    g.add(skull);

    // Jawline volume.
    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.108, 18, 14),
      this.materials.mask
    );
    jaw.scale.set(0.94, 0.78, 0.92);
    jaw.position.set(0, 0.036, 0.014);
    g.add(jaw);

    const shape = makeLensShape();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.0025,
      bevelSegments: 1,
      steps: 1,
    });
    geo.center();

    const rimGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.006,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.0025,
      bevelSegments: 1,
      steps: 1,
    });
    rimGeo.center();

    this.lenses = {};
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      const holder = new THREE.Group();
      holder.position.set(sign * 0.064, 0.112, 0.132);
      holder.rotation.set(-0.04, sign * 0.4, sign * 0.08);
      holder.userData.baseY = holder.position.y;
      holder.userData.baseRotZ = holder.rotation.z;
      holder.userData.sign = sign;
      g.add(holder);

      const rim = new THREE.Mesh(rimGeo, this.materials.lensRim);
      rim.scale.set(sign * 0.845, 0.83, 1);
      rim.position.z = -0.0025;
      holder.add(rim);

      const lens = new THREE.Mesh(geo, this.materials.lens);
      lens.scale.set(sign * 0.7, 0.7, 1);
      holder.add(lens);

      this.lenses[side] = holder;
    }
  }

  _buildPeterHead() {
    const g = new THREE.Group();
    this.headTilt.add(g);
    this.peterGroup = g;

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 26, 22),
      this.materials.skin
    );
    skull.scale.set(0.95, 1.06, 0.98);
    skull.position.y = 0.095;
    g.add(skull);

    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.108, 18, 14),
      this.materials.skin
    );
    jaw.scale.set(0.93, 0.8, 0.93);
    jaw.position.set(0, 0.03, 0.014);
    g.add(jaw);
    this.peterJaw = jaw;

    // Nose.
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 10, 8),
      this.materials.skinShade
    );
    nose.scale.set(0.8, 1.2, 1.15);
    nose.position.set(0, 0.084, 0.132);
    g.add(nose);

    // Ears.
    for (const sign of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 10, 8),
        this.materials.skin
      );
      ear.scale.set(0.45, 1, 0.72);
      ear.position.set(sign * 0.131, 0.086, 0.012);
      g.add(ear);
    }

    // Eyes.
    this.eyes = {};
    this.brows = {};
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      const eye = new THREE.Group();
      eye.position.set(sign * 0.054, 0.106, 0.118);
      eye.rotation.y = sign * 0.2;
      g.add(eye);

      const white = new THREE.Mesh(
        new THREE.SphereGeometry(0.027, 14, 12),
        this.materials.eyeWhite
      );
      white.scale.set(1.08, 0.82, 0.5);
      eye.add(white);

      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.0115, 14),
        this.materials.iris
      );
      iris.position.set(sign * -0.001, 0.0, 0.0136);
      eye.add(iris);

      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(0.0055, 12),
        this.materials.pupil
      );
      pupil.position.set(sign * -0.001, 0, 0.0144);
      eye.add(pupil);

      this.eyes[side] = eye;

      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.008, 0.012),
        this.materials.hair
      );
      brow.position.set(sign * 0.054, 0.145, 0.122);
      brow.rotation.set(-0.1, sign * 0.22, sign * 0.07);
      brow.userData.baseY = brow.position.y;
      brow.userData.sign = sign;
      g.add(brow);
      this.brows[side] = brow;
    }

    // Mouth.
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 14, 10),
      this.materials.mouth
    );
    mouth.scale.set(1.15, 0.12, 0.3);
    mouth.position.set(0, 0.031, 0.124);
    g.add(mouth);
    this.mouth = mouth;
    this.mouth.userData.baseY = mouth.position.y;

    // Upper teeth reveal as the jaw opens.
    const teeth = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.006, 0.008),
      this.materials.eyeWhite
    );
    teeth.position.set(0, 0.0335, 0.1335);
    g.add(teeth);
    this.teeth = teeth;

    // Lower lip.
    const lip = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 12, 8),
      this.materials.skinShade
    );
    lip.scale.set(1.2, 0.16, 0.3);
    lip.position.set(0, 0.019, 0.128);
    g.add(lip);

    // Hair cap.
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.147, 26, 18, 0, TAU, 0, Math.PI * 0.33),
      this.materials.hair
    );
    hair.scale.set(1.0, 1.03, 1.0);
    hair.position.set(0, 0.098, -0.007);
    hair.rotation.x = -0.09;
    g.add(hair);
    this.hair = hair;

    // Sideburns.
    for (const sign of [-1, 1]) {
      const burn = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.013, 0.032, 2, 6),
        this.materials.hair
      );
      burn.position.set(sign * 0.122, 0.112, 0.043);
      g.add(burn);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mode                                                                */
  /* ------------------------------------------------------------------ */

  _setMasked(masked) {
    this.masked = masked;
    this.maskGroup.visible = masked;
    this.peterGroup.visible = !masked;
    this.suitNeck.visible = masked;
    this.skinNeck.visible = !masked;
  }

  setMasked(masked) {
    this._setMasked(masked);
  }

  toggleMasked() {
    this._setMasked(!this.masked);
    return this.masked;
  }

  setDemo(demo) {
    this.demoMode = demo;
    if (demo) {
      this.poseActive = false;
      this.hasFace = false;
    }
  }

  setSmoothing(value) {
    this._smooth = Math.max(0.02, Math.min(0.25, value));
  }

  /* ------------------------------------------------------------------ */
  /* Pose tracking                                                       */
  /* ------------------------------------------------------------------ */

  applyPose(worldLandmarks, { mirror = true, dt = 1 / 30 } = {}) {
    if (!worldLandmarks || worldLandmarks.length < 29) return false;

    const vis = (i) => worldLandmarks[i]?.visibility ?? 1;
    if (vis(11) < 0.25 || vis(12) < 0.25 || vis(23) < 0.25 || vis(24) < 0.25) {
      return false;
    }

    const lm = this._lm;
    for (let i = 0; i < 33; i++) {
      const p = worldLandmarks[i];
      if (!p) {
        lm[i].set(0, 0, 0);
        continue;
      }
      lm[i].set(mirror ? -p.x : p.x, -p.y, -p.z);
    }

    const shL = mirror ? 12 : 11;
    const shR = mirror ? 11 : 12;
    const elL = mirror ? 14 : 13;
    const elR = mirror ? 13 : 14;
    const wrL = mirror ? 16 : 15;
    const wrR = mirror ? 15 : 16;
    const hipL = mirror ? 24 : 23;
    const hipR = mirror ? 23 : 24;
    const knL = mirror ? 26 : 25;
    const knR = mirror ? 25 : 26;
    const anL = mirror ? 28 : 27;
    const anR = mirror ? 27 : 28;
    const ftL = mirror ? 32 : 31;
    const ftR = mirror ? 31 : 32;
    const hdL = mirror ? 21 : 18;
    const hdR = mirror ? 18 : 21;

    const alpha = 1 - Math.exp(-dt / this._smooth);

    // Torso basis: character-left, up, forward.
    _v1.copy(lm[shL]).sub(lm[shR]);
    if (_v1.lengthSq() < 1e-7) _v1.set(1, 0, 0);
    _v1.normalize();
    _v2.copy(lm[shL]).add(lm[shR]).multiplyScalar(0.5);
    _v3.copy(lm[hipL]).add(lm[hipR]).multiplyScalar(0.5);
    const up = _v4.copy(_v2).sub(_v3);
    if (up.lengthSq() < 1e-7) up.set(0, 1, 0);
    up.normalize();

    _v1.addScaledVector(up, -_v1.dot(up));
    if (_v1.lengthSq() < 1e-7) _v1.set(1, 0, 0);
    _v1.normalize();
    const forward = _basis.forward.copy(_v1).cross(up).normalize();
    const basisLeft = _basis.left.copy(_v1);
    _m1.makeBasis(basisLeft, up, forward);
    _q1.setFromRotationMatrix(_m1);
    this.hips.quaternion.slerp(_q1, alpha);
    const rootWorld = _w0.copy(this.hips.quaternion);

    // Hip translation (kept subtle so the character stays framed).
    const swayX = THREE.MathUtils.clamp((lm[hipL].x + lm[hipR].x) * 0.5, -1, 1) * 0.32;
    const swayZ = THREE.MathUtils.clamp(-(lm[hipL].z + lm[hipR].z) * 0.5, -1, 1) * 0.16;
    this.hips.position.x += (swayX - this.hips.position.x) * alpha;
    this.hips.position.z += (swayZ - this.hips.position.z) * alpha;

    // Spine / chest / neck.
    const spineWorld = this._aim(this.spine, up, rootWorld, V_UP, alpha, _w1);
    const chestWorld = this._aim(this.chest, up, spineWorld, V_UP, alpha, _w2);

    const eyeMid = _v1.copy(lm[2]).add(lm[5]).multiplyScalar(0.5);
    const shoulderMid = _v2.copy(lm[shL]).add(lm[shR]).multiplyScalar(0.5);
    const headDir = _v3.copy(eyeMid).sub(shoulderMid);
    if (headDir.lengthSq() < 1e-7) headDir.copy(up);
    headDir.normalize();

    const neckWorld = this._aim(this.neck, headDir, chestWorld, V_UP, alpha, _w3);
    this._aim(this.head, headDir, neckWorld, V_UP, alpha, _w6);

    // Arms.
    const shoulderLWorld = this._aim(
      this.shoulderL,
      this._dir(_v1.copy(lm[elL]).sub(lm[shL]), V_DOWN),
      chestWorld,
      V_DOWN,
      alpha,
      _w4
    );
    const elbowLWorld = this._aim(
      this.elbowL,
      this._dir(_v1.copy(lm[wrL]).sub(lm[elL]), V_DOWN),
      shoulderLWorld,
      V_DOWN,
      alpha,
      _w5
    );
    this._aim(
      this.handL,
      this._dir(_v1.copy(lm[hdL]).sub(lm[wrL]), V_DOWN),
      elbowLWorld,
      V_DOWN,
      alpha,
      _w6
    );

    const shoulderRWorld = this._aim(
      this.shoulderR,
      this._dir(_v1.copy(lm[elR]).sub(lm[shR]), V_DOWN),
      chestWorld,
      V_DOWN,
      alpha,
      _w4
    );
    const elbowRWorld = this._aim(
      this.elbowR,
      this._dir(_v1.copy(lm[wrR]).sub(lm[elR]), V_DOWN),
      shoulderRWorld,
      V_DOWN,
      alpha,
      _w5
    );
    this._aim(
      this.handR,
      this._dir(_v1.copy(lm[hdR]).sub(lm[wrR]), V_DOWN),
      elbowRWorld,
      V_DOWN,
      alpha,
      _w6
    );

    // Legs.
    const hipLWorld = this._aim(
      this.hipL,
      this._dir(_v1.copy(lm[knL]).sub(lm[hipL]), V_DOWN),
      rootWorld,
      V_DOWN,
      alpha,
      _w4
    );
    const kneeLWorld = this._aim(
      this.kneeL,
      this._dir(_v1.copy(lm[anL]).sub(lm[knL]), V_DOWN),
      hipLWorld,
      V_DOWN,
      alpha,
      _w5
    );
    this._aim(
      this.ankleL,
      this._dir(_v1.copy(lm[ftL]).sub(lm[anL]), V_FORWARD),
      kneeLWorld,
      V_FORWARD,
      alpha,
      _w6
    );

    const hipRWorld = this._aim(
      this.hipR,
      this._dir(_v1.copy(lm[knR]).sub(lm[hipR]), V_DOWN),
      rootWorld,
      V_DOWN,
      alpha,
      _w4
    );
    const kneeRWorld = this._aim(
      this.kneeR,
      this._dir(_v1.copy(lm[anR]).sub(lm[knR]), V_DOWN),
      hipRWorld,
      V_DOWN,
      alpha,
      _w5
    );
    this._aim(
      this.ankleR,
      this._dir(_v1.copy(lm[ftR]).sub(lm[anR]), V_FORWARD),
      kneeRWorld,
      V_FORWARD,
      alpha,
      _w6
    );

    this.poseActive = true;
    this._lastPoseAt = performance.now();
    return true;
  }

  _dir(target, fallback) {
    if (target.lengthSq() < 1e-8) return _v2.copy(fallback);
    return target.normalize();
  }

  _aim(bone, targetWorld, parentWorld, restDir, alpha, out) {
    _aimV.copy(targetWorld).applyQuaternion(_aimQ1.copy(parentWorld).invert());
    if (_aimV.lengthSq() < 1e-8) {
      _aimQ2.copy(_identity);
    } else {
      _aimV.normalize();
      _aimQ2.setFromUnitVectors(restDir, _aimV);
    }
    bone.quaternion.slerp(_aimQ2, alpha);
    return out.copy(parentWorld).multiply(bone.quaternion);
  }

  /* ------------------------------------------------------------------ */
  /* Face tracking                                                       */
  /* ------------------------------------------------------------------ */

  applyFace(landmarks, blendShapes, { mirror = true, dt = 1 / 30 } = {}) {
    if (!landmarks || landmarks.length < 400) return false;

    const a = landmarks[33];
    const b = landmarks[263];
    const nose = landmarks[1];
    if (!a || !b || !nose) return false;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const eyeDist = Math.max(1e-4, Math.hypot(dx, dy));
    const midX = (a.x + b.x) * 0.5;
    const midY = (a.y + b.y) * 0.5;

    let yaw = ((nose.x - midX) / eyeDist) * 0.95;
    let pitch = ((nose.y - midY) / eyeDist - 0.42) * 0.85;
    let roll = Math.atan2(dy, dx);
    if (mirror) {
      yaw = -yaw;
      roll = -roll;
    }

    const t = this.faceTarget;
    t.yaw = THREE.MathUtils.clamp(yaw, -0.72, 0.72);
    t.pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
    t.roll = THREE.MathUtils.clamp(roll * 0.55, -0.42, 0.42);

    const map = this._blend;
    for (const key in map) map[key] = 0;
    if (blendShapes) {
      for (const cat of blendShapes) {
        map[cat.categoryName] = cat.score;
      }
    }

    const blink = ((map.eyeBlinkLeft || 0) + (map.eyeBlinkRight || 0)) * 0.5;
    const jaw = map.jawOpen || 0;
    const smile = ((map.mouthSmileLeft || 0) + (map.mouthSmileRight || 0)) * 0.5;
    const brow = map.browInnerUp || 0;
    const angry = ((map.browDownLeft || 0) + (map.browDownRight || 0)) * 0.5;

    t.blink = THREE.MathUtils.clamp(blink, 0, 1);
    t.jaw = THREE.MathUtils.clamp(jaw * 1.25, 0, 1);
    t.smile = THREE.MathUtils.clamp(smile, 0, 1);
    t.brow = THREE.MathUtils.clamp(brow, 0, 1);
    t.angry = THREE.MathUtils.clamp(angry, 0, 1);

    this.hasFace = true;
    this._lastFaceAt = performance.now();
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Idle / procedural demo                                              */
  /* ------------------------------------------------------------------ */

  applyIdleTargets(t, amplitude = 1, alpha = 1) {
    const s = Math.sin;
    const amp = amplitude;
    const a = alpha;

    const q = (bone, x, y, z) => {
      _e1.set(x, y, z, 'XYZ');
      _q1.setFromEuler(_e1);
      bone.quaternion.slerp(_q1, a);
    };

    q(this.hips, 0, s(t * 0.3) * 0.075 * amp, 0);
    q(this.spine, s(t * 1.05) * 0.017 * amp, s(t * 0.42) * 0.02 * amp, s(t * 0.55) * 0.012 * amp);
    q(this.chest, s(t * 1.05 + 0.4) * 0.014 * amp, s(t * 0.36) * 0.03 * amp, 0);

    q(this.shoulderL, -0.02 + s(t * 0.85) * 0.05 * amp, 0, 0.13 + s(t * 0.7) * 0.03 * amp);
    q(this.elbowL, -0.2 - s(t * 0.85 + 0.6) * 0.045 * amp, 0, 0);

    q(this.shoulderR, -0.01 + s(t * 0.8 + 1.1) * 0.05 * amp, 0, -0.13 - s(t * 0.66 + 1.2) * 0.03 * amp);
    q(this.elbowR, -0.19 - s(t * 0.8 + 1.5) * 0.04 * amp, 0, 0);

    q(this.hipL, -0.025 + s(t * 0.5) * 0.012 * amp, 0, 0.012);
    q(this.kneeL, 0.055 + s(t * 0.5 + 0.5) * 0.012 * amp, 0, 0);
    q(this.ankleL, -0.03, 0, 0);

    q(this.hipR, -0.025 - s(t * 0.5) * 0.012 * amp, 0, -0.012);
    q(this.kneeR, 0.05 + s(t * 0.5 + 1.7) * 0.012 * amp, 0, 0);
    q(this.ankleR, -0.03, 0, 0);

    this.hips.position.x += (0 - this.hips.position.x) * Math.min(1, a);
    this.hips.position.z += (0 - this.hips.position.z) * Math.min(1, a);
  }

  _updateFace(dt, time) {
    const now = performance.now();
    if (this.hasFace && now - this._lastFaceAt > 420) this.hasFace = false;

    const f = this.face;
    const t = this.faceTarget;

    if (this.demoMode) {
      t.yaw = Math.sin(time * 0.36) * 0.32;
      t.pitch = 0.035 + Math.sin(time * 0.83) * 0.035;
      t.roll = Math.sin(time * 0.52 + 1.2) * 0.045;

      const blinkCycle = time % 4.6;
      t.blink = blinkCycle < 0.14 ? Math.sin((blinkCycle / 0.14) * Math.PI) : 0;
      t.jaw = 0.02 + 0.02 * Math.max(0, Math.sin(time * 0.55));
      t.smile = 0.42 + 0.12 * Math.max(0, Math.sin(time * 0.33 + 0.4));
      t.brow = 0.02;
      t.angry = 0;
    } else if (!this.hasFace) {
      t.yaw += (Math.sin(time * 0.31) * 0.05 - t.yaw) * Math.min(1, dt * 2);
      t.pitch += (0 - t.pitch) * Math.min(1, dt * 2);
      t.roll += (0 - t.roll) * Math.min(1, dt * 2);
      t.blink += (0 - t.blink) * Math.min(1, dt * 5);
      t.jaw += (0 - t.jaw) * Math.min(1, dt * 5);
      t.smile += (0 - t.smile) * Math.min(1, dt * 5);
      t.brow += (0 - t.brow) * Math.min(1, dt * 5);
      t.angry += (0 - t.angry) * Math.min(1, dt * 5);
    }

    const k = 1 - Math.exp(-dt * 16);
    f.yaw += (t.yaw - f.yaw) * k;
    f.pitch += (t.pitch - f.pitch) * k;
    f.roll += (t.roll - f.roll) * k;
    f.blink += (t.blink - f.blink) * k;
    f.jaw += (t.jaw - f.jaw) * k;
    f.smile += (t.smile - f.smile) * k;
    f.brow += (t.brow - f.brow) * k;
    f.angry += (t.angry - f.angry) * k;

    _e1.set(f.pitch, f.yaw, f.roll, 'YXZ');
    _q1.setFromEuler(_e1);
    this.headTilt.quaternion.copy(_q1);

    this._applyExpressions(f);
  }

  _applyExpressions(f) {
    const blink = THREE.MathUtils.clamp(f.blink, 0, 1);
    const jaw = THREE.MathUtils.clamp(f.jaw, 0, 1);
    const smile = THREE.MathUtils.clamp(f.smile, 0, 1);
    const angry = THREE.MathUtils.clamp(f.angry, 0, 1);
    const brow = THREE.MathUtils.clamp(f.brow, 0, 1);

    if (this.masked) {
      const squash = Math.max(0.06, 1 - blink * 0.87 - angry * 0.16);
      for (const side of ['L', 'R']) {
        const holder = this.lenses[side];
        const sign = holder.userData.sign;
        holder.scale.y = squash;
        holder.scale.x = 1 + smile * 0.05;
        holder.rotation.z = holder.userData.baseRotZ + (angry * 0.2 + brow * 0.07) * sign;
        holder.position.y = holder.userData.baseY - (1 - squash) * 0.012;
      }
    } else {
      for (const side of ['L', 'R']) {
        const eye = this.eyes[side];
        eye.scale.y = Math.max(0.09, 1 - blink * 0.92 - smile * 0.08);

        const browMesh = this.brows[side];
        const sign = browMesh.userData.sign;
        browMesh.position.y = browMesh.userData.baseY + brow * 0.013 - angry * 0.012 + smile * 0.004;
        browMesh.rotation.z = sign * 0.07 + sign * angry * 0.26 - sign * brow * 0.12;
      }

      this.mouth.scale.set(1.15 + smile * 0.28, 0.12 + jaw * 0.6, 0.3);
      this.mouth.position.y = this.mouth.userData.baseY - smile * 0.003 - jaw * 0.007;
      this.teeth.visible = jaw > 0.05;
      this.teeth.scale.y = 0.5 + jaw * 1.1;
      this.peterJaw.scale.y = 0.8 + jaw * 0.06;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Frame update                                                        */
  /* ------------------------------------------------------------------ */

  update(dt, time) {
    const now = performance.now();
    if (this.poseActive && now - this._lastPoseAt > 420) {
      this.poseActive = false;
    }

    if (!this.poseActive) {
      const amplitude = this.demoMode ? 1 : 0.6;
      this.applyIdleTargets(time, amplitude, 1 - Math.exp(-dt * 6.5));
    }

    this._breath += dt;
    const breath = Math.sin(this._breath * 1.35) * 0.5 + 0.5;
    this.chestMesh.scale.set(1.14 + breath * 0.004, 1 + breath * 0.012, 0.82 + breath * 0.006);

    // Head aim is driven by pose; the tilt layer handles face motion.
    if (!this.poseActive) {
      this.neck.quaternion.slerp(_identity, 1 - Math.exp(-dt * 5));
      this.head.quaternion.slerp(_identity, 1 - Math.exp(-dt * 5));
    }

    this._updateFace(dt, time);
  }

  get expression() {
    return {
      blink: this.face.blink,
      jaw: this.face.jaw,
      smile: this.face.smile,
    };
  }
}
