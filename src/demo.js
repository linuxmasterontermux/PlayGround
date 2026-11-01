import { clamp } from './filters.js';

const TAU = Math.PI * 2;

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a) => Math.hypot(a.x, a.y, a.z);
const normalize = (a) => {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function rotateX(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function rotateY(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function rotateZ(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

function rotateEuler(v, pitch, yaw, roll) {
  return rotateY(rotateX(rotateZ(v, roll), pitch), yaw);
}

/** Analytic two-bone IK, knee pushed toward the camera. */
function solveKnee(hip, ankle, upper = 0.42, lower = 0.42) {
  const delta = sub(ankle, hip);
  const dist = clamp(length(delta), 0.08, upper + lower - 0.002);
  const dir = normalize(delta);
  const along = (upper * upper - lower * lower + dist * dist) / (2 * dist);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  let perp = sub({ x: 0, y: 0, z: 1 }, scale(dir, dot({ x: 0, y: 0, z: 1 }, dir)));
  if (length(perp) < 1e-4) perp = { x: 0, y: 0, z: 1 };
  perp = normalize(perp);
  return add(add(hip, scale(dir, along)), scale(perp, height));
}

/** Build a 21-point hand skeleton. Local +Y is finger direction, +Z is palm normal. */
function handLocal(curl, spread) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const fingers = [
    { ids: [5, 6, 7, 8], base: { x: -0.032, y: 0.083, z: 0 }, lengths: [0.042, 0.03, 0.024], curl: 1.0 },
    { ids: [9, 10, 11, 12], base: { x: -0.009, y: 0.092, z: 0 }, lengths: [0.047, 0.034, 0.026], curl: 1.0 },
    { ids: [13, 14, 15, 16], base: { x: 0.014, y: 0.088, z: 0 }, lengths: [0.043, 0.032, 0.024], curl: 0.94 },
    { ids: [17, 18, 19, 20], base: { x: 0.037, y: 0.078, z: 0 }, lengths: [0.035, 0.026, 0.02], curl: 0.85 },
  ];

  for (const finger of fingers) {
    let p = { x: finger.base.x * spread, y: finger.base.y, z: finger.base.z };
    points[finger.ids[0]] = { ...p };
    let direction = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < finger.lengths.length; i++) {
      const bend = (0.12 + i * 0.55) * curl * finger.curl;
      direction = rotateX({ x: 0, y: 1, z: 0 }, bend);
      p = add(p, scale(direction, finger.lengths[i]));
      points[finger.ids[i + 1]] = { ...p };
    }
  }

  // Thumb: CMC, MCP, IP, tip.
  const thumbBase = { x: -0.046, y: 0.018, z: 0.008 };
  points[1] = { ...thumbBase };
  points[2] = add(thumbBase, { x: -0.018, y: 0.02, z: 0.012 });
  points[3] = add(points[2], rotateX({ x: -0.012, y: 0.022, z: 0.012 }, curl * 0.35));
  points[4] = add(points[3], rotateX({ x: -0.006, y: 0.018, z: 0.01 }, curl * 0.55));

  // Palm centre point isn't a MediaPipe landmark, but wrist is.
  points[0] = { x: 0, y: 0, z: 0 };
  return points;
}

function placeHand(wrist, elbow, curl, spread) {
  const local = handLocal(curl, spread);
  let yAxis = normalize(sub(wrist, elbow));
  if (length(yAxis) < 1e-4) yAxis = { x: 0, y: -1, z: 0 };
  let xAxis = normalize(cross(yAxis, { x: 0, y: 0, z: 1 }));
  if (length(xAxis) < 1e-4) xAxis = { x: 1, y: 0, z: 0 };
  const zAxis = normalize(cross(xAxis, yAxis));
  return local.map((p) =>
    add(wrist, add(add(scale(xAxis, p.x), scale(yAxis, p.y)), scale(zAxis, p.z))),
  );
}

function blinkAt(t) {
  const cycle = 3.8;
  const phase = (t % cycle) / cycle;
  if (phase < 0.9) return 0;
  const p = (phase - 0.9) / 0.1;
  return Math.sin(p * Math.PI) ** 2;
}

export class DemoMotion {
  constructor() {
    this.started = performance.now() / 1000;
  }

  sample(t) {
    const time = t - this.started + 1.35;
    const sway = Math.sin(time * 1.15);
    const bounce = Math.max(0, Math.sin(time * 2.3)) * 0.035;
    const hipYaw = sway * 0.16;
    const hipCenter = {
      x: sway * 0.035,
      y: bounce - 0.01,
      z: Math.sin(time * 0.7) * 0.01,
    };

    const shoulderYaw = hipYaw * 0.75 + Math.sin(time * 0.55) * 0.07;
    const shoulderCenter = add(hipCenter, rotateY({ x: sway * 0.012, y: 0.515, z: 0 }, shoulderYaw));
    const shoulderHalf = rotateY({ x: 0.185, y: 0, z: 0 }, shoulderYaw);
    const shoulderL = sub(shoulderCenter, shoulderHalf);
    const shoulderR = add(shoulderCenter, shoulderHalf);

    const hipHalf = rotateY({ x: 0.098, y: 0, z: 0 }, hipYaw);
    const hipL = sub(hipCenter, hipHalf);
    const hipR = add(hipCenter, hipHalf);

    // Head / neck.
    const headYaw = Math.sin(time * 0.82 + 0.4) * 0.3;
    const headPitch = Math.sin(time * 1.3) * 0.07;
    const headRoll = Math.sin(time * 0.62) * 0.1;
    const headCenter = add(shoulderCenter, {
      x: Math.sin(time * 0.82) * 0.012,
      y: 0.255 + Math.sin(time * 2.3) * 0.006,
      z: 0.008,
    });
    const headPoint = (local) => add(headCenter, rotateEuler(local, headPitch, headYaw, headRoll));

    // Arms: side -1 = person's left, +1 = right.
    const armPose = (side, phase) => {
      const raise = 0.38 + 0.9 * (0.5 + 0.5 * Math.sin(time * 1.55 + phase));
      const theta = side * (0.3 + raise);
      const bend = 0.4 + 0.55 * (0.5 + 0.5 * Math.sin(time * 2.1 + phase * 1.7));
      const upperZ = Math.sin(time * 1.4 + phase) * 0.13;
      const foreZ = Math.sin(time * 1.9 + phase) * 0.2;
      const upperDir = normalize({ x: Math.sin(theta), y: -Math.cos(theta), z: upperZ });
      const foreDir = normalize({
        x: Math.sin(theta + side * bend),
        y: -Math.cos(theta + side * bend),
        z: foreZ,
      });
      const shoulder = side < 0 ? shoulderL : shoulderR;
      const elbow = add(shoulder, scale(upperDir, 0.275));
      const wrist = add(elbow, scale(foreDir, 0.255));
      const curl = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(time * 2.7 + phase));
      const spread = 0.95 + 0.12 * Math.sin(time * 1.8 + phase);
      return { elbow, wrist, hand: placeHand(wrist, elbow, curl, spread) };
    };

    const leftArm = armPose(-1, 0);
    const rightArm = armPose(1, 2.2);

    // Legs.
    const liftL = Math.max(0, Math.sin(time * 2.3)) * 0.055;
    const liftR = Math.max(0, Math.sin(time * 2.3 + Math.PI)) * 0.055;
    const ankleL = { x: hipL.x - 0.012, y: -0.84 + liftL, z: 0.02 + liftL * 0.8 };
    const ankleR = { x: hipR.x + 0.012, y: -0.84 + liftR, z: 0.02 + liftR * 0.8 };
    const kneeL = solveKnee(hipL, ankleL);
    const kneeR = solveKnee(hipR, ankleR);
    const heelL = add(ankleL, { x: -0.005, y: -0.018, z: -0.05 });
    const heelR = add(ankleR, { x: 0.005, y: -0.018, z: -0.05 });
    const toeL = add(ankleL, { x: -0.005, y: -0.045, z: 0.145 });
    const toeR = add(ankleR, { x: 0.005, y: -0.045, z: 0.145 });

    const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
    const set = (i, p) => {
      world[i] = p;
    };

    set(0, headPoint({ x: 0, y: -0.012, z: 0.112 }));
    set(1, headPoint({ x: -0.026, y: 0.035, z: 0.092 }));
    set(2, headPoint({ x: -0.046, y: 0.038, z: 0.088 }));
    set(3, headPoint({ x: -0.065, y: 0.032, z: 0.078 }));
    set(4, headPoint({ x: 0.026, y: 0.035, z: 0.092 }));
    set(5, headPoint({ x: 0.046, y: 0.038, z: 0.088 }));
    set(6, headPoint({ x: 0.065, y: 0.032, z: 0.078 }));
    set(7, headPoint({ x: -0.078, y: 0.012, z: -0.005 }));
    set(8, headPoint({ x: 0.078, y: 0.012, z: -0.005 }));
    set(9, headPoint({ x: -0.026, y: -0.058, z: 0.098 }));
    set(10, headPoint({ x: 0.026, y: -0.058, z: 0.098 }));
    set(11, shoulderL);
    set(12, shoulderR);
    set(13, leftArm.elbow);
    set(14, rightArm.elbow);
    set(15, leftArm.wrist);
    set(16, rightArm.wrist);
    set(17, leftArm.hand[17]);
    set(18, rightArm.hand[17]);
    set(19, leftArm.hand[5]);
    set(20, rightArm.hand[5]);
    set(21, leftArm.hand[1]);
    set(22, rightArm.hand[1]);
    set(23, hipL);
    set(24, hipR);
    set(25, kneeL);
    set(26, kneeR);
    set(27, ankleL);
    set(28, ankleR);
    set(29, heelL);
    set(30, heelR);
    set(31, toeL);
    set(32, toeR);

    // Normalized landmarks for the preview overlay.
    const landmarks = world.map((p) => ({
      x: 0.5 + p.x * 0.37,
      y: 0.5 - p.y * 0.3,
      z: p.z * 0.37,
      visibility: 1,
    }));

    const blink = blinkAt(time);
    const jawOpen = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(time * 3.1 + 0.7));
    const smile = 0.48 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.25));
    const brow = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.7 + 1.2));
    const gazeX = Math.sin(time * 0.78) * 0.72;
    const gazeY = Math.sin(time * 1.04 + 0.6) * 0.42;
    const energy = clamp(
      0.28 + 0.32 * Math.abs(Math.sin(time * 2.3)) + 0.22 * Math.abs(Math.sin(time * 1.55)),
      0,
      1,
    );

    const eyeOpen = 1 - blink;
    return {
      mode: 'demo',
      time,
      pose: {
        world,
        landmarks,
        confidence: 0.985,
        feetConfidence: 0.965,
        bodyConfidence: 0.985,
      },
      face: {
        detected: true,
        demo: true,
        confidence: 0.972,
        blink,
        eyeOpen,
        jawOpen,
        smile,
        brow,
        gazeX,
        gazeY,
      },
      hands: [
        { handedness: 'Left', world: leftArm.hand, confidence: 0.968, demo: true },
        { handedness: 'Right', world: rightArm.hand, confidence: 0.954, demo: true },
      ],
      metrics: {
        body: 0.985,
        face: 0.972,
        hands: 1,
        feet: 0.965,
        eyes: eyeOpen,
        mouth: jawOpen,
        blink,
        jaw: jawOpen,
        smile,
        gazeX,
        gazeY,
        energy,
        points: 553,
        facePoints: 478,
      },
    };
  }
}
