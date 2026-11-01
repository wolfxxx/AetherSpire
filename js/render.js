// Aether Spire — renderer core: WebGL post-processing, sprite caches, map backgrounds
(function (AS) {
  'use strict';
  const U = AS.U, D = AS.D, T = U.TILE;
  const R = {};

  // ------------------------------------------------------------ glow sprite cache
  const glowCache = new Map();
  R.glow = function (color, size) {
    const key = color + size;
    let c = glowCache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = size * 2;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size, size, 0, size, size, size);
    gr.addColorStop(0, U.rgba(color, 1)); gr.addColorStop(0.25, U.rgba(color, 0.55)); gr.addColorStop(0.6, U.rgba(color, 0.14)); gr.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, size * 2, size * 2);
    glowCache.set(key, c);
    return c;
  };

  // ------------------------------------------------------------ WebGL post-processing
  const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';
  const FS_BRIGHT = 'precision mediump float;varying vec2 uv;uniform sampler2D t;uniform float th;void main(){vec3 c=texture2D(t,uv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(th,th+0.3,l),1.);}';
  const FS_COPY = 'precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,uv);}';
  const FS_BLUR = 'precision mediump float;varying vec2 uv;uniform sampler2D t;uniform vec2 d;void main(){vec3 c=texture2D(t,uv).rgb*0.227;c+=texture2D(t,uv+d*1.385).rgb*0.316;c+=texture2D(t,uv-d*1.385).rgb*0.316;c+=texture2D(t,uv+d*3.231).rgb*0.07;c+=texture2D(t,uv-d*3.231).rgb*0.07;gl_FragColor=vec4(c,1.);}';
  const FS_COMP = [
    'precision mediump float;varying vec2 uv;',
    'uniform sampler2D sc,bl,bl2,df;uniform float time,bloom,ca,vig,grain,flash,dmg,dof,sat;uniform vec2 res;',
    'void main(){',
    ' vec2 d=uv-0.5;float r2=dot(d,d);',
    ' float k=(0.0009+ca*0.014)*(0.25+r2*2.5);',
    ' vec3 col;col.r=texture2D(sc,uv+d*k).r;col.g=texture2D(sc,uv).g;col.b=texture2D(sc,uv-d*k).b;',
    ' float tilt=smoothstep(0.30,0.5,abs(uv.y-0.5))*dof;',
    ' col=mix(col,texture2D(df,uv).rgb,tilt);',
    ' col+=texture2D(bl,uv).rgb*bloom+texture2D(bl2,uv).rgb*bloom*0.7;',
    ' float l=dot(col,vec3(0.299,0.587,0.114));col=mix(vec3(l),col,sat);',
    ' col=(col-0.5)*1.06+0.5;',
    ' col*=1.0-vig*smoothstep(0.12,0.62,r2*1.5);',
    ' float n=fract(sin(dot(uv*res+fract(time)*91.7,vec2(12.9898,78.233)))*43758.5453);col+=(n-0.5)*grain;',
    ' col+=vec3(flash);',
    ' col=mix(col,vec3(0.9,0.05,0.1),dmg*smoothstep(0.05,0.5,r2*2.0));',
    ' gl_FragColor=vec4(col,1.);',
    '}'].join('\n');

  function Post(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl');
    this.gl = gl; this.canvas = canvas;
    const mk = (fs) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p, u };
    };
    this.pBright = mk(FS_BRIGHT); this.pBlur = mk(FS_BLUR); this.pComp = mk(FS_COMP); this.pCopy = mk(FS_COPY);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.sceneTex = this.tex();
    this.w = 0; this.h = 0;
  }
  Post.prototype.tex = function () {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  Post.prototype.fbo = function (w, h) {
    const gl = this.gl, t = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { f, t, w, h };
  };
  Post.prototype.resize = function (w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const q = 4, e = 8;
    this.A = this.fbo(Math.max(1, w / q | 0), Math.max(1, h / q | 0)); this.B = this.fbo(this.A.w, this.A.h);
    this.C = this.fbo(Math.max(1, w / e | 0), Math.max(1, h / e | 0)); this.Dd = this.fbo(this.C.w, this.C.h);
    this.E = this.fbo(this.A.w, this.A.h); this.F = this.fbo(this.A.w, this.A.h);
  };
  Post.prototype.pass = function (prog, target, setup) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.f); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h); }
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  Post.prototype.bind = function (unit, tex, loc) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
  Post.prototype.render = function (src, o) {
    const gl = this.gl;
    this.resize(src.width, src.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const blur = (from, tmp, to) => {
      this.pass(this.pBlur, tmp, u => { this.bind(0, from.t || from, u.t); gl.uniform2f(u.d, 1 / tmp.w, 0); });
      this.pass(this.pBlur, to, u => { this.bind(0, tmp.t, u.t); gl.uniform2f(u.d, 0, 1 / to.h); });
    };
    if (!o.simple) {
    // bloom: bright pass at 1/4, blur; wider bloom at 1/8
    this.pass(this.pBright, this.A, u => { this.bind(0, this.sceneTex, u.t); gl.uniform1f(u.th, o.threshold); });
    blur(this.A, this.B, this.A);
    blur(this.A, this.B, this.A);
    this.pass(this.pCopy, this.C, u => this.bind(0, this.A.t, u.t));
    blur(this.C, this.Dd, this.C);
    blur(this.C, this.Dd, this.C);
    // dof source: plain downsample + blur
    this.pass(this.pCopy, this.E, u => this.bind(0, this.sceneTex, u.t));
    blur(this.E, this.F, this.E);
    }
    this.pass(this.pComp, null, u => {
      this.bind(0, this.sceneTex, u.sc); this.bind(1, this.A.t, u.bl); this.bind(2, this.C.t, u.bl2); this.bind(3, this.E.t, u.df);
      gl.uniform1f(u.time, o.time); gl.uniform1f(u.bloom, o.bloom); gl.uniform1f(u.ca, o.ca); gl.uniform1f(u.vig, o.vig);
      gl.uniform1f(u.grain, o.grain); gl.uniform1f(u.flash, o.flash); gl.uniform1f(u.dmg, o.dmg); gl.uniform1f(u.dof, o.dof); gl.uniform1f(u.sat, o.sat);
      gl.uniform2f(u.res, this.w, this.h);
    });
  };
  R.Post = Post;

  // ------------------------------------------------------------ background generation
  // ------------------------------------------------------------ painted art (js/assets.js), with procedural fallback
  const Art = R.Art = { img: {}, ready: false, tint: {} };
  Art.load = function () {
    const http = /^https?:$/.test(location.protocol) && AS.ASSET_FILES;
    const fetchBundle = () => new Promise(res => { if (AS.ASSETS) return res(); const s = document.createElement('script'); s.src = 'js/assets.js'; s.onload = s.onerror = () => res(); document.head.appendChild(s); });
    const srcs = () => http ? Object.fromEntries(AS.ASSET_FILES.map(k => [k, 'assets/' + k + '.webp'])) : (AS.ASSETS || {});
    return (http ? Promise.resolve() : fetchBundle()).then(() => Promise.all(Object.entries(srcs()).map(([k, src]) => new Promise(res => {
      const im = new Image();
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => { }).then(() => { Art.img[k] = im; res(); }); };
      im.onerror = () => res();
      im.src = src;
    })))).then(() => {
      // bake a dark rim around every unit sprite once so silhouettes read on any terrain and through effects
      for (const k in Art.img) {
        if (!(k.startsWith('enemy_') || k.startsWith('tower_'))) continue;
        const im = Art.img[k], pad = 6, c = document.createElement('canvas');
        c.width = im.width + pad * 2; c.height = im.height + pad * 2;
        const x = c.getContext('2d');
        x.filter = 'drop-shadow(0 0 2px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.9))';
        x.drawImage(im, pad, pad);
        Art.img[k] = c;
      }
      Art.ready = true;
    });
  };
  Art.get = k => Art.img[k] || null;
  const SKIN_TINT = { obsidian: [['multiply', '#7a6870', 1], ['color', '#ff4a4a', 0.28]], celestial: [['screen', '#40382a', 1], ['color', '#ffd76a', 0.32]], verdigris: [['color', '#2fd6a8', 0.42]] };
  Art.tower = function (id, lvl, branch, skin) {
    let stage = lvl === 0 ? 0 : lvl === 1 ? 4 : lvl === 2 ? 1 : lvl === 3 ? 2 + Math.max(0, branch) : 5 + Math.max(0, branch);
    if (!Art.get('tower_' + id + '_' + stage)) stage = lvl <= 1 ? 0 : lvl === 2 ? 1 : 2 + Math.max(0, branch); // fallback to the shared stage
    const img = Art.get('tower_' + id + '_' + stage);
    if (!img || !skin || !SKIN_TINT[skin.id]) return img;
    const key = id + stage + skin.id;
    if (!Art.tint[key]) {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      for (const [op, col, a] of SKIN_TINT[skin.id]) { x.globalCompositeOperation = op; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); }
      x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
      Art.tint[key] = c;
    }
    return Art.tint[key];
  };

  R.buildBackground = function (game) {
    const W = D.COLS * T, H = D.ROWS * T;
    const m = game.map, B = D.BIOMES[m.biome];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const noise = U.makeNoise(U.hashStr(m.id));
    const rr = U.rng(U.hashStr(m.id + 'bg'));
    const TT = game.constructor.TILE;
    const painted = Art.get('map_' + m.id);
    if (painted) { g.drawImage(painted, 0, 0, W, H); return cv; }
    const typeAt = (c, r) => (c < 0 || r < 0 || c >= D.COLS || r >= D.ROWS) ? -1 : game.type[game.idx(c, r)];

    // --- ground texture (half-res noise field)
    const hw = W / 2, hh = H / 2;
    const img = g.createImageData(hw, hh);
    const c1 = U.hexToRgb(B.ground), c2 = U.hexToRgb(B.ground2), c3 = U.hexToRgb(B.groundDark);
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      const n = noise.fbm(x / 70, y / 70, 4) * 0.5 + 0.5;
      const n2 = noise(x / 9 + 100, y / 9) * 0.5 + 0.5;
      let r, gg, b;
      const t = U.clamp(n * 1.3 - 0.15, 0, 1);
      r = c3[0] + (c2[0] - c3[0]) * t; gg = c3[1] + (c2[1] - c3[1]) * t; b = c3[2] + (c2[2] - c3[2]) * t;
      const mixv = U.clamp(n2 * 0.5, 0, 1) * 0.3;
      r = r * (1 - mixv) + c1[0] * mixv; gg = gg * (1 - mixv) + c1[1] * mixv; b = b * (1 - mixv) + c1[2] * mixv;
      const k = (y * hw + x) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = hw; tmp.height = hh;
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(tmp, 0, 0, W, H);

    // biome ground details
    if (m.biome === 'neon') {
      g.strokeStyle = 'rgba(0,229,255,0.06)'; g.lineWidth = 1;
      for (let x = 0; x <= W; x += T / 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += T / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let k = 0; k < 40; k++) { // circuit traces
        let x = rr.int(0, D.COLS) * T, y = rr.int(0, D.ROWS) * T;
        g.strokeStyle = rr() < 0.5 ? 'rgba(0,229,255,0.16)' : 'rgba(255,61,242,0.13)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 5; s++) { if (rr() < 0.5) x += rr.int(-3, 3) * T / 2; else y += rr.int(-3, 3) * T / 2; g.lineTo(x, y); }
        g.stroke(); g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      }
    }
    if (m.biome === 'cinder') {
      for (let k = 0; k < 70; k++) { // glowing cracks
        let x = rr() * W, y = rr() * H;
        g.strokeStyle = `rgba(255,${rr.int(60, 120)},30,${rr.range(0.12, 0.35)})`; g.lineWidth = rr.range(1, 2.5);
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += rr.range(-26, 26); y += rr.range(-26, 26); g.lineTo(x, y); }
        g.stroke();
      }
    }
    if (m.biome === 'verdant' || m.biome === 'sky') {
      for (let k = 0; k < 900; k++) { // grass tufts & flowers
        const x = rr() * W, y = rr() * H;
        const [c, r] = [Math.floor(x / T), Math.floor(y / T)];
        if (typeAt(c, r) !== TT.G && typeAt(c, r) !== TT.R) continue;
        if (rr() < 0.08) { g.fillStyle = rr.pick(['#ffe48a', '#ff9ec4', '#bfe6ff', '#ffffff']); g.globalAlpha = 0.8; g.beginPath(); g.arc(x, y, rr.range(1.5, 2.8), 0, 7); g.fill(); g.globalAlpha = 1; continue; }
        g.strokeStyle = U.rgba(U.shade(B.ground2, rr.range(0.05, 0.3)), rr.range(0.3, 0.7)); g.lineWidth = 1.4;
        for (let b = 0; b < 3; b++) { g.beginPath(); g.moveTo(x + b * 2, y); g.quadraticCurveTo(x + b * 2 + rr.range(-3, 3), y - 5, x + b * 2 + rr.range(-4, 4), y - rr.range(6, 10)); g.stroke(); }
      }
    }

    // --- void (sky biome): deep sky with clouds, island cliffs
    if (m.biome === 'sky') {
      const sky = document.createElement('canvas'); sky.width = W; sky.height = H;
      const s = sky.getContext('2d');
      const gr = s.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a3a7a'); gr.addColorStop(0.5, '#0f2557'); gr.addColorStop(1, '#081538');
      s.fillStyle = gr; s.fillRect(0, 0, W, H);
      for (let k = 0; k < 160; k++) { s.fillStyle = `rgba(255,255,255,${rr.range(0.2, 0.8)})`; s.fillRect(rr() * W, rr() * H, 1.5, 1.5); }
      for (let k = 0; k < 26; k++) { const x = rr() * W, y = rr() * H, rad = rr.range(60, 160); const cg = s.createRadialGradient(x, y, 0, x, y, rad); cg.addColorStop(0, 'rgba(160,200,255,0.18)'); cg.addColorStop(1, 'rgba(160,200,255,0)'); s.fillStyle = cg; s.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      // cut out void tiles from ground and paint sky there
      g.save(); g.beginPath();
      for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) if (typeAt(c, r) === TT.V) g.rect(c * T, r * T, T, T);
      g.clip(); g.drawImage(sky, 0, 0); g.restore();
      // cliff undersides below islands
      for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) {
        const t = typeAt(c, r);
        if (t === TT.V || t === -1) continue;
        if (typeAt(c, r + 1) === TT.V && !game.fixedBridge[game.idx(c, r)]) {
          const x = c * T, y = (r + 1) * T;
          const depth = 18 + noise(c * 0.7, r) * 14 + 14;
          const cg = g.createLinearGradient(0, y, 0, y + depth);
          cg.addColorStop(0, '#5a4a3a'); cg.addColorStop(1, 'rgba(40,30,30,0)');
          g.fillStyle = cg; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + T + 2, y);
          g.lineTo(x + T * 0.8, y + depth * 0.7); g.lineTo(x + T * 0.5, y + depth); g.lineTo(x + T * 0.2, y + depth * 0.8); g.closePath(); g.fill();
        }
        // grass rim
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (typeAt(c + dc, r + dr) === TT.V && !game.fixedBridge[game.idx(c, r)]) {
          g.strokeStyle = 'rgba(160,255,170,0.35)'; g.lineWidth = 3; g.beginPath();
          const x = c * T, y = r * T;
          if (dc === 1) { g.moveTo(x + T, y); g.lineTo(x + T, y + T); } if (dc === -1) { g.moveTo(x, y); g.lineTo(x, y + T); }
          if (dr === 1) { g.moveTo(x, y + T); g.lineTo(x + T, y + T); } if (dr === -1) { g.moveTo(x, y); g.lineTo(x + T, y); }
          g.stroke();
        }
      }
    }
    // --- rivers (Verdant)
    if (m.water) {
      const pts = line => line.map(([c, r]) => [c * T + T / 2, r * T + T / 2 + (r === 0 ? -T : r === D.ROWS - 1 ? T : 0)]);
      const stroke = (line, w, style, blur) => { g.save(); if (blur) g.filter = 'blur(' + blur + 'px)'; g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); const P = pts(line); g.moveTo(P[0][0], P[0][1]); for (const q of P.slice(1)) g.lineTo(q[0], q[1]); g.stroke(); g.restore(); };
      for (const line of m.water) stroke(line, T * 1.25, 'rgba(10,30,20,0.55)', 6);
      for (const line of m.water) stroke(line, T * 1.05, '#4a6a3a');
      for (const line of m.water) stroke(line, T * 0.85, '#1d4a5a');
      for (const line of m.water) stroke(line, T * 0.6, '#2a6f86');
      for (const line of m.water) stroke(line, T * 0.22, 'rgba(160,230,255,0.35)', 4);
      for (const line of m.water) { const P = pts(line); for (let k = 0; k < 18; k++) { const f = rr(); const x = U.lerp(P[0][0], P[1][0], f) + rr.range(-26, 26), y = U.lerp(P[0][1], P[1][1], f) + rr.range(-6, 6); g.fillStyle = '#5f7f4f'; g.beginPath(); g.ellipse(x + (x > P[0][0] ? 10 : -10), y, 6, 4, 0, 0, 7); g.fill(); } }
    }
    // directional sunlight + soft ambient occlusion toward the map edges
    { const lg = g.createLinearGradient(0, 0, W, H); lg.addColorStop(0, 'rgba(255,240,200,0.07)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,20,0.12)'); g.fillStyle = lg; g.fillRect(0, 0, W, H); }
    // --- lava rivers: rounded, banked strokes along the authored polylines
    if (m.biome === 'cinder' && m.lava) {
      const pts = line => line.map(([c, r]) => [c * T + T / 2 + (c === 0 ? -T : c === D.COLS - 1 ? T : 0), r * T + T / 2 + (r === 0 ? -T : r === D.ROWS - 1 ? T : 0)]);
      const stroke = (line, w, style, blur) => { g.save(); if (blur) g.filter = 'blur(' + blur + 'px)'; g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); const P = pts(line); g.moveTo(P[0][0], P[0][1]); for (const q of P.slice(1)) g.lineTo(q[0], q[1]); g.stroke(); g.restore(); };
      for (const line of m.lava) stroke(line, T * 1.55, 'rgba(255,90,20,0.35)', 14);
      for (const line of m.lava) stroke(line, T * 1.2, '#1a0c08');
      for (const line of m.lava) stroke(line, T * 0.95, '#b8320c');
      for (const line of m.lava) stroke(line, T * 0.7, '#ff6a1a');
      for (const line of m.lava) stroke(line, T * 0.32, '#ffb347', 3);
      // cooling crust islands
      for (const line of m.lava) { const P = pts(line); for (let k = 0; k < P.length - 1; k++) { const [x0, y0] = P[k], [x1, y1] = P[k + 1]; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 22); for (let j = 0; j < n; j++) { if (rr() < 0.5) continue; const f = j / n; g.fillStyle = `rgba(40,14,6,${rr.range(0.4, 0.75)})`; g.beginPath(); g.ellipse(U.lerp(x0, x1, f) + rr.range(-14, 14), U.lerp(y0, y1, f) + rr.range(-14, 14), rr.range(4, 10), rr.range(3, 6), rr() * 3, 0, 7); g.fill(); } } }
    }
    if (false) {
      for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) if (typeAt(c, r) === TT.L) {
        const x = c * T, y = r * T;
        const lg = g.createLinearGradient(x, y, x + T, y + T); lg.addColorStop(0, '#ff7a1a'); lg.addColorStop(0.5, '#ff4a12'); lg.addColorStop(1, '#ffa02a');
        g.fillStyle = lg; g.fillRect(x - 1, y - 1, T + 2, T + 2);
        for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(60,15,5,${rr.range(0.3, 0.6)})`; g.beginPath(); g.ellipse(x + rr() * T, y + rr() * T, rr.range(4, 12), rr.range(3, 8), rr() * 3, 0, 7); g.fill(); }
      }
      for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) if (typeAt(c, r) === TT.L) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t2 = typeAt(c + dc, r + dr); if (t2 === TT.L || t2 === -1) continue;
        g.fillStyle = 'rgba(30,12,8,0.85)';
        const x = c * T, y = r * T;
        if (dc === 1) g.fillRect(x + T - 5, y, 5, T); if (dc === -1) g.fillRect(x, y, 5, T); if (dr === 1) g.fillRect(x, y + T - 5, T, 5); if (dr === -1) g.fillRect(x, y, T, 5);
      }
    }
    // --- walls (neon canyon): an extruded, lit megacity skyline
    for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) if (typeAt(c, r) === TT.W) {
      const x = c * T, y = r * T;
      const hgt = rr.range(10, 34), roofY = y - hgt + (r === 0 ? 10 : 0);
      const fg = g.createLinearGradient(x, roofY, x, y + T); fg.addColorStop(0, '#2c2150'); fg.addColorStop(1, '#0e0a1c');
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 4, y + 6, T, T);
      g.fillStyle = fg; g.fillRect(x + 1, roofY, T - 2, y + T - roofY);
      g.fillStyle = '#3d2f6a'; g.fillRect(x + 1, roofY, T - 2, 6);
      const neon = rr.pick(['#00e5ff', '#ff3df2', '#ffe14d', '#7d5cff']);
      g.fillStyle = neon; g.fillRect(x + 1, roofY + 5, T - 2, 2);
      for (let wy = roofY + 12; wy < y + T - 6; wy += 9) for (let wx = x + 6; wx < x + T - 8; wx += 9) { if (rr() < 0.45) continue; g.fillStyle = rr() < 0.7 ? 'rgba(0,229,255,0.55)' : rr() < 0.5 ? 'rgba(255,61,242,0.6)' : 'rgba(255,225,77,0.6)'; g.fillRect(wx, wy, 4, 3); }
      if (rr() < 0.25) { g.fillStyle = neon; g.globalAlpha = 0.85; g.fillRect(x + 10, roofY + 14, T - 20, 10); g.globalAlpha = 1; g.fillStyle = '#05040e'; for (let k = 0; k < 4; k++) g.fillRect(x + 13 + k * 9, roofY + 17, 5, 4); }
      continue;
      const wg = g.createLinearGradient(x, y, x, y + T); wg.addColorStop(0, '#3a2c5e'); wg.addColorStop(1, '#1a1330');
      g.fillStyle = wg; g.fillRect(x, y, T, T);
      g.strokeStyle = 'rgba(255,61,242,0.35)'; g.lineWidth = 2;
      if (typeAt(c, r + 1) !== TT.W && typeAt(c, r + 1) !== -1) { g.beginPath(); g.moveTo(x, y + T - 1); g.lineTo(x + T, y + T - 1); g.stroke(); }
      if (typeAt(c, r - 1) !== TT.W && typeAt(c, r - 1) !== -1) { g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + T, y + 1); g.stroke(); }
      for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + rr() * T, y + rr() * T, rr.range(6, 18), 3); }
    }

    // --- path: shadow, edge, fill, texture (drawn per tile for exact shapes)
    const isPathTile = (c, r) => typeAt(c, r) === TT.P && !(game.bridgeId[game.idx(c, r)] >= 0) && !game.fixedBridge[game.idx(c, r)];
    const pathCells = [];
    for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) if (isPathTile(c, r)) pathCells.push([c, r]);
    const pathShape = (inset, round) => {
      g.beginPath();
      for (const [c, r] of pathCells) {
        const x = c * T, y = r * T;
        const L = isPathTile(c - 1, r) || (game.bridgeId[game.idx(Math.max(0, c - 1), r)] >= 0) || (game.fixedBridge[game.idx(Math.max(0, c - 1), r)]) || c === 0;
        const Rr = isPathTile(c + 1, r) || (c + 1 < D.COLS && (game.bridgeId[game.idx(c + 1, r)] >= 0 || game.fixedBridge[game.idx(c + 1, r)])) || c === D.COLS - 1;
        const Up = isPathTile(c, r - 1) || (r > 0 && (game.bridgeId[game.idx(c, r - 1)] >= 0 || game.fixedBridge[game.idx(c, r - 1)]));
        const Dn = isPathTile(c, r + 1) || (r + 1 < D.ROWS && (game.bridgeId[game.idx(c, r + 1)] >= 0 || game.fixedBridge[game.idx(c, r + 1)]));
        const x0 = x + (L ? -0.5 : inset), x1 = x + T - (Rr ? -0.5 : inset), y0 = y + (Up ? -0.5 : inset), y1 = y + T - (Dn ? -0.5 : inset);
        if (g.roundRect && round) g.roundRect(x0, y0, x1 - x0, y1 - y0, round); else g.rect(x0, y0, x1 - x0, y1 - y0);
      }
    };
    g.save(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.filter = 'blur(6px)'; g.translate(0, 5); pathShape(2, 10); g.fill(); g.restore();
    g.fillStyle = B.pathEdge; pathShape(2, 12); g.fill();
    const pathFill = () => {
      const pg = g.createLinearGradient(0, 0, W, H); pg.addColorStop(0, U.shade(B.path, 0.06)); pg.addColorStop(1, U.shade(B.path, -0.08));
      g.fillStyle = pg; pathShape(7, 10); g.fill();
    };
    pathFill();
    g.save(); pathShape(7, 10); g.clip();
    for (let k = 0; k < pathCells.length * 7; k++) { // stones / dust texture
      const [c, r] = pathCells[rr.int(0, pathCells.length - 1)];
      const x = c * T + rr() * T, y = r * T + rr() * T;
      if (m.biome === 'neon') { g.fillStyle = 'rgba(0,229,255,0.05)'; g.fillRect(x, y, rr.range(4, 14), 1); continue; }
      g.fillStyle = rr() < 0.5 ? U.rgba(U.shade(B.path, -0.25), 0.35) : U.rgba(U.shade(B.path, 0.25), 0.3);
      g.beginPath(); g.ellipse(x, y, rr.range(1.5, 4.5), rr.range(1, 3), rr() * 3, 0, 7); g.fill();
    }
    // wheel ruts
    g.strokeStyle = U.rgba(U.shade(B.path, -0.2), 0.25); g.lineWidth = 2;
    g.restore();
    if (m.biome === 'neon') { // neon edges
      g.save(); g.strokeStyle = 'rgba(0,229,255,0.55)'; g.lineWidth = 2; pathShape(7, 10); g.stroke(); g.restore();
    }

    // sunken-path walls: light from the north-west shades the north/west walls and lights the south/east walls
    if (m.biome !== 'neon') for (const [c, r] of pathCells) {
      const x = c * T, y = r * T;
      const wall = (dc, dr) => { const t2 = typeAt(c + dc, r + dr); return t2 !== TT.P && t2 !== -1 && !(game.bridgeId[game.idx(Math.min(D.COLS - 1, Math.max(0, c + dc)), Math.min(D.ROWS - 1, Math.max(0, r + dr)))] >= 0); };
      if (wall(0, -1)) { const gr = g.createLinearGradient(0, y + 4, 0, y + 18); gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y + 4, T, 14); }
      if (wall(-1, 0)) { const gr = g.createLinearGradient(x + 4, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + 4, y, 12, T); }
      if (wall(0, 1)) { g.fillStyle = U.rgba(U.shade(B.pathEdge, 0.25), 0.9); g.fillRect(x, y + T - 9, T, 5); g.fillStyle = 'rgba(255,255,230,0.12)'; g.fillRect(x, y + T - 10, T, 2); }
      if (wall(1, 0)) { g.fillStyle = U.rgba(U.shade(B.pathEdge, 0.12), 0.8); g.fillRect(x + T - 9, y, 5, T); }
    }
    // curb stones along path edges
    if (m.biome !== 'neon') for (const [c, r] of pathCells) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t2 = typeAt(c + dc, r + dr); if (t2 === TT.P || t2 === -1) continue;
      for (let k = 0; k < 3; k++) {
        const along = (k + 0.5 + rr.range(-0.2, 0.2)) / 3 * T;
        const x = c * T + (dc ? (dc > 0 ? T - 6 : 6) : along), y = r * T + (dr ? (dr > 0 ? T - 6 : 6) : along);
        g.fillStyle = U.shade(B.pathEdge, rr.range(-0.1, 0.35)); g.beginPath(); g.ellipse(x, y, rr.range(3, 5.5), rr.range(2.5, 4), rr() * 3, 0, 7); g.fill();
      }
    }
    // --- fixed bridges (stone)
    for (let i = 0; i < game.type.length; i++) if (game.fixedBridge[i]) {
      const c = i % D.COLS, r = (i / D.COLS) | 0; R.drawPlanks(g, c * T, r * T, true, 1);
    }

    // --- ambient occlusion near walls / decor
    for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) {
      const kind = game.decoKind[game.idx(c, r)];
      if (typeAt(c, r) === TT.R && kind && kind !== 'nexus') R.drawDeco(g, kind, c * T + T / 2, r * T + T / 2, rr, B);
    }
    // ruins scatter on verdant: broken flagstones
    if (m.biome === 'verdant') {
      for (let k = 0; k < 40; k++) {
        const c = rr.int(0, D.COLS - 1), r = rr.int(0, D.ROWS - 1);
        if (typeAt(c, r) !== TT.G) continue;
        g.fillStyle = 'rgba(190,180,150,0.18)'; g.strokeStyle = 'rgba(40,40,30,0.25)';
        const x = c * T + rr() * T * 0.5, y = r * T + rr() * T * 0.5;
        g.beginPath(); g.rect(x, y, rr.range(12, 26), rr.range(10, 20)); g.fill(); g.stroke();
      }
    }
    return cv;
  };

  R.drawPlanks = function (g, x, y, horizontalHint, alpha) {
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, y + 10, T - 4, T - 12);
    for (let k = 0; k < 5; k++) {
      const py = y + 6 + k * 11;
      g.fillStyle = k % 2 ? '#8a6a44' : '#9c7a50'; g.fillRect(x - 1, py, T + 2, 9);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 1, py + 7, T + 2, 2);
    }
    g.fillStyle = '#5a4430'; g.fillRect(x - 1, y + 2, T + 2, 4); g.fillRect(x - 1, y + T - 6, T + 2, 4);
    g.restore();
  };

  R.drawDeco = function (g, kind, x, y, rr, B) {
    g.save();
    // contact shadow
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 4, y + 12, 24, 10, 0, 0, 7); g.fill();
    switch (kind) {
      case 'tree': {
        g.fillStyle = '#4a3220'; g.fillRect(x - 4, y - 2, 8, 16);
        const greens = ['#1f5a2c', '#2b7239', '#3a8d47', '#58a85a'];
        for (let k = 0; k < 4; k++) { g.fillStyle = greens[k]; g.beginPath(); g.arc(x + (k - 1.5) * 4 + rr.range(-3, 3), y - 10 - k * 4, 20 - k * 4, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(255,255,200,0.12)'; g.beginPath(); g.arc(x - 6, y - 22, 8, 0, 7); g.fill();
        break;
      }
      case 'bush': {
        for (let k = 0; k < 4; k++) { g.fillStyle = ['#245f30', '#2f7a3c', '#3e9049', '#2a6a35'][k]; g.beginPath(); g.arc(x + rr.range(-12, 12), y + rr.range(-6, 6), rr.range(9, 14), 0, 7); g.fill(); }
        g.fillStyle = '#ff9ec4'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + rr.range(-10, 10), y + rr.range(-8, 4), 2, 0, 7); g.fill(); }
        break;
      }
      case 'pillar': {
        const h = rr.range(26, 44);
        g.fillStyle = '#8f8a7a'; g.fillRect(x - 10, y - h + 10, 20, h);
        g.fillStyle = '#a9a391'; g.fillRect(x - 10, y - h + 10, 6, h);
        g.fillStyle = '#6e6a5c'; g.fillRect(x - 13, y + 6, 26, 8); g.fillRect(x - 13, y - h + 6, 26, 6);
        g.fillStyle = 'rgba(60,140,70,0.7)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + rr.range(-10, 10), y - rr.range(0, h), rr.range(3, 6), 0, 7); g.fill(); }
        break;
      }
      case 'rock': case 'skull': {
        const base = kind === 'skull' ? '#d9cfc0' : (B.ground === '#2b1b17' ? '#3a2a26' : '#6e7480');
        g.fillStyle = base; g.beginPath();
        const n = 7; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const rad = rr.range(13, 21); g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.75); }
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(x - 5, y - 6, 8, 5, -0.4, 0, 7); g.fill();
        if (kind === 'skull') { g.fillStyle = '#1a0f0c'; g.beginPath(); g.arc(x - 5, y - 2, 3.5, 0, 7); g.arc(x + 5, y - 2, 3.5, 0, 7); g.fill(); }
        break;
      }
      case 'crystal': {
        const col = B.accent;
        for (let k = 0; k < 3; k++) {
          const ox = (k - 1) * 9, h = rr.range(18, 34);
          const cg = g.createLinearGradient(x + ox, y - h, x + ox, y + 8); cg.addColorStop(0, U.shade(col, 0.5)); cg.addColorStop(1, U.shade(col, -0.4));
          g.fillStyle = cg; g.beginPath(); g.moveTo(x + ox, y - h); g.lineTo(x + ox + 7, y); g.lineTo(x + ox, y + 8); g.lineTo(x + ox - 7, y); g.closePath(); g.fill();
        }
        break;
      }
      case 'antenna': {
        g.strokeStyle = '#4a4070'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y - 30); g.stroke();
        g.lineWidth = 2; g.beginPath(); g.moveTo(x - 10, y - 18); g.lineTo(x + 10, y - 18); g.moveTo(x - 7, y - 25); g.lineTo(x + 7, y - 25); g.stroke();
        g.fillStyle = '#ff3df2'; g.beginPath(); g.arc(x, y - 32, 3, 0, 7); g.fill();
        g.fillStyle = '#2a2448'; g.fillRect(x - 12, y + 4, 24, 10);
        break;
      }
      case 'billboard': {
        g.fillStyle = '#1b1636'; g.fillRect(x - 3, y - 6, 6, 18);
        const col = rr.pick(['#ff3df2', '#00e5ff', '#ffe14d']);
        g.fillStyle = '#0a0818'; g.fillRect(x - 24, y - 36, 48, 30);
        g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(x - 24, y - 36, 48, 30);
        g.fillStyle = col; g.globalAlpha = 0.85; for (let k = 0; k < 3; k++) g.fillRect(x - 18, y - 30 + k * 8, rr.range(14, 36), 4); g.globalAlpha = 1;
        break;
      }
      case 'pylon': {
        g.fillStyle = '#251d45'; g.beginPath(); g.moveTo(x - 10, y + 10); g.lineTo(x - 4, y - 34); g.lineTo(x + 4, y - 34); g.lineTo(x + 10, y + 10); g.fill();
        g.strokeStyle = '#00e5ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, y - 30); g.stroke();
        g.fillStyle = '#ff3df2'; g.beginPath(); g.arc(x, y - 36, 4, 0, 7); g.fill();
        break;
      }
      case 'crate': {
        g.fillStyle = '#2b2650'; g.fillRect(x - 16, y - 14, 32, 28);
        g.strokeStyle = 'rgba(0,229,255,0.6)'; g.lineWidth = 2; g.strokeRect(x - 16, y - 14, 32, 28);
        g.beginPath(); g.moveTo(x - 16, y - 14); g.lineTo(x + 16, y + 14); g.stroke();
        break;
      }
      case 'spire': {
        const h = rr.range(30, 48);
        g.fillStyle = '#1a1214'; g.beginPath(); g.moveTo(x - 14, y + 10); g.lineTo(x - 3, y - h); g.lineTo(x + 4, y - h * 0.7); g.lineTo(x + 14, y + 10); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,120,40,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 6, y + 4); g.lineTo(x - 2, y - h * 0.5); g.lineTo(x + 3, y - h * 0.2); g.stroke();
        break;
      }
    }
    g.restore();
  };

  AS.R = R;
})(AS);
