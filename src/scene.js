import * as THREE from 'three';
import { createTextures } from './textures.js';

const QUALITY_LEVELS = [
  { name: 'ECO', dpr: 1.0 },
  { name: 'BALANCED', dpr: 1.35 },
  { name: 'HIGH', dpr: 1.75 },
];

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.setClearColor(0x04050a, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050a);
  scene.fog = new THREE.FogExp2(0x04050a, 0.072);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
  camera.position.set(0.7, 1.42, 3.5);

  const textures = createTextures(renderer);

  /* ---------------------------------- lights --------------------------------- */
  const hemi = new THREE.HemisphereLight(0x91b0e8, 0x1a0508, 0.75);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4ec, 2.5);
  key.position.set(2.3, 4.2, 3.6);
  scene.add(key);

  const rim = new THREE.PointLight(0xff2340, 26, 12, 2);
  rim.position.set(-2.3, 2.5, -1.8);
  scene.add(rim);

  const fill = new THREE.PointLight(0x2f5ee0, 11, 12, 2);
  fill.position.set(2.5, 1.25, 1.4);
  scene.add(fill);

  const warm = new THREE.PointLight(0xff8a5c, 5, 9, 2);
  warm.position.set(0.4, 0.4, 2.6);
  scene.add(warm);

  const faceFill = new THREE.PointLight(0xffd6c2, 4.5, 6, 2);
  faceFill.position.set(0.5, 1.65, 2.1);
  scene.add(faceFill);

  /* ---------------------------------- floor ---------------------------------- */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(11, 64),
    new THREE.MeshStandardMaterial({
      color: 0x090c14,
      roughness: 0.34,
      metalness: 0.62,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 64),
    new THREE.MeshBasicMaterial({
      map: textures.pad,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      toneMapped: false,
    })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.004;
  scene.add(pad);

  const platformRing = new THREE.Mesh(
    new THREE.RingGeometry(2.16, 2.2, 96),
    new THREE.MeshBasicMaterial({
      color: 0xff2b45,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  platformRing.rotation.x = -Math.PI / 2;
  platformRing.position.y = 0.007;
  scene.add(platformRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 0.965, 80),
    new THREE.MeshBasicMaterial({
      color: 0x76a4ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.008;
  scene.add(innerRing);

  const grid = new THREE.GridHelper(24, 48, 0x1a2c50, 0x0b1222);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  scene.add(grid);

  /* ------------------------------- backdrop city ----------------------------- */
  const city = new THREE.Group();
  const cityMat = new THREE.MeshBasicMaterial({
    map: textures.windows,
    color: 0x5a6683,
    transparent: true,
    opacity: 0.5,
    fog: true,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const rand = mulberry32(1337);
  for (let i = 0; i < 30; i++) {
    const w = 0.8 + rand() * 1.8;
    const h = 1.8 + rand() * 6.5;
    const d = 0.7 + rand() * 1.6;
    const mesh = new THREE.Mesh(boxGeo, cityMat);
    mesh.scale.set(w, h, d);
    mesh.position.set(-13 + rand() * 26, h / 2 - 0.4, -10 - rand() * 13);
    city.add(mesh);
  }
  scene.add(city);

  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glow,
      color: 0xff243f,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  glowSprite.scale.set(9, 9, 1);
  glowSprite.position.set(-2.6, 2.1, -5.5);
  scene.add(glowSprite);

  const blueGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glow,
      color: 0x2f64ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  blueGlow.scale.set(7, 7, 1);
  blueGlow.position.set(3.4, 2.8, -6.5);
  scene.add(blueGlow);

  /* ------------------------------ contact shadow ----------------------------- */
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({
      map: textures.shadow,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  scene.add(contactShadow);

  /* ---------------------------------- dust ----------------------------------- */
  const dustCount = 190;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const radius = 1.2 + rand() * 5.4;
    const angle = rand() * Math.PI * 2;
    dustPositions[i * 3] = Math.cos(angle) * radius;
    dustPositions[i * 3 + 1] = 0.15 + rand() * 3.6;
    dustPositions[i * 3 + 2] = Math.sin(angle) * radius - 0.5;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xff93a2,
      size: 0.017,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    })
  );
  scene.add(dust);

  /* ---------------------------------- camera --------------------------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const base = { x: 0.55, y: 1.42, z: 3.9, targetY: 1.02 };
  const lookAt = new THREE.Vector3(0, 1.02, 0);
  const desired = new THREE.Vector3();
  let viewport = { width: 1, height: 1 };
  let resetTimer = 0;
  let qualityLevel = 2;

  function applyQuality() {
    const level = QUALITY_LEVELS[qualityLevel];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.dpr));
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    viewport = { width, height };
    renderer.setSize(width, height, false);
    applyQuality();
    const aspect = width / Math.max(1, height);
    camera.aspect = aspect;
    const portrait = aspect < 0.82;
    const shortLandscape = height < 500 && aspect > 1.5;
    base.x = shortLandscape ? 0.48 : portrait ? 0.34 : 0.55;
    base.y = shortLandscape ? 1.5 : portrait ? 1.34 : 1.42;
    base.z = shortLandscape ? 5.6 : portrait ? 4.85 : 3.9;
    base.targetY = shortLandscape ? 1.1 : portrait ? 1.0 : 1.02;
    camera.fov = portrait ? 38 : 35;
    camera.updateProjectionMatrix();
    contactShadow.scale.setScalar(portrait ? 0.95 : 1);
  }

  function setQuality(level) {
    qualityLevel = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level));
    applyQuality();
  }

  function getQuality() {
    return QUALITY_LEVELS[qualityLevel];
  }

  function resetView() {
    pointer.x = pointer.y = pointer.tx = pointer.ty = 0;
    resetTimer = 0.7;
  }

  function onPointerMove(event) {
    const nx = (event.clientX / Math.max(1, viewport.width)) * 2 - 1;
    const ny = (event.clientY / Math.max(1, viewport.height)) * 2 - 1;
    pointer.tx = Math.max(-1, Math.min(1, nx));
    pointer.ty = Math.max(-1, Math.min(1, ny));
  }

  function clearPointer() {
    pointer.tx = 0;
    pointer.ty = 0;
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', clearPointer);

  let elapsed = 0;
  function update(dt, time) {
    elapsed = time;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.4);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3.4);

    const distanceScale = base.z / 3.5;
    desired.set(
      base.x + pointer.x * 0.24 * distanceScale,
      base.y - pointer.y * 0.1,
      base.z
    );
    camera.position.lerp(desired, Math.min(1, dt * 2.6));
    lookAt.set(pointer.x * 0.045, base.targetY - pointer.y * 0.02, 0);
    camera.lookAt(lookAt);

    dust.rotation.y = time * 0.018;
    dust.position.y = Math.sin(time * 0.32) * 0.05;

    const pulse = 0.5 + Math.sin(time * 1.5) * 0.5;
    innerRing.material.opacity = 0.26 + pulse * 0.2;
    platformRing.material.opacity = 0.48 + pulse * 0.18;
    rim.intensity = 24 + Math.sin(time * 1.7) * 4;
    fill.intensity = 11 + Math.sin(time * 1.1 + 1.4) * 2;
    glowSprite.material.opacity = 0.34 + Math.sin(time * 0.7) * 0.07;
    pad.rotation.z = time * 0.008;
    platformRing.rotation.z = -time * 0.03;
    innerRing.rotation.z = time * 0.035;
    contactShadow.material.opacity = 0.66 + Math.sin(time * 1.1) * 0.04;

    if (resetTimer > 0) {
      resetTimer -= dt;
      pointer.tx *= 0.9;
      pointer.ty *= 0.9;
    }
  }

  function dispose() {
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', clearPointer);
    renderer.dispose();
  }

  return {
    renderer,
    scene,
    camera,
    textures,
    update,
    resize,
    setQuality,
    getQuality,
    resetView,
    dispose,
    get elapsed() { return elapsed; },
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
