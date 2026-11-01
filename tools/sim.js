// Headless simulation harness: node tools/sim.js [mapId|all] [difficulty] [--ascii] [--bot=smart|weak]
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;
for (const f of ['util.js', 'data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const { D, Game, U } = global.AS;

const args = process.argv.slice(2);
const mapArg = args[0] || 'all';
const diff = args[1] && !args[1].startsWith('--') ? args[1] : 'veteran';
const ascii = args.includes('--ascii');
const botKind = (args.find(a => a.startsWith('--bot=')) || '--bot=smart').split('=')[1];
const research = args.includes('--research') ? D.RESEARCH.map(r => r.id) : [];
const mutators = (args.find(a => a.startsWith('--mut=')) || '--mut=').split('=')[1].split(',').filter(Boolean);
const endless = args.includes('--endless');

function dump(g) {
  const ch = { 0: '.', 1: '#', 2: '^', 3: ' ', 4: '~', 5: 'W', 6: 'v', 7: '=' };
  let out = '';
  for (let r = 0; r < D.ROWS; r++) {
    let line = '';
    for (let c = 0; c < D.COLS; c++) {
      const i = g.idx(c, r);
      let k = ch[g.type[i]];
      if (g.ley[i]) k = '*';
      if (g.bridgeId[i] >= 0) k = g.bridges[g.bridgeId[i]].night ? 'n' : '=';
      if (g.fixedBridge[i]) k = 'b';
      if (g.isSpawn[i]) k = 'S';
      if (i === g.nexus.i) k = 'N';
      line += k;
    }
    out += line + '\n';
  }
  return out;
}

function segD(x1, y1, x2, y2, px, py) { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; let t = ((px - x1) * dx + (py - y1) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); }
function bot(g, rng) {
  // A reasonably competent scripted player.
  const T = U.TILE;
  if (g.over) return;
  const plan = ['prism', 'mortar', 'frost', 'storm', 'prism', 'grove', 'conduit', 'storm', 'mortar', 'prism', 'frost', 'storm', 'mortar', 'prism', 'storm', 'conduit'];
  let want = plan[g.towers.length % plan.length];
  // air awareness: look at the current and next wave
  const waves = [g.currentWaveDef, g.nextWavePreview].filter(Boolean);
  const flyers = waves.some(w => w.groups.some(x => D.ENEMIES[x.type].flying));
  const airTowers = g.towers.filter(t => t.def.air && !t.def.support).length;
  const needAir = flyers && airTowers < 2 + g.wave / 4;
  if (needAir) want = airTowers % 2 ? 'storm' : 'prism';
  const upgradeable = g.towers.map(t => ({ t, o: g.nextLevelInfo(t) })).filter(x => x.o.length && !x.t.def.support);
  upgradeable.sort((a, b) => a.o[0].cost - b.o[0].cost);
  const doUpgrade = !needAir && g.towers.length >= (botKind === 'weak' ? 4 : 5) && upgradeable.length && rng() < 0.55;
  if (doUpgrade) {
    const u = upgradeable[0];
    const br = u.o.length > 1 ? (u.t.uid % 2) : 0;
    if (g.gold >= u.o[br].cost) { g.upgrade(u.t, br); return; }
    if (g.towers.length >= 12) return;
  }
  if (g.towers.length >= (botKind === 'weak' ? 8 : 26)) return;
  if (!g.towerUnlocked(want)) return;
  if (g.gold < g.towerCost(want)) return;
  const airSp = g.airSpawns || g.spawns;
  let best = null, bv = -1;
  for (let r = 0; r < D.ROWS; r++) for (let c = 0; c < D.COLS; c++) {
    if (!g.buildable(c, r)) continue;
    const pv = g.previewTower(want, c, r);
    let v = pv.covered + (pv.onLey ? 3 : 0) + pv.links.length * 2 + rng() * 0.5;
    if (needAir) {
      let near = 99;
      for (const sp of airSp) near = Math.min(near, segD(g.cx(sp.c), g.cx(sp.r), g.nexus.x, g.nexus.y, g.cx(c), g.cx(r)) / T);
      v = (near < pv.s.range ? 20 - near * 3 : 0) + pv.covered * 0.3;
    }
    if (want === 'conduit') { v = 0; for (const t of g.towers) if (!t.def.support && U.dist(t.x, t.y, g.cx(c), g.cx(r)) <= pv.s.range * T) v += 3; }
    if (v > bv) { bv = v; best = [c, r]; }
  }
  if (best) g.place(want, best[0], best[1]);
}

function run(mapId) {
  const g = new Game({ mapId, difficulty: diff, research, mutators, endless, seed: U.hashStr(mapId) });
  if (ascii) console.log(mapId + '\n' + dump(g));
  const rng = U.rng(42);
  let errors = 0;
  g.ev.on('error', () => errors++);
  const dt = 1 / 60;
  let t = 0, lastWave = 0;
  const log = [];
  g.ev.on('waveEnd', (w, perfect) => log.push(w + (perfect ? '' : '!')));
  g.ev.on('leak', (e, d) => { if (process.env.LEAKS) log.push('L:' + e.type + (e.elite ? '*' : '') + (e.champion ? 'C' : '')); if (e.boss) log.push('BOSS-LEAK(' + Math.round(e.hp) + '/' + Math.round(e.maxHp) + ')'); });
  g.ev.on('kill', (e) => { if (e.boss) log.push('BOSS-KILLED@' + U.fmtTime(g.time)); });
  for (let step = 0; step < 60 * 60 * 60 && !g.over; step++) {
    if (step % 30 === 0) {
      bot(g, rng);
      // use abilities when ready
      if (botKind !== 'passive') for (const tw of g.towers) if (g.abilityReady(tw) && g.enemies.length > 5) {
        if (tw.def.ability.targeted) { const e = g.acquire(tw, tw.s.range); if (e) g.useAbility(tw, e.x, e.y); }
        else g.useAbility(tw);
      }
      if (g.wave === 0) g.startWave(false);
      else if (process.env.EARLY && g.countdown > 0 && g.enemies.length < 3) g.startWave(true);
      if (botKind !== 'passive' && g.essence >= 5 && g.lives < g.maxLives - 4) g.usePower('mend');
      if (botKind !== 'weak' && botKind !== 'passive') {
        // competent-player habits: overclock under pressure, meteor clusters / the boss, slot mods
        const pressure = g.enemies.length > 14 || g.boss;
        if (pressure) for (const tw of g.towers) if (tw.strain < 2 && !tw.def.support && tw.level >= 2) g.overclock(tw);
        if (g.essence >= 6 || (g.boss && g.essence >= 3)) {
          const tgt = g.boss || g.enemies.slice().sort((a, b) => g.remaining(a) - g.remaining(b))[0];
          if (tgt && g.remaining(tgt) < 25) g.usePower('meteor', tgt.x, tgt.y);
        }
        if (g.boss && g.essence >= 4) g.usePower('stasis');
        for (const tw of g.towers) if (g.modSlots(tw) > tw.mods.length && g.essence >= 8) g.installMod(tw, tw.mods.includes('exec') ? 'overdrive' : 'exec');
      }
    }
    g.update(dt);
    t += dt;
    if (endless && g.wave > 60) break;
  }
  const kinds = {};
  for (const tw of g.towers) kinds[tw.id] = (kinds[tw.id] || 0) + 1;
  const dmgBy = {};
  for (const tw of g.towers) dmgBy[tw.id] = Math.round((dmgBy[tw.id] || 0) + tw.dmgDealt);
  console.log(`${mapId.padEnd(9)} ${diff} won=${g.won} wave=${g.wave}/${g.totalWaves} lives=${g.lives}/${g.maxLives} stars=${g.stars} score=${g.finalScore} time=${U.fmtTime(t)} gold=${g.gold} towers=${g.towers.length} kills=${g.kills} leaks=${g.leaks} ess=${g.essence}`);
  console.log('   waves: ' + log.join(' '));
  console.log('   dmg:', JSON.stringify(dmgBy));
  return g;
}

const maps = mapArg === 'all' ? D.MAPS.map(m => m.id) : [mapArg];
for (const m of maps) run(m);
