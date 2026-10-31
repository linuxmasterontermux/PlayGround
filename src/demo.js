import * as THREE from 'three';

const UPPER_ARM = 0.285;
const FOREARM = 0.262;
const THIGH = 0.435;
const SHIN = 0.435;

const smooth = (current, target, dt, rate) => current + (target - current) * (1 - Math.exp(-rate * dt));

function dirFrom(out, pitch, side, out2 = out) {
  const c = Math.cos(out2);
  return new THREE.Vector3(
    Math.sin(out2) * side,
    -c * Math.cos(pitch),
    c * Math.sin(pitch),
  );
}

function blinkAt(t, offset, period) {
  const p = (t + offset) % period;
  if (p < 0.16) return Math.sin((p / 0.16) * Math.PI) ** 1.4;
  return 0;
}

export class DemoMotion {
  constructor() {
    this.t = 0;
    this.state = {
      armOutL: 0.14, armPitchL: 0.04, armBendL: 0.16,
      armOutR: 0.14, armPitchR: 0.04, armBendR: 0.16,
      hipPitchL: 0.02, hipOutL: 0.03, kneeBendL: 0.03,
      hipPitchR: 0.02, hipOutR: 0.03, kneeBendR: 0.03,
      lean: 0.01, twist: 0, roll: 0, sway: 0, bob: 0,
      faceYaw: 0, facePitch: 0, faceRoll: 0,
      jaw: 0, smile: 0.08, brow: 0, squint: 0,
    };
    this.joints = {};
    this.face = {};
    this.preview = { pose: {}, face: [], head: { x: 0.5, y: 0.22, r: 0.085 } };
    this._vec = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._euler = new THREE.Euler();
  }

  update(dt, elapsed) {
    this.t = elapsed;
    const t = elapsed % 26;
    const S = this.state;
    const k = (rate = 3.2) => 1 - Math.exp(-rate * dt);

    // Defaults each frame.
    let target = {
      armOutL: 0.14, armPitchL: 0.02, armBendL: 0.18,
      armOutR: 0.14, armPitchR: 0.02, armBendR: 0.18,
      hipPitchL: 0.02, hipOutL: 0.035, kneeBendL: 0.04,
      hipPitchR: 0.02, hipOutR: 0.035, kneeBendR: 0.04,
      lean: 0.015, twist: 0, roll: 0, sway: 0, bob: 0,
      faceYaw: 0, facePitch: 0.02, faceRoll: 0,
      jaw: 0, smile: 0.07, brow: 0, squint: 0,
    };

    // ── 0–5s · hero idle ────────────────────────────────────────────────
    if (t < 5) {
      const p = t;
      target.sway = Math.sin(p * 0.9) * 0.022;
      target.bob = Math.sin(p * 1.8) * 0.35;
      target.lean = 0.02 + Math.sin(p * 0.9) * 0.012;
      target.twist = Math.sin(p * 0.55) * 0.05;
      target.armOutL = 0.16 + Math.sin(p * 0.9) * 0.02;
      target.armOutR = 0.15;
      target.armPitchL = 0.06;
      target.armBendL = 0.2;
      target.faceYaw = Math.sin(p * 0.72) * 0.24;
      target.facePitch = Math.sin(p * 0.5) * 0.07;
      target.faceRoll = Math.sin(p * 0.62) * 0.04;
      target.brow = Math.max(0, Math.sin(p * 0.7));
      target.smile = 0.1;
    }
    // ── 5–9s · friendly wave (right arm) ────────────────────────────────
    else if (t < 9) {
      const p = t - 5;
      const wave = Math.sin(p * 7.5) * 0.55;
      target.armOutL = 1.35;
      target.armPitchL = 0.28;
      target.armBendL = 1.18 + wave;
      target.armOutR = 0.22;
      target.armPitchR = -0.05;
      target.armBendR = 0.28;
      target.twist = 0.1;
      target.lean = 0.015;
      target.faceYaw = 0.18;
      target.facePitch = -0.02;
      target.faceRoll = 0.08;
      target.jaw = 0.14 + Math.max(0, Math.sin(p * 3.2)) * 0.18;
      target.smile = 0.55;
      target.brow = 0.35 + Math.max(0, Math.sin(p * 2.1)) * 0.12;
      target.sway = Math.sin(p * 1.5) * 0.015;
    }
    // ── 9–13.5s · combat stance + punches ───────────────────────────────
    else if (t < 13.5) {
      const p = t - 9;
      const punchL = Math.max(0, Math.sin((p - 0.35) * 4.6)) ** 6;
      const punchR = Math.max(0, Math.sin((p - 1.5) * 4.6)) ** 6;
      target.armOutL = 0.34;
      target.armOutR = 0.34;
      target.armPitchL = 0.95 + punchL * 0.55;
      target.armPitchR = 0.95 + punchR * 0.55;
      target.armBendL = 1.65 - punchL * 1.55;
      target.armBendR = 1.65 - punchR * 1.55;
      target.kneeBendL = 0.7;
      target.kneeBendR = 0.7;
      target.hipPitchL = 0.34;
      target.hipPitchR = 0.34;
      target.hipOutL = 0.12;
      target.hipOutR = 0.12;
      target.lean = 0.16;
      target.twist = -0.08 + Math.sin(p * 2.3) * 0.1;
      target.facePitch = 0.12;
      target.faceYaw = Math.sin(p * 2.3) * 0.1;
      target.brow = 0.15;
      target.jaw = 0.06;
      target.squint = 0.15;
      target.sway = Math.sin(p * 4.6) * 0.012;
      target.bob = Math.abs(Math.sin(p * 4.6)) * 0.3;
    }
    // ── 13.5–17.5s · web-shooter stance ─────────────────────────────────
    else if (t < 17.5) {
      const p = t - 13.5;
      const recoil = Math.max(0, Math.sin(p * 2.6)) ** 5;
      target.armOutL = 0.28;
      target.armOutR = 0.28;
      target.armPitchL = 1.42 - recoil * 0.2;
      target.armPitchR = 1.42 - recoil * 0.2;
      target.armBendL = 0.14 + recoil * 0.3;
      target.armBendR = 0.14 + recoil * 0.3;
      target.kneeBendL = 0.35;
      target.kneeBendR = 0.5;
      target.hipPitchL = 0.22;
      target.hipPitchR = 0.28;
      target.hipOutL = 0.1;
      target.hipOutR = 0.08;
      target.lean = 0.1;
      target.twist = 0.06;
      target.facePitch = -0.16;
      target.faceYaw = 0;
      target.brow = 0.1;
      target.squint = 0.35;
      target.sway = Math.sin(p * 2) * 0.012;
    }
    // ── 17.5–21s · overhead stretch ─────────────────────────────────────
    else if (t < 21) {
      const p = t - 17.5;
      target.armOutL = 1.62;
      target.armPitchL = 0.2;
      target.armBendL = 0.22 + Math.sin(p * 2.2) * 0.12;
      target.armOutR = 0.32;
      target.armPitchR = -0.15;
      target.armBendR = 0.35;
      target.lean = -0.05;
      target.roll = 0.1;
      target.twist = -0.05;
      target.faceYaw = 0.3;
      target.facePitch = 0.2;
      target.faceRoll = -0.12;
      target.smile = 0.24;
      target.jaw = 0.18;
      target.brow = 0.45;
      target.sway = Math.sin(p * 1.2) * 0.02;
    }
    // ── 21–26s · settle ─────────────────────────────────────────────────
    else {
      const p = t - 21;
      target.sway = Math.sin(p * 0.8) * 0.015;
      target.twist = 0.04;
      target.faceYaw = Math.sin(p * 0.6) * 0.15;
      target.facePitch = 0.04;
      target.smile = 0.16;
      target.brow = 0.08;
      target.bob = Math.sin(p * 1.6) * 0.2;
    }

    // Smooth state toward targets.
    for (const key of Object.keys(target)) {
      const rate = key.startsWith('arm') ? 7.5 : key.startsWith('hip') || key.startsWith('knee') ? 6 : 4.5;
      S[key] = smooth(S[key], target[key], dt, rate);
    }

    // Breathing modulation.
    const breath = Math.sin(this.t * 1.7) * 0.5 + 0.5;
    const bob = S.bob * 0.01 + breath * 0.004;
    const hips = new THREE.Vector3(S.sway, 0.905 + bob, -S.lean * 0.05);
    const up = this._up.set(0, 1, 0);
    this._euler.set(S.lean * 0.6, S.twist, S.roll, 'YXZ');
    up.applyEuler(this._euler).normalize();
    const side = this._side.set(1, 0, 0).applyEuler(this._euler).normalize();

    const spine = hips.clone().addScaledVector(up, 0.06);
    const chest = hips.clone().addScaledVector(up, 0.255);
    const neck = chest.clone().addScaledVector(up, 0.225);
    const head = neck.clone().addScaledVector(up, 0.078);

    const j = {
      hips, spine, chest, neck, head,
      hipL: hips.clone().addScaledVector(side, 0.102).addScaledVector(up, -0.018),
      hipR: hips.clone().addScaledVector(side, -0.102).addScaledVector(up, -0.018),
    };

    // Shoulders / arms.
    for (const sideSign of [1, -1]) {
      const Sx = sideSign > 0 ? 'L' : 'R';
      const shoulder = chest.clone().addScaledVector(side, 0.172 * sideSign).addScaledVector(up, 0.202);
      const out = Sx === 'L' ? S.armOutL : S.armOutR;
      const pitch = Sx === 'L' ? S.armPitchL : S.armPitchR;
      const bend = Sx === 'L' ? S.armBendL : S.armBendR;

      const armDir = dirFrom(out, pitch, sideSign);
      const foreDir = dirFrom(out, pitch + bend, sideSign, out * 0.92);
      const elbow = shoulder.clone().addScaledVector(armDir, UPPER_ARM);
      const wrist = elbow.clone().addScaledVector(foreDir, FOREARM);
      const handEnd = wrist.clone().addScaledVector(foreDir, 0.095);
      j['shoulder' + Sx] = shoulder;
      j['elbow' + Sx] = elbow;
      j['wrist' + Sx] = wrist;
      j['handEnd' + Sx] = handEnd;

      // Legs.
      const hipPitch = Sx === 'L' ? S.hipPitchL : S.hipPitchR;
      const hipOut = Sx === 'L' ? S.hipOutL : S.hipOutR;
      const kneeBend = Sx === 'L' ? S.kneeBendL : S.kneeBendR;
      const hip = j['hip' + Sx];
      const thighDir = new THREE.Vector3(
        Math.sin(hipOut) * sideSign,
        -Math.cos(hipOut) * Math.cos(hipPitch),
        Math.cos(hipOut) * Math.sin(hipPitch),
      ).normalize();
      const shinDir = new THREE.Vector3(
        Math.sin(hipOut * 0.7) * sideSign,
        -Math.cos(hipOut * 0.7) * Math.cos(hipPitch - kneeBend),
        Math.cos(hipOut * 0.7) * Math.sin(hipPitch - kneeBend),
      ).normalize();
      const knee = hip.clone().addScaledVector(thighDir, THIGH);
      const ankle = knee.clone().addScaledVector(shinDir, SHIN);
      const toe = ankle.clone().add(new THREE.Vector3(0.012 * sideSign, -0.055, 0.17));
      j['knee' + Sx] = knee;
      j['ankle' + Sx] = ankle;
      j['toe' + Sx] = toe;
    }

    this.joints = j;
    const face = {
      yaw: S.faceYaw,
      pitch: S.facePitch,
      roll: S.faceRoll,
      jaw: THREE.MathUtils.clamp(S.jaw + Math.sin(this.t * 2.2) * 0.02, 0, 1),
      smile: THREE.MathUtils.clamp(S.smile, 0, 1),
      brow: THREE.MathUtils.clamp(S.brow, 0, 1),
      squint: THREE.MathUtils.clamp(S.squint, 0, 1),
      blinkL: blinkAt(this.t, 0.2, 3.6),
      blinkR: blinkAt(this.t, 0.23, 3.6),
    };
    this.face = face;

    this._buildPreview(j, face);
    return {
      joints: j,
      root: { x: hips.x, y: hips.y, z: hips.z },
      face,
      confidence: 1,
      source: 'demo',
      preview: this.preview,
    };
  }

  _buildPreview(j, face) {
    const pose = this.preview.pose;
    const map = (p) => [0.5 + (p.x - j.hips.x) * 0.63, 0.905 - (p.y - 0.02) * 0.47];
    for (const key of Object.keys(j)) {
      pose[key] = map(j[key]);
    }
    this.preview.pose = pose;
    this.preview.head = {
      x: pose.head[0],
      y: pose.head[1] - 0.035,
      r: 0.075,
    };

    // Synthetic face mesh cloud, 16 points around the head + features.
    const pts = [];
    const cx = this.preview.head.x;
    const cy = this.preview.head.y + 0.018;
    const yaw = face.yaw;
    for (let ring = 0; ring < 2; ring++) {
      const ry = 0.07 + ring * 0.028;
      const rx = 0.055 + ring * 0.022;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * rx * (1 - Math.abs(yaw) * 0.15), cy + Math.sin(a) * ry]);
      }
    }
    pts.push([cx - 0.018 + yaw * 0.03, cy + 0.008]);
    pts.push([cx + 0.018 + yaw * 0.03, cy + 0.008]);
    pts.push([cx + yaw * 0.04, cy - 0.004]);
    pts.push([cx + yaw * 0.035, cy - 0.033]);
    this.preview.face = pts;
  }
}
