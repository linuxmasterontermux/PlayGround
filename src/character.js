import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createSuitTexture,
  createBlueSuitTexture,
  createEmblemTexture,
  createSkinTexture,
  createHairTexture,
} from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _e = new THREE.Euler();

function basisQuat(xHint, yDir, out) {
  _y.copy(yDir);
  if (_y.lengthSq() < 1e-8) _y.copy(UP);
  _y.normalize();
  _x.copy(xHint);
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_x.lengthSq() < 1e-8) {
    _x.set(1, 0, 0);
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-8) _x.set(0, 0, 1).addScaledVector(_y, -_y.z);
  }
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function forwardQuat(yDir, forwardHint, out) {
  _y.copy(yDir);
  if (_y.lengthSq() < 1e-8) _y.copy(DOWN);
  _y.normalize();
  _z.copy(forwardHint);
  _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-8) {
    _z.copy(FORWARD);
    _z.addScaledVector(_y, -_z.dot(_y));
    if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  }
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function capsule(radius, length, material, radialSegments = 12) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.01), 4, radialSegments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = length / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Sculpted, tapered limb along +Y with rounded caps. */
function limbMesh(topRadius, bottomRadius, length, material, radialSegments = 14) {
  const profile = [
    [0.001, 0],
    [topRadius * 0.55, 0.006],
    [topRadius, 0.028],
    [topRadius * 1.02, length * 0.16],
    [topRadius * 0.96, length * 0.42],
    [bottomRadius * 1.08, length * 0.7],
    [bottomRadius, length - 0.028],
    [bottomRadius * 0.55, length - 0.006],
    [0.001, length],
  ];
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    radialSegments,
  );
  geo.scale(1, 1, 0.94);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function lathe(profile, segments = 18) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function makeJoint(parent, name, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export class SpiderCharacter {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SpiderCharacter';
    this.root = new THREE.Group();
    this.root.name = 'CharacterRoot';
    this.group.add(this.root);

    this.maskGroup = new THREE.Group();
    this.faceGroup = new THREE.Group();
    this.faceGroup.visible = false;
    this.masked = true;

    this.bones = {};
    this.smoothQuats = new Map();
    this.smoothRoot = new THREE.Vector3(0, 0.92, 0);
    this.smoothFace = {
      yaw: 0, pitch: 0, roll: 0, jaw: 0, smile: 0, brow: 0,
      blinkL: 0, blinkR: 0, squint: 0,
    };
    this.faceSmoothed = { ...this.smoothFace };
    this.groundOffset = 0;
    this.idleT = 0;
    this.ready = false;

    this._makeMaterials();
    this._buildRig();
    this._buildSuit();
    this._buildMaskedHead();
    this._buildFace();
    this._buildSkeletonOverlay();
    this.setMasked(true);
  }

  _makeMaterials() {
    const suitTex = createSuitTexture();
    const blueTex = createBlueSuitTexture();
    const skinTex = createSkinTexture();
    const hairTex = createHairTexture();

    this.materials = {
      suit: new THREE.MeshStandardMaterial({
        map: suitTex, color: 0xffffff, roughness: 0.56, metalness: 0.1, envMapIntensity: 0.6,
      }),
      suitDark: new THREE.MeshStandardMaterial({
        map: suitTex, color: 0x8d8d8d, roughness: 0.62, metalness: 0.1, envMapIntensity: 0.5,
      }),
      blue: new THREE.MeshStandardMaterial({
        map: blueTex, color: 0xffffff, roughness: 0.6, metalness: 0.12, envMapIntensity: 0.55,
      }),
      black: new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 0.38, metalness: 0.35, envMapIntensity: 0.9 }),
      lens: new THREE.MeshStandardMaterial({
        color: 0xf2f7ff, emissive: 0x9fc9ee, emissiveIntensity: 0.22,
        roughness: 0.2, metalness: 0.3, envMapIntensity: 1.2,
      }),
      lensRim: new THREE.MeshStandardMaterial({ color: 0x050609, roughness: 0.3, metalness: 0.5 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe9eef8, roughness: 0.3, metalness: 0.5 }),
      skin: new THREE.MeshStandardMaterial({
        map: skinTex, color: 0xffffff, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.35,
      }),
      hair: new THREE.MeshStandardMaterial({
        map: hairTex, color: 0x857064, roughness: 0.72, metalness: 0.05,
      }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.24, metalness: 0.02 }),
      iris: new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.28, metalness: 0.05 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 0.18, metalness: 0.05 }),
      lip: new THREE.MeshStandardMaterial({ color: 0x9d5b52, roughness: 0.5, metalness: 0.02 }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x2b0e12, roughness: 0.8, metalness: 0 }),
      brow: new THREE.MeshStandardMaterial({ color: 0x3a2419, roughness: 0.7, metalness: 0 }),
      sole: new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.72, metalness: 0.1 }),
      emblem: new THREE.MeshStandardMaterial({
        map: createEmblemTexture(), transparent: true, alphaTest: 0.06,
        roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2,
      }),
      emblemSmall: new THREE.MeshStandardMaterial({
        map: createEmblemTexture({ elongate: 0.85 }), transparent: true, alphaTest: 0.06,
        roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2,
      }),
    };
  }

  _buildRig() {
    const b = this.bones;
    b.hips = makeJoint(this.root, 'hips', 0, 0.92, 0);
    b.spine = makeJoint(b.hips, 'spine', 0, 0.055, 0);
    b.chest = makeJoint(b.spine, 'chest', 0, 0.20, 0);
    b.neck = makeJoint(b.chest, 'neck', 0, 0.235, 0);
    b.head = makeJoint(b.neck, 'head', 0, 0.075, 0);

    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      b['shoulder' + S] = makeJoint(b.chest, 'shoulder' + S, 0.172 * side, 0.202, 0);
      b['forearm' + S] = makeJoint(b['shoulder' + S], 'forearm' + S, 0, 0.285, 0);
      b['hand' + S] = makeJoint(b['forearm' + S], 'hand' + S, 0, 0.262, 0);
      b['thigh' + S] = makeJoint(b.hips, 'thigh' + S, 0.102 * side, -0.015, 0);
      b['shin' + S] = makeJoint(b['thigh' + S], 'shin' + S, 0, 0.435, 0);
      b['foot' + S] = makeJoint(b['shin' + S], 'foot' + S, 0, 0.435, 0);
      b['toe' + S] = makeJoint(b['foot' + S], 'toe' + S, 0, 0.205, -0.01);
    }
  }

  _buildSuit() {
    const M = this.materials;
    const b = this.bones;

    // Pelvis / belt.
    const pelvisGeo = lathe([
      [0.001, -0.10], [0.11, -0.095], [0.15, -0.045], [0.152, 0.02], [0.135, 0.07], [0.001, 0.085],
    ], 20);
    pelvisGeo.scale(1.22, 1, 0.8);
    const pelvis = new THREE.Mesh(pelvisGeo, M.blue);
    pelvis.position.y = 0.0;
    pelvis.castShadow = true;
    pelvis.receiveShadow = true;
    b.hips.add(pelvis);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.162, 0.045, 20), M.suit);
    belt.scale.set(1.2, 1, 0.82);
    belt.position.y = 0.055;
    belt.castShadow = true;
    b.hips.add(belt);

    const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.032, 0.014, 2, 0.004), M.black);
    buckle.position.set(0, 0.055, 0.121);
    b.hips.add(buckle);

    // Abdomen.
    const abdomenGeo = lathe([
      [0.001, 0], [0.105, 0.004], [0.122, 0.055], [0.132, 0.13], [0.137, 0.2], [0.001, 0.21],
    ], 20);
    abdomenGeo.scale(1.13, 1, 0.72);
    const abdomen = new THREE.Mesh(abdomenGeo, M.suit);
    abdomen.position.y = 0;
    abdomen.castShadow = true;
    abdomen.receiveShadow = true;
    b.spine.add(abdomen);

    // Chest.
    const chestGeo = lathe([
      [0.001, 0], [0.13, 0.012], [0.158, 0.07], [0.176, 0.14], [0.168, 0.195], [0.118, 0.235], [0.001, 0.247],
    ], 22);
    chestGeo.scale(1.09, 1, 0.69);
    const chest = new THREE.Mesh(chestGeo, M.suit);
    chest.castShadow = true;
    chest.receiveShadow = true;
    b.chest.add(chest);

    // Pectoral definition.
    for (const side of [1, -1]) {
      const pec = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.suit);
      pec.scale.set(0.066, 0.05, 0.019);
      pec.position.set(0.064 * side, 0.163, 0.103);
      pec.castShadow = true;
      b.chest.add(pec);
    }

    // Traps.
    for (const side of [1, -1]) {
      const trap = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), M.suit);
      trap.scale.set(0.072, 0.024, 0.044);
      trap.position.set(0.078 * side, 0.231, 0.005);
      b.chest.add(trap);
    }

    // Emblems.
    const emblemPlane = (() => {
      const geo = new THREE.PlaneGeometry(1, 1, 8, 8);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, -x * x * 0.12);
      }
      geo.computeVertexNormals();
      return geo;
    })();
    const front = new THREE.Mesh(emblemPlane, M.emblem);
    front.scale.setScalar(0.2);
    front.position.set(0, 0.158, 0.123);
    b.chest.add(front);
    const back = new THREE.Mesh(emblemPlane, M.emblemSmall);
    back.scale.setScalar(0.16);
    back.position.set(0, 0.165, -0.119);
    back.rotation.y = Math.PI;
    b.chest.add(back);

    // Neck.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.1, 12), M.suit);
    neck.position.y = 0.045;
    neck.castShadow = true;
    b.neck.add(neck);

    // Shoulders + arms.
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const shoulder = b['shoulder' + S];

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.071, 14, 10), M.suit);
      cap.scale.set(1.02, 0.94, 1.0);
      cap.position.y = 0.0;
      cap.castShadow = true;
      shoulder.add(cap);

      const upper = limbMesh(0.064, 0.05, 0.285, M.suit);
      shoulder.add(upper);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), M.suit);
      elbow.position.y = 0.285;
      elbow.scale.set(1, 0.92, 1);
      shoulder.add(elbow);

      const forearmBone = b['forearm' + S];
      const fore = limbMesh(0.054, 0.038, 0.262, M.suit);
      forearmBone.add(fore);

      // Web shooter band.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.032, 14), M.white);
      band.position.y = 0.238;
      band.castShadow = true;
      forearmBone.add(band);
      const nozzle = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.012, 0.02, 2, 0.003), M.black);
      nozzle.position.set(0, 0.238, 0.055);
      forearmBone.add(nozzle);

      // Gloved hand.
      const hand = new THREE.Group();
      const palm = new THREE.CapsuleGeometry(0.032, 0.045, 3, 10);
      palm.rotateZ(Math.PI / 2);
      palm.translate(0, 0.058, 0);
      palm.scale(1, 0.72, 1);
      const parts = [palm];
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.CapsuleGeometry(0.0095, 0.045, 2, 7);
        finger.scale(1, 1, 0.85);
        finger.rotateX(-0.13);
        finger.translate((f - 1.5) * 0.0165, 0.115, 0.004);
        parts.push(finger);
      }
      const thumb = new THREE.CapsuleGeometry(0.011, 0.036, 2, 7);
      thumb.rotateZ(0.85);
      thumb.translate(0.042, 0.06, 0.012);
      parts.push(thumb);
      const handGeo = mergeGeometries(parts, false);
      const handMesh = new THREE.Mesh(handGeo, M.suit);
      handMesh.castShadow = true;
      hand.add(handMesh);
      b['hand' + S].add(hand);

      // Legs.
      const thigh = limbMesh(0.092, 0.062, 0.435, M.blue);
      b['thigh' + S].add(thigh);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 9), M.blue);
      knee.position.y = 0.435;
      knee.scale.set(1, 0.9, 0.95);
      knee.castShadow = true;
      b['thigh' + S].add(knee);

      const shin = limbMesh(0.063, 0.044, 0.435, M.blue);
      b['shin' + S].add(shin);

      // Red boot, built along the foot bone (+Y = toe direction).
      const boot = new THREE.Mesh(new RoundedBoxGeometry(0.122, 0.268, 0.10, 3, 0.032), M.suit);
      boot.position.set(0, 0.088, 0.014);
      boot.castShadow = true;
      boot.receiveShadow = true;
      b['foot' + S].add(boot);
      const sole = new THREE.Mesh(new RoundedBoxGeometry(0.127, 0.262, 0.028, 2, 0.012), M.sole);
      sole.position.set(0, 0.092, -0.036);
      b['foot' + S].add(sole);

      // Ankle cuff.
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.069, 0.075, 0.052, 12), M.suitDark);
      cuff.position.y = 0.008;
      b['foot' + S].add(cuff);
    }

    // Custom belt web shooters / utility details omitted for silhouette clarity.
    this.ready = true;
  }

  _buildMaskedHead() {
    const M = this.materials;
    const head = this.bones.head;
    this.maskGroup.position.set(0, 0.085, 0);
    head.add(this.maskGroup);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.118, 28, 22), M.suit);
    skull.scale.set(0.93, 1.07, 0.97);
    skull.position.y = 0.023;
    skull.castShadow = true;
    skull.receiveShadow = true;
    this.maskGroup.add(skull);

    // Squared jaw / chin.
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.128, 0.098, 0.138, 4, 0.04), M.suit);
    jaw.position.set(0, -0.043, 0.012);
    jaw.castShadow = true;
    this.maskGroup.add(jaw);

    // Eye lens geometry: classic teardrop.
    const shape = new THREE.Shape();
    shape.moveTo(-0.062, 0.004);
    shape.bezierCurveTo(-0.056, 0.052, -0.012, 0.074, 0.04, 0.061);
    shape.bezierCurveTo(0.074, 0.051, 0.078, 0.018, 0.052, -0.002);
    shape.bezierCurveTo(0.014, -0.03, -0.045, -0.027, -0.062, 0.004);

    const lensGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10,
    });
    lensGeo.center();

    const rimGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.008, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10,
    });
    rimGeo.center();

    this.lensGroups = [];
    for (const side of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(0.047 * side, 0.05, 0.108);
      eye.rotation.y = 0.34 * side;
      eye.rotation.z = -0.1 * side;
      eye.scale.set(0.63, 0.74, 1);

      const rim = new THREE.Mesh(rimGeo, M.lensRim);
      rim.scale.set(1.2, 1.14, 1);
      rim.position.z = -0.004;
      eye.add(rim);

      const lens = new THREE.Mesh(lensGeo, M.lens);
      lens.scale.set(1, 1, 1);
      lens.position.z = 0.004;
      eye.add(lens);

      const shine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.028, 0.011),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      shine.position.set(-0.018 * side, 0.025, 0.014);
      shine.rotation.z = -0.32 * side;
      eye.add(shine);

      this.maskGroup.add(eye);
      this.lensGroups.push(eye);
    }

    // Collar trim.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 6, 24), M.suitDark);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, -0.105, 0.006);
    this.maskGroup.add(collar);
  }

  _buildFace() {
    const M = this.materials;
    const head = this.bones.head;
    this.faceGroup.position.set(0, 0.085, 0);
    head.add(this.faceGroup);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.111, 26, 22), M.skin);
    skull.scale.set(0.9, 1.04, 0.95);
    skull.position.y = 0.028;
    skull.castShadow = true;
    skull.receiveShadow = true;
    this.faceGroup.add(skull);

    // Jaw / chin (animated on jaw open).
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, -0.018, 0.01);
    this.faceGroup.add(jawGroup);
    this.jawGroup = jawGroup;
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.118, 0.09, 0.128, 4, 0.036), M.skin);
    jaw.position.set(0, -0.028, 0.012);
    jaw.castShadow = true;
    jawGroup.add(jaw);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), M.skin);
    chin.scale.set(1.25, 0.8, 0.9);
    chin.position.set(0, -0.055, 0.062);
    jawGroup.add(chin);

    // Ears.
    for (const side of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), M.skin);
      ear.scale.set(0.65, 1.1, 0.8);
      ear.position.set(0.099 * side, 0.022, -0.004);
      this.faceGroup.add(ear);
    }

    // Eyes.
    this.eyes = [];
    for (const side of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(0.037 * side, 0.05, 0.087);
      this.faceGroup.add(eye);

      const white = new THREE.Mesh(new THREE.SphereGeometry(0.0205, 16, 12), M.eyeWhite);
      white.scale.set(1.05, 0.82, 0.5);
      eye.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 14, 10), M.iris);
      iris.scale.set(1, 1, 0.36);
      iris.position.set(0, 0.0, 0.018);
      eye.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 12, 8), M.pupil);
      pupil.scale.set(1, 1, 0.3);
      pupil.position.set(0, 0, 0.024);
      eye.add(pupil);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M.skin);
      lid.scale.set(1.06, 0.5, 0.55);
      lid.position.set(0, 0.012, 0.004);
      eye.add(lid);

      this.eyes.push({ group: eye, lid, side });
    }

    // Brows.
    this.brows = [];
    for (const side of [1, -1]) {
      const brow = new THREE.Mesh(new RoundedBoxGeometry(0.038, 0.0065, 0.009, 2, 0.0025), M.brow);
      brow.position.set(0.038 * side, 0.078, 0.088);
      brow.rotation.z = 0.09 * side;
      this.faceGroup.add(brow);
      this.brows.push({ mesh: brow, side, baseY: 0.078 });
    }

    // Nose.
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), M.skin);
    nose.scale.set(0.85, 1.35, 1.1);
    nose.position.set(0, 0.022, 0.098);
    this.faceGroup.add(nose);
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.035, 2, 7), M.skin);
    bridge.rotation.x = -0.16;
    bridge.position.set(0, 0.042, 0.094);
    this.faceGroup.add(bridge);

    // Mouth.
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.025, 0.093);
    this.faceGroup.add(mouthGroup);
    this.mouthGroup = mouthGroup;

    const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.029, 14, 10), M.mouth);
    cavity.scale.set(1, 0.28, 0.35);
    mouthGroup.add(cavity);
    this.mouthCavity = cavity;

    const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.036, 2, 8), M.lip);
    upperLip.rotation.z = Math.PI / 2;
    upperLip.position.set(0, 0.006, 0.008);
    mouthGroup.add(upperLip);
    const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.03, 2, 8), M.lip);
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.position.set(0, -0.007, 0.008);
    mouthGroup.add(lowerLip);
    this.lowerLip = lowerLip;

    for (const side of [1, -1]) {
      const corner = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), M.lip);
      corner.position.set(0.022 * side, 0.0, 0.007);
      mouthGroup.add(corner);
    }

    // Hair: cap + swept fringe.
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.116, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
      M.hair,
    );
    hairCap.scale.set(0.94, 1.06, 0.98);
    hairCap.position.set(0, 0.034, -0.003);
    hairCap.rotation.x = -0.06;
    hairCap.castShadow = true;
    this.faceGroup.add(hairCap);

    const fringeData = [
      [0.0, 0.108, 0.085, 0.05, 0.018, 0.022, 0.0, 0.35],
      [0.045, 0.103, 0.075, 0.045, 0.016, 0.02, -0.3, 0.25],
      [-0.043, 0.105, 0.078, 0.04, 0.016, 0.02, 0.35, -0.2],
      [0.075, 0.085, 0.035, 0.035, 0.02, 0.025, -0.5, 0.4],
      [-0.075, 0.087, 0.038, 0.032, 0.019, 0.024, 0.5, -0.35],
    ];
    for (const [x, y, z, sx, sy, sz, ry, rz] of fringeData) {
      const strand = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), M.hair);
      strand.scale.set(sx, sy, sz);
      strand.position.set(x, y, z);
      strand.rotation.set(0.2, ry, rz);
      strand.castShadow = true;
      this.faceGroup.add(strand);
    }

    // Neck skin, only visible unmasked.
    const neckSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.1, 12), M.skin);
    neckSkin.position.set(0, -0.078, 0);
    this.faceGroup.add(neckSkin);
  }

  _buildSkeletonOverlay() {
    this.skeleton = new THREE.Group();
    this.skeleton.visible = false;

    const dotGeo = new THREE.SphereGeometry(0.011, 7, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x7de7ff, transparent: true, opacity: 0.9, depthTest: false });
    this.skelDots = {};
    const joints = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'forearmL', 'handL', 'shoulderR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
    for (const j of joints) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.renderOrder = 20;
      this.skeleton.add(dot);
      this.skelDots[j] = dot;
    }

    this.skelSegments = [
      ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
      ['chest', 'shoulderL'], ['shoulderL', 'forearmL'], ['forearmL', 'handL'],
      ['chest', 'shoulderR'], ['shoulderR', 'forearmR'], ['forearmR', 'handR'],
      ['hips', 'thighL'], ['thighL', 'shinL'], ['shinL', 'footL'], ['footL', 'toeL'],
      ['hips', 'thighR'], ['thighR', 'shinR'], ['shinR', 'footR'], ['footR', 'toeR'],
    ];
    const positions = new Float32Array(this.skelSegments.length * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.skelLineGeo = geo;
    this.skelLine = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xff5470, transparent: true, opacity: 0.7, depthTest: false }),
    );
    this.skelLine.renderOrder = 19;
    this.skeleton.add(this.skelLine);
  }

  setSkeletonVisible(v) {
    this.skeleton.visible = v;
    if (v && !this.skeleton.parent) this.group.add(this.skeleton);
  }

  setMasked(masked) {
    this.masked = masked;
    this.maskGroup.visible = masked;
    this.faceGroup.visible = !masked;
  }

  _smoothQuat(name, target, rate, dt) {
    let q = this.smoothQuats.get(name);
    if (!q) {
      q = target.clone();
      this.smoothQuats.set(name, q);
    } else {
      const a = 1 - Math.exp(-rate * Math.max(dt, 0.001));
      q.slerp(target, Math.min(a, 1));
    }
    return q;
  }

  applyMotion(motion, dt = 1 / 60) {
    if (!motion || !motion.joints) return;
    const j = motion.joints;
    const b = this.bones;

    // ---- Root / hips -------------------------------------------------------
    const root = motion.root || {};
    const targetRoot = _v1.set(
      Number.isFinite(root.x) ? root.x : 0,
      Number.isFinite(root.y) ? root.y : 0.92,
      Number.isFinite(root.z) ? root.z : 0,
    );
    const rootA = 1 - Math.exp(-12 * Math.max(dt, 0.001));
    this.smoothRoot.lerp(targetRoot, Math.min(rootA, 1));

    // ---- Torso basis -------------------------------------------------------
    const hipL = j.hipL || j.hips;
    const hipR = j.hipR || j.hips;
    const shL = j.shoulderL || j.chest;
    const shR = j.shoulderR || j.chest;

    const hipLine = _v1.subVectors(hipL, hipR);
    if (hipLine.lengthSq() < 1e-8) hipLine.set(1, 0, 0);
    hipLine.normalize();

    const spineDir = _v2.subVectors(j.spine || j.hips, j.hips);
    if (spineDir.lengthSq() < 1e-8) spineDir.copy(UP);
    const qHips = basisQuat(hipLine, spineDir, new THREE.Quaternion());

    const spineTarget = _v2.subVectors(j.chest || j.spine, j.spine || j.hips);
    if (spineTarget.lengthSq() < 1e-8) spineTarget.copy(UP);
    const qSpine = basisQuat(hipLine, spineTarget, new THREE.Quaternion());

    const shoulderLine = _v3.subVectors(shL, shR);
    if (shoulderLine.lengthSq() < 1e-8) shoulderLine.set(1, 0, 0);
    shoulderLine.normalize();

    const chestTarget = _v2.subVectors(j.neck || j.chest, j.chest);
    if (chestTarget.lengthSq() < 1e-8) chestTarget.copy(UP);
    const qChest = basisQuat(shoulderLine, chestTarget, new THREE.Quaternion());

    const neckTarget = _v2.subVectors(j.head || j.neck, j.neck);
    if (neckTarget.lengthSq() < 1e-8) neckTarget.copy(UP);
    const qNeck = basisQuat(shoulderLine, neckTarget, new THREE.Quaternion());

    // Head: body/base orientation + facial offset.
    const face = motion.face || this.faceSmoothed;
    const faceRate = 1 - Math.exp(-18 * Math.max(dt, 0.001));
    for (const k of Object.keys(this.faceSmoothed)) {
      const v = Number.isFinite(face[k]) ? face[k] : 0;
      this.faceSmoothed[k] += (v - this.faceSmoothed[k]) * faceRate;
    }
    const f = this.faceSmoothed;
    _e.set(
      THREE.MathUtils.clamp(f.pitch, -0.6, 0.6),
      THREE.MathUtils.clamp(f.yaw, -0.9, 0.9),
      THREE.MathUtils.clamp(f.roll, -0.55, 0.55),
      'YXZ',
    );
    const faceQuat = new THREE.Quaternion().setFromEuler(_e);
    const qHeadWorld = qNeck.clone().multiply(faceQuat);

    // ---- Assign local rotations -------------------------------------------
    const qHipsS = this._smoothQuat('hips', qHips, 16, dt);
    b.hips.quaternion.copy(qHipsS);

    _qInv.copy(qHipsS).invert();
    b.spine.quaternion.copy(_qInv.clone().multiply(this._smoothQuat('spine', qSpine, 18, dt)));

    _qInv.copy(qSpine).invert();
    b.chest.quaternion.copy(_qInv.clone().multiply(this._smoothQuat('chest', qChest, 18, dt)));

    _qInv.copy(qChest).invert();
    b.neck.quaternion.copy(_qInv.clone().multiply(this._smoothQuat('neck', qNeck, 20, dt)));

    _qInv.copy(qNeck).invert();
    b.head.quaternion.copy(_qInv.clone().multiply(this._smoothQuat('head', qHeadWorld, 24, dt)));

    // ---- Arms -------------------------------------------------------------
    const chestFwd = _v3.set(0, 0, 1).applyQuaternion(qChest);
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const shoulder = j['shoulder' + S];
      const elbow = j['elbow' + S];
      const wrist = j['wrist' + S];
      const handEnd = j['handEnd' + S] || j['hand' + S] || wrist;

      if (shoulder && elbow) {
        const upperTarget = new THREE.Quaternion();
        forwardQuat(_v1.subVectors(elbow, shoulder), chestFwd, upperTarget);
        _qInv.copy(qChest).invert();
        const upperLocal = _qInv.clone().multiply(upperTarget);
        b['shoulder' + S].quaternion.copy(this._smoothQuat('upper' + S, upperLocal, 24, dt));
      }
      if (elbow && wrist) {
        const foreTarget = new THREE.Quaternion();
        forwardQuat(_v1.subVectors(wrist, elbow), chestFwd, foreTarget);
        const parentWorld = new THREE.Quaternion().setFromRotationMatrix(
          b['shoulder' + S].matrixWorld,
        );
        // parentWorld is only valid after updateMatrixWorld; approximate from stored smooth quat.
        const storedUpper = this.smoothQuats.get('upper' + S);
        const upperWorld = qChest.clone().multiply(storedUpper || new THREE.Quaternion());
        _qInv.copy(upperWorld).invert();
        b['forearm' + S].quaternion.copy(this._smoothQuat('fore' + S, _qInv.clone().multiply(foreTarget), 26, dt));
      }
      if (wrist && handEnd) {
        const handTarget = new THREE.Quaternion();
        forwardQuat(_v1.subVectors(handEnd, wrist), chestFwd, handTarget);
        const storedUpper = this.smoothQuats.get('upper' + S);
        const storedFore = this.smoothQuats.get('fore' + S);
        const upperWorld = qChest.clone().multiply(storedUpper || new THREE.Quaternion());
        const foreWorld = upperWorld.clone().multiply(storedFore || new THREE.Quaternion());
        _qInv.copy(foreWorld).invert();
        b['hand' + S].quaternion.copy(this._smoothQuat('hand' + S, _qInv.clone().multiply(handTarget), 26, dt));
      }
    }

    // ---- Legs -------------------------------------------------------------
    const hipsFwd = _v3.set(0, 0, 1).applyQuaternion(qHipsS);
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const hip = j['hip' + S];
      const knee = j['knee' + S];
      const ankle = j['ankle' + S];
      const toe = j['toe' + S];

      if (hip && knee) {
        const thighTarget = new THREE.Quaternion();
        forwardQuat(_v1.subVectors(knee, hip), hipsFwd, thighTarget);
        _qInv.copy(qHipsS).invert();
        b['thigh' + S].quaternion.copy(this._smoothQuat('thigh' + S, _qInv.clone().multiply(thighTarget), 22, dt));
      }
      if (knee && ankle) {
        const shinTarget = new THREE.Quaternion();
        forwardQuat(_v1.subVectors(ankle, knee), hipsFwd, shinTarget);
        const storedThigh = this.smoothQuats.get('thigh' + S);
        const thighWorld = qHipsS.clone().multiply(storedThigh || new THREE.Quaternion());
        _qInv.copy(thighWorld).invert();
        b['shin' + S].quaternion.copy(this._smoothQuat('shin' + S, _qInv.clone().multiply(shinTarget), 24, dt));
      }
      if (ankle && toe) {
        const footTarget = new THREE.Quaternion();
        forwardQuat(_v1.subVectors(toe, ankle), UP, footTarget);
        const storedThigh = this.smoothQuats.get('thigh' + S);
        const storedShin = this.smoothQuats.get('shin' + S);
        const thighWorld = qHipsS.clone().multiply(storedThigh || new THREE.Quaternion());
        const shinWorld = thighWorld.clone().multiply(storedShin || new THREE.Quaternion());
        _qInv.copy(shinWorld).invert();
        b['foot' + S].quaternion.copy(this._smoothQuat('foot' + S, _qInv.clone().multiply(footTarget), 20, dt));
      }
    }

    // ---- Grounding --------------------------------------------------------
    b.hips.position.set(this.smoothRoot.x, this.smoothRoot.y, this.smoothRoot.z);
    this.root.position.set(0, 0, 0);
    b.hips.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const S of ['L', 'R']) {
      b['foot' + S].updateMatrixWorld(true);
      b['foot' + S].getWorldPosition(_v1);
      lowest = Math.min(lowest, _v1.y - 0.072);
      b['toe' + S].getWorldPosition(_v2);
      lowest = Math.min(lowest, _v2.y - 0.045);
    }
    if (Number.isFinite(lowest) && motion.ground !== false) {
      const targetOffset = THREE.MathUtils.clamp(-lowest, -0.3, 0.4);
      const ga = 1 - Math.exp(-10 * Math.max(dt, 0.001));
      this.groundOffset += (targetOffset - this.groundOffset) * ga;
      this.root.position.y = this.groundOffset;
    }

    this._updateFace(f, dt);
    b.hips.updateMatrixWorld(true);
  }

  _updateFace(f, dt) {
    // Masked lenses react to blinks and squints.
    if (this.lensGroups) {
      for (let i = 0; i < this.lensGroups.length; i++) {
        const blink = i === 0 ? f.blinkL : f.blinkR;
        const sy = THREE.MathUtils.lerp(1, 0.08, THREE.MathUtils.clamp(blink * 1.2 + f.squint * 0.18, 0, 1));
        this.lensGroups[i].scale.y += (sy - this.lensGroups[i].scale.y) * Math.min(1, dt * 18);
      }
    }

    if (!this.faceGroup.visible) return;

    // Blink.
    for (const eye of this.eyes) {
      const blink = eye.side > 0 ? f.blinkL : f.blinkR;
      const target = THREE.MathUtils.lerp(1, 0.08, THREE.MathUtils.clamp(blink * 1.15, 0, 1));
      eye.group.scale.y += (target - eye.group.scale.y) * Math.min(1, dt * 22);
      eye.lid.position.y = 0.012 - blink * 0.012;
    }

    // Jaw.
    const jaw = THREE.MathUtils.clamp(f.jaw, 0, 1);
    const jawTarget = -jaw * 0.022;
    this.jawGroup.position.y += ((-0.018 + jawTarget) - this.jawGroup.position.y) * Math.min(1, dt * 20);
    this.mouthCavity.scale.y = 0.28 + jaw * 2.5;
    this.mouthCavity.scale.x = 1 + f.smile * 0.16;
    this.lowerLip.position.y = -0.007 - jaw * 0.012;
    this.lowerLip.rotation.z = Math.PI / 2 + f.smile * 0.015;

    // Smile + brows.
    for (const brow of this.brows) {
      const raise = f.brow * 0.011 + (f.smile * 0.004);
      brow.mesh.position.y = brow.baseY + raise - (brow.side > 0 ? f.blinkL : f.blinkR) * 0.002;
      brow.mesh.rotation.z = 0.09 * brow.side + f.smile * 0.03 * brow.side;
    }

    // Subtle cheek/jaw expression can be extended here.
  }

  update(dt, elapsed) {
    this.idleT += dt;
    if (this.ready) {
      if (this.skeleton.visible) this._updateSkeleton();
      // Gentle suit breathing (does not fight joint targets).
      const breath = Math.sin(this.idleT * 1.8) * 0.006;
      this.bones.chest.scale.setScalar(1 + breath);
    }
  }

  _updateSkeleton() {
    const tmp = new THREE.Vector3();
    for (const name of Object.keys(this.skelDots)) {
      const bone = this.bones[name];
      if (!bone) continue;
      bone.getWorldPosition(tmp);
      this.skelDots[name].position.copy(tmp);
    }
    const pos = this.skelLineGeo.attributes.position;
    let k = 0;
    for (const [a, c] of this.skelSegments) {
      const pa = this.skelDots[a].position;
      const pc = this.skelDots[c].position;
      pos.setXYZ(k++, pa.x, pa.y, pa.z);
      pos.setXYZ(k++, pc.x, pc.y, pc.z);
    }
    pos.needsUpdate = true;
  }

  getHeadWorldPosition(target) {
    return this.bones.head.getWorldPosition(target);
  }
}
