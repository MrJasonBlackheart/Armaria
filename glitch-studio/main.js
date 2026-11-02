(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#view');
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) { document.body.innerHTML = '<p style="color:#fff;padding:2em">WebGL is not available.</p>'; return; }

  // ---------- state ----------
  const base = {}, map = {}, ccMap = {}; // ccMap: "ch:cc" -> param id
  PARAMS.forEach(p => { base[p.id] = p.def; map[p.id] = { src: 'none', amt: 0 }; });
  const byId = Object.fromEntries(PARAMS.map(p => [p.id, p]));
  const getParam = id => base[id];
  const rows = {}; // id -> {slider,val}
  let learnId = null;

  function eff(id) {
    const p = byId[id], m = map[id];
    let v = base[id];
    if (m.src !== 'none' && p.audio) v += (Features[m.src] || 0) * m.amt * (p.max - p.min);
    return Math.min(p.max, Math.max(p.min, v));
  }

  // ---------- GL ----------
  const uniformDecl = PARAMS.filter(p => p.uniform).map(p => `uniform float u_${p.id};`).join('\n');
  function program(fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs.replace('UNIFORMS', uniformDecl)));
    gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    pr.loc = {};
    const loc = n => (pr.loc[n] = gl.getUniformLocation(pr, n));
    ['uRes', 'uTime', 'uBeat', 'uA', 'uB', 'uC', 'uD', 'uPrev', 'uTex'].forEach(loc);
    PARAMS.filter(p => p.uniform).forEach(p => loc('u_' + p.id));
    return pr;
  }
  const prog1 = program(FRAG1), prog2 = program(FRAG2);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function tex() {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const slotTex = [tex(), tex(), tex(), tex()];
  const fbo = [0, 1].map(() => ({ tex: tex(), fb: gl.createFramebuffer(), w: 0, h: 0 }));
  let W = 0, H = 0, ping = 0;
  function resize() {
    const s = base.resScale;
    const w = Math.max(64, Math.round(canvas.clientWidth * s)), h = Math.max(64, Math.round(canvas.clientHeight * s));
    if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h;
    fbo.forEach(f => {
      gl.bindTexture(gl.TEXTURE_2D, f.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    });
  }

  // ---------- images ----------
  const images = []; // canvases 1280x720
  const IW = 1280, IH = 720;
  function toCanvas(src, sw, sh) {
    const c = document.createElement('canvas'); c.width = IW; c.height = IH;
    const x = c.getContext('2d'), s = Math.max(IW / sw, IH / sh);
    x.drawImage(src, (IW - sw * s) / 2, (IH - sh * s) / 2, sw * s, sh * s);
    return c;
  }
  function proc(draw) { const c = document.createElement('canvas'); c.width = IW; c.height = IH; draw(c.getContext('2d')); return c; }
  function defaults() {
    return [
      proc(x => { // colour bars
        const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
        cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * IW / 7, 0, IW / 7 + 1, IH * .7); });
        ['#0000c0', '#111', '#c000c0', '#111', '#00c0c0', '#111', '#c0c0c0'].forEach((c, i) => { x.fillStyle = c; x.fillRect(i * IW / 7, IH * .7, IW / 7 + 1, IH * .1); });
        const g = x.createLinearGradient(0, 0, IW, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
        x.fillStyle = g; x.fillRect(0, IH * .8, IW, IH * .2);
      }),
      proc(x => { // retro sunset grid
        const g = x.createLinearGradient(0, 0, 0, IH * .6); g.addColorStop(0, '#1a0033'); g.addColorStop(1, '#ff3c8e');
        x.fillStyle = g; x.fillRect(0, 0, IW, IH);
        x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(IW / 2, IH * .5, 170, Math.PI, 0); x.fill();
        x.fillStyle = '#12002b'; x.fillRect(0, IH * .55, IW, IH);
        x.strokeStyle = '#00e5ff'; x.lineWidth = 3;
        for (let i = -20; i <= 20; i++) { x.beginPath(); x.moveTo(IW / 2 + i * 20, IH * .55); x.lineTo(IW / 2 + i * 140, IH); x.stroke(); }
        for (let i = 1; i < 10; i++) { const y = IH * .55 + Math.pow(i / 10, 2) * IH * .45; x.beginPath(); x.moveTo(0, y); x.lineTo(IW, y); x.stroke(); }
      }),
      proc(x => { // circles
        x.fillStyle = '#000'; x.fillRect(0, 0, IW, IH);
        for (let i = 0; i < 60; i++) {
          x.strokeStyle = `hsl(${i * 6},100%,55%)`; x.lineWidth = 10;
          x.beginPath(); x.arc(IW / 2 + Math.sin(i * .5) * 250, IH / 2 + Math.cos(i * .7) * 120, 10 + i * 6, 0, 7); x.stroke();
        }
      }),
      proc(x => { // no signal
        x.fillStyle = '#0a0a60'; x.fillRect(0, 0, IW, IH);
        x.fillStyle = '#fff'; x.font = 'bold 120px monospace'; x.textAlign = 'center';
        x.fillText('NO SIGNAL', IW / 2, IH / 2); x.font = '48px monospace'; x.fillText('CH 03  ▶ PLAY', IW / 2, IH / 2 + 90);
      }),
    ];
  }
  let cur = 0;
  function slotIndex(k) { return images.length ? (cur + k) % images.length : 0; }
  function uploadSlots() {
    for (let k = 0; k < 4; k++) {
      gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, slotTex[k]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[slotIndex(k)]);
    }
    renderThumbs();
  }
  function renderThumbs() {
    const box = $('#thumbs'); box.innerHTML = '';
    images.forEach((c, i) => {
      const d = document.createElement('canvas'); d.width = 64; d.height = 36; d.getContext('2d').drawImage(c, 0, 0, 64, 36);
      d.title = 'Click: show as A. Shift-click: remove.'; if (i === cur) d.className = 'cur';
      d.onclick = e => { if (e.shiftKey) { if (images.length > 1) { images.splice(i, 1); cur %= images.length; } } else cur = i; base.morph = 0; syncUI('morph'); uploadSlots(); };
      box.appendChild(d);
    });
  }
  function addFiles(files) {
    [...files].filter(f => f.type.startsWith('image/')).forEach(f => {
      const img = new Image(); img.onload = () => { images.push(toCanvas(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(img.src); uploadSlots(); };
      img.src = URL.createObjectURL(f);
    });
  }
  function startTransition() { if (!trans.active) { trans.active = true; trans.t = 0; } }

  // ---------- morph automation ----------
  const trans = { active: false, t: 0, hold: 0, beats: 0 };
  function advance() {
    if (images.length < 2) return;
    cur = base.imageOrder > 0.5 ? (cur + 1 + Math.floor(Math.random() * (images.length - 1))) % images.length : (cur + 1) % images.length;
    base.morph = 0; syncUI('morph'); uploadSlots();
  }
  function onBeat() {
    if (base.autoMode !== 2) return;
    if (++trans.beats >= base.autoEvery) { trans.beats = 0; startTransition(); }
  }
  function stepMorph(dt) {
    if (base.autoMode === 1 && !trans.active) { trans.hold += dt; if (trans.hold >= base.autoEvery) { trans.hold = 0; startTransition(); } }
    if (trans.active) {
      trans.t += dt / base.morphTime; base.morph = Math.min(1, trans.t); syncUI('morph');
      if (trans.t >= 1) { trans.active = false; advance(); }
    }
  }

  // ---------- UI ----------
  function fmt(p, v) {
    if (p.options) return p.options[Math.round(v)];
    return p.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(p.step < 0.01 ? 3 : 2);
  }
  function syncUI(id) { const r = rows[id]; if (!r) return; r.slider.value = base[id]; r.val.textContent = fmt(byId[id], base[id]); }
  function buildUI() {
    const panel = $('#params'); panel.innerHTML = '';
    GROUPS.forEach((g, gi) => {
      const det = document.createElement('details'); det.open = gi < 2;
      det.innerHTML = `<summary>${g}</summary>`;
      PARAMS.filter(p => p.group === g).forEach(p => {
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<label>${p.label}</label><span class="val"></span><input type="range" min="${p.min}" max="${p.max}" step="${p.step}">`;
        const slider = row.querySelector('input'), val = row.querySelector('.val');
        slider.value = base[p.id]; val.textContent = fmt(p, base[p.id]);
        slider.oninput = () => { base[p.id] = +slider.value; val.textContent = fmt(p, base[p.id]); if (p.id === 'resScale') resize(); };
        slider.ondblclick = () => { base[p.id] = p.def; syncUI(p.id); };
        rows[p.id] = { slider, val };
        {
          const mod = document.createElement('div'); mod.className = 'mod';
          const sel = document.createElement('select');
          AUDIO_SOURCES.forEach(s => { const o = document.createElement('option'); o.textContent = s; sel.appendChild(o); });
          sel.value = map[p.id].src; sel.onchange = () => { map[p.id].src = sel.value; };
          const amt = document.createElement('input'); amt.type = 'range'; amt.min = -1; amt.max = 1; amt.step = 0.01; amt.value = map[p.id].amt;
          amt.title = 'Audio amount (fraction of range)'; amt.oninput = () => { map[p.id].amt = +amt.value; };
          const lb = document.createElement('button'); lb.textContent = 'MIDI'; lb.title = 'MIDI learn: click then move a CC knob';
          lb.onclick = () => { learnId = learnId === p.id ? null : p.id; document.querySelectorAll('.mod button').forEach(b => b.classList.remove('on')); if (learnId) lb.classList.add('on'); };
          rows[p.id].sel = sel; rows[p.id].amt = amt; rows[p.id].learn = lb;
          if (p.audio) mod.append(sel, amt);
          mod.append(lb); row.append(mod);
        }
        det.append(row);
      });
      panel.append(det);
    });
  }
  function applyState(values, maps) {
    Object.keys(values || {}).forEach(k => { if (byId[k]) base[k] = values[k]; });
    PARAMS.forEach(p => { if (maps && maps[p.id]) map[p.id] = { src: maps[p.id][0], amt: maps[p.id][1] }; });
    PARAMS.forEach(p => { syncUI(p.id); const r = rows[p.id]; if (r.sel) { r.sel.value = map[p.id].src; r.amt.value = map[p.id].amt; } });
    resize();
  }
  function resetAll() { PARAMS.forEach(p => { base[p.id] = p.def; map[p.id] = { src: 'none', amt: 0 }; }); }
  function applyPreset(name) {
    const pr = PRESETS[name]; resetAll();
    applyState(pr.values, Object.fromEntries(Object.entries(pr.map).map(([k, v]) => [k, v])));
  }
  function randomize() {
    ['blockAmt', 'sliceAmt', 'smearAmt', 'rgbSplit', 'chanSwap', 'waveAmp', 'feedback', 'collage', 'noise', 'tracking', 'chromaBleed', 'dropout', 'jitter', 'scanline', 'barrel', 'bloom', 'headSwitch', 'ghost'].forEach(id => {
      const p = byId[id]; base[id] = Math.random() < .4 ? p.def : p.min + Math.random() * (p.max - p.min) * .6;
    });
    base.morphType = Math.floor(Math.random() * MORPH_TYPES.length);
    applyState({}, null);
  }

  function initPanel() {
    const ps = $('#presets');
    Object.keys(PRESETS).forEach(n => { const o = document.createElement('option'); o.textContent = n; ps.appendChild(o); });
    const saved = JSON.parse(localStorage.getItem('glitchStudioPresets') || '{}');
    const refreshSaved = () => { [...ps.querySelectorAll('.user')].forEach(o => o.remove()); Object.keys(saved).forEach(n => { const o = document.createElement('option'); o.textContent = n; o.className = 'user'; ps.appendChild(o); }); };
    refreshSaved();
    ps.onchange = () => { const n = ps.value; if (PRESETS[n]) applyPreset(n); else if (saved[n]) { resetAll(); applyState(saved[n].values, saved[n].map); Object.assign(ccMap, saved[n].cc || {}); } };
    $('#savePreset').onclick = () => { const n = prompt('Preset name?'); if (!n) return; saved[n] = { values: { ...base }, map: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [v.src, v.amt]])), cc: { ...ccMap } }; localStorage.setItem('glitchStudioPresets', JSON.stringify(saved)); refreshSaved(); ps.value = n; };
    $('#random').onclick = randomize;
    $('#reset').onclick = () => { resetAll(); applyState({}, null); };
    $('#next').onclick = startTransition;
    $('#imgfiles').onchange = e => addFiles(e.target.files);
    $('#clearCC').onclick = () => { Object.keys(ccMap).forEach(k => delete ccMap[k]); $('#midiInfo').textContent = 'CC mappings cleared'; };
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
    $('#shot').onclick = () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'glitch.png'; a.click(); };
    let rec = null, chunks = [];
    $('#rec').onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new MediaRecorder(canvas.captureStream(60), { mimeType: 'video/webm' }); chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'glitch.webm'; a.click(); rec = null; $('#rec').textContent = '● Rec'; };
      rec.start(); $('#rec').textContent = '■ Stop';
    };
    $('#fs').onclick = () => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    $('#tap').onclick = () => { const b = audio.tapTempo(); if (b) { base.bpm = Math.min(220, Math.max(40, b)); syncUI('bpm'); } };
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'h') $('#panel').classList.toggle('hidden');
      else if (e.key === 'f') $('#fs').click();
      else if (e.key === ' ') { e.preventDefault(); startTransition(); }
      else if (e.key === 'r') randomize();
    });
  }

  // ---------- audio / MIDI wiring ----------
  const audio = new AudioEngine(getParam, onBeat);
  async function initAudioUI() {
    const sel = $('#audioDev');
    const fill = async () => {
      try {
        const devs = await audio.listDevices(); sel.innerHTML = '<option value="">Select line-in / interface…</option>';
        devs.forEach(d => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || d.deviceId; sel.appendChild(o); });
      } catch (e) { $('#audioInfo').textContent = 'Audio devices unavailable: ' + e.message; }
    };
    $('#audioEnable').onclick = async () => { await fill(); };
    sel.onchange = async () => { if (!sel.value) return; try { await audio.useDevice(sel.value); $('#audioInfo').textContent = audio.status; } catch (e) { $('#audioInfo').textContent = 'Error: ' + e.message; } };
    $('#audioFile').onchange = e => { if (e.target.files[0]) { audio.useFile(e.target.files[0]); $('#audioInfo').textContent = audio.status; } };
    $('#demoAudio').onclick = () => { audio.useDemo(); $('#audioInfo').textContent = audio.status; };
    $('#midiEnable').onclick = async () => {
      const ms = $('#midiDev');
      const fillM = async () => {
        const ins = await audio.initMidi(); ms.innerHTML = '<option value="">Select MIDI input…</option>';
        ins.forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = i.name; ms.appendChild(o); });
        $('#midiInfo').textContent = ins.length ? ins.length + ' MIDI input(s) found' : (audio.midiStatus || 'No MIDI inputs found');
      };
      try { await fillM(); audio.onMidiState = fillM; } catch (e) { $('#midiInfo').textContent = 'MIDI error: ' + e.message; }
      ms.onchange = () => audio.selectMidi(ms.value);
    };
    audio.onCC = (ch, cc, v) => {
      const key = ch + ':' + cc;
      if (learnId) { ccMap[key] = learnId; $('#midiInfo').textContent = `CC ${cc} (ch ${ch + 1}) → ${byId[learnId].label}`; rows[learnId].learn.classList.remove('on'); learnId = null; }
      const id = ccMap[key]; if (!id) return;
      const p = byId[id]; base[id] = p.min + v * (p.max - p.min); if (p.step >= 1) base[id] = Math.round(base[id]); syncUI(id);
    };
  }

  // ---------- render loop ----------
  function setUniforms(pr) {
    PARAMS.filter(p => p.uniform).forEach(p => gl.uniform1f(pr.loc['u_' + p.id], eff(p.id)));
    gl.uniform2f(pr.loc.uRes, W, H); gl.uniform1f(pr.loc.uTime, performance.now() / 1000 % 3600); gl.uniform1f(pr.loc.uBeat, Features.beat);
  }
  let last = performance.now(), fpsT = 0, frames = 0;
  function frame(t) {
    const dt = Math.min(.1, (t - last) / 1000); last = t;
    audio.update(dt); stepMorph(dt); resize();
    const r = fbo[ping], w = fbo[1 - ping];
    gl.bindFramebuffer(gl.FRAMEBUFFER, w.fb); gl.viewport(0, 0, W, H);
    gl.useProgram(prog1); setUniforms(prog1);
    ['uA', 'uB', 'uC', 'uD'].forEach((n, k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, slotTex[k]); gl.uniform1i(prog1.loc[n], k); });
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, r.tex); gl.uniform1i(prog1.loc.uPrev, 4);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(prog2); setUniforms(prog2);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, w.tex); gl.uniform1i(prog2.loc.uTex, 5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ping = 1 - ping;
    drawMeters(); frames++; fpsT += dt;
    if (fpsT > 1) { $('#fps').textContent = Math.round(frames / fpsT) + ' fps'; frames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }
  const mc = $('#meters').getContext('2d');
  function drawMeters() {
    mc.clearRect(0, 0, 200, 40);
    ['bass', 'mid', 'treble', 'level', 'beat', 'note'].forEach((k, i) => {
      mc.fillStyle = k === 'beat' ? '#ff3c8e' : k === 'note' ? '#ffd23f' : '#00e5ff';
      const h = Math.min(1, Features[k]) * 38; mc.fillRect(i * 33 + 2, 40 - h, 28, h);
    });
  }

  // ---------- go ----------
  images.push(...defaults());
  buildUI(); initPanel(); initAudioUI(); uploadSlots(); applyPreset('Broken VHS'); document.querySelector('#presets').value = 'Broken VHS';
  requestAnimationFrame(frame);
})();
