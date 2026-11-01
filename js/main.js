// Aether Spire — application controller: screens, input, progression, game loop
(function (AS) {
  'use strict';
  const U = AS.U, D = AS.D, UI = AS.UI, Audio = AS.Audio, T = U.TILE;
  const SAVE_KEY = 'aetherspire.save.v1';
  const $ = s => document.querySelector(s);

  const DEFAULT_SAVE = () => ({
    shards: 0, research: [], skins: ['classic'], skin: 'classic', maps: {}, seen: [], records: {}, daily: {}, weekly: {}, rivals: [], ascension: 0, name: 'Architect', tutorialDone: false,
    settings: { master: 0.8, music: 0.55, sfx: 0.8, shake: true, numbers: true, post: 'high', flashes: true, tutorial: true, labels: true, autoQ: true, fps: false },
  });

  const App = {
    save: null, view: null, game: null, demo: null, screen: 'title', speed: 1, paused: false, mode: null, selected: null,
    mouse: { x: 0, y: 0, inside: false, down: false }, modPicker: false, mapSel: { id: 'verdant', diff: 'veteran', mutators: [], endless: false }, thumbs: {},
    tut: null, pad: { active: false, x: 400, y: 300, prev: [] },
  };

  // ============================================================ SAVE
  App.defaultDiff = function () { return Object.values(App.save.maps).some(m => m.completed) ? 'veteran' : 'story'; };
  App.load = function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
    const d = DEFAULT_SAVE();
    App.save = Object.assign(d, s || {});
    App.save.settings = Object.assign(DEFAULT_SAVE().settings, (s && s.settings) || {});
  };
  App.persist = function () { try { localStorage.setItem(SAVE_KEY, JSON.stringify(App.save)); } catch (e) { /* storage unavailable */ } };
  App.applySettings = function () {
    const st = App.save.settings;
    Audio.setVolumes(st.master, st.sfx, st.music);
    Object.assign(App.view.settings, { shake: st.shake, numbers: st.numbers, post: st.post, flashes: st.flashes, labels: st.labels });
    App.view.resize();
    App.persist();
  };
  App.mapUnlocked = function (i) { return i === 0 || !!(App.save.maps[D.MAPS[i - 1].id] || {}).completed; };
  App.mapThumb = function (m) {
    if (!App.thumbs[m.id]) {
      const g = new AS.Game({ mapId: m.id });
      const bg = AS.R.buildBackground(g);
      const c = document.createElement('canvas'); c.width = 640; c.height = 363;
      const x = c.getContext('2d'); x.drawImage(bg, 0, 0, 640, 363);
      // overlay route hint & nexus
      x.fillStyle = 'rgba(127,227,255,0.9)'; x.beginPath(); x.arc(g.nexus.x / 3, g.nexus.y / 3, 9, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,77,106,0.9)'; for (const s of g.spawns) { x.beginPath(); x.arc((s.c * T + 32) / 3, (s.r * T + 32) / 3, 8, 0, 7); x.fill(); }
      App.thumbs[m.id] = c.toDataURL('image/jpeg', 0.85);
    }
    return App.thumbs[m.id];
  };
  App.weekKey = function () { const d = new Date(); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); const day = (new Date(t).getUTCDay() + 6) % 7; const th = new Date(t - day * 864e5 + 3 * 864e5); const y = th.getUTCFullYear(); const wk = 1 + Math.round(((th - Date.UTC(y, 0, 4)) / 864e5 - 3 + ((new Date(Date.UTC(y, 0, 4)).getUTCDay() + 6) % 7)) / 7); return y + '-W' + String(wk).padStart(2, '0'); };
  App.weeklyConfig = function () {
    const key = App.weekKey(), seed = U.hashStr('weekly' + key), r = U.rng(seed);
    const open = D.MAPS.filter((m, i) => App.mapUnlocked(i));
    const map = open[(seed >>> 3) % open.length];
    const pool = Object.keys(D.MUTATORS).filter(k => k !== 'glass'); const muts = [];
    while (muts.length < 3) { const k = r.pick(pool); if (!muts.includes(k)) muts.push(k); }
    return { key, seed, map, mutators: muts };
  };
  // ---- shareable score codes (offline "leaderboard": compare against imported rival codes)
  const MAPC = { verdant: 'V', skyreach: 'S', neon: 'N', cinder: 'C' }, DIFC = { story: 'S', veteran: 'V', nightmare: 'N' };
  App.makeCode = function (g) {
    const name = (App.save.name || 'Architect').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'Architect';
    const body = [MAPC[g.map.id], DIFC[g.opts.difficulty || 'veteran'], g.finalScore.toString(36), g.wave.toString(36), (g.won ? g.stars : 0), (g.endless ? 'E' : g.daily ? 'D' : 'C'), name].join('.');
    return 'AS1-' + body + '-' + (U.hashStr(body + 'aether') % 46656).toString(36).padStart(3, '0');
  };
  App.parseCode = function (code) {
    const m = /^AS1-(.+)-([0-9a-z]{3})$/.exec(code.trim()); if (!m) return null;
    if ((U.hashStr(m[1] + 'aether') % 46656).toString(36).padStart(3, '0') !== m[2]) return null;
    const [mc, dc, sc, wv, st, mode, name] = m[1].split('.');
    const map = Object.keys(MAPC).find(k => MAPC[k] === mc), diff = Object.keys(DIFC).find(k => DIFC[k] === dc);
    if (!map || !diff) return null;
    return { map, diff, score: parseInt(sc, 36), wave: parseInt(wv, 36), stars: +st, won: +st > 0, mode, name, code: code.trim() };
  };
  App.rivalBoard = function () {
    const out = [];
    for (const m of D.MAPS) for (const r of (App.save.records[m.id] || []).slice(0, 3)) out.push({ name: (App.save.name || 'Architect') + ' (you)', map: m.name, score: r.score, diff: r.diff, won: r.won, stars: r.stars, wave: r.wave });
    for (const r of App.save.rivals || []) out.push({ name: r.name, map: (D.MAPS.find(m => m.id === r.map) || {}).name, score: r.score, diff: r.diff, won: r.won, stars: r.stars, wave: r.wave, rival: true });
    return out.sort((a, b) => b.score - a.score).slice(0, 20);
  };
  App.dailyConfig = function () {
    const key = U.todayKey(), seed = U.hashStr('daily' + key), r = U.rng(seed);
    const open = D.MAPS.filter((m, i) => App.mapUnlocked(i));
    const map = open[seed % open.length];
    const pool = Object.keys(D.MUTATORS).filter(k => k !== 'glass');
    const a = r.pick(pool); let b = r.pick(pool); while (b === a) b = r.pick(pool);
    return { key, seed, map, mutators: [a, b] };
  };

  // ============================================================ ACTIONS (data-act)
  App.action = function (act, ds) {
    const g = App.game;
    switch (act) {
      case 'campaign': if (!App._diffSet) { App.mapSel.diff = App.defaultDiff(); App._diffSet = true; } UI.showScreen('maps'); App.screen = 'maps'; UI.buildMaps(); break;
      case 'daily': { const dc = App.dailyConfig(); App.startGame({ mapId: dc.map.id, difficulty: 'veteran', mutators: dc.mutators, daily: true, seed: dc.seed }); break; }
      case 'weekly': { const wc = App.weeklyConfig(); App.startGame({ mapId: wc.map.id, difficulty: 'veteran', mutators: wc.mutators, daily: true, weekly: true, seed: wc.seed }); break; }
      case 'copycode': UI.copyCode(); break;
      case 'importcode': { const inp = document.getElementById('code-in'); const r = App.parseCode(inp ? inp.value : ''); if (!r) { UI.toast('Invalid or tampered score code'); Audio.play('error'); break; } App.save.rivals = (App.save.rivals || []).filter(x => x.code !== r.code); App.save.rivals.push(r); App.persist(); UI.toast('Imported ' + r.name + "'s run", true); UI.buildSanctum('records'); break; }
      case 'ascend': {
        if (!D.MAPS.every(m => (App.save.maps[m.id] || {}).completed) || !App.save.research.length) { UI.toast('Complete every map (and own research) to Ascend'); Audio.play('error'); break; }
        if (!App.ascArmed) { App.ascArmed = true; UI.toast('Click Ascend again to reset research for a permanent bonus'); setTimeout(() => App.ascArmed = false, 3000); break; }
        App.save.research = []; App.save.ascension = (App.save.ascension || 0) + 1; App.persist(); Audio.play('phoenix'); UI.buildSanctum('research'); UI.toast('Ascension ' + App.save.ascension + ' attained', true); break;
      }
      case 'sanctum': UI.showScreen('sanctum'); App.screen = 'sanctum'; UI.buildSanctum(App.sanctumTab || 'research'); break;
      case 'settings': UI.settings(); break;
      case 'controls': UI.controls(); break;
      case 'back': UI.showScreen('title'); App.screen = 'title'; break;
      case 'diff': App.mapSel.diff = ds.v; App._diffSet = true; UI.buildMapDetail(); break;
      case 'mut': { const m = App.mapSel.mutators; const i = m.indexOf(ds.v); if (i >= 0) m.splice(i, 1); else m.push(ds.v); UI.buildMapDetail(); break; }
      case 'endless': App.mapSel.endless = ds.v === '1'; UI.buildMapDetail(); break;
      case 'start': App.startGame({ mapId: App.mapSel.id, difficulty: App.mapSel.diff, mutators: App.mapSel.mutators.slice(), endless: App.mapSel.endless }); break;
      case 'equipmastery': {
        const m = App.save.mastery = App.save.mastery || [];
        const i = m.indexOf(ds.id);
        if (i >= 0) m.splice(i, 1); else { if (m.length >= 2) m.shift(); m.push(ds.id); }
        App.persist(); Audio.play('select'); UI.buildSanctum('research'); break;
      }
      case 'research': {
        const r = D.RESEARCH.find(x => x.id === ds.id);
        if (App.save.shards < r.cost) { UI.toast('Not enough Aether Shards'); Audio.play('error'); break; }
        App.save.shards -= r.cost; App.save.research.push(r.id); if (r.id.startsWith('mastery_') && (App.save.mastery || []).length < 2) App.save.mastery = (App.save.mastery || []).concat(r.id); App.persist(); Audio.play('upgradeBig'); UI.buildSanctum('research'); UI.toast(r.name + ' researched', true);
        break;
      }
      case 'skin': App.save.skin = ds.id; App.persist(); UI.clearIcons(); UI.buildSanctum('armory'); break;
      case 'buyskin': { const s = D.SKINS[ds.id]; if (App.save.shards < s.cost) { UI.toast('Not enough Aether Shards'); Audio.play('error'); break; } App.save.shards -= s.cost; App.save.skins.push(ds.id); App.save.skin = ds.id; App.persist(); UI.clearIcons(); Audio.play('mod'); UI.buildSanctum('armory'); break; }
      case 'closemodal': UI.closeModal(); if (App.screen === 'game' && App.pausedByModal) { App.paused = false; App.pausedByModal = false; } break;
      case 'settoggle': App.save.settings[ds.k] = !App.save.settings[ds.k]; App.applySettings(); UI.settings(); break;
      case 'setpost': App.save.settings.autoQ = false; App.save.settings.post = ds.v; App.applySettings(); UI.settings(); break;
      case 'resetsave': if (App.resetArmed) { localStorage.removeItem(SAVE_KEY); location.reload(); } else { App.resetArmed = true; UI.toast('Click again to permanently erase all progress'); setTimeout(() => App.resetArmed = false, 3000); } break;
      case 'resume': UI.closeModal(); App.paused = false; App.pausedByModal = false; break;
      case 'restart': UI.closeModal(); App.startGame(App.lastOpts); break;
      case 'quit': UI.closeModal(); App.endGame(); break;
      case 'sanctumFromResult': UI.closeModal(); App.endGame(); App.action('sanctum', {}); break;
      case 'nextmap': { UI.closeModal(); const i = D.MAPS.findIndex(m => m.id === App.lastOpts.mapId); App.startGame({ mapId: D.MAPS[i + 1].id, difficulty: App.lastOpts.difficulty, mutators: [] }); break; }
      case 'deselect': App.select(null); break;
      case 'panelmin': App.panelMin = App.save.panelMin = !App.panelMin; App.persist(); UI.panelKey = null; break;
      case 'upgrade': if (g && App.selected && App.selected.def) { if (g.upgrade(App.selected, +ds.branch || 0)) { UI.panelKey = null; App.tutEvent('upgrade'); } } break;
      case 'target': if (App.selected) { App.selected.targeting = ds.v; UI.panelKey = null; } break;
      case 'ability': App.ability(); break;
      case 'overclock': if (App.selected && g.overclock(App.selected)) { UI.panelKey = null; App.tutEvent('overclock'); } break;
      case 'modpick': App.modPicker = !App.modPicker; break;
      case 'mod': if (App.selected && g.installMod(App.selected, ds.id)) App.modPicker = false; break;
      case 'relocate': App.setMode({ kind: 'relocate', tower: App.selected }); UI.toast('Click an empty tile to move the tower', true); break;
      case 'rally': App.setMode({ kind: 'rally', tower: App.selected }); UI.toast('Click a path tile within range', true); break;
      case 'sell': if (App.selected && (App.selected.def || App.selected.barricade)) { g.sell(App.selected); App.select(null); } break;
      case 'collapse': if (App.selected && App.selected.bridge) g.collapseBridge(App.selected); break;
      case 'seal': if (App.selected && App.selected.shortcut) g.sealShortcut(App.selected); UI.panelKey = null; break;
      case 'sluice': g.openSluice(); UI.panelKey = null; break;
      case 'detonate': if (App.selected && App.selected.vent) g.detonateVent(App.selected); UI.panelKey = null; break;
      case 'rebuild': if (App.selected && App.selected.bridge && g.rebuildBridge(App.selected)) UI.panelKey = null; break;
      case 'tutnext': App.tutAdvance(true); break;
      case 'tutskip': App.save.tutorialDone = true; App.persist(); App.tut = null; UI.tutorial(null); break;
    }
  };
  App.tipFor = function (kind, ds) {
    const g = App.game || App.demo;
    if (kind === 'build') return UI.buildTip(g, ds.id);
    if (kind === 'enemy') return UI.enemyTip(ds.type);
    if (kind === 'power') { const p = D.POWERS[ds.id]; return `<b>${p.icon} ${p.name}</b> <span style="color:var(--pink)">${p.cost} Essence</span><br>${p.desc}<br><span class="tt-dim">Cooldown ${p.cd}s · Hotkey ${p.hotkey}</span>`; }
    if (kind === 'upgrade' && App.selected) { const o = g.nextLevelInfo(App.selected)[+ds.branchi]; return `<b>${o.name}</b><br>${o.blurb}<br><span class="tt-dim">Tier 5 continues this branch. You cannot switch later.</span>`; }
    return '';
  };

  // ============================================================ GAME LIFECYCLE
  App.startGame = function (opts) {
    Audio.init();
    App.lastOpts = opts;
    if (App.game) App.game.over = true;
    App.demo = null;
    const eq = App.save.mastery || [];
    const g = new AS.Game(Object.assign({}, opts, { research: App.save.research.filter(r => !r.startsWith('mastery_') || eq.includes(r)), seenEnemies: App.save.seen, ascension: App.save.ascension || 0 }));
    App.game = g;
    App.mode = null; App.selected = null; App.paused = false; App.speed = 1; App.modPicker = false; App.panelMin = !!App.save.panelMin;
    App.view.setGame(g, D.SKINS[App.save.skin] || D.SKINS.classic);
    App.view.settings.numbers = App.save.settings.numbers;
    App.view.menuMode = false;
    App.view.cam.tz = 1;
    App.screen = 'game'; UI.showScreen('game'); UI.buildHUD(g); UI.hidePanel();
    Audio.music.setMood(g.map.biome); Audio.music.start();
    App.hookGame(g);
    UI.banner(g.map.name.toUpperCase(), g.daily ? (opts.weekly ? 'Weekly Gauntlet · ' : 'Daily Challenge · ') + [...g.mut].map(k => D.MUTATORS[k].name).join(' + ') : g.endless ? 'Endless Siege' : g.map.mechanic.split(':')[0], '', 2600);
    if (!App.save.tutorialDone && App.save.settings.tutorial && g.map.id === 'verdant' && !g.daily) App.tutStart();
    else App.tut = null, UI.tutorial(null);
  };
  App.hookGame = function (g) {
    const ev = g.ev;
    ev.on('sfx', (n, x) => Audio.play(n, x));
    ev.on('error', msg => { if (msg) UI.toast(msg); Audio.play('error'); });
    ev.on('banner', (a, b) => UI.banner(a, b, a === 'NIGHTFALL' ? 'boss' : ''));
    ev.on('waveStart', (def) => {
      const nx = g.nextWavePreview;
      if (nx && !g.endless && (nx.boss || nx.groups.some(x => x.herald))) {
        const her = nx.groups.some(x => x.herald) && !nx.boss, r = g.bossReadiness(nx.wave, her);
        if (r < 1.1) setTimeout(() => UI.toast('⚠ ' + (her ? 'Herald' : 'Boss') + ' next wave — readiness ' + Math.round(r * 100) + '%. Strengthen the route before calling it!'), 2200);
      }
      const hg = def.groups.find(x => x.herald);
      if (hg) UI.banner('HERALD OF ' + D.ENEMIES[hg.type].name.split(',')[0].toUpperCase(), 'A lesser avatar tests your defences — it previews the boss\'s powers', 'boss', 3000);
      else if (def.boss) { const bt = def.groups.find(x => x.boss).type; UI.banner(D.ENEMIES[bt].name.toUpperCase(), bt === 'magmaw' ? 'The forge itself rises against you' : 'A colossus of the void approaches', 'boss', 3200); }
      else UI.banner('WAVE ' + def.wave, def.mods.length ? def.mods.map(k => D.WAVE_MODS[k].name).join(' · ') : (def.groups.some(x => x.champion) ? 'Champion sighted' : ''), '', 1700);
      App.tutEvent('wave');
    });
    ev.on('waveEnd', (w, perfect, msg) => UI.toast(msg, true));
    ev.on('newEnemy', type => { UI.threat(type); if (!App.save.seen.includes(type)) { App.save.seen.push(type); App.persist(); } });
    ev.on('bossPhase', (e, ph) => UI.banner('PHASE ' + ['I', 'II', 'III'][ph - 1], e.type === 'magmaw' ? (ph === 2 ? 'The carapace cracks — armour falls, a burning trail follows' : 'CATACLYSM — every vent will erupt') : (ph === 2 ? 'The Nullwarden raises its shield and calls the brood' : 'ENRAGED — it tears through space'), 'boss', 2400));
    ev.on('prep', () => { UI.toast('Field clear — prep phase. Build, upgrade, then call the wave early for bonus gold.', true); App.tutEvent('wave'); });
    ev.on('gameOver', win => setTimeout(() => App.finish(g), win ? 1600 : 1200));
    ev.on('placed', t => { App.tutEvent('place'); if (t.syn && t.syn.size) App.tutEvent('synergy'); });
    ev.on('sold', t => { if (App.selected === t) App.select(null); });
  };
  App.endGame = function () {
    if (App.game && !App.game.over) App.recordRun(App.game, true);
    App.game = null; App.selected = null; App.mode = null; App.paused = false;
    UI.tutorial(null); UI.hidePanel();
    App.startDemo();
    UI.showScreen('title'); App.screen = 'title';
  };
  App.recordRun = function (g, abandoned) {
    if (!g.finalScore && g.finalScore !== 0) g.finalize();
    const rec = { score: g.finalScore, diff: g.opts.difficulty || 'veteran', mutators: [...g.mut], won: g.won, stars: g.stars, wave: g.wave, endless: g.endless, date: U.todayKey() };
    const list = App.save.records[g.map.id] = App.save.records[g.map.id] || [];
    const prevBest = list.length ? list[0].score : 0;
    if (!abandoned || g.wave > 0) { list.push(rec); list.sort((a, b) => b.score - a.score); list.length = Math.min(list.length, 8); }
    App.persist();
    return rec.score > prevBest;
  };
  App.finish = function (g) {
    if (App.game !== g) return;
    const r = { shards: Math.round(g.shardsBase * (1 + 0.15 * (App.save.ascension || 0))), newStars: 0, medals: [], record: false, next: null, unlocked: null, code: App.makeCode(g) };
    const prog = App.save.maps[g.map.id] = App.save.maps[g.map.id] || { stars: 0, best: 0, completed: false };
    if (g.won && !g.endless && !g.daily) {
      const ns = Math.max(0, g.stars - (prog.stars || 0));
      r.newStars = ns; r.shards += ns * 10;
      prog.stars = Math.max(prog.stars || 0, g.stars);
      const idx = D.MAPS.findIndex(m => m.id === g.map.id);
      if (!prog.completed && D.MAPS[idx + 1]) r.unlocked = D.MAPS[idx + 1].name;
      prog.completed = true;
      if (g.opts.difficulty === 'nightmare' && !prog.nightmare) { prog.nightmare = true; r.medals.push('☠ Nightmare Victor'); r.shards += 15; }
      if (g.mut.size >= 2 && !prog.mutated) { prog.mutated = true; r.medals.push('✧ Mutated Victor'); r.shards += 10; }
      if (g.leaks === 0 && !prog.flawless) { prog.flawless = true; r.medals.push('✦ Flawless'); r.shards += 10; }
      for (const [medal, skin] of Object.entries(D.MEDAL_UNLOCKS)) if (prog[medal] && !App.save.skins.includes(skin)) { App.save.skins.push(skin); r.medals.push('Skin unlocked: ' + D.SKINS[skin].name); }
      if (D.MAPS[idx + 1]) r.next = D.MAPS[idx + 1];
    }
    if (g.opts.weekly) {
      const wk = App.weekKey(); const d = App.save.weekly[wk] = App.save.weekly[wk] || { best: 0, won: false };
      if (g.won && !d.won) { r.shards += 30; r.medals.push('Weekly Gauntlet cleared +30'); }
      d.best = Math.max(d.best, g.finalScore); d.won = d.won || g.won;
    } else if (g.daily) {
      const dk = U.todayKey(); const d = App.save.daily[dk] = App.save.daily[dk] || { best: 0, won: false };
      if (g.won && !d.won) { r.shards += 15; r.medals.push('Daily cleared +15'); }
      d.best = Math.max(d.best, g.finalScore); d.won = d.won || g.won;
    }
    if (!g.daily) { r.record = g.finalScore > (prog.best || 0); prog.best = Math.max(prog.best || 0, g.finalScore); }
    App.recordRun(g);
    App.save.shards += r.shards;
    App.persist();
    App.mode = null; App.select(null);
    UI.results(g, r);
  };

  // ============================================================ SELECTION / MODES
  App.select = function (o) {
    App.selected = o; App.modPicker = false; UI.panelKey = null; UI.hideTip();
    if (!o) UI.hidePanel(); else { Audio.play('select'); UI.refreshPanel(App.game); }
  };
  App.setMode = function (m) {
    App.mode = m;
    document.body.classList.toggle('placing', !!m);
    App.updatePreview();
  };
  App.toggleBuild = function (id) {
    const g = App.game; if (!g) return;
    if (App.mode && App.mode.kind === 'build' && App.mode.id === id) { App.setMode(null); return; }
    if (id !== 'barricade' && !g.towerUnlocked(id)) { UI.toast('Locked — research Void Theory in the Sanctum'); Audio.play('error'); return; }
    App.select(null);
    App.setMode({ kind: 'build', id });
  };
  App.power = function (id) {
    const g = App.game; if (!g) return;
    const p = D.POWERS[id];
    if (g.powerCd[id] > 0) { UI.toast(p.name + ' recharging'); Audio.play('error'); return; }
    if (g.essence < p.cost) { UI.toast('Not enough Essence'); Audio.play('error'); return; }
    if (p.targeted) App.setMode({ kind: 'power', id });
    else g.usePower(id);
  };
  App.ability = function () {
    const g = App.game, t = App.selected;
    if (!g || !t || !t.def) return;
    if (t.level < 1) { UI.toast('Abilities unlock at Tier 2'); Audio.play('error'); return; }
    if (!g.abilityReady(t)) { UI.toast(t.def.ability.name + ' is recharging'); Audio.play('error'); return; }
    if (t.def.ability.targeted) { App.setMode({ kind: 'ability', tower: t }); UI.toast('Choose a target area', true); }
    else g.useAbility(t);
    App.tutEvent('ability');
  };
  App.updatePreview = function () {
    const g = App.game, v = App.view;
    App.preview = null; App.hoverBridge = null;
    if (!g || !App.mouse.inside) return;
    const [wx, wy] = v.screenToWorld(App.mouse.x, App.mouse.y);
    const c = Math.floor(wx / T), r = Math.floor(wy / T);
    const m = App.mode;
    if (m && m.kind === 'build') {
      if (m.id === 'barricade') App.preview = { kind: 'barricade', c, r, x: g.cx(c), y: g.cx(r), ok: g.canPlace('barricade', c, r).ok };
      else {
        const ok = g.canPlace(m.id, c, r).ok;
        const key = m.id + c + ',' + r + g.towers.length;
        if (App._pvKey !== key) { App._pvKey = key; App._pvInfo = g.inb(c, r) ? g.previewTower(m.id, c, r) : null; }
        App.preview = { kind: 'tower', id: m.id, c, r, x: g.cx(c), y: g.cx(r), ok, info: App._pvInfo };
        if (App._pvInfo && g.inb(c, r)) {
          const info = App._pvInfo;
          UI.tip(`<b>${D.TOWERS[m.id].name}</b> ${ok ? '' : '<span style="color:var(--red)">' + (g.canPlace(m.id, c, r).why) + '</span>'}<div class="tt-stats"><span>Projected DPS</span><span>${D.TOWERS[m.id].support ? 'Support' : Math.round(info.dps)}</span><span>Path tiles covered</span><span>${info.covered}</span>${info.onLey ? '<span>Ley Node</span><span style="color:#9fffcf">+25% dmg, +20% range</span>' : ''}${info.aura ? `<span>Conduit aura</span><span style="color:var(--pink)">+${Math.round(info.aura.s.auraDmg * 100)}% dmg</span>` : ''}${info.links.length ? `<span>Synergies</span><span style="color:#fff3b0">${[...new Set(info.links.map(l => l.syn.name))].join(', ')}</span>` : ''}</div>`);
          UI.placeTip(App.mouse.x, App.mouse.y);
        }
      }
    } else if (m && (m.kind === 'power' || (m.kind === 'ability' && m.tower.def.ability.targeted))) {
      App.preview = { kind: m.kind === 'power' ? 'meteor' : 'barrage', x: wx, y: wy };
    } else if (m && m.kind === 'relocate') {
      App.preview = { kind: 'relocate', c, r, ok: g.buildable(c, r) };
    } else if (m && m.kind === 'rally') {
      App.preview = { kind: 'rally' };
    } else {
      if (g.inb(c, r)) { const i = g.idx(c, r); const b = g.bridgeId[i]; if (b >= 0 && !g.bridges[b].night) App.hoverBridge = g.bridges[b]; }
    }
  };
  App.pickAt = function (wx, wy) {
    const g = App.game;
    // enemies first (small, moving)
    let best = null, bd = 30 * 30;
    for (const e of g.enemies) { const d2 = U.dist2(wx, wy, e.x, e.y - (e.flying ? 26 : 0)); if (d2 < Math.max(bd, e.r * e.r * 1.6) && d2 < bd + e.r * e.r) { bd = d2; best = e; } }
    const c = Math.floor(wx / T), r = Math.floor(wy / T);
    if (g.inb(c, r)) {
      const o = g.occ[g.idx(c, r)];
      if (o) return o;
      const b = g.bridgeId[g.idx(c, r)];
      if (b >= 0 && !g.bridges[b].night && !best) return Object.assign(g.bridges[b], { bridge: true });
      if (b >= 0 && g.bridges[b].night && !best) return Object.assign(g.bridges[b], { shortcut: true });
      const v = g.vents.find(v2 => v2.c === c && v2.r === r); if (v && !best) return Object.assign(v, { vent: true });
      if (g.map.flood && !best && (g.type[g.idx(c, r)] === 7 || g.floodSet.has(g.idx(c, r)))) return { sluice: true, id: 'sluice' };
    }
    if (best) return { enemy: true, e: best, get dead() { return best.dead; } };
    return null;
  };
  App.canvasClick = function (x, y, button, shift) {
    const g = App.game; if (!g || g.over) return;
    Audio.init();
    const [wx, wy] = App.view.screenToWorld(x, y);
    const c = Math.floor(wx / T), r = Math.floor(wy / T);
    const m = App.mode;
    if (button === 2) { if (m) App.setMode(null); else App.select(null); UI.hideTip(); return; }
    if (m) {
      if (m.kind === 'build') {
        const placed = g.place(m.id, c, r);
        if (placed && !shift) { App.setMode(null); UI.hideTip(); }
        App._pvKey = null; App.updatePreview();
      } else if (m.kind === 'power') { if (g.usePower(m.id, wx, wy)) App.setMode(null); }
      else if (m.kind === 'ability') { if (g.useAbility(m.tower, wx, wy)) App.setMode(null); }
      else if (m.kind === 'relocate') { if (g.relocate(m.tower, c, r)) { App.setMode(null); UI.panelKey = null; } }
      else if (m.kind === 'rally') { if (g.setRally(m.tower, c, r)) { App.setMode(null); UI.toast('Rally point set', true); } }
      return;
    }
    App.select(App.pickAt(wx, wy));
  };

  // ============================================================ INPUT
  App.bindInput = function () {
    const cv = $('#view');
    let drag = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      Audio.init();
      if (e.button === 1 || e.button === 2) { drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button }; e.preventDefault(); }
      App.mouse.down = true;
    });
    window.addEventListener('mousemove', e => {
      App.mouse.x = e.clientX; App.mouse.y = e.clientY; App.mouse.inside = e.target === cv;
      if (App.pad.active) { App.pad.active = false; document.body.classList.remove('pad'); $('#cursor').classList.add('hidden'); }
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved && App.view.game && App.game) { App.view.pan(dx, dy); drag.x = e.clientX; drag.y = e.clientY; } }
      if (App.game) {
        App.updatePreview();
        if (!App.mode && App.mouse.inside) {
          const [wx, wy] = App.view.screenToWorld(e.clientX, e.clientY);
          const o = App.pickAt(wx, wy);
          if (o && o.enemy) { const en = o.e; UI.tip(`<b>${en.def.name}</b>${en.elite ? ' <span style="color:var(--gold)">Elite</span>' : ''}${en.champion ? ` <span style="color:${D.AFFIXES[en.champion].color}">Champion · ${D.AFFIXES[en.champion].name}</span>` : ''}<br>HP ${U.fmt(en.hp)} / ${U.fmt(en.maxHp)}${en.shield > 0 ? ' · Shield ' + U.fmt(en.shield) : ''}${en.armor ? ' · Armour ' + Math.round(en.armor * 100) + '%' : ''}<br><span class="tt-dim">${en.def.desc}</span>`, e); }
          else if (o && o.def && o.def.levels) UI.tip(`<b>${o.def.name}</b> <span style="color:var(--gold)">${App.game.tierName(o)}</span><br><span class="tt-dim">${o.def.support ? 'Support aura' : 'DPS ≈ ' + Math.round(App.game.estimateDps(o))} · ${o.kills} kills · click for details</span>`, e);
          else if (o && (o.vent || o.sluice || o.shortcut) && App.selected !== o) UI.tip(`<b>${o.vent ? 'Magma Vent' : o.sluice ? 'River Sluice' : 'Night Shortcut'}</b><br>Click to ${o.vent ? 'detonate it on demand' : o.sluice ? 'flood the ford on demand' : 'seal it against the horde'}.`, e);
          else if (o && o.bridge && App.selected !== o) UI.tip('<b>Ancient Bridge</b><br>Click to select, then collapse it to drop enemies into the abyss.', e);
          else if (App.mouse.inside && !e.target.closest('[data-tip],[data-tipfn]')) UI.hideTip();
        } else if (!App.mode) UI.hideTip();
      }
    });
    window.addEventListener('mouseup', e => {
      App.mouse.down = false;
      if (drag && drag.button === e.button) { const wasDrag = drag.moved; drag = null; if (wasDrag) return; if (e.button === 2 && e.target === cv) App.canvasClick(e.clientX, e.clientY, 2); return; }
      if (e.button === 0 && e.target === cv) App.canvasClick(e.clientX, e.clientY, 0, e.shiftKey);
    });
    cv.addEventListener('wheel', e => { if (!App.game) return; e.preventDefault(); App.view.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    cv.addEventListener('mouseleave', () => { App.mouse.inside = false; App.preview = null; });
    window.addEventListener('resize', () => App.view.resize());
    window.addEventListener('keydown', App.onKey);
    $('#btn-wave').onclick = () => { Audio.init(); App.callWave(); };
    $('#btn-pause').onclick = () => App.togglePause();
    $('#btn-menu').onclick = () => App.openPause();
    document.querySelectorAll('.spd').forEach(b => b.onclick = () => { App.speed = +b.dataset.speed; App.paused = false; Audio.play('click'); });
    window.addEventListener('blur', () => { if (App.game && !App.game.over && !App.paused) App.openPause(); });
  };
  App.callWave = function () {
    const g = App.game; if (!g || g.over || !g.canStartWave()) return;
    if (g.wave > 0 && g.waveActive) { UI.toast('Wave still deploying'); return; }
    g.startWave(g.wave > 0 && (g.countdown > 0 || g.awaitClear));
  };
  App.togglePause = function () { if (!App.game) return; App.paused = !App.paused; Audio.play('click'); };
  App.openPause = function () { if (!App.game || App.game.over) return; App.paused = true; App.pausedByModal = true; UI.pause(); };
  App.onKey = function (e) {
    Audio.init();
    if (e.target.tagName === 'INPUT') return;
    const g = App.game, k = e.key.toLowerCase();
    if (k === 'f1') { e.preventDefault(); UI.controls(); return; }
    if (k === 'f3') { e.preventDefault(); App.save.settings.fps = !App.save.settings.fps; App.persist(); return; }
    if (!g || App.screen !== 'game') { if (k === 'escape' && UI.modalOpen()) UI.closeModal(); return; }
    if (UI.modalOpen()) { if (k === 'escape') { if (g.over) return; UI.closeModal(); App.paused = false; App.pausedByModal = false; } return; }
    if (k === 'escape') { if (App.mode) App.setMode(null); else if (App.selected) App.select(null); else App.openPause(); UI.hideTip(); return; }
    const order = D.TOWER_ORDER.concat(['barricade']);
    const n = parseInt(k, 10);
    if (n >= 1 && n <= order.length) { App.toggleBuild(order[n - 1]); return; }
    if (k === ' ') { e.preventDefault(); App.callWave(); return; }
    if (k === 'p') { App.togglePause(); return; }
    if (k === 'f') { App.speed = App.speed % 3 + 1; App.paused = false; return; }
    if (k === 'z') return App.power('meteor');
    if (k === 'x') return App.power('stasis');
    if (k === 'c') return App.power('mend');
    if (k === 'tab') { e.preventDefault(); App.cycleTower(e.shiftKey ? -1 : 1); return; }
    const t = App.selected;
    if (!t) return;
    if (t.bridge) { if (k === 'enter') g.collapseBridge(t); return; }
    if (k === 's') { App.action('sell', {}); return; }
    if (!t.def) return;
    if (k === 'u') App.action('upgrade', { branch: 0 });
    if (k === 'i') App.action('upgrade', { branch: 1 });
    if (k === 'q') App.ability();
    if (k === 'o') App.action('overclock', {});
    if (k === 'r') App.action('relocate', {});
    if (k === 't' && !t.def.support) { const m = ['first', 'last', 'strong', 'close']; t.targeting = m[(m.indexOf(t.targeting) + 1) % 4]; UI.panelKey = null; UI.toast('Targeting: ' + t.targeting, true); }
  };
  App.cycleTower = function (dir) {
    const g = App.game; if (!g || !g.towers.length) return;
    const i = g.towers.indexOf(App.selected);
    const t = g.towers[(i + dir + g.towers.length) % g.towers.length];
    App.select(t);
  };

  // ---------------------------------------------------------------- gamepad
  App.pollPad = function (dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected);
    if (!gp) return;
    const P = App.pad;
    const btn = i => gp.buttons[i] && gp.buttons[i].pressed;
    const pressed = i => btn(i) && !P.prev[i];
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) > 0.18 ? v : 0; };
    const any = gp.buttons.some(b => b.pressed) || gp.axes.some(a => Math.abs(a) > 0.3);
    if (any && !P.active) { P.active = true; document.body.classList.add('pad'); $('#cursor').classList.remove('hidden'); P.x = App.mouse.x || innerWidth / 2; P.y = App.mouse.y || innerHeight / 2; }
    if (!P.active) { P.prev = gp.buttons.map(b => b.pressed); return; }
    const sp = 900 * dt;
    P.x = U.clamp(P.x + ax(0) * sp * (1 + Math.abs(ax(0))), 0, innerWidth); P.y = U.clamp(P.y + ax(1) * sp * (1 + Math.abs(ax(1))), 0, innerHeight);
    const cur = $('#cursor'); cur.style.left = P.x + 'px'; cur.style.top = P.y + 'px';
    if (App.game && (ax(2) || ax(3))) App.view.pan(-ax(2) * 700 * dt, -ax(3) * 700 * dt);
    const el = document.elementFromPoint(P.x, P.y);
    const onCanvas = el && el.id === 'view';
    if (ax(0) || ax(1)) {
      App.mouse.x = P.x; App.mouse.y = P.y; App.mouse.inside = onCanvas;
      if (App.game) App.updatePreview();
    }
    if (pressed(0)) { if (onCanvas) App.canvasClick(P.x, P.y, 0); else if (el) { const b = el.closest('[data-act],button,.bcard,.pcard,.map-card,.mut,.r-node,.toggle,.branch,.mslot'); (b || el).click(); } }
    if (pressed(1)) App.onKey({ key: 'Escape', target: document.body, preventDefault() { } });
    if (App.game && App.screen === 'game' && !UI.modalOpen()) {
      const order = D.TOWER_ORDER.concat(['barricade']).filter(id => id === 'barricade' || App.game.towerUnlocked(id));
      if (pressed(4) || pressed(5)) { const cur2 = App.mode && App.mode.kind === 'build' ? order.indexOf(App.mode.id) : -1; const ni = ((cur2 + (pressed(5) ? 1 : -1)) + order.length + (cur2 < 0 && pressed(4) ? 1 : 0)) % order.length; App.select(null); App.setMode({ kind: 'build', id: order[ni] }); }
      if (pressed(2)) App.action('upgrade', { branch: 0 });
      if (pressed(3)) App.ability();
      if (pressed(6)) App.action('overclock', {});
      if (pressed(7)) App.callWave();
      if (pressed(8)) App.speed = App.speed % 3 + 1;
      if (pressed(9)) App.openPause();
      const placing = App.mode && (App.mode.kind === 'build' || App.mode.kind === 'relocate' || App.mode.kind === 'rally');
      if (placing && (pressed(12) || pressed(13) || pressed(14) || pressed(15))) {
        const step = T * App.view.scale * App.view.cam.zoom / App.view.pxScale;
        P.x += pressed(14) ? -step : pressed(15) ? step : 0; P.y += pressed(12) ? -step : pressed(13) ? step : 0;
        App.mouse.x = P.x; App.mouse.y = P.y; App.mouse.inside = true; App.updatePreview();
      } else {
        if (pressed(12) || pressed(13)) App.onKey({ key: 't', target: document.body, preventDefault() { } });
        if (pressed(14)) App.cycleTower(-1);
        if (pressed(15)) App.cycleTower(1);
      }
    } else if (pressed(9) && UI.modalOpen() && App.game) App.action('resume', {});
    P.prev = gp.buttons.map(b => b.pressed);
  };

  // ============================================================ TUTORIAL
  const TUT = [
    { id: 'place', text: 'Welcome, Architect. Pick a tower from the bar below (or press <kbd>1</kbd>) and click a tile beside the path. The preview shows range, covered path and projected DPS. Glowing <b style="color:#8fffb0">Ley Nodes</b> grant +25% damage and range.' },
    { id: 'wave', text: 'The chevrons show the invaders\' route to your Nexus. When ready press <b>Start Wave</b> (<kbd>Space</kbd>). Check <b>Incoming</b> on the left to see what\'s coming.' },
    { id: 'upgrade', text: 'Click a tower to open its panel. Upgrade it (<kbd>U</kbd>) — at Tier 3 you choose one of two specializations that change how it fights.' },
    { id: 'synergy', text: 'Towers of different elements built close together form <b style="color:#fff3b0">Synergies</b> (dashed links). Try a Frost Obelisk beside a Storm Coil for <b>Superconduct</b>, or Fire beside Nature for <b>Wildfire</b>.' },
    { id: 'ability', text: '<b>Abilities win battles.</b> Every Tier 2+ tower has one — a glowing ring floats above it when ready. Select the tower and press <kbd>Q</kbd> (or the ✧ button) when a big group arrives. Try it now!' },
    { id: 'overclock', text: '<b>Overclock</b> (<kbd>O</kbd>) gives a tower +80% speed and +40% damage for 8s. Each use adds Strain, which risks Burnout — save it for bosses and big waves. Overclock a tower now.' },
    { id: 'done', text: 'Perfect waves (no leaks) earn <b style="color:#ff7ae0">Essence</b>. Spend it on <b>Powers</b> (<kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd>) and tower <b>Mods</b>. Enemies avoid heavily defended branches — cover every route. Good luck!', btn: 'Begin' },
  ];
  App.tutStart = function () { App.tut = { i: 0, done: new Set() }; App.tutShow(); };
  App.tutShow = function () { const s = TUT[App.tut.i]; UI.tutorial(Object.assign({ n: App.tut.i + 1, total: TUT.length }, s)); };
  App.tutAdvance = function (manual) {
    if (!App.tut) return;
    App.tut.i++;
    while (App.tut.i < TUT.length - 1 && App.tut.done.has(TUT[App.tut.i].id)) App.tut.i++;
    if (App.tut.i >= TUT.length) { App.tut = null; UI.tutorial(null); App.save.tutorialDone = true; App.persist(); return; }
    App.tutShow();
  };
  App.tutEvent = function (id) { if (!App.tut) return; App.tut.done.add(id); if (TUT[App.tut.i].id === id) App.tutAdvance(); };

  // ============================================================ ATTRACT-MODE DEMO
  App.startDemo = function () {
    App.view.menuMode = true;
    const g = new AS.Game({ mapId: 'verdant', difficulty: 'story', seed: 7 });
    g.gold = 1600;
    App.demo = g; App.demoT = 0;
    App.view.setGame(g, D.SKINS[App.save.skin] || D.SKINS.classic);
    App.view.settings.numbers = false;
    App.view.cam.tz = 1.08;
    const plan = [['prism', 9, 8], ['frost', 7, 5], ['storm', 8, 5], ['mortar', 11, 7], ['conduit', 10, 6], ['prism', 17, 6], ['storm', 16, 9], ['grove', 12, 10], ['mortar', 18, 10], ['prism', 22, 10], ['frost', 23, 9], ['storm', 10, 1]];
    App.demoPlan = plan;
    g.ev.on('sfx', () => { });
  };
  App.stepDemo = function (dt) {
    const g = App.demo; if (!g) return;
    App.demoT += dt;
    if (g.towers.length < App.demoPlan.length && App.demoT > 0.6 + g.towers.length * 0.9) {
      const [id, c, r] = App.demoPlan[g.towers.length];
      if (!g.place(id, c, r)) App.demoPlan.splice(g.towers.length, 1);
    }
    if (App.demoT > 4 && !g.waveActive && g.countdown < 0 && g.canStartWave()) g.startWave();
    if (g.countdown > 0 && g.countdown < 16) g.startWave(true);
    if (g.gold > 300) for (const t of g.towers) if (g.nextLevelInfo(t).length && g.gold > 300) g.upgrade(t, t.uid % 2);
    for (const t of g.towers) if (g.abilityReady(t) && g.enemies.length > 6 && Math.random() < 0.01) { if (t.def.ability.targeted) { const e = g.acquire(t, t.s.range); if (e) g.useAbility(t, e.x, e.y); } else g.useAbility(t); }
    if (g.lives < 10) g.lives = g.maxLives;
    g.update(dt);
    if (g.over || g.wave >= 12) App.startDemo();
    const v = App.view;
    v.cam.tx = 960 + Math.sin(App.demoT * 0.07) * 120; v.cam.ty = 544 + Math.cos(App.demoT * 0.05) * 50;
  };

  // ============================================================ LOOP
  let lastT = performance.now(), acc = 0;
  App.loop = function (now) {
    try { App.frame(now); } catch (err) { if (!App._errLogged || now - App._errLogged > 5000) { App._errLogged = now; console.error('[AetherSpire] frame error', err && err.stack || err); } }
    requestAnimationFrame(App.loop);
  };
  App.frame = function (now) {
    const rawDt = (now - lastT) / 1000;
    const rdt = Math.min(0.05, rawDt); lastT = now;
    App.perf(rawDt);
    const v = App.view;
    App.pollPad(rdt);
    let ts = 1;
    if (v.hitstop > 0) { v.hitstop -= rdt; ts = 0.06; }
    const g = App.game;
    if (g) {
      if (!App.paused && !g.over) {
        acc += rdt * App.speed * ts;
        let n = 0;
        while (acc >= 1 / 60 && n < 12) { g.update(1 / 60); acc -= 1 / 60; n++; }
        if (n >= 12) acc = 0;
        v.stepParticles(rdt * Math.min(2, App.speed) * ts);
      } else if (g.over) v.stepParticles(rdt * 0.5);
      Audio.music.setIntensity(g.over ? 0.1 : App.paused ? 0.05 : g.pressure());
      if (Audio.music.setBoss) Audio.music.setBoss(!!g.boss && !g.over);
      App.hudT = (App.hudT || 0) + rdt;
      if (App.hudT > 0.08) { App.hudT = 0; UI.updateHUD(g); }
      v.update(rdt);
      v.render({ selected: App.selected && App.selected.def ? App.selected : null, preview: App.preview, hoverBridge: App.selected && App.selected.bridge ? App.selected : App.hoverBridge });
    } else if (App.demo) {
      App.stepDemo(rdt * ts);
      v.stepParticles(rdt);
      v.update(rdt);
      v.render(null);
      Audio.music.setIntensity(0.15); if (Audio.music.setBoss) Audio.music.setBoss(false);
    }
  };

  // ---------------------------------------------------------------- performance: FPS readout + automatic quality tier
  App.perf = function (dt) {
    const P = App._perf = App._perf || { acc: 0, n: 0, t: 0, fps: 60, probe: 0, probeN: 0 };
    P.acc += dt; P.n++; P.t += dt;
    if (P.t >= 0.5) { P.fps = P.n / P.acc; P.acc = 0; P.n = 0; P.t = 0; const el = $('#fps'); if (el) { el.textContent = Math.round(P.fps) + ' fps'; el.classList.toggle('hidden', !App.save.settings.fps); } }
    const st = App.save.settings;
    if (App.game && st.autoQ && !App.paused && P.probe < 5) {
      P.probe += dt; P.probeN++;
      if (P.probe >= 5) {
        const avg = P.probe / P.probeN;
        const want = avg > 0.045 ? 'off' : avg > 0.024 ? 'low' : null;
        if (want && st.post !== want && !(st.post === 'off')) { st.post = want; App.applySettings(); UI.toast('Visual quality set to ' + want + ' for a smoother frame rate (change in Settings)', true); }
      }
    }
  };
  // ============================================================ BOOT
  App.boot = function () {
    try { App.bootInner(); } catch (err) {
      console.error('[AetherSpire] boot failed', err);
      const l = document.getElementById('loading'); if (l) { l.classList.remove('gone'); l.style.display = ''; l.innerHTML = '<div style="color:#ff9a9a;letter-spacing:.1em">The Aether failed to weave.</div><div style="font-size:13px;margin-top:10px;font-family:monospace">' + String(err && err.message || err) + '</div><button class="btn" style="margin-top:16px" onclick="location.reload()">Reload</button>'; }
    }
  };
  App.bootInner = function () {
    App.load();
    UI.init(App);
    App.view = new AS.View($('#view'));
    App.view.hudTop = 64; App.view.hudBottom = 118; App.view.hudSide = 168;
    App.applySettings();
    App.bindInput();
    (AS.R.Art ? AS.R.Art.load() : Promise.resolve()).then(() => {
      App.startDemo();
      UI.showScreen('title');
      requestAnimationFrame(() => requestAnimationFrame(() => { $('#loading').classList.add('gone'); setTimeout(() => $('#loading').style.display = 'none', 700); }));
    });
    // first interaction starts audio + menu music
    const startAudio = () => { Audio.init(); Audio.setVolumes(App.save.settings.master, App.save.settings.sfx, App.save.settings.music); Audio.music.setMood(App.game ? App.game.map.biome : 'menu'); Audio.music.start(); window.removeEventListener('pointerdown', startAudio); window.removeEventListener('keydown', startAudio); };
    window.addEventListener('pointerdown', startAudio); window.addEventListener('keydown', startAudio);
    requestAnimationFrame(t => { lastT = t; App.loop(t); });
    // debug/automation hook
    window.AetherSpire = App;
  };
  AS.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.boot); else App.boot();
})(AS);
