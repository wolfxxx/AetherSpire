// Aether Spire — shared utilities (no DOM access; safe in headless tests)
var AS = (typeof window !== 'undefined' ? window : globalThis).AS = (typeof window !== 'undefined' ? window : globalThis).AS || {};

(function (AS) {
  'use strict';
  const U = {};
  U.TILE = 64;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
  U.easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  U.easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  U.easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  U.fmt = n => {
    n = Math.round(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  };
  U.fmtTime = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // Seeded RNG (mulberry32)
  U.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const r = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.chance = p => r() < p;
    return r;
  };
  U.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  // Non-deterministic helpers for visuals only
  U.rand = (lo, hi) => lo + Math.random() * (hi - lo);
  U.randi = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));

  // Colour helpers
  U.hexToRgb = function (hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgba = function (hex, a) { const c = U.hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  U.mix = function (h1, h2, t) {
    const a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  };
  U.shade = function (hex, amt) { return amt >= 0 ? U.mix(hex, '#ffffff', amt) : U.mix(hex, '#000000', -amt); };

  // Simple value noise for terrain texture
  U.makeNoise = function (seed) {
    const r = U.rng(seed);
    const perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const grad = (h, x, y) => { const g = h & 3; return (g & 1 ? -x : x) + (g & 2 ? -y : y); };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    function noise(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const A = perm[X] + Y, B = perm[X + 1] + Y;
      return U.lerp(U.lerp(grad(perm[A], x, y), grad(perm[B], x - 1, y), u),
        U.lerp(grad(perm[A + 1], x, y - 1), grad(perm[B + 1], x - 1, y - 1), u), v);
    }
    noise.fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); a *= 0.5; f *= 2; } return s; };
    return noise;
  };

  // Tiny event bus
  U.Emitter = function () {
    const h = {};
    return {
      on(ev, fn) { (h[ev] = h[ev] || []).push(fn); },
      off(ev, fn) { if (h[ev]) h[ev] = h[ev].filter(f => f !== fn); },
      emit(ev, ...args) { const l = h[ev]; if (l) for (let i = 0; i < l.length; i++) l[i](...args); },
    };
  };

  U.todayKey = function () { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };

  AS.U = U;
})(AS);
