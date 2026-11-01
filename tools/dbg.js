const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;
for (const f of ['util.js', 'data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const { D, Game, U } = global.AS;
const g = new Game({ mapId: process.argv[2] || 'neon', difficulty: 'veteran' });
console.log('routes', g.routes.map(r => [r.smart.length, r.plain.length]));
g.ev.on('leak', (e) => console.log('leak t=' + g.time.toFixed(1), e.type, 'age', e.age.toFixed(1), 'flying', e.flying));
g.startWave();
for (let i = 0; i < 60 * 40; i++) { g.update(1 / 60); if (i % 300 === 0) console.log(g.time.toFixed(1), g.enemies.slice(0,3).map(e => e.type + '@' + (e.x/64).toFixed(1) + ',' + (e.y/64).toFixed(1) + ' next ' + e.next)); }
