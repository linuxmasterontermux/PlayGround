import './style.css';
import { AvatarScene } from './avatar.js';
import { DemoMotion } from './demo.js';
import { InputPreview } from './pip.js';
import { UI } from './ui.js';

const stage = document.getElementById('stage');
const pipCanvas = document.getElementById('pipCanvas');

const avatar = new AvatarScene(stage);
const demo = new DemoMotion();
const pip = new InputPreview(pipCanvas);
const ui = new UI();

let mode = 'demo';
let tracker = null;
let trackerModulePromise = null;
let cameraStarting = false;
let frame = demo.sample(performance.now() / 1000);
let introTimer = null;

const emptyCameraFrame = {
  mode: 'camera',
  pose: null,
  face: null,
  hands: [],
  metrics: {
    body: 0,
    face: 0,
    hands: 0,
    feet: 0,
    eyes: 0,
    mouth: 0,
    blink: 0,
    jaw: 0,
    smile: 0,
    gazeX: 0,
    gazeY: 0,
    energy: 0,
    points: 0,
    facePoints: 0,
  },
};

function loadTrackerModule() {
  if (!trackerModulePromise) trackerModulePromise = import('./tracking.js');
  return trackerModulePromise;
}

async function startCamera() {
  if (cameraStarting) return;
  if (mode === 'camera') {
    switchToDemo();
    return;
  }

  cameraStarting = true;
  if (introTimer) {
    clearInterval(introTimer);
    introTimer = null;
  }

  ui.setMode('loading');
  ui.setLoading(true, 0.03, 'Requesting camera access');

  let active = true;
  try {
    const mod = await loadTrackerModule();
    if (!tracker) {
      tracker = new mod.MotionTracker();
      avatar.setFaceConnections(mod.FACE_CONNECTIONS);
    }

    const cameraPromise = tracker.startCamera();
    const modelsPromise = tracker.initModels(({ progress, label }) => {
      if (active) ui.setLoading(true, 0.05 + progress * 0.93, label);
    });

    const [cameraInfo] = await Promise.all([cameraPromise, modelsPromise]);

    mode = 'camera';
    frame = emptyCameraFrame;
    ui.setMode('camera');
    ui.setLoading(false);
    ui.toast(
      `Camera online — ${cameraInfo.width} × ${cameraInfo.height}. Step back so your whole body is in frame.`,
      'info',
      4200,
    );
  } catch (error) {
    console.error('[kinetic] camera start failed', error);
    active = false;
    tracker?.stopCamera();
    mode = 'demo';
    frame = demo.sample(performance.now() / 1000);
    ui.setLoading(false);
    ui.setMode('error', {
      message:
        error?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Demo loop is still running — enable camera access to track yourself.'
          : 'Could not start the camera. Demo loop is still running. Check permissions and try again.',
    });
    setTimeout(() => {
      if (mode === 'demo') ui.setMode('demo');
    }, 3800);
  } finally {
    cameraStarting = false;
  }
}

function switchToDemo() {
  if (tracker) tracker.stopCamera();
  mode = 'demo';
  frame = demo.sample(performance.now() / 1000);
  ui.setMode('demo');
  ui.setLoading(false);
  ui.toast('Demo loop engaged. Synthetic subject is driving the rig.', 'info', 2600);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {
      ui.toast('Fullscreen is not available in this browser.', 'error');
    });
  } else {
    document.exitFullscreen?.();
  }
}

ui.on('camera', startCamera);
ui.on('demo', switchToDemo);
ui.on('layer', (name, active) => avatar.setLayer(name, active));
ui.on('reset', () => avatar.resetView());
ui.on('snapshot', () => {
  avatar.snapshot();
  ui.toast('Frame saved to your downloads.', 'info', 2200);
});
ui.on('fullscreen', toggleFullscreen);

ui.setMode('demo');
ui.setLoading(true, 0.12, 'Booting motion studio');

introTimer = setInterval(() => {
  const width = parseFloat(ui.el.loaderBar.style.width) || 0;
  const next = Math.min(100, width + 22);
  ui.setLoading(true, next / 100, next < 100 ? 'Calibrating studio' : 'Studio ready');
  if (next >= 100) {
    clearInterval(introTimer);
    introTimer = null;
    setTimeout(() => ui.setLoading(false), 280);
  }
}, 90);

let last = performance.now();
let fpsFrames = 0;
let fpsStart = last;
let fps = 60;
let pipAccum = 0;
let lastUI = 0;

function loop(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  const time = now / 1000;

  if (mode === 'camera' && tracker) {
    const next = tracker.detect(now);
    if (next) {
      frame = next;
    } else if (now - (tracker.lastFrameAt || 0) > 900) {
      frame = emptyCameraFrame;
    }
    if (!tracker.stream && !cameraStarting) {
      mode = 'demo';
      ui.setMode('demo');
    }
  } else {
    frame = demo.sample(time);
  }

  avatar.update(frame, dt, time);
  avatar.render();

  pipAccum += dt;
  if (pipAccum >= 1 / 15) {
    pip.draw(frame, tracker?.video, mode, fps);
    pipAccum = 0;
  }

  fpsFrames++;
  if (now - fpsStart > 500) {
    fps = (fpsFrames * 1000) / (now - fpsStart);
    fpsFrames = 0;
    fpsStart = now;
  }

  if (now - lastUI > 140) {
    ui.update(frame, {
      fps,
      latency: tracker?.latency ?? 0,
      pipFps: fps,
      energy: avatar.motionEnergy,
    });
    lastUI = now;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

window.addEventListener('pagehide', () => {
  tracker?.dispose?.();
  avatar.dispose();
});

// Expose a tiny debug surface for automated capture and manual inspection.
window.__kinetic = {
  get mode() {
    return mode;
  },
  get trackerReady() {
    return !!tracker?.ready;
  },
  get frame() {
    return frame;
  },
  avatar,
  ui,
  pip,
  demo,
};
