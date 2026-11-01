// Aether Spire — DOM user interface
(function (AS) {
  'use strict';
  const U = AS.U, D = AS.D, Draw = AS.Draw;
  const $ = s => document.querySelector(s);
  const UI = {};
  let App;
  const icons = { tower: {}, enemy: {} };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  const GOLD = '<i class="ico-gold"></i>', ESS = '<i class="ico-essence"></i>', SHARD = '<i class="ico-shard"></i>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  UI.towerIcon = function (id, level, branch, size) {
    const skin = D.SKINS[App.save.skin] || D.SKINS.classic;
    const key = id + ':' + (level || 0) + ':' + (branch == null ? -1 : branch) + ':' + App.save.skin + ':' + (size || 96);
    if (!icons.tower[key]) icons.tower[key] = id === 'barricade' ? Draw.barricadeIcon(size || 96) : Draw.towerIcon(id, skin, size || 96, level, branch);
    return icons.tower[key];
  };
  UI.enemyIcon = function (type) { if (!icons.enemy[type]) icons.enemy[type] = Draw.enemyIcon(type, 72); return icons.enemy[type]; };
  UI.clearIcons = function () { icons.tower = {}; };
  const stars = n => [0, 1, 2].map(i => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');

  UI.init = function (app) {
    App = app;
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled && !b.classList.contains('disabled')) { AS.Audio.play('click'); App.action(b.dataset.act, b.dataset, e); }
    });
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-tip],[data-tipfn]');
      if (!t) return;
      if (t.dataset.tipfn) UI.tip(App.tipFor(t.dataset.tipfn, t.dataset), e); else UI.tip(esc(t.dataset.tip), e);
      if (t.closest('.btn,.bcard,.pcard,.branch,.r-node,.map-card')) AS.Audio.play('hover');
    });
    document.addEventListener('mouseout', e => { const t = e.target.closest('[data-tip],[data-tipfn]'); if (t && !t.contains(e.relatedTarget)) UI.hideTip(); });
    document.addEventListener('mousemove', e => { if (!$('#tooltip').classList.contains('hidden')) UI.placeTip(e.clientX, e.clientY); });
    $('#sanctum-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { AS.Audio.play('click'); UI.buildSanctum(b.dataset.tab); } });
  };

  // ------------------------------------------------------------ tooltip / toast / banner
  UI.tip = function (html, e) { const t = $('#tooltip'); t.innerHTML = html; t.classList.remove('hidden'); if (e) UI.placeTip(e.clientX, e.clientY); };
  UI.placeTip = function (x, y) {
    const t = $('#tooltip'); const w = t.offsetWidth, h = t.offsetHeight;
    let px = x + 18, py = y + 18;
    if (px + w > innerWidth - 8) px = x - w - 14; if (py + h > innerHeight - 8) py = y - h - 14;
    t.style.left = Math.max(6, px) + 'px'; t.style.top = Math.max(6, py) + 'px';
  };
  UI.hideTip = function () { $('#tooltip').classList.add('hidden'); };
  let toastT;
  UI.toast = function (msg, good) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (good ? ' good' : '');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
  };
  let bannerT;
  UI.banner = function (main, sub, cls, dur) {
    const bb = $('#bossbar');
    if (bb && !bb.classList.contains('hidden')) { // during a boss fight, announcements live inside the boss bar, never over the lanes
      const ph = $('#boss-phase'); UI.bossNote = { text: main + (sub ? ' — ' + sub : ''), until: performance.now() + 2600 };
      ph.textContent = UI.bossNote.text; ph.classList.add('note'); return;
    }
    const b = $('#banner');
    b.querySelector('.b-main').textContent = main; b.querySelector('.b-sub').textContent = sub || '';
    b.className = 'banner ' + (cls || ''); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), Math.min(dur || 1300, cls === 'boss' ? 2000 : 1400));
  };
  UI.pulse = function (sel, cls) { const el = $(sel); if (!el) return; el.classList.remove(cls || 'pulse'); void el.offsetWidth; el.classList.add(cls || 'pulse'); };
  let threatT;
  UI.threat = function (type) {
    const d = D.ENEMIES[type], c = $('#threat');
    if (d.boss || (App.game && App.game.boss)) return; // never cover a boss fight with a card
    c.classList.remove('hidden'); UI.layoutCards();
    c.innerHTML = `<img src="${UI.enemyIcon(type)}"><div><div class="tc-k">${d.boss ? 'BOSS INCOMING' : 'NEW THREAT'}</div><b>${d.name}</b><p>${d.desc}</p></div>`;
    c.classList.remove('hidden');
    clearTimeout(threatT); threatT = setTimeout(() => c.classList.add('hidden'), 7000);
  };

  // ------------------------------------------------------------ screens
  UI.showScreen = function (name) {
    for (const s of ['title', 'maps', 'sanctum']) $('#screen-' + s).classList.toggle('hidden', s !== name);
    $('#hud').classList.toggle('hidden', name !== 'game');
    UI.hideTip();
    document.querySelectorAll('.shards-val').forEach(e => e.textContent = App.save.shards);
    $('#title-shards').textContent = App.save.shards;
    if (name === 'title') {
      const dk = U.todayKey(); const d = App.save.daily[dk];
      $('#daily-label').textContent = d ? 'Today\'s best: ' + U.fmt(d.best) : App.dailyConfig().map.name + ' · ' + App.dailyConfig().mutators.map(m => D.MUTATORS[m].name).join(' + ');
      const wc = App.weeklyConfig(), wd = App.save.weekly[wc.key];
      $('#weekly-label').textContent = wc.key + ' · ' + wc.map.name + ' · 3 mutators' + (wd ? ' · best ' + U.fmt(wd.best) : ' · +30 Shards');
    }
  };

  UI.buildMaps = function () {
    const cards = $('#map-cards');
    cards.innerHTML = '';
    D.MAPS.forEach((m, i) => {
      const prog = App.save.maps[m.id] || {};
      const unlocked = App.mapUnlocked(i);
      const el = document.createElement('div');
      el.className = 'map-card' + (unlocked ? '' : ' locked') + (App.mapSel.id === m.id ? ' sel' : '');
      el.innerHTML = `<img src="${App.mapThumb(m)}"><div class="mc-stars">${stars(prog.stars || 0)}</div>
        <div class="mc-info"><h3>${m.name}</h3><div class="mc-tag">${m.tagline}</div></div>
        ${unlocked ? '' : `<div class="lock"><b>🔒</b>Complete ${D.MAPS[i - 1].name} to unlock</div>`}`;
      if (unlocked) el.ondblclick = () => App.action('start', {});
      if (unlocked) el.onclick = () => { AS.Audio.play('select'); App.mapSel.id = m.id; App.mapSel.endless = false; UI.buildMaps(); };
      cards.appendChild(el);
    });
    UI.buildMapDetail();
  };
  UI.buildMapDetail = function () {
    const m = D.MAPS.find(x => x.id === App.mapSel.id), prog = App.save.maps[m.id] || {};
    const sel = App.mapSel;
    const mult = D.DIFFICULTIES[sel.diff].score + sel.mutators.reduce((s, k) => s + D.MUTATORS[k].score, 0);
    const pool = [...new Set(m.pool)];
    $('#map-detail').innerHTML = `
      <h3>${m.name}</h3>
      <div class="md-score"><span>${m.waves} waves · ${m.spawns.length} spawn${m.spawns.length > 1 ? 's' : ''}</span><span>Best <b>${U.fmt(prog.best || 0)}</b></span></div>
      <div class="md-mech">${m.mechanic}</div>
      <div class="md-label">Enemies sighted</div>
      <div class="md-row">${pool.map(t => `<img src="${UI.enemyIcon(t)}" width="38" height="38" data-tipfn="enemy" data-type="${t}">`).join('')}<img src="${UI.enemyIcon(m.bossType || 'nullwarden')}" width="38" height="38" data-tipfn="enemy" data-type="${m.bossType || 'nullwarden'}"></div>
      <div class="md-label">Difficulty</div>
      <div class="seg">${Object.entries(D.DIFFICULTIES).map(([k, d]) => `<button data-act="diff" data-v="${k}" class="${sel.diff === k ? 'on' : ''}" data-tip="${d.lives} Nexus integrity · enemy HP ×${d.hp} · score ×${d.score}">${d.name}</button>`).join('')}</div>
      <div class="md-label">Mutators <span style="float:right;color:var(--pink)">Score ×${mult.toFixed(2)}</span></div>
      ${Object.entries(D.MUTATORS).map(([k, mu]) => `<div class="mut ${sel.mutators.includes(k) ? 'on' : ''}" data-act="mut" data-v="${k}"><div><b>${mu.name}</b><span>${mu.desc}</span></div><span class="mx">+${Math.round(mu.score * 100)}%</span></div>`).join('')}
      <div class="md-label">Mode</div>
      <div class="seg"><button data-act="endless" data-v="0" class="${!sel.endless ? 'on' : ''}">Campaign</button><button data-act="endless" data-v="1" class="${sel.endless ? 'on' : ''}" ${prog.completed ? '' : 'disabled'} data-tip="${prog.completed ? 'Survive as long as you can. Bosses every 5 waves.' : 'Complete this map to unlock Endless'}">Endless</button></div>
      <div class="md-row" style="color:var(--muted);font-size:13px">Medals: ${prog.nightmare ? '<span style="color:var(--red)">☠ Nightmare Victor</span>' : '☠ —'} · ${prog.mutated ? '<span style="color:var(--pink)">✧ Mutated Victor</span>' : '✧ —'} · ${prog.flawless ? '<span style="color:var(--gold)">✦ Flawless</span>' : '✦ —'}</div>
      <button class="btn primary big" data-act="start" style="min-width:0;margin-top:auto">Deploy ▶</button>`;
  };

  UI.buildSanctum = function (tab) {
    tab = tab || 'research';
    App.sanctumTab = tab;
    document.querySelectorAll('#sanctum-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.shards-val').forEach(e => e.textContent = App.save.shards);
    const body = $('#sanctum-body');
    const owned = new Set(App.save.research);
    if (tab === 'research') {
      const asc = App.save.ascension || 0, canAsc = D.MAPS.every(m => (App.save.maps[m.id] || {}).completed);
      body.innerHTML = `<div class="asc-box"><div><b>${asc ? 'Ascension ' + (ROMAN[Math.min(4, asc - 1)] || asc) : 'Ascension — not yet attained'}</b><p>${asc ? `Permanent: +${asc * 6}% tower damage, +${asc * 15}% Aether Shards. ` : ''}Ascend to reset all research in exchange for a permanent +6% tower damage and +15% Shard gain per level. Requires every map completed.</p></div><button class="btn ${canAsc && App.save.research.length ? 'primary' : 'disabled'}" data-act="ascend">Ascend ✦</button></div><div class="research-grid">${D.RESEARCH_BRANCHES.map((bn, bi) => `<div class="r-col"><h4>${bn}</h4>${bi === 3 ? `<p style="text-align:center;color:var(--muted);font-size:12px;margin:-10px 0 12px">Equip up to <b style="color:var(--gold)">2</b> masteries per battle (${(App.save.mastery || []).length}/2). Click an owned mastery to swap.</p>` : ''}${D.RESEARCH.filter(r => r.branch === bi).sort((a, b) => a.row - b.row).map(r => {
        const own = owned.has(r.id), avail = !own && r.req.every(q => owned.has(q));
        const isM = r.id.startsWith('mastery_'), eq = isM && (App.save.mastery || []).includes(r.id);
        const tag = !own ? SHARD + r.cost : isM ? (eq ? '◆ Equipped' : 'Owned · equip') : '✓ Owned';
        const act = avail ? `data-act="research" data-id="${r.id}"` : own && isM ? `data-act="equipmastery" data-id="${r.id}"` : '';
        return `<div class="r-node ${own ? 'owned' : avail ? 'avail' : 'locked'} ${eq ? 'equipped' : ''}" ${act}><b>${r.name}</b><span class="cost">${tag}</span><p>${r.desc}</p></div>`;
      }).join('')}</div>`).join('')}</div>
      <p style="text-align:center;color:var(--muted)">Earn Aether Shards by completing maps, earning stars and clearing the Daily Challenge.</p>`;
    } else if (tab === 'armory') {
      body.innerHTML = `<div class="skins-grid">${Object.entries(D.SKINS).map(([k, s]) => {
        const own = App.save.skins.includes(k), on = App.save.skin === k;
        const skin = s;
        const imgs = ['prism', 'storm', 'conduit'].map(id => `<img src="${Draw.towerIcon(id, skin, 96, 2)}">`).join('');
        return `<div class="skin-card ${on ? 'on' : ''}"><div class="sk-icons">${imgs}</div><b>${s.name}</b><p>${s.desc}</p>
          ${on ? '<button class="btn" disabled>Equipped</button>' : own ? `<button class="btn" data-act="skin" data-id="${k}">Equip</button>` : `<button class="btn ${App.save.shards >= s.cost ? '' : 'disabled'}" data-act="buyskin" data-id="${k}">${SHARD} ${s.cost}</button>`}${!own && Object.entries(D.MEDAL_UNLOCKS).find(([m, sk]) => sk === k) ? `<p style="margin-top:6px;color:var(--gold)">or earn it free: ${{ nightmare: '☠ win any map on Nightmare', flawless: '✦ win any map without a leak', mutated: '✧ win with 2+ mutators' }[Object.entries(D.MEDAL_UNLOCKS).find(([m, sk]) => sk === k)[0]]}</p>` : ''}</div>`;
      }).join('')}</div>`;
    } else if (tab === 'codex') {
      const seen = new Set(App.save.seen);
      body.innerHTML = `<div class="codex">
        <h4>Towers</h4><div class="codex-grid">${D.TOWER_ORDER.map(id => { const t = D.TOWERS[id];
          return `<div class="cx"><img src="${UI.towerIcon(id, 2)}"><div><b>${t.name} <span class="el" style="color:${D.ELEMENTS[t.element].color}">${D.ELEMENTS[t.element].name}</span></b><p>${t.blurb}</p>
          <div class="stats">Branch A: <b>${t.branches[0].name}</b><br>Branch B: <b>${t.branches[1].name}</b><br>Ability: <b>${t.ability.name}</b> — ${t.ability.desc}${t.locked ? '<br><span style="color:var(--pink)">Requires research: Void Theory</span>' : ''}</div></div></div>`; }).join('')}</div>
        <h4>Synergies</h4><div class="syn-table">${D.SYNERGIES.map(s => `<div class="syn"><b>${s.name}</b> <span class="el" style="color:${D.ELEMENTS[s.a].color}">${D.ELEMENTS[s.a].name}</span>+<span class="el" style="color:${D.ELEMENTS[s.b].color}">${D.ELEMENTS[s.b].name}</span><br><span>${s.desc}</span></div>`).join('')}</div>
        <h4>Bestiary</h4><div class="codex-grid">${Object.entries(D.ENEMIES).map(([k, e]) => { const known = seen.has(k);
          return `<div class="cx ${known ? '' : 'unknown'}"><img src="${UI.enemyIcon(k)}"><div><b>${known ? e.name : '???'}</b><p>${known ? e.desc : 'Not yet encountered.'}</p>${known ? `<div class="stats">HP ${e.hp} · Speed ${e.speed} · Armour ${Math.round(e.armor * 100)}%${e.flying ? ' · <span class="tag-air">Flying</span>' : ''}</div>` : ''}</div></div>`; }).join('')}</div>
        <h4>Champion Affixes</h4><div class="syn-table">${Object.values(D.AFFIXES).map(a => `<div class="syn"><b style="color:${a.color}">${a.name}</b><br><span>${a.desc}. Champions have 5× HP and drop 2 Essence.</span></div>`).join('')}</div>
      </div>`;
    } else if (tab === 'records') {
      const rows = D.MAPS.map(m => { const r = (App.save.records[m.id] || []); return `<div class="rec-h">${m.name}</div><table class="records"><tr><th>#</th><th>SCORE</th><th>DIFFICULTY</th><th>MUTATORS</th><th>RESULT</th><th>DATE</th></tr>${r.length ? r.map((x, i) => `<tr><td>${i + 1}</td><td><b>${U.fmt(x.score)}</b></td><td>${D.DIFFICULTIES[x.diff].name}${x.endless ? ' · Endless' : ''}</td><td>${x.mutators.map(k => D.MUTATORS[k].name).join(', ') || '—'}</td><td>${x.won ? stars(x.stars) : 'Wave ' + x.wave}</td><td>${x.date}</td></tr>`).join('') : '<tr><td colspan=6 style="color:var(--muted)">No runs yet</td></tr>'}</table>`; }).join('');
      const daily = Object.entries(App.save.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
      const rivals = (App.save.rivals || []).slice().sort((a, b) => b.score - a.score);
      const board = `<div class="rec-h">Rival Board <small style="color:var(--muted);font-family:var(--f-ui);font-size:13px">— your best runs vs imported score codes</small></div>
        <div class="import-row"><input id="code-in" placeholder="Paste a rival's score code, e.g. AS1-…"><button class="btn" data-act="importcode">Import</button></div>
        <table class="records"><tr><th>#</th><th>ARCHITECT</th><th>MAP</th><th>SCORE</th><th>DIFFICULTY</th><th>RESULT</th></tr>${App.rivalBoard().map((x, i) => `<tr class="${x.rival ? 'rival' : ''}"><td>${i + 1}</td><td>${esc(x.name)}</td><td>${x.map}</td><td><b>${U.fmt(x.score)}</b></td><td>${D.DIFFICULTIES[x.diff] ? D.DIFFICULTIES[x.diff].name : x.diff}</td><td>${x.won ? stars(x.stars) : 'Wave ' + x.wave}</td></tr>`).join('') || '<tr><td colspan=6 style="color:var(--muted)">No runs yet</td></tr>'}</table>`;
      void rivals;
      body.innerHTML = `${board}${rows}<div class="rec-h">Daily Challenges</div><table class="records"><tr><th>DATE</th><th>BEST SCORE</th><th>CLEARED</th></tr>${daily.length ? daily.map(([k, d]) => `<tr><td>${k}</td><td><b>${U.fmt(d.best)}</b></td><td>${d.won ? '✓' : '—'}</td></tr>`).join('') : '<tr><td colspan=3 style="color:var(--muted)">No daily runs yet</td></tr>'}</table>`;
    }
  };

  // ------------------------------------------------------------ HUD
  UI.buildHUD = function (game) {
    const bc = $('#build-cards');
    bc.innerHTML = '';
    const ids = D.TOWER_ORDER.concat(['barricade']);
    for (const id of ids) {
      const isB = id === 'barricade';
      const def = isB ? D.BARRICADE : D.TOWERS[id];
      const el = document.createElement('div');
      el.className = 'bcard'; el.dataset.id = id;
      const ec = isB ? '#c9b08a' : D.ELEMENTS[def.element].color;
      el.style.setProperty('--el', ec); el.style.setProperty('--elg', U.rgba(ec, 0.4));
      el.innerHTML = `<img src="${UI.towerIcon(id, 0)}"><kbd>${def.hotkey}</kbd>${isB ? '' : `<span class="bc-el">${D.ELEMENTS[def.element].icon}</span>`}<span class="bc-name">${isB ? 'Barricade' : def.name.split(' ')[1] || def.name}</span><span class="bc-cost">${GOLD}${game.towerCost(id)}</span>`;
      el.dataset.tipfn = 'build';
      el.onclick = () => { AS.Audio.play('click'); App.toggleBuild(id); };
      bc.appendChild(el);
    }
    const pc = $('#power-cards');
    pc.innerHTML = '';
    for (const p of Object.values(D.POWERS)) {
      const el = document.createElement('div');
      el.className = 'pcard'; el.dataset.id = p.id; el.dataset.tipfn = 'power';
      el.innerHTML = `<kbd>${p.hotkey}</kbd><span class="pi">${p.icon}</span><span class="pn">${p.name}</span><span class="pc">${ESS}${p.cost}</span><div class="pcd"></div>`;
      el.onclick = () => { AS.Audio.play('click'); App.power(p.id); };
      pc.appendChild(el);
    }
    $('#h-wavemax').textContent = game.endless ? '/ ∞' : '/ ' + game.totalWaves;
    UI.lastWaveKey = null; UI.panelKey = null;
    UI.updateHUD(game, true);
  };
  const lastVals = {};
  function setText(id, v, pulseCls) {
    if (lastVals[id] === v) return;
    const old = lastVals[id];
    lastVals[id] = v; const el = document.getElementById(id); if (el) el.textContent = v;
    if (pulseCls && old != null && el) UI.pulse('#' + id, null);
  }
  UI.updateHUD = function (game, force) {
    if (force) for (const k in lastVals) delete lastVals[k];
    const lv = Math.max(0, Math.ceil(game.lives));
    if (lastVals['h-lives'] != null && lv < lastVals['h-lives']) { const el = $('.res.lives'); el.classList.remove('hurt'); void el.offsetWidth; el.classList.add('hurt'); }
    setText('h-lives', lv);
    $('#h-lifebar').style.width = (100 * game.lives / game.maxLives) + '%';
    const gold = Math.floor(game.gold);
    if (lastVals['h-gold'] != null && gold > lastVals['h-gold'] + 20) { const el = $('.res.gold'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
    setText('h-gold', gold);
    if (lastVals['h-ess'] != null && game.essence > lastVals['h-ess']) { const el = $('.res.essence'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
    setText('h-ess', game.essence);
    setText('h-wave', game.wave);
    setText('h-score', U.fmt(Math.round(game.score * game.scoreMultiplier())));
    // wave button
    const btn = $('#btn-wave'), txt = $('#wave-btn-text');
    let label, cls = 'btn wave-btn';
    if (UI.readyWarn && game.canStartWave() && !game.waveActive) cls += ' warn';
    if (!game.canStartWave()) { label = game.over ? 'Battle Over' : 'Final Wave'; cls += ' done'; }
    else if (game.wave === 0) { label = 'Start Wave'; cls += ' ready'; }
    else if (game.countdown > 0) { label = `Call Early +${game.earlyBonus()}g`; cls += ' early'; }
    else if (game.awaitClear) { label = `Rush +${game.earlyBonus()}g`; cls += ' early'; }
    else label = 'Deploying…';
    if (UI.readyWarn && cls.includes('warn')) label = '⚠ ' + label + ' · ' + UI.readyWarn;
    if (txt.textContent !== label) txt.textContent = label;
    if (btn.className !== cls) btn.className = cls;
    $('#wave-cd').style.width = game.countdown > 0 ? (100 * game.countdown / 15) + '%' : '0%';
    // speed
    document.querySelectorAll('.spd').forEach(b => b.classList.toggle('on', +b.dataset.speed === App.speed && !App.paused));
    $('#btn-pause').classList.toggle('on', App.paused);
    // wave mods
    const modsKey = (game.currentWaveDef && game.waveActive ? game.currentWaveDef.mods : []).join();
    if (lastVals.mods !== modsKey) { lastVals.mods = modsKey; $('#h-mods').innerHTML = modsKey ? modsKey.split(',').map(k => `<span class="chip" style="color:${D.WAVE_MODS[k].color}" data-tip="${D.WAVE_MODS[k].desc}">${D.WAVE_MODS[k].name}</span>`).join('') : ''; }
    // build cards
    document.querySelectorAll('.bcard').forEach(el => {
      const id = el.dataset.id;
      const locked = id !== 'barricade' && !game.towerUnlocked(id);
      el.classList.toggle('locked', locked);
      el.classList.toggle('poor', !locked && game.gold < game.towerCost(id));
      el.classList.toggle('sel', App.mode && App.mode.kind === 'build' && App.mode.id === id);
    });
    document.querySelectorAll('.pcard').forEach(el => {
      const id = el.dataset.id, p = D.POWERS[id], cd = game.powerCd[id];
      el.classList.toggle('poor', game.essence < p.cost);
      el.classList.toggle('sel', App.mode && App.mode.kind === 'power' && App.mode.id === id);
      el.querySelector('.pcd').style.transform = `scaleY(${cd > 0 ? cd / (p.cd * (game.has('recall') ? 0.85 : 1)) : 0})`;
    });
    $('#bb-meta').innerHTML = `<span>Relocations <b>${game.relocations}</b></span><span>Barricades <b>${game.barricades.length}/${game.barricadeMax}</b></span><span>Kills <b>${game.kills}</b></span>`;
    // boss bar
    const boss = game.boss;
    $('#bossbar').classList.toggle('hidden', !boss || boss.dead);
    document.body.classList.toggle('bossfight', !!(boss && !boss.dead));
    if (boss && !boss.dead && App.view) { let under = false; const bb = $('#bossbar').getBoundingClientRect(); for (const e of game.enemies) { const [sx, sy] = App.view.worldToScreen(e.x, e.y); if (sx > bb.left - 20 && sx < bb.right + 20 && sy < bb.bottom + 20) { under = true; break; } } $('#bossbar').classList.toggle('faded', under); }
    if (boss && !boss.dead) {
      $('#boss-fill').style.width = (100 * boss.hp / boss.maxHp) + '%';
      $('#boss-shield').style.width = (100 * boss.shield / boss.maxHp) + '%';
      setText('boss-name', (boss.herald ? 'HERALD · ' : '') + boss.def.name.toUpperCase());
      const PH = boss.type === 'magmaw' ? ['Molten Carapace · vents heal it', 'Cracked · burning trail', 'CATACLYSM · vents scorch towers'] : ['Null Pulse' + (game.map.id === 'verdant' ? ' · drains ley nodes' : ''), 'Shielded · Summoning', 'ENRAGED · Rift-stepping'];
      if (UI.bossNote && performance.now() < UI.bossNote.until) { } else { if (UI.bossNote) { UI.bossNote = null; $('#boss-phase').classList.remove('note'); delete lastVals['boss-phase']; } setText('boss-phase', 'Phase ' + ROMAN[(boss.phase || 1) - 1] + ' · ' + PH[(boss.phase || 1) - 1]); }
    }
    // wave preview
    const wkey = game.wave + ':' + (game.nextWavePreview ? game.nextWavePreview.wave : 'none') + ':' + game.isNight + ':' + game.towers.length + ':' + game.towers.reduce((s, t) => s + t.level, 0);
    if (wkey !== UI.lastWaveKey) { UI.lastWaveKey = wkey; UI.renderWavePanel(game); }
    if (App.selected) UI.refreshPanel(game);
  };
  UI.renderWavePanel = function (game) {
    const w = game.nextWavePreview;
    $('#wp-title').textContent = w ? 'Wave ' + w.wave : '';
    if (!w) { $('#wp-body').innerHTML = `<div class="wp-foot">${game.endless ? '' : 'All waves deployed. Hold the line!'}</div>`; $('#wp-foot').innerHTML = ''; return; }
    const agg = {};
    for (const g of w.groups) {
      const k = g.type + (g.champion ? ':c:' + g.champion : '') + (g.boss ? ':b' : '');
      if (!agg[k]) agg[k] = { type: g.type, n: 0, champ: g.champion, boss: g.boss, spawns: new Set() };
      agg[k].n += g.count; agg[k].spawns.add(g.spawn);
    }
    const multi = game.spawns.length > 1;
    $('#wp-body').innerHTML = Object.values(agg).map(a => {
      const d = D.ENEMIES[a.type];
      const lanes = multi && !d.flying ? 'Gate ' + [...a.spawns].map(s => 'ABC'[s]).join('/') : '';
      const herald = w.groups.some(x => x.herald && x.type === a.type);
      return `<div class="wp-row ${a.boss ? 'boss' : a.champ ? 'champ' : ''}" data-tipfn="enemy" data-type="${a.type}"><img src="${UI.enemyIcon(a.type)}"><div class="wn">${d.boss ? (herald ? 'HERALD' : 'BOSS') : d.name}<small>${a.boss ? d.name.split(',')[0] : a.champ ? 'Champion · ' + D.AFFIXES[a.champ].name : (d.flying ? '<span class="tag-air">Flying</span>' : '') + lanes}</small></div><b>×${a.n}</b></div>`;
    }).join('');
    let ready = ''; UI.readyWarn = null;
    const heraldNext = w.groups.some(x => x.herald);
    if (!game.endless && (w.boss || heraldNext || (game.map.boss - w.wave <= 5 && w.wave < game.map.boss))) {
      const target = heraldNext ? w.wave : game.map.boss, r = game.bossReadiness(target, heraldNext);
      if (r < 1.1 && (w.boss || heraldNext)) UI.readyWarn = (heraldNext ? 'Herald' : 'Boss') + ' ' + Math.round(r * 100) + '%';
      const pct = Math.min(200, Math.round(r * 100)), col = r >= 1.1 ? 'var(--green)' : r >= 0.8 ? 'var(--gold)' : 'var(--red)';
      ready = `<div class="readiness" data-tip="Estimated damage your current towers would deal to the ${heraldNext ? 'Herald' : 'boss'} along its route, compared with its effective HP (armour, shields). Aim for well over 100% — Null Pulses and phases cost uptime."><span>${heraldNext ? 'Herald' : 'Boss'} ready</span><b style="color:${col}">${pct >= 200 ? '200%+' : pct + '%'}</b><div class="rbar"><div style="width:${Math.min(100, pct / 1.5)}%;background:${col}"></div><i style="left:${100 / 1.5}%"></i></div></div>`;
    }
    $('#wp-foot').innerHTML = ready + (w.mods.length ? w.mods.map(k => `<span class="chip" style="color:${D.WAVE_MODS[k].color}" data-tip="${D.WAVE_MODS[k].desc}">${D.WAVE_MODS[k].name}</span><br>`).join('') : '') + (w.boss ? '<b style="color:#c9a8ff">⚠ Boss wave</b><br>' : '') + `HP ×${game.hpMul(w.wave).toFixed(1)}` + (game.map.dayNight ? ` · ${game.isNight ? '🌙 Night' : '☀ Day'}` : '');
  };

  // ------------------------------------------------------------ tower / selection panel
  UI.layoutCards = function () {
    const panel = $('#towerpanel'), tut = $('#tutorial'), thr = $('#threat');
    const right = !panel.classList.contains('hidden') && panel.classList.contains('left');
    for (const el of [tut, thr]) { el.classList.toggle('right', right); el.classList.remove('tut'); }
    const tutH = tut.classList.contains('hidden') ? 0 : tut.offsetHeight + 10;
    thr.style.bottom = `calc(var(--hud-bottom) + ${12 + tutH}px)`;
  };
  UI.hidePanel = function () { if (App.view) App.view.panelSide = null; $('#towerpanel').classList.add('hidden'); $('#wavepanel').classList.remove('away'); UI.panelKey = null; };
  UI.refreshPanel = function (game) {
    const sel = App.selected;
    if (!sel || sel.dead) { App.select(null); return; }
    let key;
    if (sel.bridge) key = 'b' + sel.id + sel.up + (sel.cd > 0) + game.canCollapse(sel) + (game.gold >= game.rebuildCost());
    else if (sel.shortcut) key = 'sc' + sel.id + (sel.sealT > 0) + (sel.sealCd > 0) + (game.gold >= game.actionCost('seal')) + game.isNight;
    else if (sel.vent) key = 'v' + sel.c + (sel.cd > 0) + (game.gold >= game.actionCost('vent'));
    else if (sel.sluice) key = 'sl' + ((game.sluiceCd || 0) > 0) + (game.gold >= game.actionCost('sluice'));
    else if (sel.barricade) key = 'bar' + sel.uid;
    else if (sel.enemy) key = 'e' + sel.e.uid;
    else {
      const nx = game.nextLevelInfo(sel);
      key = [sel.uid, sel.level, sel.branch, sel.mods.join(), sel.targeting, nx.map(o => game.gold >= o.cost).join(), game.essence, game.abilityReady(sel), sel.overclockT > 0, sel.overclockCd > 0, sel.burnoutT > 0, sel.disabledT > 0, sel.strain, game.relocations, App.modPicker, [...sel.syn].join(), sel.onLey, sel.buffBy ? sel.buffBy.uid : 0, game.waveActive, App.mode && App.mode.kind].join('|');
    }
    const panel = $('#towerpanel');
    if (key !== UI.panelKey) { UI.panelKey = key; panel.innerHTML = UI.panelHTML(game, sel); panel.classList.remove('hidden'); }
    // keep the panel on the opposite side of the screen from what it describes, so it never hides it
    const wx = sel.enemy ? sel.e.x : sel.x;
    const sx = App.view.worldToScreen(wx, 0)[0];
    const sy = App.view.worldToScreen(0, sel.enemy ? sel.e.y : sel.y)[1];
    const pt = (x, y) => App.view.worldToScreen(x, y);
    const keyPts = [[sx, sy, 10], [...pt(game.nexus.x, game.nexus.y), 3]].concat(game.spawns.map(s2 => [...pt(game.cx(s2.c), game.cx(s2.r)), 2]), game.bridges.filter(b => !b.night).map(b => [...pt(b.x, b.y), 2]), game.vents.map(v => [...pt(v.x, v.y), 1]));
    const H = innerHeight, dockTop = H - 118 - 236;
    const rects = { left: [0, 0, 360, H], right: [innerWidth - 360, 0, innerWidth, H], dock: [innerWidth / 2 - 330, dockTop, innerWidth / 2 + 330, H] };
    const cost = k => keyPts.reduce((s2, [px, py, w]) => s2 + (px >= rects[k][0] - 20 && px <= rects[k][2] + 20 && py >= rects[k][1] - 20 && py <= rects[k][3] ? w : 0), 0);
    let side = ['right', 'left', 'dock'].reduce((b, k) => cost(k) < cost(b) ? k : b, sx > innerWidth * 0.55 ? 'left' : 'right');
    const left = side === 'left';
    panel.classList.toggle('dock', side === 'dock');
    panel.classList.toggle('compact', side === 'dock' || cost(side) >= 3);
    panel.classList.toggle('min', !!App.panelMin); // shrink to the essentials when space is contested
    App.view.panelSide = left ? 'left' : 'right';
    if (panel.classList.contains('left') !== left) panel.classList.toggle('left', left);
    $('#wavepanel').classList.toggle('away', left);
    UI.layoutCards();
    // live values
    if (!sel.bridge && !sel.barricade && !sel.enemy) {
      const k = panel.querySelector('#tp-kills'); if (k) k.textContent = sel.kills;
      const dd = panel.querySelector('#tp-dmg'); if (dd) dd.textContent = U.fmt(sel.dmgDealt);
      const ab = panel.querySelector('.ability-btn .cd'); if (ab) ab.style.width = (sel.abilityCd > 0 ? 100 * sel.abilityCd / game.abilityCd(sel) : 0) + '%';
      const abt = panel.querySelector('#ab-cd'); if (abt) abt.textContent = sel.level < 1 ? 'Tier 2' : sel.abilityCd > 0 ? Math.ceil(sel.abilityCd) + 's' : 'READY';
      const oc = panel.querySelector('#oc-state'); if (oc) oc.textContent = sel.overclockT > 0 ? 'Active ' + Math.ceil(sel.overclockT) + 's' : sel.burnoutT > 0 ? 'Burnout ' + Math.ceil(sel.burnoutT) + 's' : sel.overclockCd > 0 ? 'Cooling ' + Math.ceil(sel.overclockCd) + 's' : 'Ready';
    } else if (sel.barricade) {
      const h = panel.querySelector('#bar-hp'); if (h) h.textContent = Math.ceil(sel.hp) + ' / ' + Math.ceil(sel.maxHp);
    } else if (sel.bridge) {
      const s = panel.querySelector('#br-state'); if (s) s.textContent = sel.up ? (sel.cd > 0 ? 'Reinforcing ' + Math.ceil(sel.cd) + 's' : 'Ready to drop') : 'Rebuilding ' + Math.ceil(sel.timer) + 's';
    } else if (sel.enemy) {
      const e = sel.e; if (e.dead) { App.select(null); return; }
      const h = panel.querySelector('#en-hp'); if (h) h.textContent = U.fmt(e.hp) + ' / ' + U.fmt(e.maxHp) + (e.shield > 0 ? ' (+' + U.fmt(e.shield) + ' shield)' : '');
    }
  };
  function statsFor(game, t, s) {
    const out = [];
    const id = t.def.id;
    const P = (label, v) => out.push([label, v]);
    if (t.def.support) { P('Dmg enabled', U.fmt(t.enabled || 0)); P('Gold made', U.fmt(t.goldMade || 0)); P('Dmg aura', '+' + Math.round(s.auraDmg * 100) + '%'); P('Rate aura', '+' + Math.round(s.auraRate * 100) + '%'); P('Range', s.range.toFixed(1)); P('Income', s.income + 'g/wave'); if (s.auraRange) P('Range aura', '+' + Math.round(s.auraRange * 100) + '%'); if (s.killGold) P('Kill gold', '+' + s.killGold); if (s.essenceChance) P('Essence', Math.round(s.essenceChance * 100) + '%/wave'); if (s.auraCdr) P('Ability CDR', Math.round(s.auraCdr * 100) + '%'); return out; }
    P('DPS ≈', Math.round(game.estimateDps(t, s)));
    if (s.dmg) P('Damage', Math.round(s.dmg)); if (s.dps) P(id === 'void' ? 'Well DPS' : 'Beam DPS', Math.round(s.dps)); if (s.beam) P('Peak DPS', Math.round(s.dps * s.rampMax));
    if (s.rate) P(id === 'frost' ? 'Pulses/s' : id === 'void' ? 'Wells/s' : 'Attacks/s', s.rate.toFixed(2));
    P('Range', s.range.toFixed(1));
    if (s.splash) P('Splash', s.splash.toFixed(1)); if (s.burn) P('Burn', Math.round(s.burn) + '/s');
    if (s.chain) P('Chain', s.chain); if (s.slow) P('Slow', Math.round(s.slow * 100) + '%');
    if (s.multishot) P('Shots', s.multishot); if (s.crit) P('Crit', Math.round(s.crit * 100) + '% ×' + s.critMult);
    if (s.minions) P('Thornlings', s.minions); if (s.treantHp) P('Treant HP', s.treantHp); if (s.minionHp && !s.treantHp) P('Minion HP', s.minionHp);
    if (s.freezeEvery) P('Freeze', 'every ' + s.freezeEvery); if (s.shred) P('Shred', '+' + Math.round(s.shred * 100) + '% dmg');
    if (s.rampMax) P('Ramp', '×' + s.rampMax); if (s.bomblets) P('Bomblets', s.bomblets); if (s.pool) P('Magma', Math.round(s.pool) + '/s');
    if (s.vines) P('Vines', Math.round(s.vines) + '/s'); if (s.execute) P('Execute', '<' + Math.round(s.execute * 100) + '%'); if (s.auraSlow) P('Time slow', Math.round(s.auraSlow * 100) + '%');
    if (s.pierceLine) P('Pierce', 'All'); if (s.armorPierce) P('Armour pen', '100%');
    return out;
  }
  UI.panelHTML = function (game, sel) {
    const ACT = (title, desc, act, label, kind, ready, extra) => `<button class="tp-close" data-act="deselect">×</button><div class="tp-head"><div><h3>${title}</h3><div class="tier">${extra || ''}</div></div></div>
        <p style="color:var(--muted);font-size:13px">${desc}</p><button class="btn ${ready && game.gold >= game.actionCost(kind) ? 'primary' : 'disabled'}" style="width:100%" data-act="${act}">${label} <span class="sell">${GOLD}${game.actionCost(kind)}</span></button>`;
    if (sel.shortcut) return ACT('Night Shortcut', 'An energy bridge that opens at nightfall. Seal it for 15s to force the horde down the long, defended lane.', 'seal', 'Seal shortcut', 'seal', !(sel.sealCd > 0), sel.sealT > 0 ? 'Sealed' : sel.sealCd > 0 ? 'Recharging' : game.isNight ? 'Open — enemies are using it' : 'Closed until nightfall');
    if (sel.vent) return ACT('Magma Vent', 'Detonate the vent now: scorches nearby ground enemies and Forges adjacent towers (+30% attack speed). Magmaw is healed by eruptions!', 'detonate', 'Detonate now', 'vent', !(sel.cd > 0), sel.cd > 0 ? 'Building pressure…' : 'Ready');
    if (sel.sluice) return ACT('River Sluice', 'Open the sluice to flood the ford for 10s: enemies wading through are slowed and Frost flash-freezes them.', 'sluice', 'Open sluice', 'sluice', game.wave > 0 && !((game.sluiceCd || 0) > 0), game.wave === 0 ? 'Available from wave 1' : game.floodForceT > 0 ? 'Flooding' : (game.sluiceCd || 0) > 0 ? 'Refilling' : 'Ready');
    if (sel.bridge) {
      const ok = game.canCollapse(sel);
      return `<button class="tp-close" data-act="deselect">×</button><div class="tp-head"><div><h3>Ancient Bridge</h3><div class="tier" id="br-state"></div></div></div>
        <p style="color:var(--muted);font-size:13px">Drop the bridge to send every ground enemy on it into the abyss. Others reroute. It rebuilds after 12s and needs 30s to reinforce.</p>
        <button class="btn ${ok ? 'primary' : 'disabled'}" style="width:100%" data-act="collapse">Collapse Bridge <kbd>Enter</kbd></button>
        ${!sel.up ? `<button class="btn ${game.gold >= game.rebuildCost() ? '' : 'disabled'}" style="width:100%;margin-top:6px" data-act="rebuild">Rebuild now <span class="sell">${GOLD}${game.rebuildCost()}</span></button>` : ''}
        ${!ok && sel.up && sel.cd <= 0 ? '<p style="color:var(--red);font-size:12px">The other bridge is down — you cannot sever the last route.</p>' : ''}`;
    }
    if (sel.barricade) {
      return `<button class="tp-close" data-act="deselect">×</button><div class="tp-head"><img src="${UI.towerIcon('barricade')}"><div><h3>Barricade</h3><div class="tier">HP <span id="bar-hp"></span></div></div></div>
        <p style="color:var(--muted);font-size:13px">${D.BARRICADE.blurb}</p><button class="btn" style="width:100%" data-act="sell">Sell <span class="sell">${GOLD}${game.sellValue(sel)}</span> <kbd>S</kbd></button>`;
    }
    if (sel.enemy) {
      const e = sel.e, d = e.def;
      const traits = [];
      if (e.flying) traits.push('<span class="chip" style="color:#c77dff">Flying</span>');
      if (e.armor > 0) traits.push(`<span class="chip" style="color:#8fa3c7">Armour ${Math.round(e.armor * 100)}%</span>`);
      if (e.elite) traits.push('<span class="chip" style="color:var(--gold)">Elite</span>');
      if (e.champion) traits.push(`<span class="chip" style="color:${D.AFFIXES[e.champion].color}">Champion · ${D.AFFIXES[e.champion].name}</span>`);
      if (e.slowT > 0) traits.push('<span class="chip" style="color:#7fe3ff">Slowed</span>');
      if (e.burnT > 0) traits.push('<span class="chip" style="color:#ff6a2b">Burning</span>');
      return `<button class="tp-close" data-act="deselect">×</button><div class="tp-head"><img src="${UI.enemyIcon(e.type)}"><div><h3>${d.name}</h3><div class="tier" id="en-hp"></div></div></div>
        <p style="color:var(--muted);font-size:13px">${d.desc}</p><div class="tp-chips">${traits.join('')}</div>
        <div class="tp-stats"><div class="st"><small>Speed</small><b>${e.speed.toFixed(2)}</b></div><div class="st"><small>Bounty</small><b>${Math.round(e.gold)}g</b></div><div class="st"><small>Leak dmg</small><b>${e.boss ? 15 : e.dmg}</b></div></div>`;
    }
    const t = sel, def = t.def, s = t.s;
    const el = D.ELEMENTS[def.element];
    const nx = game.nextLevelInfo(t);
    const stats = statsFor(game, t, s);
    let upg = '';
    if (!nx.length) upg = `<div class="st" style="text-align:center"><b style="color:var(--gold)">★ MAXIMUM POWER ★</b></div>`;
    else if (nx.length > 1) {
      upg = `<label>Choose a specialization</label><div class="branches">${nx.map((o, i) => `<div class="branch ${game.gold >= o.cost ? '' : 'poor'}" data-act="upgrade" data-branch="${i}" data-tipfn="upgrade" data-branchi="${i}">
        <img src="${UI.towerIcon(def.id, 3, i, 80)}"><b>${o.name}</b><span>${o.blurb}</span><span class="u-cost">${GOLD}${o.cost} <kbd>${i ? 'I' : 'U'}</kbd></span></div>`).join('')}</div>`;
    } else {
      const o = nx[0];
      const fake = Object.assign({}, t, { level: o.level, branch: o.branch >= 0 ? o.branch : t.branch, syn: t.syn, mods: t.mods });
      game.computeStats(fake, t.buffBy);
      const after = statsFor(game, fake, fake.s);
      const diffs = after.filter(([k, v]) => { const b = stats.find(x => x[0] === k); return !b || String(b[1]) !== String(v); }).slice(0, 4)
        .map(([k, v]) => { const b = stats.find(x => x[0] === k); return `${k} ${b ? b[1] : '—'} → <em>${v}</em>`; }).join(' · ');
      upg = `<button class="btn upg ${game.gold >= o.cost ? '' : 'poor'}" data-act="upgrade" data-branch="0"><div class="u-top"><span>Upgrade → ${o.level >= 3 ? def.branches[t.branch].name + ' II' : 'Tier ' + (o.level + 1)} <kbd>U</kbd></span><span class="u-cost">${GOLD}${o.cost}</span></div><div class="u-diff">${diffs}</div></button>`;
    }
    const syn = [...t.syn].map(id => D.SYNERGIES.find(x => x.id === id)).map(x => `<span class="chip" style="color:#fff3b0" data-tip="${esc(x.desc)}">⚯ ${x.name}</span>`);
    if (t.onLey) syn.push('<span class="chip" style="color:#9fffcf" data-tip="+25% damage, +20% range">✦ Ley Node</span>');
    if (t.buffBy) syn.push(`<span class="chip" style="color:#ff7ae0" data-tip="Empowered by a nearby Aether Conduit">◈ Conduit +${Math.round(t.buffBy.s.auraDmg * 100)}%</span>`);
    const slots = game.modSlots(t);
    let mods = '';
    if (slots > 0 || game.has('modforge') || t.level >= 2) {
      const cells = [];
      for (let k = 0; k < 2; k++) {
        const m = t.mods[k];
        if (m) cells.push(`<div class="mslot full" data-tip="${esc(D.MODS[m].desc)}">${D.MODS[m].icon} ${D.MODS[m].name}</div>`);
        else if (k < slots) cells.push(`<div class="mslot" data-act="modpick">+ Install Mod</div>`);
        else cells.push(`<div class="mslot locked" data-tip="${k === 0 ? 'Unlocks at Tier 4 (or Tier 3 with Mod Forge research)' : 'Unlocks at Tier 5'}">🔒 Slot ${k + 1}</div>`);
      }
      mods = `<div class="tp-sec"><label>Mods <span style="float:right;color:var(--pink)">${ESS} ${game.essence}</span></label><div class="mods">${cells.join('')}</div>
        ${App.modPicker && t.mods.length < slots ? `<div class="mod-pick">${Object.values(D.MODS).filter(m => !t.mods.includes(m.id)).map(m => `<button data-act="mod" data-id="${m.id}" ${game.essence < m.cost ? 'style="opacity:.45"' : ''}><em>${ESS}${m.cost}</em><b>${m.icon} ${m.name}</b><span>${m.desc}</span></button>`).join('')}</div>` : ''}</div>`;
    }
    const risk = game.overclockRisk(t);
    const ab = def.ability;
    const ready = game.abilityReady(t);
    return `<button class="tp-close" data-act="deselect">×</button><button class="tp-min" data-act="panelmin" data-tip="Collapse panel">▾</button>
      <div class="tp-head"><img src="${UI.towerIcon(def.id, t.level, t.branch, 80)}"><div><h3>${def.name}</h3><div class="tier">${game.tierName(t)} · <span class="el" style="color:${el.color}">${el.icon} ${el.name}</span> ${def.role}</div></div></div>
      <div class="tp-stats">${stats.slice(0, 9).map(([k, v]) => `<div class="st"><small>${k}</small><b>${v}</b></div>`).join('')}<div class="st"><small>Kills</small><b id="tp-kills">${t.kills}</b></div><div class="st"><small>Dealt</small><b id="tp-dmg">${U.fmt(t.dmgDealt)}</b></div></div>
      ${syn.length ? `<div class="tp-chips">${syn.join('')}</div>` : ''}
      ${def.support ? '' : `<div class="tp-sec"><label>Targeting <kbd>T</kbd></label><div class="seg small">${['first', 'last', 'strong', 'close'].map(m => `<button data-act="target" data-v="${m}" class="${t.targeting === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>`}
      <div class="tp-sec">${upg}</div>
      <div class="tp-sec"><button class="btn ability-btn ${ready ? 'ready' : ''} ${t.level < 1 ? 'disabled' : ''}" data-act="ability" data-tip="${esc(ab.desc)}"><span>✧ ${ab.name} <kbd>Q</kbd></span><b id="ab-cd"></b><div class="cd"></div></button></div>
      ${def.support ? '' : `<div class="tp-sec"><button class="btn ${t.overclockT > 0 || t.overclockCd > 0 || t.burnoutT > 0 ? 'disabled' : ''}" style="width:100%;flex-direction:column;gap:0" data-act="overclock" data-tip="+80% attack speed and +40% damage for 8s. Each use adds Strain (decays 1/wave). Strain raises Burnout risk; at 3 Strain the tower may Shatter."><span>⚡ Overclock <kbd>O</kbd> · <span id="oc-state"></span></span><span class="oc-risk">Burnout ${Math.round(risk.burn * 100)}%${risk.shatter ? ' · Shatter ' + Math.round(risk.shatter * 100) + '%' : ''} · Strain ${t.strain}</span></button></div>`}
      ${mods}
      <div class="tp-sec row${def.id === 'grove' ? 3 : 2}">
        ${def.id === 'grove' ? '<button class="btn" data-act="rally" data-tip="Choose where Thornlings stand guard">⚑ Rally<small>click path</small></button>' : ''}
        <button class="btn ${game.relocations > 0 ? '' : 'disabled'}" data-act="relocate" data-tip="Move this tower to another tile. Limited per battle.">⇄ Move <kbd>R</kbd><small>${game.relocations} left</small></button>
        <button class="btn" data-act="sell">Sell <kbd>S</kbd><small class="sell">${GOLD}${game.sellValue(t)}${game.sellValue(t) === t.invested ? ' (full)' : ''}</small></button>
      </div>`;
  };

  // ------------------------------------------------------------ tips
  UI.buildTip = function (game, id) {
    if (id === 'barricade') return `<b>Barricade</b> ${GOLD}${D.BARRICADE.cost}<br><span class="tt-dim">${D.BARRICADE.blurb}</span><br>${game.barricades.length}/${game.barricadeMax} placed`;
    const d = D.TOWERS[id], s = d.levels[0];
    const el = D.ELEMENTS[d.element];
    const lock = !game.towerUnlocked(id) ? '<br><b style="color:var(--pink)">Locked — research Void Theory in the Sanctum</b>' : '';
    const syn = D.SYNERGIES.filter(x => x.a === d.element || x.b === d.element).map(x => x.name + ' (' + D.ELEMENTS[x.a === d.element ? x.b : x.a].name + ')').join(', ');
    return `<b>${d.name}</b> <span class="el" style="color:${el.color}">${el.name}</span> <span class="tt-dim">${d.role}</span><br>${d.blurb}
      <div class="tt-stats"><span>Cost</span><span>${game.towerCost(id)}g</span><span>Range</span><span>${s.range}</span><span>Hits air</span><span>${d.air ? 'Yes' : 'No'}</span><span>Branches</span><span>${d.branches.map(b => b.name).join(' / ')}</span><span>Ability</span><span>${d.ability.name}</span><span>Synergies</span><span>${syn}</span></div>${lock}`;
  };
  UI.enemyTip = function (type) {
    const d = D.ENEMIES[type];
    return `<b>${d.name}</b>${d.flying ? ' <span class="tag-air">Flying</span>' : ''}<br><span class="tt-dim">${d.desc}</span><div class="tt-stats"><span>Base HP</span><span>${d.hp}</span><span>Speed</span><span>${d.speed}</span><span>Armour</span><span>${Math.round(d.armor * 100)}%</span><span>Bounty</span><span>${d.gold}g</span></div>`;
  };

  // ------------------------------------------------------------ modals
  UI.modal = function (html, cls) { $('#modal-card').className = 'modal-card panel ' + (cls || ''); $('#modal-card').innerHTML = html; $('#modal').classList.remove('hidden'); };
  UI.closeModal = function () { $('#modal').classList.add('hidden'); };
  UI.modalOpen = () => !$('#modal').classList.contains('hidden');
  UI.settings = function () {
    const st = App.save.settings;
    const tg = (k, label, tip) => `<div class="set-row"><span>${label}${tip ? `<br><small style="color:var(--muted)">${tip}</small>` : ''}</span><div class="toggle ${st[k] ? 'on' : ''}" data-act="settoggle" data-k="${k}"></div></div>`;
    const sl = (k, label) => `<div class="set-row"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(st[k] * 100)}" data-k="${k}" class="vol"></div>`;
    UI.modal(`<h2>Settings</h2>${sl('master', 'Master volume')}${sl('music', 'Music')}${sl('sfx', 'Effects')}
      <div class="set-row"><span>Post-processing<br><small style="color:var(--muted)">Bloom, depth of field, chromatic aberration, grain</small></span><div class="seg">${['high', 'low', 'off'].map(q => `<button data-act="setpost" data-v="${q}" class="${st.post === q ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      ${tg('shake', 'Screen shake')}${tg('numbers', 'Damage numbers')}${tg('flashes', 'Flashes & aberration', 'Turn off to reduce flashing effects')}${tg('labels', 'Combat labels', 'Synergy procs and specialization pop-ups')}${tg('autoQ', 'Automatic quality', 'Lower post-processing if the frame rate drops')}${tg('fps', 'Show FPS (F3)')}${tg('tutorial', 'Show tutorial hints')}
      <div class="mbtns"><button class="btn danger" data-act="resetsave">Reset progress</button><button class="btn" data-act="controls">Controls</button><button class="btn primary" data-act="closemodal">Done</button></div>`);
    document.querySelectorAll('.vol').forEach(r => r.oninput = () => { st[r.dataset.k] = r.value / 100; App.applySettings(); });
  };
  UI.controls = function () {
    const rows = [['1 – 8', 'Select tower / barricade', 'LB / RB', 'Cycle build'], ['Left click', 'Build · select', 'A', 'Click at cursor'], ['Right click / Esc', 'Cancel · deselect', 'B', 'Cancel'],
      ['Space', 'Start / call wave early', 'RT', 'Start / call wave'], ['U / I', 'Upgrade / branch B', 'X', 'Upgrade'], ['Q', 'Tower ability', 'Y', 'Tower ability'], ['O', 'Overclock', 'LT', 'Overclock'],
      ['T', 'Cycle targeting', 'D-pad ↑↓', 'Cycle targeting'], ['S', 'Sell', 'View', 'Speed'], ['R', 'Relocate', 'R-stick', 'Pan camera'], ['Z X C', 'Powers', 'L-stick', 'Move cursor'], ['P / F', 'Pause / speed', 'Menu', 'Pause'],
      ['Wheel', 'Zoom', '', ''], ['Right-drag', 'Pan', '', ''], ['Shift + click', 'Keep building', '', ''], ['Tab', 'Cycle towers', '', '']];
    UI.modal(`<h2>Controls</h2><div class="controls-grid">${rows.map(r => `<kbd>${r[0]}</kbd><span>${r[1]}</span><span class="pg">${r[2]}</span><span>${r[3]}</span>`).join('')}</div><div class="mbtns"><button class="btn primary" data-act="closemodal">Got it</button></div>`);
  };
  UI.pause = function () {
    UI.modal(`<h2>Paused</h2><p style="text-align:center;color:var(--muted)">${App.game.map.name} · Wave ${App.game.wave}${App.game.endless ? '' : ' / ' + App.game.totalWaves} · ${App.game.diff.name}</p>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Tip: ${D.TIPS[Math.floor(Math.random() * D.TIPS.length)]}</p>
      <div class="mbtns" style="flex-direction:column;align-items:center"><button class="btn primary big" data-act="resume">Resume</button><button class="btn big" data-act="restart">Restart Map</button><button class="btn big" data-act="settings">Settings</button><button class="btn big" data-act="controls">Controls</button><button class="btn big danger" data-act="quit">Abandon & Return</button></div>`);
  };
  UI.results = function (game, r) {
    const win = game.won;
    UI.modal(`<div class="result"><h2 class="${win ? 'win' : 'lose'}">${win ? 'VICTORY' : game.endless ? 'THE LINE BREAKS' : game.bossEscaped ? 'THE NEXUS IS BREACHED' : 'NEXUS FALLEN'}</h2>
      ${!win && game.bossEscaped ? `<p style="text-align:center;color:var(--red);margin-top:-6px">${game.bossEscaped} reached the Nexus. The final boss must be destroyed to win.</p>` : ''}
      ${win ? `<div class="res-stars">${[0, 1, 2].map(i => `<span class="star ${i < game.stars ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join('')}</div>` : ''}
      <p style="text-align:center;color:var(--muted);margin-top:0">${game.map.name} · ${game.diff.name}${game.mut.size ? ' · ' + [...game.mut].map(k => D.MUTATORS[k].name).join(', ') : ''}${game.daily ? ' · Daily Challenge' : ''}${game.endless ? ' · Endless' : ''}</p>
      <div class="res-grid"><span>Waves cleared</span><b>${win ? game.totalWaves : Math.max(0, game.wave - 1)}</b><span>Nexus integrity</span><b>${Math.max(0, game.lives)} / ${game.maxLives}</b>
        <span>Enemies destroyed</span><b>${game.kills}</b><span>Leaks</span><b>${game.leaks}</b><span>Perfect waves</span><b>${game.perfectWaves}</b><span>Gold earned</span><b>${U.fmt(game.goldEarned)}</b>
        <span>Battle time</span><b>${U.fmtTime(game.time)}</b><span>Score multiplier</span><b>×${game.scoreMultiplier().toFixed(2)}</b></div>
      <div class="res-score">Final score<b>${U.fmt(game.finalScore)}</b></div>
      ${r.record ? '<div class="res-new">NEW PERSONAL BEST</div>' : ''}
      ${r.medals.length ? `<div class="res-new" style="color:var(--pink)">${r.medals.join(' · ')}</div>` : ''}
      <div style="text-align:center;margin-top:10px;font-size:13px;color:var(--muted)">Share your score — rivals can import this code in Sanctum › Records<br><span class="share-code" id="share-code">${r.code}</span> <button class="btn" style="padding:4px 10px;font-size:12px" data-act="copycode">Copy</button></div>
      <div class="res-shards">${SHARD} +${r.shards} Aether Shards${r.newStars ? ` <small style="color:var(--muted)">(includes ${r.newStars} new star${r.newStars > 1 ? 's' : ''})</small>` : ''}</div>
      ${r.unlocked ? `<div class="res-new" style="color:var(--cyan)">New map unlocked: ${r.unlocked}</div>` : ''}
      <div class="mbtns"><button class="btn" data-act="quit">Menu</button><button class="btn" data-act="sanctumFromResult">Sanctum</button><button class="btn" data-act="restart">Retry</button>${r.next ? `<button class="btn primary" data-act="nextmap">Next: ${r.next.name} ▶</button>` : ''}</div></div>`, 'result');
  };

  // ------------------------------------------------------------ tutorial
  UI.copyCode = function () { const c = $('#share-code'); if (!c) return; try { navigator.clipboard.writeText(c.textContent); UI.toast('Score code copied', true); } catch (e) { UI.toast('Select the code and copy it manually'); } };
  UI.tutorial = function (step) {
    const el = $('#tutorial');
    if (!step) { el.classList.add('hidden'); UI.layoutCards(); return; }
    el.innerHTML = `<div class="tt-body"><div class="tt-k">ARCHITECT'S GUIDE · ${step.n}/${step.total}</div><p>${step.text}</p></div><div style="display:flex;flex-direction:column;gap:6px"><button class="btn" data-act="tutnext">${step.btn || 'Got it'}</button><button class="btn ghost" data-act="tutskip">Skip</button></div>`;
    el.classList.remove('hidden');
    UI.layoutCards();
  };

  AS.UI = UI;
})(AS);
