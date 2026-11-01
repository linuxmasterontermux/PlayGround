import { clamp } from './filters.js';

const pct = (value) => `${Math.round(clamp(value) * 100)}%`;

export class UI {
  constructor() {
    this.mode = 'demo';
    this.history = [];
    this.toastTimer = null;
    this.callbacks = {};
    this.cache = {
      rows: {},
      gaze: '',
      meters: {},
      values: {},
      chips: {},
    };

    this.el = {
      modePill: document.getElementById('modePill'),
      subjectState: document.getElementById('subjectState'),
      inputState: document.getElementById('inputState'),
      pipLabel: document.getElementById('pipLabel'),
      pipStatus: document.getElementById('pipStatus'),
      pipFps: document.getElementById('pipFps'),
      cameraBtns: [...document.querySelectorAll('[data-action="camera"]')],
      demoBtn: document.getElementById('demoBtn'),
      loader: document.getElementById('loader'),
      loaderBar: document.getElementById('loaderBar'),
      loaderPct: document.getElementById('loaderPct'),
      loaderLabel: document.getElementById('loaderLabel'),
      toast: document.getElementById('toast'),
      gazeDot: document.getElementById('gazeDot'),
      gazeValue: document.getElementById('gazeValue'),
      blinkMeter: document.getElementById('blinkMeter'),
      jawMeter: document.getElementById('jawMeter'),
      smileMeter: document.getElementById('smileMeter'),
      blinkValue: document.getElementById('blinkValue'),
      jawValue: document.getElementById('jawValue'),
      smileValue: document.getElementById('smileValue'),
      energyCanvas: document.getElementById('energyCanvas'),
      energyValue: document.getElementById('energyValue'),
      fps: document.getElementById('fps'),
      latency: document.getElementById('latency'),
      points: document.getElementById('points'),
      mobileChips: [...document.querySelectorAll('[data-mm]')],
    };

    this.rows = {};
    for (const row of document.querySelectorAll('.track-row')) {
      this.rows[row.dataset.track] = {
        row,
        bar: row.querySelector('.track-bar i'),
        value: row.querySelector('.track-val'),
      };
    }

    this.energyCtx = this.el.energyCanvas.getContext('2d');
    this.energyCanvasW = 260;
    this.energyCanvasH = 42;
    this.el.energyCanvas.width = this.energyCanvasW * 2;
    this.el.energyCanvas.height = this.energyCanvasH * 2;
    this.energyCtx.scale(2, 2);

    this.bind();
  }

  on(name, handler) {
    this.callbacks[name] = handler;
  }

  bind() {
    for (const btn of this.el.cameraBtns) {
      btn.addEventListener('click', () => this.callbacks.camera?.());
    }
    this.el.demoBtn?.addEventListener('click', () => this.callbacks.demo?.());

    for (const layer of document.querySelectorAll('.layer')) {
      layer.addEventListener('click', () => {
        const active = !layer.classList.contains('is-on');
        this.setLayerState(layer.dataset.layer, active);
        this.callbacks.layer?.(layer.dataset.layer, active);
      });
    }

    document.getElementById('resetBtn')?.addEventListener('click', () => this.callbacks.reset?.());
    document.getElementById('snapshotBtn')?.addEventListener('click', () => this.callbacks.snapshot?.());
    document.getElementById('snapshotBtn2')?.addEventListener('click', () => this.callbacks.snapshot?.());
    document.getElementById('fullscreenBtn')?.addEventListener('click', () => this.callbacks.fullscreen?.());

    window.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'c') this.callbacks.camera?.();
      else if (key === 'd') this.callbacks.demo?.();
      else if (key === 'r') this.callbacks.reset?.();
      else if (key === 's') this.callbacks.snapshot?.();
      else if (key === 'f') this.callbacks.fullscreen?.();
      else if (/^[1-6]$/.test(key)) {
        const index = Number(key) - 1;
        const layer = document.querySelectorAll('.layer')[index];
        if (layer) layer.click();
      }
    });
  }

  setMode(mode, detail = {}) {
    this.mode = mode;
    const pill = this.el.modePill;
    pill.classList.remove('is-live', 'is-loading', 'is-error');
    let label = 'DEMO LOOP';
    if (mode === 'camera') {
      label = 'LIVE CAPTURE';
      pill.classList.add('is-live');
    } else if (mode === 'loading') {
      label = 'CALIBRATING';
      pill.classList.add('is-loading');
    } else if (mode === 'error') {
      label = 'INPUT ERROR';
      pill.classList.add('is-error');
    }
    pill.querySelector('span').textContent = label;

    this.el.subjectState.textContent =
      mode === 'camera' ? 'CAMERA SUBJECT' : mode === 'loading' ? 'INITIALIZING' : 'SYNTHETIC SUBJECT';
    this.el.inputState.textContent =
      mode === 'camera' ? 'LIVE CAMERA' : mode === 'loading' ? 'LOADING' : 'SIMULATED';
    this.el.pipLabel.textContent = mode === 'camera' ? 'CAM FEED' : mode === 'loading' ? 'LINKING' : 'SIM FEED';
    this.el.pipStatus.textContent =
      mode === 'camera' ? 'LOCAL INFERENCE' : mode === 'loading' ? 'LOADING MODELS' : 'SYNTHETIC SUBJECT';

    for (const btn of this.el.cameraBtns) {
      btn.classList.toggle('is-active', mode === 'camera');
      const labelEl = btn.querySelector('span');
      if (labelEl) {
        labelEl.textContent = mode === 'camera' ? 'Camera on' : mode === 'loading' ? 'Calibrating…' : 'Enable camera';
      }
    }

    if (this.el.demoBtn) {
      const state = this.el.demoBtn.querySelector('.btn-state');
      if (state) state.textContent = mode === 'demo' ? 'ON' : 'OFF';
    }

    if (detail.message) this.toast(detail.message, mode === 'error' ? 'error' : 'info');
  }

  setLayerState(name, active) {
    const layer = document.querySelector(`.layer[data-layer="${name}"]`);
    if (!layer) return;
    layer.classList.toggle('is-on', active);
    layer.setAttribute('aria-pressed', String(active));
  }

  setLoading(visible, progress = 0, label = 'Calibrating studio') {
    this.el.loader.classList.toggle('is-hidden', !visible);
    this.el.loaderBar.style.width = `${Math.round(progress * 100)}%`;
    this.el.loaderPct.textContent = `${Math.round(progress * 100)}%`;
    this.el.loaderLabel.textContent = label;
  }

  toast(message, type = 'info', duration = 3600) {
    clearTimeout(this.toastTimer);
    const toast = this.el.toast;
    toast.textContent = message;
    toast.classList.toggle('is-error', type === 'error');
    toast.classList.add('is-visible');
    this.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  update(frame, stats) {
    const metrics = frame.metrics ?? {};
    const body = clamp(metrics.body ?? 0);
    const face = clamp(metrics.face ?? 0);
    const hands = clamp(metrics.hands ?? 0);
    const feet = clamp(metrics.feet ?? 0);
    const eyes = clamp(metrics.eyes ?? 0);
    const mouth = clamp(metrics.mouth ?? 0);

    this.setRow('body', body, pct(body));
    this.setRow('face', face, face > 0.5 ? `${metrics.facePoints || 478} PTS` : '—');
    this.setRow('hands', hands, `${Math.round(hands * 2)}/2`);
    this.setRow('feet', feet, feet > 0.35 ? `${Math.round(feet * 100)}%` : '—');
    this.setRow('eyes', eyes, face > 0.5 ? pct(eyes) : '—');
    this.setRow('mouth', mouth, face > 0.5 ? pct(mouth) : '—');

    for (const chip of this.el.mobileChips) {
      const name = chip.dataset.mm;
      const value =
        name === 'body'
          ? pct(body)
          : name === 'face'
            ? face > 0.5
              ? 'ON'
              : '—'
            : name === 'hands'
              ? `${Math.round(hands * 2)}/2`
              : name === 'feet'
                ? feet > 0.35
                  ? 'ON'
                  : '—'
                : name === 'eyes'
                  ? face > 0.5
                    ? pct(eyes)
                    : '—'
                  : face > 0.5
                    ? pct(mouth)
                    : '—';
      const b = chip.querySelector('b');
      if (b && this.cache.chips[name] !== value) {
        this.cache.chips[name] = value;
        b.textContent = value;
      }
    }

    const gazeX = clamp(metrics.gazeX ?? 0, -1, 1);
    const gazeY = clamp(metrics.gazeY ?? 0, -1, 1);
    const gazeTransform = `translate(${(gazeX * 22).toFixed(1)}px, ${(-gazeY * 22).toFixed(1)}px)`;
    if (this.cache.gaze !== gazeTransform) {
      this.cache.gaze = gazeTransform;
      this.el.gazeDot.style.transform = gazeTransform;
      this.el.gazeValue.textContent = `${gazeX >= 0 ? '+' : ''}${gazeX.toFixed(2)} / ${gazeY >= 0 ? '+' : ''}${gazeY.toFixed(2)}`;
    }

    const blink = clamp(metrics.blink ?? 0);
    const jaw = clamp(metrics.jaw ?? mouth);
    const smile = clamp(metrics.smile ?? 0);
    this.setMeter('blink', this.el.blinkMeter, blink);
    this.setMeter('jaw', this.el.jawMeter, jaw);
    this.setMeter('smile', this.el.smileMeter, smile);
    this.setText('blinkValue', this.el.blinkValue, pct(blink));
    this.setText('jawValue', this.el.jawValue, pct(jaw));
    this.setText('smileValue', this.el.smileValue, pct(smile));

    const energy = clamp(stats.energy ?? metrics.energy ?? 0);
    this.pushEnergy(energy);
    this.setText('energyValue', this.el.energyValue, energy.toFixed(2));

    const fpsText = String(Math.round(stats.fps ?? 0));
    this.setText('fps', this.el.fps, fpsText);
    this.el.fps.classList.toggle('is-hot', (stats.fps ?? 0) > 50);
    this.setText('latency', this.el.latency, stats.latency ? `${Math.round(stats.latency)} MS` : '—');
    this.setText('points', this.el.points, String(metrics.points || (frame.mode === 'camera' ? 0 : 553)));
    this.setText('pipFps', this.el.pipFps, `${Math.round(stats.pipFps ?? stats.fps ?? 0)} FPS`);
  }

  setRow(name, value, label) {
    const row = this.rows[name];
    if (!row) return;
    const cached = this.cache.rows[name];
    if (!cached || Math.abs(cached.value - value) > 0.008) {
      row.bar.style.width = pct(value);
      this.cache.rows[name] = { ...(cached || {}), value };
    }
    if (!cached || cached.label !== label) {
      row.value.textContent = label;
      this.cache.rows[name] = { ...(this.cache.rows[name] || {}), label };
    }
    const active = value > 0.35;
    if (!cached || cached.active !== active) {
      row.row.classList.toggle('is-active', active);
      this.cache.rows[name] = { ...(this.cache.rows[name] || {}), active };
    }
  }

  setText(key, element, text) {
    if (!element) return;
    if (this.cache.values[key] === text) return;
    this.cache.values[key] = text;
    element.textContent = text;
  }

  setMeter(key, element, value) {
    if (!element) return;
    const cached = this.cache.meters[key];
    if (cached !== undefined && Math.abs(cached - value) < 0.008) return;
    this.cache.meters[key] = value;
    element.style.width = pct(value);
  }

  pushEnergy(value) {
    this.history.push(value);
    if (this.history.length > 64) this.history.shift();
    this.drawEnergy();
  }

  drawEnergy() {
    const ctx = this.energyCtx;
    const w = this.energyCanvasW;
    const h = this.energyCanvasH;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(95,245,255,0.07)';
    ctx.lineWidth = 1;
    for (let y = 8; y < h; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    if (this.history.length < 2) return;
    const step = w / (this.history.length - 1);
    const points = this.history.map((v, i) => [i * step, h - 3 - v * (h - 8)]);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(95,245,255,0.22)');
    gradient.addColorStop(1, 'rgba(95,245,255,0)');
    ctx.beginPath();
    ctx.moveTo(points[0][0], h);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(points[points.length - 1][0], h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(95,245,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#f2feff';
    ctx.fill();
  }
}
