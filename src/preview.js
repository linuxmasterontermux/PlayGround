const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  [11, 23], [12, 24], [23, 24], [11, 24], [12, 23],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
];

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const EYE_L = [33, 133, 159, 145, 153, 154, 155, 133];
const EYE_R = [362, 263, 386, 374, 380, 381, 382, 362];
const MOUTH = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 61];

export function createPreview({ canvas, panel }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  let pose = null;
  let face = null;
  let poseAge = 0;
  let faceAge = 0;

  const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 10, W * 0.5, H * 0.5, W * 0.72);
  bg.addColorStop(0, 'rgba(22, 30, 52, 0.9)');
  bg.addColorStop(0.62, 'rgba(8, 12, 22, 0.98)');
  bg.addColorStop(1, '#04060c');

  function setPose(result) {
    if (result?.landmarks?.length) {
      pose = result.landmarks[0];
      poseAge = performance.now();
    }
  }

  function setFace(result) {
    if (result?.faceLandmarks?.length) {
      face = result.faceLandmarks[0];
      faceAge = performance.now();
    }
  }

  function clearFace() {
    face = null;
  }

  function clear() {
    pose = null;
    face = null;
  }

  function map(point, mirror) {
    const x = (mirror ? 1 - point.x : point.x) * W;
    const y = point.y * H;
    return [x, y];
  }

  function drawDemo(time) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(74, 108, 180, 0.14)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x <= W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const cx = W * 0.5;
    const bob = Math.sin(time * 1.1) * 6;
    const sway = Math.sin(time * 0.55) * 14;
    const arm = Math.sin(time * 0.9) * 0.5 + 0.5;

    const hip = [cx + sway * 0.3, H * 0.57 + bob];
    const neck = [cx + sway * 0.5, H * 0.34 + bob];
    const head = [cx + sway * 0.6 + Math.sin(time * 0.36) * 9, H * 0.235 + bob];
    const shL = [neck[0] + 40, neck[1] + 12];
    const shR = [neck[0] - 40, neck[1] + 12];
    const hipL = [hip[0] + 22, hip[1]];
    const hipR = [hip[0] - 22, hip[1]];
    const elL = [shL[0] + 12 + arm * 8, shL[1] + 58];
    const elR = [shR[0] - 12 - arm * 8, shR[1] + 58];
    const wrL = [elL[0] + 6, elL[1] + 52 - arm * 20];
    const wrR = [elR[0] - 6, elR[1] + 52 - (1 - arm) * 20];
    const knL = [hipL[0] + 6, hip[1] + 66];
    const knR = [hipR[0] - 6, hip[1] + 66];
    const anL = [knL[0] - 4, knL[1] + 60];
    const anR = [knR[0] + 4, knR[1] + 60];

    const pts = { 0: head, 11: shL, 12: shR, 13: elL, 14: elR, 15: wrL, 16: wrR, 23: hipL, 24: hipR, 25: knL, 26: knR, 27: anL, 28: anR };
    const paths = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];

    ctx.strokeStyle = 'rgba(255, 61, 84, 0.68)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255, 45, 70, 0.8)';
    ctx.shadowBlur = 8;
    for (const [a, b] of paths) {
      if (!pts[a] || !pts[b]) continue;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Head + synthetic face.
    ctx.strokeStyle = 'rgba(121, 207, 255, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(head[0], head[1], 26, 32, 0, 0, Math.PI * 2);
    ctx.stroke();

    const eyeShift = Math.sin(time * 0.5) * 4;
    ctx.fillStyle = 'rgba(190, 231, 255, 0.9)';
    for (const [dx, dy] of [[-9, -4], [9, -4]]) {
      ctx.beginPath();
      ctx.arc(head[0] + dx + eyeShift, head[1] + dy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(121, 207, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(head[0] + eyeShift * 0.4, head[1] + 12, 7, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 130, 145, 0.95)';
    for (const key of Object.keys(pts)) {
      const [x, y] = pts[key];
      ctx.beginPath();
      ctx.arc(x, y, key === '0' ? 0 : 3.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground line + framing brackets.
    ctx.strokeStyle = 'rgba(93, 129, 215, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, H - 44);
    ctx.lineTo(W - 40, H - 44);
    ctx.stroke();

    const bracket = 18;
    const inset = 16;
    ctx.strokeStyle = 'rgba(255, 76, 100, 0.45)';
    ctx.lineWidth = 2;
    for (const [x, y, sx, sy] of [
      [inset, inset, 1, 1],
      [W - inset, inset, -1, 1],
      [inset, H - inset, 1, -1],
      [W - inset, H - inset, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * bracket);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * bracket, y);
      ctx.stroke();
    }

    // Scan sweep.
    const scanY = ((time * 42) % (H + 60)) - 30;
    const grad = ctx.createLinearGradient(0, scanY - 22, 0, scanY + 22);
    grad.addColorStop(0, 'rgba(255, 45, 70, 0)');
    grad.addColorStop(0.5, 'rgba(255, 45, 70, 0.12)');
    grad.addColorStop(1, 'rgba(255, 45, 70, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 22, W, 44);

    ctx.fillStyle = 'rgba(170, 186, 215, 0.55)';
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillText('SYNTHETIC INPUT / 33 PTS', 22, H - 12);
    ctx.fillStyle = 'rgba(255, 76, 100, 0.9)';
    ctx.beginPath();
    ctx.arc(W - 74, H - 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 120, 136, 0.7)';
    ctx.fillText('DEMO', W - 64, H - 12);
  }

  function drawLive(mirror, overlayEnabled, now) {
    ctx.clearRect(0, 0, W, H);

    if (!overlayEnabled) return;

    if (pose && now - poseAge < 600) {
      ctx.strokeStyle = 'rgba(255, 61, 84, 0.82)';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(255, 45, 70, 0.7)';
      ctx.shadowBlur = 6;
      for (const [a, b] of CONNECTIONS) {
        const pa = pose[a];
        const pb = pose[b];
        if (!pa || !pb) continue;
        const [x1, y1] = map(pa, mirror);
        const [x2, y2] = map(pb, mirror);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255, 233, 237, 0.92)';
      for (let i = 11; i < pose.length; i++) {
        const [x, y] = map(pose[i], mirror);
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (face && now - faceAge < 600) {
      ctx.strokeStyle = 'rgba(111, 198, 255, 0.85)';
      ctx.lineWidth = 1.2;
      const outlines = [FACE_OVAL, EYE_L, EYE_R, MOUTH];
      for (const outline of outlines) {
        ctx.beginPath();
        for (let i = 0; i < outline.length; i++) {
          const point = face[outline[i]];
          if (!point) continue;
          const [x, y] = map(point, mirror);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(190, 231, 255, 0.95)';
      for (const idx of [33, 133, 362, 263, 1, 13, 14]) {
        const point = face[idx];
        if (!point) continue;
        const [x, y] = map(point, mirror);
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  panel.dataset.mode = 'demo';

  return {
    setPose,
    setFace,
    clearFace,
    clear,
    render(time, { mode, overlay = true, mirror = true }) {
      if (mode === 'live') {
        drawLive(mirror, overlay, performance.now());
      } else {
        drawDemo(time);
      }
    },
  };
}
