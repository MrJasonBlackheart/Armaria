// Audio + MIDI input. Features (all 0..1): bass, mid, treble, level, beat, note.
const Features = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0, note: 0 };

// Pure helper (unit-testable): average magnitude (0..1) of FFT bins between f0..f1 Hz.
function bandEnergy(bytes, sampleRate, f0, f1) {
  const binHz = sampleRate / 2 / bytes.length;
  const i0 = Math.max(0, Math.floor(f0 / binHz)), i1 = Math.min(bytes.length - 1, Math.ceil(f1 / binHz));
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += bytes[i];
  return sum / Math.max(1, i1 - i0 + 1) / 255;
}

class AudioEngine {
  constructor(getParam, onBeat) {
    this.getParam = getParam; this.onBeat = onBeat;
    this.ctx = null; this.analyser = null; this.srcNode = null; this.bytes = null;
    this.avgBass = 0; this.lastBeat = 0; this.env = { bass: 0, mid: 0, treble: 0, level: 0 };
    this.beatEnv = 0; this.noteEnv = 0;
    this.clockPhase = 0; this.midiTicks = 0; this.midiBpm = 0; this.lastTick = 0;
    this.midi = null; this.midiInput = null; this.onCC = null; this.onMidiState = null;
    this.status = 'No audio input';
  }
  _ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.5;
    this.bytes = new Uint8Array(this.analyser.frequencyBinCount);
    const z = this.ctx.createGain(); z.gain.value = 0; // keep graph alive without audible output
    this.analyser.connect(z); z.connect(this.ctx.destination);
  }
  _swap(node, label) {
    if (this.srcNode) { try { this.srcNode.disconnect(); } catch (e) {} }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.osc) { try { this.osc.stop(); } catch (e) {} this.osc = null; }
    this.srcNode = node; node.connect(this.analyser); this.status = label;
  }
  async listDevices() {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true }); // permission so labels show
      tmp.getTracks().forEach(t => t.stop());
    } catch (e) {}
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audioinput');
  }
  // Line-in from a mixer / audio interface / loopback driver: disable voice processing.
  async useDevice(deviceId) {
    this._ensure();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
    });
    const node = this.ctx.createMediaStreamSource(stream);
    this._swap(node, 'Input: ' + (stream.getAudioTracks()[0].label || 'device'));
    this.stream = stream;
  }
  useFile(file) {
    this._ensure();
    if (this.el) { this.el.pause(); URL.revokeObjectURL(this.el.src); }
    const el = new Audio(URL.createObjectURL(file)); el.loop = true; this.el = el;
    const node = this.ctx.createMediaElementSource(el);
    node.connect(this.ctx.destination);
    this._swap(node, 'File: ' + file.name); el.play();
  }
  useDemo() { // synthetic kick + hat for rehearsing without a source
    this._ensure();
    const ctx = this.ctx, out = ctx.createGain(); out.gain.value = 1;
    const bpm = this.getParam('bpm'); const step = 60 / bpm; let t0 = ctx.currentTime + .1;
    const sched = () => {
      if (this.demoOut !== out) return;
      while (t0 < ctx.currentTime + .5) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + .15);
        g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .3);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + .3);
        const n = ctx.createBufferSource(), nb = ctx.createBuffer(1, 2000, ctx.sampleRate), d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        n.buffer = nb; const ng = ctx.createGain(); ng.gain.setValueAtTime(.3, t0 + step / 2);
        ng.gain.exponentialRampToValueAtTime(.001, t0 + step / 2 + .04);
        n.connect(ng); ng.connect(out); n.start(t0 + step / 2);
        t0 += step;
      }
      setTimeout(sched, 100);
    };
    this.demoOut = out; this._swap(out, 'Demo beat'); sched();
  }

  // ---------- MIDI (DAW -> browser via IAC bus / loopMIDI / hardware) ----------
  async initMidi() {
    if (!navigator.requestMIDIAccess) { this.midiStatus = 'Web MIDI unsupported (use Chrome/Edge)'; return []; }
    this.midi = await navigator.requestMIDIAccess();
    this.midi.onstatechange = () => this.onMidiState && this.onMidiState();
    return [...this.midi.inputs.values()];
  }
  selectMidi(id) {
    if (this.midiInput) this.midiInput.onmidimessage = null;
    this.midiInput = null;
    if (!id || !this.midi) return;
    const inp = this.midi.inputs.get(id); if (!inp) return;
    inp.onmidimessage = e => this._midiMsg(e.data);
    this.midiInput = inp;
  }
  _midiMsg(d) {
    const st = d[0] & 0xf0, now = performance.now();
    if (d[0] === 0xf8) { // clock: 24 per quarter note
      if (this.lastTick) {
        const dt = now - this.lastTick;
        this.tickMs = this.tickMs ? this.tickMs * .9 + dt * .1 : dt;
        this.midiBpm = 60000 / (this.tickMs * 24);
      }
      this.lastTick = now;
      if (this.midiTicks++ % 24 === 0 && this.getParam('beatSource') === 2) this._fireBeat();
    } else if (d[0] === 0xfa) { this.midiTicks = 0; this.lastTick = 0; this.tickMs = 0; } // start
    else if (st === 0x90 && d[2] > 0) {
      this.noteEnv = Math.max(this.noteEnv, d[2] / 127);
      if (this.getParam('beatSource') === 3) this._fireBeat();
    } else if (st === 0xb0 && this.onCC) this.onCC(d[0] & 15, d[1], d[2] / 127);
  }
  _fireBeat() { this.beatEnv = 1; this.onBeat && this.onBeat(); }
  tapTempo() {
    const now = performance.now();
    this.taps = (this.taps || []).filter(t => now - t < 2500); this.taps.push(now);
    if (this.taps.length > 2) {
      const iv = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
      return Math.round(60000 / iv);
    }
    return null;
  }

  update(dt) {
    const gain = this.getParam('sensitivity'), rel = this.getParam('smoothing');
    const decay = Math.pow(rel, dt * 60);
    let raw = { bass: 0, mid: 0, treble: 0, level: 0 };
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.bytes);
      const sr = this.ctx.sampleRate;
      raw.bass = bandEnergy(this.bytes, sr, 20, 150) * gain;
      raw.mid = bandEnergy(this.bytes, sr, 150, 2000) * gain * 1.5;
      raw.treble = bandEnergy(this.bytes, sr, 2000, 12000) * gain * 3;
      raw.level = bandEnergy(this.bytes, sr, 20, 12000) * gain * 2.5;
      // onset detection on bass energy vs running average
      const bt = this.getParam('beatThreshold');
      if (this.getParam('beatSource') === 0 && raw.bass > 0.15 && raw.bass > this.avgBass * bt && now() - this.lastBeat > 180) {
        this.lastBeat = now(); this._fireBeat();
      }
      this.avgBass = this.avgBass * .95 + raw.bass * .05;
    }
    for (const k of ['bass', 'mid', 'treble', 'level']) {
      const v = Math.min(1, raw[k]);
      this.env[k] = v > this.env[k] ? v : this.env[k] * decay; // fast attack, slow release
      Features[k] = this.env[k];
    }
    if (this.getParam('beatSource') === 1) { // internal BPM clock
      this.clockPhase += dt * this.getParam('bpm') / 60;
      if (this.clockPhase >= 1) { this.clockPhase -= 1; this._fireBeat(); }
    }
    this.beatEnv *= Math.pow(.88, dt * 60); this.noteEnv *= Math.pow(.92, dt * 60);
    Features.beat = this.beatEnv; Features.note = this.noteEnv;
  }
}
function now() { return performance.now(); }
