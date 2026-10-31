import * as THREE from 'three';

const TAU = Math.PI * 2;

function canvasOf(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function makeTexture(canvas, { repeat = 1, mirror = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  if (mirror) texture.center.set(0.5, 0.5);
  return texture;
}

function drawWeb(ctx, w, h, { spacing = 34, amp = 5, width = 1.7, alpha = 0.78 } = {}) {
  ctx.save();
  ctx.strokeStyle = `rgba(9, 2, 6, ${alpha})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';

  for (let x = spacing / 2; x < w; x += spacing) {
    ctx.beginPath();
    for (let y = 0; y <= h; y += 4) {
      const px = x + Math.sin((y / h) * TAU + x * 0.06) * amp;
      if (y === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
  }

  for (let y = spacing / 2; y < h; y += spacing) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const py = y + Math.sin((x / w) * TAU + y * 0.07) * amp;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function suitFabric(ctx, w, h, light, dark) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, light);
  g.addColorStop(0.55, dark);
  g.addColorStop(1, light);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Micro-fabric noise.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = Math.random() > 0.5
      ? 'rgba(255,255,255,0.028)'
      : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, 1, 1);
  }

  // Fine weave.
  ctx.strokeStyle = 'rgba(0,0,0,0.075)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

export function createTextures(renderer) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ---------- classic red suit with black webbing ---------- */
  const redCanvas = canvasOf(512);
  suitFabric(redCanvas.ctx, 512, 512, '#c2192b', '#8d0b1b');
  drawWeb(redCanvas.ctx, 512, 512, { spacing: 58, amp: 9, width: 2.3, alpha: 0.68 });
  const red = makeTexture(redCanvas.canvas, { repeat: 1.6 });

  /* ---------- blue suit panels ---------- */
  const blueCanvas = canvasOf(256);
  suitFabric(blueCanvas.ctx, 256, 256, '#17356f', '#0a1738');
  const blue = makeTexture(blueCanvas.canvas, { repeat: 1.8 });

  /* ---------- mask: radial web from the crown ---------- */
  const maskCanvas = canvasOf(512);
  suitFabric(maskCanvas.ctx, 512, 512, '#cf1b2c', '#8a0a18');
  {
    const ctx = maskCanvas.ctx;
    const cx = 256;
    const cy = -30;
    ctx.strokeStyle = 'rgba(10, 2, 6, 0.8)';
    ctx.lineWidth = 2.1;
    const spokes = 22;
    for (let i = 0; i <= spokes; i++) {
      const a = Math.PI * 0.1 + (Math.PI * 0.8 * i) / spokes;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
      ctx.lineTo(cx + Math.cos(a) * 880, cy + Math.sin(a) * 880);
      ctx.stroke();
    }
    for (let r = 58; r < 880; r += 50) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
    // Neck/shoulder seams.
    ctx.strokeStyle = 'rgba(8, 2, 5, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 452);
    ctx.quadraticCurveTo(256, 476, 512, 452);
    ctx.stroke();
  }
  const mask = makeTexture(maskCanvas.canvas, { repeat: 1 });
  const maskTex = mask.clone();
  maskTex.needsUpdate = true;
  maskTex.repeat.set(1, 1);
  maskTex.offset.set(0, 0.02);

  /* ---------- chest spider emblem ---------- */
  const emblemCanvas = canvasOf(256);
  {
    const ctx = emblemCanvas.ctx;
    ctx.clearRect(0, 0, 256, 256);
    ctx.translate(128, 132);
    ctx.fillStyle = '#07060a';
    ctx.strokeStyle = '#07060a';
    ctx.lineCap = 'round';

    // Legs: four per side, long and angular.
    ctx.lineWidth = 9;
    const legs = [
      [[10, -33], [52, -62], [72, -40], [84, -46]],
      [[11, -18], [60, -28], [86, -6], [101, -4]],
      [[11, 0], [62, 8], [88, 32], [104, 37]],
      [[10, 15], [52, 40], [66, 66], [78, 84]],
    ];
    for (const side of [-1, 1]) {
      for (const leg of legs) {
        ctx.beginPath();
        ctx.moveTo(side * leg[0][0], leg[0][1]);
        ctx.bezierCurveTo(
          side * leg[1][0], leg[1][1],
          side * leg[2][0], leg[2][1],
          side * leg[3][0], leg[3][1]
        );
        ctx.stroke();
      }
    }

    // Body + head.
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 37, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -30, 14, 0, TAU);
    ctx.fill();

    // Thin red highlight to seat the emblem on the suit.
    ctx.strokeStyle = 'rgba(255, 84, 100, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 8, 24, 39, 0, 0, TAU);
    ctx.stroke();
  }
  const emblem = new THREE.CanvasTexture(emblemCanvas.canvas);
  emblem.colorSpace = THREE.SRGBColorSpace;
  emblem.anisotropy = anisotropy;

  /* ---------- soft contact shadow ---------- */
  const shadowCanvas = canvasOf(256);
  {
    const ctx = shadowCanvas.ctx;
    const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
    g.addColorStop(0, 'rgba(0,0,0,0.82)');
    g.addColorStop(0.42, 'rgba(0,0,0,0.46)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const shadow = new THREE.CanvasTexture(shadowCanvas.canvas);
  shadow.colorSpace = THREE.SRGBColorSpace;

  /* ---------- holo capture pad ---------- */
  const padCanvas = canvasOf(1024);
  {
    const ctx = padCanvas.ctx;
    ctx.clearRect(0, 0, 1024, 1024);
    const cx = 512;
    const cy = 512;

    const glow = ctx.createRadialGradient(cx, cy, 30, cx, cy, 500);
    glow.addColorStop(0, 'rgba(55, 104, 214, 0.2)');
    glow.addColorStop(0.5, 'rgba(28, 52, 118, 0.08)');
    glow.addColorStop(1, 'rgba(4, 6, 12, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.strokeStyle = 'rgba(94, 138, 232, 0.24)';
    ctx.lineWidth = 2;
    for (let r = 120; r <= 470; r += 70) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 57, 82, 0.5)';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(255, 45, 70, 0.9)';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, 420, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(94, 138, 232, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const inner = i % 4 === 0 ? 330 : 388;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * 418, cy + Math.sin(a) * 418);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(190, 212, 255, 0.5)';
    ctx.font = '600 15px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOTION CAPTURE VOLUME', cx, cy + 486);
  }
  const pad = new THREE.CanvasTexture(padCanvas.canvas);
  pad.colorSpace = THREE.SRGBColorSpace;
  pad.anisotropy = anisotropy;

  /* ---------- distant window grid ---------- */
  const windowCanvas = canvasOf(128);
  {
    const ctx = windowCanvas.ctx;
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 8; y < 128; y += 12) {
      for (let x = 6; x < 128; x += 12) {
        const lit = Math.random() > 0.66;
        ctx.fillStyle = lit
          ? (Math.random() > 0.55 ? 'rgba(255, 142, 112, 0.85)' : 'rgba(120, 176, 255, 0.7)')
          : 'rgba(20, 30, 52, 0.55)';
        ctx.fillRect(x, y, 5, 6);
      }
    }
  }
  const windows = makeTexture(windowCanvas.canvas, { repeat: 1, mirror: false });
  windows.wrapS = windows.wrapT = THREE.ClampToEdgeWrapping;

  /* ---------- red atmospheric glow sprite ---------- */
  const glowCanvas = canvasOf(256);
  {
    const ctx = glowCanvas.ctx;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255, 52, 78, 0.85)');
    g.addColorStop(0.28, 'rgba(255, 32, 62, 0.3)');
    g.addColorStop(0.62, 'rgba(150, 16, 40, 0.08)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const glow = new THREE.CanvasTexture(glowCanvas.canvas);
  glow.colorSpace = THREE.SRGBColorSpace;

  for (const texture of [red, blue, maskTex, emblem, shadow, pad, windows, glow]) {
    texture.anisotropy = anisotropy;
  }

  return { red, blue, mask: maskTex, emblem, shadow, pad, windows, glow, anisotropy };
}
