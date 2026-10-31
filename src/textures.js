import * as THREE from 'three';

function canvas2d(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finish(canvas, { repeat = [1, 1], colorSpace = THREE.SRGBColorSpace } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = colorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Classic red web-suit weave, tileable 512px. */
export function createSuitTexture() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);

  const base = ctx.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#b3112a');
  base.addColorStop(0.45, '#920b1e');
  base.addColorStop(1, '#6d0714');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Fine athletic weave / noise.
  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 13;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n * 0.4));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 0.4));
  }
  ctx.putImageData(img, 0, 0);

  // Subtle vertical fabric streaks.
  ctx.globalAlpha = 0.055;
  for (let x = 0; x < S; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? '#4d0510' : '#d04150';
    ctx.fillRect(x, 0, 1, S);
  }
  ctx.globalAlpha = 1;

  const ink = 'rgba(7, 8, 12, 0.96)';
  const inkSoft = 'rgba(7, 8, 12, 0.38)';

  // Web lattice: radial ribs + sagging cross-threads.
  const ribs = 7;
  const ribGap = S / ribs;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Glow edge under each thread for a raised-screenprint feel.
  ctx.strokeStyle = 'rgba(255, 72, 92, 0.09)';
  ctx.lineWidth = 6;
  for (let i = 0; i < ribs; i++) {
    const x = i * ribGap;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.bezierCurveTo(x + 7, S * 0.3, x - 7, S * 0.7, x, S + 8);
    ctx.stroke();
  }
  ctx.strokeStyle = inkSoft;
  for (let i = 0; i < ribs; i++) {
    const x = i * ribGap;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.bezierCurveTo(x + 7, S * 0.3, x - 7, S * 0.7, x, S + 8);
    ctx.stroke();
  }

  const rows = 5;
  const rowGap = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowGap;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < ribs; i++) {
      const x0 = i * ribGap;
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo(x0 + ribGap * 0.5, y + rowGap * 0.38, x0 + ribGap, y);
    }
    ctx.stroke();

    // Thin secondary thread.
    ctx.strokeStyle = 'rgba(8, 9, 14, 0.28)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < ribs; i++) {
      const x0 = i * ribGap;
      ctx.moveTo(x0, y + 13);
      ctx.quadraticCurveTo(x0 + ribGap * 0.5, y + rowGap * 0.38 + 13, x0 + ribGap, y + 13);
    }
    ctx.stroke();
  }

  // Scattered micro highlights.
  ctx.globalAlpha = 0.11;
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = '#ff8b97';
    const x = Math.random() * S;
    const y = Math.random() * S;
    ctx.fillRect(x, y, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5);
  }
  ctx.globalAlpha = 1;

  return finish(canvas, { repeat: [1, 1] });
}

/** Deep navy compression fabric with a faint carbon weave. */
export function createBlueSuitTexture() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);

  const base = ctx.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#0c2f61');
  base.addColorStop(0.5, '#071f44');
  base.addColorStop(1, '#04132b');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    data[i] += n * 0.5;
    data[i + 1] += n;
    data[i + 2] += n * 1.4;
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = 'rgba(112, 178, 255, 0.09)';
  ctx.lineWidth = 1;
  for (let i = -S; i < S * 2; i += 9) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + S, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, S);
    ctx.lineTo(i + S, 0);
    ctx.stroke();
  }

  // Panel seams.
  ctx.strokeStyle = 'rgba(3, 9, 20, 0.85)';
  ctx.lineWidth = 5;
  for (let x = 0; x <= S; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(111, 183, 255, 0.14)';
  ctx.lineWidth = 1.4;
  for (let x = 0; x <= S; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x + 4, 0);
    ctx.lineTo(x + 4, S);
    ctx.stroke();
  }

  return finish(canvas, { repeat: [2, 1] });
}

/** Black spider emblem with transparent background. */
export function createEmblemTexture({ color = '#07090e', elongate = 1 } = {}) {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);
  ctx.clearRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.scale(1, elongate);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Legs — four per side, articulated.
  ctx.lineWidth = 21;
  const legs = [
    [[-18, -84], [-78, -150], [-152, -168], [-190, -132]],
    [[-24, -66], [-112, -104], [-178, -96], [-202, -50]],
    [[-26, -38], [-114, -18], [-186, 22], [-200, 72]],
    [[-18, -14], [-82, 38], [-128, 100], [-148, 160]],
  ];
  for (const side of [1, -1]) {
    for (const leg of legs) {
      const [a, b, c, d] = leg;
      ctx.beginPath();
      ctx.moveTo(a[0] * side, a[1]);
      ctx.quadraticCurveTo(b[0] * side, b[1], c[0] * side, c[1]);
      ctx.quadraticCurveTo((c[0] * 0.6 + d[0] * 0.4) * side, (c[1] * 0.6 + d[1] * 0.4), d[0] * side, d[1]);
      ctx.stroke();
    }
  }

  // Body.
  ctx.beginPath();
  ctx.ellipse(0, 52, 27, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -8, 25, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -48, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Abdomen highlight cut.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.ellipse(0, 54, 2.5, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  return finish(canvas, { repeat: [1, 1] });
}

/** Pre-baked studio floor gradient (cheap to shade). */
export function createFloorTexture() {
  const S = 1024;
  const { canvas, ctx } = canvas2d(S);
  const g = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.04, S * 0.5, S * 0.5, S * 0.52);
  g.addColorStop(0, '#1b3558');
  g.addColorStop(0.32, '#101e36');
  g.addColorStop(0.7, '#080f1d');
  g.addColorStop(1, '#04070e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#3b5f96' : '#0a1322';
    ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
  }
  ctx.globalAlpha = 1;
  return finish(canvas, { repeat: [1, 1] });
}

/** Soft radial highlight used on the mask lenses and eye catchlights. */
export function createGlintTexture() {
  const S = 128;
  const { canvas, ctx } = canvas2d(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  g.addColorStop(0.35, 'rgba(255, 255, 255, 0.5)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(canvas, { repeat: [1, 1] });
}

/** Soft radial contact shadow used under the feet. */
export function createShadowTexture() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  g.addColorStop(0.4, 'rgba(0, 0, 0, 0.36)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(canvas, { repeat: [1, 1] });
}

/** Radial red floor glow. */
export function createGlowTexture(color = '#e11d38') {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.28, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(canvas, { repeat: [1, 1] });
}

/** Skin pore / warmth map for Peter's face. */
export function createSkinTexture() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);
  ctx.fillStyle = '#d8a98b';
  ctx.fillRect(0, 0, S, S);

  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    data[i] += n * 1.1;
    data[i + 1] += n;
    data[i + 2] += n * 0.75;
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#a86a52' : '#edc3a7';
    const x = Math.random() * S;
    const y = Math.random() * S;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  return finish(canvas, { repeat: [1, 1] });
}

/** Swept medium-brown hair strands. */
export function createHairTexture() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S);
  ctx.fillStyle = '#4b2e1c';
  ctx.fillRect(0, 0, S, S);
  ctx.lineWidth = 2;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(124, 86, 56, 0.4)' : 'rgba(30, 18, 9, 0.42)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y + 20, x + 2, y + 48);
    ctx.stroke();
  }
  return finish(canvas, { repeat: [2, 2] });
}
