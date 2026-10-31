import * as THREE from 'three';
import { createStage } from './scene.js';
import { Spidey } from './character.js';
import { MotionTracker } from './tracking.js';
import { createPreview } from './preview.js';

const $ = (id) => document.getElementById(id);

const AUTOMATION = navigator.webdriver === true ||
  new URLSearchParams(location.search).has('demo');

const state = {
  mode: 'idle',
  masked: true,
  face: true,
  overlay: true,
  mirror: true,
  tracker: null,
  stream: null,
  cameraToken: 0,
  starting: false,
  lastVisionAt: 0,
  expressionAt: 0,
  hudAt: 0,
  visionEma: 0,
  visionAdaptAt: 0,
};

const els = {
  start: $('startScreen'),
  startBtn: $('startBtn'),
  demoBtn: $('demoBtn'),
  statusChip: $('statusChip'),
  statusText: $('statusText'),
  fps: $('fps'),
  latency: $('latency'),
  quality: $('quality'),
  panel: $('camPanel'),
  video: $('video'),
  overlay: $('overlay'),
  camLabel: $('camLabel'),
  camMeta: $('camMeta'),
  camBadge: $('camBadge'),
  liveDot: $('liveDot'),
  landmarkInfo: $('landmarkInfo'),
  btnCamera: $('btnCamera'),
  btnMask: $('btnMask'),
  btnFace: $('btnFace'),
  btnOverlay: $('btnOverlay'),
  btnMirror: $('btnMirror'),
  btnReset: $('btnReset'),
  valMask: $('valMask'),
  valFace: $('valFace'),
  valOverlay: $('valOverlay'),
  valMirror: $('valMirror'),
  hint: $('hint'),
  hintText: $('hintText'),
  mBlink: $('mBlink'),
  mJaw: $('mJaw'),
  mSmile: $('mSmile'),
  toast: $('toast'),
};

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

const stage = createStage($('scene'));
const spidey = new Spidey(stage.textures);
stage.scene.add(spidey.group);
spidey.setDemo(true);

const preview = createPreview({ canvas: els.overlay, panel: els.panel });
preview.setPose(null);
preview.setFace(null);

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

let toastTimer = 0;
function toast(message, duration = 4600) {
  if (!message) return;
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), duration);
}

function setStatus(kind, label) {
  els.statusChip.dataset.status = kind;
  els.statusText.textContent = label;
}

function setHint(message, visible = true) {
  if (els.hintText.textContent !== message) els.hintText.textContent = message;
  els.hint.dataset.visible = visible ? 'true' : 'false';
}

function setToggle(button, value, labelEl, labels = ['On', 'Off']) {
  button.classList.toggle('active', value);
  button.setAttribute('aria-pressed', String(value));
  if (labelEl) labelEl.textContent = value ? labels[0] : labels[1];
}

function setQualityLabel(name) {
  els.quality.textContent = `AUTO · ${name}`;
}

/* ------------------------------------------------------------------ */
/* Camera + vision                                                     */
/* ------------------------------------------------------------------ */

function stopStream() {
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
    state.stream = null;
  }
  els.video.srcObject = null;
}

function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(
      new Error('Camera access needs a secure context (https or localhost).')
    );
  }
  const token = ++state.cameraToken;
  return navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    })
    .then((stream) => {
      if (token !== state.cameraToken) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error('Camera request superseded.');
      }
      return stream;
    });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The camera did not respond in time.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function initTracker() {
  if (state.tracker?.pose) return state.tracker;
  const tracker = new MotionTracker({
    video: els.video,
    onPose: handlePose,
    onFace: handleFace,
    onMeta: handleMeta,
    onError: (message) => {
      toast(message);
      enterDemo('Vision engine stopped — demo mode');
    },
    onPhase: (phase) => {
      if (state.mode !== 'live') setStatus('loading', phase);
    },
  });
  try {
    await tracker.init();
    state.tracker = tracker;
    return tracker;
  } catch (error) {
    tracker.close();
    throw error;
  }
}

async function connectCamera() {
  if (state.starting) return;
  state.starting = true;
  setStatus('loading', 'Requesting camera');
  setHint('Allow camera access to begin tracking', true);
  els.quality.textContent = 'AUTO';

  try {
    stopStream();
    const raw = await withTimeout(requestCamera(), 7000);
    state.stream = raw;

    els.video.srcObject = raw;
    await els.video.play().catch(() => {});

    if (els.video.readyState < 2) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Camera stream did not start.')), 4000);
        els.video.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }

    setStatus('loading', 'Loading vision engine');
    const tracker = await initTracker();
    const faceAvailable = tracker.setFaceEnabled(state.face);
    tracker.setFaceEvery(1);
    tracker.start();

    if (!faceAvailable && state.face) {
      state.face = false;
      setToggle(els.btnFace, false, els.valFace);
      toast('Face model unavailable — body tracking is still live.');
    }

    enterLive();
    els.camMeta.textContent = tracker.delegate;
    updateLandmarkInfo();
    state.starting = false;
  } catch (error) {
    state.starting = false;
    state.cameraToken++;
    stopStream();
    const reason = error?.name === 'NotAllowedError'
      ? 'Camera permission denied. Allow access in your browser, then reconnect.'
      : error?.message || 'Camera unavailable.';
    enterDemo(reason);
  }
}

function enterDemo(message) {
  state.mode = 'demo';
  document.body.dataset.mode = 'demo';
  spidey.setDemo(true);
  state.tracker?.stop();
  stopStream();
  preview.clear();
  hintHold = 0;
  poseWasActive = false;
  state.lastVisionAt = 0;
  els.panel.dataset.mode = 'demo';
  els.camLabel.textContent = 'SYNTHETIC FEED';
  els.camMeta.textContent = 'DEMO';
  els.camBadge.textContent = 'DEMO';
  els.btnCamera.hidden = false;
  setStatus('demo', 'Demo mode');
  setHint('Demo animation — connect a camera to take control', true);
  els.overlay.getContext('2d').clearRect(0, 0, els.overlay.width, els.overlay.height);
  if (message) toast(message);
}

function enterLive() {
  state.mode = 'live';
  document.body.dataset.mode = 'live';
  spidey.setDemo(false);
  preview.clear();
  hintHold = 0;
  poseWasActive = false;
  state.lastVisionAt = 0;
  els.panel.dataset.mode = 'live';
  els.camLabel.textContent = 'LIVE CAMERA';
  els.camMeta.textContent = state.tracker?.delegate || 'GPU';
  els.camBadge.textContent = 'LIVE';
  els.btnCamera.hidden = true;
  setStatus('live', 'Tracking live');
  setHint('Step back so your whole body is in frame', true);
  els.landmarkInfo.textContent = '33 POSE · 478 FACE';
  requestAnimationFrame(() => els.video.play().catch(() => {}));
}

/* ------------------------------------------------------------------ */
/* Vision callbacks                                                    */
/* ------------------------------------------------------------------ */

function visionDt() {
  const now = performance.now();
  const dt = state.lastVisionAt ? (now - state.lastVisionAt) / 1000 : 1 / 30;
  state.lastVisionAt = now;
  return Math.min(0.08, Math.max(0.012, dt));
}

function handlePose(result) {
  if (state.mode !== 'live') return;
  preview.setPose(result);
  const world = result?.worldLandmarks?.[0];
  if (world) {
    spidey.applyPose(world, { mirror: state.mirror, dt: visionDt() });
  }
}

function handleFace(result) {
  if (state.mode !== 'live') return;
  preview.setFace(result);
  if (!result) return;
  const landmarks = result.faceLandmarks?.[0];
  const blends = result.faceBlendshapes?.[0]?.categories;
  if (landmarks) {
    spidey.applyFace(landmarks, blends, { mirror: state.mirror, dt: visionDt() });
  }
}

function handleMeta(meta) {
  const ms = meta.inference;
  els.latency.textContent = ms > 999 ? `${(ms / 1000).toFixed(1)}s` : String(Math.round(ms));

  state.visionEma = state.visionEma
    ? state.visionEma * 0.85 + ms * 0.15
    : ms;

  const now = performance.now();
  if (state.mode === 'live' && now - state.visionAdaptAt > 2600) {
    state.visionAdaptAt = now;
    const tracker = state.tracker;
    if (tracker?.faceEnabled) {
      const every = state.visionEma > 55 ? 3 : state.visionEma > 32 ? 2 : 1;
      if (every !== tracker.faceEvery) tracker.setFaceEvery(every);
    }
  }

  if (now - state.hudAt > 700) {
    state.hudAt = now;
    updateLandmarkInfo();
  }
}

function updateLandmarkInfo() {
  if (state.mode !== 'live') {
    els.landmarkInfo.textContent = '33 POSE · 478 FACE';
    return;
  }
  const tracker = state.tracker;
  const delegate = tracker?.delegate || '—';
  const face = tracker?.faceEnabled && tracker?.face ? '478 FACE' : 'FACE OFF';
  els.landmarkInfo.textContent = `33 POSE · ${face} · ${delegate}`;
  els.camMeta.textContent = face === 'FACE OFF' ? delegate : `${delegate} · FACE`;
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

els.startBtn.addEventListener('click', () => startExperience());
els.demoBtn.addEventListener('click', () => {
  hideStart();
  enterDemo();
});

function hideStart() {
  els.start.classList.add('is-hidden');
}

function startExperience() {
  hideStart();
  if (state.mode === 'live') return;
  if (AUTOMATION) {
    enterDemo();
    return;
  }
  connectCamera();
}

els.btnCamera.addEventListener('click', () => connectCamera());

els.btnMask.addEventListener('click', () => {
  state.masked = spidey.toggleMasked();
  setToggle(els.btnMask, state.masked, els.valMask);
  if (!state.masked) {
    setHint('Peter Parker unmasked — facial expressions are now visible', true);
    setTimeout(() => {
      if (state.mode === 'demo') {
        setHint('Demo animation — connect a camera to take control', true);
      }
    }, 6000);
  } else {
    setHint(
      state.mode === 'live'
        ? 'Step back so your whole body is in frame'
        : 'Demo animation — connect a camera to take control',
      true
    );
  }
});

els.btnFace.addEventListener('click', () => {
  if (!state.tracker) {
    state.face = !state.face;
    setToggle(els.btnFace, state.face, els.valFace);
    return;
  }
  state.face = !state.face;
  const applied = state.tracker.setFaceEnabled(state.face);
  state.face = applied;
  if (!applied) {
    toast('Face tracking is unavailable in this browser.');
    spidey.hasFace = false;
    preview.clearFace();
  }
  setToggle(els.btnFace, state.face, els.valFace);
  updateLandmarkInfo();
});

els.btnOverlay.addEventListener('click', () => {
  state.overlay = !state.overlay;
  setToggle(els.btnOverlay, state.overlay, els.valOverlay);
});

els.btnMirror.addEventListener('click', () => {
  state.mirror = !state.mirror;
  setToggle(els.btnMirror, state.mirror, els.valMirror);
  els.panel.classList.toggle('mirrored', state.mirror);
});

els.btnReset.addEventListener('click', () => {
  stage.resetView();
  toast('Camera view reset.', 1800);
});

els.panel.classList.toggle('mirrored', state.mirror);

window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'm') els.btnMask.click();
  else if (key === 'f') els.btnFace.click();
  else if (key === 'o') els.btnOverlay.click();
  else if (key === 'r') els.btnReset.click();
});

document.addEventListener('visibilitychange', () => {
  if (!state.tracker) return;
  if (document.hidden) {
    state.tracker.stop();
  } else if (state.mode === 'live') {
    state.lastVisionAt = 0;
    state.tracker.start();
  }
});

window.addEventListener('beforeunload', () => {
  state.tracker?.close();
  stopStream();
});

/* ------------------------------------------------------------------ */
/* Render loop + adaptive quality                                      */
/* ------------------------------------------------------------------ */

let last = performance.now();
let elapsed = 0;
let fpsFrames = 0;
let fpsElapsed = 0;
let fps = 60;
let qualityCooldown = 3;
let qualityLevel = 2;
let poseWasActive = false;
let hintHold = 0;
let lastMeterUpdate = 0;
let firstFrame = true;

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(raw, 0.05);
  elapsed += dt;

  stage.update(dt, elapsed);
  spidey.update(dt, elapsed);
  stage.renderer.render(stage.scene, stage.camera);

  preview.render(elapsed, {
    mode: state.mode,
    overlay: state.overlay,
    mirror: state.mirror,
  });

  // Expression readout (throttled).
  if (elapsed - lastMeterUpdate > 0.08) {
    lastMeterUpdate = elapsed;
    const e = spidey.expression;
    els.mBlink.style.width = `${Math.round(Math.min(1, e.blink) * 100)}%`;
    els.mJaw.style.width = `${Math.round(Math.min(1, e.jaw) * 100)}%`;
    els.mSmile.style.width = `${Math.round(Math.min(1, e.smile) * 100)}%`;
  }

  // Hint state.
  if (state.mode === 'live') {
    if (spidey.poseActive) {
      if (!poseWasActive) hintHold = elapsed + 4;
      setHint('Full-body tracking locked — move around', elapsed < hintHold);
      poseWasActive = true;
    } else {
      setHint('Step back so your whole body is in frame', true);
      poseWasActive = false;
    }
  } else if (state.mode === 'demo') {
    setHint('Demo animation — connect a camera to take control', true);
    hintHold = 0;
  }

  fpsFrames++;
  fpsElapsed += raw;
  if (fpsElapsed >= 0.6) {
    fps = fpsFrames / fpsElapsed;
    fpsFrames = 0;
    fpsElapsed = 0;
    els.fps.textContent = String(Math.min(99, Math.round(fps)));
    adaptQuality(dt);
  }

  if (firstFrame) {
    firstFrame = false;
    document.body.dataset.ready = 'true';
    setQualityLabel(stage.getQuality().name);
  }

  requestAnimationFrame(frame);
}

function adaptQuality() {
  if (qualityCooldown > 0) {
    qualityCooldown -= 0.6;
    return;
  }
  if (fps < 38 && qualityLevel > 0) {
    qualityLevel--;
    stage.setQuality(qualityLevel);
    qualityCooldown = 4;
    setQualityLabel(stage.getQuality().name);
  } else if (fps > 57 && qualityLevel < 2) {
    qualityLevel++;
    stage.setQuality(qualityLevel);
    qualityCooldown = 6;
    setQualityLabel(stage.getQuality().name);
  }
}

requestAnimationFrame(frame);

/* ------------------------------------------------------------------ */
/* Automated preview: let the demo render immediately                  */
/* ------------------------------------------------------------------ */

if (AUTOMATION) {
  setTimeout(() => {
    if (state.mode === 'idle') startExperience();
  }, 350);
}

window.__spidermotion = {
  state,
  spidey,
  stage,
  start: () => startExperience(),
  connect: () => connectCamera(),
  demo: () => {
    hideStart();
    enterDemo();
  },
  snapshot: () => {
    const gl = stage.renderer.getContext();
    return {
      mode: state.mode,
      masked: spidey.masked,
      poseActive: spidey.poseActive,
      fps,
      quality: stage.getQuality().name,
      context: gl ? gl.getParameter(gl.VERSION) : null,
    };
  },
};
