import '@fontsource/bebas-neue/400.css';
import '@fontsource/space-grotesk/300.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';

import * as THREE from 'three';
import { Stage } from './scene.js';
import { SpiderCharacter } from './character.js';
import { DemoMotion } from './demo.js';
import { MotionTracker, PREVIEW_LINKS } from './tracking.js';

const SPIDER_SVG = `
<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <ellipse cx="32" cy="25" rx="6.5" ry="8" fill="currentColor" stroke="none"/>
  <ellipse cx="32" cy="40" rx="5.2" ry="8.2" fill="currentColor" stroke="none"/>
  <path d="M26 22C18 19 14 12 11 5M38 22c8-3 12-10 15-17M24 28C15 28 9 33 5 40M40 28c9 0 15 5 19 12M25 34C16 39 12 47 9 56M39 34c9 5 13 13 16 22M29 40c-6 8-8 15-8 21M35 40c6 8 8 15 8 21"/>
</svg>`;

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);

const dom = {
  sourceChip: $('sourceChip'),
  sourceLabel: $('sourceLabel'),
  modelChip: $('modelChip'),
  modelLabel: $('modelLabel'),
  cameraBtn: $('cameraBtn'),
  camStatus: $('camStatus'),
  feedBadge: $('feedBadge'),
  feedEmpty: $('feedEmpty'),
  feedRes: $('feedRes'),
  feedMs: $('feedMs'),
  feedHz: $('feedHz'),
  video: $('video'),
  overlay: $('overlay'),
  fpsValue: $('fpsValue'),
  fpsDelta: $('fpsDelta'),
  inferValue: $('inferValue'),
  hzValue: $('hzValue'),
  dprValue: $('dprValue'),
  resValue: $('resValue'),
  rendererLabel: $('rendererLabel'),
  bodyLockValue: $('bodyLockValue'),
  lockBar: $('lockBar'),
  yawValue: $('yawValue'),
  yawNum: $('yawNum'),
  pitchNum: $('pitchNum'),
  rollNum: $('rollNum'),
  yawBar: $('yawBar'),
  pitchBar: $('pitchBar'),
  rollBar: $('rollBar'),
  orientationRing: $('orientationRing'),
  jawBar: $('jawBar'), jawNum: $('jawNum'),
  blinkLBar: $('blinkLBar'), blinkLNum: $('blinkLNum'),
  blinkRBar: $('blinkRBar'), blinkRNum: $('blinkRNum'),
  smileBar: $('smileBar'), smileNum: $('smileNum'),
  browBar: $('browBar'), browNum: $('browNum'),
  jointGrid: $('jointGrid'),
  sparkline: $('sparkline'),
  dockStatusTitle: $('dockStatusTitle'),
  dockStatusSub: $('dockStatusSub'),
  toast: $('toast'),
  toastText: $('toastText'),
  toastIcon: $('toastIcon'),
  loader: $('loader'),
  loaderBar: $('loaderBar'),
  loaderStatus: $('loaderStatus'),
  loaderMark: $('loaderMark'),
  brandMark: $('brandMark'),
  qualityHint: $('qualityHint'),
  maskState: $('maskState'),
  engineLabel: $('engineLabel'),
  viewFull: $('viewFull'),
  viewFace: $('viewFace'),
  orbitToggle: $('orbitToggle'),
  demoBtn: $('demoBtn'),
  liveBtn: $('liveBtn'),
  maskBtn: $('maskBtn'),
  skeletonBtn: $('skeletonBtn'),
  snapshotBtn: $('snapshotBtn'),
  skeletonToggle: $('skeletonToggle'),
  mirrorToggle: $('mirrorToggle'),
  bodyToggle: $('bodyToggle'),
  faceToggle: $('faceToggle'),
  qualitySelect: $('qualitySelect'),
  maskSegs: [...document.querySelectorAll('[data-mask]')],
};

const state = {
  mode: 'demo',
  mask: true,
  body: true,
  face: true,
  mirror: true,
  skeleton3d: false,
  overlay: true,
  quality: 'auto',
  cameraStarting: false,
  modelsReady: false,
  modelError: false,
  lastMotion: null,
  lastLiveMotion: null,
  lastStats: 0,
  fpsSamples: [],
  toastTimer: 0,
  bootTime: performance.now(),
  cameraErrorShown: false,
  softwareNoted: false,
};

dom.brandMark.innerHTML = SPIDER_SVG;
dom.loaderMark.innerHTML = SPIDER_SVG;

let stage = null;
let tracker = null;
let character = null;
let demo = null;
let restFrame = null;
let bootDone = false;

const scratchTarget = new THREE.Vector3();

function zeroFace() {
  return {
    yaw: 0, pitch: 0, roll: 0, jaw: 0, smile: 0, brow: 0, squint: 0,
    blinkL: 0, blinkR: 0,
  };
}

function setLoaderProgress(pct, text) {
  dom.loaderBar.style.width = `${Math.max(4, Math.min(100, pct))}%`;
  if (text) dom.loaderStatus.textContent = text;
}

function hideLoader() {
  if (bootDone) return;
  bootDone = true;
  setLoaderProgress(100, 'Suit interface online');
  setTimeout(() => {
    dom.loader.classList.add('is-done');
    showToast('Demo signal active — enable camera for live full-body capture.', 'info', 5200);
  }, 420);
}

function toastIconFor(type) {
  if (type === 'error') return '!';
  if (type === 'ok') return '✓';
  return 'i';
}

function showToast(text, type = 'info', duration = 4200) {
  dom.toastText.textContent = text;
  dom.toastIcon.textContent = toastIconFor(type);
  dom.toast.style.borderColor = type === 'error'
    ? 'rgba(255, 61, 86, 0.45)'
    : type === 'ok'
      ? 'rgba(46, 230, 168, 0.4)'
      : 'rgba(255, 181, 69, 0.35)';
  dom.toast.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), duration);
}

function updateModelChip(text, level) {
  dom.modelLabel.textContent = text;
  dom.modelChip.className = `chip ${level === 'ready' ? 'chip--ok' : level === 'error' ? 'chip--warn' : 'chip--ghost'}`;
}

function setSourceChip(live) {
  dom.sourceLabel.textContent = live ? 'CAMERA LIVE' : 'DEMO SIGNAL';
  dom.sourceChip.className = `chip ${live ? 'chip--live' : 'chip--ghost'}`;
  dom.camStatus.className = `mini-status ${live ? 'is-live' : ''}`;
  dom.camStatus.innerHTML = `<i></i>${live ? 'LIVE' : 'DEMO'}`;
  dom.feedBadge.textContent = live ? 'LIVE OPTICAL TARGET' : 'SYNTHETIC TARGET';
  dom.feedBadge.classList.toggle('is-live', live);
  dom.feedEmpty.classList.remove('is-visible');
  dom.dockStatusTitle.textContent = live ? 'LIVE OPTICAL CAPTURE' : 'SYNTHETIC FEED';
  dom.dockStatusSub.textContent = live ? 'on-device inference · 33 body / 478 face' : '60 fps · procedural motion';
  dom.cameraBtn.classList.toggle('is-on', live);
  const strong = dom.cameraBtn.querySelector('.btn__label strong');
  const small = dom.cameraBtn.querySelector('.btn__label small');
  if (live) {
    strong.textContent = 'Camera active';
    small.textContent = 'Click to return to demo';
  } else {
    strong.textContent = 'Enable camera';
    small.textContent = 'Start real-time capture';
  }
  dom.demoBtn.classList.toggle('is-active', !live);
  dom.demoBtn.setAttribute('aria-pressed', String(!live));
  dom.liveBtn.classList.toggle('is-active', live);
  dom.liveBtn.setAttribute('aria-pressed', String(live));
}

function setMask(masked, announce = false) {
  state.mask = masked;
  character.setMasked(masked);
  dom.maskSegs.forEach((el) => el.classList.toggle('is-on', (el.dataset.mask === '1') === masked));
  dom.maskBtn.setAttribute('aria-pressed', String(masked));
  dom.maskState.textContent = masked ? 'On' : 'Off';
  dom.maskBtn.classList.toggle('is-active', masked);
  if (announce) showToast(masked ? 'Spider-suit mask engaged.' : 'Mask removed — face capture mapped to Peter Parker.', 'ok', 3000);
}

function setGalleryMode(live) {
  if (live) {
    startCamera();
  } else {
    stopCamera();
    state.mode = 'demo';
    state.lastLiveMotion = null;
    setSourceChip(false);
  }
}

async function initTracker() {
  if (!tracker) return;
  try {
    await tracker.init();
    state.modelsReady = true;
    state.modelError = false;
    updateModelChip(`AI READY · ${tracker.delegate}`, 'ready');
    dom.engineLabel.textContent = `WEBGL 2 · ${tracker.delegate}`;
    if (state.mode === 'camera' && !tracker.cameraOn) {
      await tracker.enableCamera();
    }
  } catch (err) {
    state.modelError = true;
    updateModelChip('AI UNAVAILABLE', 'error');
    const msg = /permission|denied|notallowed/i.test(String(err))
      ? 'Camera permission was denied. Demo motion remains available.'
      : 'Neural models could not initialize. Demo motion remains available.';
    showToast(msg, 'error', 6000);
  }
}

async function startCamera() {
  if (state.cameraStarting) return;
  if (!tracker.ready) {
    showToast('Warming the neural core — one moment.', 'info', 3500);
    try {
      await tracker.init();
      state.modelsReady = true;
      updateModelChip(`AI READY · ${tracker.delegate}`, 'ready');
    } catch (err) {
      showToast('Neural models are unavailable in this browser. Demo is still running.', 'error', 6000);
      return;
    }
  }
  state.cameraStarting = true;
  const btnStrong = dom.cameraBtn.querySelector('.btn__label strong');
  const previous = btnStrong.textContent;
  btnStrong.textContent = 'Opening camera';
  try {
    await tracker.enableCamera();
    state.mode = 'camera';
    state.lastLiveMotion = null;
    state.lastMotion = null;
    setSourceChip(true);
    dom.feedRes.textContent = tracker.cameraSize;
    showToast('Live capture online. Step back so your full body is in frame.', 'ok', 5000);
  } catch (err) {
    console.error(err);
    state.mode = 'demo';
    state.lastLiveMotion = null;
    setSourceChip(false);
    dom.feedBadge.textContent = 'SYNTHETIC TARGET';
    const message = /permission|denied|notallowed/i.test(String(err))
      ? 'Camera permission denied — demo signal remains active.'
      : 'No camera available — demo signal remains active.';
    showToast(message, 'error', 6500);
    dom.feedEmpty.classList.add('is-visible');
  } finally {
    state.cameraStarting = false;
    if (state.mode === 'demo') btnStrong.textContent = previous;
    else btnStrong.textContent = 'Camera active';
  }
}

function stopCamera() {
  if (!tracker || !tracker.cameraOn) return;
  tracker.stopCamera();
  setSourceChip(false);
  dom.feedEmpty.classList.remove('is-visible');
  showToast('Camera released. Demo motion engaged.', 'info', 3000);
}

/* ------------------------------------------------------------------ */
/* Landmark overlay                                                    */
/* ------------------------------------------------------------------ */

const overlayCanvas = dom.overlay;
const octx = overlayCanvas.getContext('2d');
const OW = overlayCanvas.width;
const OH = overlayCanvas.height;

function drawSyntheticBg(now) {
  const g = octx.createRadialGradient(OW / 2, OH * 0.44, 10, OW / 2, OH * 0.5, OW * 0.62);
  g.addColorStop(0, 'rgba(17, 32, 56, 0.95)');
  g.addColorStop(0.6, 'rgba(7, 12, 21, 0.98)');
  g.addColorStop(1, 'rgba(4, 7, 12, 1)');
  octx.fillStyle = g;
  octx.fillRect(0, 0, OW, OH);

  // Floor ellipse.
  octx.strokeStyle = 'rgba(91, 152, 232, 0.16)';
  octx.lineWidth = 1;
  octx.beginPath();
  octx.ellipse(OW / 2, OH * 0.86, OW * 0.26, OH * 0.07, 0, 0, Math.PI * 2);
  octx.stroke();

  // Horizon ticks.
  octx.strokeStyle = 'rgba(107, 220, 255, 0.08)';
  for (let i = 0; i < 7; i++) {
    const y = OH * (0.68 + i * 0.035);
    octx.beginPath();
    octx.moveTo(OW * 0.18, y);
    octx.lineTo(OW * 0.82, y);
    octx.stroke();
  }

  // Synthetic watermark.
  octx.save();
  octx.font = '500 10px "IBM Plex Mono", monospace';
  octx.fillStyle = 'rgba(196, 214, 240, 0.37)';
  octx.letterSpacing = '2px';
  octx.fillText('SYNTHETIC PERFORMANCE', 16, 24);
  octx.fillStyle = 'rgba(225, 29, 56, 0.8)';
  octx.fillRect(16, 31, 34 + Math.sin(now * 0.003) * 8, 1);
  octx.restore();
}

function drawSkeleton(points, face, opts = {}) {
  if (!points) return;
  const dim = opts.dim ? 0.34 : 1;
  const map = (p) => [p[0] * OW, p[1] * OH];

  // Body silhouette glow.
  octx.save();
  octx.lineCap = 'round';
  octx.lineJoin = 'round';
  octx.strokeStyle = `rgba(225, 29, 56, ${0.1 * dim})`;
  octx.lineWidth = 15;
  for (const [a, b] of PREVIEW_LINKS) {
    if (!points[a] || !points[b]) continue;
    const [ax, ay] = map(points[a]);
    const [bx, by] = map(points[b]);
    octx.beginPath();
    octx.moveTo(ax, ay);
    octx.lineTo(bx, by);
    octx.stroke();
  }
  octx.strokeStyle = `rgba(255, 78, 102, ${0.2 * dim})`;
  octx.lineWidth = 4;
  for (const [a, b] of PREVIEW_LINKS) {
    if (!points[a] || !points[b]) continue;
    const [ax, ay] = map(points[a]);
    const [bx, by] = map(points[b]);
    octx.beginPath();
    octx.moveTo(ax, ay);
    octx.lineTo(bx, by);
    octx.stroke();
  }

  // Cyan skeleton.
  octx.strokeStyle = `rgba(137, 231, 255, ${0.9 * dim})`;
  octx.lineWidth = 1.35;
  octx.shadowColor = 'rgba(107, 220, 255, 0.6)';
  octx.shadowBlur = 7;
  for (const [a, b] of PREVIEW_LINKS) {
    if (!points[a] || !points[b]) continue;
    const [ax, ay] = map(points[a]);
    const [bx, by] = map(points[b]);
    octx.beginPath();
    octx.moveTo(ax, ay);
    octx.lineTo(bx, by);
    octx.stroke();
  }
  octx.shadowBlur = 0;

  // Joints.
  for (const key of Object.keys(points)) {
    if (key === 'shoulderMid') continue;
    const [x, y] = map(points[key]);
    octx.beginPath();
    octx.arc(x, y, key === 'head' ? 3 : 2.1, 0, Math.PI * 2);
    octx.fillStyle = key === 'head' ? 'rgba(255, 255, 255, 0.95)' : `rgba(255, 92, 112, ${0.92 * dim})`;
    octx.fill();
    if (key === 'head' || key === 'hips') {
      octx.beginPath();
      octx.arc(x, y, key === 'head' ? 7 : 5, 0, Math.PI * 2);
      octx.strokeStyle = `rgba(255, 255, 255, ${0.32 * dim})`;
      octx.lineWidth = 1;
      octx.stroke();
    }
  }

  // Face mesh point cloud.
  if (face && face.length) {
    octx.fillStyle = `rgba(151, 242, 255, ${0.72 * dim})`;
    for (const p of face) {
      octx.fillRect(p[0] * OW, p[1] * OH, 1.3, 1.3);
    }
  }

  // Head reticle.
  if (points.head) {
    const [hx, hy] = map(points.head);
    octx.strokeStyle = `rgba(255, 255, 255, ${0.3 * dim})`;
    octx.lineWidth = 1;
    octx.beginPath();
    octx.arc(hx, hy, 17, 0.2, Math.PI * 0.72);
    octx.arc(hx, hy, 17, Math.PI + 0.2, Math.PI + Math.PI * 0.72);
    octx.stroke();
  }
  octx.restore();
}

function drawOverlay(now) {
  if (!dom.overlay || !state.overlay) {
    octx.clearRect(0, 0, OW, OH);
    return;
  }
  const live = state.mode === 'camera' && tracker?.cameraOn;
  if (live && tracker.canvas.width > 0) {
    octx.save();
    if (state.mirror) {
      octx.translate(OW, 0);
      octx.scale(-1, 1);
    }
    octx.drawImage(tracker.canvas, 0, 0, OW, OH);
    octx.restore();
    // Darken for HUD legibility.
    const vignette = octx.createRadialGradient(OW / 2, OH / 2, OH * 0.25, OW / 2, OH / 2, OW * 0.65);
    vignette.addColorStop(0, 'rgba(2, 5, 10, 0)');
    vignette.addColorStop(1, 'rgba(2, 5, 10, 0.46)');
    octx.fillStyle = vignette;
    octx.fillRect(0, 0, OW, OH);
  } else {
    drawSyntheticBg(now);
  }

  if (!state.overlay) return;
  const motion = state.mode === 'camera' ? state.lastLiveMotion : state.lastMotion;
  if (motion?.preview) {
    drawSkeleton(motion.preview.pose, motion.preview.face, { dim: !state.body });
  } else if (live) {
    octx.save();
    octx.font = '500 10px "IBM Plex Mono", monospace';
    octx.fillStyle = 'rgba(255, 181, 69, 0.9)';
    octx.fillText('ACQUIRING FULL-BODY TARGET…', 16, 26);
    octx.restore();
  }

  // Corner status.
  octx.save();
  octx.font = '500 9px "IBM Plex Mono", monospace';
  octx.fillStyle = 'rgba(255, 255, 255, 0.56)';
  octx.fillText(live ? 'BODY 33 · FACE 478' : 'BODY 33 · FACE 478 · SYNTH', 16, OH - 16);
  octx.textAlign = 'right';
  octx.fillStyle = live ? 'rgba(46, 230, 168, 0.85)' : 'rgba(255, 92, 112, 0.8)';
  octx.fillText(live ? 'TRACKING' : 'SIMULATED', OW - 16, OH - 16);
  octx.restore();
}

/* ------------------------------------------------------------------ */
/* Telemetry                                                           */
/* ------------------------------------------------------------------ */

let sparkSvg = null;
let sparkLine = null;
let sparkArea = null;

function initSparkline() {
  dom.sparkline.innerHTML = `
    <svg viewBox="0 0 200 32" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff3d56" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#ff3d56" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon class="spark-fill" points=""/>
      <polyline points=""/>
    </svg>`;
  sparkSvg = dom.sparkline.querySelector('svg');
  sparkLine = dom.sparkline.querySelector('polyline');
  sparkArea = dom.sparkline.querySelector('polygon');
}

function updateSparkline(fps) {
  if (!sparkLine) return;
  state.fpsSamples.push(fps);
  if (state.fpsSamples.length > 40) state.fpsSamples.shift();
  const pts = state.fpsSamples.map((v, i) => {
    const x = (i / 39) * 200;
    const y = 30 - Math.max(0, Math.min(60, v)) / 60 * 27;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  sparkLine.setAttribute('points', pts.join(' '));
  sparkArea.setAttribute('points', `0,32 ${pts.join(' ')} 200,32`);
}

function meter(el, numEl, value) {
  const v = THREE.MathUtils.clamp(value || 0, 0, 1);
  el.style.transform = `scaleX(${v.toFixed(3)})`;
  numEl.textContent = Math.round(v * 100);
}

function orientationBar(el, deg, range = 45) {
  const clamped = THREE.MathUtils.clamp(deg, -range, range);
  const pct = Math.abs(clamped) / range * 50;
  el.style.left = clamped < 0 ? `${50 - pct}%` : '50%';
  el.style.width = `${pct}%`;
}

function updateStats(now) {
  if (!stage || !character) return;
  if (now - state.lastStats < 110) return;
  state.lastStats = now;

  const f = character.faceSmoothed;
  const yawDeg = (f.yaw * 180) / Math.PI;
  const pitchDeg = (f.pitch * 180) / Math.PI;
  const rollDeg = (f.roll * 180) / Math.PI;

  dom.yawValue.textContent = `${yawDeg >= 0 ? '+' : ''}${Math.round(yawDeg)}°`;
  dom.yawNum.textContent = `${Math.round(yawDeg)}°`;
  dom.pitchNum.textContent = `${Math.round(pitchDeg)}°`;
  dom.rollNum.textContent = `${Math.round(rollDeg)}°`;
  dom.orientationRing.style.setProperty('--yaw-deg', `${Math.min(360, Math.abs(yawDeg) * 4)}deg`);
  orientationBar(dom.yawBar, yawDeg, 45);
  orientationBar(dom.pitchBar, pitchDeg, 35);
  orientationBar(dom.rollBar, rollDeg, 35);

  meter(dom.jawBar, dom.jawNum, f.jaw);
  meter(dom.blinkLBar, dom.blinkLNum, f.blinkL);
  meter(dom.blinkRBar, dom.blinkRNum, f.blinkR);
  meter(dom.smileBar, dom.smileNum, f.smile);
  meter(dom.browBar, dom.browNum, f.brow);

  const live = state.mode === 'camera' && tracker?.cameraOn;
  const motion = live ? state.lastLiveMotion : state.lastMotion;
  const confidence = motion?.confidence ?? 0.98;
  const lockPct = Math.round(THREE.MathUtils.clamp(confidence, 0, 1) * 100);
  dom.bodyLockValue.textContent = `${lockPct}%`;
  dom.lockBar.style.width = `${lockPct}%`;
  dom.lockBar.style.background = lockPct > 70
    ? 'linear-gradient(90deg, rgba(46,230,168,.3), #2ee6a8)'
    : 'linear-gradient(90deg, rgba(255,181,69,.3), #ffb545)';
  dom.jointGrid.querySelectorAll('span').forEach((el, i) => {
    const on = lockPct > 35 + i * 3;
    el.classList.toggle('is-on', on);
  });

  const fps = stage.fps;
  dom.fpsValue.textContent = Math.round(fps);
  dom.fpsDelta.textContent = stage.softwareRenderer
    ? 'software'
    : fps > 55 ? 'stable' : fps > 42 ? 'adaptive' : 'optimizing';
  dom.inferValue.textContent = live ? tracker.inferMs.toFixed(1) : '—';
  dom.hzValue.textContent = live ? Math.round(tracker.hz || 30) : '—';
  dom.dprValue.textContent = stage.pixelRatio.toFixed(2);
  dom.resValue.textContent = `${window.innerWidth}×${window.innerHeight}`;
  dom.rendererLabel.textContent = stage.softwareRenderer
    ? 'WEBGL · SW'
    : stage.renderer.capabilities.isWebGL2 ? 'WEBGL 2' : 'WEBGL 1';
  dom.engineLabel.textContent = `WEBGL 2 · ${state.modelsReady ? tracker.delegate : 'STANDBY'}`;
  if (stage.softwareRenderer && !state.softwareNoted) {
    state.softwareNoted = true;
    dom.rendererLabel.title = stage.gpuName;
    dom.dockStatusSub.textContent = 'CPU software rasterizer · no GPU';
  }
  if (live) {
    dom.feedMs.textContent = `${tracker.inferMs.toFixed(1)} ms`;
    dom.feedHz.textContent = `${Math.round(tracker.hz || 30)} Hz`;
    dom.feedRes.textContent = tracker.cameraSize;
    dom.dockStatusSub.textContent = `${Math.round(fps)} fps · ${Math.round(tracker.inferMs)} ms inference · ${tracker.delegate}`;
  } else {
    dom.feedMs.textContent = '— ms';
    dom.feedHz.textContent = 'demo';
  }
  updateSparkline(fps);
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

let lastFrame = performance.now();
let elapsed = 0;

function buildAppliedMotion(raw) {
  if (!raw) return restFrame;
  let joints = raw.joints;
  let root = raw.root;
  if (!state.body) {
    joints = restFrame.joints;
    root = restFrame.root;
  }
  const face = state.face ? raw.face : zeroFace();
  return {
    joints,
    root,
    face,
    confidence: raw.confidence,
    ground: state.body,
  };
}

function loop(now) {
  requestAnimationFrame(loop);
  const dtRaw = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = Math.min(Math.max(dtRaw, 0.001), 0.05);
  elapsed += dt;

  let live = null;
  if (state.mode === 'camera' && tracker?.cameraOn) {
    live = tracker.sample(now);
    if (live) state.lastLiveMotion = live;
  }
  // Keep the procedural performance warm: it also covers the moment between
  // enabling the camera and the first confident pose.
  state.lastMotion = demo.update(dt, elapsed);
  const raw = state.mode === 'camera'
    ? (state.lastLiveMotion || state.lastMotion)
    : state.lastMotion;
  const applied = buildAppliedMotion(raw);
  if (applied && character) character.applyMotion(applied, dt);
  if (stage) {
    stage.update(dt, elapsed);
    stage.render();
  }
  drawOverlay(now);
  updateStats(now);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function bindUI() {
  dom.cameraBtn.addEventListener('click', () => {
    if (state.mode === 'camera') stopCamera();
    else startCamera();
  });
  dom.liveBtn.addEventListener('click', () => {
    if (state.mode === 'camera') return;
    startCamera();
  });
  dom.demoBtn.addEventListener('click', () => {
    if (state.mode === 'demo') return;
    stopCamera();
    state.mode = 'demo';
    state.lastLiveMotion = null;
    setSourceChip(false);
  });

  dom.maskBtn.addEventListener('click', () => setMask(!state.mask, true));
  dom.maskSegs.forEach((el) => {
    el.addEventListener('click', () => setMask(el.dataset.mask === '1', false));
  });

  dom.skeletonBtn.addEventListener('click', () => {
    state.skeleton3d = !state.skeleton3d;
    character.setSkeletonVisible(state.skeleton3d);
    dom.skeletonBtn.classList.toggle('is-active', state.skeleton3d);
    dom.skeletonBtn.setAttribute('aria-pressed', String(state.skeleton3d));
    dom.skeletonToggle.classList.toggle('is-on', state.skeleton3d);
    dom.skeletonToggle.setAttribute('aria-checked', String(state.skeleton3d));
  });
  dom.skeletonToggle.addEventListener('click', () => dom.skeletonBtn.click());

  dom.mirrorToggle.addEventListener('click', () => {
    state.mirror = !state.mirror;
    tracker.setMirror(state.mirror);
    dom.mirrorToggle.classList.toggle('is-on', state.mirror);
    dom.mirrorToggle.setAttribute('aria-checked', String(state.mirror));
    showToast(state.mirror ? 'Input mirrored for selfie framing.' : 'Input unmirrored.', 'info', 2200);
  });

  dom.bodyToggle.addEventListener('click', () => {
    state.body = !state.body;
    dom.bodyToggle.classList.toggle('is-on', state.body);
    dom.bodyToggle.setAttribute('aria-pressed', String(state.body));
  });
  dom.faceToggle.addEventListener('click', () => {
    state.face = !state.face;
    dom.faceToggle.classList.toggle('is-on', state.face);
    dom.faceToggle.setAttribute('aria-pressed', String(state.face));
  });

  dom.qualitySelect.addEventListener('change', () => {
    state.quality = dom.qualitySelect.value;
    stage.setQuality(state.quality);
    tracker.setQuality(state.quality);
    const label = state.quality === 'auto'
      ? 'Adaptive · auto resolution'
      : state.quality === 'high'
        ? 'High · full effects'
        : state.quality === 'balanced'
          ? 'Balanced · 512px input'
          : 'Battery · 384px input';
    dom.qualityHint.textContent = label;
    showToast(`Render quality: ${dom.qualitySelect.options[dom.qualitySelect.selectedIndex].text}.`, 'info', 2200);
  });

  dom.viewFull.addEventListener('click', () => {
    stage.setView('full');
    dom.viewFull.classList.add('is-on');
    dom.viewFace.classList.remove('is-on');
    dom.viewFull.setAttribute('aria-pressed', 'true');
    dom.viewFace.setAttribute('aria-pressed', 'false');
  });
  dom.viewFace.addEventListener('click', () => {
    stage.setView('face');
    dom.viewFace.classList.add('is-on');
    dom.viewFull.classList.remove('is-on');
    dom.viewFace.setAttribute('aria-pressed', 'true');
    dom.viewFull.setAttribute('aria-pressed', 'false');
  });
  dom.orbitToggle.addEventListener('click', () => {
    const on = stage.toggleOrbit();
    dom.orbitToggle.classList.toggle('is-on', on);
    dom.orbitToggle.setAttribute('aria-pressed', String(on));
  });

  dom.snapshotBtn.addEventListener('click', () => {
    try {
      const data = stage.snapshot();
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = data;
      a.download = `spidertrack-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Snapshot saved to your downloads.', 'ok', 3000);
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.55;z-index:90;pointer-events:none;transition:opacity .4s ease;';
      document.getElementById('app').appendChild(flash);
      requestAnimationFrame(() => { flash.style.opacity = '0'; });
      setTimeout(() => flash.remove(), 500);
    } catch (err) {
      console.error(err);
      showToast('Snapshot could not be captured in this browser.', 'error', 4000);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'm' || e.key === 'M') setMask(!state.mask, true);
    if (e.key === 'c' || e.key === 'C') {
      if (state.mode === 'camera') stopCamera();
      else startCamera();
    }
    if (e.key === '1') dom.viewFull.click();
    if (e.key === '2') dom.viewFace.click();
    if (e.key === 's' || e.key === 'S') dom.skeletonBtn.click();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) lastFrame = performance.now();
  });

  dom.video.addEventListener('loadeddata', () => {
    dom.feedRes.textContent = tracker.cameraSize;
  });
}

async function boot() {
  initSparkline();
  setLoaderProgress(12, 'Calibrating suit interface');

  try {
    character = new SpiderCharacter();
    demo = new DemoMotion();
    restFrame = demo.update(0.016, 0.6);

    stage = new Stage(document.getElementById('scene'), character);
    dom.engineLabel.textContent = 'WEBGL 2 · STANDBY';
    setLoaderProgress(52, 'Weaving suit shader');
  } catch (err) {
    console.error('[SpiderTrack] WebGL init failed', err);
    setLoaderProgress(100, 'WebGL unavailable');
    dom.loaderStatus.textContent = 'WebGL 2 is required. Please enable hardware acceleration.';
    return;
  }

  tracker = new MotionTracker({
    onStatus: (text, level) => {
      if (level === 'ready') {
        state.modelsReady = true;
        updateModelChip(`AI READY · ${tracker.delegate}`, 'ready');
      } else if (level === 'error') {
        state.modelError = true;
        updateModelChip('AI UNAVAILABLE', 'error');
      } else {
        updateModelChip(text.toUpperCase(), 'loading');
      }
    },
  });
  tracker.setMirror(state.mirror);

  setMask(true, false);
  setSourceChip(false);
  bindUI();

  // Initial pose.
  character.applyMotion(restFrame, 1);
  stage.update(0.016, 0);
  stage.render();
  requestAnimationFrame(loop);

  setLoaderProgress(78, 'Warming stage lights');

  // Wait for fonts / first paint, then reveal.
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(() => {
    setLoaderProgress(100, 'Suit interface online');
    setTimeout(hideLoader, REDUCED ? 120 : 650);
  });

  setTimeout(() => {
    if (stage) {
      stage.resize();
      stage.render();
    }
  }, 180);

  // Load the neural models during idle time so "Enable camera" is instant.
  const kickModels = () => {
    initTracker().catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(kickModels, { timeout: 2800 });
  } else {
    setTimeout(kickModels, 1600);
  }
}

boot().catch((err) => {
  console.error(err);
  dom.loaderStatus.textContent = 'Unable to start the motion lab.';
});

// Expose a small debugging surface for capture automation.
window.__spidertrack = {
  get state() { return state; },
  get stage() { return stage; },
  get tracker() { return tracker; },
  get character() { return character; },
  get demo() { return demo; },
  setMask: (masked) => character.setMasked(masked),
  startCamera,
  stopCamera,
};
