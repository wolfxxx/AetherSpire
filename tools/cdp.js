// Minimal headless-Chrome driver for automated play-testing & screenshots.
// usage: node tools/cdp.js <script.json|-> ; script = [{eval:"js"}, {wait:ms}, {shot:"file.png"}, {click:[x,y]}, {key:"Space"}]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 500);
const URL = process.env.URL || 'http://localhost:8765/index.html';
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const MOBILE = !!process.env.MOBILE, DSF = +(process.env.DSF || (MOBILE ? 3 : 1));

async function main() {
  const steps = JSON.parse(fs.readFileSync(process.argv[2] === '-' ? 0 : process.argv[2], 'utf8'));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'as-chrome-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); const list = await r.json(); const pg = list.find(x => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch (e) { }
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = {};
  const logs = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
    if (d.method === 'Runtime.consoleAPICalled') logs.push('[' + d.params.type + '] ' + d.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text));
  };
  const send = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: MOBILE, screenOrientation: MOBILE ? { type: W > H ? 'landscapePrimary' : 'portraitPrimary', angle: W > H ? 90 : 0 } : undefined });
  if (MOBILE) { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }); await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }); }
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 1500));
  for (const s of steps) {
    if (s.wait) await new Promise(r => setTimeout(r, s.wait));
    if (s.eval) {
      const r = await send('Runtime.evaluate', { expression: s.eval, returnByValue: true, awaitPromise: true });
      const v = r.result && r.result.result ? r.result.result.value : undefined;
      if (r.result && r.result.exceptionDetails) console.log('EVAL ERROR:', r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : JSON.stringify(r.result.exceptionDetails));
      else if (s.saveTo && typeof v === 'string' && v.startsWith('data:')) { fs.writeFileSync(s.saveTo, Buffer.from(v.split(',')[1], 'base64')); console.log('saved', s.saveTo); }
      else if (v !== undefined && s.print !== false) console.log('=>', typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (s.click) {
      const [x, y] = s.click;
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: s.button || 'left', clickCount: 1 });
    }
    if (s.tap) { const [x, y] = s.tap; await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await new Promise(r => setTimeout(r, s.hold || 40)); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    if (s.swipe) { const [x0, y0, x1, y1] = s.swipe; await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); for (let k = 1; k <= 8; k++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 8, y: y0 + (y1 - y0) * k / 8 }] }); await new Promise(r => setTimeout(r, 16)); } await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    if (s.pinch) { const [cx, cy, d0, d1] = s.pinch; const pts = d => [{ x: cx - d / 2, y: cy, id: 0 }, { x: cx + d / 2, y: cy, id: 1 }]; await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) }); for (let k = 1; k <= 8; k++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * k / 8) }); await new Promise(r => setTimeout(r, 16)); } await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    if (s.move) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.move[0], y: s.move[1] });
    if (s.key) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: s.key, code: s.code || s.key, text: s.text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: s.key, code: s.code || s.key }); }
    if (s.shot) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(s.shot, Buffer.from(r.result.data, 'base64'));
      console.log('shot', s.shot);
    }
  }
  console.log('--- console ---\n' + logs.slice(0, 60).join('\n'));
  ws.close(); ch.kill();
  setTimeout(() => process.exit(0), 300);
}
main().catch(e => { console.error(e); process.exit(1); });
