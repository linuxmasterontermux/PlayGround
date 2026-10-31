import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH = './vendor/mediapipe/wasm';
const POSE_MODEL = './vendor/models/pose_landmarker_lite.task';
const FACE_MODEL = './vendor/models/face_landmarker.task';

async function build(kind, vision, { gpu = true } = {}) {
  const Ctor = kind === 'pose' ? PoseLandmarker : FaceLandmarker;
  const baseOptions = {
    modelAssetPath: kind === 'pose' ? POSE_MODEL : FACE_MODEL,
    delegate: gpu ? 'GPU' : 'CPU',
  };
  const options = {
    baseOptions,
    runningMode: 'VIDEO',
    numPoses: 1,
    numFaces: 1,
  };
  if (kind === 'face') {
    options.outputFaceBlendshapes = true;
    options.outputFacialTransformationMatrixes = false;
    options.minFaceDetectionConfidence = 0.5;
    options.minFacePresenceConfidence = 0.5;
    options.minTrackingConfidence = 0.5;
  }
  return Ctor.createFromOptions(vision, options);
}

export class MotionTracker {
  constructor({ video, onPose, onFace, onMeta, onError, onPhase }) {
    this.video = video;
    this.onPose = onPose;
    this.onFace = onFace;
    this.onMeta = onMeta;
    this.onError = onError;
    this.onPhase = onPhase;

    this.pose = null;
    this.face = null;
    this.delegate = '—';
    this.faceDelegate = '—';
    this.running = false;
    this.faceEnabled = true;
    this.faceEvery = 1;
    this._frame = 0;
    this._rvfc = 0;
    this._raf = 0;
    this._errors = 0;

    this._step = this._step.bind(this);
  }

  async init() {
    this.onPhase?.('Loading vision engine');
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    this.onPhase?.('Loading pose model');
    try {
      this.pose = await build('pose', vision, { gpu: true });
      this.delegate = 'GPU';
    } catch (error) {
      console.warn('[spidermotion] GPU pose failed, retrying on CPU', error);
      this.pose = await build('pose', vision, { gpu: false });
      this.delegate = 'CPU';
    }

    if (this.faceEnabled) {
      this.onPhase?.('Loading face model');
      try {
        this.face = await build('face', vision, { gpu: this.delegate === 'GPU' });
        this.faceDelegate = this.delegate;
      } catch (error) {
        console.warn('[spidermotion] GPU face failed, retrying on CPU', error);
        try {
          this.face = await build('face', vision, { gpu: false });
          this.faceDelegate = 'CPU';
        } catch (fallbackError) {
          console.warn('[spidermotion] face tracking unavailable', fallbackError);
          this.face = null;
          this.faceEnabled = false;
        }
      }
    }

    this.onPhase?.('Ready');
  }

  setFaceEnabled(enabled) {
    this.faceEnabled = enabled && Boolean(this.face);
    if (enabled && !this.face) return false;
    return this.faceEnabled;
  }

  setFaceEvery(n) {
    this.faceEvery = Math.max(1, Math.round(n));
  }

  start() {
    if (this.running || !this.pose) return;
    this.running = true;
    this._errors = 0;
    this._schedule();
  }

  stop() {
    this.running = false;
    if (this._rvfc && this.video.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this._rvfc);
    }
    if (this._raf) cancelAnimationFrame(this._raf);
    this._rvfc = 0;
    this._raf = 0;
  }

  close() {
    this.stop();
    this.pose?.close();
    this.face?.close();
    this.pose = null;
    this.face = null;
  }

  _schedule() {
    if (!this.running) return;
    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this._rvfc = this.video.requestVideoFrameCallback(this._step);
    } else {
      this._raf = requestAnimationFrame(this._step);
    }
  }

  _step() {
    if (!this.running) return;
    if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
      this._process();
    }
    this._schedule();
  }

  _process() {
    const now = performance.now();
    const started = now;
    try {
      const pose = this.pose.detectForVideo(this.video, now);
      let face = null;
      if (
        this.face &&
        this.faceEnabled &&
        this._frame % this.faceEvery === 0
      ) {
        face = this.face.detectForVideo(this.video, now);
      }
      this._frame++;

      const inference = performance.now() - started;
      this.onPose?.(pose);
      this.onFace?.(face && face.faceLandmarks?.length ? face : null);
      this.onMeta?.({
        inference,
        delegate: this.delegate,
        faceDelegate: this.faceDelegate,
        faceActive: Boolean(this.face && this.faceEnabled),
        frame: this._frame,
      });
      this._errors = 0;
    } catch (error) {
      this._errors++;
      console.warn('[spidermotion] vision frame failed', error);
      if (this._errors > 5) {
        this.stop();
        this.onError?.(
          'The vision engine stopped unexpectedly. Switch to demo mode and try again.'
        );
      }
    }
  }
}
