import * as THREE from 'three';

let glowTexture = null;

export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.38, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.05)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  glowTexture.needsUpdate = true;
  return glowTexture;
}

export function glowPointMaterial(color, size = 0.03, opacity = 0.9) {
  return new THREE.PointsMaterial({
    color,
    size,
    map: getGlowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    alphaTest: 0.001,
  });
}

export function glowSprite(color, scale = 0.2, opacity = 0.5) {
  const material = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  return sprite;
}

export function neonLineMaterial(color, opacity = 0.8) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function setGeometryPositions(geometry, positions, count) {
  const attr = geometry.getAttribute('position');
  if (!attr) return;
  attr.array.set(positions);
  attr.needsUpdate = true;
  geometry.setDrawRange(0, count);
  geometry.computeBoundingSphere();
}

export function createPositionsBuffer(count) {
  return new Float32Array(count * 3);
}
