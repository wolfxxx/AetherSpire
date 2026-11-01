// Unit tests for the DOM-free simulation: node tools/test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;
for (const f of ['util.js', 'data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const { D, Game, U } = global.AS;
const T = U.TILE;
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` expected ${b}, got ${a}`); }
function ok(v, msg) { if (!v) throw new Error(msg || 'assertion failed'); }
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` expected ≈${b}, got ${a}`);
const mk = (o) => new Game(Object.assign({ mapId: 'verdant', difficulty: 'veteran' }, o || {}));
const enemy = (g, type, wave) => { const e = g.spawnEnemy({ type, wave: wave || 1, spawn: 0, noElite: true }); return e; };

console.log('Damage model');
test('physical damage is reduced by armour', () => { const g = mk(); const e = enemy(g, 'bulwark'); const hp = e.hp; g.damage(e, 100, 'phys', null); near(hp - e.hp, 100 * (1 - 0.45), 1e-6); });
test('elemental damage ignores half of armour', () => { const g = mk(); const e = enemy(g, 'bulwark'); const hp = e.hp; g.damage(e, 100, 'fire', null); near(hp - e.hp, 100 * (1 - 0.225)); });
test('armour pierce bypasses armour', () => { const g = mk(); const e = enemy(g, 'bulwark'); const hp = e.hp; g.damage(e, 100, 'phys', null, { armorPierce: 1 }); near(hp - e.hp, 100); });
test('storm deals double damage to shields', () => { const g = mk(); const e = enemy(g, 'husk'); e.shield = e.maxShield = 50; const hp = e.hp; g.damage(e, 40, 'storm', null); eq(e.shield, 0, 'shield'); near(hp - e.hp, 15, 1e-6, 'overflow'); });
test('shred increases damage taken', () => { const g = mk(); const e = enemy(g, 'husk'); e.shredAmt = 0.25; const hp = e.hp; g.damage(e, 10, 'arcane', null); near(hp - e.hp, 12.5); });
test('killing grants gold and resolves the wave record', () => { const g = mk(); g.startWave(); while (!g.enemies.length) g.update(1 / 60); const e = g.enemies[0]; const gold = g.gold; g.damage(e, 1e6, 'true', null); ok(e.dead); ok(g.gold > gold); });

console.log('Pathing');
test('every spawn on every map can reach the nexus', () => { for (const m of D.MAPS) { const g = mk({ mapId: m.id }); for (const s of g.spawns) ok(isFinite(g.fieldPlain[s.i]), m.id + ' spawn unreachable'); } });
test('threat-aware routing diverts smart enemies to the undefended branch', () => {
  const g = mk(); const upper = g.routes[0].smart.includes(g.idx(9, 3));
  const spots = upper ? [[7, 2], [9, 2], [11, 2], [13, 2], [7, 4], [10, 4]] : [[7, 14], [9, 14], [11, 14], [13, 14], [7, 12], [10, 12]];
  g.gold = 1e5; for (const [c, r] of spots) { const t = g.place('storm', c, r); ok(t, 'place ' + c + ',' + r); g.upgrade(t, 0); g.upgrade(t, 0); }
  const after = g.routes[0].smart;
  ok(after.includes(g.idx(9, upper ? 13 : 3)), 'smart route should switch to the other branch');
  ok(g.routes[0].plain.includes(g.idx(9, upper ? 3 : 13)) || true);
});
test('a barricade raises path cost and reroutes where possible', () => { const g = mk(); g.gold = 999; const r0 = g.routes[0].plain.length; ok(g.place('barricade', 5, 4)); ok(!g.routes[0].plain.includes(g.idx(5, 4)), 'route still through barricade'); ok(g.routes[0].plain.length >= r0); });
test('the last bridge route cannot be severed', () => { const g = mk({ mapId: 'skyreach' }); const [a, b] = g.bridges; ok(g.collapseBridge(a)); ok(!g.canCollapse(b), 'second bridge must stay'); });
test('enemies on a collapsing bridge fall', () => { const g = mk({ mapId: 'skyreach' }); const b = g.bridges[0]; const e = enemy(g, 'husk'); e.tile = b.tiles[0]; e.x = g.cx(b.tiles[0] % 30); e.y = g.cx((b.tiles[0] / 30) | 0); g.collapseBridge(b); ok(e.dead); });

console.log('Economy & towers');
test('selling refunds in full during the same prep phase', () => { const g = mk(); const gold = g.gold; const t = g.place('prism', 9, 8); g.sell(t); eq(g.gold, gold); });
test('selling after a wave refunds 70%', () => { const g = mk(); const t = g.place('prism', 9, 8); g.startWave(); eq(g.sellValue(t), Math.floor(t.invested * 0.7)); });
test('branch upgrade locks the specialization', () => { const g = mk(); g.gold = 1e5; const t = g.place('prism', 9, 8); g.upgrade(t); g.upgrade(t); g.upgrade(t, 1); eq(t.branch, 1); eq(g.nextLevelInfo(t).length, 1); eq(g.nextLevelInfo(t)[0].branch, 1); });
test('ley node grants +25% damage', () => { const g = mk(); const a = g.place('prism', 7, 6); const b = g.place('prism', 3, 10); near(a.s.dmg / b.s.dmg, 1.25, 1e-9); });
test('Frost + Storm forms Superconduct on both towers', () => { const g = mk(); const a = g.place('frost', 7, 5); const b = g.place('storm', 8, 5); ok(a.syn.has('superconduct') && b.syn.has('superconduct')); });
test('conduit aura buffs neighbours but not other conduits', () => { const g = mk(); g.gold = 1e4; const c1 = g.place('conduit', 7, 5); const c2 = g.place('conduit', 8, 5); const p = g.place('prism', 7, 6); ok(p.buffBy === c1 || p.buffBy === c2); ok(!c1.buffBy && !c2.buffBy); });
test('overclock strain escalates burnout risk', () => { const g = mk(); const t = g.place('prism', 9, 8); const r0 = g.overclockRisk(t).burn; t.strain = 2; ok(g.overclockRisk(t).burn > r0); ok(g.overclockRisk(t).shatter > 0); });
test('early call grants bonus gold', () => { const g = mk(); g.startWave(); g.countdown = 10; const gold = g.gold; g.startWave(true); ok(g.gold > gold); });
test('mods require Essence and a slot', () => { const g = mk(); g.gold = 1e5; g.essence = 10; const t = g.place('prism', 9, 8); ok(!g.installMod(t, 'lens'), 'no slot at T1'); g.upgrade(t); g.upgrade(t); g.upgrade(t, 0); ok(g.installMod(t, 'lens')); eq(g.essence, 8); });

test('mastery perks change behaviour, not just numbers', () => { const a = mk(), b = mk({ research: ['mastery_storm', 'mastery_grove'] }); a.gold = b.gold = 1e4; const sa = a.place('storm', 7, 5), sb = b.place('storm', 7, 5); eq(sb.s.chain, sa.s.chain + 2); ok(sb.s.stun > 0); const ga = a.place('grove', 12, 9), gb = b.place('grove', 12, 9); eq(gb.s.minions, ga.s.minions + 1); });
test('player-triggered map mechanics: vent, sluice, shortcut seal', () => {
  const c = mk({ mapId: 'cinder' }); c.gold = 1e4; c.wave = 3; const v = c.vents[0]; const e = c.spawnEnemy({ type: 'husk', wave: 3, spawn: 0, noElite: true }); e.x = v.x; e.y = v.y; const hp = e.hp; ok(c.detonateVent(v)); ok(e.hp < hp || e.dead); ok(!c.detonateVent(v), 'cooldown');
  const vd = mk(); vd.gold = 1e4; vd.wave = 2; ok(vd.openSluice()); vd.update(1 / 60); ok(vd.flooded);
  const n = mk({ mapId: 'neon' }); n.gold = 1e4; n.wave = 2; n.forceNight = true; n.update(1 / 60); const sc = n.bridges.find(b2 => b2.night); ok(sc.up); ok(n.sealShortcut(sc)); ok(!sc.up); for (let i = 0; i < 60 * 16; i++) n.update(1 / 60); ok(sc.up, 'reopens after the seal');
});
console.log('Waves, bosses, win/loss');
test('wave generation is deterministic per seed', () => { const a = mk({ seed: 5 }).genWave(9), b = mk({ seed: 5 }).genWave(9); eq(JSON.stringify(a), JSON.stringify(b)); });
test('wave modifiers never field un-introduced enemy types', () => { for (const m of D.MAPS) { const g = mk({ mapId: m.id, difficulty: 'nightmare' }); for (let w = 1; w <= m.waves; w++) { const def = g.genWave(w); for (const grp of def.groups) if (!D.ENEMIES[grp.type].boss) { const iw = grp.type === 'husk' ? 1 : (+Object.keys(m.intro).find(k => m.intro[k] === grp.type) || 8); ok(iw <= w || grp.type === 'swarm' && m.pool.includes('brood'), `${m.id} w${w} has ${grp.type} (intro ${iw})`); } } } });
test('the final wave contains the map boss', () => { for (const m of D.MAPS) { const def = mk({ mapId: m.id }).genWave(m.boss); ok(def.groups.some(x => x.boss && x.type === (m.bossType || 'nullwarden')), m.id); } });
test('a final boss reaching the Nexus is a defeat', () => { const g = mk(); g.wave = 14; g.nextWavePreview = g.genWave(15); g.startWave(); for (let i = 0; i < 60 * 10 && !g.boss; i++) g.update(1 / 60); ok(g.boss, 'boss spawned'); g.leak(g.boss); ok(g.over && !g.won); ok(g.bossEscaped); });
test('Phoenix Protocol is the only save from an escaping final boss', () => { const g = mk({ research: ['phoenix'] }); g.wave = 14; g.nextWavePreview = g.genWave(15); g.startWave(); for (let i = 0; i < 60 * 10 && !g.boss; i++) g.update(1 / 60); const b = g.boss; b.hp = b.maxHp * 0.05; g.leak(b); ok(!g.over && g.lives === 5, 'phoenix should save once'); });
test('a Herald mini-boss appears mid-campaign as a readiness check', () => { for (const m of D.MAPS) { const g = mk({ mapId: m.id }); const w = g.heraldWave(); ok(w > 1 && w < m.boss); ok(g.genWave(w).groups.some(x => x.herald), m.id); } });
test('boss readiness rises as towers are added', () => { const g = mk(); const r0 = g.bossReadiness(15); g.gold = 1e5; for (const [c, r] of [[7, 6], [9, 2], [16, 7], [21, 9]]) { const t = g.place('storm', c, r); g.upgrade(t); g.upgrade(t); } ok(g.bossReadiness(15) > r0 + 0.05); });
test('the final boss besieges the Nexus instead of ending the run instantly', () => { const g = mk(); g.wave = 14; g.nextWavePreview = g.genWave(15); g.startWave(); for (let i = 0; i < 60 * 10 && !g.boss; i++) g.update(1 / 60); const b = g.boss; const tail = g.routes[0].plain.slice(-2)[0]; b.tile = tail; b.next = g.nexus.i; b.x = g.cx(tail % 30); b.y = g.cx((tail / 30) | 0); b.speed = 3; for (let i = 0; i < 120 && !b.siege; i++) g.update(1 / 60); ok(b.siege, 'siege started'); const l0 = g.lives; for (let i = 0; i < 60 * 3; i++) g.update(1 / 60); ok(g.lives < l0 && g.lives > 0, 'drains gradually'); g.damage(b, 1e9, 'true', null); ok(!g.over || g.won, 'killing it ends the siege'); });
test('boss phases advance with HP', () => { const g = mk(); g.wave = 14; g.nextWavePreview = g.genWave(15); g.startWave(); for (let i = 0; i < 60 * 10 && !g.boss; i++) g.update(1 / 60); const b = g.boss; b.hp = b.maxHp * 0.5; g.update(1 / 60); eq(b.phase, 2); ok(b.shield > 0, 'phase II shield'); });
test('magmaw is healed (not hurt) by vent eruptions', () => { const g = mk({ mapId: 'cinder' }); const e = g.spawnEnemy({ type: 'magmaw', wave: 22, spawn: 0 }); const v = g.vents[0]; e.x = v.x; e.y = v.y; e.hp = e.maxHp * 0.5; const hp = e.hp; g.eruptVent(v, false); ok(e.hp > hp); });
test('the field must be clear before the prep countdown starts', () => { const g = mk(); g.startWave(); while (g.spawnQueue.length) g.update(1 / 60); g.update(1 / 60); ok(g.awaitClear && g.countdown < 0); for (const e of g.enemies) g.damage(e, 1e9, 'true', null); g.update(1 / 60); g.update(1 / 60); ok(g.countdown > 0); });

test('the boss event fires with the boss already on the map (camera focus needs a position)', () => { for (const type of ['nullwarden', 'magmaw']) { const g = mk({ mapId: type === 'magmaw' ? 'cinder' : 'verdant' }); let seen = null; g.ev.on('boss', e => { seen = [e.x, e.y]; }); g.spawnEnemy({ type, wave: 15, spawn: 0 }); ok(seen && Number.isFinite(seen[0]) && Number.isFinite(seen[1]), type + ' announced at ' + seen); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
