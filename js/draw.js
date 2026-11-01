// Aether Spire — world view: camera, entity drawing, particles, lighting, juice
(function (AS) {
  'use strict';
  const U = AS.U, D = AS.D, R = AS.R, T = U.TILE;
  const W = D.COLS * T, H = D.ROWS * T;
  const TAU = Math.PI * 2;
  const UNDER = { flare: 1, ring: 1, smoke: 1, target: 1, beamUp: 1, glow: 1 };
  const DMG_COL = { phys: '#fff4c2', fire: '#ffae5a', frost: '#a8f0ff', storm: '#d2c2ff', nature: '#9dffaf', arcane: '#ffa8ee', true: '#ffffff' };

  // ============================================================ shape helpers
  function poly(g, x, y, r, n, rot) { g.beginPath(); for (let k = 0; k < n; k++) { const a = rot + k / n * TAU; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
  function diamond(g, x, y, w, h) { g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w, y); g.lineTo(x, y + h * 0.45); g.lineTo(x - w, y); g.closePath(); }
  function glowAt(g, color, x, y, r, a) { if (a <= 0) return; const s = R.glow(color, 64); g.globalAlpha = a; g.drawImage(s, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }
  function jag(g, pts, amp, seed) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const segs = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 18));
      const nx = -(y1 - y0), ny = x1 - x0; const nl = Math.hypot(nx, ny) || 1;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs; const off = s === segs ? 0 : (Math.sin(seed * 13.1 + i * 7 + s * 3.7) + Math.random() - 0.5) * amp;
        g.lineTo(x0 + (x1 - x0) * t + nx / nl * off, y0 + (y1 - y0) * t + ny / nl * off);
      }
    }
  }

  // ============================================================ TOWERS
  const Draw = {};
  for (const k in D.SKINS) D.SKINS[k].id = k;
  Draw.tower = function (g, t, time, skin, opts) {
    opts = opts || {};
    const def = t.def, col = def.color, lvl = t.level || 0;
    const x = t.x, y = t.y;
    const breathe = 1 + Math.sin(time * 2.1 + (t.uid || 0)) * 0.025;
    const pop = t.upAnim ? 1 + U.easeOutBack(1 - t.upAnim) * 0 + Math.sin((1 - t.upAnim) * Math.PI) * 0.25 : 1;
    const born = opts.icon ? 1 : U.clamp((time - (t.bornReal || 0)) * 3, 0, 1);
    const sc = breathe * pop * U.easeOutBack(born);
    const disabled = (t.disabledT > 0 || t.burnoutT > 0) && !opts.icon;
    const spr = !opts.noSprite && R.Art && R.Art.tower(def.id, lvl, t.branch, skin);
    if (spr) Draw.towerSprite(g, t, spr, x, y, lvl, sc, time, col, disabled, opts);
    else {
    const K = 1.22 + lvl * 0.07; // towers physically grow as they evolve
    g.save();
    g.translate(x, y);
    g.scale(K, K);
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.beginPath(); g.ellipse(3, 14, 29, 11, 0, 0, TAU); g.fill();
    Draw.base(g, t, time, skin, col, disabled, opts);
    g.scale(sc, sc);
    const fn = Draw['t_' + def.id]; if (fn) fn(g, t, time, col, lvl, skin, disabled);
    if (lvl >= 3 && t.branch >= 0) Draw.crown(g, t, time, col, lvl, disabled);
    if (skin.id === 'celestial') { g.strokeStyle = U.rgba('#ffcf5a', 0.85); g.lineWidth = 2; g.beginPath(); g.ellipse(0, -62 - lvl * 3, 13, 4, 0, 0, TAU); g.stroke(); g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ffcf5a', 0, -62 - lvl * 3, 16, 0.4); g.restore(); }
    g.restore();
    }
    if (!opts.icon) {
      // status overlays
      if (t.overclockT > 0) { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff8a3a', x, y - 16, 46 + Math.sin(time * 20) * 4, 0.5); g.restore(); }
      if (t.forgedT > 0) { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff7a2a', x, y + 4, 36, 0.35); g.restore(); }
      if (t.focusT > 0) { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#fff3b0', x, y - 20, 40, 0.45); g.restore(); }
      if (disabled) {
        g.save(); g.globalAlpha = 0.55; g.fillStyle = t.burnoutT > 0 ? '#3a1a10' : '#2a2440'; g.beginPath(); g.arc(x, y - 6, 26, 0, TAU); g.fill(); g.restore();
        g.strokeStyle = t.burnoutT > 0 ? '#ff9a4a' : '#c9a8ff'; g.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const a = Math.random() * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * 8, y - 10 + Math.sin(a) * 8); g.lineTo(x + Math.cos(a) * 22, y - 10 + Math.sin(a) * 18); g.stroke(); }
      }
      if (t.strain > 0) for (let k = 0; k < t.strain; k++) { g.fillStyle = '#ff5d5d'; g.fillRect(x - 10 + k * 8, y - 62, 5, 5); }
    }
  };

  // painted tower sprite: grows with tier, breathes, and keeps a living element glow
  Draw.towerSprite = function (g, t, img, x, y, lvl, sc, time, col, disabled, opts) {
    let w = opts.icon ? 66 : [70, 75, 82, 86, 94][lvl] || 82, h = w * img.height / img.width;
    const maxH = opts.icon ? 96 : [84, 88, 96, 102, 110][lvl] || 100;
    if (h > maxH) { w *= maxH / h; h = maxH; }
    const fk = opts.icon ? 0 : (t.fireK || 0);
    g.save(); g.translate(x, y + 22);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(3, -5, w * 0.42, w * 0.15, 0, 0, TAU); g.fill();
    if (!opts.icon) { // element-coded base ring: identity at a glance
      g.strokeStyle = U.rgba(col, disabled ? 0.2 : 0.75); g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -6, w * 0.47, w * 0.17, 0, 0, TAU); g.stroke();
      g.fillStyle = U.rgba(col, 0.1); g.fill();
      if (lvl >= 4) { g.save(); g.strokeStyle = U.rgba('#ffd96a', 0.85); g.lineWidth = 2; g.setLineDash([6, 6]); g.lineDashOffset = -time * 20; g.beginPath(); g.ellipse(0, -6, w * 0.58, w * 0.22, 0, 0, TAU); g.stroke(); g.restore(); }
    }
    if (t.onLey && !opts.icon) { g.strokeStyle = U.rgba('#ffffff', 0.35 + Math.sin(time * 4) * 0.2); g.setLineDash([4, 5]); g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, -6, w * 0.5, w * 0.19, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
    g.scale(sc * (1 + fk * 0.05), sc * (1 - fk * 0.07)); // recoil squash when firing
    if (disabled) g.globalAlpha = 0.6;
    g.drawImage(img, -w / 2, -h, w, h);
    g.globalAlpha = 1;
    if (!opts.icon) {
      g.globalCompositeOperation = 'lighter';
      glowAt(g, col, 0, -h * 0.74, 16 + lvl * 4, disabled ? 0.04 : 0.2 + Math.sin(time * 2.6 + (t.uid || 0)) * 0.08 + fk * 0.5);
      if (!t.def.support && !disabled) { // focus gem that tracks the current target
        const a = t.angle != null ? t.angle : -Math.PI / 2, gx = Math.cos(a) * w * 0.34, gy = -h * 0.7 + Math.sin(a) * w * 0.14;
        glowAt(g, col, gx, gy, 9 + fk * 6, 0.85);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = '#ffffff'; g.save(); g.translate(gx, gy); g.rotate(a + Math.PI / 2); g.beginPath(); g.moveTo(0, -5); g.lineTo(3, 0); g.lineTo(0, 4); g.lineTo(-3, 0); g.closePath(); g.fill(); g.restore();
      }
      if (lvl >= 4 && Math.random() < 0.04) { const vw = AS.View && AS.View.current; if (vw) vw.p({ x: x + U.rand(-w * 0.4, w * 0.4), y: y + 22 - U.rand(0, h), vx: 0, vy: -30, life: 0.9, size: 2.5, color: '#ffd96a', kind: 'glow', add: true }); }
    }
    g.restore();
    if (!opts.icon) for (let k = 0; k <= lvl; k++) { g.fillStyle = k >= 3 ? '#ffd96a' : '#c9d4ff'; g.beginPath(); g.arc(x - lvl * 4 + k * 8, y + 29, k >= 3 ? 3 : 2.3, 0, TAU); g.fill(); }
  };
  // painted enemy sprite: faces its heading, squashes as it walks / flaps as it flies
  Draw.enemySprite = function (g, e, img, x, y, r, dir, time, fl, anim) {
    const boss = e.def.boss;
    let animated = false;
    if (R.Art) { // painted animation frames: walk/fly cycles for enemies, phase poses for bosses
      if (boss) { const k = (e.pulseWarn > 0 || e.cataWarn) ? 3 : Math.min(2, (e.phase || 1) - 1); const p = R.Art.get('enemy_' + e.type + '_p' + k); if (p) { img = p; animated = true; } }
      else { const fps = e.flying ? 9 : 3 + (e.speed || 1) * 3.2; const moving = !(e.freezeT > 0 || e.stunT > 0 || e.rootT > 0 || e.blocker); const k = moving ? Math.floor(anim * fps) % 4 : 0; const f = R.Art.get('enemy_' + e.type + '_f' + k); if (f) { img = f; animated = true; } }
    }
    if (boss) Draw.bossAura(g, e, x, y, r, time);
    const size = r * (boss ? (e.type === 'magmaw' ? 3.0 : 4.2) : 2.85);
    const ar = img.width / img.height; const w = ar >= 1 ? size : size * ar, h = ar >= 1 ? size / ar : size;
    g.save(); g.translate(x, y);
    g.rotate(e.type === 'nullwarden' ? Math.sin(time * 0.6) * 0.12 : dir);
    const moving = !(e.freezeT > 0 || e.stunT > 0 || e.rootT > 0 || e.blocker);
    if (!boss && moving) {
      const ph = anim * (e.flying ? 10 : 6 + (e.speed || 1) * 5);
      if (e.flying) { g.scale(1, 0.78 + 0.34 * Math.abs(Math.sin(ph))); } // wing-beat: span opens and closes
      else { g.translate(0, Math.sin(ph) * size * 0.06); g.rotate(Math.sin(ph) * 0.12); const sq = 1 + Math.abs(Math.cos(ph)) * 0.07; g.scale(sq, 2 - sq); } // stride: waddle, bob, squash
    } else if (!animated && !boss) { const sq = 1 + Math.sin(anim * 3) * 0.02; g.scale(sq, 2 - sq); }
    if (fl > 0.6 && !boss) g.translate(-Math.cos(0) * 3 * fl, 0); // hit recoil
    g.drawImage(img, -w / 2, -h / 2, w, h);
    if (e.chillT > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22; g.fillStyle = '#7fe3ff'; g.beginPath(); g.arc(0, 0, size * 0.4, 0, TAU); g.fill(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    if (fl > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = fl * (boss ? 0.12 : 0.4); g.drawImage(img, -w / 2, -h / 2, w, h); }
    g.restore();
    if (e.type === 'magmaw') { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff7a2a', x, y, r * (0.5 + 0.2 * (e.phase || 1)), 0.18 * (e.phase || 1)); g.restore(); if (e.cataWarn) { g.strokeStyle = U.rgba('#ff7a2a', 0.5 + Math.sin(time * 20) * 0.3); g.lineWidth = 4; g.beginPath(); g.arc(x, y, r * 1.5, 0, TAU); g.stroke(); } }
    if (e.type === 'nullwarden' && e.pulseWarn > 0) {
      const k = 1 - e.pulseWarn / 1.3;
      g.strokeStyle = U.rgba('#c9a8ff', 0.3 + k * 0.6); g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.arc(x, y, 2.6 * T * k / ES, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    if (boss) { g.strokeStyle = U.rgba('#ffffff', 0.22 + fl * 0.35); g.lineWidth = 2; g.beginPath(); g.arc(x, y, size * 0.52, 0, TAU); g.stroke(); }
  };
  const BASE_SIDES = { prism: [6, Math.PI / 6], mortar: [8, Math.PI / 8], frost: [4, 0], storm: [8, 0], grove: [0, 0], conduit: [3, -Math.PI / 2], void: [0, 0] };
  Draw.base = function (g, t, time, skin, col, disabled, opts) {
    const def = t.def, lvl = t.level || 0;
    const base = U.mix(skin.base, col, 0.14), trim = skin.trim;
    const [n, rot] = BASE_SIDES[def.id] || [6, 0];
    const R0 = n === 3 ? 31 : n === 4 ? 30 : 26;
    const shape = (yy, r) => { if (n) poly(g, 0, yy, r, n, rot); else { g.beginPath(); g.ellipse(0, yy, r, r * 0.8, 0, 0, TAU); } };
    // plinth (side) + top
    g.fillStyle = U.shade(base, -0.55); shape(7, R0 + 1); g.fill();
    const pg = g.createLinearGradient(0, -20, 0, 22); pg.addColorStop(0, U.shade(base, 0.3)); pg.addColorStop(1, U.shade(base, -0.35));
    g.fillStyle = pg; shape(2, R0); g.fill();
    g.strokeStyle = U.rgba(trim, 0.75); g.lineWidth = 1.5; shape(2, R0); g.stroke();
    g.strokeStyle = U.rgba(col, 0.35); g.lineWidth = 1; shape(2, R0 - 6); g.stroke();
    // skin geometry
    if (skin.id === 'obsidian') { g.fillStyle = '#120c0e'; for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; const sx = Math.cos(a) * (R0 - 2), sy = 2 + Math.sin(a) * (R0 - 2) * 0.75; g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx, sy - 14); g.lineTo(sx + 4, sy); g.fill(); g.fillStyle = '#ff5a5a'; g.fillRect(sx - 1, sy - 13, 2, 3); g.fillStyle = '#120c0e'; } }
    if (skin.id === 'verdigris') { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; g.fillStyle = k % 2 ? '#3f8a45' : '#7dffd3'; g.beginPath(); g.ellipse(Math.cos(a) * R0 * 0.9, 4 + Math.sin(a) * R0 * 0.7, 5, 2.5, a, 0, TAU); g.fill(); } }
    if (skin.id === 'celestial') { g.strokeStyle = U.rgba('#ffcf5a', 0.6); g.lineWidth = 1; shape(2, R0 + 4); g.stroke(); }
    // rune ring
    const runeA = disabled ? 0.15 : 0.55 + Math.sin(time * 3 + (t.uid || 0)) * 0.25;
    g.strokeStyle = U.rgba(col, runeA); g.lineWidth = 2; g.beginPath(); g.ellipse(0, 2, 17, 12, 0, 0, TAU); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) { const a = time * 0.6 + k / 6 * TAU; g.fillStyle = U.rgba(col, runeA * 0.9); g.fillRect(Math.cos(a) * 17 - 1.5, 2 + Math.sin(a) * 12 - 1.5, 3, 3); }
    g.restore();
    if (t.onLey && !opts.icon) { g.strokeStyle = U.rgba('#ffffff', 0.35 + Math.sin(time * 4) * 0.2); g.setLineDash([4, 5]); g.beginPath(); g.ellipse(0, 4, R0 + 4, 15, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
    // tier pips
    for (let k = 0; k <= lvl; k++) { g.fillStyle = k >= 3 ? '#ffd96a' : U.shade(trim, 0.2); g.beginPath(); g.arc(-(lvl * 4) + k * 8, 24, k >= 3 ? 3 : 2.3, 0, TAU); g.fill(); }
  };
  // Distinct T4/T5 silhouettes per specialization
  Draw.crown = function (g, t, time, col, lvl, dis) {
    const id = t.def.branches[t.branch].id, k = lvl - 2; // 1 or 2
    const c = dis ? '#777' : col;
    g.save();
    switch (id) {
      case 'rail': { // halo of focusing rings + fins
        g.translate(0, -26);
        for (let i = 0; i < k + 1; i++) { g.strokeStyle = U.rgba('#fff3b0', 0.7); g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, 22 + i * 7, 7 + i * 2, time * 0.5 + i, 0, TAU); g.stroke(); }
        g.fillStyle = U.shade(c, -0.2); for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(sgn * 8, 10); g.lineTo(sgn * 24, 20); g.lineTo(sgn * 10, 22); g.fill(); }
        break;
      }
      case 'volley': { // spinning prism wheel
        g.translate(0, -30);
        for (let i = 0; i < 6 + k * 2; i++) { const a = time * 2 + i / (6 + k * 2) * TAU; g.fillStyle = i % 2 ? '#fff3b0' : c; diamond(g, Math.cos(a) * 26, Math.sin(a) * 9, 3, 7); g.fill(); }
        break;
      }
      case 'howitzer': { // magma cauldron & drips
        g.fillStyle = '#2a1a16'; g.beginPath(); g.ellipse(0, -2, 24, 9, 0, 0, TAU); g.fill();
        g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff5a1f', 0, -3, 26, 0.6 + Math.sin(time * 5) * 0.2); g.restore();
        g.fillStyle = '#ffb36b'; for (let i = 0; i < 3; i++) { const yy = ((time * 30 + i * 9) % 18); g.beginPath(); g.arc(-14 + i * 14, 4 + yy, 2, 0, TAU); g.fill(); }
        break;
      }
      case 'cluster': { // ammo racks
        for (const sgn of [-1, 1]) { g.fillStyle = '#4a3a36'; g.fillRect(sgn * 24 - 5, -18, 10, 22); g.fillStyle = c; for (let i = 0; i < 3; i++) g.fillRect(sgn * 24 - 3, -16 + i * 7, 6, 4); }
        break;
      }
      case 'glacial': { // ring of tall ice spikes
        for (let i = 0; i < 5 + k; i++) { const a = i / (5 + k) * TAU; const sx = Math.cos(a) * 24, sy = 6 + Math.sin(a) * 12; g.fillStyle = U.rgba('#d8f8ff', 0.9); g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx, sy - 18 - k * 4); g.lineTo(sx + 4, sy); g.fill(); }
        break;
      }
      case 'rime': { // shattered floating plates
        g.translate(0, -30);
        for (let i = 0; i < 4 + k * 2; i++) { const a = -time * 0.9 + i / (4 + k * 2) * TAU; g.save(); g.translate(Math.cos(a) * 30, Math.sin(a) * 10); g.rotate(a); g.fillStyle = U.rgba('#bff8ff', 0.85); g.beginPath(); g.moveTo(-6, -3); g.lineTo(6, -5); g.lineTo(3, 5); g.lineTo(-5, 3); g.fill(); g.restore(); }
        break;
      }
      case 'tempest': { // personal storm cloud
        const cy = -78 - k * 6;
        g.fillStyle = 'rgba(70,60,110,0.9)';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-15 + i * 10, cy + (i % 2) * 4, 10 + (i % 2) * 3, 0, TAU); g.fill(); }
        if (!dis && Math.random() < 0.25) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(230,220,255,0.9)'; g.lineWidth = 2; jag(g, [[U.rand(-10, 10), cy + 8], [0, -40]], 6, time); g.stroke(); g.restore(); }
        break;
      }
      case 'ion': { // focusing lens rings in aim direction
        const ang = t.angle || 0; g.translate(0, -50); g.rotate(ang);
        for (let i = 0; i < 2 + k; i++) { g.strokeStyle = U.rgba(c, 0.8 - i * 0.15); g.lineWidth = 2; g.beginPath(); g.ellipse(16 + i * 8, 0, 3, 9 - i, 0, 0, TAU); g.stroke(); }
        break;
      }
      case 'treant': { // gnarled roots
        g.strokeStyle = '#4a2e1a'; g.lineWidth = 4;
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.5; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * 18, 4 + Math.sin(a) * 8, Math.cos(a) * 30, 8 + Math.sin(a) * 12); g.stroke(); }
        break;
      }
      case 'thornbloom': { // thorn vines
        g.strokeStyle = '#2f7a3c'; g.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + time * 0.2; g.beginPath(); g.arc(Math.cos(a) * 20, 4 + Math.sin(a) * 10, 9, a, a + 2.4); g.stroke(); g.fillStyle = '#ff7ae0'; g.beginPath(); g.arc(Math.cos(a) * 26, 4 + Math.sin(a) * 13, 2, 0, TAU); g.fill(); }
        break;
      }
      case 'ley': { // orbiting pylons
        for (let i = 0; i < 3 + k; i++) { const a = time * 0.8 + i / (3 + k) * TAU; const px = Math.cos(a) * 28, py = -10 + Math.sin(a) * 10; g.fillStyle = U.shade(c, 0.2); diamond(g, px, py, 4, 10); g.fill(); g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, px, py - 4, 10, 0.6); g.restore(); }
        break;
      }
      case 'siphon': { // gold vortex
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) { const a = -time * 3 + i * 0.63; const r = 8 + ((i * 7 + time * 20) % 26); glowAt(g, '#ffd96a', Math.cos(a) * r, -26 + Math.sin(a) * r * 0.4, 5, 0.6); }
        g.restore();
        break;
      }
      case 'horizon': { // accretion disk
        g.translate(0, -30);
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { g.strokeStyle = U.rgba(i ? '#ff7ae0' : '#ffb36b', 0.6); g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 30 + i * 6 + k * 4, 8 + i * 2, -0.3, time * 2 + i, time * 2 + i + 4); g.stroke(); }
        g.restore();
        break;
      }
      case 'dilation': { // clock dial
        g.translate(0, -30);
        g.strokeStyle = U.rgba('#e6dcff', 0.8); g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, 30 + k * 4, 11, 0, 0, TAU); g.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillRect(Math.cos(a) * (30 + k * 4) - 1, Math.sin(a) * 11 - 1, 2, 2); }
        const h = time * 0.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(h) * 22, Math.sin(h) * 8); g.stroke();
        break;
      }
    }
    g.restore();
  };
  Draw.t_prism = function (g, t, time, col, lvl, skin, dis) {
    const bob = Math.sin(time * 2.5 + (t.uid || 0)) * 3;
    const ang = t.angle != null ? t.angle : -Math.PI / 2;
    const c = dis ? '#777' : col;
    // pylon
    g.fillStyle = U.shade(skin.base, 0.1); g.beginPath(); g.moveTo(-9, 0); g.lineTo(-5, -18); g.lineTo(5, -18); g.lineTo(9, 0); g.closePath(); g.fill();
    if (t.branch === 0 && lvl >= 3) { // rail: long crystal barrel aimed
      g.save(); g.translate(0, -26 + bob * 0.4); g.rotate(ang);
      const L = lvl === 4 ? 40 : 32;
      const bg = g.createLinearGradient(0, -6, 0, 6); bg.addColorStop(0, U.shade(c, 0.6)); bg.addColorStop(1, U.shade(c, -0.3));
      g.fillStyle = bg; g.beginPath(); g.moveTo(-10, -7); g.lineTo(L, -2.5); g.lineTo(L, 2.5); g.lineTo(-10, 7); g.closePath(); g.fill();
      g.fillStyle = U.shade(skin.trim, 0.2); g.fillRect(-4, -9, 6, 18); if (lvl === 4) g.fillRect(14, -6, 4, 12);
      g.globalCompositeOperation = 'lighter'; glowAt(g, c, L, 0, 14, 0.8); g.restore();
      return;
    }
    const n = t.branch === 1 && lvl >= 3 ? (lvl === 4 ? 5 : 3) : 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * 0.45;
      g.save(); g.translate(0, -30 + bob); g.rotate(ang + Math.PI / 2 + off);
      const s = n === 1 ? 1 + lvl * 0.12 : 0.62;
      const dg = g.createLinearGradient(-8 * s, -20 * s, 8 * s, 10 * s); dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.4, c); dg.addColorStop(1, U.shade(c, -0.45));
      g.fillStyle = dg; diamond(g, 0, n === 1 ? 0 : -10, 9 * s, 22 * s); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, (n === 1 ? 0 : -10) - 22 * s); g.lineTo(0, (n === 1 ? 0 : -10) + 9 * s); g.stroke();
      g.restore();
    }
    // orbiting shards per tier
    for (let k = 0; k < lvl; k++) { const a = time * 1.8 + k / Math.max(1, lvl) * TAU; g.fillStyle = U.shade(c, 0.3); diamond(g, Math.cos(a) * 18, -28 + Math.sin(a) * 6 + bob, 3, 6); g.fill(); }
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, 0, -30 + bob, 22 + lvl * 3, dis ? 0.1 : 0.55); g.restore();
  };
  Draw.t_mortar = function (g, t, time, col, lvl, skin, dis) {
    const ang = t.angle != null ? t.angle : -Math.PI / 2;
    const c = dis ? '#777' : col;
    const big = t.branch === 0 && lvl >= 3, cl = t.branch === 1 && lvl >= 3;
    g.fillStyle = U.shade(skin.base, -0.1); g.beginPath(); g.ellipse(0, -6, 18 + lvl, 13, 0, 0, TAU); g.fill();
    g.fillStyle = U.shade(skin.trim, -0.3); g.fillRect(-16, -10, 32, 6);
    g.save(); g.translate(0, -12); g.rotate(ang);
    const tubes = cl ? (lvl === 4 ? 4 : 3) : 1;
    for (let k = 0; k < tubes; k++) {
      const oy = tubes === 1 ? 0 : (k - (tubes - 1) / 2) * 8;
      const len = big ? 26 + (lvl - 3) * 6 : cl ? 18 : 18 + lvl * 2;
      const wd = big ? 13 + (lvl - 3) * 2 : cl ? 6 : 9 + lvl;
      const bg = g.createLinearGradient(0, oy - wd, 0, oy + wd); bg.addColorStop(0, '#5a4a48'); bg.addColorStop(0.5, '#8a7470'); bg.addColorStop(1, '#3a2c2a');
      g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(-6, oy - wd, len + 6, wd * 2, 4) : g.rect(-6, oy - wd, len + 6, wd * 2); g.fill();
      g.fillStyle = '#1a0e0a'; g.beginPath(); g.ellipse(len, oy, 3, wd * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = U.rgba(c, 0.9); g.fillRect(len - 8, oy - wd, 3, wd * 2);
    }
    g.restore();
    // molten core
    const pulse = 0.6 + Math.sin(time * 4 + (t.uid || 0)) * 0.3;
    g.fillStyle = U.shade(c, 0.2); g.beginPath(); g.arc(0, -12, 6 + lvl, 0, TAU); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, 0, -12, 20 + lvl * 4, dis ? 0.1 : pulse * 0.7); g.restore();
  };
  Draw.t_frost = function (g, t, time, col, lvl, skin, dis) {
    const c = dis ? '#777' : col;
    const bob = Math.sin(time * 1.7 + (t.uid || 0)) * 2.5;
    const h = 30 + lvl * 4, w = 10 + lvl;
    const gl = t.branch === 0 && lvl >= 3, rime = t.branch === 1 && lvl >= 3;
    const og = g.createLinearGradient(-w, -h, w, 0); og.addColorStop(0, '#ffffff'); og.addColorStop(0.45, c); og.addColorStop(1, U.shade(c, -0.5));
    g.fillStyle = og;
    g.beginPath(); g.moveTo(0, -h - 8 + bob); g.lineTo(w, -h * 0.55 + bob); g.lineTo(w * 0.7, -2); g.lineTo(-w * 0.7, -2); g.lineTo(-w, -h * 0.55 + bob); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -h - 8 + bob); g.lineTo(0, -2); g.stroke();
    const n = 2 + lvl + (rime ? 3 : 0);
    for (let k = 0; k < n; k++) {
      const a = time * (gl ? 1.2 : 0.8) * (k % 2 ? 1 : -1) + k / n * TAU;
      const rr = (rime ? 22 : 18) + (k % 2) * 4;
      g.fillStyle = U.rgba(U.shade(c, 0.4), 0.9);
      g.save(); g.translate(Math.cos(a) * rr, -h * 0.5 + Math.sin(a) * rr * 0.4 + bob); g.rotate(a);
      if (rime) { g.beginPath(); g.moveTo(0, -7); g.lineTo(3, 0); g.lineTo(0, 7); g.lineTo(-3, 0); g.closePath(); g.fill(); } else { diamond(g, 0, 0, 3, 6); g.fill(); }
      g.restore();
    }
    if (gl) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -h * 0.55 + bob, 5 + (lvl - 3) * 2, 0, TAU); g.fill(); }
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, 0, -h * 0.5 + bob, 26 + lvl * 4, dis ? 0.1 : 0.5); g.restore();
  };
  Draw.t_storm = function (g, t, time, col, lvl, skin, dis) {
    const c = dis ? '#777' : col;
    const ion = t.branch === 1 && lvl >= 3, temp = t.branch === 0 && lvl >= 3;
    const rings = 2 + Math.min(lvl, 2) + (temp ? 2 : 0);
    g.fillStyle = U.shade(skin.base, 0.05); g.fillRect(-4, -14 - rings * 7, 8, rings * 7 + 12);
    for (let k = 0; k < rings; k++) {
      const yy = -8 - k * 7, rw = 15 - k * 1.2;
      g.strokeStyle = k % 2 ? U.shade(skin.trim, -0.1) : '#c9a86a'; g.lineWidth = 3.5;
      g.beginPath(); g.ellipse(0, yy, rw, rw * 0.35, 0, 0, TAU); g.stroke();
    }
    const top = -14 - rings * 7;
    if (ion) {
      const ang = t.angle != null ? t.angle : 0;
      g.save(); g.translate(0, top); g.rotate(ang);
      g.fillStyle = '#4a4070'; g.beginPath(); g.ellipse(4, 0, 6, 14, 0, 0, TAU); g.fill();
      g.fillStyle = c; g.beginPath(); g.ellipse(8, 0, 3, 9, 0, 0, TAU); g.fill();
      g.restore();
    }
    const orbR = 7 + lvl * 1.2 + (Math.sin(time * 9 + (t.uid || 0)) * 1.2);
    const og = g.createRadialGradient(-2, top - 2, 1, 0, top, orbR); og.addColorStop(0, '#ffffff'); og.addColorStop(0.5, c); og.addColorStop(1, U.shade(c, -0.4));
    g.fillStyle = og; g.beginPath(); g.arc(0, top, orbR, 0, TAU); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, 0, top, 26 + lvl * 4, dis ? 0.1 : 0.65);
    if (!dis && Math.random() < 0.3) { g.strokeStyle = 'rgba(230,220,255,0.8)'; g.lineWidth = 1.5; const a = Math.random() * TAU; jag(g, [[0, top], [Math.cos(a) * 18, top + Math.sin(a) * 18]], 5, time); g.stroke(); }
    g.restore();
  };
  Draw.t_grove = function (g, t, time, col, lvl, skin, dis) {
    const c = dis ? '#777' : col;
    const treant = t.branch === 0 && lvl >= 3, bloom = t.branch === 1 && lvl >= 3;
    const sway = Math.sin(time * 1.3 + (t.uid || 0)) * 2;
    g.fillStyle = '#5a3a22'; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-3 + sway * 0.3, -14, -4 + sway, -24); g.lineTo(4 + sway, -24); g.quadraticCurveTo(3, -14, 6, 0); g.closePath(); g.fill();
    const s = 1 + lvl * 0.1 + (treant ? 0.2 : 0);
    const greens = treant ? ['#1d4a24', '#2b6a33', '#3f8a45'] : ['#22592c', '#2f7a3c', '#45a052'];
    for (let k = 0; k < 3; k++) { g.fillStyle = greens[k]; g.beginPath(); g.arc(sway + (k - 1) * 6 * s, -30 - k * 4 * s, (15 - k * 3) * s, 0, TAU); g.fill(); }
    if (bloom) {
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + time * 0.4; g.fillStyle = '#ff7ae0'; g.beginPath(); g.ellipse(sway + Math.cos(a) * 9, -36 + Math.sin(a) * 9, 6, 3.5, a, 0, TAU); g.fill(); }
      g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(sway, -36, 4, 0, TAU); g.fill();
    }
    for (let k = 0; k < 2 + lvl; k++) { const a = time * 1.1 + k * 2.1; g.fillStyle = U.rgba(c, 0.9); g.beginPath(); g.arc(sway + Math.cos(a) * 12 * s, -32 + Math.sin(a * 1.3) * 8 * s, 2, 0, TAU); g.fill(); }
    if (treant) { g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(sway - 4, -30, 2, 0, TAU); g.arc(sway + 4, -30, 2, 0, TAU); g.fill(); }
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, sway, -32, 22 + lvl * 3, dis ? 0.05 : 0.3); g.restore();
  };
  Draw.t_conduit = function (g, t, time, col, lvl, skin, dis) {
    const c = dis ? '#777' : col;
    const siphon = t.branch === 1 && lvl >= 3;
    const bob = Math.sin(time * 2 + (t.uid || 0)) * 3;
    g.fillStyle = U.shade(skin.base, 0.1); g.beginPath(); g.moveTo(-8, 0); g.lineTo(0, -12); g.lineTo(8, 0); g.closePath(); g.fill();
    const rings = 1 + Math.min(2, lvl) + (lvl >= 3 ? 1 : 0);
    for (let k = 0; k < rings; k++) {
      g.save(); g.translate(0, -28 + bob); g.rotate(time * (0.8 + k * 0.5) * (k % 2 ? -1 : 1));
      g.strokeStyle = U.rgba(k % 2 ? skin.trim : c, 0.85); g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 0, 14 + k * 5, (14 + k * 5) * 0.4, 0, 0, TAU); g.stroke();
      g.restore();
    }
    const gem = g.createLinearGradient(0, -40, 0, -16); gem.addColorStop(0, '#ffffff'); gem.addColorStop(0.5, c); gem.addColorStop(1, U.shade(c, -0.4));
    g.fillStyle = gem; diamond(g, 0, -26 + bob, 7 + lvl * 0.8, 13 + lvl);
    g.fill();
    if (siphon) for (let k = 0; k < 4; k++) { const a = time * 2 + k / 4 * TAU; g.fillStyle = '#ffd96a'; g.beginPath(); g.arc(Math.cos(a) * 20, -26 + bob + Math.sin(a) * 8, 3, 0, TAU); g.fill(); }
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, c, 0, -26 + bob, 28 + lvl * 4, dis ? 0.1 : 0.55); g.restore();
  };
  Draw.t_void = function (g, t, time, col, lvl, skin, dis) {
    const c = dis ? '#777' : col;
    const bob = Math.sin(time * 1.5 + (t.uid || 0)) * 2;
    g.fillStyle = U.shade(skin.base, 0.05); g.beginPath(); g.moveTo(-10, 0); g.lineTo(-4, -16); g.lineTo(4, -16); g.lineTo(10, 0); g.closePath(); g.fill();
    const r = 10 + lvl * 1.3;
    g.save(); g.translate(0, -30 + bob);
    for (let k = 0; k < 2 + (lvl >= 3 ? 1 : 0); k++) {
      g.save(); g.rotate(time * (1 + k * 0.6) + k); g.strokeStyle = U.rgba(k ? '#ff7ae0' : c, 0.85); g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(0, 0, r + 8 + k * 4, (r + 8 + k * 4) * 0.32, 0, 0, TAU); g.stroke(); g.restore();
    }
    g.fillStyle = '#05010a'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(c, 0.9); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'lighter'; glowAt(g, c, 0, 0, r * 2.6, dis ? 0.1 : 0.45);
    g.restore();
  };

  Draw.barricade = function (g, b, time) {
    const x = b.x, y = b.y;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x + 2, y + 12, 26, 9, 0, 0, TAU); g.fill();
    const dmg = 1 - b.hp / b.maxHp;
    for (let k = 0; k < 3; k++) {
      g.save(); g.translate(x + (k - 1) * 14, y + 2); g.rotate((k - 1) * 0.25 + dmg * (k - 1) * 0.3);
      g.fillStyle = k % 2 ? '#8a6a44' : '#a17e52'; g.fillRect(-5, -22, 10, 34);
      g.fillStyle = '#c9b08a'; g.beginPath(); g.moveTo(-5, -22); g.lineTo(0, -30); g.lineTo(5, -22); g.fill();
      g.restore();
    }
    g.fillStyle = '#5a4430'; g.fillRect(x - 24, y - 4, 48, 6); g.fillRect(x - 24, y + 6, 48, 5);
    if (b.hp < b.maxHp) bar(g, x, y - 36, 34, b.hp / b.maxHp, '#c9b08a');
  };

  function bar(g, x, y, w, f, col, sh) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle = col; g.fillRect(x - w / 2, y, w * U.clamp(f, 0, 1), 4);
    if (sh) { g.fillStyle = '#7fe8ff'; g.fillRect(x - w / 2, y - 3, w * U.clamp(sh, 0, 1), 2); }
  }

  // ============================================================ ENEMIES
  Draw.enemy = function (g, e, time, game, opts) {
    opts = opts || {};
    const def = e.def, col = def.color;
    const x = e.x, y = e.y, r = e.r;
    const a = e.anim || 0;
    let alpha = 1;
    if (game && e.type === 'phantom' && !game.isVisible(e)) alpha = 0.18 + Math.sin(time * 6 + e.uid) * 0.06;
    const hop = e.flying ? 0 : Math.abs(Math.sin(a * 7 * (def.speed || 1))) * 2.5;
    const lift = e.flying ? 26 + Math.sin(a * 3) * 4 : 0;
    const dir = Math.atan2(e.vy || 0, e.vx || 1);
    g.save();
    g.globalAlpha = alpha;
    // shadow
    g.fillStyle = `rgba(0,0,0,${e.flying ? 0.22 : 0.35})`; g.beginPath(); g.ellipse(x + 2, y + r * 0.6 + 2, r * (e.flying ? 0.8 : 1), r * 0.4, 0, 0, TAU); g.fill();
    const cy = y - hop - lift;
    const frozen = e.freezeT > 0;
    const fl = opts.icon ? 0 : U.clamp(e.flash, 0, 1);
    const flash = false; // bodies tint toward white briefly instead of turning solid white
    const fill = U.mix(e.chillT > 0 ? U.mix(col, '#9fe8ff', 0.45) : col, '#ffffff', fl * (e.boss ? 0.15 : 0.5));
    const dark = U.shade(fill, -0.45);
    // elite / champion aura
    if (e.elite || e.champion) {
      g.save(); g.globalCompositeOperation = 'lighter';
      glowAt(g, e.champion ? D.AFFIXES[e.champion].color : '#ffd96a', x, cy, r * 2.4, 0.5 + Math.sin(time * 5) * 0.15); g.restore();
      g.strokeStyle = e.champion ? D.AFFIXES[e.champion].color : '#ffd96a'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, cy, r + 5, time * 2, time * 2 + 4.6); g.stroke();
    }
    // readability: dark backdrop so enemies never vanish into glow, and a visual scale-up
    if (!opts.icon) { g.fillStyle = 'rgba(5,4,14,0.42)'; g.beginPath(); g.arc(x, cy, r * ES * 1.18, 0, TAU); g.fill(); }
    g.save(); g.translate(x, cy); g.scale(ES, ES); g.translate(-x, -cy);
    const espr = !opts.noSprite && R.Art && R.Art.get('enemy_' + e.type);
    if (espr) Draw.enemySprite(g, e, espr, x, cy, r, dir, time, fl, a);
    else switch (def.shape) {
      case 'husk': {
        g.fillStyle = dark; g.beginPath();
        for (let k = 0; k < 10; k++) { const ang = k / 10 * TAU + a; const rr = k % 2 ? r : r * 1.3; g.lineTo(x + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); }
        g.closePath(); g.fill();
        const bg = g.createRadialGradient(x - r * 0.3, cy - r * 0.3, 1, x, cy, r); bg.addColorStop(0, U.shade(fill, 0.35)); bg.addColorStop(1, fill);
        g.fillStyle = bg; g.beginPath(); g.arc(x, cy, r * 0.92, 0, TAU); g.fill();
        eyes(g, x, cy, r, dir, '#fff2a0');
        break;
      }
      case 'dart': {
        g.save(); g.translate(x, cy); g.rotate(dir);
        g.strokeStyle = dark; g.lineWidth = 2;
        for (let k = -1; k <= 1; k += 2) for (let l = 0; l < 2; l++) { const sw = Math.sin(a * 22 + l * 2) * 4; g.beginPath(); g.moveTo(-2 - l * 6, 0); g.lineTo(-4 - l * 6 + sw, k * r * 1.1); g.stroke(); }
        const dg = g.createLinearGradient(-r, 0, r * 1.4, 0); dg.addColorStop(0, dark); dg.addColorStop(1, U.shade(fill, 0.3));
        g.fillStyle = dg; g.beginPath(); g.moveTo(r * 1.5, 0); g.lineTo(-r, -r * 0.85); g.lineTo(-r * 0.5, 0); g.lineTo(-r, r * 0.85); g.closePath(); g.fill();
        g.fillStyle = '#ff3a3a'; g.beginPath(); g.arc(r * 0.5, 0, 2.2, 0, TAU); g.fill();
        g.restore();
        break;
      }
      case 'hex': {
        g.save(); g.translate(x, cy); g.rotate(dir * 0.15);
        const hg = g.createLinearGradient(-r, -r, r, r); hg.addColorStop(0, U.shade(fill, 0.45)); hg.addColorStop(0.5, fill); hg.addColorStop(1, U.shade(fill, -0.4));
        g.fillStyle = U.shade(fill, -0.55); poly(g, 0, 3, r * 1.08, 6, 0); g.fill();
        g.fillStyle = hg; poly(g, 0, 0, r, 6, 0); g.fill();
        g.strokeStyle = U.shade(fill, -0.6); g.lineWidth = 2; poly(g, 0, 0, r * 0.6, 6, 0); g.stroke();
        g.fillStyle = '#ffcf5a'; for (let k = 0; k < 6; k++) { const an = k / 6 * TAU; g.beginPath(); g.arc(Math.cos(an) * r * 0.8, Math.sin(an) * r * 0.8, 1.8, 0, TAU); g.fill(); }
        g.fillStyle = '#ff5050'; g.fillRect(-r * 0.35, -2, r * 0.7, 4);
        g.restore();
        break;
      }
      case 'wing': {
        const flap = Math.sin(a * 12) * 0.6;
        g.save(); g.translate(x, cy); g.rotate(dir);
        g.fillStyle = U.rgba(U.shade(fill, -0.2), 0.9);
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-r * 0.4, s * r * (1.6 + flap), -r * 1.2, s * r * (1.4 + flap)); g.quadraticCurveTo(-r * 0.6, s * r * 0.5, -r * 0.2, 0); g.fill(); }
        const wg = g.createLinearGradient(-r, 0, r, 0); wg.addColorStop(0, dark); wg.addColorStop(1, U.shade(fill, 0.3));
        g.fillStyle = wg; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(r * 0.55, 0, 2.3, 0, TAU); g.fill();
        g.restore();
        break;
      }
      case 'swarm': {
        g.save(); g.translate(x, cy); g.rotate(dir);
        g.strokeStyle = dark; g.lineWidth = 1.3;
        for (let k = -1; k <= 1; k += 2) { const sw = Math.sin(a * 30) * 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(sw, k * r * 1.4); g.moveTo(-3, 0); g.lineTo(-3 - sw, k * r * 1.3); g.stroke(); }
        g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, r, r * 0.75, 0, 0, TAU); g.fill();
        g.fillStyle = U.shade(fill, 0.4); g.beginPath(); g.ellipse(r * 0.2, -r * 0.2, r * 0.4, r * 0.25, 0, 0, TAU); g.fill();
        g.restore();
        break;
      }
      case 'aegis': {
        const bg = g.createRadialGradient(x - r * 0.3, cy - r * 0.3, 1, x, cy, r); bg.addColorStop(0, U.shade(fill, 0.4)); bg.addColorStop(1, U.shade(fill, -0.3));
        g.fillStyle = bg; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
        g.strokeStyle = U.rgba('#bff8ff', 0.85); g.lineWidth = 2.5;
        for (let k = 0; k < 3; k++) { const an = time * 2 + k / 3 * TAU; g.beginPath(); g.arc(x, cy, r + 5, an, an + 1.2); g.stroke(); }
        g.fillStyle = '#ffffff'; poly(g, x, cy, r * 0.45, 4, time); g.fill();
        break;
      }
      case 'blink': {
        for (let k = 2; k >= 1; k--) { g.globalAlpha = alpha * 0.18 * (3 - k); g.fillStyle = fill; diamond(g, x - Math.cos(dir) * k * 9, cy - Math.sin(dir) * k * 9, r * 0.8, r * 1.2); g.fill(); }
        g.globalAlpha = alpha;
        const bg = g.createLinearGradient(x, cy - r, x, cy + r); bg.addColorStop(0, U.shade(fill, 0.5)); bg.addColorStop(1, dark);
        g.fillStyle = bg; diamond(g, x, cy, r * 0.85, r * 1.25); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, cy - r * 0.2, 2.5 + Math.sin(time * 8) * 1, 0, TAU); g.fill();
        break;
      }
      case 'brood': {
        const pul = 1 + Math.sin(a * 4) * 0.05;
        g.fillStyle = dark; g.beginPath(); g.ellipse(x, cy, r * 1.05 * pul, r * 0.9 * pul, 0, 0, TAU); g.fill();
        g.fillStyle = fill; g.beginPath(); g.ellipse(x, cy - 2, r * pul, r * 0.82 * pul, 0, 0, TAU); g.fill();
        for (let k = 0; k < 5; k++) { const an = k / 5 * TAU + a; g.fillStyle = U.rgba('#d6ff9e', 0.7); g.beginPath(); g.arc(x + Math.cos(an) * r * 0.5, cy + Math.sin(an) * r * 0.4, r * 0.18, 0, TAU); g.fill(); }
        eyes(g, x, cy - r * 0.2, r * 0.8, dir, '#ff4d4d');
        break;
      }
      case 'mender': {
        const bg = g.createRadialGradient(x, cy, 1, x, cy, r); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, fill);
        g.fillStyle = bg; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
        g.fillStyle = '#ff3a7a'; g.fillRect(x - 2.5, cy - r * 0.6, 5, r * 1.2); g.fillRect(x - r * 0.6, cy - 2.5, r * 1.2, 5);
        g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff9ec4', x, cy, r * 2.2, 0.35 + Math.sin(time * 4) * 0.1); g.restore();
        break;
      }
      case 'phantom': {
        g.save(); g.translate(x, cy);
        const pg = g.createLinearGradient(0, -r, 0, r * 1.6); pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.5, fill); pg.addColorStop(1, U.rgba(fill, 0));
        g.fillStyle = pg; g.beginPath(); g.arc(0, 0, r, Math.PI, 0);
        for (let k = 0; k <= 4; k++) g.lineTo(r - k * r / 2, r * 1.3 + Math.sin(a * 8 + k) * 4 * (k % 2 ? 1 : -1));
        g.closePath(); g.fill();
        g.fillStyle = '#1a2a4a'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.1, 2.5, 3.5, 0, 0, TAU); g.ellipse(r * 0.35, -r * 0.1, 2.5, 3.5, 0, 0, TAU); g.fill();
        g.restore();
        break;
      }
      case 'boss': Draw.bossAura(g, e, x, cy, r, time); Draw.boss(g, e, x, cy, r, time, fill, flash); g.strokeStyle = U.rgba('#ffffff', 0.25 + fl * 0.4); g.lineWidth = 2; g.beginPath(); g.arc(x, cy, r * 1.08, 0, TAU); g.stroke(); break;
      case 'magmaw': Draw.bossAura(g, e, x, cy, r, time); Draw.magmaw(g, e, x, cy, r * 1.12, time, flash); g.strokeStyle = U.rgba('#ffffff', 0.25 + fl * 0.4); g.lineWidth = 2; g.beginPath(); g.arc(x, cy, r * 1.22, 0, TAU); g.stroke(); break;
    }
    // status overlays
    if (frozen) { g.fillStyle = 'rgba(190,240,255,0.55)'; poly(g, x, cy, r * 1.25, 6, 0.3); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.stroke(); }
    if (e.shield > 0) {
      const frac = Math.min(1, e.shield / Math.max(1, e.maxShield || e.shield));
      g.save(); g.strokeStyle = 'rgba(10,30,40,0.7)'; g.lineWidth = 4; g.beginPath(); g.arc(x, cy, r + 6, 0, TAU); g.stroke();
      g.strokeStyle = '#7fe8ff'; g.lineWidth = 2; const segs = 6;
      for (let k = 0; k < segs; k++) { if (k / segs >= frac) break; const a0 = -Math.PI / 2 + k / segs * TAU + 0.08, a1 = -Math.PI / 2 + (k + 1) / segs * TAU - 0.08; g.beginPath(); g.arc(x, cy, r + 6, a0, a1); g.stroke(); }
      g.restore();
    }
    if (e.rootT > 0) { g.strokeStyle = '#4fbf4f'; g.lineWidth = 2.5; for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + 0.4; g.beginPath(); g.moveTo(x + Math.cos(an) * r * 1.2, y + r * 0.5); g.quadraticCurveTo(x + Math.cos(an) * r * 0.3, cy, x + Math.cos(an + 1) * r * 0.6, cy - r * 0.4); g.stroke(); } }
    if (e.stunT > 0) for (let k = 0; k < 3; k++) { const an = time * 6 + k / 3 * TAU; g.fillStyle = '#ffe14d'; poly(g, x + Math.cos(an) * r, cy - r - 6 + Math.sin(an) * 3, 3, 4, an); g.fill(); }
    if (e.markT > 0) { g.strokeStyle = 'rgba(255,240,170,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, cy, r + 9, 0, TAU); g.moveTo(x - r - 13, cy); g.lineTo(x - r - 5, cy); g.moveTo(x + r + 5, cy); g.lineTo(x + r + 13, cy); g.stroke(); }
    if (e.shredT > 0) { g.strokeStyle = 'rgba(200,250,255,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - r * 0.6, cy - r * 0.4); g.lineTo(x - r * 0.1, cy); g.lineTo(x - r * 0.4, cy + r * 0.5); g.moveTo(x + r * 0.5, cy - r * 0.5); g.lineTo(x + r * 0.15, cy + r * 0.1); g.stroke(); }
    if (e.champion && !opts.icon) { // crown
      g.fillStyle = D.AFFIXES[e.champion].color; g.beginPath(); const yy = cy - r - 12;
      g.moveTo(x - 8, yy + 6); g.lineTo(x - 8, yy); g.lineTo(x - 4, yy + 3); g.lineTo(x, yy - 3); g.lineTo(x + 4, yy + 3); g.lineTo(x + 8, yy); g.lineTo(x + 8, yy + 6); g.closePath(); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    g.restore();
  };
  const ES = 1.3;
  Draw.enemyBar = function (g, e, game) {
    if (e.boss || !(e.hp < e.maxHp || e.shield > 0 || e.elite || e.champion)) return;
    if (game && e.type === 'phantom' && !game.isVisible(e)) return;
    const r = e.r * ES;
    const hop = e.flying ? 26 + Math.sin(e.anim * 3) * 4 : 0;
    const w = Math.max(24, r * 1.7);
    bar(g, e.x, e.y - hop - r - (e.champion ? 24 : 9), w, e.hp / e.maxHp, e.champion ? D.AFFIXES[e.champion].color : e.elite ? '#ffd96a' : (e.hp / e.maxHp > 0.5 ? '#6dff8e' : e.hp / e.maxHp > 0.25 ? '#ffd24d' : '#ff5050'), e.shield > 0 ? e.shield / e.maxHp : 0);
  };
  function eyes(g, x, y, r, dir, col) {
    const ex = Math.cos(dir) * r * 0.35, ey = Math.sin(dir) * r * 0.35;
    g.fillStyle = col;
    g.beginPath(); g.arc(x + ex - r * 0.25, y + ey - r * 0.15, r * 0.16, 0, TAU); g.arc(x + ex + r * 0.25, y + ey - r * 0.15, r * 0.16, 0, TAU); g.fill();
  }
  Draw.boss = function (g, e, x, y, r, time, fill, flash) {
    const ph = e.phase || 1;
    const core = ph === 1 ? '#7a5cff' : ph === 2 ? '#ff4dd2' : '#ff3a3a';
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, core, x, y, r * 2.6, 0.45 + Math.sin(time * 3) * 0.15); g.restore();
    // rotating armour plates
    for (let k = 0; k < 8; k++) {
      const an = k / 8 * TAU + time * (ph === 3 ? 1.6 : 0.5);
      g.save(); g.translate(x + Math.cos(an) * r * 0.95, y + Math.sin(an) * r * 0.95); g.rotate(an);
      g.fillStyle = flash ? '#ffffff' : '#2a2140'; g.fillRect(-7, -13, 14, 26);
      g.fillStyle = U.rgba(core, 0.8); g.fillRect(-2, -10, 4, 20);
      g.restore();
    }
    const bg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r * 0.85);
    bg.addColorStop(0, flash ? '#ffffff' : '#4a3a7a'); bg.addColorStop(1, '#120c22');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, r * 0.85, 0, TAU); g.fill();
    // eye
    const look = Math.atan2(e.vy || 0, e.vx || 1);
    const eg = g.createRadialGradient(x + Math.cos(look) * 6, y + Math.sin(look) * 6, 1, x, y, r * 0.42);
    eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.3, core); eg.addColorStop(1, '#120c22');
    g.fillStyle = eg; g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(x + Math.cos(look) * 8, y + Math.sin(look) * 8, 4, 11, look, 0, TAU); g.fill();
    if (e.pulseWarn > 0) {
      const k = 1 - e.pulseWarn / 1.3;
      g.strokeStyle = U.rgba('#c9a8ff', 0.3 + k * 0.6); g.lineWidth = 3; g.setLineDash([10, 8]);
      g.beginPath(); g.arc(x, y, 2.6 * T * k, 0, TAU); g.stroke(); g.setLineDash([]);
      g.strokeStyle = U.rgba('#c9a8ff', 0.25); g.beginPath(); g.arc(x, y, 2.6 * T, 0, TAU); g.stroke();
    }
  };

  Draw.bossAura = function (g, e, x, y, r, time) {
    const col = e.type === 'magmaw' ? '#ff7a2a' : '#b45cff';
    // rotating sigil ring on the ground + tendrils
    g.save(); g.translate(x, y + r * 0.55); g.scale(1, 0.42);
    g.strokeStyle = U.rgba(col, 0.55); g.lineWidth = 3; g.setLineDash([14, 10]); g.lineDashOffset = -time * 40;
    g.beginPath(); g.arc(0, 0, r * 1.9, 0, TAU); g.stroke(); g.setLineDash([]);
    g.strokeStyle = U.rgba(col, 0.3); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 2.3, 0, TAU); g.stroke();
    for (let k = 0; k < 8; k++) { const a = time * 0.7 + k / 8 * TAU; g.fillStyle = U.rgba(col, 0.6); poly(g, Math.cos(a) * r * 2.1, Math.sin(a) * r * 2.1, 5, 3, a); g.fill(); }
    g.restore();
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = U.rgba(col, 0.35); g.lineWidth = 3;
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.sin(time + k) * 0.3; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * r * 1.3, y + Math.sin(a + 0.6) * r * 1.3, x + Math.cos(a) * r * (1.7 + Math.sin(time * 3 + k) * 0.2), y + Math.sin(a) * r * (1.7 + Math.sin(time * 3 + k) * 0.2)); g.stroke(); }
    g.restore();
  };
  Draw.magmaw = function (g, e, x, y, r, time, flash) {
    const ph = e.phase || 1;
    g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff5a1f', x, y, r * (2.2 + ph * 0.3), 0.4 + Math.sin(time * 4) * 0.12); g.restore();
    // legs
    g.fillStyle = flash ? '#fff' : '#1c1210';
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; const st = Math.sin(e.anim * 4 + k * 1.7) * 5; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.85 + st, y + Math.sin(a) * r * 0.7, r * 0.32, r * 0.22, a, 0, TAU); g.fill(); }
    // carapace plates (crack apart in later phases)
    const spread = ph === 1 ? 0 : ph === 2 ? 5 : 9;
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + 0.2;
      g.save(); g.translate(x + Math.cos(a) * spread, y + Math.sin(a) * spread);
      g.fillStyle = flash ? '#fff' : (k % 2 ? '#3a2622' : '#2a1a16');
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r * 0.95, a - 0.45, a + 0.45); g.closePath(); g.fill();
      g.restore();
    }
    // molten core showing through the cracks
    const cg = g.createRadialGradient(x, y, 2, x, y, r * (0.45 + spread / 60));
    cg.addColorStop(0, '#ffc070'); cg.addColorStop(0.4, '#e8681e'); cg.addColorStop(1, 'rgba(200,60,20,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = cg; g.beginPath(); g.arc(x, y, r * (0.5 + spread / 50), 0, TAU); g.fill(); g.restore();
    g.strokeStyle = U.rgba('#ff7a2a', 0.5 + ph * 0.15); g.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.2 + 0.45; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2); g.lineTo(x + Math.cos(a) * (r * 0.95 + spread), y + Math.sin(a) * (r * 0.95 + spread)); g.stroke(); }
    g.strokeStyle = '#0a0504'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r * 0.97 + spread, 0, TAU); g.stroke();
    // horns + eyes
    const look = Math.atan2(e.vy || 0, e.vx || 1);
    g.fillStyle = '#120a08';
    for (const sgn of [-1, 1]) { const a = look + sgn * 0.6; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); g.lineTo(x + Math.cos(a + sgn * 0.25) * r * 1.35, y + Math.sin(a + sgn * 0.25) * r * 1.35); g.lineTo(x + Math.cos(a + sgn * 0.35) * r * 0.8, y + Math.sin(a + sgn * 0.35) * r * 0.8); g.fill(); }
    g.fillStyle = '#fff3b0';
    for (const sgn of [-1, 1]) { const a = look + sgn * 0.3; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, 3.5, 0, TAU); g.fill(); }
    if (e.cataWarn) { g.strokeStyle = U.rgba('#ff7a2a', 0.5 + Math.sin(time * 20) * 0.3); g.lineWidth = 4; g.beginPath(); g.arc(x, y, r * 1.5, 0, TAU); g.stroke(); }
  };
  Draw.minion = function (g, m, time) {
    const x = m.x, y = m.y;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 1, y + m.r * 0.7, m.r, m.r * 0.4, 0, 0, TAU); g.fill();
    const bob = Math.abs(Math.sin(m.anim * 6)) * 2;
    if (m.treant) {
      g.fillStyle = '#5a3a22'; g.fillRect(x - 8, y - 18 - bob, 16, 22);
      g.fillStyle = '#4a2e1a'; g.fillRect(x - 14, y - 14 - bob, 6, 16); g.fillRect(x + 8, y - 14 - bob, 6, 16);
      for (let k = 0; k < 3; k++) { g.fillStyle = ['#1d4a24', '#2b6a33', '#3f8a45'][k]; g.beginPath(); g.arc(x + (k - 1) * 8, y - 26 - bob - k * 3, 13 - k * 2, 0, TAU); g.fill(); }
      g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x - 4, y - 12 - bob, 2, 0, TAU); g.arc(x + 4, y - 12 - bob, 2, 0, TAU); g.fill();
    } else {
      g.fillStyle = '#2f7a3c'; g.beginPath(); g.arc(x, y - 6 - bob, m.r, 0, TAU); g.fill();
      g.fillStyle = '#6dff8e'; for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + 0.4; g.beginPath(); g.moveTo(x + Math.cos(an) * m.r, y - 6 - bob + Math.sin(an) * m.r); g.lineTo(x + Math.cos(an) * (m.r + 5), y - 6 - bob + Math.sin(an) * (m.r + 5)); g.lineTo(x + Math.cos(an + 0.4) * m.r, y - 6 - bob + Math.sin(an + 0.4) * m.r); g.fill(); }
      g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x - 3, y - 8 - bob, 1.6, 0, TAU); g.arc(x + 3, y - 8 - bob, 1.6, 0, TAU); g.fill();
    }
    if (m.hp < m.maxHp) bar(g, x, y - (m.treant ? 46 : 24), m.treant ? 30 : 18, m.hp / m.maxHp, '#6dff8e');
  };

  // ============================================================ VIEW
  class View {
    constructor(canvas) {
      this.canvas = canvas;
      this.scene = document.createElement('canvas');
      this.g = this.scene.getContext('2d');
      View.current = this;
      this.light = document.createElement('canvas');
      this.lg = this.light.getContext('2d');
      try { this.post = new R.Post(canvas); } catch (err) { console.warn('WebGL post disabled', err); this.post = null; this.direct = canvas.getContext('2d'); }
      this.particles = []; this.texts = [];
      this.cam = { x: W / 2, y: H / 2, zoom: 1, tx: W / 2, ty: H / 2, tz: 1 };
      this.shake = 0; this.flash = 0; this.dmgFlash = 0; this.caPulse = 0; this.hitstop = 0;
      this.time = 0;
      this.settings = { shake: true, numbers: true, post: 'high', flashes: true, labels: true };
      this.hover = null; this.preview = null; this.selected = null;
      this.hudTop = 64; this.hudBottom = 118;
      this.zoomPulse = 0;
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = window.innerWidth, ch = window.innerHeight;
      let scale = dpr;
      const maxW = this.settings.post === 'low' ? 1280 : 2400;
      if (cw * scale > maxW) scale = maxW / cw;
      this.pxScale = scale;
      const w = Math.round(cw * scale), h = Math.round(ch * scale);
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
      this.scene.width = w; this.scene.height = h;
      this.light.width = Math.ceil(w / 4); this.light.height = Math.ceil(h / 4);
      this.cssW = cw; this.cssH = ch;
    }
    setGame(game, skin) {
      this.game = game; this.skin = skin; if (skin && !skin.id) for (const k in D.SKINS) if (D.SKINS[k] === skin) skin.id = k;
      this.bg = R.buildBackground(game);
      this.painted = !!(R.Art && R.Art.get('map_' + game.map.id));
      this.biome = D.BIOMES[game.map.biome];
      this.particles = []; this.texts = []; this.critters = []; this.focus = null; this.fg = null; this.shake = 0; this.hitstop = 0; this.flash = 0; this.dmgFlash = 0;
      this.cam = { x: W / 2, y: H / 2, zoom: 1, tx: W / 2, ty: H / 2, tz: 1 };
      this.voidPath = null;
      if (game.map.biome === 'sky') { this.voidPath = new Path2D(); for (let i = 0; i < game.type.length; i++) if (game.type[i] === 3) this.voidPath.rect((i % D.COLS) * T, ((i / D.COLS) | 0) * T, T, T); }
      if (game.map.biome === 'cinder') { this.lavaPath = new Path2D(); this.lavaTiles = []; for (let i = 0; i < game.type.length; i++) if (game.type[i] === 4) { this.lavaPath.rect((i % D.COLS) * T, ((i / D.COLS) | 0) * T, T, T); this.lavaTiles.push(i); } }
      this.clouds = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: U.rand(60, 150), s: U.rand(8, 22) }));
      this.motes = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 10, s: U.rand(0.5, 1.5) }));
      const ev = game.ev;
      ev.on('fx', (...args) => this.fx(...args));
      ev.on('text', (x, y, s, col, size, key, kind) => { if (kind === 'label' && !this.settings.labels) return; this.addText(x, y, s, col, size, { key }); });
      ev.on('dmgText', (x, y, amt, crit, type, dot) => { if (!this.settings.numbers) return; if (this.texts.filter(t => t.dmg).length > 14 || this.texts.some(t => t.dmg && Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 40)) return; this.addText(x + U.rand(-10, 10), y - U.rand(0, 8), U.fmt(amt) + (crit ? '!' : ''), crit ? '#ffe14d' : DMG_COL[type] || '#fff', crit ? 21 : dot ? 13 : 15, { dmg: true, crit }); });
      ev.on('shake', a => { if (this.settings.shake) this.shake = Math.min(30, this.shake + a); });
      ev.on('hitstop', d => { this.hitstop = Math.max(this.hitstop, d); });
      ev.on('flash', a => { if (this.settings.flashes) this.flash = Math.max(this.flash, a * 0.6); this.caPulse = Math.max(this.caPulse, a); });
      ev.on('leak', () => { this.dmgFlash = this.settings.flashes ? 0.6 : 0.25; });
      ev.on('boss', e => { const th = document.getElementById('threat'); if (th) th.classList.add('hidden'); this.focusOn(e.x, e.y, e.herald ? 1.05 : 1.1, 1.3); });
      ev.on('bossPhase', e => { this.focusOn(e.x, e.y, 1.05, 0.7); });
      ev.on('placed', t => { t.bornReal = this.time; });
    }
    focusOn(x, y, zoom, dur) { if (Number.isFinite(x) && Number.isFinite(y)) this.focus = { x, y, zoom, t: dur }; }
    // safe area: side columns host HUD panels; an open tower panel widens its side so it never covers the map
    sideTargets() {
      const side = this.cssW > 1000 ? U.clamp(this.cssW * 0.105, 128, this.hudSide || 168) : 0, wide = this.cssW > 1000 ? 352 : side;
      void wide;
      if (this.menuMode) return [0, 0];
      return [side, side];
    }
    get scale() {
      if (this.safeL == null) [this.safeL, this.safeR] = this.sideTargets();
      const ht = this.menuMode ? 0 : this.hudTop, hb = this.menuMode ? 0 : this.hudBottom;
      const vw = this.canvas.width - (this.safeL + this.safeR) * this.pxScale, vh = this.canvas.height - (ht + hb) * this.pxScale;
      return Math.min(vw / W, vh / H);
    }
    viewCenter() {
      if (this.safeL == null) [this.safeL, this.safeR] = this.sideTargets();
      const ht = this.menuMode ? 0 : this.hudTop, hb = this.menuMode ? 0 : this.hudBottom;
      return [(this.safeL + (this.cssW - this.safeL - this.safeR) / 2) * this.pxScale, (ht * this.pxScale) + (this.canvas.height - (ht + hb) * this.pxScale) / 2];
    }
    screenToWorld(cssX, cssY) {
      const s = this.scale * this.cam.zoom, [vx, vy] = this.viewCenter();
      return [(cssX * this.pxScale - vx) / s + this.cam.x, (cssY * this.pxScale - vy) / s + this.cam.y];
    }
    worldToScreen(x, y) {
      const s = this.scale * this.cam.zoom, [vx, vy] = this.viewCenter();
      return [((x - this.cam.x) * s + vx) / this.pxScale, ((y - this.cam.y) * s + vy) / this.pxScale];
    }
    zoomAt(cssX, cssY, factor) {
      const [wx, wy] = this.screenToWorld(cssX, cssY);
      const nz = U.clamp(this.cam.tz * factor, 1, 2.2);
      this.cam.tz = nz;
      // keep the point under cursor stable
      const s = this.scale * nz, [vx, vy] = this.viewCenter();
      this.cam.tx = wx - (cssX * this.pxScale - vx) / s; this.cam.ty = wy - (cssY * this.pxScale - vy) / s;
      this.clampCam();
    }
    pan(dx, dy) { const s = this.scale * this.cam.zoom / this.pxScale; this.cam.tx -= dx / s; this.cam.ty -= dy / s; this.clampCam(); }
    clampCam() {
      const z = this.cam.tz;
      const hw = W / 2 / z, hh = H / 2 / z;
      this.cam.tx = U.clamp(this.cam.tx, hw, W - hw); this.cam.ty = U.clamp(this.cam.ty, hh, H - hh);
      if (z <= 1.001) { this.cam.tx = W / 2; this.cam.ty = H / 2; }
    }

    // ---------------------------------------------------------- particles
    p(o) { if (this.particles.length > 2600) this.particles.shift(); o.life = o.max = o.life || 0.6; this.particles.push(o); return o; }
    burst(x, y, n, col, o) {
      o = o || {};
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, sp = U.rand(o.min || 60, o.max || 260);
        this.p({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life: U.rand(0.25, o.life || 0.7), size: U.rand(o.s0 || 2, o.s1 || 5), color: col, kind: o.kind || 'spark', add: o.add !== false, drag: o.drag || 3, grav: o.grav || 0, rot: Math.random() * TAU, vr: U.rand(-10, 10) });
      }
    }
    ring(x, y, r, col, life, w) { this.p({ x, y, kind: 'ring', r0: r * 0.15, r1: r, color: col, life: life || 0.45, w: w || 3, add: true }); }
    addText(x, y, s, color, size, o) {
      o = o || {};
      if (o.key) { const i = this.texts.findIndex(t => t.key === o.key); if (i >= 0) this.texts.splice(i, 1); }
      if (!o.dmg && !o.key && this.texts.filter(t => !t.dmg && Math.abs(t.x - x) < 90 && Math.abs(t.y - y) < 60).length >= 2) return; // per-region label budget
      for (let k = 0; k < 5; k++) { if (!this.texts.some(t => Math.abs(t.x - x) < 60 && Math.abs(t.y - y) < (size || 16) + 4)) break; y -= (size || 16) + 4; } // stack instead of overprinting
      this.texts.push({ x, y, s: String(s), color, size: size || 16, life: o.dmg ? 0.8 : 1.4, max: o.dmg ? 0.8 : 1.4, vy: o.dmg ? -50 : -34, crit: o.crit, dmg: o.dmg, key: o.key });
    }
    fx(type, a, b, c, d, e) {
      const x = a, y = b;
      switch (type) {
        case 'hit': if (this.game && this.game.boss && U.dist2(x, y, this.game.boss.x, this.game.boss.y) < (this.game.boss.r * 1.6) ** 2 && Math.random() < 0.75) break; this.burst(x, y, d ? 6 : 3, c, { max: 200, life: 0.25 }); if (d) { this.caPulse = Math.max(this.caPulse, 0.15); this.ring(x, y, 22, '#fff3b0', 0.25, 2); } break;
        case 'railHit': this.burst(x, y, 7, '#fff3b0', { max: 380, life: 0.35 }); this.ring(x, y, 30, '#fff3b0', 0.25, 2); break;
        case 'corpse': { // the creature's own painted sprite pops, flashes and dissolves
          const img = R.Art && (R.Art.get('enemy_' + c + '_f0') || R.Art.get('enemy_' + c));
          if (img) this.p({ x, y, kind: 'corpse', img, size: d, rot: e || 0, life: 0.45, add: false });
          break;
        }
        case 'death': {
          const big = e;
          const n = big ? 34 : 14;
          for (let k = 0; k < n; k++) { const an = Math.random() * TAU, sp = U.rand(80, big ? 420 : 260); this.p({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 80, life: U.rand(0.4, 0.9), size: U.rand(3, big ? 9 : 6), color: c, kind: 'shard', add: false, drag: 2.5, grav: 500, rot: Math.random() * TAU, vr: U.rand(-14, 14) }); }
          this.burst(x, y, big ? 20 : 8, U.shade(c, 0.4), { max: 240 });
          this.p({ x, y, kind: 'flare', size: (d || 14) * (big ? 4 : 2.2), color: c, life: 0.2, add: true });
          if (big) { this.ring(x, y, 90, c, 0.5, 5); this.caPulse = Math.max(this.caPulse, 0.35); }
          break;
        }
        case 'explosion': {
          const rad = c, k = d || 1;
          this.p({ x, y, kind: 'flare', size: rad * (k < 0.8 ? 0.7 : 1.05), color: '#ffb36b', life: 0.18, add: true });
          this.ring(x, y, rad, '#ffcf8a', 0.35, k > 0.8 ? 4 : 2);
          this.burst(x, y, Math.round(9 * k), '#ffb36b', { max: 360 * k, life: 0.45 });
          for (let n = 0; n < 6 * k; n++) this.p({ x: x + U.rand(-rad / 2, rad / 2), y: y + U.rand(-rad / 2, rad / 2), vx: U.rand(-30, 30), vy: U.rand(-60, -20), life: U.rand(0.6, 1.2), size: U.rand(10, 22) * k, color: '#3a2a26', kind: 'smoke', add: false, drag: 1 });
          if (k > 0.8) { this.caPulse = Math.max(this.caPulse, 0.12); for (let n = 0; n < 3; n++) this.p({ x, y, vx: U.rand(-120, 120), vy: U.rand(-280, -120), life: U.rand(0.5, 1), size: U.rand(2, 4), color: '#ffcf5a', kind: 'ember', add: true, grav: 500, drag: 1 }); }
          break;
        }
        case 'muzzle': this.burst(x, y, 5, c, { max: 140, life: 0.25 }); break;
        case 'frostPulse': {
          const rad = c, freeze = d;
          this.ring(x, y, rad, freeze ? '#ffffff' : '#9fe8ff', 0.5, freeze ? 5 : 3);
          for (let k = 0; k < (freeze ? 26 : 12); k++) { const an = Math.random() * TAU, rr = Math.random() * rad; this.p({ x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr, vx: 0, vy: -20, life: U.rand(0.4, 0.9), size: U.rand(2, 4), color: '#d8f8ff', kind: 'shard', add: true, drag: 1, rot: an, vr: 4 }); }
          break;
        }
        case 'shieldPulse': this.ring(x, y, c, '#4df0ff', 0.6, 2); break;
        case 'shieldBreak': this.burst(x, y, 10, '#7fe8ff', { kind: 'shard', add: true, max: 220 }); this.ring(x, y, (c || 14) + 14, '#bff8ff', 0.25, 2); break;
        case 'heal': for (let k = 0; k < 3; k++) this.p({ x: x + U.rand(-c / 2, c / 2), y: y + U.rand(-c / 3, c / 3), vx: 0, vy: -40, life: 0.8, size: 5, color: '#ff9ec4', kind: 'plus', add: true }); break;
        case 'blink': this.burst(x, y, 12, c, { max: 200, life: 0.35 }); this.ring(x, y, 30, c, 0.3, 2); break;
        case 'build': this.ring(x, y, 48, c, 0.5, 4); this.burst(x, y + 6, 18, c, { max: 220, up: 60 }); for (let k = 0; k < 8; k++) this.p({ x: x + U.rand(-20, 20), y: y + 10, vx: U.rand(-40, 40), vy: U.rand(-40, -10), life: 0.8, size: U.rand(8, 14), color: '#8a7a6a', kind: 'smoke', add: false, drag: 2 }); break;
        case 'upgrade': {
          const lvl = d || 1;
          this.ring(x, y - 10, 40 + lvl * 10, c, 0.6, 4); this.ring(x, y - 10, 20 + lvl * 6, '#ffffff', 0.4, 2);
          for (let k = 0; k < 24 + lvl * 6; k++) { const an = Math.random() * TAU; this.p({ x: x + Math.cos(an) * 20, y: y + Math.sin(an) * 10, vx: Math.cos(an) * 30, vy: U.rand(-220, -80), life: U.rand(0.6, 1.1), size: U.rand(2, 4), color: k % 3 ? c : '#ffffff', kind: 'glow', add: true, drag: 1.5 }); }
          this.p({ x, y: y - 20, kind: 'beamUp', size: 30, color: c, life: 0.6, add: true });
          if (lvl >= 3) { this.caPulse = Math.max(this.caPulse, 0.2); this.hitstop = Math.max(this.hitstop, 0.05); }
          break;
        }
        case 'sell': this.burst(x, y, 18, '#ffd96a', { max: 220, up: 80, grav: 300 }); this.ring(x, y, 40, '#ffd96a', 0.4, 2); break;
        case 'debris': for (let k = 0; k < 18; k++) this.p({ x, y, vx: U.rand(-200, 200), vy: U.rand(-300, -80), life: U.rand(0.5, 1), size: U.rand(3, 7), color: c, kind: 'shard', add: false, grav: 700, drag: 1, rot: Math.random() * 6, vr: U.rand(-12, 12) }); break;
        case 'fall': for (let k = 0; k < 10; k++) this.p({ x: x + U.rand(-8, 8), y, vx: U.rand(-40, 40), vy: U.rand(40, 160), life: 0.9, size: U.rand(3, 6), color: c, kind: 'shard', add: false, grav: 600, drag: 0.5, rot: 0, vr: 6 }); this.p({ x, y, kind: 'fallBody', size: d || 14, color: c, life: 0.9 }); break;
        case 'thunder': this.p({ x, y, kind: 'flare', size: 120, color: '#e6dcff', life: 0.25, add: true }); this.ring(x, y, 60, '#e6dcff', 0.35, 4); this.burst(x, y, 20, '#c9b8ff', { max: 320 }); this.caPulse = Math.max(this.caPulse, 0.25); break;
        case 'meteor': this.p({ x, y, kind: 'flare', size: c * 2.2, color: '#ffb36b', life: 0.35, add: true }); this.ring(x, y, c * 1.2, '#ffcf8a', 0.6, 7); this.burst(x, y, 50, '#ff8a3a', { max: 600, life: 0.9 }); for (let n = 0; n < 16; n++) this.p({ x: x + U.rand(-c / 2, c / 2), y: y + U.rand(-c / 2, c / 2), vx: U.rand(-40, 40), vy: U.rand(-80, -20), life: U.rand(0.8, 1.6), size: U.rand(16, 30), color: '#2a1a16', kind: 'smoke', add: false, drag: 0.8 }); this.caPulse = 0.6; break;
        case 'target': this.p({ x, y, kind: 'target', size: c, color: d || '#ff6a2b', life: 0.9, add: true }); break;
        case 'shockwave': this.ring(x, y, c, d || '#ffffff', 0.7, 6); this.ring(x, y, c * 0.6, '#ffffff', 0.5, 3); this.caPulse = Math.max(this.caPulse, 0.4); break;
        case 'nullPulse': this.ring(x, y, c, '#c9a8ff', 0.6, 8); this.p({ x, y, kind: 'flare', size: c * 1.4, color: '#7a5cff', life: 0.3, add: true }); this.caPulse = Math.max(this.caPulse, 0.35); break;
        case 'disable': this.burst(x, y - 10, 8, '#c9a8ff', { max: 160 }); break;
        case 'summon': this.ring(x, y, 70, '#ff4dd2', 0.5, 4); this.burst(x, y, 24, '#9dff5c', { max: 260 }); break;
        case 'leak': this.ring(x, y, 80, '#ff5050', 0.5, 5); this.burst(x, y, 24, '#ff5050', { max: 300 }); break;
        case 'stasis': this.stasisFx = 1; break;
        case 'ring': this.ring(x, y, c, d, 0.5, 3); break;
        case 'synergy': if (this.settings.labels) this.addText(x, y, '⚯ ' + c, d, 14, { key: 'syn' }); this.ring(x, y + 10, 26, d, 0.4, 2); break;
        case 'drain': { const tx = c, ty = d; for (let k = 0; k < 10; k++) { const f = k / 10; this.p({ x: U.lerp(x, tx, f), y: U.lerp(y, ty, f), vx: (tx - x) * 0.6, vy: (ty - y) * 0.6, life: 0.6, size: 3, color: '#8fffb0', kind: 'glow', add: true }); } break; }
        case 'overclock': this.ring(x, y, 50, '#ff8a3a', 0.4, 4); this.burst(x, y - 10, 20, '#ffb36b', { max: 260, up: 60 }); break;
        case 'smoke': for (let k = 0; k < 14; k++) this.p({ x: x + U.rand(-12, 12), y: y - 10, vx: U.rand(-20, 20), vy: U.rand(-90, -40), life: U.rand(0.8, 1.6), size: U.rand(8, 16), color: '#3a3a3a', kind: 'smoke', add: false, drag: 0.5 }); break;
        case 'vent': for (let k = 0; k < 8; k++) this.p({ x: x + U.rand(-10, 10), y: y - 20, vx: U.rand(-30, 30), vy: U.rand(-80, -30), life: 0.9, size: U.rand(6, 12), color: '#cfcfcf', kind: 'smoke', add: false, drag: 0.8 }); break;
        case 'sprout': this.burst(x, y, 10, '#6dff8e', { max: 120, up: 40 }); break;
        case 'leaves': for (let k = 0; k < (c ? 24 : 10); k++) this.p({ x, y: y - 10, vx: U.rand(-120, 120), vy: U.rand(-160, -40), life: U.rand(0.7, 1.3), size: U.rand(3, 5), color: k % 2 ? '#3f8a45' : '#6dff8e', kind: 'leaf', add: false, grav: 220, drag: 2, rot: Math.random() * 6, vr: U.rand(-8, 8) }); break;
        case 'slam': this.ring(x, y, T, '#8a6a44', 0.35, 5); this.burst(x, y, 12, '#a17e52', { max: 200, kind: 'shard', add: false, grav: 500 }); break;
        case 'scratch': this.burst(x, y, 3, '#9dffaf', { max: 120, life: 0.2 }); break;
        case 'vinePulse': this.ring(x, y, c, '#4fbf4f', 0.6, 4); break;
        case 'erase': this.burst(x, y, 20, '#d9a8ff', { max: 80, life: 0.6, drag: 0.5 }); this.p({ x, y, kind: 'flare', size: 50, color: '#b45cff', life: 0.3, add: true }); break;
        case 'eruption': {
          this.p({ x, y, kind: 'flare', size: c * 1.5, color: '#ff7a2a', life: 0.35, add: true }); this.ring(x, y, c, '#ffb36b', 0.5, 6);
          for (let k = 0; k < 40; k++) this.p({ x: x + U.rand(-10, 10), y, vx: U.rand(-160, 160), vy: U.rand(-520, -200), life: U.rand(0.7, 1.3), size: U.rand(2, 5), color: k % 2 ? '#ffcf5a' : '#ff5a1f', kind: 'ember', add: true, grav: 700, drag: 0.6 });
          for (let k = 0; k < 10; k++) this.p({ x: x + U.rand(-20, 20), y: y - 10, vx: U.rand(-30, 30), vy: U.rand(-120, -40), life: U.rand(1, 2), size: U.rand(14, 26), color: '#2a1a16', kind: 'smoke', add: false, drag: 0.6 });
          break;
        }
        case 'bridgeCollapse': { const bdg = a; for (const i of bdg.tiles) { const cx = (i % D.COLS) * T + T / 2, cy = ((i / D.COLS) | 0) * T + T / 2; for (let k = 0; k < 8; k++) this.p({ x: cx + U.rand(-28, 28), y: cy + U.rand(-20, 20), vx: U.rand(-40, 40), vy: U.rand(0, 80), life: 1.2, size: U.rand(6, 12), color: '#8a6a44', kind: 'plank', add: false, grav: 500, drag: 0.4, rot: Math.random() * 6, vr: U.rand(-5, 5) }); } break; }
        case 'bridgeRebuild': { const bdg = a; for (const i of bdg.tiles) { const cx = (i % D.COLS) * T + T / 2, cy = ((i / D.COLS) | 0) * T + T / 2; this.ring(cx, cy, 40, '#9fe8ff', 0.5, 3); } break; }
      }
    }

    // ---------------------------------------------------------- frame
    update(rdt) {
      this.time += rdt;
      const c = this.cam;
      const [tl, tr] = this.sideTargets(), ks = 1 - Math.exp(-rdt * 8);
      if (this.safeL == null) { this.safeL = tl; this.safeR = tr; }
      this.safeL += (tl - this.safeL) * ks; this.safeR += (tr - this.safeR) * ks;
      if (this.focus) {
        this.focus.t -= rdt;
        const k = 1 - Math.exp(-rdt * 4);
        const fz = this.focus.zoom, fx = U.clamp(this.focus.x, W / 2 / fz, W - W / 2 / fz), fy = U.clamp(this.focus.y, H / 2 / fz, H - H / 2 / fz); // never reveal past the map edge
        c.x += (fx - c.x) * k; c.y += (fy - c.y) * k; c.zoom += (fz - c.zoom) * k;
        if (this.focus.t <= 0) this.focus = null;
      } else {
        const k = 1 - Math.exp(-rdt * 10);
        c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.zoom += (c.tz - c.zoom) * k;
      }
      // self-heal: a bad value must never leave the camera (and every click) stuck at NaN
      if (!Number.isFinite(c.x + c.y + c.zoom + c.tx + c.ty + c.tz)) { this.focus = null; c.tx = c.x = W / 2; c.ty = c.y = H / 2; c.tz = c.zoom = 1; }
      this.shake *= Math.exp(-rdt * 7); if (this.shake < 0.2) this.shake = 0;
      this.flash *= Math.exp(-rdt * 8); this.dmgFlash *= Math.exp(-rdt * 3.5); this.caPulse *= Math.exp(-rdt * 5);
      if (this.stasisFx) this.stasisFx = Math.max(0, this.stasisFx - rdt * 0.25);
    }
    stepParticles(dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        if (p.vx != null) {
          const dr = Math.exp(-(p.drag || 0) * dt);
          p.vx *= dr; p.vy = p.vy * dr + (p.grav || 0) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.vr) p.rot += p.vr * dt;
        }
      }
      for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-dt * 2.5); if (t.life <= 0) this.texts.splice(i, 1); }
    }

    render(state) {
      const g = this.g, game = this.game, time = this.time, cw = this.scene.width, ch = this.scene.height;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = this.biome ? this.biome.bg : '#050510'; g.fillRect(0, 0, cw, ch);
      if (!game) return this.present();
      const s = this.scale * this.cam.zoom, [vx, vy] = this.viewCenter();
      const sx = this.shake ? U.rand(-1, 1) * this.shake * this.pxScale : 0, sy = this.shake ? U.rand(-1, 1) * this.shake * this.pxScale : 0;
      g.setTransform(s, 0, 0, s, vx - this.cam.x * s + sx, vy - this.cam.y * s + sy);
      // outside-world backdrop glow
      g.save(); g.globalAlpha = 0.35; g.drawImage(this.bg, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06); g.restore();
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(-W, -H, W * 3, H * 3);
      g.drawImage(this.bg, 0, 0);
      this.drawAmbient(g, game, time);
      this.drawMapFeatures(g, game, time);
      this.drawRoutes(g, game, time, state);
      this.drawPreviewUnder(g, game, time, state);
      // magma pools
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const p of game.pools) { const a = Math.min(1, (p.dur - p.t) * 1.5) * 0.7; glowAt(g, '#ff5a1f', p.x, p.y, p.r * 1.3, a); glowAt(g, '#ffcf5a', p.x, p.y, p.r * 0.6, a * 0.6); }
      g.restore();
      // synergy links
      this.drawSynergies(g, game, time, state);
      this.drawParticles(g, time, 'under');
      // entities y-sorted
      const ents = [];
      this.drawGroundLight(g, game, time);
      for (const t of game.towers) ents.push(t);
      for (const b of game.barricades) ents.push(b);
      for (const m of game.minions) ents.push(m);
      for (const e of game.enemies) if (!e.flying) ents.push(e);
      ents.push({ nexus: true, y: game.nexus.y + 10 });
      ents.sort((a, b) => a.y - b.y);
      for (const o of ents) {
        if (o.nexus) this.drawNexus(g, game, time);
        else if (o.def && o.def.levels) Draw.tower(g, o, time, this.skin);
        else if (o.barricade) Draw.barricade(g, o, time);
        else if (o.owner) Draw.minion(g, o, time);
        else Draw.enemy(g, o, time, game);
      }
      for (const e of game.enemies) if (e.flying) Draw.enemy(g, e, time, game);
      for (const e of game.enemies) Draw.enemyBar(g, e, game);
      this.drawAbilityHints(g, game, time);
      this.drawActionCues(g, game, time);
      this.drawProjectiles(g, game, time);
      this.drawWells(g, game, time);
      this.drawZaps(g, game, time);
      this.drawParticles(g, time, 'over');
      this.drawNight(g, game, time, s, vx, vy, sx, sy);
      this.drawPreviewOver(g, game, time, state);
      this.drawForeground(g, game, time);
      this.drawTexts(g);
      // screen-space stasis tint
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (game.stasisT > 0) { g.fillStyle = `rgba(120,200,255,${0.08 + Math.sin(time * 6) * 0.03})`; g.fillRect(0, 0, cw, ch); }
      this.present();
    }
    present() {
      if (this.post && this.settings.post === 'off') {
        // pass-through: the canvas owns a WebGL context, so present through it without any effects
        this.post.render(this.scene, { simple: true, time: this.time, bloom: 0, threshold: 1, ca: 0, vig: 0.25, grain: 0, flash: this.flash, dmg: this.dmgFlash, dof: 0, sat: 1.05 });
      } else if (this.post) {
        const hi = this.settings.post === 'high';
        const night = this.game ? this.game.nightAmt : 0;
        this.post.render(this.scene, {
          time: this.time, bloom: (hi ? 0.8 : 0.6) * (1 + night * 0.35) * U.clamp(1.2 - this.particles.length / 2000, 0.6, 1), threshold: 0.76 - night * 0.1, ca: this.caPulse * (this.settings.flashes ? 1 : 0.3), vig: 0.55 + night * 0.25,
          grain: hi ? 0.035 : 0.02, flash: this.flash, dmg: this.dmgFlash, dof: hi ? 0.65 : 0, sat: 1.12,
        });
      } else {
        const g = this.direct || (this.direct = this.canvas.getContext('2d'));
        if (g) g.drawImage(this.scene, 0, 0);
      }
    }

    drawAmbient(g, game, time) {
      const B = this.biome;
      if (this.voidPath) { // clouds drifting in the sky gaps
        g.save(); g.clip(this.voidPath);
        for (const c of this.clouds) { c.x += c.s * 0.016; if (c.x - c.r > W) c.x = -c.r; glowAt(g, '#cfe4ff', c.x, c.y, c.r, 0.16); }
        g.restore();
      }
      if (this.lavaPath) {
        g.save(); g.clip(this.lavaPath); g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < this.lavaTiles.length; k += 2) { const i = this.lavaTiles[k]; const x = (i % D.COLS) * T + T / 2, y = ((i / D.COLS) | 0) * T + T / 2; glowAt(g, '#ffcf5a', x + Math.sin(time + k) * 12, y + Math.cos(time * 0.7 + k) * 12, 40, 0.25 + Math.sin(time * 2 + k) * 0.1); }
        g.restore();
        if (Math.random() < 0.3 && this.lavaTiles.length) { const i = this.lavaTiles[U.randi(0, this.lavaTiles.length - 1)]; this.p({ x: (i % D.COLS) * T + U.rand(0, T), y: ((i / D.COLS) | 0) * T + U.rand(0, T), vx: U.rand(-10, 10), vy: U.rand(-60, -20), life: U.rand(1, 2), size: U.rand(1.5, 3), color: '#ffb36b', kind: 'ember', add: true, drag: 0.3 }); }
      }
      if (game.map.water) { // river glints & flood
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const line of game.map.water) { const [a, b] = line; for (let k = 0; k < 7; k++) { const f = ((time * 0.12 + k / 7) % 1); const x = (a[0] + 0.5) * T + Math.sin(time * 2 + k) * 10, y = U.lerp(a[1] * T, (b[1] + 1) * T, f); glowAt(g, '#bfefff', x, y, 7, 0.4); } }
        if (game.floodAmt > 0) for (const i of game.floodSet) { const x = (i % D.COLS) * T + T / 2, y = ((i / D.COLS) | 0) * T + T / 2; g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(52,140,170,${0.62 * game.floodAmt})`; g.fillRect(x - T / 2 - 1, y - T * 0.42, T + 2, T * 0.84); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(190,240,255,${0.3 * game.floodAmt})`; g.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const yy = y - 18 + k * 18 + Math.sin(time * 2 + i + k) * 3; g.beginPath(); g.moveTo(x - 24, yy); g.quadraticCurveTo(x, yy - 5, x + 24, yy); g.stroke(); } }
        g.restore();
      }
      this.drawCritters(g, game, time);
      this.drawWeather(g, game, time);
      // god rays (verdant & sky)
      if (game.map.biome === 'verdant' || game.map.biome === 'sky') {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 5; k++) {
          const x = ((k * 431 + time * 12) % (W + 600)) - 300;
          const gr = g.createLinearGradient(x, 0, x + 300, H);
          const a = 0.04 + Math.sin(time * 0.5 + k) * 0.02;
          gr.addColorStop(0, `rgba(255,250,210,${a})`); gr.addColorStop(1, 'rgba(255,250,210,0)');
          g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 120, 0); g.lineTo(x + 520, H); g.lineTo(x + 300, H); g.closePath(); g.fill();
        }
        g.restore();
      }
      if (game.map.biome === 'neon') { // scanning beam
        g.save(); g.globalCompositeOperation = 'lighter';
        const yy = (time * 90) % (H + 200) - 100;
        const gr = g.createLinearGradient(0, yy - 60, 0, yy + 60); gr.addColorStop(0, 'rgba(0,229,255,0)'); gr.addColorStop(0.5, 'rgba(0,229,255,0.06)'); gr.addColorStop(1, 'rgba(0,229,255,0)');
        g.fillStyle = gr; g.fillRect(0, yy - 60, W, 120);
        g.restore();
      }
      // drifting motes / pollen / ash
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const m of this.motes) {
        m.ph += 0.016 * m.s;
        const mx = (m.x + Math.sin(m.ph) * 30 + time * 8 * m.s) % W, my = (m.y + Math.cos(m.ph * 0.7) * 20 - (game.map.biome === 'cinder' ? time * 20 * m.s : 0) % H + H) % H;
        glowAt(g, B.mote, mx, my, 6 * m.s, 0.25 + Math.sin(m.ph * 3) * 0.15);
      }
      g.restore();
    }
    drawWeather(g, game, time) {
      const b = game.map.biome;
      // slow cloud / smoke shadows sweeping the battlefield
      if (b !== 'neon') {
        g.save();
        for (let k = 0; k < 4; k++) {
          const x = ((k * 613 + time * (14 + k * 3)) % (W + 900)) - 450, y = ((k * 389 + time * 6) % (H + 600)) - 300, r = 260 + k * 50;
          const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,10,${b === 'cinder' ? 0.16 : 0.11})`); gr.addColorStop(1, 'rgba(0,0,10,0)');
          g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.restore();
      }
      if (b === 'neon') { // acid rain
        g.save(); g.strokeStyle = 'rgba(170,230,255,0.22)'; g.lineWidth = 1.2; g.beginPath();
        for (let i = 0; i < 110; i++) { const x = ((i * 137.3 + time * 90) % (W + 100)) - 50, y = ((i * 251.7 + time * 950) % (H + 60)) - 30; g.moveTo(x, y); g.lineTo(x - 5, y + 18); }
        g.stroke(); g.restore();
        if (Math.random() < 0.5) this.p({ x: Math.random() * W, y: Math.random() * H, kind: 'ring', r0: 1, r1: 9, color: '#9fe8ff', life: 0.35, w: 1, add: true });
      } else if (b === 'sky') { // wind streaks
        g.save(); g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1.5; g.beginPath();
        for (let i = 0; i < 14; i++) { const x = ((i * 491 + time * 520) % (W + 600)) - 300, y = (i * 173.1) % H + Math.sin(time + i) * 20; g.moveTo(x, y); g.quadraticCurveTo(x + 90, y - 6, x + 180, y); }
        g.stroke(); g.restore();
      } else if (b === 'verdant' && Math.random() < 0.06) {
        this.p({ x: Math.random() * W, y: -10, vx: U.rand(10, 40), vy: U.rand(25, 50), life: 9, size: U.rand(3, 5), color: Math.random() < 0.5 ? '#6aa84f' : '#c9b04a', kind: 'leaf', add: false, drag: 0, grav: 0, rot: Math.random() * 6, vr: U.rand(-2, 2) });
      }
    }
    buildForeground(game) {
      // painted foreground framing for the screen's side columns (blurred = shallow depth of field)
      const b = game.map.biome, w = 420, h = 1100;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); const rr = U.rng(U.hashStr(game.map.id + 'fg'));
      g.filter = 'blur(2.5px)';
      if (b === 'verdant') {
        for (let k = 0; k < 26; k++) { const x = rr.range(-60, 260), y = rr.range(-40, h + 40); g.save(); g.translate(x, y); g.rotate(rr.range(-1.2, 1.2)); g.fillStyle = rr.pick(['#0b2414', '#0e2e19', '#123a1f', '#081a0e']); g.beginPath(); g.ellipse(0, 0, rr.range(60, 130), rr.range(18, 34), 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(140,220,140,0.18)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-90, 0); g.lineTo(90, 0); g.stroke(); g.restore(); }
        g.strokeStyle = '#0a1d10'; g.lineWidth = 5; for (let k = 0; k < 5; k++) { const x = rr.range(40, 300); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 30, 200, x - 30, 400, x + rr.range(-20, 20), rr.range(300, 700)); g.stroke(); }
      } else if (b === 'sky') {
        for (let k = 0; k < 22; k++) { const x = rr.range(-80, 260), y = rr.range(h * 0.45, h + 60), r = rr.range(50, 110); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(22,40,80,0.8)'); gr.addColorStop(1, 'rgba(22,40,80,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
        g.fillStyle = '#1d2f55'; g.beginPath(); g.moveTo(0, 120); g.lineTo(160, 160); g.lineTo(120, 300); g.lineTo(40, 420); g.lineTo(0, 400); g.fill();
      } else if (b === 'neon') {
        for (let k = 0; k < 7; k++) { const x = k * 60 - 30, bw = rr.range(50, 90), top = rr.range(80, 500); g.fillStyle = '#07051a'; g.fillRect(x, top, bw, h - top); for (let wy = top + 10; wy < h; wy += 14) for (let wx = x + 6; wx < x + bw - 6; wx += 12) if (rr() < 0.3) { g.fillStyle = rr() < 0.6 ? 'rgba(0,229,255,0.45)' : 'rgba(255,61,242,0.45)'; g.fillRect(wx, wy, 5, 4); } if (rr() < 0.6) { g.fillStyle = rr.pick(['#ff3df2', '#00e5ff', '#ffe14d']); g.fillRect(x + bw - 10, top + 20, 6, rr.range(60, 160)); } }
        g.strokeStyle = '#05040e'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 40 + k * 30); g.quadraticCurveTo(220, 120 + k * 40, 420, 60 + k * 25); g.stroke(); }
      } else {
        for (let k = 0; k < 9; k++) { const x = rr.range(-40, 300), hh = rr.range(160, 520); g.fillStyle = '#0c0606'; g.beginPath(); g.moveTo(x - 60, h); g.lineTo(x - 10, h - hh); g.lineTo(x + 15, h - hh * 0.8); g.lineTo(x + 60, h); g.fill(); g.strokeStyle = 'rgba(255,110,40,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 20, h - 20); g.lineTo(x - 5, h - hh * 0.5); g.stroke(); }
        const gr = g.createLinearGradient(0, h - 200, 0, h); gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(1, 'rgba(255,90,20,0.35)'); g.fillStyle = gr; g.fillRect(0, h - 200, w, 200);
      }
      return c;
    }
    drawForeground(g, game, time) {
      if (!this.fg) this.fg = this.buildForeground(game);
      const cw = this.scene.width, ch = this.scene.height, px = this.pxScale;
      const [vx] = this.viewCenter(); const s = this.scale * this.cam.zoom;
      const mapL = vx - this.cam.x * s, mapR = mapL + W * s;
      const par = (this.cam.x - W / 2) * s * 0.25;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      const h = ch, w = this.fg.width * (h / this.fg.height);
      const lw = Math.max(0, mapL + 40 * px), rw = Math.max(0, cw - mapR + 40 * px);
      if (lw > 30) { g.globalAlpha = 0.95; g.drawImage(this.fg, lw - w - par, 0, w, h); }
      if (rw > 30) { g.save(); g.translate(cw - rw + w - par, 0); g.scale(-1, 1); g.globalAlpha = 0.95; g.drawImage(this.fg, 0, 0, w, h); g.restore(); }
      g.restore();
    }
    drawCritters(g, game, time) {
      const b = game.map.biome;
      if (!this.critters) this.critters = [];
      if (this.critters.length < 6 && Math.random() < 0.004) {
        const fromLeft = Math.random() < 0.5, y = U.rand(100, H - 100);
        const kind = b === 'neon' ? 'drone' : b === 'cinder' ? 'ember' : (Math.random() < 0.6 ? 'bird' : 'butterfly');
        const n = kind === 'bird' ? U.randi(3, 6) : 1;
        for (let k = 0; k < n; k++) this.critters.push({ kind, x: fromLeft ? -40 - k * 26 : W + 40 + k * 26, y: y + (k % 2 ? 1 : -1) * k * 12, vx: (fromLeft ? 1 : -1) * U.rand(70, 110), ph: Math.random() * 6 });
      }
      for (const c of this.critters) {
        c.x += c.vx * 0.016; c.ph += 0.016;
        const y = c.y + Math.sin(c.ph * 1.3) * 12;
        if (c.kind === 'bird') { const f = Math.sin(c.ph * 12) * 5; g.strokeStyle = 'rgba(20,25,30,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(c.x - 8, y - f); g.lineTo(c.x, y); g.lineTo(c.x + 8, y - f); g.stroke(); g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(c.x + 30, y + 70, 6, 2, 0, 0, TAU); g.fill(); }
        else if (c.kind === 'butterfly') { const f = Math.abs(Math.sin(c.ph * 14)); g.fillStyle = '#ffd96a'; g.beginPath(); g.ellipse(c.x - 3, y, 3 * f + 1, 4, 0, 0, TAU); g.ellipse(c.x + 3, y, 3 * f + 1, 4, 0, 0, TAU); g.fill(); }
        else if (c.kind === 'drone') { g.fillStyle = '#2a2448'; g.fillRect(c.x - 7, y - 3, 14, 6); g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, Math.sin(c.ph * 8) > 0 ? '#ff3df2' : '#00e5ff', c.x, y, 10, 0.8); g.restore(); }
        else { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, '#ffb36b', c.x, y, 8, 0.5); g.restore(); }
      }
      this.critters = this.critters.filter(c => c.x > -300 && c.x < W + 300);
    }
    drawMapFeatures(g, game, time) {
      const B = this.biome;
      // ley nodes
      g.save();
      for (let i = 0; i < game.ley.length; i++) if (game.ley[i]) {
        const x = (i % D.COLS) * T + T / 2, y = ((i / D.COLS) | 0) * T + T / 2;
        const occ = game.occ[i];
        if (game.leyDrain && game.leyDrain[i] > 0) { g.strokeStyle = 'rgba(120,90,160,0.6)'; g.lineWidth = 2; g.setLineDash([3, 6]); g.beginPath(); g.ellipse(x, y + 4, 24, 13, 0, 0, TAU); g.stroke(); g.setLineDash([]); continue; }
        g.strokeStyle = U.rgba(B.accent, 0.8 + Math.sin(time * 2 + i) * 0.15); g.lineWidth = 3;
        g.beginPath(); g.ellipse(x, y + 4, 24, 13, 0, 0, TAU); g.stroke();
        g.save(); g.translate(x, y + 4); g.scale(1, 0.55); g.rotate(time * 0.4);
        for (let k = 0; k < 6; k++) { g.rotate(TAU / 6); g.fillStyle = U.rgba(B.accent, 0.7); g.fillRect(16, -2, 6, 4); }
        g.restore();
        g.globalCompositeOperation = 'lighter';
        glowAt(g, B.accent, x, y, occ ? 38 : 34, 0.5 + Math.sin(time * 2 + i) * 0.12);
        if (!occ) { for (let k = 0; k < 2; k++) { const a = time * 1.5 + k * Math.PI; glowAt(g, '#ffffff', x + Math.cos(a) * 10, y - 10 - ((time * 20 + k * 15) % 30), 4, 0.6); } }
        if (game.map.lumen && game.nightAmt > 0) glowAt(g, '#bfe6ff', x, y, 2.6 * T, 0.12 * game.nightAmt);
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
      // vents
      for (const v of game.vents) {
        const warn = v.t < 1.5 ? 1 - v.t / 1.5 : 0;
        if (false) { g.strokeStyle = U.rgba('#ffb36b', 0.35 + Math.sin(time * 3) * 0.2); g.lineWidth = 2; g.setLineDash([5, 6]); g.beginPath(); g.ellipse(v.x, v.y + 4, 30, 18, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
        g.fillStyle = '#1a0e0c'; g.beginPath(); g.ellipse(v.x, v.y + 4, 22, 13, 0, 0, TAU); g.fill();
        g.fillStyle = '#3a221c'; g.beginPath(); g.ellipse(v.x, v.y + 4, 26, 15, 0, 0, TAU); g.lineWidth = 6; g.strokeStyle = '#3a221c'; g.stroke();
        g.save(); g.globalCompositeOperation = 'lighter';
        glowAt(g, '#ff5a1f', v.x, v.y + 2, 22 + warn * 30, 0.5 + warn * 0.5 + Math.sin(time * 3 + v.x) * 0.1);
        if (warn > 0) { g.strokeStyle = U.rgba('#ff7a2a', 0.3 + warn * 0.5); g.lineWidth = 3; g.setLineDash([8, 8]); g.beginPath(); g.arc(v.x, v.y, 1.7 * T, 0, TAU); g.stroke(); g.setLineDash([]); }
        g.restore();
        if (Math.random() < 0.05 + warn * 0.4) this.p({ x: v.x + U.rand(-8, 8), y: v.y, vx: U.rand(-15, 15), vy: U.rand(-60, -30), life: 1.2, size: U.rand(6, 12), color: '#4a3a36', kind: 'smoke', add: false, drag: 0.4 });
      }
      // molten trail (Magmaw)
      if (game.molten) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < game.molten.length; i++) if (game.molten[i] > 0) { const a = Math.min(1, game.molten[i] / 3); const x = (i % D.COLS) * T + T / 2, y = ((i / D.COLS) | 0) * T + T / 2; glowAt(g, '#ff5a1f', x, y, T * 0.75, 0.55 * a); glowAt(g, '#ffcf5a', x + Math.sin(time * 3 + i) * 8, y, T * 0.3, 0.4 * a); if (Math.random() < 0.05 * a) this.p({ x: x + U.rand(-20, 20), y: y + U.rand(-20, 20), vx: 0, vy: -40, life: 0.8, size: 2, color: '#ffb36b', kind: 'ember', add: true }); }
        g.restore();
      }
      // bridges
      for (const b of game.bridges) {
        for (const i of b.tiles) {
          const x = (i % D.COLS) * T, y = ((i / D.COLS) | 0) * T;
          if (b.night) {
            const a = b.anim;
            if (a <= 0.01) { g.strokeStyle = 'rgba(0,229,255,0.18)'; g.setLineDash([4, 6]); g.strokeRect(x + 8, y + 8, T - 16, T - 16); g.setLineDash([]); continue; }
            g.save(); g.globalCompositeOperation = 'lighter';
            g.fillStyle = `rgba(0,229,255,${0.18 * a})`; g.fillRect(x + 6, y, T - 12, T);
            g.strokeStyle = `rgba(0,229,255,${0.8 * a})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + 6, y + T); g.moveTo(x + T - 6, y); g.lineTo(x + T - 6, y + T); g.stroke();
            for (let k = 0; k < 3; k++) { const yy = y + ((time * 60 + k * 21) % T); g.fillStyle = `rgba(255,61,242,${0.6 * a})`; g.fillRect(x + 10, yy, T - 20, 2); }
            g.restore();
          } else {
            if (this.painted && b.anim < 1) { g.fillStyle = `rgba(13,31,69,${(1 - b.anim) * 0.95})`; g.fillRect(x - 1, y, T + 2, T); }
            if (b.anim > 0.02) R.drawPlanks(g, x, y + (1 - b.anim) * 30, true, b.anim);
            if (b.anim < 1) { g.fillStyle = '#5a4430'; g.fillRect(x - 2, y + 2, 8, T - 4); g.fillRect(x + T - 6, y + 2, 8, T - 4); }
          }
        }
        if (!b.night) { // lever/indicator
          g.save(); g.globalCompositeOperation = 'lighter';
          const ready = b.up && b.cd <= 0;
          glowAt(g, ready ? '#9fe8ff' : '#ff9a4a', b.x, b.y, 26, 0.35 + (ready ? Math.sin(time * 4) * 0.15 : 0));
          g.restore();
          if (!b.up) { g.fillStyle = '#ffffff'; g.font = 'bold 14px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillText(Math.ceil(b.timer) + 's', b.x, b.y + 5); }
        }
      }
      // spawn portals
      const portals = game.spawns.concat(game.airSpawns || []);
      for (const sp of portals) {
        const x = sp.c * T + T / 2, y = sp.r * T + T / 2;
        g.save(); g.translate(x, y);
        g.globalCompositeOperation = 'lighter';
        glowAt(g, '#ff4d6a', 0, 0, 56, 0.5 + Math.sin(time * 3) * 0.15);
        for (let k = 0; k < 3; k++) { g.rotate(time * (k % 2 ? -1.4 : 1)); g.strokeStyle = `rgba(255,${80 + k * 40},120,0.7)`; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 18 + k * 7, 0, 4); g.stroke(); }
        g.restore();
      }
    }
    drawRoutes(g, game, time, state) {
      const prep = !game.waveActive && game.enemies.length === 0;
      const a = prep ? 0.55 : 0.18;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < game.routes.length; k++) {
        const r = game.routes[k];
        const draw = (route, col) => {
          for (let i = 0; i < route.length - 1; i++) {
            const phase = ((i - time * 3) % 3 + 3) % 3;
            if (phase > 1) continue;
            const t0 = route[i], t1 = route[i + 1];
            const x0 = (t0 % D.COLS) * T + T / 2, y0 = ((t0 / D.COLS) | 0) * T + T / 2, x1 = (t1 % D.COLS) * T + T / 2, y1 = ((t1 / D.COLS) | 0) * T + T / 2;
            const ang = Math.atan2(y1 - y0, x1 - x0);
            g.save(); g.translate((x0 + x1) / 2, (y0 + y1) / 2); g.rotate(ang);
            g.strokeStyle = U.rgba(col, a * (1 - phase)); g.lineWidth = 3; g.beginPath(); g.moveTo(-6, -8); g.lineTo(4, 0); g.lineTo(-6, 8); g.stroke();
            g.restore();
          }
        };
        draw(r.plain, '#ffffff');
        if (r.smart.join() !== r.plain.join()) draw(r.smart, '#ffb36b');
      }
      g.restore();
    }
    drawSynergies(g, game, time, state) {
      if (!game.synLinks) return;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const l of game.synLinks) {
        const A = l.a, B = l.b;
        const ca = D.ELEMENTS[l.syn.a].color, cb = D.ELEMENTS[l.syn.b].color;
        const hot = state && state.selected && (state.selected === A || state.selected === B);
        const gr = g.createLinearGradient(A.x, A.y, B.x, B.y); gr.addColorStop(0, U.rgba(A.def.element === l.syn.a ? ca : cb, hot ? 0.7 : 0.28)); gr.addColorStop(1, U.rgba(B.def.element === l.syn.a ? ca : cb, hot ? 0.7 : 0.28));
        g.strokeStyle = gr; g.lineWidth = hot ? 3 : 2; g.setLineDash([6, 8]); g.lineDashOffset = -time * 30;
        g.beginPath(); g.moveTo(A.x, A.y + 2); g.lineTo(B.x, B.y + 2); g.stroke(); g.setLineDash([]);
        const k = (time * 0.6 + (A.uid * 0.37)) % 1;
        glowAt(g, '#ffffff', U.lerp(A.x, B.x, k), U.lerp(A.y, B.y, k), 7, hot ? 0.9 : 0.5);
      }
      g.restore();
    }
    drawGroundLight(g, game, time) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const t of game.towers) {
        const off = t.disabledT > 0 || t.burnoutT > 0;
        if (off) continue;
        const pulse = 0.16 + Math.sin(time * 2.1 + t.uid) * 0.04 + (t.overclockT > 0 ? 0.12 : 0) + (t.level >= 3 ? 0.06 : 0);
        glowAt(g, t.def.color, t.x, t.y + 8, 62 + t.level * 8, pulse);
      }
      for (const p of game.projectiles) if (p.kind === 'shell') glowAt(g, '#ff7a2a', p.x, p.y, 30, 0.08);
      for (const w of game.wells) glowAt(g, '#b45cff', w.x, w.y, w.r * 1.4, 0.2);
      if (game.boss) glowAt(g, game.boss.type === 'magmaw' ? '#ff5a1f' : '#7a5cff', game.boss.x, game.boss.y + 10, 150, 0.25);
      g.restore();
    }
    drawNexus(g, game, time) {
      const x = game.nexus.x, y = game.nexus.y;
      const hp = game.lives / game.maxLives;
      const col = hp > 0.5 ? '#9fe8ff' : hp > 0.25 ? '#ffd96a' : '#ff5d5d';
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x + 4, y + 26, 56, 20, 0, 0, TAU); g.fill();
      g.fillStyle = '#2a3050'; poly(g, x, y + 14, 50, 8, Math.PI / 8); g.fill();
      g.fillStyle = '#3c4570'; poly(g, x, y + 8, 46, 8, Math.PI / 8); g.fill();
      g.strokeStyle = U.rgba(col, 0.8); g.lineWidth = 2; poly(g, x, y + 8, 46, 8, Math.PI / 8); g.stroke();
      // spires
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; const sx = x + Math.cos(a) * 32, sy = y + 6 + Math.sin(a) * 18; g.fillStyle = '#4a5590'; g.beginPath(); g.moveTo(sx - 6, sy); g.lineTo(sx, sy - 40 - (k % 2) * 10); g.lineTo(sx + 6, sy); g.fill(); g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, col, sx, sy - 40 - (k % 2) * 10, 12, 0.7); g.restore(); }
      const bob = Math.sin(time * 1.6) * 5;
      const cg = g.createLinearGradient(x, y - 70, x, y);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, col); cg.addColorStop(1, U.shade(col, -0.5));
      g.fillStyle = cg; diamond(g, x, y - 34 + bob, 18, 34); g.fill();
      g.save(); g.translate(x, y - 34 + bob); g.rotate(time * 0.8); g.strokeStyle = U.rgba(col, 0.8); g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 34, 12, 0, 0, TAU); g.stroke(); g.restore();
      g.globalCompositeOperation = 'lighter'; glowAt(g, col, x, y - 34 + bob, 80 + Math.sin(time * 3) * 6, 0.55);
      g.restore();
    }
    drawActionCues(g, game, time) {
      // pulsing ⚡ markers wherever a player-triggered map action is affordable and ready
      const cue = (x, y, col) => {
        const p = 0.55 + Math.sin(time * 3.2) * 0.25;
        g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, col, x, y, 36, p * 0.8); g.restore();
        g.strokeStyle = U.rgba(col, 0.5 * (1 - ((time * 0.8) % 1))); g.lineWidth = 3; g.beginPath(); g.arc(x, y, 17 + ((time * 0.8) % 1) * 22, 0, TAU); g.stroke(); // expanding beacon
        g.fillStyle = 'rgba(8,10,26,0.92)'; g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
        g.strokeStyle = U.rgba(col, p + 0.3); g.lineWidth = 3; g.beginPath(); g.arc(x, y, 16 + Math.sin(time * 3.2) * 2, 0, TAU); g.stroke();
        g.fillStyle = col; g.font = 'bold 19px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚡', x, y + 1);
      };
      if (game.wave === 0) return;
      for (const v of game.vents) if (!(v.cd > 0) && game.gold >= game.actionCost('vent')) cue(v.x, v.y - 30, '#ffb36b');
      if (game.map.flood && !(game.sluiceCd > 0) && !(game.floodForceT > 0) && game.gold >= game.actionCost('sluice')) { const [c, r] = game.map.flood.tiles[2]; cue(game.cx(c), game.cx(r) - 40, '#7fe3ff'); }
      for (const b of game.bridges) if (b.night && game.isNight && b.up && !(b.sealCd > 0) && game.gold >= game.actionCost('seal')) cue(b.x, b.y, '#ff3df2');
    }
    drawAbilityHints(g, game, time) {
      for (const t of game.towers) {
        if (!game.abilityReady(t)) continue;
        const y = t.y - 62 + Math.sin(time * 4 + t.uid) * 2;
        g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, t.def.color, t.x, y, 13, 0.6); g.restore();
        g.strokeStyle = t.def.color; g.lineWidth = 2; g.beginPath(); g.arc(t.x, y, 7, 0, TAU); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(t.x, y, 2.5, 0, TAU); g.fill();
      }
    }
    drawProjectiles(g, game, time) {
      g.save();
      for (const p of game.projectiles) {
        if (p.kind === 'bolt') {
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = U.rgba(p.color, 0.5); g.lineWidth = p.crit ? 5 : 3; g.beginPath();
          const tr = p.trail; if (tr.length) { g.moveTo(tr[0][0], tr[0][1]); for (const q of tr) g.lineTo(q[0], q[1]); g.lineTo(p.x, p.y); g.stroke(); }
          glowAt(g, p.crit ? '#ffffff' : p.color, p.x, p.y, p.crit ? 13 : 8, 0.75);
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x, p.y, 2.5, 0, TAU); g.fill();
        } else if (p.kind === 'shell' || p.kind === 'bomblet') {
          g.globalCompositeOperation = 'source-over';
          const h = p.h || 0, sz = p.kind === 'bomblet' ? 4 : (p.big ? 10 : 7);
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(p.x, p.y, sz, sz * 0.4, 0, 0, TAU); g.fill();
          g.fillStyle = '#3a2420'; g.beginPath(); g.arc(p.x, p.y - h, sz, 0, TAU); g.fill();
          g.globalCompositeOperation = 'lighter'; glowAt(g, '#ff7a2a', p.x, p.y - h, sz * 3, 0.8);
          if (Math.random() < 0.15) this.p({ x: p.x, y: p.y - h, vx: U.rand(-10, 10), vy: U.rand(-10, 10), life: 0.4, size: U.rand(2, 4), color: '#ffb36b', kind: 'glow', add: true });
          if (p.kind === 'shell') { const k = Math.min(1, p.t / p.dur); g.strokeStyle = U.rgba('#ff7a2a', 0.25 * k); g.lineWidth = 2; g.beginPath(); g.arc(p.tx, p.ty, (p.s ? p.s.splash : 1) * T * (1.2 - k * 0.2), 0, TAU); g.stroke(); }
        } else if (p.kind === 'meteor') {
          const k = p.t / p.dur;
          const mx = p.x + (1 - k) * 260, my = p.y - (1 - k) * 640;
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = 'rgba(255,160,80,0.6)'; g.lineWidth = 16 * k + 4; g.beginPath(); g.moveTo(mx + 120, my - 300); g.lineTo(mx, my); g.stroke();
          glowAt(g, '#ffcf8a', mx, my, 40 + k * 20, 1);
          g.strokeStyle = U.rgba('#ff6a2b', 0.5 + k * 0.5); g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, 1.9 * T * (1 - k * 0.3), 0, TAU); g.stroke();
        }
      }
      g.restore();
    }
    drawWells(g, game, time) {
      g.save();
      for (const w of game.wells) {
        const grow = Math.min(1, w.t / 0.25) * (w.t > w.dur - 0.3 ? Math.max(0, (w.dur - w.t) / 0.3) : 1);
        const r = w.r * grow;
        g.globalCompositeOperation = 'source-over';
        const gr = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, r);
        gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.35, 'rgba(30,0,50,0.7)'); gr.addColorStop(1, 'rgba(80,20,140,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(w.x, w.y, r, 0, TAU); g.fill();
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) { g.strokeStyle = U.rgba(k ? '#ff7ae0' : '#b45cff', 0.6); g.lineWidth = 2; g.beginPath(); const a0 = time * (4 + k) + k * 2; g.arc(w.x, w.y, r * (0.4 + k * 0.2), a0, a0 + 3.5); g.stroke(); }
        if (Math.random() < 0.6) { const a = Math.random() * TAU; this.p({ x: w.x + Math.cos(a) * r, y: w.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2, vy: -Math.sin(a) * r * 2, life: 0.4, size: 2.5, color: '#d9a8ff', kind: 'glow', add: true }); }
      }
      g.restore();
    }
    drawZaps(g, game, time) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const z of game.zaps) {
        const a = Math.min(1, z.t * 6);
        if (z.beam) {
          const [p0, p1] = z.pts;
          g.strokeStyle = U.rgba(z.color, 0.16 * a); g.lineWidth = z.w * 2.2; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
          g.strokeStyle = U.rgba('#ffffff', 0.95 * a); g.lineWidth = z.w * 0.6; g.stroke();
        } else if (z.vine) {
          const [p0, p1] = z.pts; g.strokeStyle = U.rgba('#4fbf4f', a); g.lineWidth = 3; g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo((p0[0] + p1[0]) / 2 + 20, (p0[1] + p1[1]) / 2 - 30, p1[0], p1[1]); g.stroke();
        } else {
          g.strokeStyle = U.rgba(z.color, 0.4 * a); g.lineWidth = z.w * 3; jag(g, z.pts, 12, time * 7); g.stroke();
          g.strokeStyle = U.rgba('#ffffff', 0.9 * a); g.lineWidth = z.w * 0.6; g.stroke();
          for (const q of z.pts) glowAt(g, z.color, q[0], q[1], 11, 0.45 * a);
        }
      }
      // continuous ion beams
      for (const t of game.towers) {
        if (!t.s.beam || !t.beamTarget || t.beamTarget.dead || t.disabledT > 0 || t.burnoutT > 0) continue;
        const e = t.beamTarget; const ramp = (t.beamRamp || 1) / (t.s.rampMax || 3);
        const x0 = t.x, y0 = t.y - 44;
        g.strokeStyle = U.rgba('#a68bff', 0.3 + ramp * 0.3); g.lineWidth = 6 + ramp * 10; g.beginPath(); g.moveTo(x0, y0); g.lineTo(e.x, e.y); g.stroke();
        g.strokeStyle = U.rgba('#ffffff', 0.8); g.lineWidth = 2 + ramp * 3; g.stroke();
        glowAt(g, '#d2c2ff', e.x, e.y, 18 + ramp * 16, 0.8);
        if (t.beamExtra) for (const o of t.beamExtra) { g.strokeStyle = U.rgba('#a68bff', 0.5); g.lineWidth = 3; g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(o.x, o.y); g.stroke(); }
        if (Math.random() < 0.4) this.burst(e.x, e.y, 1, '#d2c2ff', { max: 160, life: 0.25 });
      }
      g.restore();
    }
    drawParticles(g, time, layer) {
      g.save();
      // adaptive additive budget: the busier the screen, the softer each glow, so enemies stay readable
      const addK = U.clamp(1.15 - this.particles.length / 1000, 0.35, 1);
      for (const p of this.particles) {
        const under = UNDER[p.kind] === 1;
        if ((layer === 'under') !== under) continue;
        const k = p.life / p.max * (p.add ? addK : 1);
        g.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
        switch (p.kind) {
          case 'spark': {
            g.strokeStyle = U.rgba(p.color, k); g.lineWidth = p.size * 0.6 * k + 0.5;
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g.stroke();
            break;
          }
          case 'glow': case 'ember': glowAt(g, p.color, p.x, p.y, p.size * 3 * (0.5 + k * 0.5), k); break;
          case 'flare': glowAt(g, p.color, p.x, p.y, p.size * (1.2 - k * 0.4), k); break;
          case 'smoke': g.globalAlpha = k * 0.5; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU); g.fill(); g.globalAlpha = 1; break;
          case 'shard': case 'leaf': case 'plank': {
            g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, k * 2); g.fillStyle = p.color;
            if (p.kind === 'shard') { g.beginPath(); g.moveTo(0, -p.size); g.lineTo(p.size * 0.6, p.size * 0.5); g.lineTo(-p.size * 0.6, p.size * 0.5); g.closePath(); g.fill(); }
            else if (p.kind === 'leaf') { g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); g.fill(); }
            else g.fillRect(-p.size * 2, -p.size * 0.4, p.size * 4, p.size * 0.8);
            g.restore(); break;
          }
          case 'ring': {
            const r = U.lerp(p.r1, p.r0, U.easeOutCubic(k));
            g.strokeStyle = U.rgba(p.color, k * 0.9); g.lineWidth = p.w * k + 0.5; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke(); break;
          }
          case 'plus': g.fillStyle = U.rgba(p.color, k); p.y -= 0.6; g.fillRect(p.x - 1.5, p.y - p.size, 3, p.size * 2); g.fillRect(p.x - p.size, p.y - 1.5, p.size * 2, 3); break;
          case 'target': {
            g.strokeStyle = U.rgba(p.color, 0.8 * Math.min(1, k * 2)); g.lineWidth = 3; g.setLineDash([10, 6]); g.lineDashOffset = time * 40;
            g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.stroke(); g.setLineDash([]);
            g.beginPath(); g.moveTo(p.x - 12, p.y); g.lineTo(p.x + 12, p.y); g.moveTo(p.x, p.y - 12); g.lineTo(p.x, p.y + 12); g.stroke(); break;
          }
          case 'beamUp': { const gr = g.createLinearGradient(p.x, p.y - 160, p.x, p.y + 20); gr.addColorStop(0, U.rgba(p.color, 0)); gr.addColorStop(1, U.rgba(p.color, 0.5 * k)); g.fillStyle = gr; g.fillRect(p.x - p.size * k, p.y - 160, p.size * 2 * k, 180); break; }
          case 'corpse': {
            const sz = p.size * 2.85 * (1 + (1 - k) * 0.5), ar = p.img.width / p.img.height, w = ar >= 1 ? sz : sz * ar, h = ar >= 1 ? sz / ar : sz;
            g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = k * k;
            g.drawImage(p.img, -w / 2, -h / 2, w, h);
            g.globalCompositeOperation = 'lighter'; g.globalAlpha = k * 0.8; g.drawImage(p.img, -w / 2, -h / 2, w, h);
            g.restore(); break;
          }
          case 'fallBody': { g.globalAlpha = k; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y + (1 - k) * 40, p.size * k, 0, TAU); g.fill(); g.globalAlpha = 1; break; }
        }
      }
      g.restore();
    }
    drawNight(g, game, time, s, vx, vy, sx, sy) {
      const n = game.nightAmt;
      if (n <= 0.01) return;
      const L = this.lg, lw = this.light.width, lh = this.light.height;
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, lw, lh);
      L.fillStyle = `rgba(4,2,20,${0.46 * n})`; L.fillRect(0, 0, lw, lh);
      L.globalCompositeOperation = 'destination-out';
      const q = 0.25;
      L.setTransform(s * q, 0, 0, s * q, (vx - this.cam.x * s + sx) * q, (vy - this.cam.y * s + sy) * q);
      const hole = (x, y, r, a) => { const gr = L.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = gr; L.fillRect(x - r, y - r, r * 2, r * 2); };
      for (const ls of game.lightSources) hole(ls.x, ls.y, ls.r * 1.1, 0.9);
      for (const t of game.towers) hole(t.x, t.y - 20, 90, 0.7);
      for (const p of game.projectiles) hole(p.x, p.y - (p.h || 0), 60, 0.6);
      for (const e of game.enemies) if (game.isVisible(e)) hole(e.x, e.y, e.r * 2.4, 0.55);
      for (const p of game.pools) hole(p.x, p.y, p.r * 1.5, 0.8);
      hole(game.nexus.x, game.nexus.y, 200, 0.9);
      for (const p of this.particles) if (p.kind === 'flare') hole(p.x, p.y, p.size, 0.8 * p.life / p.max);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
      g.drawImage(this.light, 0, 0, this.scene.width, this.scene.height);
      g.restore();
    }
    drawPreviewUnder(g, game, time, st) {
      if (!st) return;
      const sel = st.selected;
      if (sel && !sel.barricade && !sel.dead && sel.s) this.rangeCircle(g, sel.x, sel.y, sel.s.range * T, sel.def.color, time, sel.s.minRange);
      if (st.preview && st.preview.kind === 'tower' && st.preview.info) {
        const p = st.preview, info = p.info;
        // tile grid hint
        g.save(); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
        for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) if (game.buildable(c, r)) g.strokeRect(c * T + 3, r * T + 3, T - 6, T - 6);
        g.restore();
        const col = p.ok ? D.TOWERS[p.id].color : '#ff5050';
        // covered path tiles
        const rr = info.s.range * T;
        g.save();
        for (let i = 0; i < game.type.length; i++) if (game.type[i] === 1) {
          const cx = (i % D.COLS) * T + T / 2, cy = ((i / D.COLS) | 0) * T + T / 2;
          const d2 = U.dist2(p.x, p.y, cx, cy);
          if (d2 <= rr * rr && (!info.s.minRange || d2 >= (info.s.minRange * T) ** 2)) { g.fillStyle = U.rgba(col, 0.13); g.fillRect(cx - T / 2 + 2, cy - T / 2 + 2, T - 4, T - 4); }
        }
        g.restore();
        this.rangeCircle(g, p.x, p.y, rr, col, time, info.s.minRange);
        if (info.aura) { g.strokeStyle = 'rgba(255,122,224,0.6)'; g.setLineDash([3, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(info.aura.x, info.aura.y); g.stroke(); g.setLineDash([]); }
        for (const l of info.links) { g.strokeStyle = U.rgba(D.ELEMENTS[l.b.def.element].color, 0.9); g.lineWidth = 3; g.setLineDash([8, 6]); g.lineDashOffset = -time * 40; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(l.b.x, l.b.y); g.stroke(); g.setLineDash([]); }
      }
      if (st.preview && st.preview.kind === 'barricade') {
        const p = st.preview;
        g.fillStyle = p.ok ? 'rgba(201,176,138,0.35)' : 'rgba(255,80,80,0.3)'; g.fillRect(p.c * T + 2, p.r * T + 2, T - 4, T - 4);
      }
      if (st.preview && st.preview.kind === 'rally' && sel) {
        this.rangeCircle(g, sel.x, sel.y, sel.s.range * T, '#6dff8e', time);
      }
      if (st.preview && (st.preview.kind === 'meteor' || st.preview.kind === 'barrage')) {
        const p = st.preview; const r = (p.kind === 'meteor' ? 1.9 : 1.6) * T;
        g.strokeStyle = 'rgba(255,106,43,0.9)'; g.lineWidth = 3; g.setLineDash([10, 6]); g.lineDashOffset = time * 30; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,106,43,0.12)'; g.fill();
      }
      if (st.preview && st.preview.kind === 'relocate') {
        const p = st.preview;
        g.fillStyle = p.ok ? 'rgba(127,227,255,0.25)' : 'rgba(255,80,80,0.3)'; g.fillRect(p.c * T + 2, p.r * T + 2, T - 4, T - 4);
      }
      if (st.hoverBridge) { const b = st.hoverBridge; for (const i of b.tiles) { g.strokeStyle = game.canCollapse(b) ? '#9fe8ff' : '#ff9a4a'; g.lineWidth = 3; g.strokeRect((i % D.COLS) * T + 3, ((i / D.COLS) | 0) * T + 3, T - 6, T - 6); } }
    }
    drawPreviewOver(g, game, time, st) {
      if (!st || !st.preview) return;
      const p = st.preview;
      if (p.kind === 'tower') {
        g.save(); g.globalAlpha = p.ok ? 0.75 : 0.4;
        Draw.tower(g, { def: D.TOWERS[p.id], x: p.x, y: p.y, level: 0, uid: 0, upAnim: 0, angle: -Math.PI / 2 }, time, this.skin, { icon: true });
        g.restore();
      } else if (p.kind === 'barricade') {
        g.save(); g.globalAlpha = p.ok ? 0.7 : 0.35; Draw.barricade(g, { x: p.x, y: p.y, hp: 1, maxHp: 1 }, time); g.restore();
      }
    }
    rangeCircle(g, x, y, r, col, time, minR) {
      g.save();
      g.fillStyle = U.rgba(col, 0.07); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = U.rgba(col, 0.75); g.lineWidth = 2.5; g.setLineDash([12, 8]); g.lineDashOffset = -time * 20;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.setLineDash([]);
      if (minR) { g.strokeStyle = 'rgba(255,90,90,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, minR * T, 0, TAU); g.stroke(); }
      g.restore();
    }
    drawTexts(g) {
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = t.life / t.max;
        const age = 1 - k;
        const pop = age < 0.15 ? U.easeOutBack(age / 0.15) : 1;
        const size = t.size * pop * (t.crit ? 1.1 : 1);
        g.globalAlpha = Math.min(1, k * 3);
        g.font = `${t.dmg ? 700 : 800} ${size}px Rajdhani, 'Segoe UI', sans-serif`;
        g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(t.s, t.x, t.y);
        g.fillStyle = t.color; g.fillText(t.s, t.x, t.y);
      }
      g.restore();
    }
  }

  // ---------------------------------------------------------- icons for UI
  Draw.towerIcon = function (id, skin, size, level, branch) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const s = size / 100;
    g.scale(s, s);
    Draw.tower(g, { def: D.TOWERS[id], x: 50, y: 70, level: level || 0, branch: branch == null ? -1 : branch, uid: 1, upAnim: 0, angle: -Math.PI / 2 }, 1.3, skin, { icon: true });
    return c.toDataURL();
  };
  Draw.barricadeIcon = function (size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); g.scale(size / 84, size / 84);
    Draw.barricade(g, { x: 42, y: 52, hp: 1, maxHp: 1 }, 0);
    return c.toDataURL();
  };
  Draw.enemyIcon = function (type, size) {
    const def = D.ENEMIES[type];
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const r = def.boss ? 30 : Math.max(def.r, 12);
    const s = size / (r * 4.1);
    g.scale(s, s);
    Draw.enemy(g, { def, type, x: r * 2.05, y: r * 2.05 + (def.flying ? 18 : 0), r, anim: 0.4, vx: 1, vy: 0, flying: def.flying, hp: 1, maxHp: 1, shield: 0, uid: 1, phase: 1, elite: false }, 0.5, null, { icon: true });
    return c.toDataURL();
  };

  AS.Draw = Draw;
  AS.View = View;
})(AS);
