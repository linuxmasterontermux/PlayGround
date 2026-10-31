import * as THREE from 'three';
import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

const ASSET_BASE = new URL('.', document.baseURI);
const asset = (path) => new URL(path, ASSET_BASE).href;

class OneEuro {
  constructor(minCutoff = 1.7, beta = 0.07, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, t) {
    if (!Number.isFinite(value)) return this.x ?? 0;
    if (this.x === null) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = Math.max(t - this.t, 1e-4);
    const dx = (value - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this.alpha(cutoff, dt);
    this.x += a * (value - this.x);
    this.t = t;
    return this.x;
  }
  reset() {
    this.x = null;
    this.dx = 0;
  }
}

const LANDMARK = {
  nose: 0,
  earL: 7,
  earR: 8,
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  pinkyL: 17,
  pinkyR: 18,
  indexL: 19,
  indexR: 20,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
  heelL: 29,
  heelR: 30,
  toeL: 31,
  toeR: 32,
};

const KEY_VISIBILITY = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];

const PREVIEW_LINKS = [
  ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['chest', 'shoulderL'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['wristL', 'handEndL'],
  ['chest', 'shoulderR'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['wristR', 'handEndR'],
  ['hips', 'hipL'], ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'toeL'],
  ['hips', 'hipR'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'toeR'],
];

export { PREVIEW_LINKS };

export class MotionTracker {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.ready = false;
    this.cameraOn = false;
    this.mirror = true;
    this.quality = 'auto';
    this.delegate = 'GPU';
    this.pose = null;
    this.face = null;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.stream = null;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 288;
    this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: false });

    this.filters = new Map();
    this.filterClock = 0;
    this.lastSample = 0;
    this.lastFace = 0;
    this.sampleCount = 0;
    this.inferMs = 0;
    this.hz = 0;
    this.latency = 0;
    this.trackInterval = 1000 / 30;
    this.faceStride = 2;
    this.faceSmooth = {
      jaw: 0, smile: 0, brow: 0, squint: 0, blinkL: 0, blinkR: 0,
      yaw: 0, pitch: 0, roll: 0,
    };
    this._joints = {};
    this.motion = null;
    this.frames = 0;
    this.lastVideoTime = -1;
    this.initPromise = null;
    this.preview = { pose: {}, face: [] };
  }

  _status(text, level = 'info') {
    this.onStatus(text, level);
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init();
    return this.initPromise;
  }

  async _init() {
    try {
      this._status('Loading inference core', 'working');
      const fileset = await FilesetResolver.forVisionTasks(asset('wasm'));
      const wantGPU = !/force-cpu/i.test(location.search);
      const createPose = async (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('models/pose_landmarker_lite.task'), delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      const createFace = async (delegate) => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('models/face_landmarker.task'), delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      this._status('Calibrating body model', 'working');
      try {
        if (!wantGPU) throw new Error('CPU requested');
        this.pose = await createPose('GPU');
        this.delegate = 'GPU';
      } catch (err) {
        console.warn('[SpiderTrack] Pose GPU delegate unavailable, using CPU.', err);
        this.pose = await createPose('CPU');
        this.delegate = 'CPU';
      }

      this._status('Calibrating face model', 'working');
      try {
        if (!wantGPU) throw new Error('CPU requested');
        this.face = await createFace('GPU');
      } catch (err) {
        console.warn('[SpiderTrack] Face GPU delegate unavailable, using CPU.', err);
        this.face = await createFace('CPU');
      }

      this.ready = true;
      this._status(`Neural core ready · ${this.delegate}`, 'ready');
      return true;
    } catch (err) {
      console.error('[SpiderTrack] Tracker init failed', err);
      this._status('Neural core unavailable · demo signal active', 'error');
      throw err;
    }
  }

  setMirror(v) {
    this.mirror = v;
  }

  setQuality(q) {
    this.quality = q;
    if (q === 'high') {
      this.canvas.width = 640;
      this.canvas.height = 360;
      this.faceStride = 1;
      this.trackInterval = 1000 / 30;
    } else if (q === 'battery') {
      this.canvas.width = 384;
      this.canvas.height = 216;
      this.faceStride = 3;
      this.trackInterval = 1000 / 18;
    } else if (q === 'balanced') {
      this.canvas.width = 512;
      this.canvas.height = 288;
      this.faceStride = 2;
      this.trackInterval = 1000 / 24;
    } else {
      this.canvas.width = 512;
      this.canvas.height = 288;
      this.faceStride = 2;
      this.trackInterval = 1000 / 30;
    }
    this._resetFilters();
  }

  _resetFilters() {
    this.filters.clear();
    this.lastSample = 0;
    this.lastFace = 0;
    this.sampleCount = 0;
    this.lastVideoTime = -1;
  }

  async enableCamera() {
    if (!this.ready) await this.init();
    if (this.cameraOn) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose a camera interface.');
    }
    this._status('Requesting camera permission', 'working');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    this.stream = stream;
    this.video.srcObject = stream;
    await new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Camera stream failed to initialize.')); };
      const cleanup = () => {
        this.video.removeEventListener('loadedmetadata', ok);
        this.video.removeEventListener('error', fail);
      };
      this.video.addEventListener('loadedmetadata', ok, { once: true });
      this.video.addEventListener('error', fail, { once: true });
    });
    await this.video.play();
    this.cameraOn = true;
    this._resetFilters();
    this._status('Live optical capture', 'live');
    return true;
  }

  stopCamera() {
    this.cameraOn = false;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.motion = null;
    this._status('Camera offline · demo signal active', 'idle');
  }

  get cameraSize() {
    return `${this.video.videoWidth || 0}×${this.video.videoHeight || 0}`;
  }

  _filter(name, vec) {
    let f = this.filters.get(name);
    if (!f) {
      f = [new OneEuro(), new OneEuro(), new OneEuro()];
      this.filters.set(name, f);
    }
    const t = this.filterClock;
    return new THREE.Vector3(
      f[0].filter(vec.x, t),
      f[1].filter(vec.y, t),
      f[2].filter(vec.z, t),
    );
  }

  _toChar(lm, hip, mirror) {
    const hx = hip.x;
    const hy = hip.y;
    const hz = hip.z;
    return new THREE.Vector3(
      (mirror ? -1 : 1) * (lm.x - hx),
      -(lm.y - hy),
      -(lm.z - hz),
    );
  }

  _mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  }

  /** Run one inference step. Returns a motion frame or null. */
  sample(now) {
    if (!this.cameraOn || !this.ready) return null;
    if (this.video.readyState < 2 || this.video.videoWidth === 0) return null;
    if (this.video.currentTime === this.lastVideoTime) return null;
    if (now - this.lastSample < this.trackInterval) return null;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const targetAR = cw / ch;
    let sw = vw;
    let sh = vh;
    let sx = 0;
    let sy = 0;
    if (vw / vh > targetAR) {
      sw = vh * targetAR;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAR;
      sy = (vh - sh) / 2;
    }
    this.ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, cw, ch);
    this.lastVideoTime = this.video.currentTime;

    const t0 = performance.now();
    let poseResult = null;
    try {
      poseResult = this.pose.detectForVideo(this.canvas, now);
    } catch (err) {
      console.warn('[SpiderTrack] Pose inference failed', err);
      return null;
    }
    const dt = now - (this.lastSample || now);
    this.lastSample = now;
    this.sampleCount++;
    this.filterClock = now / 1000;

    const doFace = this.sampleCount % this.faceStride === 0;
    let faceResult = null;
    if (doFace && this.face) {
      try {
        faceResult = this.face.detectForVideo(this.canvas, now + 0.01);
      } catch (err) {
        console.warn('[SpiderTrack] Face inference failed', err);
      }
    }

    const infer = performance.now() - t0;
    this.inferMs += (infer - this.inferMs) * 0.12;
    if (now - this.lastFace > 100) {
      const measuredHz = 1000 / Math.max(now - this.lastFace, 1);
      this.hz += (measuredHz - this.hz) * 0.2;
      this.lastFace = now;
    }

    // Adaptive inference budget.
    if (this.quality === 'auto') {
      if (this.inferMs > 44 && this.trackInterval < 1000 / 18) {
        this.trackInterval = 1000 / 18;
        this.faceStride = 3;
      } else if (this.inferMs > 28 && this.trackInterval < 1000 / 24) {
        this.trackInterval = 1000 / 24;
        this.faceStride = 2;
      } else if (this.inferMs < 16 && this.trackInterval > 1000 / 30) {
        this.trackInterval = 1000 / 30;
        this.faceStride = 2;
      }
    }

    if (!poseResult?.worldLandmarks?.length) return null;

    const world = poseResult.worldLandmarks[0];
    const norm = poseResult.landmarks[0];
    const lm = (i) => world[i] || world[0];
    const hipL = lm(LANDMARK.hipL);
    const hipR = lm(LANDMARK.hipR);
    const hip = this._mid(hipL, hipR);
    const ankleL = lm(LANDMARK.ankleL);
    const ankleR = lm(LANDMARK.ankleR);
    const verticalL = ankleL.y - hipL.y;
    const verticalR = ankleR.y - hipR.y;
    const hipHeight = THREE.MathUtils.clamp(Math.max(verticalL, verticalR) * 1.01, 0.45, 1.08);

    const j = this._joints;
    const conv = (landmark) => this._toChar(landmark, hip, this.mirror);
    const convName = (name, landmark) => {
      j[name] = this._filter(`${name}`, conv(landmark));
    };

    const earL = lm(LANDMARK.earL);
    const earR = lm(LANDMARK.earR);
    const headLM = this._mid(earL, earR);
    const shL = lm(LANDMARK.shoulderL);
    const shR = lm(LANDMARK.shoulderR);
    const shoulderMid = this._mid(shL, shR);

    convName('hips', hip);

    const spineWorld = {
      x: hip.x + (shoulderMid.x - hip.x) * 0.28,
      y: hip.y + (shoulderMid.y - hip.y) * 0.28,
      z: hip.z + (shoulderMid.z - hip.z) * 0.28,
    };
    convName('spine', spineWorld);

    convName('chest', shoulderMid);

    const neckWorld = {
      x: shoulderMid.x + (headLM.x - shoulderMid.x) * 0.28,
      y: shoulderMid.y + (headLM.y - shoulderMid.y) * 0.28,
      z: shoulderMid.z + (headLM.z - shoulderMid.z) * 0.28,
    };
    convName('neck', neckWorld);
    convName('head', headLM);

    convName('shoulderL', shL);
    convName('shoulderR', shR);
    convName('elbowL', lm(LANDMARK.elbowL));
    convName('elbowR', lm(LANDMARK.elbowR));
    convName('wristL', lm(LANDMARK.wristL));
    convName('wristR', lm(LANDMARK.wristR));

    const handDir = (pinky, index, wrist) => {
      const mx = (pinky.x + index.x) / 2;
      const my = (pinky.y + index.y) / 2;
      const mz = (pinky.z + index.z) / 2;
      const dx = mx - wrist.x;
      const dy = my - wrist.y;
      const dz = mz - wrist.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return { x: wrist.x + (dx / len) * 0.095, y: wrist.y + (dy / len) * 0.095, z: wrist.z + (dz / len) * 0.095 };
    };
    convName('handEndL', handDir(lm(LANDMARK.pinkyL), lm(LANDMARK.indexL), lm(LANDMARK.wristL)));
    convName('handEndR', handDir(lm(LANDMARK.pinkyR), lm(LANDMARK.indexR), lm(LANDMARK.wristR)));

    convName('hipL', hipL);
    convName('hipR', hipR);
    convName('kneeL', lm(LANDMARK.kneeL));
    convName('kneeR', lm(LANDMARK.kneeR));
    convName('ankleL', ankleL);
    convName('ankleR', ankleR);
    convName('toeL', lm(LANDMARK.toeL));
    convName('toeR', lm(LANDMARK.toeR));

    // Lift the skeleton so the hips sit at the measured hip height.
    for (const key of Object.keys(j)) j[key].y += hipHeight;

    // Face pose + blendshapes.
    const face = { ...this.faceSmooth };
    let faceLandmarks = null;
    let faceDetected = false;
    if (faceResult?.faceLandmarks?.length) {
      faceDetected = true;
      faceLandmarks = faceResult.faceLandmarks[0];
      this._faceFromLandmarks(faceLandmarks, face);
      const bs = faceResult.faceBlendshapes?.[0]?.categories;
      if (bs) {
        const get = (name) => bs.find((c) => c.categoryName === name)?.score || 0;
        face.blinkL = get('eyeBlinkLeft');
        face.blinkR = get('eyeBlinkRight');
        face.jaw = get('jawOpen');
        face.smile = (get('mouthSmileLeft') + get('mouthSmileRight')) * 0.5;
        face.brow = Math.max(0, get('browInnerUp') - get('browDownLeft') * 0.2 - get('browDownRight') * 0.2);
        face.squint = (get('cheekSquintLeft') + get('cheekSquintRight')) * 0.5;
      }
      const fAlpha = 0.6;
      for (const key of Object.keys(this.faceSmooth)) {
        this.faceSmooth[key] += ((face[key] || 0) - this.faceSmooth[key]) * fAlpha;
      }
    } else {
      for (const key of Object.keys(this.faceSmooth)) {
        this.faceSmooth[key] *= 0.92;
      }
    }

    const mobility = poseResult.landmarks[0];
    let visSum = 0;
    for (const i of KEY_VISIBILITY) visSum += mobility[i]?.visibility ?? 0.8;
    const confidence = visSum / KEY_VISIBILITY.length;

    this.latency = this.inferMs;

    // Preview landmarks. The preview canvas is mirrored in CSS/draw.
    const preview = { pose: {}, face: [], head: null };
    const pMap = (name, idx) => {
      const p = mobility[idx];
      preview.pose[name] = [this.mirror ? 1 - p.x : p.x, p.y];
    };
    pMap('shoulderL', 11); pMap('shoulderR', 12);
    pMap('elbowL', 13); pMap('elbowR', 14);
    pMap('wristL', 15); pMap('wristR', 16);
    pMap('hipL', 23); pMap('hipR', 24);
    pMap('kneeL', 25); pMap('kneeR', 26);
    pMap('ankleL', 27); pMap('ankleR', 28);
    pMap('toeL', 31); pMap('toeR', 32);
    preview.pose.hips = [
      (preview.pose.hipL[0] + preview.pose.hipR[0]) / 2,
      (preview.pose.hipL[1] + preview.pose.hipR[1]) / 2,
    ];
    preview.pose.shoulderMid = [
      (preview.pose.shoulderL[0] + preview.pose.shoulderR[0]) / 2,
      (preview.pose.shoulderL[1] + preview.pose.shoulderR[1]) / 2,
    ];
    const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    preview.pose.spine = mid(preview.pose.hips, preview.pose.shoulderMid, 0.28);
    preview.pose.chest = preview.pose.shoulderMid;
    const headNorm = { x: (mobility[7].x + mobility[8].x) / 2, y: (mobility[7].y + mobility[8].y) / 2 };
    const headPx = [this.mirror ? 1 - headNorm.x : headNorm.x, headNorm.y];
    preview.pose.neck = mid(preview.pose.shoulderMid, headPx, 0.28);
    preview.pose.head = [headPx[0], headPx[1] - 0.015];
    preview.pose.handEndL = [preview.pose.wristL[0] + (preview.pose.wristL[0] - preview.pose.elbowL[0]) * 0.18, preview.pose.wristL[1] + (preview.pose.wristL[1] - preview.pose.elbowL[1]) * 0.18];
    preview.pose.handEndR = [preview.pose.wristR[0] + (preview.pose.wristR[0] - preview.pose.elbowR[0]) * 0.18, preview.pose.wristR[1] + (preview.pose.wristR[1] - preview.pose.elbowR[1]) * 0.18];
    if (faceLandmarks) {
      for (let i = 0; i < faceLandmarks.length; i += 6) {
        const p = faceLandmarks[i];
        preview.face.push([this.mirror ? 1 - p.x : p.x, p.y]);
      }
    }
    preview.head = { x: preview.pose.head[0], y: preview.pose.head[1], r: 0.075 };
    this.preview = preview;

    this.motion = {
      joints: j,
      root: { x: 0, y: hipHeight, z: 0 },
      face,
      confidence,
      source: 'camera',
      preview,
      faceDetected,
    };
    return this.motion;
  }

  _faceFromLandmarks(f, face) {
    const p234 = f[234];
    const p454 = f[454];
    const nose = f[1];
    const eyeL = f[33];
    const eyeR = f[263];
    const chin = f[152];
    const forehead = f[10];
    if (!p234 || !p454 || !nose || !chin || !forehead) return;

    const width = Math.max(0.001, Math.abs(p454.x - p234.x));
    const midX = (p234.x + p454.x) / 2;
    const faceHeight = Math.max(0.001, Math.abs(chin.y - forehead.y));
    const eyeMidY = ((eyeL?.y ?? 0.4) + (eyeR?.y ?? 0.4)) / 2;

    let yaw = ((nose.x - midX) / width) * 2.9;
    let pitch = (((nose.y - eyeMidY) / faceHeight) - 0.3) * 2.1;
    let roll = Math.atan2(p454.y - p234.y, p454.x - p234.x);

    yaw = THREE.MathUtils.clamp(this.mirror ? -yaw : yaw, -0.85, 0.85);
    pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
    roll = THREE.MathUtils.clamp(this.mirror ? -roll : roll, -0.5, 0.5);

    face.yaw = yaw;
    face.pitch = pitch;
    face.roll = roll;
  }

  dispose() {
    this.stopCamera();
    this.pose?.close?.();
    this.face?.close?.();
    this.ready = false;
  }
}
