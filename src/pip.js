const POSE_LINKS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [27, 31],
  [28, 30],
  [30, 32],
  [28, 32],
  [7, 0],
  [8, 0],
  [0, 9],
  [0, 10],
  [11, 7],
  [12, 8],
];

const HAND_LINKS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const EYE_R = [362, 382, 381, 380, 374, 373, 372, 371, 263];

const CYAN = '#5ff5ff';
const VIOLET = '#a78bfa';
const MAGENTA = '#ff5ecf';
const LIME = '#b8ff5c';
const WHITE = '#f2feff';

const lerp = (a, b, t) => a + (b - a) * t;

export class InputPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.scan = 0;
    this.background = this.buildBackground();
    this.scanGradient = null;
  }

  buildBackground() {
    const w = this.width;
    const h = this.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#08121c');
    bg.addColorStop(0.5, '#050b12');
    bg.addColorStop(1, '#020509');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w / 2, h * 0.5, 8, w / 2, h * 0.5, w * 0.42);
    glow.addColorStop(0, 'rgba(36,150,175,0.2)');
    glow.addColorStop(0.55, 'rgba(46,84,160,0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(95,245,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Scanlines are baked in; the moving beam is the only live element.
    ctx.fillStyle = 'rgba(95,245,255,0.022)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);

    return canvas;
  }

  draw(frame, video, mode, fps) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    this.scan = (this.scan + 1.8) % (h + 60);

    ctx.clearRect(0, 0, w, h);
    if (mode === 'camera' && video && video.readyState >= 2) {
      this.drawVideo(video);
      this.drawCameraOverlay(frame);
    } else {
      this.drawDemoBackground();
      this.drawDemoFeed(frame);
    }
    this.drawScanlines();
    this.drawChrome(mode, fps);
  }

  drawVideo(video) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, w - dx - dw, dy, dw, dh);
    ctx.restore();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(3,8,13,0.24)');
    grad.addColorStop(0.5, 'rgba(3,8,13,0)');
    grad.addColorStop(1, 'rgba(3,8,13,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  drawCameraOverlay(frame) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const pose = frame.pose?.landmarks;
    const face = frame.face?.landmarks;

    if (face) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(167,139,250,0.45)';
      for (let i = 0; i < face.length; i += 2) {
        const lm = face[i];
        ctx.fillRect((1 - lm.x) * w - 0.5, lm.y * h - 0.5, 1, 1);
      }
      ctx.strokeStyle = 'rgba(255,138,216,0.85)';
      ctx.lineWidth = 1;
      this.loop(LIPS, face, 0.86);
      ctx.strokeStyle = 'rgba(242,254,255,0.85)';
      this.loop(EYE_L, face, 0.9);
      this.loop(EYE_R, face, 0.9);
      ctx.strokeStyle = 'rgba(95,245,255,0.9)';
      ctx.fillStyle = 'rgba(242,254,255,0.95)';
      for (let i = 468; i < 478; i++) {
        const lm = face[i];
        if (!lm) continue;
        ctx.fillRect((1 - lm.x) * w - 0.9, lm.y * h - 0.9, 1.8, 1.8);
      }
      ctx.restore();
    }

    if (pose) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(95,245,255,0.14)';
      ctx.lineWidth = 4.5;
      for (const [a, b] of POSE_LINKS) {
        const pa = pose[a];
        const pb = pose[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo((1 - pa.x) * w, pa.y * h);
        ctx.lineTo((1 - pb.x) * w, pb.y * h);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(95,245,255,0.9)';
      ctx.lineWidth = 1.4;
      for (const [a, b] of POSE_LINKS) {
        const pa = pose[a];
        const pb = pose[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo((1 - pa.x) * w, pa.y * h);
        ctx.lineTo((1 - pb.x) * w, pb.y * h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(190,252,255,0.95)';
      for (let i = 0; i < pose.length; i++) {
        if (i >= 17 && i <= 22) continue;
        const lm = pose[i];
        if ((lm.visibility ?? 1) < 0.35) continue;
        ctx.beginPath();
        ctx.arc((1 - lm.x) * w, lm.y * h, i === 0 ? 2.2 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      this.drawFeet(pose, w, h, true);
    }

    for (const hand of frame.hands ?? []) {
      if (!hand.landmarks) continue;
      this.drawHand(hand.landmarks, w, h, true);
    }
  }

  drawDemoBackground() {
    this.ctx.drawImage(this.background, 0, 0);
  }

  drawDemoFeed(frame) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const pose = frame.pose?.world;
    if (!pose) return;

    const scale = h * 0.52;
    const project = (p) => ({
      x: w / 2 - p.x * scale,
      y: h * 0.53 - p.y * scale,
    });

    const pts = pose.map(project);

    // Ghost silhouette under the tracking lines.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(95,245,255,0.06)';
    ctx.lineWidth = 13;
    for (const [a, b] of POSE_LINKS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.restore();

    // Head.
    const nose = pts[0];
    const earMid = { x: (pts[7].x + pts[8].x) / 2, y: (pts[7].y + pts[8].y) / 2 };
    const headRadius = Math.max(12, Math.hypot(pts[7].x - pts[8].x, pts[7].y - pts[8].y) * 0.6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(167,139,250,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(earMid.x, earMid.y - headRadius * 0.05, headRadius, headRadius * 1.18, 0, 0, Math.PI * 2);
    ctx.stroke();

    const blink = frame.face?.blink ?? 0;
    const jaw = frame.face?.jawOpen ?? 0;
    const gazeX = frame.face?.gazeX ?? 0;
    const gazeY = frame.face?.gazeY ?? 0;
    const eyeY = earMid.y - headRadius * 0.14;
    const eyeDX = headRadius * 0.42;
    const eyeRX = headRadius * 0.22;
    const eyeRY = Math.max(0.5, headRadius * 0.1 * (1 - blink * 0.92));

    ctx.strokeStyle = 'rgba(242,254,255,0.9)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(earMid.x + dir * eyeDX, eyeY, eyeRX, eyeRY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(95,245,255,0.95)';
      ctx.beginPath();
      ctx.arc(
        earMid.x + dir * eyeDX + gazeX * eyeRX * 0.55,
        eyeY + gazeY * eyeRY * 0.65,
        Math.max(1.2, eyeRX * 0.3),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const mouthY = earMid.y + headRadius * 0.52;
    const mouthW = headRadius * 0.4;
    const mouthH = Math.max(1, headRadius * 0.05 + jaw * headRadius * 0.36);
    ctx.strokeStyle = 'rgba(255,138,216,0.95)';
    ctx.beginPath();
    ctx.ellipse(earMid.x, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Skeleton.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(95,245,255,0.12)';
    ctx.lineWidth = 6;
    for (const [a, b] of POSE_LINKS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(95,245,255,0.92)';
    ctx.lineWidth = 2;
    for (const [a, b] of POSE_LINKS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(210,253,255,0.96)';
    for (let i = 0; i < pts.length; i++) {
      if (i >= 17 && i <= 22) continue;
      const r = i === 0 ? 2.3 : i === 11 || i === 12 || i === 23 || i === 24 ? 2 : 1.4;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.drawFeet(pose, w, h, false);
    for (const hand of frame.hands ?? []) {
      if (hand.world) this.drawHandWorld(hand.world, w, h, scale, project);
    }
  }

  drawFeet(pose, w, h, normalized) {
    const ctx = this.ctx;
    const point = (i) => {
      const lm = pose[i];
      if (!lm) return null;
      return normalized
        ? { x: (1 - lm.x) * w, y: lm.y * h }
        : { x: w / 2 - lm.x * (h * 0.52), y: h * 0.53 - lm.y * (h * 0.52) };
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(184,255,92,0.14)';
    ctx.lineWidth = 5;
    for (const [a, b, c] of [
      [27, 29, 31],
      [28, 30, 32],
    ]) {
      const pa = point(a);
      const pb = point(b);
      const pc = point(c);
      if (!pa || !pb || !pc) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(184,255,92,0.85)';
    ctx.lineWidth = 1.6;
    for (const [a, b, c] of [
      [27, 29, 31],
      [28, 30, 32],
    ]) {
      const pa = point(a);
      const pb = point(b);
      const pc = point(c);
      if (!pa || !pb || !pc) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(184,255,92,0.95)';
      for (const p of [pb, pc]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawHand(points, w, h, normalized) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,94,207,0.14)';
    ctx.lineWidth = 5;
    for (const [a, b] of HAND_LINKS) {
      const pa = points[a];
      const pb = points[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo((1 - pa.x) * w, pa.y * h);
      ctx.lineTo((1 - pb.x) * w, pb.y * h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,94,207,0.9)';
    ctx.lineWidth = 1.4;
    for (const [a, b] of HAND_LINKS) {
      const pa = points[a];
      const pb = points[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo((1 - pa.x) * w, pa.y * h);
      ctx.lineTo((1 - pb.x) * w, pb.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,210,244,0.95)';
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.beginPath();
      ctx.arc((1 - p.x) * w, p.y * h, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHandWorld(points, w, h, scale, project) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,94,207,0.14)';
    ctx.lineWidth = 5;
    const pts = points.map(project);
    for (const [a, b] of HAND_LINKS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,94,207,0.9)';
    ctx.lineWidth = 1.5;
    for (const [a, b] of HAND_LINKS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,248,0.95)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  loop(indices, points, alpha) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < indices.length; i++) {
      const lm = points[indices[i]];
      if (!lm) continue;
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  drawScanlines() {
    const ctx = this.ctx;
    const w = this.width;
    if (!this.scanGradient) {
      const grad = ctx.createLinearGradient(0, -40, 0, 40);
      grad.addColorStop(0, 'rgba(95,245,255,0)');
      grad.addColorStop(0.5, 'rgba(95,245,255,0.06)');
      grad.addColorStop(1, 'rgba(95,245,255,0)');
      this.scanGradient = grad;
    }
    ctx.save();
    ctx.translate(0, this.scan);
    ctx.fillStyle = this.scanGradient;
    ctx.fillRect(0, -40, w, 80);
    ctx.restore();
  }

  drawChrome(mode, fps) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(167,196,208,0.55)';
    ctx.fillText(mode === 'camera' ? 'CAM / TRACKING' : 'SIM / MOTION', 12, 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(167,196,208,0.38)';
    ctx.fillText(`${Math.round(fps)} FPS`, w - 12, 18);
    ctx.restore();
  }
}
