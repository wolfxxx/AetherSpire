// Aether Spire — procedural audio: layered synth SFX + adaptive generative music
(function (AS) {
  'use strict';
  const U = AS.U;
  const A = { ready: false, vol: { master: 0.8, sfx: 0.8, music: 0.55 }, intensity: 0, targetIntensity: 0 };
  let ctx, master, sfxBus, musicBus, comp, verb, verbSend, delay, delaySend, noiseBuf;
  const last = {}; let voices = 0;

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = A.vol.master;
    sfxBus = ctx.createGain(); sfxBus.gain.value = A.vol.sfx;
    musicBus = ctx.createGain(); musicBus.gain.value = A.vol.music;
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    shaper.curve = curve; shaper.oversample = '2x';
    const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.08;
    sfxBus.connect(shaper); shaper.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
    // reverb
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir;
    verbSend = ctx.createGain(); verbSend.gain.value = 0.32; verbSend.connect(verb); verb.connect(comp);
    // delay
    delay = ctx.createDelay(1); delay.delayTime.value = 0.3125;
    const fb = ctx.createGain(); fb.gain.value = 0.35; const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2800;
    delay.connect(dlp); dlp.connect(fb); fb.connect(delay);
    delaySend = ctx.createGain(); delaySend.gain.value = 0.25; delaySend.connect(delay); dlp.connect(musicBus);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    A.ready = true;
    A.loadSamples();
    A.music.setup();
  };
  // duck music + routine SFX under big moments (boss arrival, roars)
  // ------------------------------------------------------------ recorded samples (js/audio_assets.js) layered over the synths
  A.samples = {};
  A.loadSamples = function () {
    if (/^https?:$/.test(location.protocol) && AS.SOUND_FILES) { // cacheable files over http
      for (const k of AS.SOUND_FILES) fetch('assets/sfx/' + k + '.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { A.samples[k] = b; }).catch(() => { });
      return;
    }
    if (!AS.SOUNDS) { const s = document.createElement('script'); s.src = 'js/audio_assets.js'; s.onload = () => A.loadSamples(); document.head.appendChild(s); return; }
    const S = AS.SOUNDS || {};
    for (const k in S) {
      try {
        const bin = atob(S[k].split(',')[1]); const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        ctx.decodeAudioData(buf.buffer).then(b => { A.samples[k] = b; }).catch(() => { });
      } catch (e) { /* keep synth fallback */ }
    }
  };
  function sample(name, pan, vol, rate, wet) {
    const takes = [name, name + '2', name + '3'].filter(n => A.samples[n]);
    if (!takes.length) return false;
    const b = A.samples[takes[Math.floor(Math.random() * takes.length)]]; // rotate recorded takes so repeats never sound identical
    const src = ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = (rate || 1) * (0.95 + Math.random() * 0.1); // small pitch jitter keeps repeats fresh
    const g = out(pan, wet); g.gain.value = vol == null ? 0.7 : vol;
    src.connect(g); src.start();
    return true;
  }
  // which sample voices each game sound (name -> [sample, volume, rate, keepSynthLayer])
  const SAMPLE_MAP = {
    prism: ['prism', 0.35, 1], volley: ['prism', 0.3, 1.15], rail: ['rail', 0.6, 1, true], mortar: ['mortar', 0.5, 1], boom: ['boom', 0.55, 1, true], pop: ['boom', 0.22, 1.5],
    frost: ['frost', 0.3, 1], freeze: ['frost', 0.5, 0.85, true], zap: ['zap', 0.35, 1], thunder: ['thunder', 0.8, 1, true], ability_thunder: ['thunder', 0.8, 0.9],
    lash: ['lash', 0.35, 1], well: ['well', 0.45, 1], ability_collapse: ['well', 0.8, 0.7, true], build: ['build', 0.6, 1], upgrade: ['upgrade', 0.5, 1],
    upgradeBig: ['upgrade', 0.65, 0.85, true], sell: ['sell', 0.5, 1], eliteDeath: ['eliteDeath', 0.55, 1], bossRoar: ['bossRoar', 0.9, 1, true], bossDeath: ['bossDeath', 0.9, 1, true],
    leak: ['leak', 0.6, 1], hit: ['hit', 0.22, 1], waveStart: ['waveStart', 0.6, 1], bossHorn: ['waveStart', 0.8, 0.8, true], click: ['click', 0.35, 1], meteor: ['meteor', 0.8, 1, true],
    eruption: ['boom', 0.6, 0.7, true], crumble: ['boom', 0.35, 0.8], mod: ['upgrade', 0.4, 1.2], phoenix: ['upgrade', 0.7, 0.7, true], shatter: ['frost', 0.6, 1.3, true],
  };
  const DEATH_RATE = { swarm: 1.45, skitter: 1.3, husk: 1, bulwark: 0.75, brood: 0.7, shrike: 1.2, aegis: 1.1, blinker: 1.25, mender: 1.15, phantom: 0.9 };
  A.duck = function (dur) { if (!A.ready) return; const t = ctx.currentTime; A.duckUntil = t + dur; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(A.vol.music * 0.35, t, 0.05); musicBus.gain.setTargetAtTime(A.vol.music, t + dur, 0.6); };
  A.setVolumes = function (m, s, mu) {
    A.vol = { master: m, sfx: s, music: mu };
    if (!A.ready) return;
    master.gain.setTargetAtTime(m, ctx.currentTime, 0.05); sfxBus.gain.setTargetAtTime(s, ctx.currentTime, 0.05); musicBus.gain.setTargetAtTime(mu, ctx.currentTime, 0.05);
  };

  // ------------------------------------------------------------ synth primitives
  function out(pan, wet) {
    const g = ctx.createGain();
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = U.clamp(pan, -1, 1); g.connect(p); node = p; }
    node.connect(sfxBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(verbSend); }
    return g;
  }
  function env(g, t, a, peak, d, sustainEnd) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.slide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g, t, o.a || 0.005, o.vol || 0.3, o.dur);
    let n = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.setValueAtTime(o.ff0 || 2000, t); if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + o.dur); f.Q.value = o.q || 1; osc.connect(f); n = f; }
    n.connect(g); g.connect(o.dest || out(o.pan, o.wet));
    osc.start(t); osc.stop(t + (o.a || 0.005) + o.dur + 0.05);
  }
  function noise(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur); f.Q.value = o.q || 0.8;
    const g = ctx.createGain(); env(g, t, o.a || 0.003, o.vol || 0.3, o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || out(o.pan, o.wet));
    src.start(t, Math.random() * 1.5); src.stop(t + (o.a || 0.003) + o.dur + 0.05);
  }
  function chord(freqs, o) { for (const f of freqs) tone(Object.assign({}, o, { f0: f, f1: o.f1 ? f * o.f1 : null })); }

  const SFX = {
    click: p => tone({ type: 'triangle', f0: 900, f1: 1300, dur: 0.05, vol: 0.12, pan: p }),
    hover: p => tone({ type: 'sine', f0: 1400, dur: 0.03, vol: 0.04 }),
    error: p => { tone({ type: 'square', f0: 180, f1: 140, dur: 0.16, vol: 0.08, filter: 'lowpass', ff0: 900 }); tone({ type: 'square', f0: 190, f1: 150, dur: 0.16, vol: 0.06, delay: 0.09, filter: 'lowpass', ff0: 900 }); },
    select: p => { tone({ type: 'sine', f0: 660, dur: 0.08, vol: 0.1, pan: p }); tone({ type: 'sine', f0: 990, dur: 0.1, vol: 0.08, delay: 0.04, pan: p }); },
    prism: p => { tone({ type: 'triangle', f0: 2400, f1: 900, dur: 0.09, vol: 0.07, pan: p }); noise({ filter: 'highpass', f0: 5000, dur: 0.03, vol: 0.04, pan: p }); },
    volley: p => { for (let k = 0; k < 3; k++) tone({ type: 'triangle', f0: 2600 - k * 300, f1: 900, dur: 0.07, vol: 0.05, delay: k * 0.025, pan: p }); },
    rail: p => { noise({ filter: 'highpass', f0: 6000, dur: 0.025, vol: 0.18, pan: p }); tone({ type: 'sawtooth', f0: 3200, f1: 120, dur: 0.35, vol: 0.12, filter: 'lowpass', ff0: 6000, ff1: 400, pan: p, wet: 0.4 }); noise({ filter: 'bandpass', f0: 3000, f1: 300, dur: 0.3, vol: 0.12, pan: p }); tone({ type: 'sine', f0: 90, f1: 40, dur: 0.3, vol: 0.25 }); },
    mortar: p => { noise({ filter: 'bandpass', f0: 1800, q: 1.5, dur: 0.03, vol: 0.1, pan: p }); tone({ type: 'sine', f0: 140, f1: 55, dur: 0.18, vol: 0.28, pan: p }); noise({ f0: 600, f1: 150, dur: 0.12, vol: 0.12, pan: p }); },
    boom: p => { noise({ filter: 'highpass', f0: 3000, dur: 0.04, vol: 0.12, pan: p }); noise({ f0: 1400, f1: 90, dur: 0.5, vol: 0.32, pan: p, wet: 0.3 }); tone({ type: 'sine', f0: 110, f1: 32, dur: 0.45, vol: 0.4, pan: p }); tone({ type: 'triangle', f0: 55, f1: 30, dur: 0.6, vol: 0.18, a: 0.01 }); noise({ filter: 'bandpass', f0: 400, f1: 120, q: 0.7, dur: 0.9, vol: 0.08, delay: 0.08, wet: 0.6, pan: p }); },
    pop: p => { noise({ f0: 2200, f1: 200, dur: 0.12, vol: 0.12, pan: p }); tone({ type: 'sine', f0: 180, f1: 60, dur: 0.1, vol: 0.12, pan: p }); },
    frost: p => { chord([1568, 2349, 3136], { type: 'sine', dur: 0.35, vol: 0.035, a: 0.005, pan: p, wet: 0.5 }); noise({ filter: 'highpass', f0: 6000, dur: 0.2, vol: 0.03, pan: p }); },
    freeze: p => { chord([1046, 1568, 2093, 3136], { type: 'triangle', dur: 0.7, vol: 0.05, pan: p, wet: 0.6 }); noise({ filter: 'highpass', f0: 4000, f1: 9000, dur: 0.4, vol: 0.08, pan: p }); },
    zap: p => { for (let k = 0; k < 4; k++) noise({ filter: 'bandpass', f0: 2500 + Math.random() * 3000, q: 4, dur: 0.03, vol: 0.12, delay: k * 0.025, pan: p }); tone({ type: 'sawtooth', f0: 520, f1: 140, dur: 0.12, vol: 0.04, pan: p }); },
    thunder: p => { noise({ filter: 'highpass', f0: 4000, dur: 0.03, vol: 0.3, pan: p }); noise({ f0: 300, f1: 60, dur: 2.4, vol: 0.12, a: 0.3, delay: 0.2, wet: 0.9, pan: p }); noise({ f0: 4000, f1: 80, dur: 1.1, vol: 0.4, pan: p, wet: 0.6 }); tone({ type: 'sine', f0: 70, f1: 30, dur: 0.9, vol: 0.4 }); for (let k = 0; k < 6; k++) noise({ filter: 'bandpass', f0: 3000 + Math.random() * 3000, q: 3, dur: 0.03, vol: 0.2, delay: k * 0.03 }); },
    lash: p => { noise({ filter: 'bandpass', f0: 1800, f1: 400, q: 2, dur: 0.12, vol: 0.07, pan: p }); tone({ type: 'triangle', f0: 260, f1: 140, dur: 0.08, vol: 0.06, pan: p }); },
    roots: p => { noise({ f0: 500, f1: 120, dur: 0.5, vol: 0.18, pan: p }); for (let k = 0; k < 4; k++) tone({ type: 'triangle', f0: 180 + k * 40, f1: 90, dur: 0.15, vol: 0.06, delay: k * 0.06, pan: p }); },
    slam: p => { tone({ type: 'sine', f0: 90, f1: 35, dur: 0.3, vol: 0.32, pan: p }); noise({ f0: 900, f1: 100, dur: 0.25, vol: 0.18, pan: p }); },
    minionDie: p => { tone({ type: 'triangle', f0: 600, f1: 200, dur: 0.18, vol: 0.06, pan: p }); noise({ filter: 'bandpass', f0: 1500, dur: 0.12, vol: 0.05, pan: p }); },
    well: p => { tone({ type: 'sine', f0: 220, f1: 40, dur: 0.9, vol: 0.18, pan: p, wet: 0.5 }); tone({ type: 'sawtooth', f0: 110, f1: 30, dur: 0.8, vol: 0.05, filter: 'lowpass', ff0: 600, pan: p }); },
    build: p => { tone({ type: 'sine', f0: 140, f1: 60, dur: 0.2, vol: 0.3, pan: p }); noise({ f0: 1200, f1: 200, dur: 0.18, vol: 0.12, pan: p }); chord([523, 659, 784], { type: 'triangle', dur: 0.25, vol: 0.05, delay: 0.06, pan: p, wet: 0.3 }); },
    upgrade: p => { [523, 659, 784, 1046].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.2, vol: 0.08, delay: k * 0.06, pan: p, wet: 0.4 })); },
    upgradeBig: p => { [392, 523, 659, 784, 1046, 1318].forEach((f, k) => tone({ type: 'sawtooth', f0: f, dur: 0.35, vol: 0.05, delay: k * 0.05, filter: 'lowpass', ff0: 3000, pan: p, wet: 0.5 })); tone({ type: 'sine', f0: 65, f1: 130, dur: 0.6, vol: 0.25 }); noise({ filter: 'highpass', f0: 3000, f1: 9000, dur: 0.6, vol: 0.05, a: 0.2 }); },
    sell: p => { [1318, 1046, 1568].forEach((f, k) => tone({ type: 'square', f0: f, dur: 0.08, vol: 0.04, delay: k * 0.05, filter: 'lowpass', ff0: 4000, pan: p })); },
    relocate: p => { tone({ type: 'sine', f0: 400, f1: 1600, dur: 0.25, vol: 0.1, pan: p, wet: 0.4 }); },
    crumble: p => { noise({ f0: 1500, f1: 100, dur: 0.6, vol: 0.28, pan: p }); for (let k = 0; k < 5; k++) tone({ type: 'triangle', f0: 200 + Math.random() * 200, f1: 60, dur: 0.1, vol: 0.08, delay: k * 0.07, pan: p }); },
    rebuild: p => { [330, 440, 554].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.15, vol: 0.06, delay: k * 0.07, pan: p })); },
    blink: p => { tone({ type: 'sine', f0: 1800, f1: 300, dur: 0.15, vol: 0.06, pan: p }); tone({ type: 'sine', f0: 300, f1: 1800, dur: 0.15, vol: 0.05, delay: 0.08, pan: p }); },
    death: p => { noise({ filter: 'bandpass', f0: 900 + Math.random() * 900, f1: 200, q: 1.5, dur: 0.14, vol: 0.09, pan: p }); tone({ type: 'triangle', f0: 320 + Math.random() * 120, f1: 90, dur: 0.12, vol: 0.06, pan: p }); },
    flood: () => { noise({ f0: 300, f1: 1200, dur: 2.2, vol: 0.14, a: 0.8, wet: 0.7 }); for (let k = 0; k < 6; k++) tone({ type: 'sine', f0: 600 + Math.random() * 900, f1: 300, dur: 0.12, vol: 0.03, delay: 0.3 + k * 0.2, wet: 0.6 }); },
    eliteDeath: p => { noise({ f0: 2000, f1: 120, dur: 0.4, vol: 0.2, pan: p }); chord([784, 1175, 1568], { type: 'triangle', dur: 0.4, vol: 0.05, pan: p, wet: 0.5 }); },
    essence: p => { [1318, 1760, 2637].forEach((f, k) => tone({ type: 'sine', f0: f, dur: 0.25, vol: 0.06, delay: k * 0.05, pan: p, wet: 0.6 })); },
    bossRoar: () => { A.duck(1.6); for (const f of [55, 58, 82]) tone({ type: 'sawtooth', f0: f * 2, f1: f, dur: 1.4, vol: 0.12, a: 0.08, filter: 'lowpass', ff0: 1200, ff1: 200, wet: 0.5 }); noise({ f0: 800, f1: 100, dur: 1.2, vol: 0.2, a: 0.1, wet: 0.4 }); },
    bossHorn: () => { for (const f of [73.4, 110, 146.8]) tone({ type: 'sawtooth', f0: f, dur: 2.2, vol: 0.09, a: 0.4, filter: 'lowpass', ff0: 300, ff1: 1400, wet: 0.6 }); tone({ type: 'sine', f0: 36, dur: 2.5, vol: 0.4, a: 0.3 }); },
    bossDeath: () => { A.duck(3); noise({ f0: 3000, f1: 50, dur: 2.5, vol: 0.45, wet: 0.7 }); tone({ type: 'sine', f0: 120, f1: 25, dur: 2.2, vol: 0.5 }); [523, 659, 784, 1046].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 1.2, vol: 0.07, delay: 0.5 + k * 0.12, wet: 0.7 })); },
    nullPulse: p => { tone({ type: 'sine', f0: 600, f1: 40, dur: 0.8, vol: 0.3, pan: p, wet: 0.5 }); noise({ filter: 'bandpass', f0: 400, f1: 3000, q: 2, dur: 0.5, vol: 0.15, pan: p }); },
    warn: p => { tone({ type: 'square', f0: 440, dur: 0.12, vol: 0.05, filter: 'lowpass', ff0: 1500, pan: p }); tone({ type: 'square', f0: 440, dur: 0.12, vol: 0.05, delay: 0.25, filter: 'lowpass', ff0: 1500, pan: p }); },
    summon: p => { tone({ type: 'sawtooth', f0: 80, f1: 300, dur: 0.6, vol: 0.08, filter: 'lowpass', ff0: 800, pan: p, wet: 0.4 }); noise({ f0: 300, f1: 2000, dur: 0.5, vol: 0.1, pan: p }); },
    riftStep: p => { tone({ type: 'sine', f0: 900, f1: 60, dur: 0.5, vol: 0.2, pan: p, wet: 0.5 }); },
    leak: () => { tone({ type: 'square', f0: 220, f1: 110, dur: 0.35, vol: 0.12, filter: 'lowpass', ff0: 1200 }); tone({ type: 'sine', f0: 70, f1: 40, dur: 0.4, vol: 0.3 }); },
    phoenix: () => { [392, 523, 659, 784, 1046].forEach((f, k) => tone({ type: 'sawtooth', f0: f, dur: 0.8, vol: 0.06, delay: k * 0.08, filter: 'lowpass', ff0: 3000, wet: 0.7 })); },
    mod: p => { [880, 1318, 1760].forEach((f, k) => tone({ type: 'sine', f0: f, dur: 0.3, vol: 0.07, delay: k * 0.06, pan: p, wet: 0.5 })); },
    overclock: p => { tone({ type: 'sawtooth', f0: 100, f1: 800, dur: 0.6, vol: 0.08, filter: 'lowpass', ff0: 400, ff1: 4000, pan: p }); noise({ filter: 'highpass', f0: 2000, f1: 8000, dur: 0.5, vol: 0.06, pan: p }); },
    burnout: p => { noise({ f0: 3000, f1: 200, dur: 0.8, vol: 0.15, pan: p }); tone({ type: 'square', f0: 300, f1: 60, dur: 0.6, vol: 0.06, filter: 'lowpass', ff0: 1000, pan: p }); },
    shatter: p => { for (let k = 0; k < 8; k++) tone({ type: 'triangle', f0: 2000 + Math.random() * 3000, dur: 0.2, vol: 0.05, delay: k * 0.03, pan: p, wet: 0.4 }); noise({ f0: 6000, f1: 500, dur: 0.6, vol: 0.2, pan: p }); },
    meteorFall: p => { noise({ filter: 'bandpass', f0: 300, f1: 2500, q: 1, dur: 0.9, vol: 0.18, a: 0.3, pan: p }); },
    meteor: p => { noise({ f0: 2500, f1: 40, dur: 1.4, vol: 0.5, pan: p, wet: 0.5 }); tone({ type: 'sine', f0: 90, f1: 25, dur: 1.2, vol: 0.55 }); },
    stasis: () => { tone({ type: 'sine', f0: 1200, f1: 200, dur: 1.2, vol: 0.15, wet: 0.8 }); chord([440, 554, 659], { type: 'triangle', dur: 1.5, vol: 0.05, a: 0.1, wet: 0.8 }); },
    mend: () => { [523, 659, 784, 1046].forEach((f, k) => tone({ type: 'sine', f0: f, dur: 0.6, vol: 0.08, delay: k * 0.07, wet: 0.7 })); },
    night: () => { chord([110, 130.8, 164.8], { type: 'sawtooth', dur: 2.2, vol: 0.04, a: 0.6, filter: 'lowpass', ff0: 400, wet: 0.8 }); },
    day: () => { chord([523, 659, 784], { type: 'triangle', dur: 1.5, vol: 0.04, a: 0.3, wet: 0.8 }); },
    rumble: p => { noise({ f0: 200, f1: 80, dur: 1.4, vol: 0.12, a: 0.5, pan: p }); },
    eruption: p => { noise({ f0: 1200, f1: 60, dur: 1.2, vol: 0.32, pan: p, wet: 0.4 }); tone({ type: 'sine', f0: 70, f1: 30, dur: 0.9, vol: 0.35, pan: p }); },
    waveStart: () => { tone({ type: 'sawtooth', f0: 146.8, dur: 0.9, vol: 0.08, a: 0.08, filter: 'lowpass', ff0: 500, ff1: 1800, wet: 0.6 }); tone({ type: 'sawtooth', f0: 220, dur: 0.9, vol: 0.06, a: 0.08, delay: 0.15, filter: 'lowpass', ff0: 500, ff1: 1800, wet: 0.6 }); noise({ f0: 200, f1: 60, dur: 0.6, vol: 0.2 }); },
    victory: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.5, vol: 0.09, delay: k * 0.13, wet: 0.6 })); chord([261, 329, 392], { type: 'sawtooth', dur: 2.5, vol: 0.04, a: 0.3, delay: 0.9, filter: 'lowpass', ff0: 2000, wet: 0.7 }); },
    defeat: () => { [392, 349, 311, 261].forEach((f, k) => tone({ type: 'sawtooth', f0: f, dur: 0.7, vol: 0.06, delay: k * 0.3, filter: 'lowpass', ff0: 900, wet: 0.7 })); tone({ type: 'sine', f0: 55, dur: 2.5, vol: 0.35, a: 0.2 }); },
    ability_focus: p => { [880, 1175, 1568].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.07, delay: k * 0.04, pan: p, wet: 0.5 })); },
    ability_barrage: p => { tone({ type: 'square', f0: 220, dur: 0.15, vol: 0.06, filter: 'lowpass', ff0: 1000, pan: p }); tone({ type: 'square', f0: 330, dur: 0.15, vol: 0.06, delay: 0.12, filter: 'lowpass', ff0: 1000, pan: p }); },
    ability_deepfreeze: p => { SFX.freeze(p); noise({ filter: 'highpass', f0: 1000, f1: 10000, dur: 1, vol: 0.12, pan: p, wet: 0.6 }); },
    ability_thunder: p => { tone({ type: 'sawtooth', f0: 60, f1: 1200, dur: 0.35, vol: 0.07, filter: 'lowpass', ff0: 300, ff1: 4000, pan: p, wet: 0.5 }); noise({ filter: 'highpass', f0: 1500, f1: 7000, dur: 0.35, vol: 0.08, a: 0.25, pan: p }); },
    ability_entangle: p => { SFX.roots(p); },
    ability_overcharge: p => { SFX.overclock(p); chord([440, 554, 659], { type: 'sawtooth', dur: 0.6, vol: 0.04, filter: 'lowpass', ff0: 2000, pan: p, wet: 0.5 }); },
    ability_collapse: p => { tone({ type: 'sine', f0: 400, f1: 25, dur: 2.2, vol: 0.4, pan: p, wet: 0.7 }); noise({ f0: 200, f1: 3000, dur: 1.5, vol: 0.12, a: 0.5, pan: p }); },
  };
  // per-enemy audio signatures: a cue when a squad arrives, and a distinct death sound
  const SIG = {
    husk:    { spawn: p => { tone({ type: 'sawtooth', f0: 110, f1: 70, dur: 0.5, vol: 0.06, filter: 'lowpass', ff0: 500, pan: p, wet: 0.4 }); }, death: p => { noise({ f0: 700, f1: 150, dur: 0.15, vol: 0.1, pan: p }); tone({ type: 'sine', f0: 220, f1: 80, dur: 0.12, vol: 0.07, pan: p }); } },
    skitter: { spawn: p => { for (let k = 0; k < 6; k++) noise({ filter: 'bandpass', f0: 4000, q: 6, dur: 0.02, vol: 0.06, delay: k * 0.04, pan: p }); }, death: p => { tone({ type: 'square', f0: 1400, f1: 500, dur: 0.06, vol: 0.04, filter: 'lowpass', ff0: 3000, pan: p }); } },
    bulwark: { spawn: p => { tone({ type: 'square', f0: 70, dur: 0.6, vol: 0.06, filter: 'lowpass', ff0: 300, pan: p }); noise({ filter: 'bandpass', f0: 2200, q: 8, dur: 0.3, vol: 0.06, delay: 0.1, pan: p }); }, death: p => { for (let k = 0; k < 3; k++) tone({ type: 'triangle', f0: 600 + k * 230, dur: 0.25, vol: 0.05, delay: k * 0.03, pan: p, wet: 0.3 }); noise({ f0: 1200, f1: 200, dur: 0.3, vol: 0.14, pan: p }); } },
    shrike:  { spawn: p => { tone({ type: 'sawtooth', f0: 1800, f1: 2600, dur: 0.25, vol: 0.04, filter: 'bandpass', ff0: 2400, q: 3, pan: p, wet: 0.5 }); }, death: p => { tone({ type: 'triangle', f0: 2200, f1: 700, dur: 0.18, vol: 0.05, pan: p }); } },
    swarm:   { spawn: p => { tone({ type: 'sawtooth', f0: 180, dur: 0.8, vol: 0.03, filter: 'bandpass', ff0: 900, q: 4, pan: p }); tone({ type: 'sawtooth', f0: 186, dur: 0.8, vol: 0.03, filter: 'bandpass', ff0: 900, q: 4, pan: p }); }, death: p => { noise({ filter: 'highpass', f0: 3000, dur: 0.04, vol: 0.04, pan: p }); } },
    aegis:   { spawn: p => { chord([392, 588], { type: 'sine', dur: 0.6, vol: 0.04, a: 0.1, pan: p, wet: 0.5 }); }, death: p => { tone({ type: 'sine', f0: 900, f1: 200, dur: 0.3, vol: 0.07, pan: p, wet: 0.4 }); noise({ filter: 'highpass', f0: 5000, dur: 0.2, vol: 0.05, pan: p }); } },
    blinker: { spawn: p => { tone({ type: 'sine', f0: 300, f1: 2400, dur: 0.2, vol: 0.05, pan: p }); }, death: p => { tone({ type: 'sine', f0: 2400, f1: 200, dur: 0.15, vol: 0.06, pan: p }); } },
    brood:   { spawn: p => { tone({ type: 'sine', f0: 60, f1: 90, dur: 0.6, vol: 0.12, pan: p }); noise({ f0: 300, dur: 0.4, vol: 0.06, pan: p }); }, death: p => { noise({ f0: 900, f1: 100, dur: 0.4, vol: 0.2, pan: p }); tone({ type: 'sine', f0: 140, f1: 40, dur: 0.35, vol: 0.18, pan: p }); } },
    mender:  { spawn: p => { chord([784, 988, 1175], { type: 'sine', dur: 0.5, vol: 0.03, a: 0.05, pan: p, wet: 0.6 }); }, death: p => { tone({ type: 'sine', f0: 1175, f1: 400, dur: 0.3, vol: 0.06, pan: p, wet: 0.5 }); } },
    phantom: { spawn: p => { noise({ filter: 'bandpass', f0: 600, f1: 1800, q: 6, dur: 0.9, vol: 0.06, a: 0.3, pan: p, wet: 0.8 }); }, death: p => { noise({ filter: 'bandpass', f0: 1800, f1: 400, q: 5, dur: 0.4, vol: 0.07, pan: p, wet: 0.7 }); } },
  };
  for (const k in SIG) { SFX['spawn_' + k] = SIG[k].spawn; SFX['death_' + k] = SIG[k].death; }
  SFX.spawn_nullwarden = p => { tone({ type: 'sine', f0: 40, f1: 28, dur: 2.5, vol: 0.5, a: 0.4 }); noise({ filter: 'bandpass', f0: 200, f1: 900, q: 2, dur: 2.2, vol: 0.12, a: 0.6, wet: 0.8, pan: p }); for (const f of [110, 116.5, 164.8]) tone({ type: 'sawtooth', f0: f, f1: f * 0.5, dur: 2.4, vol: 0.05, a: 0.5, filter: 'lowpass', ff0: 900, ff1: 200, wet: 0.7 }); A.duck(2.5); }; SFX.spawn_magmaw = p => SFX.eruption(p);
  SFX.hit = p => { noise({ filter: 'bandpass', f0: 1500, q: 1.5, dur: 0.05, vol: 0.06, pan: p }); };
  SFX.eliteSpawn = p => { chord([523, 784, 1046], { type: 'triangle', dur: 0.5, vol: 0.05, a: 0.02, pan: p, wet: 0.6 }); noise({ filter: 'highpass', f0: 6000, dur: 0.3, vol: 0.04, pan: p }); };
  const THROTTLE = { hit: 0.06, death_swarm: 0.05, death_skitter: 0.05, death_husk: 0.04, prism: 0.05, volley: 0.07, zap: 0.06, death: 0.035, frost: 0.12, lash: 0.08, pop: 0.05, boom: 0.06, mortar: 0.07, hover: 0.04, blink: 0.1, scratch: 0.1, minionDie: 0.1 };

  A.play = function (name, x) {
    if (!A.ready || !SFX[name]) return;
    const now = ctx.currentTime;
    const th = THROTTLE[name] || 0.025;
    if (last[name] && now - last[name] < th) return;
    if (voices > 40) return;
    last[name] = now;
    voices++; setTimeout(() => voices--, 300);
    const pan = x != null ? (x / (30 * 64) - 0.5) * 1.2 : 0;
    try {
      let m = SAMPLE_MAP[name];
      if (name.startsWith('spawn_') && sample('sig_' + name, pan, 0.45, 1, 0.3)) return; // recorded per-enemy arrival signature
      if (name.startsWith('death_') && A.samples['sig_' + name] && Math.random() < 0.65) { sample('sig_' + name, pan, 0.32, 1, 0.1); return; }
      if (!m && name.startsWith('death_')) { const ty = name.slice(6); if (A.samples.death) { sample('death', pan, 0.3, DEATH_RATE[ty] || 1); if (SFX[name] && Math.random() < 0.5) SFX[name](pan); return; } }
      if (m && sample(m[0], pan, m[1], m[2], 0.15)) { if (m[3] && SFX[name]) SFX[name](pan); return; }
      SFX[name](pan);
    } catch (e) { /* ignore audio errors */ }
  };

  // ------------------------------------------------------------ adaptive music
  const M = A.music = { on: false, step: 0, nextT: 0, bar: 0 };
  const MOODS = {
    verdant: { root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 5, 3, 4], progB: [3, 4, 0, 6], bpm: 96, lead: 'triangle' },     // D dorian
    sky:     { root: 53, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 3], progB: [5, 3, 1, 4], bpm: 92, lead: 'sine' },         // F lydian
    neon:    { root: 48, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], progB: [3, 6, 5, 4], bpm: 104, lead: 'square' },      // C aeolian
    cinder:  { root: 52, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 6], progB: [5, 6, 0, 1], bpm: 100, lead: 'sawtooth' },    // E phrygian
    menu:    { root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 5, 4], bpm: 80, lead: 'sine' },
  };
  M.mood = MOODS.menu;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  M.setup = function () {
    M.layers = {};
    for (const k of ['pad', 'bass', 'drums', 'arp', 'boss']) { const g = ctx.createGain(); g.gain.value = 0; g.connect(musicBus); M.layers[k] = g; }
    const padVerb = ctx.createGain(); padVerb.gain.value = 0.6; M.layers.pad.connect(padVerb); padVerb.connect(verbSend);
    const arpDelay = ctx.createGain(); arpDelay.gain.value = 0.7; M.layers.arp.connect(arpDelay); arpDelay.connect(delaySend);
    M.padFilter = ctx.createBiquadFilter(); M.padFilter.type = 'lowpass'; M.padFilter.frequency.value = 900;
    M.padFilter.connect(M.layers.pad);
    setInterval(M.tick, 25);
  };
  M.beds = null;
  M.setupBeds = function () {
    if (M.beds || !(AS.MUSIC && AS.MUSIC.length)) return;
    M.beds = {};
    if (location.protocol !== 'file:' && ctx) { M.bedFilter = ctx.createBiquadFilter(); M.bedFilter.type = 'lowpass'; M.bedFilter.frequency.value = 18000; M.bedFilter.connect(musicBus); }
    for (const k of AS.MUSIC) { const el = new Audio('assets/music/' + k + '.mp3'); el.loop = true; el.preload = 'auto'; el.volume = 0;
      if (M.bedFilter) { try { el.crossOrigin = 'anonymous'; ctx.createMediaElementSource(el).connect(M.bedFilter); } catch (e) { /* plain element playback */ } } el.addEventListener('error', () => { M.beds[k] = null; }); M.beds[k] = { el, v: 0 }; }
  };
  M.bedKey = function () { if (M.boss && M.beds.boss) return 'boss'; const map = { verdant: 'verdant', sky: 'sky', neon: 'neon', cinder: 'cinder', menu: 'menu' }; return map[M.moodKey] || 'menu'; };
  M.tickBeds = function () {
    if (!M.beds) return false;
    const want = M.bedKey(); const bed = M.beds[want];
    if (!bed) return false;
    const calmKey = 'calm_' + want, calm = M.beds[calmKey];
    // hysteresis switch between the calm and combat stems (one dominant at a time, 2.5s crossfade) so unrelated takes never drift on top of each other
    if (M.combat == null) M.combat = false;
    if (A.intensity > 0.34) M.combat = true; else if (A.intensity < 0.17) M.combat = false;
    if (A.intensity > 0.68) M.hot = true; else if (A.intensity < 0.5) M.hot = false; // third layer for high pressure
    M.wC = (M.wC || 0) + ((M.combat || !calm ? 1 : 0) - (M.wC || 0)) * 0.016;
    const hotKey = 'hot_' + want, hot = M.beds[hotKey];
    M.wH = (M.wH || 0) + ((M.hot && hot ? 1 : 0) - (M.wH || 0)) * 0.02;
    const wCombat = calm ? M.wC : 1;
    const I = A.intensity, duck = ctx && ctx.currentTime < (A.duckUntil || 0) ? 0.35 : 1;
    const scale = M.bedFilter ? 1 : A.vol.music * A.vol.master; // routed beds already pass through the music/master buses
    const target = M.on ? scale * (want === 'menu' ? 0.7 : 0.45 + 0.45 * I) * duck : 0;
    if (M.bedFilter) M.bedFilter.frequency.setTargetAtTime(want === 'boss' || want === 'menu' ? 18000 : 2500 + 15500 * Math.pow(I, 1.3), ctx.currentTime, 0.8); // prep = muffled & calm, battle = full
    for (const k in M.beds) {
      const b = M.beds[k]; if (!b) continue;
      const tv = k === want ? target * wCombat * (1 - M.wH) : k === hotKey ? target * wCombat * M.wH * 1.05 : k === calmKey ? target * (1 - wCombat) * 1.1 : 0;
      b.v += (tv - b.v) * 0.04;
      if (b.v < 0.003 && tv === 0) { if (!b.el.paused) b.el.pause(); b.v = 0; }
      else if (b.el.paused) { const p = b.el.play(); if (p && p.catch) p.catch(() => { }); }
      b.el.volume = U.clamp(b.v, 0, 1);
    }
    return true;
  };
  M.setMood = function (key) { M.moodKey = key; M.mood = MOODS[key] || MOODS.menu; if (delay) delay.delayTime.value = 60 / M.mood.bpm * 0.75; };
  M.start = function () { if (!A.ready) return; M.setupBeds(); M.on = true; M.nextT = ctx.currentTime + 0.1; M.step = 0; };
  M.stop = function () { M.on = false; };
  M.setBoss = function (on) { M.boss = !!on; };
  M.setIntensity = function (v) { A.targetIntensity = U.clamp(v, 0, 1); };
  M.tick = function () {
    if (!A.ready) return;
    A.intensity += (A.targetIntensity - A.intensity) * 0.02;
    const I = A.intensity, t = ctx.currentTime;
    const L = M.layers;
    const beds = M.tickBeds(); // recorded music bed active -> keep only the synth boss/drum accents quiet underneath
    const set = (g, v) => g.gain.setTargetAtTime(M.on ? (beds ? 0 : v) : 0, t, 0.6);
    set(L.pad, 0.5 - I * 0.15); set(L.bass, I > 0.12 ? 0.5 : 0); set(L.drums, I > 0.32 ? 0.55 + I * 0.3 : 0); set(L.arp, I > 0.55 ? 0.35 : 0); set(L.boss, I > 0.84 || M.boss ? 0.5 : 0);
    M.padFilter.frequency.setTargetAtTime(600 + I * 2400, t, 0.8);
    if (!M.on || beds) return;
    const spb = 60 / (M.mood.bpm * (1 + (I > 0.84 ? 0.08 : 0))) / 4;
    while (M.nextT < t + 0.12) { M.play(M.step, M.nextT, spb); M.step++; M.nextT += spb; }
  };
  M.play = function (step, t, spb) {
    const mood = M.mood, L = M.layers, I = A.intensity;
    const s16 = step % 16, bar = Math.floor(step / 16);
    // song form: A section, B section (every 8 bars), and a dedicated boss theme
    const BOSS_PROG = [0, 5, 6, 4, 0, 5, 1, 4];
    const prog = M.boss ? BOSS_PROG : (Math.floor(bar / 8) % 2 && mood.progB ? mood.progB : mood.prog);
    const deg = prog[bar % prog.length];
    const sc = mood.scale;
    const note = (d, oct) => mood.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + (oct || 0));
    // pad: new chord each bar
    if (s16 === 0) {
      for (const d of [deg, deg + 2, deg + 4, deg + 6]) {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(note(d, 0)); o.detune.value = det;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + spb * 6); g.gain.setTargetAtTime(0.0001, t + spb * 15, spb * 3);
          o.connect(g); g.connect(M.padFilter); o.start(t); o.stop(t + spb * 22);
        }
      }
    }
    // bass
    if (I > 0.1 && (s16 % 4 === 0 || (I > 0.5 && s16 % 2 === 0))) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(note(deg, -2) + (s16 === 14 ? 7 : 0));
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300 + I * 900, t); f.frequency.exponentialRampToValueAtTime(120, t + spb * 2); f.Q.value = 6;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 2.5);
      o.connect(f); f.connect(g); g.connect(L.bass); o.start(t); o.stop(t + spb * 3);
    }
    // drums
    if (I > 0.3) {
      const kick = s16 === 0 || s16 === 8 || (I > 0.7 && (s16 === 6 || s16 === 11));
      if (kick) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.connect(g); g.connect(L.drums); o.start(t); o.stop(t + 0.3); }
      if (s16 === 4 || s16 === 12) { const src = ctx.createBufferSource(); src.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); src.connect(f); f.connect(g); g.connect(L.drums); src.start(t, Math.random()); src.stop(t + 0.2); }
      if (s16 % 2 === 0 || I > 0.65) { const src = ctx.createBufferSource(); src.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); const v = (s16 % 4 === 2 ? 0.09 : 0.05); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); src.connect(f); f.connect(g); g.connect(L.drums); src.start(t, Math.random()); src.stop(t + 0.06); }
    }
    // arp
    if (I > 0.5) {
      const pat = [0, 2, 4, 7, 4, 2, 6, 4];
      const d = deg + pat[s16 % 8];
      const o = ctx.createOscillator(); o.type = mood.lead; o.frequency.value = mtof(note(d, 1));
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(mood.lead === 'sine' ? 0.09 : 0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.6);
      o.connect(f); f.connect(g); g.connect(L.arp); o.start(t); o.stop(t + spb * 2);
    }
    // lead motif at high intensity (call & answer phrase over the chord)
    if (I > 0.66 && s16 % 2 === 0) {
      const MOTIF = bar % 2 ? [4, -1, 3, -1, 2, 0, 1, -1] : [0, -1, 2, 4, -1, 6, 4, 2];
      const st = MOTIF[(s16 / 2) | 0];
      if (st >= 0) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(note(deg + st, 2));
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(note(deg + st, 2)) * 2.003;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 3);
        const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
        o.connect(g); g.connect(L.arp); o.start(t); o2.start(t); o.stop(t + spb * 3.2); o2.stop(t + spb * 3.2);
      }
    }
    // boss theme: choir pad + timpani
    if (M.boss && s16 === 0) {
      for (const d of [deg, deg + 2, deg + 4]) for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(note(d, 0)); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 3; // 'aah' formant
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + spb * 4); g.gain.setTargetAtTime(0.0001, t + spb * 14, spb * 2);
        o.connect(f); f.connect(g); g.connect(L.boss); o.start(t); o.stop(t + spb * 18);
      }
    }
    if (M.boss && (s16 === 0 || s16 === 10 || s16 === 12)) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(mtof(note(deg, -2)) * 2, t); o.frequency.exponentialRampToValueAtTime(mtof(note(deg, -2)), t + 0.25);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(L.boss); o.start(t); o.stop(t + 0.65);
    }
    // boss brass stabs
    if (I > 0.84 && (s16 === 0 || s16 === 3 || s16 === 6 || s16 === 10)) {
      for (const d of [deg, deg + 4]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(note(d, -1));
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.08); f.frequency.exponentialRampToValueAtTime(500, t + spb * 2);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 2.5);
        o.connect(f); f.connect(g); g.connect(L.boss); o.start(t); o.stop(t + spb * 3);
      }
    }
  };

  AS.Audio = A;
})(AS);
