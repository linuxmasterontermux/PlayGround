(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const STEP = 1 / 120;
  const STORE = { best: "flappyDrift.best", sound: "flappyDrift.sound" };
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const rand = (min, max) => min + Math.random() * (max - min);

  const readStore = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };

  const writeStore = (key, value) => {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      return;
    }
  };

  const SKY_PHASES = [
    {
      at: 0,
      top: "#63cdfa",
      mid: "#b3ebff",
      low: "#e9fbff",
      ridgeFar: "#a9ddc0",
      ridgeNear: "#63bd86",
      haze: "#dff6ec",
      cloud: "#ffffff",
      grass: "#73d466",
      soilTop: "#c99a62",
      soilBottom: "#8b5e35"
    },
    {
      at: 0.3,
      top: "#6f7fc9",
      mid: "#f2a6a3",
      low: "#ffdcb0",
      ridgeFar: "#9c96c0",
      ridgeNear: "#61759a",
      haze: "#ffd9c7",
      cloud: "#ffe1cf",
      grass: "#9ac06c",
      soilTop: "#b9865c",
      soilBottom: "#70492e"
    },
    {
      at: 0.55,
      top: "#0e1a44",
      mid: "#233468",
      low: "#4a5d91",
      ridgeFar: "#2e426c",
      ridgeNear: "#1a2a4e",
      haze: "#344b7d",
      cloud: "#9fb4d6",
      grass: "#3f7c66",
      soilTop: "#5c5470",
      soilBottom: "#363149"
    },
    {
      at: 0.8,
      top: "#2f4684",
      mid: "#967fbd",
      low: "#ffc5a5",
      ridgeFar: "#8b96bb",
      ridgeNear: "#526d8d",
      haze: "#d8c0cf",
      cloud: "#ffd6c6",
      grass: "#7fbe76",
      soilTop: "#b28b6b",
      soilBottom: "#75543e"
    },
    {
      at: 1,
      top: "#63cdfa",
      mid: "#b3ebff",
      low: "#e9fbff",
      ridgeFar: "#a9ddc0",
      ridgeNear: "#63bd86",
      haze: "#dff6ec",
      cloud: "#ffffff",
      grass: "#73d466",
      soilTop: "#c99a62",
      soilBottom: "#8b5e35"
    }
  ];

  const colorCache = new Map();

  const parseColor = (hex) => {
    let value = colorCache.get(hex);
    if (value) return value;
    const clean = hex.replace("#", "");
    value = [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
    colorCache.set(hex, value);
    return value;
  };

  const mixColor = (a, b, t) => {
    const ca = parseColor(a);
    const cb = parseColor(b);
    return `rgb(${Math.round(lerp(ca[0], cb[0], t))}, ${Math.round(lerp(ca[1], cb[1], t))}, ${Math.round(lerp(ca[2], cb[2], t))})`;
  };

  const roundedPath = (ctx, x, y, w, h, r) => {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  class SoundEngine {
    constructor() {
      this.enabled = readStore(STORE.sound, "on") !== "off";
      this.ctx = null;
      this.master = null;
      this.noise = null;
    }

    ensure() {
      if (!this.enabled) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!this.ctx) {
        try {
          this.ctx = new Context();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.34;
          this.master.connect(this.ctx.destination);
          this.noise = this.makeNoise();
        } catch (error) {
          this.ctx = null;
          return;
        }
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
    }

    makeNoise() {
      const length = Math.floor(this.ctx.sampleRate * 0.6);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    tone(options) {
      if (!this.enabled) return;
      this.ensure();
      if (!this.ctx) return;
      const { type = "sine", from = 440, to = 440, duration = 0.16, gain = 0.1, delay = 0 } = options;
      const start = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp);
      amp.connect(this.master);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    burst(options) {
      if (!this.enabled) return;
      this.ensure();
      if (!this.ctx || !this.noise) return;
      const { duration = 0.18, gain = 0.12, frequency = 1200, q = 1.1, delay = 0 } = options;
      const start = this.ctx.currentTime + delay;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const amp = this.ctx.createGain();
      source.buffer = this.noise;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(frequency, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, frequency * 0.45), start + duration);
      filter.Q.value = q;
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(this.master);
      source.start(start);
      source.stop(start + duration + 0.03);
    }

    flap() {
      this.tone({ type: "triangle", from: 500, to: 760, duration: 0.11, gain: 0.09 });
      this.burst({ duration: 0.09, gain: 0.035, frequency: 1800, q: 0.8 });
    }

    score(value) {
      const base = 720 + Math.min(value, 30) * 9;
      this.tone({ type: "sine", from: base, to: base * 1.18, duration: 0.12, gain: 0.075 });
      this.tone({ type: "sine", from: base * 1.5, to: base * 1.62, duration: 0.16, gain: 0.05, delay: 0.07 });
    }

    hit() {
      this.burst({ duration: 0.28, gain: 0.2, frequency: 620, q: 0.7 });
      this.tone({ type: "sine", from: 190, to: 52, duration: 0.34, gain: 0.17 });
    }

    die() {
      this.tone({ type: "sawtooth", from: 320, to: 68, duration: 0.52, gain: 0.065, delay: 0.08 });
    }

    ui() {
      this.tone({ type: "sine", from: 620, to: 860, duration: 0.06, gain: 0.04 });
    }

    toggle() {
      this.enabled = !this.enabled;
      writeStore(STORE.sound, this.enabled ? "on" : "off");
      if (this.enabled) {
        this.ensure();
        this.ui();
      }
      return this.enabled;
    }
  }

  class TiltController {
    constructor() {
      this.active = false;
      this.listening = false;
      this.gotReading = false;
      this.hasBase = false;
      this.invert = false;
      this.smooth = { x: 0, y: 0, z: 0 };
      this.base = { x: 0, y: 0, z: 0 };
      this.handleMotion = this.handleMotion.bind(this);
      this.handleOrientation = this.handleOrientation.bind(this);
      this.angle = this.readAngle();
      if (screen.orientation && screen.orientation.addEventListener) {
        screen.orientation.addEventListener("change", this.handleOrientation);
      }
      window.addEventListener("orientationchange", this.handleOrientation);
    }

    get available() {
      return typeof DeviceMotionEvent !== "undefined";
    }

    get needsPermission() {
      return this.available && typeof DeviceMotionEvent.requestPermission === "function";
    }

    readAngle() {
      const raw = screen.orientation && typeof screen.orientation.angle === "number"
        ? screen.orientation.angle
        : (typeof window.orientation === "number" ? window.orientation : 0);
      return ((raw % 360) + 360) % 360;
    }

    handleOrientation() {
      this.angle = this.readAngle();
      this.hasBase = false;
      window.setTimeout(() => {
        if (this.active && this.gotReading) this.calibrate();
      }, 420);
    }

    async enable() {
      if (this.active) return { ok: true };
      if (!this.available) {
        return { ok: false, message: "Motion sensors are not available here. Tap to flap instead." };
      }
      if (this.needsPermission) {
        try {
          const permission = await DeviceMotionEvent.requestPermission();
          if (permission !== "granted") {
            return { ok: false, message: "Motion access was not granted. Tap controls are ready to go." };
          }
        } catch (error) {
          return { ok: false, message: "Motion access needs a direct tap. Try the switch again." };
        }
      }
      this.active = true;
      this.gotReading = false;
      this.hasBase = false;
      this.smooth = { x: 0, y: 0, z: 0 };
      window.addEventListener("devicemotion", this.handleMotion, { passive: true });
      this.listening = true;
      const hasData = await new Promise((resolve) => {
        const start = performance.now();
        const check = () => {
          if (this.gotReading) {
            resolve(true);
          } else if (performance.now() - start > 1600) {
            resolve(false);
          } else {
            window.setTimeout(check, 60);
          }
        };
        check();
      });
      if (!hasData) {
        this.disable();
        return { ok: false, message: "No motion data found. Tap controls still work." };
      }
      this.calibrate();
      return { ok: true };
    }

    disable() {
      this.active = false;
      this.gotReading = false;
      this.hasBase = false;
      if (this.listening) {
        window.removeEventListener("devicemotion", this.handleMotion);
        this.listening = false;
      }
    }

    handleMotion(event) {
      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration) return;
      if (acceleration.x == null && acceleration.y == null && acceleration.z == null) return;
      const x = acceleration.x || 0;
      const y = acceleration.y || 0;
      const z = acceleration.z || 0;
      if (this.gotReading) {
        this.smooth.x = lerp(this.smooth.x, x, 0.24);
        this.smooth.y = lerp(this.smooth.y, y, 0.24);
        this.smooth.z = lerp(this.smooth.z, z, 0.24);
      } else {
        this.smooth.x = x;
        this.smooth.y = y;
        this.smooth.z = z;
        this.gotReading = true;
      }
      if (!this.hasBase) this.calibrate();
    }

    upFor(values) {
      switch (this.readAngle()) {
        case 90:
          return -values.x;
        case 180:
          return -values.y;
        case 270:
          return values.x;
        default:
          return values.y;
      }
    }

    calibrate() {
      if (!this.gotReading) return false;
      this.base.x = this.smooth.x;
      this.base.y = this.smooth.y;
      this.base.z = this.smooth.z;
      this.hasBase = true;
      return true;
    }

    getInput() {
      if (!this.active || !this.gotReading || !this.hasBase) return 0;
      let delta = (this.upFor(this.smooth) - this.upFor(this.base)) / 1.8;
      if (this.invert) delta = -delta;
      delta = clamp(delta, -1, 1);
      const magnitude = Math.abs(delta);
      if (magnitude < 0.06) return 0;
      return Math.sign(delta) * Math.min(1, (magnitude - 0.06) / 0.82);
    }
  }

  class Bird {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.vy = 0;
      this.r = 18;
      this.rotation = 0;
      this.wingPhase = 0;
      this.flapAnim = 0;
      this.dead = false;
    }
  }

  class FlappyDrift {
    constructor() {
      this.canvas = $("game");
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      this.ui = {
        hud: $("hud"),
        score: $("score"),
        tiltChip: $("tiltChip"),
        pauseBtn: $("pauseBtn"),
        soundBtn: $("soundBtn"),
        menu: $("menuScreen"),
        menuBest: $("menuBest"),
        playBtn: $("playBtn"),
        soundToggle: $("soundToggle"),
        tiltToggle: $("tiltToggle"),
        pauseScreen: $("pauseScreen"),
        pauseSoundToggle: $("pauseSoundToggle"),
        pauseTiltToggle: $("pauseTiltToggle"),
        invertTiltToggle: $("invertTiltToggle"),
        recenterBtn: $("recenterBtn"),
        resumeBtn: $("resumeBtn"),
        restartBtn: $("restartBtn"),
        pauseMenuBtn: $("pauseMenuBtn"),
        overScreen: $("overScreen"),
        finalScore: $("finalScore"),
        finalBest: $("finalBest"),
        newBest: $("newBest"),
        medal: $("medal"),
        medalLabel: $("medalLabel"),
        retryBtn: $("retryBtn"),
        menuBtn: $("menuBtn"),
        toast: $("toast"),
        live: $("liveRegion")
      };
      this.sound = new SoundEngine();
      this.tilt = new TiltController();
      this.bird = new Bird();
      this.state = "menu";
      this.score = 0;
      this.best = Number(readStore(STORE.best, 0)) || 0;
      this.pipes = [];
      this.particles = [];
      this.stars = [];
      this.clouds = [];
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.time = 0;
      this.runTime = 0;
      this.skyProgress = 0.02;
      this.distance = 0;
      this.groundY = 0;
      this.groundHeight = 0;
      this.pipeWidth = 70;
      this.pipeGap = 200;
      this.pipeSpacing = 300;
      this.baseSpeed = 200;
      this.gravity = 2600;
      this.flapPower = 700;
      this.maxFall = 950;
      this.spawnTimer = 0;
      this.tiltInput = 0;
      this.debugTilt = null;
      this.shake = 0;
      this.flash = 0;
      this.deathTimer = 0;
      this.acc = 0;
      this.toastTimer = 0;
      this.tiltBusy = false;
      this.vignette = null;
      this.buildScenery();
      this.bind();
      this.resize();
      this.syncSound();
      this.syncTilt();
      this.refreshBest();
      this.setState("menu");
      this.lastFrame = performance.now();
      requestAnimationFrame((now) => this.loop(now));
      if (new URLSearchParams(location.search).has("debug")) this.exposeDebug();
    }

    buildScenery() {
      for (let i = 0; i < 70; i += 1) {
        this.stars.push({
          x: Math.random(),
          y: Math.random() * 0.62,
          size: rand(0.6, 2),
          phase: rand(0, TAU),
          speed: rand(0.7, 2.2)
        });
      }
      for (let i = 0; i < 9; i += 1) {
        this.clouds.push({
          x: Math.random(),
          y: rand(0.1, 0.5),
          scale: rand(0.55, 1.35),
          speed: rand(4, 13),
          alpha: rand(0.38, 0.78),
          phase: rand(0, TAU)
        });
      }
    }

    bind() {
      this.canvas.addEventListener("pointerdown", (event) => this.onCanvasPointer(event));
      this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      this.ui.playBtn.addEventListener("click", () => this.startGame());
      this.ui.retryBtn.addEventListener("click", () => this.startGame());
      this.ui.pauseBtn.addEventListener("click", () => this.pause());
      this.ui.resumeBtn.addEventListener("click", () => this.resume());
      this.ui.restartBtn.addEventListener("click", () => this.startGame());
      this.ui.pauseMenuBtn.addEventListener("click", () => this.goMenu());
      this.ui.menuBtn.addEventListener("click", () => this.goMenu());
      this.ui.soundBtn.addEventListener("click", () => this.toggleSound());
      this.ui.soundToggle.addEventListener("click", () => this.toggleSound());
      this.ui.pauseSoundToggle.addEventListener("click", () => this.toggleSound());
      this.ui.tiltToggle.addEventListener("click", () => this.toggleTilt());
      this.ui.pauseTiltToggle.addEventListener("click", () => this.toggleTilt());
      this.ui.invertTiltToggle.addEventListener("click", () => this.toggleInvert());
      this.ui.recenterBtn.addEventListener("click", () => {
        if (this.tilt.calibrate()) this.toast("Tilt recentered. Hold naturally.");
      });
      window.addEventListener("keydown", (event) => this.onKey(event));
      window.addEventListener("resize", () => this.resize());
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => this.resize());
      }
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "playing") this.pause();
      });
    }

    onCanvasPointer(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      this.sound.ensure();
      if (this.state === "menu") {
        this.startGame();
      } else if (this.state === "playing") {
        this.flap();
      }
    }

    onKey(event) {
      const tag = document.activeElement ? document.activeElement.tagName : "";
      const key = event.key;
      if (key === " " || key === "ArrowUp" || key === "Enter") {
        if (tag === "BUTTON" && (key === " " || key === "Enter")) return;
        event.preventDefault();
        this.sound.ensure();
        if (this.state === "menu" || this.state === "gameover") this.startGame();
        else if (this.state === "playing") this.flap();
      } else if (key === "Escape" || key === "p" || key === "P") {
        if (this.state === "playing") {
          event.preventDefault();
          this.pause();
        } else if (this.state === "paused") {
          event.preventDefault();
          this.resume();
        }
      }
    }

    resize() {
      const width = Math.max(280, window.innerWidth);
      const height = Math.max(320, window.innerHeight);
      const oldW = this.w;
      const oldH = this.h;
      this.w = width;
      this.h = height;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.groundHeight = clamp(height * 0.125, 60, 112);
      this.groundY = height - this.groundHeight;
      this.pipeWidth = clamp(width * 0.155, 58, 96);
      this.pipeGap = clamp(height * 0.245, 152, 232);
      this.pipeSpacing = clamp(width * 0.72, 276, 460);
      this.baseSpeed = clamp(width * 0.49, 188, 288);
      this.gravity = clamp(height * 3.08, 2200, 3420);
      this.flapPower = clamp(height * 0.86, 580, 800);
      this.maxFall = clamp(height * 1.14, 700, 1080);
      this.bird.r = clamp(Math.min(width, height) * 0.046, 15, 26);
      if (oldW && oldH && (oldW !== width || oldH !== height)) {
        const sx = width / oldW;
        const sy = height / oldH;
        for (const pipe of this.pipes) {
          pipe.x *= sx;
          pipe.gapY *= sy;
          pipe.gapH = clamp(pipe.gapH * sy, 140, this.pipeGap);
          pipe.w = this.pipeWidth;
        }
        this.bird.y = clamp(this.bird.y * sy, this.bird.r, this.groundY - this.bird.r);
      }
      this.bird.x = this.birdTargetX();
      if (this.state === "menu") {
        const pos = this.menuBirdPosition();
        this.bird.y = pos.y;
      }
      const gradient = this.ctx.createRadialGradient(
        width / 2,
        height * 0.44,
        Math.min(width, height) * 0.22,
        width / 2,
        height * 0.44,
        Math.max(width, height) * 0.74
      );
      gradient.addColorStop(0, "rgba(5, 20, 42, 0)");
      gradient.addColorStop(1, "rgba(5, 20, 42, 0.25)");
      this.vignette = gradient;
    }

    birdTargetX() {
      return clamp(this.w * 0.25, 78, 210);
    }

    menuBirdPosition() {
      if (this.w > this.h && this.h < 620) {
        return { x: this.w * 0.73, y: this.h * 0.52 };
      }
      return { x: this.w * 0.5, y: this.h * 0.43 };
    }

    setState(next) {
      this.state = next;
      const menu = next === "menu";
      const playing = next === "playing";
      const paused = next === "paused";
      const over = next === "gameover";
      this.ui.menu.classList.toggle("is-visible", menu);
      this.ui.menu.setAttribute("aria-hidden", String(!menu));
      this.ui.pauseScreen.classList.toggle("is-visible", paused);
      this.ui.pauseScreen.setAttribute("aria-hidden", String(!paused));
      this.ui.overScreen.classList.toggle("is-visible", over);
      this.ui.overScreen.setAttribute("aria-hidden", String(!over));
      const showHud = playing || next === "dying";
      this.ui.hud.classList.toggle("is-visible", showHud);
      this.ui.hud.setAttribute("aria-hidden", String(!showHud));
      this.ui.pauseBtn.disabled = !playing;
      this.syncTilt();
    }

    startGame() {
      this.sound.ensure();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      this.pipes = [];
      this.particles = [];
      this.score = 0;
      this.runTime = 0;
      this.skyProgress = 0.02;
      this.distance = 0;
      this.spawnTimer = 1.5;
      this.deathTimer = 0;
      this.shake = 0;
      this.flash = 0;
      this.tiltInput = 0;
      this.bird.dead = false;
      this.bird.rotation = 0;
      this.bird.vy = -this.flapPower * 0.52;
      this.bird.y = this.h * 0.43;
      this.bird.x = this.birdTargetX();
      this.ui.score.textContent = "0";
      this.refreshBest();
      if (this.tilt.active) this.tilt.calibrate();
      this.setState("playing");
      this.emitFeathers(this.bird.x - this.bird.r * 0.7, this.bird.y + this.bird.r * 0.2, 4, 0.55);
      this.sound.flap();
      this.announce("Flight started. Tap to flap.");
    }

    goMenu() {
      this.pipes = [];
      this.particles = [];
      this.score = 0;
      this.bird.dead = false;
      this.bird.vy = 0;
      this.bird.rotation = 0;
      this.bird.y = this.menuBirdPosition().y;
      this.ui.score.textContent = "0";
      this.refreshBest();
      if (this.tilt.active) this.tilt.calibrate();
      this.setState("menu");
      this.announce("Main menu.");
    }

    pause() {
      if (this.state !== "playing") return;
      this.setState("paused");
      this.announce("Game paused.");
      if (this.ui.resumeBtn.focus) this.ui.resumeBtn.focus({ preventScroll: true });
    }

    resume() {
      if (this.state !== "paused") return;
      if (this.tilt.active) this.tilt.calibrate();
      this.setState("playing");
      this.announce("Flight resumed.");
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    flap() {
      if (this.state !== "playing") return;
      const power = this.flapPower * (this.tilt.active && this.tilt.gotReading ? 0.8 : 1);
      this.bird.vy = -power;
      this.bird.flapAnim = 1;
      this.bird.wingPhase = 0;
      this.shake = Math.max(this.shake, reducedMotion ? 0.5 : 1.8);
      this.emitFeathers(this.bird.x - this.bird.r * 0.8, this.bird.y + this.bird.r * 0.25, 3, 0.5);
      this.sound.flap();
    }

    toggleSound() {
      const on = this.sound.toggle();
      this.syncSound();
      this.toast(on ? "Sound on." : "Sound muted.");
    }

    syncSound() {
      const on = this.sound.enabled;
      const label = on ? "Mute sound" : "Unmute sound";
      this.ui.soundBtn.classList.toggle("is-muted", !on);
      this.ui.soundBtn.setAttribute("aria-pressed", String(!on));
      this.ui.soundBtn.setAttribute("aria-label", label);
      for (const toggle of [this.ui.soundToggle, this.ui.pauseSoundToggle]) {
        toggle.setAttribute("aria-checked", String(on));
        const state = toggle.querySelector(".toggle-row__state");
        if (state) state.textContent = on ? "On" : "Off";
      }
    }

    async toggleTilt() {
      if (this.tiltBusy) return;
      this.sound.ensure();
      if (this.tilt.active) {
        this.tilt.disable();
        this.tiltInput = 0;
        this.syncTilt();
        this.toast("Tilt controls off. Tap to flap.");
        return;
      }
      this.tiltBusy = true;
      this.ui.tiltToggle.classList.add("is-busy");
      this.ui.pauseTiltToggle.classList.add("is-busy");
      const result = await this.tilt.enable();
      this.tiltBusy = false;
      this.ui.tiltToggle.classList.remove("is-busy");
      this.ui.pauseTiltToggle.classList.remove("is-busy");
      if (result.ok && this.tilt.active) {
        this.tiltInput = 0;
        this.tilt.calibrate();
        this.syncTilt();
        this.toast("Tilt ready. Hold naturally, tilt back to climb.");
        this.announce("Tilt controls enabled. Tilt the device back to climb.");
      } else {
        this.syncTilt();
        this.toast(result.message);
      }
    }

    toggleInvert() {
      if (!this.tilt.active) return;
      this.tilt.invert = !this.tilt.invert;
      this.tilt.calibrate();
      this.syncTilt();
      this.toast(this.tilt.invert ? "Tilt direction inverted." : "Tilt direction restored.");
    }

    syncTilt() {
      const active = this.tilt.active;
      for (const toggle of [this.ui.tiltToggle, this.ui.pauseTiltToggle]) {
        toggle.setAttribute("aria-checked", String(active));
        const state = toggle.querySelector(".toggle-row__state");
        if (state) state.textContent = active ? "On" : "Off";
      }
      this.ui.invertTiltToggle.hidden = !active;
      this.ui.invertTiltToggle.setAttribute("aria-checked", String(this.tilt.invert));
      const invertState = this.ui.invertTiltToggle.querySelector(".toggle-row__state");
      if (invertState) invertState.textContent = this.tilt.invert ? "On" : "Off";
      this.ui.recenterBtn.hidden = !active;
      this.ui.tiltChip.hidden = !(active && (this.state === "playing" || this.state === "dying"));
    }

    refreshBest() {
      this.ui.menuBest.hidden = this.best <= 0;
      const strong = this.ui.menuBest.querySelector("strong");
      if (strong) strong.textContent = String(this.best);
    }

    toast(message) {
      if (!message) return;
      this.ui.toast.textContent = message;
      this.ui.toast.classList.remove("is-visible");
      void this.ui.toast.offsetWidth;
      this.ui.toast.classList.add("is-visible");
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => {
        this.ui.toast.classList.remove("is-visible");
      }, 3400);
    }

    announce(message) {
      this.ui.live.textContent = "";
      window.setTimeout(() => {
        this.ui.live.textContent = message;
      }, 30);
    }

    addScore() {
      this.score += 1;
      this.ui.score.textContent = String(this.score);
      this.ui.score.classList.remove("is-popping");
      void this.ui.score.offsetWidth;
      this.ui.score.classList.add("is-popping");
      this.shake = Math.max(this.shake, reducedMotion ? 0.4 : 2.2);
      this.emitSparkles(this.bird.x + this.bird.r * 1.4, this.bird.y, 8);
      this.sound.score(this.score);
    }

    die(hitGround) {
      if (this.state !== "playing") return;
      this.setState("dying");
      this.deathTimer = 0;
      this.bird.dead = true;
      this.bird.vy = hitGround ? -220 : Math.min(this.bird.vy, -240);
      this.bird.rotation = 0;
      this.shake = reducedMotion ? 3 : 14;
      this.flash = reducedMotion ? 0.12 : 0.58;
      this.sound.hit();
      this.sound.die();
      this.emitFeathers(this.bird.x, this.bird.y, 16, 1.15);
      this.emitDust(this.bird.x, this.bird.y + this.bird.r, 10);
      this.announce(`Flight over. Score ${this.score}.`);
    }

    finishRun() {
      const newBest = this.score > this.best;
      if (newBest) {
        this.best = this.score;
        writeStore(STORE.best, this.best);
      }
      this.ui.finalScore.textContent = String(this.score);
      this.ui.finalBest.textContent = String(this.best);
      this.ui.newBest.hidden = !newBest || this.score <= 0;
      const tier = this.medalFor(this.score);
      this.ui.medal.className = `medal tier-${tier.key}`;
      this.ui.medalLabel.textContent = tier.label;
      this.refreshBest();
      this.setState("gameover");
      if (this.ui.retryBtn.focus) this.ui.retryBtn.focus({ preventScroll: true });
    }

    medalFor(score) {
      if (score >= 50) return { key: "aurora", label: "Aurora" };
      if (score >= 30) return { key: "gold", label: "Gold" };
      if (score >= 15) return { key: "silver", label: "Silver" };
      if (score >= 7) return { key: "bronze", label: "Bronze" };
      return { key: "rookie", label: "Rookie" };
    }

    currentSpeed() {
      return Math.min(this.baseSpeed + Math.min(this.score, 60) * 1.25, this.baseSpeed + 78);
    }

    spawnPipe() {
      const gapH = Math.max(140, this.pipeGap * (1 - Math.min(this.score * 0.0032, 0.14)));
      const marginTop = this.h * 0.09 + gapH / 2;
      const marginBottom = this.groundY - this.h * 0.085 - gapH / 2;
      let gapY = rand(marginTop, Math.max(marginTop + 1, marginBottom));
      const last = this.pipes[this.pipes.length - 1];
      if (last) {
        gapY = clamp(gapY, last.gapY - this.h * 0.17, last.gapY + this.h * 0.17);
        gapY = clamp(gapY, marginTop, Math.max(marginTop, marginBottom));
      }
      this.pipes.push({
        x: this.w + this.pipeWidth + 28,
        w: this.pipeWidth,
        gapY,
        gapH,
        scored: false
      });
    }

    update(dt) {
      this.time += dt;
      this.bird.wingPhase += dt * (8 + this.bird.flapAnim * 25);
      this.bird.flapAnim = Math.max(0, this.bird.flapAnim - dt * 3.3);
      this.shake *= Math.exp(-dt * 7.5);
      this.flash = Math.max(0, this.flash - dt * 2.4);
      this.updateParticles(dt);

      if (this.state === "playing") {
        this.runTime += dt;
        this.skyProgress = (0.02 + this.runTime * 0.0055 + this.score * 0.017) % 1;
        this.distance += this.currentSpeed() * dt;
        this.updateBird(dt);
        this.updatePipes(dt);
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnPipe();
          this.spawnTimer = clamp(this.pipeSpacing / this.currentSpeed(), 1.05, 2.2);
        }
        this.checkCollisions();
      } else if (this.state === "dying") {
        this.deathTimer += dt;
        this.updateBird(dt);
        if (this.deathTimer > 1.15) this.finishRun();
      } else if (this.state === "menu") {
        this.distance += dt * 24;
        this.skyProgress = (this.skyProgress + dt * 0.0006) % 1;
        const pos = this.menuBirdPosition();
        this.bird.y = pos.y + Math.sin(this.time * 2.1) * 7;
        this.bird.x = pos.x;
      }
    }

    updateBird(dt) {
      const bird = this.bird;
      if (this.state === "dying") {
        bird.vy += this.gravity * 1.08 * dt;
        bird.vy = Math.min(bird.vy, this.maxFall);
        bird.y += bird.vy * dt;
        bird.rotation += dt * 5.6;
        const floor = this.groundY - bird.r * 0.52;
        if (bird.y > floor) {
          bird.y = floor;
          bird.vy = 0;
        }
        return;
      }

      const tiltTarget = this.debugTilt !== null
        ? this.debugTilt
        : (this.tilt.active && this.tilt.gotReading ? this.tilt.getInput() : 0);
      this.tiltInput = lerp(this.tiltInput, tiltTarget, Math.min(1, dt * 9));
      if (this.tilt.active && this.tilt.gotReading) {
        bird.vy += (this.gravity * 0.52 - this.tiltInput * this.gravity * 1.05) * dt;
      } else {
        bird.vy += this.gravity * dt;
      }
      bird.vy = clamp(bird.vy, -this.flapPower * 1.2, this.maxFall);
      bird.y += bird.vy * dt;
      if (bird.y < bird.r * 1.15) {
        bird.y = bird.r * 1.15;
        bird.vy = Math.max(bird.vy, 0);
      }
      const targetRotation = bird.vy < 0 ? -0.52 : clamp(bird.vy / this.maxFall, 0, 1) * 1.18;
      bird.rotation = lerp(bird.rotation, targetRotation, Math.min(1, dt * 9));
    }

    updatePipes(dt) {
      const speed = this.currentSpeed();
      for (const pipe of this.pipes) pipe.x -= speed * dt;
      if (this.pipes.length && this.pipes[0].x + this.pipes[0].w < -90) {
        this.pipes.shift();
      }
    }

    checkCollisions() {
      const bird = this.bird;
      const r = bird.r * 0.74;
      if (bird.y + r >= this.groundY) {
        bird.y = this.groundY - r;
        this.die(true);
        return;
      }
      for (const pipe of this.pipes) {
        if (bird.x + r > pipe.x && bird.x - r < pipe.x + pipe.w) {
          const top = pipe.gapY - pipe.gapH / 2;
          const bottom = pipe.gapY + pipe.gapH / 2;
          if (bird.y - r < top || bird.y + r > bottom) {
            this.die(false);
            return;
          }
        }
        if (!pipe.scored && bird.x - bird.r > pipe.x + pipe.w) {
          pipe.scored = true;
          this.addScore();
        }
      }
    }

    emitFeathers(x, y, count, spread) {
      if (reducedMotion) count = Math.min(3, count);
      for (let i = 0; i < count; i += 1) {
        if (this.particles.length > 230) break;
        const angle = rand(0, TAU);
        const speed = rand(35, 150) * spread;
        this.particles.push({
          type: "feather",
          x,
          y,
          vx: Math.cos(angle) * speed - 26,
          vy: Math.sin(angle) * speed + rand(-30, 25),
          gravity: rand(160, 340),
          drag: 1.6,
          life: rand(0.45, 1.1),
          maxLife: 1.1,
          size: rand(2.2, 5.2),
          rot: rand(0, TAU),
          spin: rand(-8, 8),
          color: Math.random() > 0.45 ? "#ffd447" : "#fff4c7",
          alpha: rand(0.65, 1)
        });
      }
    }

    emitSparkles(x, y, count) {
      if (reducedMotion) count = Math.min(4, count);
      for (let i = 0; i < count; i += 1) {
        if (this.particles.length > 230) break;
        const angle = rand(0, TAU);
        const speed = rand(30, 120);
        this.particles.push({
          type: "spark",
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: -26,
          drag: 2.5,
          life: rand(0.3, 0.75),
          maxLife: 0.75,
          size: rand(1.8, 4.4),
          rot: 0,
          spin: 0,
          color: Math.random() > 0.45 ? "#fff7bf" : "#ffd447",
          alpha: 1
        });
      }
    }

    emitDust(x, y, count) {
      for (let i = 0; i < count; i += 1) {
        if (this.particles.length > 230) break;
        const angle = rand(Math.PI, TAU);
        const speed = rand(20, 90);
        this.particles.push({
          type: "dust",
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 15,
          gravity: -20,
          drag: 2.4,
          life: rand(0.35, 0.8),
          maxLife: 0.8,
          size: rand(3, 7),
          rot: 0,
          spin: 0,
          color: "#f4ead4",
          alpha: 0.65
        });
      }
    }

    updateParticles(dt) {
      for (const particle of this.particles) {
        particle.life -= dt;
        particle.vy += particle.gravity * dt;
        particle.vx *= Math.max(0, 1 - particle.drag * dt);
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.rot += particle.spin * dt;
      }
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    palette() {
      const progress = ((this.skyProgress % 1) + 1) % 1;
      let index = 0;
      while (index < SKY_PHASES.length - 2 && progress > SKY_PHASES[index + 1].at) index += 1;
      const from = SKY_PHASES[index];
      const to = SKY_PHASES[index + 1];
      const range = to.at - from.at || 1;
      const t = smooth(clamp((progress - from.at) / range, 0, 1));
      const result = { night: clamp(1 - Math.abs(progress - 0.55) / 0.21, 0, 1) };
      for (const key of ["top", "mid", "low", "ridgeFar", "ridgeNear", "haze", "cloud", "grass", "soilTop", "soilBottom"]) {
        result[key] = mixColor(from[key], to[key], t);
      }
      return result;
    }

    loop(now) {
      requestAnimationFrame((next) => this.loop(next));
      const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;
      if (this.state !== "paused") {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 6) {
          this.update(STEP);
          this.acc -= STEP;
          steps += 1;
        }
        if (steps === 6) this.acc = 0;
      } else {
        this.acc = 0;
      }
      this.render();
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const palette = this.palette();
      this.drawSky(palette);
      this.drawStars(palette);
      this.drawCelestial(palette);
      this.drawHills(palette);
      this.drawClouds(palette);
      ctx.save();
      if (this.shake > 0.15 && !reducedMotion) {
        ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      }
      this.drawPipes();
      this.drawGround(palette);
      if (this.state === "menu") {
        this.drawBird(this.bird, this.bird.x, this.bird.y, Math.sin(this.time * 1.6) * 0.13);
      } else {
        this.drawBird(this.bird, this.bird.x, this.bird.y, this.bird.rotation);
      }
      this.drawParticles();
      ctx.restore();
      if (this.vignette) {
        ctx.fillStyle = this.vignette;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      if (this.flash > 0.01) {
        ctx.globalAlpha = Math.min(1, this.flash);
        ctx.fillStyle = "#fff8e6";
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.globalAlpha = 1;
      }
    }

    drawSky(palette) {
      const ctx = this.ctx;
      const gradient = ctx.createLinearGradient(0, 0, 0, this.groundY + 2);
      gradient.addColorStop(0, palette.top);
      gradient.addColorStop(0.55, palette.mid);
      gradient.addColorStop(1, palette.low);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.w, this.groundY + 2);
      const haze = ctx.createLinearGradient(0, this.groundY - this.h * 0.3, 0, this.groundY);
      haze.addColorStop(0, "rgba(255,255,255,0)");
      haze.addColorStop(1, palette.haze);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = haze;
      ctx.fillRect(0, this.groundY - this.h * 0.3, this.w, this.h * 0.3);
      ctx.globalAlpha = 1;
    }

    drawStars(palette) {
      if (palette.night < 0.01) return;
      const ctx = this.ctx;
      const horizon = this.groundY * 0.72;
      for (const star of this.stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(this.time * star.speed + star.phase);
        ctx.globalAlpha = palette.night * twinkle * 0.9;
        ctx.fillStyle = "#f7fbff";
        ctx.beginPath();
        ctx.arc(star.x * this.w, star.y * horizon, star.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawCelestial(palette) {
      const ctx = this.ctx;
      const progress = ((this.skyProgress % 1) + 1) % 1;
      const sunAlpha = clamp(1 - Math.abs(progress - 0.08) / 0.31, 0, 1);
      const moonAlpha = clamp(1 - Math.abs(progress - 0.55) / 0.26, 0, 1);
      const size = Math.min(this.w, this.h) * 0.055;
      const sunX = this.w * 0.78;
      const sunY = this.h * 0.16;
      const moonX = this.w * 0.22;
      const moonY = this.h * 0.15;

      if (sunAlpha > 0.01) {
        const glow = ctx.createRadialGradient(sunX, sunY, size * 0.5, sunX, sunY, size * 4.2);
        glow.addColorStop(0, "rgba(255, 246, 178, 0.75)");
        glow.addColorStop(0.45, "rgba(255, 231, 140, 0.18)");
        glow.addColorStop(1, "rgba(255, 231, 140, 0)");
        ctx.globalAlpha = sunAlpha;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, size * 4.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#fff5bd";
        ctx.beginPath();
        ctx.arc(sunX, sunY, size, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (moonAlpha > 0.01) {
        const glow = ctx.createRadialGradient(moonX, moonY, size * 0.4, moonX, moonY, size * 3.8);
        glow.addColorStop(0, "rgba(230, 242, 255, 0.55)");
        glow.addColorStop(0.5, "rgba(214, 232, 255, 0.12)");
        glow.addColorStop(1, "rgba(214, 232, 255, 0)");
        ctx.globalAlpha = moonAlpha;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, size * 3.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#f4f8ff";
        ctx.beginPath();
        ctx.arc(moonX, moonY, size * 0.82, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = moonAlpha * 0.12;
        ctx.fillStyle = "#7c91b5";
        ctx.beginPath();
        ctx.arc(moonX - size * 0.24, moonY - size * 0.18, size * 0.18, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(moonX + size * 0.26, moonY + size * 0.2, size * 0.12, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(moonX + size * 0.12, moonY - size * 0.32, size * 0.09, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    drawHills(palette) {
      const ctx = this.ctx;
      const drawLayer = (baseY, amplitude, speed, color, alpha, phase) => {
        const offset = (this.distance * speed + this.time * 3) % (this.w * 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-30, this.groundY + 4);
        for (let x = -30; x <= this.w + 30; x += 14) {
          const wave = Math.sin((x + offset) * 0.0042 + phase) * amplitude
            + Math.sin((x + offset) * 0.0015 + phase * 1.7) * amplitude * 0.72;
          ctx.lineTo(x, baseY + wave);
        }
        ctx.lineTo(this.w + 30, this.groundY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      drawLayer(this.groundY - this.h * 0.18, this.h * 0.036, 0.14, palette.ridgeFar, 0.7, 0.8);
      drawLayer(this.groundY - this.h * 0.085, this.h * 0.026, 0.3, palette.ridgeNear, 0.86, 2.2);
    }

    drawClouds(palette) {
      const ctx = this.ctx;
      for (const cloud of this.clouds) {
        const width = this.w * 0.19 * cloud.scale;
        const height = width * 0.28;
        const span = this.w + width * 2.4;
        const x = ((cloud.x * span + this.time * cloud.speed) % span) - width * 1.2;
        const y = cloud.y * this.groundY + Math.sin(this.time * 0.22 + cloud.phase) * 5;
        ctx.globalAlpha = cloud.alpha * (0.72 + palette.night * 0.08);
        ctx.fillStyle = palette.cloud;
        roundedPath(ctx, x, y, width, height * 0.86, height * 0.42);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + width * 0.27, y + height * 0.05, height * 0.52, 0, TAU);
        ctx.arc(x + width * 0.52, y - height * 0.16, height * 0.7, 0, TAU);
        ctx.arc(x + width * 0.75, y + height * 0.09, height * 0.46, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawPipes() {
      const ctx = this.ctx;
      for (const pipe of this.pipes) {
        const top = pipe.gapY - pipe.gapH / 2;
        const bottom = pipe.gapY + pipe.gapH / 2;
        this.drawPipeBody(pipe.x, -20, pipe.w, top + 20, true);
        this.drawPipeBody(pipe.x, bottom, pipe.w, this.groundY - bottom, false);
      }
      ctx.globalAlpha = 1;
    }

    drawPipeBody(x, y, w, h, capAtBottom) {
      const ctx = this.ctx;
      const capHeight = clamp(w * 0.34, 18, 30);
      const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
      gradient.addColorStop(0, "#266d3a");
      gradient.addColorStop(0.16, "#67c764");
      gradient.addColorStop(0.4, "#93e488");
      gradient.addColorStop(0.7, "#4dab51");
      gradient.addColorStop(1, "#1f6034");

      ctx.fillStyle = gradient;
      roundedPath(ctx, x, y, w, h, Math.min(6, w * 0.08));
      ctx.fill();
      ctx.strokeStyle = "rgba(18, 73, 38, 0.72)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#e8ffd9";
      roundedPath(ctx, x + w * 0.2, y, Math.max(2.5, w * 0.055), h, 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const capY = capAtBottom ? y + h - capHeight : y;
      const capGradient = ctx.createLinearGradient(x - 7, 0, x + w + 7, 0);
      capGradient.addColorStop(0, "#266d3a");
      capGradient.addColorStop(0.18, "#75d26e");
      capGradient.addColorStop(0.45, "#a2ec94");
      capGradient.addColorStop(0.75, "#4dab51");
      capGradient.addColorStop(1, "#1c5a31");
      ctx.fillStyle = capGradient;
      roundedPath(ctx, x - 7, capY, w + 14, capHeight, Math.min(7, w * 0.09));
      ctx.fill();
      ctx.strokeStyle = "rgba(18, 73, 38, 0.8)";
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#f2ffe8";
      roundedPath(ctx, x - 2, capY + capHeight * 0.18, Math.max(3, w * 0.06), capHeight * 0.62, 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawGround(palette) {
      const ctx = this.ctx;
      const y = this.groundY;
      const h = this.groundHeight;
      const scroll = this.distance;
      const soil = ctx.createLinearGradient(0, y, 0, this.h + 34);
      soil.addColorStop(0, palette.soilTop);
      soil.addColorStop(1, palette.soilBottom);
      ctx.fillStyle = soil;
      ctx.fillRect(-24, y, this.w + 48, h + 46);

      ctx.save();
      ctx.beginPath();
      ctx.rect(-24, y + 13, this.w + 48, h + 40);
      ctx.clip();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 11;
      const step = 66;
      for (let x = -this.h - step; x < this.w + this.h + step; x += step) {
        const shift = (scroll * 0.55) % step;
        ctx.beginPath();
        ctx.moveTo(x - shift, y + 12);
        ctx.lineTo(x - shift + 34, this.h + 40);
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = palette.grass;
      ctx.fillRect(-24, y, this.w + 48, 14);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(-24, y + 1, this.w + 48, 3);
      ctx.fillStyle = "rgba(20, 72, 36, 0.35)";
      ctx.fillRect(-24, y + 13, this.w + 48, 3);

      const bladeStep = 32;
      const offset = scroll % bladeStep;
      ctx.fillStyle = palette.grass;
      for (let x = -bladeStep; x < this.w + bladeStep; x += bladeStep) {
        const bx = x - offset;
        ctx.beginPath();
        ctx.moveTo(bx, y + 1);
        ctx.lineTo(bx + 5, y - 5);
        ctx.lineTo(bx + 10, y + 1);
        ctx.closePath();
        ctx.fill();
      }
    }

    drawBird(bird, x, y, rotation) {
      const ctx = this.ctx;
      const r = bird.r;
      const wingAngle = Math.sin(bird.wingPhase) * (0.42 + bird.flapAnim * 0.75) - 0.12;
      const scarfWave = Math.sin(this.time * 9 + bird.wingPhase * 0.35);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      ctx.strokeStyle = "#d9443c";
      ctx.lineWidth = r * 0.26;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.28);
      ctx.quadraticCurveTo(-r * 1.25, -r * 0.15 + scarfWave * r * 0.25, -r * 2.15, -r * 0.45 + scarfWave * r * 0.4);
      ctx.stroke();
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, r * 0.02);
      ctx.quadraticCurveTo(-r * 1.35, r * 0.28, -r * 2.35, r * 0.18 + scarfWave * r * 0.3);
      ctx.stroke();

      ctx.fillStyle = "#f1a51c";
      ctx.strokeStyle = "#5c3a0e";
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, r * 0.05);
      ctx.lineTo(-r * 1.45, -r * 0.42);
      ctx.lineTo(-r * 1.34, r * 0.24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const body = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.12, 0, 0, r * 1.04);
      body.addColorStop(0, "#fff3ad");
      body.addColorStop(0.42, "#ffd447");
      body.addColorStop(1, "#efb11d");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#5c3a0e";
      ctx.lineWidth = r * 0.105;
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 246, 196, 0.75)";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.32, r * 0.58, r * 0.4, 0, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(-r * 0.17, r * 0.08);
      ctx.rotate(wingAngle);
      ctx.fillStyle = "#f3a71c";
      ctx.strokeStyle = "#5c3a0e";
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      ctx.ellipse(-r * 0.12, 0, r * 0.56, r * 0.35, 0.06, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#a96c08";
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.arc(-r * 0.12, r * 0.02, r * 0.35, -0.3, 1.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.fillStyle = "#fffdf7";
      ctx.strokeStyle = "#5c3a0e";
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.arc(r * 0.32, -r * 0.31, r * 0.33, 0, TAU);
      ctx.fill();
      ctx.stroke();

      if (bird.dead) {
        ctx.strokeStyle = "#3c2c19";
        ctx.lineWidth = r * 0.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(r * 0.19, -r * 0.46);
        ctx.lineTo(r * 0.45, -r * 0.18);
        ctx.moveTo(r * 0.45, -r * 0.46);
        ctx.lineTo(r * 0.19, -r * 0.18);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#233b55";
        ctx.beginPath();
        ctx.arc(r * 0.39, -r * 0.29, r * 0.135, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(r * 0.43, -r * 0.34, r * 0.045, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(239, 91, 76, 0.28)";
      ctx.beginPath();
      ctx.arc(r * 0.22, r * 0.2, r * 0.11, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "#ff9a2f";
      ctx.strokeStyle = "#5c3a0e";
      ctx.lineWidth = r * 0.085;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(r * 0.55, -r * 0.17);
      ctx.lineTo(r * 1.42, -r * 0.03);
      ctx.lineTo(r * 0.55, r * 0.19);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(150, 66, 0, 0.55)";
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(r * 0.65, r * 0.03);
      ctx.lineTo(r * 1.25, r * 0.0);
      ctx.stroke();

      ctx.restore();
    }

    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.particles) {
        const alpha = clamp(p.life / p.maxLife, 0, 1) * p.alpha;
        if (alpha <= 0) continue;
        if (p.type === "feather") {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        } else if (p.type === "spark") {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.globalAlpha = alpha * 0.7;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    exposeDebug() {
      const game = this;
      window.__flappyDebug = {
        game,
        start: () => game.startGame(),
        flap: () => game.flap(),
        pause: () => game.pause(),
        menu: () => game.goMenu(),
        finish: (score = game.score) => {
          game.score = score;
          game.ui.score.textContent = String(score);
          game.bird.dead = true;
          game.finishRun();
        },
        setScore: (score) => {
          game.score = score;
          game.ui.score.textContent = String(score);
        },
        setTilt: (value) => {
          game.debugTilt = value;
        },
        snapshot: () => ({
          state: game.state,
          score: game.score,
          best: game.best,
          bird: { x: game.bird.x, y: game.bird.y, vy: game.bird.vy, r: game.bird.r, dead: game.bird.dead },
          pipes: game.pipes.map((pipe) => ({ x: pipe.x, gapY: pipe.gapY, gapH: pipe.gapH, scored: pipe.scored })),
          tiltActive: game.tilt.active,
          size: { w: game.w, h: game.h, dpr: game.dpr }
        })
      };
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    new FlappyDrift();
  });
})();
