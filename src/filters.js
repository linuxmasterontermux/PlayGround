/**
 * One Euro filter — low latency, low jitter smoothing for real-time tracking.
 * https://gery.casiez.net/1euro/
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.6, beta = 0.45, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.lastTime = null;
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.lastTime = null;
  }

  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, time) {
    if (this.x === null || this.lastTime === null) {
      this.x = value;
      this.dx = 0;
      this.lastTime = time;
      return value;
    }

    const dt = Math.max(1e-4, Math.min(0.25, time - this.lastTime));
    this.lastTime = time;

    const rawDx = (value - this.x) / dt;
    const dxAlpha = this.alpha(this.dCutoff, dt);
    this.dx += dxAlpha * (rawDx - this.dx);

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const alpha = this.alpha(cutoff, dt);
    this.x += alpha * (value - this.x);
    return this.x;
  }
}

export class Vec3Filter {
  constructor(options) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
    this.z = new OneEuroFilter(options);
    this.out = { x: 0, y: 0, z: 0 };
  }

  reset() {
    this.x.reset();
    this.y.reset();
    this.z.reset();
  }

  filter(v, time) {
    this.out.x = this.x.filter(v.x, time);
    this.out.y = this.y.filter(v.y, time);
    this.out.z = this.z.filter(v.z, time);
    return this.out;
  }
}

export class LandmarkFilter {
  constructor(count, options) {
    this.filters = Array.from({ length: count }, () => new Vec3Filter(options));
    this.out = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 }));
  }

  reset() {
    for (const f of this.filters) f.reset();
  }

  filter(points, time) {
    for (let i = 0; i < this.filters.length; i++) {
      const p = points[i];
      if (!p) {
        this.out[i].x = 0;
        this.out[i].y = 0;
        this.out[i].z = 0;
        this.filters[i].reset();
        continue;
      }
      const v = this.filters[i].filter(p, time);
      this.out[i].x = v.x;
      this.out[i].y = v.y;
      this.out[i].z = v.z;
    }
    return this.out;
  }
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function vecDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
