// Aether Spire — core simulation. No DOM access: runs in browser and headless (Node) tests.
(function (AS) {
  'use strict';
  const U = AS.U, D = AS.D, T = U.TILE;
  const COLS = D.COLS, ROWS = D.ROWS, N = COLS * ROWS;
  const G = 0, P = 1, R = 2, V = 3, L = 4, W = 5, X = 6, WA = 7;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ------------------------------------------------------------ min-heap for Dijkstra
  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break;[k[p], k[i]] = [k[i], k[p]];[v[p], v[i]] = [v[i], v[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (; ;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;[k[m], k[i]] = [k[i], k[m]];[v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.k.length; };

  class Game {
    constructor(opts) {
      this.opts = opts;
      this.map = D.MAPS.find(m => m.id === opts.mapId) || D.MAPS[0];
      this.diff = D.DIFFICULTIES[opts.difficulty || 'veteran'];
      this.mut = new Set(opts.mutators || []);
      this.research = new Set(opts.research || []);
      this.endless = !!opts.endless;
      this.daily = !!opts.daily;
      this.seed = opts.seed != null ? opts.seed : U.hashStr(this.map.id);
      this.rng = U.rng(this.seed ^ 0x9e3779b9);
      this.ev = U.Emitter();
      this.time = 0;            // sim time
      this.waveTime = 0;
      this.totalWaves = this.map.waves;
      this.wave = 0;            // number of waves started
      this.waveActive = false;
      this.countdown = -1;      // seconds until auto next wave; -1 = waiting for player
      this.spawnQueue = [];
      this.waveRecords = {};    // wave -> {alive, leaks, spawnedAll}
      this.enemies = []; this.towers = []; this.projectiles = []; this.wells = []; this.pools = []; this.minions = []; this.barricades = [];
      this.zaps = []; // short-lived visual-only lightning/beam records consumed by renderer
      this.over = false; this.won = false;
      this.score = 0; this.kills = 0; this.leaks = 0; this.perfectWaves = 0; this.goldEarned = 0;
      this.nextUid = 1;
      this.seenEnemies = new Set(opts.seenEnemies || []);
      this.powerCd = { meteor: 0, stasis: 0, mend: 0 };
      this.stasisT = 0;
      this.nightAmt = 0; this.isNight = false; this.dayClock = 0;
      this.phoenixUsed = false;
      this.relocations = 2 + (this.has('engineering') ? 1 : 0);
      this.barricadeMax = D.BARRICADE.max + (this.has('engineering') ? 2 : 0);
      const goldMul = this.diff.gold * (this.mut.has('scarcity') ? 0.75 : 1);
      this.goldMul = goldMul;
      this.gold = Math.round(((this.map.startGold || 340) + (this.has('treasury') ? 60 : 0)) * (this.mut.has('scarcity') ? 0.85 : 1));
      this.essence = 2 + (this.has('attune') ? 2 : 0);
      this.maxLives = this.diff.lives + (this.has('bulwark') ? 4 : 0);
      if (this.mut.has('glass')) this.maxLives = Math.ceil(this.maxLives / 2);
      this.lives = this.maxLives;
      this.builtThisPrep = new Set();
      this.boss = null;
      this.buildGrid();
      this.updateLightSources();
      this.computeFields();
      this.nextWavePreview = this.genWave(1);
    }

    has(r) { return this.research.has(r); }
    uid() { return this.nextUid++; }
    fx(...args) { this.ev.emit('fx', ...args); }
    sfx(name, x, y) { this.ev.emit('sfx', name, x, y); }
    text(x, y, str, color, size) { this.ev.emit('text', x, y, str, color, size); }

    // ============================================================ GRID
    idx(c, r) { return r * COLS + c; }
    inb(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
    cx(c) { return c * T + T / 2; }
    tileOf(x, y) { return [Math.floor(x / T), Math.floor(y / T)]; }

    buildGrid() {
      const m = this.map;
      const sky = m.biome === 'sky';
      this.type = new Uint8Array(N).fill(sky ? V : G);
      this.ley = new Uint8Array(N);
      this.bridgeId = new Int16Array(N).fill(-1);
      this.fixedBridge = new Uint8Array(N);
      this.decoKind = new Array(N).fill(null);
      this.isSpawn = new Uint8Array(N);
      const rr = U.rng(U.hashStr(m.id + 'grid'));
      if (sky) for (const [x0, y0, x1, y1] of m.islands) for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) if (this.inb(c, r)) this.type[this.idx(c, r)] = G;
      if (m.walls) {
        for (let c = 0; c < COLS; c++) { this.type[this.idx(c, 0)] = W; this.type[this.idx(c, ROWS - 1)] = W; }
      }
      // when painted art is present, buildable land follows the painting exactly (see tools/buildart.py)
      const artGrid = AS.ART_GRID && AS.ART_GRID[m.id] && !this.opts.procedural;
      if (artGrid && artGrid.void) { this.type.fill(G); for (const i of artGrid.void) this.type[i] = V; }
      if (m.lava) for (const line of m.lava) this.rasterLine(line, i => { this.type[i] = L; });
      if (m.water) for (const line of m.water) this.rasterLine(line, i => { this.type[i] = WA; });
      this.floodSet = new Set((m.flood ? m.flood.tiles : []).map(([c, r]) => this.idx(c, r))); this.flooded = false; this.floodAmt = 0; this.floodClock = 0;
      this.pathTiles = [];
      for (const line of m.paths) this.rasterLine(line, i => {
        if (this.type[i] === V) this.fixedBridge[i] = 1;
        this.type[i] = P;
      });
      if (m.walls) for (const line of m.paths) this.rasterLine(line, i => { this.type[i] = P; });
      this.bridges = [];
      for (const b of (m.bridges || [])) this.addBridge(b.tiles, false);
      for (const b of (m.nightBridges || [])) this.addBridge(b.tiles, true);
      for (const [c, r] of m.spawns) this.isSpawn[this.idx(c, r)] = 1;
      this.spawns = m.spawns.map(([c, r]) => ({ c, r, i: this.idx(c, r) }));
      this.airSpawns = m.airSpawns ? m.airSpawns.map(([c, r]) => ({ c, r, i: this.idx(c, r) })) : null;
      this.nexus = { c: m.nexus[0], r: m.nexus[1], i: this.idx(m.nexus[0], m.nexus[1]) };
      this.nexus.x = this.cx(this.nexus.c); this.nexus.y = this.cx(this.nexus.r);
      // nexus footprint
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = this.nexus.c + dc, r = this.nexus.r + dr;
        if (this.inb(c, r) && this.type[this.idx(c, r)] !== P) { this.type[this.idx(c, r)] = R; this.decoKind[this.idx(c, r)] = 'nexus'; }
      }
      for (const [c, r] of m.ley) this.ley[this.idx(c, r)] = 1;
      this.vents = (m.vents || []).map(([c, r], k) => { this.type[this.idx(c, r)] = X; return { c, r, x: this.cx(c), y: this.cx(r), t: 8 + k * 3.7, warn: 0 }; });
      // decorations (blocking)
      const nearPath = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const cc = c + dc, r2 = r + dr; if (this.inb(cc, r2) && this.type[this.idx(cc, r2)] === P) return true; } return false; };
      const biome = D.BIOMES[m.biome];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const i = this.idx(c, r);
        if (this.type[i] !== G || this.ley[i] || nearPath(c, r)) continue;
        if (Math.abs(c - this.nexus.c) <= 2 && Math.abs(r - this.nexus.r) <= 2) continue;
        if (rr() < m.deco) { this.type[i] = R; this.decoKind[i] = rr.pick(biome.deco); }
      }
      if (m.walls) { // canyon wall chunks along the top/bottom edges
        for (let c = 0; c < COLS; c++) for (const r of [1, ROWS - 2]) { const i = this.idx(c, r); if (this.type[i] === G && rr() < 0.25) { this.type[i] = W; } }
      }
      this.occ = new Array(N).fill(null);
      this.lightSources = [];
      this.leyDrain = new Float32Array(N); this.molten = new Float32Array(N);
    }
    rasterLine(line, fn) {
      for (let k = 0; k < line.length - 1; k++) {
        let [c0, r0] = line[k]; const [c1, r1] = line[k + 1];
        const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
        fn(this.idx(c0, r0));
        while (c0 !== c1 || r0 !== r1) { c0 += dc; r0 += dr; fn(this.idx(c0, r0)); }
      }
    }
    addBridge(tiles, night) {
      const id = this.bridges.length;
      const b = { id, tiles: tiles.map(([c, r]) => this.idx(c, r)), night, up: !night, timer: 0, cd: 0, anim: night ? 0 : 1 };
      b.x = tiles.reduce((s, t) => s + this.cx(t[0]), 0) / tiles.length;
      b.y = tiles.reduce((s, t) => s + this.cx(t[1]), 0) / tiles.length;
      for (const i of b.tiles) { this.type[i] = P; this.bridgeId[i] = id; }
      this.bridges.push(b);
    }
    walkable(i) {
      if (this.type[i] !== P) return false;
      const b = this.bridgeId[i];
      return b < 0 || this.bridges[b].up;
    }
    buildable(c, r) {
      if (!this.inb(c, r)) return false;
      const i = this.idx(c, r);
      return this.type[i] === G && !this.occ[i];
    }
    barricadeOk(c, r) {
      if (!this.inb(c, r)) return false;
      const i = this.idx(c, r);
      if (this.type[i] !== P || this.occ[i] || this.isSpawn[i] || i === this.nexus.i || this.bridgeId[i] >= 0) return false;
      if (this.barricades.length >= this.barricadeMax) return false;
      for (const e of this.enemies) if (!e.flying && e.tile === i) return false;
      return true;
    }

    // ============================================================ PATHING
    computeThreat() {
      this.threat = new Float32Array(N);
      for (const t of this.towers) {
        if (t.def.support) continue;
        const dps = this.estimateDps(t);
        if (!dps) continue;
        const rr = t.s.range * T;
        const c0 = Math.max(0, Math.floor((t.x - rr) / T)), c1 = Math.min(COLS - 1, Math.floor((t.x + rr) / T));
        const r0 = Math.max(0, Math.floor((t.y - rr) / T)), r1 = Math.min(ROWS - 1, Math.floor((t.y + rr) / T));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = this.idx(c, r);
          if (this.type[i] !== P) continue;
          if (U.dist2(t.x, t.y, this.cx(c), this.cx(r)) <= rr * rr) this.threat[i] += dps;
        }
      }
    }
    dijkstra(smart, bridgeOverride) {
      const dist = new Float32Array(N).fill(Infinity);
      const h = new Heap();
      const start = this.nexus.i;
      dist[start] = 0; h.push(0, start);
      const scale = 1 / (40 * Math.sqrt(this.hpMul(Math.max(1, this.wave))));
      while (h.size()) {
        const i = h.pop();
        const c = i % COLS, r = (i / COLS) | 0;
        for (const [dc, dr] of DIRS) {
          const cc = c + dc, r2 = r + dr;
          if (!this.inb(cc, r2)) continue;
          const j = this.idx(cc, r2);
          let ok = this.type[j] === P;
          if (ok && this.bridgeId[j] >= 0) {
            const b = this.bridges[this.bridgeId[j]];
            ok = bridgeOverride && bridgeOverride.id === b.id ? bridgeOverride.up : b.up;
          }
          if (!ok) continue;
          let cost = 1;
          const o = this.occ[j];
          if (o && o.barricade) cost += 25;
          if (smart && this.threat) cost += Math.min(8, this.threat[j] * scale);
          const nd = dist[i] + cost;
          if (nd < dist[j]) { dist[j] = nd; h.push(nd, j); }
        }
      }
      return dist;
    }
    computeFields() {
      this.computeThreat();
      this.fieldPlain = this.dijkstra(false);
      this.fieldSmart = this.dijkstra(true);
      this.routes = this.spawns.map(s => ({ smart: this.traceRoute(s.i, this.fieldSmart), plain: this.traceRoute(s.i, this.fieldPlain) }));
    }
    traceRoute(start, field) {
      const out = [start]; let i = start, guard = 0;
      while (i !== this.nexus.i && guard++ < 400) {
        const n = this.nextTile(i, field); if (n < 0) break; out.push(n); i = n;
      }
      return out;
    }
    nextTile(i, field) {
      const c = i % COLS, r = (i / COLS) | 0;
      let best = -1, bd = field[i];
      for (const [dc, dr] of DIRS) {
        const cc = c + dc, r2 = r + dr;
        if (!this.inb(cc, r2)) continue;
        const j = this.idx(cc, r2);
        if (!this.walkable(j)) continue;
        if (field[j] < bd) { bd = field[j]; best = j; }
      }
      return best;
    }

    // ============================================================ WAVES
    hpMul(w) { const k = w - 1; return (1 + 0.12 * k + 0.0082 * k * k) * this.diff.hp * this.map.hpMul * (this.opts.difficulty === 'nightmare' ? (this.map.nightmareMul || 1) : 1); }
    genWave(w) {
      const m = this.map, rng = U.rng((this.seed + w * 7919) >>> 0);
      const groups = [];
      const N = this.totalWaves;
      const isFinal = !this.endless && w === m.boss;
      const isBoss = isFinal || (this.mut.has('bossearly') && w === Math.ceil(N / 2)) || (this.endless && w > N && (w - N) % 5 === 0);
      let budget = (6 + 2.1 * w + 0.058 * w * w) * (m.budgetMul || 1);
      const introAt = {}; for (const k in m.intro) introAt[m.intro[k]] = +k;
      const pool = m.pool.filter(t => (t === 'husk' ? 1 : (introAt[t] || 8)) <= w);
      const spawnPick = () => rng.int(0, this.spawns.length - 1);
      const addGroup = (type, units, delay, spawn) => {
        const def = D.ENEMIES[type];
        let count = Math.max(1, Math.round(units / def.cost));
        if (type === 'swarm') count = U.clamp(count, 6, 26); // dense but countable packs
        const CAP = { skitter: 22, husk: 26, shrike: 10, blinker: 12, phantom: 14, bulwark: 7 }[type];
        let hpBoost = 1;
        if (CAP && count > CAP) { hpBoost = Math.min(1.25, count / CAP); count = CAP; } // spikes become tougher squads, not walls of units
        const base = { husk: 0.85, skitter: 0.5, bulwark: 1.7, shrike: 0.95, swarm: 0.16, aegis: 2.2, blinker: 1.0, brood: 2.4, mender: 2.0, phantom: 0.75 }[type] || 1;
        const interval = Math.min(base, 16 / count);
        groups.push({ type, count, interval, delay, spawn: spawn != null ? spawn : spawnPick(), hpBoost });
      };
      let mods = [];
      // modifiers may only field enemy types the map has already introduced
      const modPool = Object.keys(D.WAVE_MODS).filter(k => k !== 'aerial' && k !== 'armoured' && k !== 'swarm' || pool.includes({ aerial: 'shrike', armoured: 'bulwark', swarm: 'swarm' }[k]));
      if (w >= 4 && !isFinal && rng() < this.diff.modChance + (w > 10 ? 0.15 : 0)) mods.push(rng.pick(modPool));
      if (this.daily && w >= 3 && !mods.length && rng() < 0.35) mods.push(rng.pick(modPool));
      if (mods.some(k => k === 'armoured' || k === 'aerial' || k === 'swarm')) budget *= 0.8; // modifier squads replace part of the wave
      if (isBoss) {
        groups.push({ type: this.map.bossType || 'nullwarden', count: 1, interval: 1, delay: 6, spawn: 0, boss: true });
        addGroup('husk', budget * 0.25, 0);
        addGroup(rng.pick(pool), budget * 0.25, 10);
        if (pool.includes('bulwark')) addGroup('bulwark', budget * 0.2, 16);
      } else {
        let delay = 0;
        const intro = m.intro[w];
        if (this.opts.difficulty === 'nightmare' && Math.abs(w - this.heraldWave()) <= 2 && w !== this.heraldWave()) budget *= 0.85; // breathing room around the Herald
        if (intro) { addGroup(intro, budget * 0.45, delay); budget *= 0.65; delay += 4; }
        const ng = w < 4 ? 1 : (rng() < 0.5 ? 2 : 3);
        for (let g = 0; g < ng; g++) {
          let type = w <= 3 ? 'husk' : rng.pick(pool);
          if (m.airBias && rng() < 0.15 * m.airBias && pool.includes('shrike')) type = 'shrike';
          if (type === 'brood' || type === 'mender' || type === 'aegis') { addGroup('husk', budget / ng * 0.5, delay); addGroup(type, budget / ng * 0.5, delay + 2); }
          else addGroup(type, budget / ng, delay);
          delay += rng.range(3, 6);
        }
        if (w % 5 === 0 && w >= 5) {
          const ctype = rng.pick(pool.filter(t => t !== 'swarm'));
          groups.push({ type: ctype, count: 1, interval: 1, delay: delay + 2, spawn: spawnPick(), champion: rng.pick(Object.keys(D.AFFIXES)) });
        }
      }
      if (!this.endless && !isBoss && w === this.heraldWave()) groups.push({ type: m.bossType || 'nullwarden', count: 1, interval: 1, delay: 10, spawn: 0, boss: true, herald: true });
      if (mods.includes('armoured')) addGroup('bulwark', budget * 0.25, 5);
      if (mods.includes('aerial')) addGroup('shrike', budget * 0.3, 3);
      if (mods.includes('swarm')) { addGroup('swarm', budget * 0.08, 2); addGroup('swarm', budget * 0.08, 9); }
      return { wave: w, groups, mods, boss: isBoss, final: isFinal };
    }
    earlyBonus() {
      const k = this.has('caller') ? 2 : 1;
      if (this.countdown > 0) return Math.ceil(this.countdown * 2 * k);
      if (this.awaitClear) return Math.round((30 + 3 * this.wave) * k); // rush bonus: call while enemies are still on the field
      return 0;
    }
    heraldWave() { return Math.round(this.map.boss * 0.6); }
    canStartWave() { return !this.over && (this.endless || this.wave < this.totalWaves); }
    startWave(early) {
      if (!this.canStartWave()) return false;
      let bonus = 0;
      if (early && (this.countdown > 0 || this.awaitClear)) {
        bonus = this.earlyBonus();
        this.addGold(bonus, false);
        this.score += bonus * 5;
        this.text(this.nexus.x, this.nexus.y - 60, '+' + bonus + ' early call', '#ffd96a', 22);
      }
      this.wave++;
      const def = this.wave === 1 ? this.nextWavePreview : this.genWave(this.wave);
      this.currentWaveDef = def;
      this.nextWavePreview = this.canStartWave() || this.endless ? this.genWave(this.wave + 1) : null;
      if (!this.endless && this.wave >= this.totalWaves) this.nextWavePreview = null;
      this.waveActive = true;
      this.countdown = -1; this.awaitClear = false;
      this.builtThisPrep.clear();
      this.waveRecords[this.wave] = { alive: 0, leaks: 0, pending: 0, wave: this.wave };
      const rec = this.waveRecords[this.wave];
      for (const g of def.groups) {
        for (let k = 0; k < g.count; k++) {
          this.spawnQueue.push({ t: this.time + g.delay + k * g.interval, type: g.type, spawn: g.spawn, wave: this.wave, mods: def.mods, champion: g.champion, boss: g.boss, herald: g.herald, first: k === 0, hpBoost: g.hpBoost || 1 });
          rec.pending++;
        }
      }
      this.spawnQueue.sort((a, b) => a.t - b.t);
      // per-wave income
      let income = 0;
      for (const t of this.towers) if (t.def.id === 'conduit') {
        income += t.s.income; t.goldMade = (t.goldMade || 0) + t.s.income;
        if (t.s.essenceChance && this.rng() < t.s.essenceChance) { this.essence++; this.text(t.x, t.y - 40, '+1 Essence', '#ff7ae0', 18); }
      }
      if (this.has('interest')) income += Math.min(40, Math.floor(this.gold * 0.04));
      if (income) { this.addGold(income); this.text(this.nexus.x, this.nexus.y - 90, '+' + income + ' income', '#ffd96a', 18); }
      this.ev.emit('waveStart', def, bonus);
      this.sfx(def.boss ? 'bossHorn' : 'waveStart');
      for (const g of def.groups) if (!this.seenEnemies.has(g.type)) { this.seenEnemies.add(g.type); this.ev.emit('newEnemy', g.type); }
      return true;
    }
    waveResolved(rec) {
      const w = rec.wave;
      const bonus = Math.round((12 + 3 * w) * this.goldMul);
      this.addGold(bonus, false);
      this.score += 100 * w;
      let msg = 'Wave ' + w + ' cleared  +' + bonus + 'g';
      if (rec.leaks === 0) {
        this.perfectWaves++;
        const ess = 1 + (this.has('attune') && w % 2 === 0 ? 1 : 0);
        this.essence += ess; this.score += 250;
        msg += '   PERFECT +' + ess + ' Essence';
      }
      for (const t of this.towers) if (t.strain > 0) t.strain = Math.max(0, t.strain - 1);
      this.ev.emit('waveEnd', w, rec.leaks === 0, msg);
      delete this.waveRecords[w];
      if (!this.endless && w >= this.totalWaves && !this.enemies.length && !this.spawnQueue.length) this.victory();
    }

    // ============================================================ ENEMIES
    spawnEnemy(q, atTile, atPos) {
      const def = D.ENEMIES[q.type];
      const w = q.wave;
      const hpm = this.hpMul(w);
      const e = {
        uid: this.uid(), type: q.type, def, wave: w,
        maxHp: def.hp * hpm * (q.hpBoost || 1), hp: 0, armor: def.armor, speed: def.speed, r: def.r,
        flying: !!def.flying, boss: !!def.boss, gold: def.gold, dmg: def.dmg,
        shield: 0, maxShield: 0,
        slowAmt: 0, slowT: 0, chillT: 0, freezeT: 0, stunT: 0, rootT: 0, burnDps: 0, burnT: 0, poisonDps: 0, poisonT: 0,
        shredAmt: 0, shredT: 0, markAmt: 0, markT: 0, vuln: 0, suppressed: false, wellT: 0, dilate: 0,
        flash: 0, anim: Math.random() * 10, lane: (Math.random() * 2 - 1) * 14, vx: 0, vy: 0,
        smart: !(q.type === 'bulwark' || q.type === 'brood' || def.boss) && Math.random() < 0.7,
        abilT: 2 + Math.random() * 2, blocker: null, attackingBarricade: null, elite: false, champion: null, essence: 0, dead: false,
        hitBy: null, age: 0,
      };
      if (q.mods && q.mods.includes('accelerated')) e.speed *= 1.25;
      if (q.mods && q.mods.includes('armoured')) e.armor = Math.min(0.8, e.armor + 0.2);
      if (this.mut.has('hasty')) e.speed *= 1.15;
      if (this.mut.has('ironclad')) e.armor = Math.min(0.8, e.armor + 0.2);
      const eliteChance = (0.02 + 0.003 * w) * (this.mut.has('elites') ? 3 : 1);
      if (q.champion) {
        e.champion = q.champion; e.maxHp *= 5; e.r *= 1.35; e.gold *= 4; e.essence = 2; e.dmg += 2;
        if (e.champion === 'hasted') e.speed *= 1.4;
        if (e.champion === 'warded') { e.maxShield = e.maxHp * 0.35; e.shield = e.maxShield; }
      } else if (!def.boss && q.type !== 'swarm' && !q.noElite && this.rng() < eliteChance) {
        e.elite = true; e.maxHp *= 2.5; e.r *= 1.2; e.gold *= 2; e.essence = this.rng() < 0.4 ? 1 : 0;
      }
      if (def.boss) {
        e.maxHp = def.hp * hpm * (this.endless ? 1 + (w - this.totalWaves) * 0.05 : 1) * (0.78 + this.map.order * 0.14);
        e.phase = 1; e.pulseT = 6; e.summonT = 8; e.stepT = 6; e.pulseWarn = 0; e.essence = 5;
        if (q.herald) { e.herald = true; e.maxHp *= this.opts.difficulty === 'nightmare' ? 0.25 : 0.32; e.r *= 0.72; e.gold = Math.round(e.gold * 0.4); e.essence = 3; e.speed *= 1.1; }
        this.boss = e;
        if (this.map.id === 'neon' && !e.herald) { this.forceNight = true; this.ev.emit('banner', 'ETERNAL NIGHT', 'The Nullwarden swallows the light'); }
        if (e.type === 'magmaw') { e.armor = 0.5; e.cataT = 9; }
        e.announce = true; // the 'boss' event fires once the boss has a position (see below)
        this.ev.emit('hitstop', 0.35); this.ev.emit('shake', 14);
      }
      if (q.mods && q.mods.includes('shielded')) { e.maxShield += e.maxHp * 0.25; e.shield = e.maxShield; }
      e.hp = e.maxHp;
      e.smart = e.smart && !e.flying;
      let sp = this.spawns[q.spawn] || this.spawns[0];
      if (def.flying && this.airSpawns) sp = this.airSpawns[q.spawn % this.airSpawns.length];
      if (atPos) {
        e.x = atPos.x; e.y = atPos.y; e.tile = atTile;
      } else {
        e.tile = sp.i; e.x = this.cx(sp.c); e.y = this.cx(sp.r);
        // start just off the map edge
        if (sp.c === 0) e.x -= T * 0.6; else if (sp.c === COLS - 1) e.x += T * 0.6;
        if (sp.r === 0) e.y -= T * 0.6; else if (sp.r === ROWS - 1) e.y += T * 0.6;
      }
      if (e.flying) {
        e.fx0 = e.x; e.fy0 = e.y; e.wob = Math.random() * 6;
      } else {
        e.next = e.tile; // first move: walk into spawn tile center
      }
      this.enemies.push(e);
      const rec = this.waveRecords[w]; if (rec) rec.alive++;
      if (e.announce) { delete e.announce; this.ev.emit('boss', e); }
      return e;
    }
    field(e) { return e.smart ? this.fieldSmart : this.fieldPlain; }
    remaining(e) {
      if (e.flying) return U.dist(e.x, e.y, this.nexus.x, this.nexus.y) / T;
      const f = this.fieldPlain; const n = e.next != null ? e.next : e.tile;
      const d = f[n]; return (isFinite(d) ? d : 99) + U.dist(e.x, e.y, this.cx(n % COLS), this.cx((n / COLS) | 0)) / T;
    }
    isVisible(e) {
      if (e.type !== 'phantom' || this.nightAmt < 0.5) return true;
      for (const s of this.lightSources) if (U.dist2(e.x, e.y, s.x, s.y) < s.r * s.r) return true;
      return false;
    }
    updateLightSources() {
      const L = [];
      if (this.map.lumen) for (let i = 0; i < N; i++) if (this.ley[i]) L.push({ x: this.cx(i % COLS), y: this.cx((i / COLS) | 0), r: 2.6 * T });
      for (const t of this.towers) {
        if (t.def.element === 'light') L.push({ x: t.x, y: t.y, r: 2.4 * T });
        else if (t.def.element === 'arcane') L.push({ x: t.x, y: t.y, r: 2.0 * T });
      }
      this.lightSources = L;
    }

    updateEnemies(dt) {
      const nexus = this.nexus;
      for (let k = 0; k < this.enemies.length; k++) {
        const e = this.enemies[k];
        if (e.dead) continue;
        e.age += dt; e.anim += dt; if (e.flash > -1) e.flash -= dt * 4;
        // timers
        if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
        if (e.chillT > 0) e.chillT -= dt;
        if (e.freezeT > 0) e.freezeT -= dt;
        if (e.stunT > 0) e.stunT -= dt;
        if (e.rootT > 0) e.rootT -= dt;
        if (e.shredT > 0) { e.shredT -= dt; if (e.shredT <= 0) e.shredAmt = 0; }
        if (e.markT > 0) { e.markT -= dt; if (e.markT <= 0) e.markAmt = 0; }
        if (e.wellT > 0) e.wellT -= dt;
        if (e.burnT > 0) { e.burnT -= dt; this.damage(e, e.burnDps * dt, 'fire', e.burnSrc, { dot: true }); if (e.burnT <= 0) e.burnDps = 0; }
        if (e.poisonT > 0) { e.poisonT -= dt; this.damage(e, e.poisonDps * dt, 'nature', e.poisonSrc, { dot: true }); if (e.poisonT <= 0) e.poisonDps = 0; }
        if (e.dead) continue;
        if (e.champion === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
        if (e.champion === 'warded' && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.04 * dt);
        // traits
        e.abilT -= dt;
        if (!e.suppressed) this.enemyTrait(e, dt);
        if (e.boss) this.bossUpdate(e, dt);
        if (e.dead) continue;
        // movement speed
        let sp = e.speed * T;
        if (this.isNight) sp *= 1 + 0.1 * this.nightAmt;
        if (e.wetT > 0) e.wetT -= dt;
        if (this.flooded && !e.flying && this.floodSet.has(e.tile)) { e.wetT = 1.2; sp *= e.boss ? 0.8 : 0.6; }
        const slow = Math.max(e.slowAmt, e.dilate, this.stasisT > 0 ? 0.7 : 0);
        sp *= 1 - Math.min(0.85, slow) * (e.boss ? 0.5 : 1);
        e.dilate = 0; e.vuln = 0; e.suppressed = false;
        const immobile = e.freezeT > 0 || e.stunT > 0 || e.rootT > 0;
        if (immobile && e.boss) sp *= 0.3; else if (immobile) sp = 0;
        if (e.blocker) {
          const m = e.blocker;
          if (m.dead || !m.engagedList.includes(e)) e.blocker = null;
          else { sp = 0; m.hp -= this.meleeDps(e) * dt; if (m.hp <= 0) this.killMinion(m); }
        }
        if (e.siege) { this.siegeTick(e, dt); continue; }
        const px = e.x, py = e.y;
        if (e.flying) {
          const d = U.dist(e.x, e.y, nexus.x, nexus.y);
          if (d < 24) { this.leak(e); continue; }
          const ux = (nexus.x - e.x) / d, uy = (nexus.y - e.y) / d;
          const wob = Math.sin(e.age * 1.6 + e.wob) * 22 * Math.min(1, d / 200);
          e.x += ux * sp * dt + (-uy) * wob * dt; e.y += uy * sp * dt + ux * wob * dt;
        } else if (sp > 0) {
          this.walk(e, sp * dt);
          if (e.dead) continue;
        }
        if (dt > 0) { e.vx = (e.x - px) / dt; e.vy = (e.y - py) / dt; }
        const tc = Math.floor(e.x / T), tr = Math.floor(e.y / T);
        if (!e.flying && this.inb(tc, tr)) {
          const ti = this.idx(tc, tr);
          if (this.type[ti] === P && (this.walkable(ti) || this.bridgeId[ti] >= 0 && !this.bridges[this.bridgeId[ti]].night)) e.tile = ti;
        }
      }
      // remove dead
      if (this.enemies.some(e => e.dead)) this.enemies = this.enemies.filter(e => !e.dead);
    }
    walk(e, step) {
      let guard = 0;
      while (step > 0 && guard++ < 4) {
        if (e.next == null || e.next < 0) e.next = e.tile;
        // falling from a collapsed bridge
        if (!this.walkable(e.tile) && this.bridgeId[e.tile] >= 0) { this.fall(e); return; }
        const n = e.next;
        const nc = n % COLS, nr = (n / COLS) | 0;
        // barricade on next tile
        const o = this.occ[n];
        let tx = this.cx(nc), ty = this.cx(nr);
        const dxn = tx - e.x, dyn = ty - e.y; const dn = Math.hypot(dxn, dyn) || 1;
        if (o && o.barricade && !o.dead) {
          if (dn < T * 0.95) { e.attackingBarricade = o; o.hp -= this.meleeDps(e) * 1.4 * (step / (e.speed * T || 1)); if (o.hp <= 0) this.destroyBarricade(o); return; }
        } else e.attackingBarricade = null;
        // lateral lane offset perpendicular to motion
        const ux = dxn / dn, uy = dyn / dn;
        tx += -uy * e.lane; ty += ux * e.lane;
        const dx = tx - e.x, dy = ty - e.y; const d = Math.hypot(dx, dy);
        if (d <= step || dn < 6) {
          if (d <= step) { e.x = tx; e.y = ty; step -= d; } else step = 0;
          e.tile = n;
          if (n === this.nexus.i) {
            if (e.boss && !this.endless && e.wave === this.map.boss) { this.startSiege(e); return; }
            this.leak(e); return;
          }
          const nn = this.nextTile(n, this.field(e));
          if (nn < 0) { // no route forward (bridge down etc.)
            if (!this.walkable(n)) { this.fall(e); return; }
            e.next = n; return;
          }
          e.next = nn;
        } else {
          e.x += dx / d * step; e.y += dy / d * step; step = 0;
        }
      }
    }
    meleeDps(e) { return (6 + 1.6 * e.wave) * e.dmg * (e.elite ? 1.5 : 1) * (e.champion ? 2 : 1) * (e.boss ? 6 : 1); }
    enemyTrait(e, dt) {
      if (e.type === 'aegis' && e.abilT <= 0) {
        e.abilT = 6;
        const amt = 28 * this.hpMul(e.wave);
        let n = 0;
        for (const o of this.enemies) if (!o.dead && o !== e && !o.boss && U.dist2(o.x, o.y, e.x, e.y) < (2 * T) ** 2) {
          o.maxShield = Math.max(o.maxShield, Math.min(o.maxHp * 0.5, amt)); o.shield = Math.max(o.shield, Math.min(o.maxHp * 0.5, amt)); n++;
        }
        if (n) this.fx('shieldPulse', e.x, e.y, 2 * T);
      } else if (e.type === 'mender') {
        for (const o of this.enemies) if (!o.dead && !o.boss && U.dist2(o.x, o.y, e.x, e.y) < (1.7 * T) ** 2 && o.hp < o.maxHp) {
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.04 * dt * (o === e ? 0.5 : 1));
        }
        if (e.abilT <= 0) { e.abilT = 1.2; this.fx('heal', e.x, e.y, 1.7 * T); }
      } else if (e.type === 'blinker' && e.abilT <= 0) {
        e.abilT = 4;
        if (e.freezeT > 0 || e.rootT > 0 || e.stunT > 0 || e.blocker || e.attackingBarricade) return;
        let i = e.next != null ? e.next : e.tile;
        for (let s = 0; s < 3; s++) { const n = this.nextTile(i, this.field(e)); if (n < 0) break; const o = this.occ[n]; if (o && o.barricade) break; i = n; }
        if (i === this.nexus.i) return;
        this.fx('blink', e.x, e.y, e.def.color);
        e.x = this.cx(i % COLS); e.y = this.cx((i / COLS) | 0); e.tile = i;
        e.next = this.nextTile(i, this.field(e)); if (e.next < 0) e.next = i;
        this.fx('blink', e.x, e.y, e.def.color);
        this.sfx('blink', e.x, e.y);
      }
    }
    bossUpdate(e, dt) {
      const ratio = e.hp / e.maxHp;
      const want = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      const mag = e.type === 'magmaw';
      const mapId = this.map.id;
      if (want > e.phase) {
        e.phase = want;
        this.ev.emit('bossPhase', e, want);
        this.ev.emit('hitstop', 0.4); this.ev.emit('shake', 18); this.ev.emit('flash', 0.5);
        this.fx('shockwave', e.x, e.y, 4 * T, mag ? '#ff7a2a' : '#b45cff');
        this.sfx('bossRoar', e.x, e.y);
        if (mag) {
          if (want === 2) { e.armor = 0.15; e.speed *= 1.25; e.trailT = 0; this.fx('debris', e.x, e.y, '#3a2420'); }
          if (want === 3) { e.speed *= 1.15; e.cataT = 2.5; }
        } else {
          if (want === 2) { e.maxShield = e.maxHp * 0.2; e.shield = e.maxShield; e.summonT = 1; }
          if (want === 3) { e.speed *= 1.5; e.armor = Math.max(0, e.armor - 0.1); e.stepT = 2; }
          if (mapId === 'skyreach') this.gravityShatter(e);
        }
      }
      if (mag) { this.magmawUpdate(e, dt); }
      else {
        const pulseCd = e.phase === 1 ? 9 : e.phase === 2 ? 7.5 : 6;
        if (e.pulseWarn > 0) {
          e.pulseWarn -= dt;
          if (e.pulseWarn <= 0) {
            const R2 = (2.6 * T) ** 2;
            let n = 0;
            for (const t of this.towers) if (U.dist2(t.x, t.y, e.x, e.y) < R2) { t.disabledT = Math.max(t.disabledT, 3); n++; this.fx('disable', t.x, t.y); }
            for (const b of this.barricades) if (U.dist2(b.x, b.y, e.x, e.y) < R2) { b.hp = 0; this.destroyBarricade(b); }
            for (const m of this.minions) if (!m.dead && U.dist2(m.x, m.y, e.x, e.y) < R2) this.killMinion(m);
            this.fx('nullPulse', e.x, e.y, 2.6 * T);
            this.sfx('nullPulse', e.x, e.y); this.ev.emit('shake', 9);
            if (n) this.text(e.x, e.y - 70, n + (n === 1 ? ' tower' : ' towers') + ' nullified!', '#c9a8ff', 20);
            if (mapId === 'verdant') { // the Nullwarden devours ley energy
              let drained = 0;
              for (let i = 0; i < N; i++) if (this.ley[i] && U.dist2(this.cx(i % COLS), this.cx((i / COLS) | 0), e.x, e.y) < (4 * T) ** 2) { if (!(this.leyDrain[i] > 0)) drained++; this.leyDrain[i] = 12; this.fx('drain', this.cx(i % COLS), this.cx((i / COLS) | 0), e.x, e.y); }
              if (drained) { this.text(e.x, e.y - 95, 'LEY NODES DRAINED', '#8fffb0', 18); this.refreshTowers(); }
            }
          }
        } else {
          e.pulseT -= dt;
          if (e.pulseT <= 0) { e.pulseT = pulseCd; e.pulseWarn = 1.3; this.sfx('warn', e.x, e.y); }
        }
        if (e.phase >= 2) {
          e.summonT -= dt;
          if (e.summonT <= 0) {
            e.summonT = 11;
            const sum = mapId === 'neon' ? [['phantom', 3], ['skitter', 3]] : mapId === 'skyreach' ? [['shrike', 3], ['swarm', 4]] : [['swarm', 6], ['husk', 2]];
            for (const [type, n] of sum) for (let k = 0; k < n; k++) { const m = this.spawnEnemy({ type, wave: e.wave, noElite: true }, e.tile, { x: e.x + U.rand(-30, 30), y: e.y + U.rand(-30, 30) }); m.next = e.next; }
            this.fx('summon', e.x, e.y); this.sfx('summon', e.x, e.y);
          }
        }
        if (e.phase === 3) {
          e.stepT -= dt;
          if (e.stepT <= 0 && !e.blocker) {
            e.stepT = 7;
            let i = e.next != null ? e.next : e.tile;
            for (let s = 0; s < 3; s++) { const n = this.nextTile(i, this.fieldPlain); if (n < 0 || n === this.nexus.i) break; i = n; }
            this.fx('blink', e.x, e.y, '#b45cff');
            e.x = this.cx(i % COLS); e.y = this.cx((i / COLS) | 0); e.tile = i;
            const nn = this.nextTile(i, this.fieldPlain); e.next = nn < 0 ? i : nn;
            this.fx('shockwave', e.x, e.y, 2 * T, '#b45cff'); this.ev.emit('shake', 10); this.sfx('riftStep', e.x, e.y);
          }
        }
      }
      // trample minions
      for (const m of this.minions) if (!m.dead && U.dist2(m.x, m.y, e.x, e.y) < (e.r + 14) ** 2) { m.hp -= 220 * dt; if (m.hp <= 0) this.killMinion(m); }
    }
    gravityShatter(e) {
      // Skyreach: the boss shatters the most heavily defended bridge, forcing its army down the other route
      let best = null, bv = -1;
      for (const b of this.bridges) {
        if (b.night || !b.up) continue;
        const test = this.dijkstra(false, { id: b.id, up: false });
        if (!this.spawns.every(sp => isFinite(test[sp.i]))) continue;
        let v = 0; for (const i of b.tiles) v += this.threat ? this.threat[i] : 0;
        for (const t of this.towers) if (U.dist2(t.x, t.y, b.x, b.y) < (4 * T) ** 2) v += 1;
        if (v > bv) { bv = v; best = b; }
      }
      if (!best) return;
      best.cd = 0;
      this.zaps.push({ pts: [[e.x, e.y - 30], [best.x, best.y]], color: '#c9a8ff', t: 0.5, w: 6, jag: true });
      this.collapseBridge(best, true);
      this.ev.emit('banner', 'GRAVITY SHATTER', 'The Nullwarden tears down a bridge — its army reroutes!');
    }
    magmawUpdate(e, dt) {
      // Phase II+: molten trail that scorches minions and barricades
      if (e.phase >= 2) {
        e.trailT = (e.trailT || 0) - dt;
        if (e.trailT <= 0) {
          e.trailT = 0.35;
          const i = e.tile;
          if (i != null && i >= 0) {
            this.molten[i] = 9;
            const o = this.occ[i]; if (o && o.barricade) { o.hp = 0; this.destroyBarricade(o); }
          }
        }
      }
      // Phase III: Cataclysm — every vent erupts and scorches nearby towers
      if (e.phase === 3) {
        e.cataT -= dt;
        if (e.cataT <= 1.5 && !e.cataWarn) { e.cataWarn = true; for (const v of this.vents) { v.warn = 1; v.t = Math.min(v.t, 1.5); } this.sfx('rumble'); this.ev.emit('shake', 4); }
        if (e.cataT <= 0) {
          e.cataT = 9; e.cataWarn = false;
          for (const v of this.vents) this.eruptVent(v, true);
          for (let k = 0; k < 3; k++) { const m = this.spawnEnemy({ type: 'skitter', wave: e.wave, noElite: true }, e.tile, { x: e.x + U.rand(-30, 30), y: e.y + U.rand(-30, 30) }); m.next = e.next; }
          const m = this.spawnEnemy({ type: 'bulwark', wave: e.wave, noElite: true }, e.tile, { x: e.x, y: e.y }); m.next = e.next;
          this.ev.emit('banner', 'CATACLYSM', 'Every vent erupts — nearby towers are scorched');
        }
      }
    }
    eruptVent(v, cataclysm) {
      v.t = 16 + this.rng() * 5; v.warn = 0;
      const dmg = 45 * this.hpMul(Math.max(1, this.wave));
      for (const e of this.enemies) {
        if (e.dead || e.flying) continue;
        const d2 = U.dist2(e.x, e.y, v.x, v.y);
        if (e.type === 'magmaw' && d2 < (3 * T) ** 2) { // Magmaw feeds on the forge
          const heal = e.maxHp * (cataclysm ? 0.015 : 0.04);
          e.hp = Math.min(e.maxHp, e.hp + heal);
          this.fedT = this.time - (this.fedAt || -9) < 1 ? (this.fedT || 0) + heal : heal; this.fedAt = this.time;
          this.ev.emit('text', e.x, e.y - 80, 'MAGMAW FEEDS +' + U.fmt(this.fedT), '#ffb36b', 18, 'feeds');
          this.zaps.push({ pts: [[v.x, v.y], [e.x, e.y]], color: '#ff7a2a', t: 0.4, w: 5, jag: true });
          continue;
        }
        if (d2 < (1.7 * T) ** 2) { this.damage(e, dmg, 'fire', null); if (!e.dead) { e.burnDps = Math.max(e.burnDps, dmg * 0.1); e.burnT = 3; } }
      }
      for (const t of this.towers) if (U.dist2(t.x, t.y, v.x, v.y) < (1.6 * T) ** 2) {
        if (cataclysm) { t.disabledT = Math.max(t.disabledT, 4); this.fx('disable', t.x, t.y); }
        else { t.forgedT = 8; this.fx('ring', t.x, t.y, 44, '#ff7a2a'); }
      }
      this.fx('eruption', v.x, v.y, 1.7 * T); this.sfx('eruption', v.x, v.y); this.ev.emit('shake', 5);
    }
    fall(e) {
      if (e.boss) {
        this.damage(e, e.maxHp * 0.08, 'true', null);
        const i = this.nearestWalkable(e.x, e.y);
        e.x = this.cx(i % COLS); e.y = this.cx((i / COLS) | 0); e.tile = i;
        const nn = this.nextTile(i, this.fieldPlain); e.next = nn < 0 ? i : nn;
        this.fx('blink', e.x, e.y, '#b45cff');
        return;
      }
      this.fx('fall', e.x, e.y, e.def.color, e.r);
      this.text(e.x, e.y - 20, 'FELL!', '#9fe8ff', 18);
      this.kill(e, null, true);
    }
    // The final boss at the Nexus: it lays siege, draining integrity until it is destroyed (a fight, not an instant loss)
    startSiege(e) {
      e.siege = true; e.siegeT = 1.2;
      this.bossEscaped = null;
      this.ev.emit('banner', 'LAST STAND', 'The Nexus fires back — finish ' + e.def.name.split(',')[0] + ' before it falls!');
      this.fx('shockwave', this.nexus.x, this.nexus.y, 3 * T, '#ff5050'); this.sfx('bossRoar'); this.ev.emit('shake', 14);
    }
    siegeTick(e, dt) {
      e.siegeT -= dt;
      e.x += (this.nexus.x - 46 - e.x) * Math.min(1, dt * 3); e.y += (this.nexus.y - e.y) * Math.min(1, dt * 3);
      // Last Stand: the Nexus fires back, so a nearly-dead boss crumbles at the gates
      const ls = ({ story: 0.02, veteran: 0.013, nightmare: 0.011 }[this.opts.difficulty || 'veteran'] || 0.012) + (e.hp / e.maxHp < 0.1 ? 0.05 : 0); // a near-dead boss crumbles at the gates
      this.damage(e, e.maxHp * ls * dt, 'true', null, { dot: true });
      e.lastStandT = (e.lastStandT || 0) - dt;
      if (e.lastStandT <= 0) { e.lastStandT = 0.35; this.zaps.push({ pts: [[this.nexus.x, this.nexus.y - 34], [e.x, e.y]], color: '#9fe8ff', t: 0.2, w: 4, jag: true }); }
      if (e.dead) return;
      if (e.siegeT > 0) return;
      e.siegeT = (0.9 + 2.4 * (1 - e.hp / e.maxHp)) * (this.opts.difficulty === 'story' ? 1.8 : 1);
      this.lives -= 1; this.leaks++;
      this.ev.emit('leak', e, 1); this.ev.emit('shake', 6);
      this.fx('leak', this.nexus.x, this.nexus.y);
      this.zaps.push({ pts: [[e.x, e.y], [this.nexus.x, this.nexus.y - 30]], color: '#ff5050', t: 0.3, w: 5, jag: true });
      if (this.lives <= 0) {
        if (this.has('phoenix') && !this.phoenixUsed) { this.phoenixUsed = true; this.lives = 5; this.ev.emit('banner', 'PHOENIX PROTOCOL', 'The Nexus refuses to fall.'); this.sfx('phoenix'); }
        else { this.lives = 0; this.bossEscaped = e.def.name; this.defeat(); }
      }
    }
    leak(e) {
      e.dead = true;
      const finalBoss = e.boss && !this.endless && e.wave === this.map.boss;
      const dmg = finalBoss ? this.lives : e.boss ? Math.max(e.herald ? 4 : 5, Math.ceil((e.herald ? 8 : 12) * e.hp / e.maxHp)) : e.dmg + (e.champion ? (this.opts.difficulty === 'nightmare' ? 1 : 2) : 0) + (e.elite ? 1 : 0);
      this.lives -= dmg; this.leaks++;
      if (finalBoss) this.bossEscaped = e.def.name;
      const rec = this.waveRecords[e.wave]; if (rec) { rec.leaks++; this.resolveOne(rec); }
      if (e === this.boss) { this.boss = null; this.forceNight = false; }
      this.ev.emit('leak', e, dmg);
      this.sfx('leak'); this.ev.emit('shake', 8); this.ev.emit('flash', 0.25);
      this.fx('leak', this.nexus.x, this.nexus.y);
      if (this.lives <= 0) {
        if (this.has('phoenix') && !this.phoenixUsed) {
          this.phoenixUsed = true; this.lives = 5; this.bossEscaped = null;
          this.ev.emit('banner', 'PHOENIX PROTOCOL', 'The Nexus refuses to fall.');
          this.fx('shockwave', this.nexus.x, this.nexus.y, 6 * T, '#ffb36b'); this.sfx('phoenix');
        } else { this.lives = 0; this.defeat(); }
      }
    }
    resolveOne(rec) {
      rec.alive--;
      if (rec.alive <= 0 && rec.pending <= 0) this.waveResolved(rec);
    }

    damage(e, amt, type, src, o) {
      if (e.dead || amt <= 0) return 0;
      o = o || {};
      let mult = 1 + e.shredAmt + e.markAmt + e.vuln;
      if (e.freezeT > 0 && e.shatterAmt) mult += e.shatterAmt;
      if (src && src.mods) {
        if (src.mods.includes('shatter') && (e.armor > 0.2 || e.shield > 0)) mult += 0.3;
        if (src.mods.includes('exec') && (e.elite || e.champion || e.boss)) mult += 0.5;
      }
      let arm = e.armor;
      if (type === 'phys') arm *= 1 - (o.armorPierce || 0);
      else if (type === 'arcane' || type === 'true') arm = 0;
      else arm *= 0.5;
      if (src && src.mods && src.mods.includes('shatter')) arm *= 0.5;
      let dmg = amt * mult * (1 - arm);
      let dealt = 0;
      if (e.shield > 0) {
        const sm = type === 'storm' ? 2 : 1;
        const absorb = Math.min(e.shield, dmg * sm);
        e.shield -= absorb; dmg -= absorb / sm; dealt += absorb / sm;
        if (e.shield <= 0.5) { e.shield = 0; this.fx('shieldBreak', e.x, e.y, e.r); }
      }
      if (dmg > 0) { e.hp -= dmg; dealt += dmg; }
      if (!o.dot && e.flash <= -0.15) e.flash = 1;
      e.hitBy = src;
      if (src) { src.dmgDealt = (src.dmgDealt || 0) + dealt; if (src.buffBy && src.s) src.buffBy.enabled = (src.buffBy.enabled || 0) + dealt * src.buffBy.s.auraDmg / src.s.dmgMul; }
      // aggregate damage numbers per enemy to keep the battlefield readable
      e.numAcc = (e.numAcc || 0) + dealt; if (o.crit) e.numCrit = true; if (!o.dot) e.numType = type;
      if (this.time - (e.numT || -9) > 0.45 || e.hp <= 0) {
        if (e.numAcc >= e.maxHp * 0.08 || e.numCrit) this.ev.emit('dmgText', e.x, e.y - e.r, e.numAcc, e.numCrit, e.numType || type, !!o.dot && !e.numCrit);
        e.numAcc = 0; e.numCrit = false; e.numT = this.time;
      }
      if (e.hp <= 0) this.kill(e, src);
      return dealt;
    }
    kill(e, src, fell) {
      if (e.dead) return;
      e.dead = true; e.hp = 0;
      this.kills++;
      let gold = e.gold * this.goldMul * (this.has('bounty') ? 1.1 : 1) * (1 + 0.035 * (e.wave - 1));
      if (src && src.mods && src.mods.includes('midas')) gold += 2;
      for (const t of this.towers) if (t.s.killGold && U.dist2(t.x, t.y, e.x, e.y) < (t.s.range * T) ** 2) { gold += t.s.killGold; t.goldMade = (t.goldMade || 0) + t.s.killGold; }
      gold = Math.max(1, Math.round(gold));
      this.addGold(gold);
      this.score += gold * 10 + (e.boss ? 5000 : 0);
      if (src) src.kills = (src.kills || 0) + 1;
      if (e.essence) { this.essence += e.essence; this.ev.emit('text', e.x, e.y - 34, '+' + e.essence + ' Essence', '#ff7ae0', 18, 'ess'); this.sfx('essence', e.x, e.y); }
      this.ev.emit('kill', e, gold);
      if (!e.boss) this.fx('corpse', e.x, e.y, e.type, e.r, Math.atan2(e.vy || 0, e.vx || 1));
      this.fx('death', e.x, e.y, e.def.color, e.r, e.boss || e.champion || e.elite);
      this.sfx(e.boss ? 'bossDeath' : (e.elite || e.champion) ? 'eliteDeath' : 'death_' + e.type, e.x, e.y);
      if (e.herald) { const hb = Math.round((60 + 6 * e.wave) * this.goldMul); this.addGold(hb); this.essence += 1; this.ev.emit('banner', 'HERALD BANISHED', `+${hb} gold · +1 Essence — fortify for the battles ahead`); }
      if (e.boss) { this.boss = null; this.forceNight = false; this.ev.emit('hitstop', 0.6); this.ev.emit('shake', 26); this.ev.emit('flash', 0.8); this.fx('shockwave', e.x, e.y, 8 * T, '#ffffff'); }
      else if (e.champion) { this.ev.emit('hitstop', 0.12); this.ev.emit('shake', 6); }
      // spread poison (thornbloom)
      if (e.poisonT > 0 && e.poisonSrc && e.poisonSrc.s && e.poisonSrc.s.spread) {
        for (const o of this.enemies) if (!o.dead && U.dist2(o.x, o.y, e.x, e.y) < (1.2 * T) ** 2) { o.poisonDps = Math.max(o.poisonDps, e.poisonDps); o.poisonT = 3; o.poisonSrc = e.poisonSrc; }
      }
      if (e.type === 'brood') {
        for (let k = 0; k < 6; k++) { const s = this.spawnEnemy({ type: 'swarm', wave: e.wave, noElite: true }, e.tile, { x: e.x + U.rand(-18, 18), y: e.y + U.rand(-18, 18) }); s.next = e.next; s.flying = false; }
      }
      if (e.champion === 'splitting') {
        for (let k = 0; k < 3; k++) {
          const s = this.spawnEnemy({ type: e.type, wave: e.wave, noElite: true }, e.tile, { x: e.x + U.rand(-16, 16), y: e.y + U.rand(-16, 16) });
          s.maxHp *= 0.6; s.hp = s.maxHp; s.next = e.next;
          if (e.flying) { s.fx0 = s.x; s.fy0 = s.y; }
        }
      }
      const rec = this.waveRecords[e.wave]; if (rec) this.resolveOne(rec);
    }
    addGold(g, track = true) { this.gold += g; if (track) this.goldEarned += g; }

    // ============================================================ TOWERS
    levelStats(t) {
      const def = t.def;
      if (t.level <= 2) return def.levels[t.level];
      return def.branches[t.branch].levels[t.level - 3];
    }
    nextLevelInfo(t) {
      const cm = c => this.costMul(c, t.id);
      if (t.level < 2) return [{ level: t.level + 1, branch: -1, stats: t.def.levels[t.level + 1], cost: cm(t.def.levels[t.level + 1].cost) }];
      if (t.level === 2) return t.def.branches.map((b, bi) => ({ level: 3, branch: bi, stats: b.levels[0], cost: cm(b.levels[0].cost), name: b.name, blurb: b.blurb }));
      if (t.level === 3) { const b = t.def.branches[t.branch]; return [{ level: 4, branch: t.branch, stats: b.levels[1], cost: cm(b.levels[1].cost), name: b.name }]; }
      return [];
    }
    costMul(c, id) { return Math.round(c * (this.has('assembly') ? 0.92 : 1) * (id && this.has('mastery_' + id) ? 0.9 : 1)); }
    towerCost(id) { return id === 'barricade' ? D.BARRICADE.cost : this.costMul(D.TOWERS[id].levels[0].cost, id); }
    towerUnlocked(id) { const d = D.TOWERS[id]; return !d.locked || this.has(d.locked); }
    tierName(t) { return t.level <= 2 ? 'Tier ' + (t.level + 1) : t.def.branches[t.branch].name + (t.level === 4 ? ' II' : ' I'); }
    modSlots(t) { return t.level >= 4 ? 2 : t.level >= 3 ? 1 : (this.has('modforge') && t.level >= 2 ? 1 : 0); }

    canPlace(id, c, r) {
      if (this.over) return { ok: false, why: '' };
      if (id === 'barricade') {
        if (this.barricades.length >= this.barricadeMax) return { ok: false, why: 'Barricade limit reached (' + this.barricadeMax + ')' };
        if (!this.barricadeOk(c, r)) return { ok: false, why: 'Barricades go on open path tiles' };
      } else {
        if (!this.towerUnlocked(id)) return { ok: false, why: 'Locked — research Void Theory' };
        if (!this.buildable(c, r)) return { ok: false, why: 'Cannot build here' };
      }
      if (this.gold < this.towerCost(id)) return { ok: false, why: 'Not enough gold' };
      return { ok: true };
    }
    place(id, c, r) {
      const chk = this.canPlace(id, c, r);
      if (!chk.ok) { this.ev.emit('error', chk.why); return null; }
      const cost = this.towerCost(id);
      this.gold -= cost;
      const i = this.idx(c, r);
      if (id === 'barricade') {
        const b = { barricade: true, uid: this.uid(), c, r, i, x: this.cx(c), y: this.cx(r), hp: D.BARRICADE.hp * (this.has('engineering') ? 1.6 : 1) * (1 + 0.08 * this.wave), invested: cost, born: this.time };
        b.maxHp = b.hp;
        this.barricades.push(b); this.occ[i] = b;
        this.builtThisPrep.add(b.uid);
        this.computeFields();
        this.fx('build', b.x, b.y, D.BARRICADE.color); this.sfx('build', b.x, b.y);
        this.ev.emit('placed', b);
        return b;
      }
      const def = D.TOWERS[id];
      const t = {
        uid: this.uid(), id, def, c, r, i, x: this.cx(c), y: this.cx(r), level: 0, branch: -1, invested: cost,
        cd: 0.3, angle: -Math.PI / 2, target: null, targeting: def.id === 'mortar' ? 'strong' : 'first', kills: 0, dmgDealt: 0,
        abilityCd: 0, overclockT: 0, overclockCd: 0, strain: 0, burnoutT: 0, disabledT: 0, forgedT: 0, focusT: 0, freeOc: false,
        mods: [], syn: new Set(), onLey: !!this.ley[i], pulseCount: 0, attackCount: 0, born: this.time, upAnim: 0,
        beamT: 0, beamTarget: null, minionTimers: [], rally: null, vineT: 0, buffBy: null,
      };
      this.towers.push(t); this.occ[i] = t;
      this.builtThisPrep.add(t.uid);
      this.refreshTowers();
      if (def.id === 'grove') this.setRally(t);
      this.fx('build', t.x, t.y, def.color); this.sfx('build', t.x, t.y);
      this.ev.emit('placed', t);
      return t;
    }
    upgrade(t, branch) {
      const opts = this.nextLevelInfo(t);
      if (!opts.length) return false;
      const o = opts.length > 1 ? opts[branch] : opts[0];
      if (!o) return false;
      if (this.gold < o.cost) { this.ev.emit('error', 'Not enough gold'); return false; }
      this.gold -= o.cost; t.invested += o.cost;
      t.level = o.level; if (o.branch >= 0) t.branch = o.branch;
      t.upAnim = 1;
      this.refreshTowers();
      if (t.def.id === 'grove') this.syncMinions(t, true);
      this.fx('upgrade', t.x, t.y, t.def.color, t.level);
      this.sfx(t.level >= 3 ? 'upgradeBig' : 'upgrade', t.x, t.y);
      if (t.level >= 3) this.ev.emit('text', t.x, t.y - 50, '★'.repeat(t.level - 2), t.def.color, 18, 'up' + t.uid); // names live in the hover tooltip / panel
      this.ev.emit('upgraded', t);
      return true;
    }
    sellValue(t) { return this.builtThisPrep.has(t.uid) && !this.waveActive ? t.invested : Math.floor(t.invested * 0.7); }
    sell(t) {
      const v = this.sellValue(t);
      this.gold += v;
      this.occ[t.i] = null;
      if (t.barricade) { this.barricades = this.barricades.filter(b => b !== t); t.dead = true; }
      else {
        this.towers = this.towers.filter(x => x !== t);
        for (const m of this.minions) if (m.owner === t) m.dead = true;
        this.minions = this.minions.filter(m => !m.dead);
        t.dead = true;
      }
      this.refreshTowers();
      this.fx('sell', t.x, t.y); this.sfx('sell', t.x, t.y);
      this.text(t.x, t.y - 30, '+' + v + 'g', '#ffd96a', 20);
      this.ev.emit('sold', t);
      return v;
    }
    relocate(t, c, r) {
      if (this.relocations <= 0) { this.ev.emit('error', 'No relocations left'); return false; }
      if (!this.buildable(c, r)) { this.ev.emit('error', 'Cannot build here'); return false; }
      this.fx('blink', t.x, t.y, t.def.color);
      this.occ[t.i] = null;
      t.c = c; t.r = r; t.i = this.idx(c, r); t.x = this.cx(c); t.y = this.cx(r); t.onLey = !!this.ley[t.i];
      this.occ[t.i] = t; this.relocations--;
      t.disabledT = Math.max(t.disabledT, 1.5);
      if (t.def.id === 'grove') { for (const m of this.minions) if (m.owner === t) m.dead = true; this.minions = this.minions.filter(m => !m.dead); this.setRally(t); }
      this.refreshTowers();
      this.fx('build', t.x, t.y, t.def.color); this.sfx('relocate', t.x, t.y);
      return true;
    }
    destroyBarricade(b) {
      if (b.dead) return;
      b.dead = true; this.occ[b.i] = null;
      this.barricades = this.barricades.filter(x => x !== b);
      this.fx('debris', b.x, b.y, D.BARRICADE.color); this.sfx('crumble', b.x, b.y);
      this.computeFields();
    }
    refreshTowers() {
      // synergies
      const SR2 = (D.SYNERGY_RANGE * T) ** 2;
      this.synLinks = [];
      for (const t of this.towers) t.syn = new Set();
      for (let a = 0; a < this.towers.length; a++) for (let b = a + 1; b < this.towers.length; b++) {
        const A = this.towers[a], B = this.towers[b];
        if (U.dist2(A.x, A.y, B.x, B.y) > SR2) continue;
        for (const s of D.SYNERGIES) {
          const ea = A.def.element, eb = B.def.element;
          if ((ea === s.a && eb === s.b) || (ea === s.b && eb === s.a)) { A.syn.add(s.id); B.syn.add(s.id); this.synLinks.push({ a: A, b: B, syn: s }); }
        }
      }
      // conduits first (no conduit-on-conduit buffs)
      for (const t of this.towers) if (t.def.support) this.computeStats(t, null);
      for (const t of this.towers) if (!t.def.support) {
        let best = null;
        for (const c of this.towers) if (c.def.support && c !== t && c.disabledT <= 0 && U.dist2(c.x, c.y, t.x, t.y) <= (c.s.range * T + 4) ** 2) if (!best || c.s.auraDmg > best.s.auraDmg) best = c;
        this.computeStats(t, best);
      }
      this.updateLightSources();
      this.computeFields();
    }
    computeStats(t, aura) {
      const base = this.levelStats(t);
      const s = Object.assign({}, base);
      let dmgMul = 1 + (this.has('foundations') ? 0.08 : 0) + (this.has('master') ? 0.1 : 0) + 0.06 * (this.opts.ascension || 0) + (this.has('mastery_' + t.def.id) ? 0.04 : 0);
      let rangeMul = 1 + (this.has('master') ? 0.05 : 0);
      let rateMul = 1;
      if (t.onLey && !(this.leyDrain && this.leyDrain[t.i] > 0)) { dmgMul += 0.25; rangeMul += 0.2; }
      t.buffBy = aura;
      if (aura) { dmgMul += aura.s.auraDmg; rateMul += aura.s.auraRate; rangeMul += aura.s.auraRange || 0; s.cdr = aura.s.auraCdr || 0; }
      if (t.mods.includes('overdrive')) rateMul += 0.15;
      if (t.mods.includes('lens')) rangeMul += 0.15;
      const syn = t.syn, el = t.def.element;
      if (this.has('mastery_' + t.def.id)) switch (t.def.id) { // signature perks
        case 'prism': s.extraArc = (s.extraArc || 0) + 1; s.crit = (s.crit || 0) + 0.1; s.critMult = s.critMult || 2; break;
        case 'mortar': s.burnDur = (s.burnDur || 2) * 1.5; s.splash *= 1.15; break;
        case 'frost': s.shred = Math.max(s.shred || 0, 0.15); s.shredDur = s.shredDur || 3; break;
        case 'storm': if (s.chain) s.chain += 2; s.stun = Math.max(s.stun || 0, 0.1); break;
        case 'grove': s.minions = (s.minions || 0) + 1; s.minionHp *= 1.3; if (s.treantHp) s.treantHp *= 1.3; break;
        case 'conduit': s.killGold = (s.killGold || 0) + 1; s.income = Math.round(s.income * 1.3); break;
        case 'void': s.wellDur *= 1.35; s.pull *= 1.25; break;
      }
      if (syn.has('radiance')) { if (el === 'light') s.crit = (s.crit || 0) + 0.12, s.critMult = s.critMult || 2; if (el === 'arcane') rangeMul += 0.1; }
      if (syn.has('ionized')) { if (el === 'light') s.extraArc = 1; if (el === 'storm') rangeMul += 0.1; }
      if (syn.has('permafrost')) { if (el === 'nature') s.rootMul = 1.5; if (el === 'frost') s.slow = (s.slow || 0) + 0.08; }
      if (syn.has('eventstorm') && el === 'storm' && s.chain) s.chain += 2;
      if (syn.has('starforge')) { if (el === 'fire') { s.splash *= 1.2; if (s.bombletSplash) s.bombletSplash *= 1.2; } if (el === 'void') s.ignite = true; }
      if (syn.has('wildfire')) { if (el === 'fire') s.wildRoot = 0.25; if (el === 'nature') s.ignite = true; }
      if (syn.has('superconduct') && el === 'storm') s.superconduct = 0.4;
      if (syn.has('thermal')) { if (el === 'fire') s.thermal = 0.4; if (el === 'frost') s.thermal = 0.25; }
      if (syn.has('eventstorm') && el === 'storm') s.wellBonus = 0.3;
      for (const k of ['dmg', 'dps', 'burn', 'pool', 'bombletDmg', 'boltDmg', 'minionDmg', 'treantDmg', 'vines']) if (s[k]) s[k] *= dmgMul;
      if (!t.def.support) s.range *= rangeMul; else s.range *= rangeMul;
      if (s.rate) s.rate *= rateMul;
      if (s.minionRate) s.minionRate *= rateMul;
      s.dmgMul = dmgMul; s.rateMul = rateMul;
      t.s = s;
    }
    estimateDps(t, sOverride) {
      const s = sOverride || t.s; if (!s) return 0;
      switch (t.def.id) {
        case 'prism': {
          let d = s.dmg * s.rate * (1 + (s.crit || 0) * ((s.critMult || 2) - 1));
          if (s.multishot) d *= 1 + (s.multishot - 1) * 0.6;
          if (s.pierceLine) d *= 1.4;
          return d;
        }
        case 'mortar': return (s.dmg * 1.8 + (s.bomblets || 0) * (s.bombletDmg || 0) * 0.7) * s.rate + (s.burn || 0) * 1.5 + (s.pool || 0) * 0.5;
        case 'frost': return s.dmg * s.rate * 2.5;
        case 'storm': return s.beam ? s.dps * (1 + s.rampMax) / 2 * (1 + (s.beamPierce || 0) * 0.5) : s.dmg * s.rate * (1 + (s.chain - 1) * 0.55) + (s.boltDmg ? s.boltDmg * s.rate / s.boltEvery : 0);
        case 'grove': return s.dmg * s.rate + (s.minions || 0) * (s.minionDmg || 0) * (s.minionRate || 1) * 0.7 + (s.treantDmg || 0) * 1.5 + (s.vines || 0) * 1.5;
        case 'void': return s.dps * s.wellDur * s.rate * 2.2;
      }
      return 0;
    }
    singleTargetDps(t) {
      const s = t.s; if (!s || t.def.support) return 0;
      switch (t.def.id) {
        case 'prism': return s.dmg * s.rate * (1 + (s.crit || 0) * ((s.critMult || 2) - 1)) * (s.armorPierce ? 1.15 : 0.85);
        case 'mortar': return s.dmg * s.rate + (s.burn || 0) * 0.8 + (s.pool || 0) * 0.4;
        case 'frost': return s.dmg * s.rate * (s.shred ? 1.3 : 1);
        case 'storm': return s.beam ? s.dps * (1 + s.rampMax) / 2 * 1.2 : s.dmg * s.rate * 1.3 + (s.boltDmg ? s.boltDmg * s.rate / s.boltEvery : 0);
        case 'grove': return s.dmg * s.rate + (s.vines || 0) + (s.treantDmg ? s.treantDmg * 0.8 * 0.3 : 0);
        case 'void': return s.dps * s.wellDur * s.rate * (1 + (s.vulnerable || 0));
      }
      return 0;
    }
    bossReadiness(waveNo, herald) {
      // estimate of damage the current defence deals to the boss along its route, vs. its effective HP
      const type = this.map.bossType || 'nullwarden', def = D.ENEMIES[type];
      let hp = def.hp * this.hpMul(waveNo) * (0.78 + this.map.order * 0.14) * (herald ? 0.32 : 1);
      const ehp = hp * (type === 'magmaw' ? 1.25 : 1.2) / (1 - def.armor * 0.45);
      const speed = def.speed * (herald ? 1.1 : 1) * 1.12 * T;
      const route = this.routes[0] ? this.routes[0].plain : [];
      let dmg = 0;
      for (const t of this.towers) {
        if (t.def.support) continue;
        const R2 = (t.s.range * T) ** 2; let tiles = 0;
        for (const i of route) if (U.dist2(t.x, t.y, this.cx(i % COLS), this.cx((i / COLS) | 0)) <= R2) tiles++;
        dmg += this.singleTargetDps(t) * (tiles * T / speed) * 0.85; // ~15% lost to Null Pulse / downtime
      }
      return dmg / ehp;
    }
    dpsLabel(t) { return t.def.support ? 'Support' : Math.round(this.estimateDps(t)); }

    // Preview stats for a hypothetical tower (placement preview)
    previewTower(id, c, r) {
      const def = D.TOWERS[id];
      const fake = { id, def, c, r, i: this.idx(c, r), x: this.cx(c), y: this.cx(r), level: 0, branch: -1, mods: [], syn: new Set(), onLey: !!this.ley[this.idx(c, r)], disabledT: 0 };
      const SR2 = (D.SYNERGY_RANGE * T) ** 2;
      const links = [];
      for (const B of this.towers) {
        if (U.dist2(fake.x, fake.y, B.x, B.y) > SR2) continue;
        for (const s of D.SYNERGIES) { const ea = def.element, eb = B.def.element; if ((ea === s.a && eb === s.b) || (ea === s.b && eb === s.a)) { fake.syn.add(s.id); links.push({ b: B, syn: s }); } }
      }
      let best = null;
      if (!def.support) for (const cnd of this.towers) if (cnd.def.support && U.dist2(cnd.x, cnd.y, fake.x, fake.y) <= (cnd.s.range * T + 4) ** 2) if (!best || cnd.s.auraDmg > best.s.auraDmg) best = cnd;
      this.computeStats(fake, best);
      let covered = 0;
      const rr = fake.s.range * T;
      for (let i = 0; i < N; i++) if (this.type[i] === P && U.dist2(fake.x, fake.y, this.cx(i % COLS), this.cx((i / COLS) | 0)) <= rr * rr) covered++;
      return { s: fake.s, dps: this.estimateDps(fake), links, onLey: fake.onLey, aura: best, covered };
    }

    acquire(t, range, opts) {
      opts = opts || {};
      const R2 = (range * T) ** 2, min2 = opts.minRange ? (opts.minRange * T) ** 2 : 0;
      let best = null, bv = Infinity;
      const mode = t.targeting;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.flying && !t.def.air) continue;
        if (!this.isVisible(e)) continue;
        const d2 = U.dist2(t.x, t.y, e.x, e.y);
        if (d2 > R2 || d2 < min2) continue;
        if (opts.exclude && opts.exclude.has(e)) continue;
        let v;
        if (mode === 'first') v = this.remaining(e);
        else if (mode === 'last') v = -this.remaining(e);
        else if (mode === 'strong') v = -(e.hp + e.shield) - (e.boss ? 1e9 : 0);
        else v = d2;
        if (v < bv) { bv = v; best = e; }
      }
      return best;
    }
    inRange(x, y, range, airOk) {
      const R2 = (range * T) ** 2, out = [];
      for (const e of this.enemies) if (!e.dead && (airOk || !e.flying) && this.isVisible(e) && U.dist2(x, y, e.x, e.y) <= R2) out.push(e);
      return out;
    }

    updateTowers(dt) {
      for (const t of this.towers) {
        if (t.upAnim > 0) t.upAnim = Math.max(0, t.upAnim - dt * 1.5);
        if (t.abilityCd > 0) t.abilityCd -= dt;
        if (t.overclockCd > 0) t.overclockCd -= dt;
        if (t.focusT > 0) t.focusT -= dt;
        if (t.forgedT > 0) t.forgedT -= dt;
        if (t.overclockT > 0) { t.overclockT -= dt; if (t.overclockT <= 0) this.endOverclock(t); }
        if (t.burnoutT > 0) { t.burnoutT -= dt; continue; }
        if (t.disabledT > 0) { t.disabledT -= dt; if (t.disabledT <= 0 && t.def.support) this.refreshTowers(); continue; }
        if (t.def.support) continue;
        let rateMul = 1, dmgMul = 1;
        if (t.overclockT > 0) { rateMul *= 1 + D.OVERCLOCK.rate; dmgMul *= 1 + D.OVERCLOCK.dmg; }
        if (t.forgedT > 0) rateMul *= 1.3;
        if (t.focusT > 0) rateMul *= 2.5;
        t.dm = dmgMul;
        const s = t.s;
        t.cd -= dt * rateMul;
        const cdBefore = t.cd;
        t.fireK = Math.max(0, (t.fireK || 0) - dt * 5);
        switch (t.def.id) {
          case 'prism': this.tPrism(t, s, dmgMul); break;
          case 'mortar': this.tMortar(t, s, dmgMul); break;
          case 'frost': this.tFrost(t, s, dmgMul); break;
          case 'storm': this.tStorm(t, s, dmgMul, dt, rateMul); break;
          case 'grove': this.tGrove(t, s, dmgMul, dt); break;
          case 'void': this.tVoid(t, s, dmgMul, dt); break;
        }
        if (t.cd > cdBefore + 1e-6) t.fireK = 1; // attacked this tick -> recoil / muzzle flash
      }
    }
    aim(t, e) { if (e) t.angle = U.angLerp(t.angle, U.angle(t.x, t.y, e.x, e.y), 0.5); }
    rollCrit(s) { return s.crit && this.rng() < s.crit; }
    onHitMods(t, e, dmg) {
      if (e.dead) return;
      if (t.mods.includes('venom')) { e.poisonDps = Math.max(e.poisonDps, dmg * 0.25 / 3); e.poisonT = 3; e.poisonSrc = t; }
      if (t.mods.includes('chain') && this.rng() < 0.2) {
        let best = null, bd = (1.8 * T) ** 2;
        for (const o of this.enemies) if (!o.dead && o !== e && U.dist2(o.x, o.y, e.x, e.y) < bd) { bd = U.dist2(o.x, o.y, e.x, e.y); best = o; }
        if (best) { this.damage(best, dmg * 0.5, 'storm', t); this.zaps.push({ pts: [[e.x, e.y], [best.x, best.y]], color: '#c9b8ff', t: 0.15, w: 2 }); }
      }
    }
    tPrism(t, s, dm) {
      if (t.cd > 0) return;
      const e = this.acquire(t, s.range);
      if (!e) { t.cd = 0; return; }
      t.cd += 1 / s.rate;
      this.aim(t, e);
      t.attackCount++;
      if (s.pierceLine) {
        const ang = U.angle(t.x, t.y, e.x, e.y);
        const len = s.range * T * 1.05;
        const ex = t.x + Math.cos(ang) * len, ey = t.y + Math.sin(ang) * len;
        const crit = this.rollCrit(s);
        const dmg = s.dmg * dm * (crit ? s.critMult : 1);
        for (const o of this.enemies) {
          if (o.dead || (o.flying && !t.def.air) || !this.isVisible(o)) continue;
          if (segDist(t.x, t.y, ex, ey, o.x, o.y) < o.r + 10) {
            this.damage(o, dmg, 'phys', t, { armorPierce: s.armorPierce, crit });
            if (s.mark) { o.markAmt = Math.max(o.markAmt, s.mark); o.markT = 3; }
            this.onHitMods(t, o, dmg);
          }
        }
        this.zaps.push({ pts: [[t.x, t.y - 18], [ex, ey]], color: '#fff3b0', t: 0.22, w: 7, beam: true });
        this.fx('railHit', e.x, e.y, ang);
        this.sfx('rail', t.x, t.y); this.ev.emit('shake', 2.5);
        return;
      }
      const shots = s.multishot || 1;
      const targets = [e];
      if (shots > 1) {
        const ex = new Set([e]);
        for (let k = 1; k < shots; k++) { const o = this.acquire(t, s.range, { exclude: ex }); if (!o) break; ex.add(o); targets.push(o); }
      }
      for (let k = 0; k < shots; k++) {
        const tg = targets[k] || e;
        const crit = this.rollCrit(s);
        const dmg = s.dmg * dm * (crit ? s.critMult : 1) * (targets[k] ? 1 : 0.5);
        this.projectiles.push({ kind: 'bolt', x: t.x, y: t.y - 20, target: tg, speed: 15 * T, dmg, crit, src: t, color: '#ffe9a0', bounce: s.bounce || 0, arc: s.extraArc || 0, hitSet: null, trail: [] });
      }
      this.sfx(shots > 1 ? 'volley' : 'prism', t.x, t.y);
    }
    tMortar(t, s, dm) {
      if (t.cd > 0) return;
      const e = this.acquire(t, s.range, { minRange: s.minRange });
      if (!e) { t.cd = 0; return; }
      t.cd += 1 / s.rate;
      this.aim(t, e);
      const flight = 0.9 + U.dist(t.x, t.y, e.x, e.y) / (T * 12);
      let px = e.x + e.vx * flight * 0.9, py = e.y + e.vy * flight * 0.9;
      this.projectiles.push({ kind: 'shell', x: t.x, y: t.y - 16, sx: t.x, sy: t.y - 16, tx: px, ty: py, t: 0, dur: flight, dmg: s.dmg * dm, src: t, s, big: t.branch === 0 && t.level >= 3 });
      this.sfx('mortar', t.x, t.y);
      this.fx('muzzle', t.x, t.y - 20, '#ffb36b');
    }
    explode(x, y, dmg, radius, s, src, small) {
      const R2 = (radius * T) ** 2;
      for (const e of this.enemies) {
        if (e.dead || e.flying || U.dist2(x, y, e.x, e.y) > R2 + e.r * e.r) continue;
        let d = dmg;
        if (s.thermal && e.chillT > 0) { d *= 1 + s.thermal; this.synProc(src, e, 'thermal'); }
        this.damage(e, d, 'fire', src);
        if (e.dead) continue;
        if (s.burn) { e.burnDps = Math.max(e.burnDps, s.burn); e.burnT = Math.max(e.burnT, s.burnDur || 2); e.burnSrc = src; }
        if (s.stun && !small) e.stunT = Math.max(e.stunT, s.stun);
        if (s.wildRoot && this.rng() < s.wildRoot) { e.rootT = Math.max(e.rootT, 0.5); this.synProc(src, e, 'wildfire'); }
        this.onHitMods(src, e, d);
      }
      this.fx('explosion', x, y, radius * T, small ? 0.6 : 1);
      if (!small) { this.sfx('boom', x, y); this.ev.emit('shake', s.pool ? 5 : 3); }
      else this.sfx('pop', x, y);
    }
    tFrost(t, s, dm) {
      if (t.cd > 0) return;
      const list = this.inRange(t.x, t.y, s.range, true);
      if (!list.length) { t.cd = 0; return; }
      t.cd += 1 / s.rate;
      t.pulseCount++;
      const freeze = s.freezeEvery && t.pulseCount % s.freezeEvery === 0;
      for (const e of list) {
        let d = s.dmg * dm;
        if (s.thermal && e.burnT > 0) { d *= 1 + s.thermal; this.synProc(t, e, 'thermal'); }
        this.damage(e, d, 'frost', t);
        if (e.dead) continue;
        if (s.slow >= e.slowAmt || e.slowT < 0.3) { e.slowAmt = Math.max(e.slowAmt * (e.slowT > 0 ? 1 : 0), s.slow); }
        e.slowT = Math.max(e.slowT, s.slowDur); e.chillT = Math.max(e.chillT, s.slowDur);
        if (freeze) { e.freezeT = Math.max(e.freezeT, s.freezeDur * (e.boss ? 0.3 : 1)); e.shatterAmt = s.shatter; e.chillT = Math.max(e.chillT, s.freezeDur + 0.5); }
        else if (e.wetT > 0 && !e.boss && e.freezeT <= 0) { e.freezeT = 0.7; e.shatterAmt = Math.max(e.shatterAmt || 0, 0.2); if (this.time - (this.flashFreezeT || -9) > 3) { this.flashFreezeT = this.time; this.fx('synergy', e.x, e.y - e.r - 10, 'Flash-freeze', '#9fe8ff'); } }
        if (s.shred) { e.shredAmt = Math.max(e.shredAmt, s.shred); e.shredT = s.shredDur; }
        if (s.shieldBreak && e.shield > 0) e.shield = Math.max(0, e.shield - s.shieldBreak * dm * this.hpMul(e.wave) * 0.5);
        this.onHitMods(t, e, d);
      }
      this.fx('frostPulse', t.x, t.y, s.range * T, freeze);
      this.sfx(freeze ? 'freeze' : 'frost', t.x, t.y);
    }
    stormMul(t, s, e) {
      let m = 1;
      if (s.superconduct && (e.chillT > 0 || e.freezeT > 0)) { m += s.superconduct; this.synProc(t, e, 'superconduct'); }
      if (s.wellBonus && e.wellT > 0) { m += s.wellBonus; this.synProc(t, e, 'eventstorm'); }
      return m;
    }
    synProc(t, e, id) {
      if (!t || this.time - (t.synT || -9) < 2.2) return;
      t.synT = this.time;
      this.synSeen = this.synSeen || {};
      if (this.time - (this.synGlobalT || -9) < 0.9 || this.time - (this.synSeen[id] || -99) < 6) return; // global budget keeps the field readable
      this.synGlobalT = this.time; this.synSeen[id] = this.time;
      const syn = D.SYNERGIES.find(x => x.id === id);
      this.fx('synergy', e.x, e.y - e.r - 10, syn.name, D.ELEMENTS[t.def.element].color);
    }
    tStorm(t, s, dm, dt, rateMul) {
      if (s.beam) {
        let e = t.beamTarget;
        if (!e || e.dead || U.dist2(t.x, t.y, e.x, e.y) > (s.range * T) ** 2 || !this.isVisible(e)) {
          const ne = this.acquire(t, s.range);
          if (ne !== e) { t.beamT = 0; }
          e = ne; t.beamTarget = e;
        }
        if (!e) { t.beamT = Math.max(0, t.beamT - dt * 2); return; }
        this.aim(t, e);
        t.beamT = Math.min(s.rampTime, t.beamT + dt * rateMul);
        const ramp = 1 + (s.rampMax - 1) * (t.beamT / s.rampTime);
        const dps = s.dps * dm * ramp * rateMul;
        this.damage(e, dps * dt * this.stormMul(t, s, e), 'storm', t, { dot: true });
        if (s.beamPierce) {
          const ang = U.angle(t.x, t.y, e.x, e.y);
          const others = this.enemies.filter(o => !o.dead && o !== e && U.dist2(o.x, o.y, e.x, e.y) < (1.6 * T) ** 2 && Math.abs(U.angLerp(0, U.angle(e.x, e.y, o.x, o.y) - ang, 1)) < 0.9).slice(0, s.beamPierce);
          for (const o of others) this.damage(o, dps * 0.6 * dt, 'storm', t, { dot: true });
          t.beamExtra = others;
        } else t.beamExtra = null;
        t.beamRamp = ramp;
        this.ev.emit('beamHum', t);
        return;
      }
      if (t.cd > 0) return;
      const e = this.acquire(t, s.range);
      if (!e) { t.cd = 0; return; }
      t.cd += 1 / s.rate;
      this.aim(t, e);
      t.attackCount++;
      const hit = new Set();
      const pts = [[t.x, t.y - 30]];
      let cur = e, dmg = s.dmg * dm;
      for (let k = 0; k < s.chain && cur; k++) {
        hit.add(cur); pts.push([cur.x, cur.y]);
        this.damage(cur, dmg * this.stormMul(t, s, cur), 'storm', t);
        if (s.stun && !cur.dead) cur.stunT = Math.max(cur.stunT, s.stun);
        this.onHitMods(t, cur, dmg);
        dmg *= 1 - s.falloff;
        let nb = null, nd = (1.9 * T) ** 2;
        for (const o of this.enemies) { if (o.dead || hit.has(o) || !this.isVisible(o)) continue; const d2 = U.dist2(cur.x, cur.y, o.x, o.y); if (d2 < nd) { nd = d2; nb = o; } }
        cur = nb;
      }
      this.zaps.push({ pts, color: '#c9b8ff', t: 0.18, w: 3, jag: true });
      this.sfx('zap', t.x, t.y);
      if (s.boltEvery && t.attackCount % s.boltEvery === 0) {
        const list = this.inRange(t.x, t.y, s.range, true);
        if (list.length) { const tg = list[Math.floor(this.rng() * list.length)]; this.skyBolt(tg, s.boltDmg * dm, t); }
      }
    }
    skyBolt(e, dmg, src) {
      this.zaps.push({ pts: [[e.x + U.rand(-30, 30), e.y - 420], [e.x + U.rand(-15, 15), e.y - 200], [e.x, e.y]], color: '#e6dcff', t: 0.3, w: 6, jag: true });
      for (const o of this.inRange(e.x, e.y, 0.9, true)) this.damage(o, o === e ? dmg : dmg * 0.4, 'storm', src);
      this.fx('thunder', e.x, e.y);
      this.sfx('thunder', e.x, e.y); this.ev.emit('shake', 6); this.ev.emit('flash', 0.15);
    }
    // ---------------- Grove / minions
    setRally(t, c, r) {
      let best = null, bd = Infinity;
      const R2 = (t.s.range * T) ** 2;
      for (let i = 0; i < N; i++) {
        if (this.type[i] !== P || this.bridgeId[i] >= 0 || i === this.nexus.i) continue;
        const x = this.cx(i % COLS), y = this.cx((i / COLS) | 0);
        const d2 = U.dist2(t.x, t.y, x, y);
        if (d2 > R2) continue;
        const want = c != null ? U.dist2(x, y, this.cx(c), this.cx(r)) : d2;
        if (want < bd) { bd = want; best = { x, y, i }; }
      }
      t.rally = best;
      for (const m of this.minions) if (m.owner === t) { m.engaged = null; this.placeMinionHome(m); }
      this.syncMinions(t, false);
      return !!best;
    }
    placeMinionHome(m) {
      const t = m.owner; if (!t.rally) return;
      const k = m.slot, n = Math.max(1, t.s.minions + (t.s.treantHp ? 1 : 0));
      const ang = (k / n) * Math.PI * 2;
      m.hx = t.rally.x + (m.treant ? 0 : Math.cos(ang) * 16); m.hy = t.rally.y + (m.treant ? 0 : Math.sin(ang) * 16);
    }
    syncMinions(t, heal) {
      if (!t.rally) return;
      const mine = this.minions.filter(m => m.owner === t && !m.dead);
      const s = t.s;
      for (const m of mine) {
        if (m.treant) { m.maxHp = s.treantHp; m.dmg = s.treantDmg; }
        else { m.maxHp = s.minionHp; m.dmg = s.minionDmg; }
        if (heal) m.hp = m.maxHp;
      }
      const wantT = s.treantHp ? 1 : 0;
      const haveT = mine.filter(m => m.treant).length;
      const haveN = mine.length - haveT;
      if (!t.respawnQ) t.respawnQ = [];
      const queued = t.respawnQ.length;
      if (haveT < wantT && !t.respawnQ.some(q => q.treant)) this.spawnMinion(t, true);
      for (let k = haveN + t.respawnQ.filter(q => !q.treant).length; k < s.minions; k++) this.spawnMinion(t, false);
      // trim extras
      const extra = mine.filter(m => !m.treant).slice(s.minions);
      for (const m of extra) m.dead = true;
      this.minions = this.minions.filter(m => !m.dead);
      void queued;
    }
    spawnMinion(t, treant) {
      const used = new Set(this.minions.filter(m => m.owner === t && !m.dead).map(m => m.slot));
      let slot = 0; while (used.has(slot)) slot++;
      const s = t.s;
      const m = { uid: this.uid(), owner: t, treant, slot, x: t.x, y: t.y, hp: treant ? s.treantHp : s.minionHp, maxHp: treant ? s.treantHp : s.minionHp,
        dmg: treant ? s.treantDmg : s.minionDmg, rate: treant ? 0.8 : s.minionRate, cd: 0, engaged: null, r: treant ? 22 : 9, anim: Math.random() * 5, dead: false, cap: treant ? 3 : 1, engagedList: [] };
      this.placeMinionHome(m);
      this.minions.push(m);
      this.fx('sprout', m.hx, m.hy);
      return m;
    }
    killMinion(m) {
      if (m.dead) return;
      m.dead = true;
      for (const e of this.enemies) if (e.blocker === m) e.blocker = null;
      this.fx('leaves', m.x, m.y, m.treant);
      this.sfx('minionDie', m.x, m.y);
      const t = m.owner;
      if (!t.dead) { t.respawnQ = t.respawnQ || []; t.respawnQ.push({ t: t.s.respawn * (m.treant ? 2 : 1), treant: m.treant }); }
    }
    tGrove(t, s, dm, dt) {
      // respawn queue
      if (t.respawnQ && t.respawnQ.length) {
        for (const q of t.respawnQ) q.t -= dt;
        const ready = t.respawnQ.filter(q => q.t <= 0);
        t.respawnQ = t.respawnQ.filter(q => q.t > 0);
        for (const q of ready) {
          const mine = this.minions.filter(m => m.owner === t && !m.dead);
          if (q.treant ? !mine.some(m => m.treant) && s.treantHp : mine.filter(m => !m.treant).length < s.minions) this.spawnMinion(t, q.treant);
        }
      }
      // thornbloom vines
      if (s.vines && t.rally) {
        t.vineT += dt;
        const pulse = t.vineT >= s.rootPulse;
        if (pulse) t.vineT = 0;
        const R2 = (s.range * T) ** 2;
        let any = false;
        for (const e of this.enemies) {
          if (e.dead || e.flying || U.dist2(t.x, t.y, e.x, e.y) > R2) continue;
          any = true;
          e.poisonDps = Math.max(e.poisonDps, s.vines * dm); e.poisonT = Math.max(e.poisonT, 0.5); e.poisonSrc = t;
          if (e.slowAmt < s.vineSlow) e.slowAmt = s.vineSlow; e.slowT = Math.max(e.slowT, 0.3);
          if (pulse) { e.rootT = Math.max(e.rootT, s.pulseRoot * (s.rootMul || 1) * (e.boss ? 0.3 : 1)); }
        }
        if (pulse && any) { this.fx('vinePulse', t.x, t.y, s.range * T); this.sfx('roots', t.x, t.y); }
      }
      // tower lash
      if (t.cd <= 0) {
        const e = this.acquire(t, s.range);
        if (e) {
          t.cd += 1 / s.rate; this.aim(t, e);
          const d = s.dmg * dm;
          this.damage(e, d, 'nature', t);
          if (!e.dead && this.rng() < s.rootChance) e.rootT = Math.max(e.rootT, s.rootDur * (s.rootMul || 1) * (e.boss ? 0.3 : 1));
          if (!e.dead && s.ignite) { e.burnDps = Math.max(e.burnDps, d * 0.6); e.burnT = Math.max(e.burnT, 2); e.burnSrc = t; }
          this.onHitMods(t, e, d);
          this.zaps.push({ pts: [[t.x, t.y - 10], [e.x, e.y]], color: '#6dff8e', t: 0.15, w: 3, vine: true });
          this.sfx('lash', t.x, t.y);
        } else t.cd = 0;
      }
    }
    updateMinions(dt) {
      for (const m of this.minions) {
        if (m.dead) continue;
        m.anim += dt;
        const t = m.owner;
        if (t.disabledT > 0 || t.burnoutT > 0) continue;
        const dm = (t.overclockT > 0 ? 1 + D.OVERCLOCK.dmg : 1);
        // validate engagements
        m.engagedList = m.engagedList.filter(e => !e.dead && e.blocker === m);
        m.engaged = m.engagedList[0] || null;
        if (m.engagedList.length < m.cap) {
          for (const e of this.enemies) {
            if (e.dead || e.flying || e.boss || e.blocker) continue;
            if (U.dist2(e.x, e.y, m.hx, m.hy) < (0.85 * T) ** 2) { e.blocker = m; m.engagedList.push(e); if (m.engagedList.length >= m.cap) break; }
          }
          m.engaged = m.engagedList[0] || null;
        }
        const tx = m.engaged ? m.engaged.x - Math.sign(m.engaged.x - m.hx) * (m.engaged.r + 6) : m.hx;
        const ty = m.engaged ? m.engaged.y : m.hy;
        const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
        const sp = 2.4 * T * dt;
        if (d > 1) { m.x += dx / d * Math.min(sp, d); m.y += dy / d * Math.min(sp, d); }
        m.cd -= dt * (t.overclockT > 0 ? 1 + D.OVERCLOCK.rate : 1);
        if (m.engaged && m.cd <= 0) {
          m.cd = 1 / m.rate;
          if (m.treant) {
            for (const e of this.enemies) if (!e.dead && !e.flying && U.dist2(e.x, e.y, m.x, m.y) < (1.0 * T) ** 2) {
              this.damage(e, m.dmg * dm, 'nature', t);
              if (t.s.slamRoot && !e.dead) e.rootT = Math.max(e.rootT, t.s.slamRoot * (e.boss ? 0.3 : 1));
            }
            this.fx('slam', m.x, m.y); this.sfx('slam', m.x, m.y); this.ev.emit('shake', 3);
          } else {
            this.damage(m.engaged, m.dmg * dm, 'nature', t);
            if (t.s.ignite && !m.engaged.dead) { m.engaged.burnDps = Math.max(m.engaged.burnDps, m.dmg * 0.5); m.engaged.burnT = 2; m.engaged.burnSrc = t; }
            this.fx('scratch', m.engaged.x, m.engaged.y);
          }
        }
      }
      if (this.minions.some(m => m.dead)) this.minions = this.minions.filter(m => !m.dead);
    }
    // ---------------- Void
    tVoid(t, s, dm, dt) {
      if (s.auraSlow) {
        const R2 = (s.range * T) ** 2;
        for (const e of this.enemies) if (!e.dead && U.dist2(t.x, t.y, e.x, e.y) < R2) { e.dilate = Math.max(e.dilate, s.auraSlow); e.vuln = Math.max(e.vuln, s.vulnerable); e.suppressed = true; }
      }
      if (t.cd > 0) return;
      const e = this.acquire(t, s.range);
      if (!e) { t.cd = 0; return; }
      t.cd += 1 / s.rate;
      this.aim(t, e);
      const lead = 0.4;
      this.wells.push({ x: e.x + e.vx * lead, y: e.y + e.vy * lead, r: s.wellR * T, t: 0, dur: s.wellDur, dps: s.dps * dm, pull: s.pull * T, src: t, execute: s.execute || 0, ignite: s.ignite });
      this.sfx('well', e.x, e.y);
    }
    updateWells(dt) {
      for (const w of this.wells) {
        w.t += dt;
        const grow = Math.min(1, w.t / 0.25) * (w.t > w.dur - 0.3 ? Math.max(0, (w.dur - w.t) / 0.3) : 1);
        const R = w.r * grow;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = U.dist(e.x, e.y, w.x, w.y);
          if (d > R + e.r) continue;
          e.wellT = 0.2;
          if (d > 4) {
            const pull = w.pull * dt * (e.boss ? 0.15 : 1) * (1 - d / (R + e.r + 1) * 0.5);
            const nx = e.x + (w.x - e.x) / d * pull, ny = e.y + (w.y - e.y) / d * pull;
            if (e.flying) { e.x = nx; e.y = ny; }
            else {
              const [c, r] = this.tileOf(nx, ny);
              if (this.inb(c, r) && this.walkable(this.idx(c, r))) { e.x = nx; e.y = ny; }
            }
          }
          this.damage(e, w.dps * dt, 'arcane', w.src, { dot: true });
          if (!e.dead && w.ignite) { e.burnDps = Math.max(e.burnDps, w.dps * 0.25); e.burnT = Math.max(e.burnT, 1); e.burnSrc = w.src; }
          if (!e.dead && w.execute && !e.boss && e.hp / e.maxHp < w.execute) {
            this.fx('erase', e.x, e.y, e.def.color); this.text(e.x, e.y - 20, 'ERASED', '#d9a8ff', 16);
            this.kill(e, w.src);
          }
        }
      }
      this.wells = this.wells.filter(w => w.t < w.dur);
    }

    // ---------------- Projectiles & pools
    updateProjectiles(dt) {
      for (const p of this.projectiles) {
        if (p.kind === 'bolt') {
          const e = p.target;
          if (e.dead) {
            // retarget to nearest
            let nb = null, nd = (2 * T) ** 2;
            for (const o of this.enemies) if (!o.dead && (!o.flying || p.src.def.air)) { const d2 = U.dist2(p.x, p.y, o.x, o.y); if (d2 < nd) { nd = d2; nb = o; } }
            if (!nb) { p.done = true; continue; }
            p.target = nb;
          }
          const tg = p.target;
          const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
          const step = p.speed * dt;
          p.trail.push([p.x, p.y]); if (p.trail.length > 5) p.trail.shift();
          if (d <= step + tg.r * 0.5) {
            this.damage(tg, p.dmg, 'phys', p.src, { crit: p.crit }); this.sfx('hit', tg.x, tg.y);
            this.onHitMods(p.src, tg, p.dmg);
            this.fx('hit', tg.x, tg.y, p.crit ? '#ffffff' : p.color, p.crit);
            p.hitSet = p.hitSet || new Set(); p.hitSet.add(tg);
            const hop = p.bounce > 0 || p.arc > 0;
            if (hop) {
              let nb = null, nd = (2.2 * T) ** 2;
              for (const o of this.enemies) if (!o.dead && !p.hitSet.has(o) && (!o.flying || p.src.def.air) && this.isVisible(o)) { const d2 = U.dist2(tg.x, tg.y, o.x, o.y); if (d2 < nd) { nd = d2; nb = o; } }
              if (nb) {
                if (p.bounce > 0) { p.bounce--; p.dmg *= 0.75; } else { p.arc--; p.dmg *= 0.5; }
                p.target = nb; p.x = tg.x; p.y = tg.y; continue;
              }
            }
            p.done = true;
          } else { p.x += dx / d * step; p.y += dy / d * step; p.ang = Math.atan2(dy, dx); }
        } else if (p.kind === 'shell' || p.kind === 'bomblet') {
          p.t += dt;
          const k = Math.min(1, p.t / p.dur);
          p.x = U.lerp(p.sx, p.tx, k); p.y = U.lerp(p.sy, p.ty, k);
          p.h = Math.sin(k * Math.PI) * (p.kind === 'shell' ? 140 + p.dur * 40 : 40);
          if (k >= 1) {
            p.done = true;
            const s = p.s;
            if (p.kind === 'bomblet') { this.explode(p.x, p.y, s.bombletDmg * (p.src.dm || 1), s.bombletSplash, s, p.src, true); continue; }
            this.explode(p.x, p.y, p.dmg, s.splash, s, p.src, false);
            if (s.pool) this.pools.push({ x: p.x, y: p.y, r: s.splash * T * 0.8, dps: s.pool * (p.src.dm || 1), t: 0, dur: s.poolDur, src: p.src });
            if (s.bomblets) for (let b = 0; b < s.bomblets; b++) {
              const a = (b / s.bomblets) * Math.PI * 2 + this.rng(), rad = T * (0.6 + this.rng() * 0.7);
              this.projectiles.push({ kind: 'bomblet', sx: p.x, sy: p.y, x: p.x, y: p.y, tx: p.x + Math.cos(a) * rad, ty: p.y + Math.sin(a) * rad, t: 0, dur: 0.35 + this.rng() * 0.2, s, src: p.src });
            }
          }
        } else if (p.kind === 'barrage') {
          p.t += dt;
          if (p.t >= p.delay && !p.fired) {
            p.fired = true;
            this.projectiles.push({ kind: 'shell', sx: p.x + U.rand(-200, 200), sy: p.y - 700, x: p.x, y: p.y - 700, tx: p.x + U.rand(-1, 1) * T * 1.4, ty: p.y + U.rand(-1, 1) * T * 1.4, t: 0, dur: 0.7, dmg: p.dmg, src: p.src, s: p.s });
          }
          if (p.fired) p.done = true;
        } else if (p.kind === 'meteor') {
          p.t += dt;
          if (p.t >= p.dur) {
            p.done = true;
            const R2 = (1.9 * T) ** 2;
            for (const e of this.enemies) if (!e.dead && U.dist2(e.x, e.y, p.x, p.y) < R2) { this.damage(e, p.dmg, 'fire', null); if (!e.dead) { e.burnDps = Math.max(e.burnDps, p.dmg * 0.05); e.burnT = 4; } }
            this.fx('meteor', p.x, p.y, 1.9 * T);
            this.sfx('meteor', p.x, p.y); this.ev.emit('shake', 16); this.ev.emit('hitstop', 0.12); this.ev.emit('flash', 0.35);
          }
        }
      }
      this.projectiles = this.projectiles.filter(p => !p.done);
      for (const p of this.pools) {
        p.t += dt;
        for (const e of this.enemies) if (!e.dead && !e.flying && U.dist2(e.x, e.y, p.x, p.y) < p.r * p.r) this.damage(e, p.dps * dt, 'fire', p.src, { dot: true });
      }
      this.pools = this.pools.filter(p => p.t < p.dur);
      for (const z of this.zaps) z.t -= dt;
      this.zaps = this.zaps.filter(z => z.t > 0);
    }

    // ============================================================ PLAYER ACTIONS
    abilityCd(t) { return t.def.ability.cd * (1 - (this.has('recall') ? 0.15 : 0)) * (1 - (t.s.cdr || 0)); }
    abilityReady(t) { return t.level >= 1 && t.abilityCd <= 0 && t.disabledT <= 0 && t.burnoutT <= 0; }
    useAbility(t, x, y) {
      if (!this.abilityReady(t)) return false;
      const s = t.s, dm = t.dm || 1;
      switch (t.def.ability.id) {
        case 'focus': t.focusT = 6; this.fx('ring', t.x, t.y, 60, '#ffd96a'); break;
        case 'barrage': {
          if (x == null) return false;
          for (let k = 0; k < 8; k++) this.projectiles.push({ kind: 'barrage', x, y, t: 0, delay: k * 0.22, dmg: s.dmg * dm * 1.1, src: t, s });
          this.fx('target', x, y, 1.6 * T);
          break;
        }
        case 'deepfreeze': {
          const list = this.inRange(t.x, t.y, s.range * 1.5, true);
          for (const e of list) { e.freezeT = Math.max(e.freezeT, e.boss ? 0.8 : 2.5); e.chillT = 3; e.shatterAmt = s.shatter || 0.2; }
          this.fx('frostPulse', t.x, t.y, s.range * 1.5 * T, true); this.ev.emit('shake', 6);
          break;
        }
        case 'thunder': {
          const list = this.inRange(t.x, t.y, s.range * 1.3, true);
          if (!list.length) { this.ev.emit('error', 'No enemies in range'); return false; }
          list.sort((a, b) => (b.hp + b.shield) - (a.hp + a.shield));
          const base = (s.dmg || s.dps * 0.5) * 14;
          this.skyBolt(list[0], base, t);
          for (const o of list.slice(1, 6)) { this.damage(o, base * 0.35, 'storm', t); this.zaps.push({ pts: [[list[0].x, list[0].y], [o.x, o.y]], color: '#e6dcff', t: 0.25, w: 3, jag: true }); }
          this.ev.emit('hitstop', 0.1);
          break;
        }
        case 'entangle': {
          for (const e of this.inRange(t.x, t.y, s.range, false)) e.rootT = Math.max(e.rootT, e.boss ? 0.8 : 2.5);
          for (const m of this.minions) if (m.owner === t) m.hp = m.maxHp;
          this.fx('vinePulse', t.x, t.y, s.range * T); this.sfx('roots', t.x, t.y);
          break;
        }
        case 'overcharge': {
          let n = 0;
          for (const o of this.towers) if (o !== t && !o.def.support && U.dist2(o.x, o.y, t.x, t.y) <= (s.range * T) ** 2) { o.overclockT = 6; o.freeOc = true; n++; this.fx('ring', o.x, o.y, 50, '#ff7ae0'); }
          if (!n) { this.ev.emit('error', 'No towers in range'); return false; }
          break;
        }
        case 'collapse': {
          const list = this.inRange(t.x, t.y, s.range * 1.3, true);
          if (!list.length) { this.ev.emit('error', 'No enemies in range'); return false; }
          list.sort((a, b) => (b.hp + b.shield) - (a.hp + a.shield));
          const e = list[0];
          this.wells.push({ x: e.x, y: e.y, r: 2.6 * T, t: 0, dur: 3, dps: (800 + s.dps * 6) * dm / 3, pull: 2.5 * T, src: t, execute: s.execute || 0, big: true, ignite: s.ignite });
          this.ev.emit('shake', 8);
          break;
        }
      }
      t.abilityCd = this.abilityCd(t);
      this.sfx('ability_' + t.def.ability.id, t.x, t.y);
      this.ev.emit('ability', t);
      return true;
    }
    overclockRisk(t) {
      const cool = this.has('cooling');
      const burn = Math.min(0.9, D.OVERCLOCK.burnoutPer * (t.strain + 1) * (cool ? 0.5 : 1));
      const shatter = !cool && t.strain + 1 >= D.OVERCLOCK.shatterAt ? D.OVERCLOCK.shatterChance : 0;
      return { burn, shatter };
    }
    overclock(t) {
      if (t.def.support) return false;
      if (t.overclockT > 0 || t.overclockCd > 0 || t.burnoutT > 0 || t.disabledT > 0) return false;
      t.overclockT = D.OVERCLOCK.dur; t.freeOc = false;
      this.fx('overclock', t.x, t.y, t.def.color); this.sfx('overclock', t.x, t.y);
      this.ev.emit('shake', 3);
      return true;
    }
    endOverclock(t) {
      if (t.freeOc) { t.freeOc = false; return; }
      const risk = this.overclockRisk(t);
      t.strain++;
      t.overclockCd = D.OVERCLOCK.cooldown;
      if (risk.shatter && this.rng() < risk.shatter) {
        this.text(t.x, t.y - 40, 'SHATTERED!', '#ff5d5d', 24);
        this.fx('debris', t.x, t.y, t.def.color); this.ev.emit('shake', 10);
        const refund = Math.floor(t.invested * 0.4);
        this.gold += refund;
        this.occ[t.i] = null; this.towers = this.towers.filter(x => x !== t);
        for (const m of this.minions) if (m.owner === t) m.dead = true;
        this.minions = this.minions.filter(m => !m.dead);
        t.dead = true; this.refreshTowers(); this.sfx('shatter', t.x, t.y);
        this.ev.emit('sold', t);
        return;
      }
      if (this.rng() < risk.burn) {
        t.burnoutT = D.OVERCLOCK.burnoutTime;
        this.text(t.x, t.y - 40, 'BURNOUT', '#ff9a4a', 20); this.fx('smoke', t.x, t.y); this.sfx('burnout', t.x, t.y);
      } else this.fx('vent', t.x, t.y);
    }
    installMod(t, modId) {
      const mod = D.MODS[modId];
      const slots = this.modSlots(t);
      if (t.mods.includes(modId)) return false;
      if (t.mods.length >= slots) { this.ev.emit('error', 'No free mod slot'); return false; }
      if (this.essence < mod.cost) { this.ev.emit('error', 'Not enough Essence'); return false; }
      this.essence -= mod.cost; t.mods.push(modId);
      this.refreshTowers();
      this.fx('upgrade', t.x, t.y, '#ff7ae0', 1); this.sfx('mod', t.x, t.y);
      this.text(t.x, t.y - 40, mod.name, '#ff7ae0', 18);
      return true;
    }
    removeMod(t, modId) { t.mods = t.mods.filter(m => m !== modId); this.refreshTowers(); }
    usePower(id, x, y) {
      const p = D.POWERS[id];
      if (this.powerCd[id] > 0) return false;
      if (this.essence < p.cost) { this.ev.emit('error', 'Not enough Essence'); return false; }
      if (id === 'mend' && this.lives >= this.maxLives) { this.ev.emit('error', 'Nexus already at full integrity'); return false; }
      this.essence -= p.cost;
      this.powerCd[id] = p.cd * (this.has('recall') ? 0.85 : 1);
      if (id === 'meteor') { this.projectiles.push({ kind: 'meteor', x, y, t: 0, dur: 0.9, dmg: 160 * this.hpMul(Math.max(1, this.wave)) }); this.fx('target', x, y, 1.9 * T, '#ff6a2b'); this.sfx('meteorFall', x, y); }
      if (id === 'stasis') { this.stasisT = 4; this.fx('stasis'); this.sfx('stasis'); }
      if (id === 'mend') { this.lives = Math.min(this.maxLives, this.lives + 5); this.fx('shockwave', this.nexus.x, this.nexus.y, 3 * T, '#6dff8e'); this.sfx('mend'); }
      this.ev.emit('power', id);
      return true;
    }
    canCollapse(b) {
      if (b.night || !b.up || b.cd > 0) return false;
      const test = this.dijkstra(false, { id: b.id, up: false });
      return this.spawns.every(s => isFinite(test[s.i]));
    }
    collapseBridge(b, forced) {
      if (!forced && !this.canCollapse(b)) { this.ev.emit('error', b.cd > 0 ? 'Bridge is still rebuilding' : 'Cannot sever the last route'); return false; }
      b.up = false; b.timer = 12; b.cd = 30;
      this.computeFields();
      for (const e of this.enemies) if (!e.dead && !e.flying && b.tiles.includes(e.tile)) this.fall(e);
      // enemies heading onto the bridge re-pick a route
      for (const e of this.enemies) if (!e.dead && !e.flying && e.next != null && b.tiles.includes(e.next)) { const nn = this.nextTile(e.tile, this.field(e)); e.next = nn < 0 ? e.tile : nn; }
      this.fx('bridgeCollapse', b); this.sfx('crumble', b.x, b.y); this.ev.emit('shake', 10);
      return true;
    }

    rebuildCost() { return 40 + 4 * this.wave; }
    // ---- player-triggered map mechanics
    actionCost(kind) { return Math.round({ seal: 45 + 5 * this.wave, sluice: 35 + 4 * this.wave, vent: 50 + 5 * this.wave }[kind] * this.goldMul); }
    sealShortcut(b) {
      if (!b.night || b.sealCd > 0) { this.ev.emit('error', 'The seal is recharging'); return false; }
      const cost = this.actionCost('seal'); if (this.gold < cost) { this.ev.emit('error', 'Not enough gold'); return false; }
      this.gold -= cost; b.sealT = 15; b.sealCd = 40;
      if (b.up) { b.up = false; this.computeFields(); for (const e of this.enemies) if (!e.dead && !e.flying && b.tiles.includes(e.tile)) { e.tile = this.nearestWalkable(e.x, e.y); e.next = e.tile; } for (const e of this.enemies) if (!e.dead && !e.flying && e.next != null && !this.walkable(e.next)) { const nn = this.nextTile(e.tile, this.field(e)); e.next = nn < 0 ? e.tile : nn; } }
      this.fx('bridgeCollapse', b); this.sfx('crumble', b.x, b.y); this.ev.emit('banner', 'SHORTCUT SEALED', 'Enemies must take the long way for 15s');
      return true;
    }
    openSluice() {
      const f = this.map.flood; if (!f) return false;
      if (this.wave === 0) { this.ev.emit('error', 'The river is calm until the first wave'); return false; }
      if ((this.sluiceCd || 0) > 0) { this.ev.emit('error', 'The sluice is refilling'); return false; }
      const cost = this.actionCost('sluice'); if (this.gold < cost) { this.ev.emit('error', 'Not enough gold'); return false; }
      this.gold -= cost; this.floodForceT = 10; this.sluiceCd = 45; this.sfx('flood');
      return true;
    }
    detonateVent(v) {
      if (v.cd > 0) { this.ev.emit('error', 'The vent is building pressure'); return false; }
      const cost = this.actionCost('vent'); if (this.gold < cost) { this.ev.emit('error', 'Not enough gold'); return false; }
      this.gold -= cost; v.cd = 25; this.eruptVent(v, false); this.fx('shockwave', v.x, v.y, 2 * T, '#ff7a2a');
      return true;
    }
    rebuildBridge(b) {
      if (b.up || b.night) return false;
      const cost = this.rebuildCost();
      if (this.gold < cost) { this.ev.emit('error', 'Not enough gold'); return false; }
      this.gold -= cost; b.timer = 0; // rebuilt on the next world tick
      return true;
    }
    // ============================================================ WORLD
    updateWorld(dt) {
      // power cooldowns
      for (const k in this.powerCd) if (this.powerCd[k] > 0) this.powerCd[k] -= dt;
      if (this.stasisT > 0) this.stasisT -= dt;
      // bridges
      let changed = false;
      for (const b of this.bridges) {
        if (b.night) continue;
        if (b.cd > 0) b.cd -= dt;
        if (!b.up) { b.timer -= dt; if (b.timer <= 0) { b.up = true; changed = true; this.fx('bridgeRebuild', b); this.sfx('rebuild', b.x, b.y); } }
        b.anim = U.clamp(b.anim + (b.up ? dt * 2 : -dt * 3), 0, 1);
      }
      // day / night
      if (this.map.dayNight && (this.waveActive || this.wave > 0)) {
        this.dayClock += dt;
        const ph = (this.dayClock % this.map.dayNight) / this.map.dayNight;
        const night = ph > 0.55 || !!this.forceNight;
        const target = night ? 1 : 0;
        this.nightAmt = U.clamp(this.nightAmt + (target - this.nightAmt) * dt * 1.5, 0, 1);
        if (night !== this.isNight) {
          this.isNight = night;
          for (const b of this.bridges) if (b.night) b.up = night && !(b.sealT > 0);
          changed = true;
          if (night) { this.ev.emit('banner', 'NIGHTFALL', 'Shortcuts open · Phantoms cloak · enemies +10% speed'); this.sfx('night'); }
          else { this.ev.emit('banner', 'DAYBREAK', 'Shortcuts sealed'); this.sfx('day'); }
          if (!night) for (const e of this.enemies) if (!e.dead && !e.flying && this.bridgeId[e.tile] >= 0 && this.bridges[this.bridgeId[e.tile]].night) {
            // escort them off the closing shortcut instead of killing them
            e.tile = this.nearestWalkable(e.x, e.y); e.next = e.tile; e.x = this.cx(e.tile % COLS); e.y = this.cx((e.tile / COLS) | 0);
            this.fx('blink', e.x, e.y, '#00e5ff');
          }
        }
        for (const b of this.bridges) if (b.night) b.anim = U.clamp(b.anim + (b.up ? dt * 2 : -dt * 2), 0, 1);
      }
      if (changed) {
        this.computeFields();
        for (const e of this.enemies) if (!e.dead && !e.flying && e.next != null && !this.walkable(e.next)) { const nn = this.nextTile(e.tile, this.field(e)); e.next = nn < 0 ? e.tile : nn; }
      }
      // rising river (Verdant): the ford floods on a cycle
      if (this.map.flood && this.wave > 0) {
        const f = this.map.flood;
        this.floodClock += dt;
        if (this.floodForceT > 0) this.floodForceT -= dt;
        if (this.sluiceCd > 0) this.sluiceCd -= dt;
        const on = (this.floodClock % f.period) > f.period - f.dur || this.floodForceT > 0;
        this.floodAmt = U.clamp(this.floodAmt + (on ? dt : -dt) * 0.8, 0, 1);
        if (on !== this.flooded) {
          this.flooded = on;
          if (on) { this.ev.emit('banner', 'THE RIVER RISES', 'The ford floods — enemies wading through are slowed; Frost flash-freezes them'); this.sfx('flood'); }
          else this.ev.emit('banner', 'THE WATERS RECEDE', '');
        }
      }
      for (const b of this.bridges) if (b.night) {
        if (b.sealCd > 0) b.sealCd -= dt;
        if (b.sealT > 0) { b.sealT -= dt; if (b.sealT <= 0 && this.isNight && !b.up) { b.up = true; this.computeFields(); } }
      }
      // vents
      for (const v of this.vents) {
        if (v.cd > 0) v.cd -= dt;
        if (!this.waveActive && this.wave === 0) continue;
        v.t -= dt;
        if (v.t <= 1.5 && !v.warn) { v.warn = 1; this.sfx('rumble', v.x, v.y); }
        if (v.t <= 0) this.eruptVent(v, false);
      }
      // ley drain (Nullwarden on Verdant) and molten trail (Magmaw)
      let leyChanged = false;
      for (let i = 0; i < N; i++) {
        if (this.leyDrain[i] > 0) { this.leyDrain[i] -= dt; if (this.leyDrain[i] <= 0) leyChanged = true; }
        if (this.molten[i] > 0) this.molten[i] -= dt;
      }
      if (leyChanged) this.refreshTowers();
      for (const m of this.minions) if (!m.dead) { const [c, r] = this.tileOf(m.x, m.y); if (this.inb(c, r) && this.molten[this.idx(c, r)] > 0) { m.hp -= 90 * dt; if (m.hp <= 0) this.killMinion(m); } }
    }
    nearestWalkable(x, y) {
      let best = this.nexus.i, bd = Infinity;
      for (let i = 0; i < N; i++) if (this.walkable(i)) { const d = U.dist2(x, y, this.cx(i % COLS), this.cx((i / COLS) | 0)); if (d < bd) { bd = d; best = i; } }
      return best;
    }

    update(dt) {
      if (this.over) return;
      this.time += dt;
      // spawning
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.time) {
        const q = this.spawnQueue.shift();
        const rec = this.waveRecords[q.wave];
        const se = this.spawnEnemy(q);
        if (q.first) this.sfx('spawn_' + q.type, se.x, se.y);
        if (se.elite || se.champion) this.sfx('eliteSpawn', se.x, se.y);
        if (rec) rec.pending--;
      }
      if (this.waveActive && !this.spawnQueue.length) { this.waveActive = false; this.awaitClear = this.canStartWave(); }
      // prep phase: the countdown to the next wave begins once the field is clear
      if (this.awaitClear && !this.enemies.length && !this.spawnQueue.length) {
        this.awaitClear = false; this.countdown = 15;
        this.ev.emit('prep');
      }
      if (this.countdown > 0) { this.countdown -= dt; if (this.countdown <= 0) { this.countdown = -1; this.startWave(false); } }
      this.updateWorld(dt);
      this.updateTowers(dt);
      this.updateMinions(dt);
      this.updateWells(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      // final victory check (all waves spawned & resolved)
      if (!this.endless && !this.over && this.wave >= this.totalWaves && !this.spawnQueue.length && !this.enemies.length && !Object.keys(this.waveRecords).length) this.victory();
    }
    pressure() {
      // 0..1 measure of threat for adaptive music
      if (!this.enemies.length) return this.waveActive ? 0.25 : 0.05;
      let p = Math.min(1, this.enemies.length / 22) * 0.5;
      let hp = 0; for (const e of this.enemies) hp += e.hp + e.shield;
      p += Math.min(0.2, hp / (260 * this.hpMul(Math.max(1, this.wave)) * 8)); // a healthy horde on the field counts as pressure too
      let close = 0;
      for (const e of this.enemies) { const r = this.remaining(e); if (r < 8) close += (8 - r) / 8 * (e.boss ? 6 : 1); }
      p += Math.min(0.5, close / 10);
      if (this.boss) p = Math.max(p, 0.85);
      return Math.min(1, p);
    }
    victory() {
      if (this.over) return;
      this.over = true; this.won = true;
      this.score += this.lives * 300;
      this.finalize();
      this.ev.emit('gameOver', true);
      this.sfx('victory');
    }
    defeat() {
      if (this.over) return;
      this.over = true; this.won = false;
      this.finalize();
      this.ev.emit('gameOver', false);
      this.sfx('defeat');
    }
    scoreMultiplier() { let m = this.diff.score; for (const k of this.mut) m += D.MUTATORS[k].score; return m; }
    finalize() {
      this.finalScore = Math.round(this.score * this.scoreMultiplier());
      const ratio = this.lives / this.maxLives;
      this.stars = this.won ? (this.bossEscaped ? 1 : ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1) : 0;
      const wavesCleared = this.won ? this.totalWaves : Math.max(0, this.wave - 1);
      const dm = { story: 0.7, veteran: 1, nightmare: 1.5 }[this.opts.difficulty || 'veteran'];
      this.shardsBase = Math.round((4 + wavesCleared * 0.6 + (this.won ? 10 : 0)) * dm * (1 + this.mut.size * 0.15));
      if (this.endless) this.shardsBase = Math.round(wavesCleared * 0.5 * dm);
    }
  }
  function segDist(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1; const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = U.clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  Game.TILE = { G, P, R, V, L, W, X, WA };
  AS.Game = Game;
})(AS);
