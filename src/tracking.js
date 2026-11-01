import {
  FilesetResolver,
  PoseLandmarker,
  FaceLandmarker,
  HandLandmarker,
} from '@mediapipe/tasks-vision';
import { clamp } from './filters.js';

const BASE = import.meta.env.BASE_URL || '/';
const MODEL_BASE = `${BASE}models/`;
const WASM_BASE = `${BASE}wasm`;

export const FACE_CONNECTIONS = {
  tesselation: FaceLandmarker.FACE_LANDMARKS_TESSELATION,
  lips: FaceLandmarker.FACE_LANDMARKS_LIPS,
  leftEye: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  rightEye: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
  leftIris: FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
  rightIris: FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
  leftBrow: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
  rightBrow: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
  oval: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
  contours: FaceLandmarker.FACE_LANDMARKS_CONTOURS,
};

const toWorld = (lm) => ({ x: lm.x, y: -lm.y, z: -lm.z });

const averageVisibility = (landmarks, indices) => {
  if (!landmarks) return 0;
  let total = 0;
  let count = 0;
  for (const index of indices) {
    const lm = landmarks[index];
    if (!lm) continue;
    total += lm.visibility ?? 0;
    count++;
  }
  return count ? total / count : 0;
};

const blendMap = (classifications) => {
  const map = {};
  if (!classifications) return map;
  for (const category of classifications.categories ?? []) {
    map[category.categoryName] = category.score;
  }
  return map;
};

const getGaze = (face) => {
  if (!face || face.length < 478) return { x: 0, y: 0 };
  const irisLeft = averagePoint(face, [468, 469, 470, 471, 472]);
  const irisRight = averagePoint(face, [473, 474, 475, 476, 477]);
  const leftInner = face[133];
  const leftOuter = face[33];
  const rightInner = face[362];
  const rightOuter = face[263];
  const leftTop = face[159];
  const leftBottom = face[145];
  const rightTop = face[386];
  const rightBottom = face[374];

  const horizontal = (iris, a, b) => {
    const min = Math.min(a.x, b.x);
    const max = Math.max(a.x, b.x);
    const span = Math.max(1e-5, max - min);
    return ((iris.x - min) / span) * 2 - 1;
  };
  const vertical = (iris, top, bottom) => {
    const min = Math.min(top.y, bottom.y);
    const max = Math.max(top.y, bottom.y);
    const span = Math.max(1e-5, max - min);
    return ((iris.y - min) / span) * 2 - 1;
  };

  const x = (horizontal(irisLeft, leftInner, leftOuter) + horizontal(irisRight, rightInner, rightOuter)) / 2;
  const y = (vertical(irisLeft, leftTop, leftBottom) + vertical(irisRight, rightTop, rightBottom)) / 2;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
};

function averagePoint(points, indices) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of indices) {
    x += points[i].x;
    y += points[i].y;
    z += points[i].z;
  }
  const n = indices.length;
  return { x: x / n, y: y / n, z: z / n };
}

async function createWithFallback(Cls, vision, options) {
  try {
    return await Cls.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'GPU' },
    });
  } catch (error) {
    console.warn(`[kinetic] GPU delegate unavailable for ${Cls.name}, falling back to CPU.`, error);
    return Cls.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
}

export class MotionTracker {
  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.setAttribute('aria-hidden', 'true');
    Object.assign(this.video.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      left: '-10px',
      bottom: '-10px',
    });
    document.body.appendChild(this.video);

    this.pose = null;
    this.face = null;
    this.hand = null;
    this.ready = false;
    this.stream = null;
    this.latest = null;
    this.latency = 0;
    this.lastVideoTime = -1;
    this.lastPoseAt = 0;
    this.lastFrameAt = 0;
    this.lastDetectAt = 0;
    this.detectInterval = 1000 / 30;
    this.error = null;
    this.delegate = 'GPU';
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose a camera API.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 60 },
      },
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    if (this.video.readyState < 2) {
      await new Promise((resolve) => {
        const done = () => {
          this.video.removeEventListener('loadeddata', done);
          resolve();
        };
        this.video.addEventListener('loadeddata', done);
        setTimeout(done, 2500);
      });
    }

    return {
      width: this.video.videoWidth,
      height: this.video.videoHeight,
    };
  }

  stopCamera() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.latest = null;
  }

  async initModels(onProgress = () => {}) {
    onProgress({ progress: 0.04, label: 'Loading vision runtime' });
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

    onProgress({ progress: 0.16, label: 'Loading body model' });
    this.pose = await createWithFallback(PoseLandmarker, vision, {
      baseOptions: {
        modelAssetPath: `${MODEL_BASE}pose_landmarker_lite.task`,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      outputSegmentationMasks: false,
    });

    onProgress({ progress: 0.5, label: 'Loading face + expression model' });
    this.face = await createWithFallback(FaceLandmarker, vision, {
      baseOptions: {
        modelAssetPath: `${MODEL_BASE}face_landmarker.task`,
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });

    onProgress({ progress: 0.82, label: 'Loading hand model' });
    this.hand = await createWithFallback(HandLandmarker, vision, {
      baseOptions: {
        modelAssetPath: `${MODEL_BASE}hand_landmarker.task`,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });

    this.ready = true;
    onProgress({ progress: 1, label: 'Calibrating tracking rig' });
  }

  /**
   * Run inference at ~30 Hz. Returns the newest frame, or the previous one.
   */
  detect(now) {
    if (!this.ready || !this.stream || this.video.readyState < 2) {
      return this.latest;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.latest;
    }

    if (now - this.lastDetectAt < this.detectInterval) {
      return this.latest;
    }

    this.lastDetectAt = now;
    this.lastVideoTime = this.video.currentTime;

    const started = performance.now();
    let poseResult = null;
    let faceResult = null;
    let handResult = null;

    try {
      poseResult = this.pose.detectForVideo(this.video, now);
    } catch (error) {
      console.warn('[kinetic] pose inference failed', error);
    }
    try {
      faceResult = this.face.detectForVideo(this.video, now);
    } catch (error) {
      console.warn('[kinetic] face inference failed', error);
    }
    try {
      handResult = this.hand.detectForVideo(this.video, now);
    } catch (error) {
      console.warn('[kinetic] hand inference failed', error);
    }

    this.latency = performance.now() - started;
    this.lastFrameAt = now;

    const poseLandmarks = poseResult?.landmarks?.[0] ?? null;
    const poseWorld = poseResult?.worldLandmarks?.[0] ?? null;
    const faceLandmarks = faceResult?.faceLandmarks?.[0] ?? null;
    const blendshapes = blendMap(faceResult?.faceBlendshapes?.[0]);
    const gaze = getGaze(faceLandmarks);

    const hands = [];
    if (handResult?.landmarks?.length) {
      for (let i = 0; i < handResult.landmarks.length; i++) {
        const handedness = handResult.handednesses?.[i]?.[0]?.categoryName ?? (i === 0 ? 'Left' : 'Right');
        const worldPoints = handResult.worldLandmarks?.[i];
        if (!worldPoints?.length) continue;

        const mapped = worldPoints.map(toWorld);
        const wrist = mapped[0];
        let anchor = null;
        if (poseWorld) {
          const poseWrist = poseWorld[handedness === 'Left' ? 15 : 16];
          if (poseWrist) anchor = toWorld(poseWrist);
        }
        if (!anchor) {
          anchor = {
            x: handedness === 'Left' ? 0.26 : -0.26,
            y: 0.16,
            z: 0.2,
          };
        }
        const offset = {
          x: anchor.x - wrist.x,
          y: anchor.y - wrist.y,
          z: anchor.z - wrist.z,
        };
        const placed = mapped.map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
          z: p.z + offset.z,
        }));

        hands.push({
          handedness,
          world: placed,
          landmarks: handResult.landmarks[i],
          confidence: 0.95,
          demo: false,
        });
      }
    }

    const bodyConfidence = poseLandmarks
      ? averageVisibility(poseLandmarks, [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28])
      : 0;
    const feetConfidence = poseLandmarks
      ? averageVisibility(poseLandmarks, [27, 28, 29, 30, 31, 32])
      : 0;
    const blink = clamp(((blendshapes.eyeBlinkLeft ?? 0) + (blendshapes.eyeBlinkRight ?? 0)) / 2);
    const jaw = clamp(blendshapes.jawOpen ?? 0);
    const smile = clamp(
      ((blendshapes.mouthSmileLeft ?? 0) + (blendshapes.mouthSmileRight ?? 0)) / 2,
    );
    const eyeOpen = 1 - blink;

    if (poseLandmarks) this.lastPoseAt = now;

    const metrics = {
      body: bodyConfidence,
      face: faceLandmarks ? 1 : 0,
      hands: hands.length / 2,
      feet: feetConfidence,
      eyes: faceLandmarks ? eyeOpen : 0,
      mouth: faceLandmarks ? jaw : 0,
      blink,
      jaw,
      smile,
      gazeX: gaze.x,
      gazeY: gaze.y,
      energy: 0,
      points: (poseLandmarks ? 33 : 0) + (faceLandmarks?.length ?? 0) + hands.length * 21,
      facePoints: faceLandmarks?.length ?? 0,
    };

    this.latest = {
      mode: 'camera',
      time: now / 1000,
      pose: poseLandmarks
        ? {
            world: poseWorld ? poseWorld.map(toWorld) : null,
            landmarks: poseLandmarks,
            confidence: bodyConfidence,
            bodyConfidence,
            feetConfidence,
          }
        : null,
      face: faceLandmarks
        ? {
            landmarks: faceLandmarks,
            blendshapes,
            demo: false,
            detected: true,
            confidence: 1,
            blink,
            eyeOpen,
            jawOpen: jaw,
            smile,
            brow: blendshapes.browInnerUp ?? 0,
            gazeX: gaze.x,
            gazeY: gaze.y,
          }
        : null,
      hands,
      metrics,
      latency: this.latency,
      delegate: this.delegate,
    };

    return this.latest;
  }

  dispose() {
    this.stopCamera();
    this.pose?.close?.();
    this.face?.close?.();
    this.hand?.close?.();
    this.pose = null;
    this.face = null;
    this.hand = null;
    this.ready = false;
  }
}
