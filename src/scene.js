import * as THREE from 'three';
import { createGlowTexture, createShadowTexture, createFloorTexture } from './textures.js';

const _v = new THREE.Vector3();
const _target = new THREE.Vector3();

export class Stage {
  constructor(canvas, character) {
    this.canvas = canvas;
    this.character = character;
    this.quality = 'auto';
    this.view = 'full';
    this.orbit = false;
    this.orbitAngle = 0.2;
    this.userAzimuth = 0;
    this.userPolar = 0;
    this.distanceScale = 1;
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.fps = 60;
    this.frameCount = 0;
    this.fpsTime = performance.now();
    this.adaptiveCooldown = 0;
    this.lowFpsTime = 0;
    this.highFpsTime = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
      stencil: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowTick = 0;

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'WebGL';
    this.softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(String(this.gpuName));

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.035);

    this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 60);
    this.camera.position.set(1.0, 1.35, 4.2);

    this.scene.add(character.group);
    this._buildLighting();
    this._buildStage();

    this.target = new THREE.Vector3(0, 1.0, 0);
    this.currentTarget = this.target.clone();
    this.camera.position.set(1.0, 1.35, 4.2);
    this.camera.lookAt(this.currentTarget);

    this._bindPointer();
    this.resize();
    this.setQuality('auto');
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0x9fc2ff, 0x0a0d14, 1.0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff2e8, 3.7);
    key.position.set(2.6, 4.6, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.4;
    key.shadow.camera.right = 2.4;
    key.shadow.camera.top = 3.4;
    key.shadow.camera.bottom = -0.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = 2;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.PointLight(0xc9dcff, 6, 8, 2);
    fill.position.set(-1.2, 1.9, 2.9);
    this.scene.add(fill);

    const rimBlue = new THREE.SpotLight(0x3f7dff, 85, 8, 0.7, 0.55, 1.6);
    rimBlue.position.set(-2.7, 2.6, -1.2);
    rimBlue.target.position.set(0, 1.2, 0);
    this.scene.add(rimBlue, rimBlue.target);

    const rimRed = new THREE.SpotLight(0xff1f3d, 58, 8, 0.65, 0.6, 1.5);
    rimRed.position.set(2.8, 1.7, -1.4);
    rimRed.target.position.set(0, 1.05, 0);
    this.scene.add(rimRed, rimRed.target);

    this.rimBlue = rimBlue;
    this.rimRed = rimRed;
  }

  _buildStage() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 72),
      new THREE.MeshBasicMaterial({
        map: createFloorTexture(),
        color: 0xffffff,
        depthWrite: true,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

    // Studio grid.
    const grid = new THREE.GridHelper(8.4, 42, 0x2b5185, 0x112039);
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    grid.material.depthWrite = false;
    this.scene.add(grid);

    // Concentric targeting rings.
    this.rings = new THREE.Group();
    const ringSpecs = [
      [0.74, 0x334f7c, 0.5, 0.02],
      [1.12, 0xe11d38, 0.28, 0.012],
      [1.68, 0x3c6dab, 0.24, 0.016],
      [2.34, 0x273b5e, 0.3, 0.02],
    ];
    for (const [radius, color, opacity, width] of ringSpecs) {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      line.position.y = 0.012;
      this.rings.add(line);
    }

    // Tick marks around the outer ring.
    const tickGeo = new THREE.BufferGeometry();
    const tickPos = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const len = i % 4 === 0 ? 0.12 : 0.05;
      tickPos.push(Math.cos(a) * 2.34, 0.013, Math.sin(a) * 2.34);
      tickPos.push(Math.cos(a) * (2.34 + len), 0.013, Math.sin(a) * (2.34 + len));
    }
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPos, 3));
    this.rings.add(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({
      color: 0x4a70a8, transparent: true, opacity: 0.35, depthWrite: false,
    })));
    this.scene.add(this.rings);

    // Red pool of light at the feet.
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: createGlowTexture('#e11d38'),
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.006;
    this.scene.add(glow);

    // Contact shadow.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshBasicMaterial({
        map: createShadowTexture(), transparent: true, opacity: 0.62, depthWrite: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.009;
    this.scene.add(contact);

    // Backdrop halo rings.
    const haloGroup = new THREE.Group();
    haloGroup.position.set(0, 1.15, -1.55);
    const haloMatRed = new THREE.MeshBasicMaterial({
      color: 0xff2f4c, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const haloMatBlue = new THREE.MeshBasicMaterial({
      color: 0x2f6dff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo1 = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.005, 6, 120, Math.PI * 1.36), haloMatRed);
    halo1.rotation.z = Math.PI * 0.18;
    haloGroup.add(halo1);
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.0035, 6, 120, Math.PI * 1.12), haloMatBlue);
    halo2.rotation.z = -Math.PI * 0.4;
    haloGroup.add(halo2);
    const halo3 = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.0025, 6, 90, Math.PI * 1.6), haloMatBlue);
    halo3.rotation.z = Math.PI * 0.72;
    haloGroup.add(halo3);
    this.scene.add(haloGroup);
    this.halo = haloGroup;

    // Giant spider web backdrop.
    const webPts = [];
    const webRings = [0.42, 0.72, 1.06, 1.46, 1.92, 2.44, 3.02];
    const spokes = 16;
    for (let s = 0; s < spokes; s++) {
      const a = (s / spokes) * Math.PI * 2 + 0.1;
      webPts.push(0, 0, 0);
      webPts.push(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0);
    }
    for (let r = 0; r < webRings.length; r++) {
      const radius = webRings[r];
      for (let s = 0; s < spokes; s++) {
        const a0 = (s / spokes) * Math.PI * 2 + 0.1;
        const a1 = ((s + 1) / spokes) * Math.PI * 2 + 0.1;
        const mid = (a0 + a1) / 2;
        const sag = radius * 0.9;
        webPts.push(Math.cos(a0) * radius, Math.sin(a0) * radius, 0);
        webPts.push(Math.cos(mid) * sag, Math.sin(mid) * sag, 0);
        webPts.push(Math.cos(mid) * sag, Math.sin(mid) * sag, 0);
        webPts.push(Math.cos(a1) * radius, Math.sin(a1) * radius, 0);
      }
    }
    const webGeo = new THREE.BufferGeometry();
    webGeo.setAttribute('position', new THREE.Float32BufferAttribute(webPts, 3));
    this.webBackdrop = new THREE.LineSegments(
      webGeo,
      new THREE.LineBasicMaterial({ color: 0xff3350, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.webBackdrop.position.set(0, 1.25, -2.4);
    this.webBackdrop.scale.set(1.25, 1.25, 1);
    this.scene.add(this.webBackdrop);

    // Floating dust.
    const particleCount = 240;
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const r = 1.2 + Math.random() * 2.8;
      const a = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * 3.2;
      positions[i * 3 + 2] = Math.sin(a) * r - 0.4;
      speeds[i] = 0.02 + Math.random() * 0.06;
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      this.dustGeo,
      new THREE.PointsMaterial({
        color: 0x8fb9ff, size: 0.012, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }),
    );
    this.dustSpeeds = speeds;
    this.scene.add(this.dust);
  }

  _bindPointer() {
    const el = this.canvas;
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      el.style.cursor = 'grabbing';
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.userAzimuth -= dx * 0.0042;
      this.userPolar = THREE.MathUtils.clamp(this.userPolar + dy * 0.0028, -0.24, 0.3);
    });
    const end = () => {
      this.dragging = false;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distanceScale = THREE.MathUtils.clamp(this.distanceScale + e.deltaY * 0.00055, 0.72, 1.45);
    }, { passive: false });
    el.addEventListener('dblclick', () => this.resetView());
  }

  resetView() {
    this.userAzimuth = 0;
    this.userPolar = 0;
    this.distanceScale = 1;
  }

  setView(view) {
    this.view = view;
    this.resetView();
  }

  toggleOrbit(force) {
    this.orbit = force ?? !this.orbit;
    return this.orbit;
  }

  setQuality(mode) {
    this.quality = mode;
    let dpr = 1.35;
    if (mode === 'high') dpr = Math.min(window.devicePixelRatio || 1, 2);
    else if (mode === 'balanced') dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    else if (mode === 'battery') dpr = 1;
    else dpr = Math.min(window.devicePixelRatio || 1, 1.35);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = mode !== 'battery';
    this.keyLight.castShadow = mode !== 'battery';
    this.renderer.shadowMap.needsUpdate = true;
    if (this.dust) this.dust.visible = mode !== 'battery';
    if (this.webBackdrop) this.webBackdrop.visible = mode !== 'battery';
    document.getElementById('app')?.classList.toggle('low-power', mode === 'battery');
    this.resize();
    this.setPixelRatioTarget(dpr);
  }

  setPixelRatioTarget(dpr) {
    this.targetDpr = dpr;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  update(dt, elapsed) {
    const char = this.character;
    const isFace = this.view === 'face';
    _target.set(0, 1.0, 0);
    if (isFace) {
      char.getHeadWorldPosition(_target);
      _target.y += 0.07;
      _target.z += 0.02;
    }
    char.getHeadWorldPosition(_v);
    const lookY = isFace ? _target.y : 1.02;

    const baseDistance = isFace ? 1.32 : 5.05;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const aspectFactor = aspect < 0.8 ? 1.14 : 1;
    const distance = baseDistance * this.distanceScale * aspectFactor;
    const polar = (isFace ? 1.42 : 1.52) + this.userPolar;
    const azimuth = (isFace ? 0.07 : 0.19) + this.userAzimuth + (this.orbit ? Math.sin(elapsed * 0.18) * 0.28 : 0);

    // Smooth view transitions.
    const targetPos = _target;
    this.currentTarget.lerp(targetPos, 1 - Math.exp(-5 * dt));
    const x = this.currentTarget.x + Math.sin(azimuth) * Math.sin(polar) * distance;
    const y = this.currentTarget.y + Math.cos(polar) * distance + (isFace ? 0.01 : 0.26);
    const z = this.currentTarget.z + Math.cos(azimuth) * Math.sin(polar) * distance;
    const camA = 1 - Math.exp(-5 * dt);
    this.camera.position.x += (x - this.camera.position.x) * camA;
    this.camera.position.y += (y - this.camera.position.y) * camA;
    this.camera.position.z += (z - this.camera.position.z) * camA;

    // Gentle cinematic float when idle.
    this.camera.position.y += Math.sin(elapsed * 0.55) * 0.0009;
    this.camera.lookAt(this.currentTarget);

    // Set rival lights target to chest/head.
    this.rimBlue.target.position.set(0, 1.2, 0);
    this.rimRed.target.position.set(0, 1.05, 0);

    // Rings / halo motion.
    this.rings.rotation.y += dt * 0.035;
    this.halo.rotation.z = Math.sin(elapsed * 0.12) * 0.03;
    this.halo.position.y = 1.15 + Math.sin(elapsed * 0.5) * 0.01;
    this.webBackdrop.rotation.z = Math.sin(elapsed * 0.05) * 0.02;

    // Dust drift.
    if (this.dust.visible) {
      const pos = this.dustGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + this.dustSpeeds[i] * dt;
        if (y > 3.3) y = 0.1;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.dust.rotation.y += dt * 0.012;
    }

    // Character idle overlay.
    char.update(dt, elapsed);
  }

  render() {
    if (this.renderer.shadowMap.enabled) {
      this.shadowTick++;
      this.renderer.shadowMap.needsUpdate = this.shadowTick % 2 === 0;
    }
    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsTime >= 500) {
      const measured = (this.frameCount * 1000) / (now - this.fpsTime);
      this.fps += (measured - this.fps) * 0.5;
      this.frameCount = 0;
      this.fpsTime = now;
      this._adaptQuality(measured);
    }
  }

  _adaptQuality(measured) {
    if (this.quality !== 'auto' || !this.targetDpr) return;
    const now = performance.now();
    const maxDpr = Math.min(window.devicePixelRatio || 1, 1.6);
    if (this.adaptiveCooldown > now) return;
    if (measured < 44) {
      this.lowFpsTime += 500;
      this.highFpsTime = 0;
      if (this.lowFpsTime >= 900) {
        if (this.targetDpr > 0.82) {
          this.targetDpr = Math.max(0.82, this.targetDpr - 0.28);
          this.renderer.setPixelRatio(this.targetDpr);
          this.resize();
        } else if (this.renderer.shadowMap.enabled) {
          this.renderer.shadowMap.enabled = false;
          this.keyLight.castShadow = false;
          this.dust.visible = false;
          this.webBackdrop.visible = false;
          document.getElementById('app')?.classList.add('low-power');
        }
        this.lowFpsTime = 0;
        this.adaptiveCooldown = now + 1500;
      }
    } else if (measured > 57) {
      this.highFpsTime += 500;
      this.lowFpsTime = 0;
      if (this.highFpsTime > 4500 && this.targetDpr < maxDpr) {
        this.targetDpr = Math.min(maxDpr, this.targetDpr + 0.1);
        this.renderer.setPixelRatio(this.targetDpr);
        this.resize();
        this.highFpsTime = 0;
        this.adaptiveCooldown = now + 2500;
        if (this.targetDpr > 1.05) document.getElementById('app')?.classList.remove('low-power');
      }
    } else {
      this.lowFpsTime = 0;
      this.highFpsTime = 0;
    }
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  get pixelRatio() {
    return this.renderer.getPixelRatio();
  }
}
