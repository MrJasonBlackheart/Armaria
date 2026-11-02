// Parameter registry. Every entry becomes a slider in the UI; entries with
// `uniform:true` are also sent to the shaders as `u_<id>`.
// `audio:false` disables the per-parameter audio mapping controls.
const GROUPS = ['Morph', 'Collage', 'Glitch', 'Color', 'Feedback', 'CRT', 'VCR', 'Audio'];
const MORPH_TYPES = ['Crossfade', 'Slice wipe', 'Pixel dissolve', 'Displacement', 'Block shuffle', 'Luma wipe'];
const AUTO_MODES = ['Off', 'Seconds', 'Beats'];
const BEAT_SOURCES = ['Audio', 'Clock (BPM)', 'MIDI clock', 'MIDI note'];

function P(group, id, label, min, max, def, step, extra) {
  return Object.assign({ group, id, label, min, max, def, step: step || 0.01, uniform: true, audio: true }, extra || {});
}
const NU = { uniform: false, audio: false };

const PARAMS = [
  P('Morph', 'morph', 'Morph amount', 0, 1, 0),
  P('Morph', 'morphType', 'Morph style', 0, MORPH_TYPES.length - 1, 0, 1, { options: MORPH_TYPES, audio: false }),
  P('Morph', 'autoMode', 'Auto advance', 0, 2, 0, 1, Object.assign({ options: AUTO_MODES }, NU)),
  P('Morph', 'autoEvery', 'Every N (sec / beats)', 1, 32, 4, 1, NU),
  P('Morph', 'morphTime', 'Transition time (s)', 0.05, 10, 1.5, 0.05, NU),
  P('Morph', 'imageOrder', 'Random order', 0, 1, 0, 1, NU),

  P('Collage', 'collage', 'Collage amount', 0, 1, 0),
  P('Collage', 'cells', 'Grid size', 1, 16, 4, 1),
  P('Collage', 'tile', 'Tile vs window', 0, 1, 0),
  P('Collage', 'collageRate', 'Reshuffle rate', 0, 20, 2),

  P('Glitch', 'glitchRate', 'Glitch rate (Hz)', 0.5, 60, 12, 0.5),
  P('Glitch', 'blockAmt', 'Block displace', 0, 1, 0),
  P('Glitch', 'blockX', 'Block columns', 2, 64, 12, 1),
  P('Glitch', 'blockY', 'Block rows', 2, 64, 8, 1),
  P('Glitch', 'blockShift', 'Block shift', 0, 1, 0.15),
  P('Glitch', 'sliceAmt', 'Slice tear', 0, 1, 0),
  P('Glitch', 'sliceCount', 'Slice count', 2, 200, 40, 1),
  P('Glitch', 'sliceShift', 'Slice shift', 0, 1, 0.2),
  P('Glitch', 'smearAmt', 'Pixel smear', 0, 1, 0),
  P('Glitch', 'waveAmp', 'Wave warp', 0, 0.2, 0, 0.001),
  P('Glitch', 'waveFreq', 'Wave frequency', 0, 100, 12, 0.5),
  P('Glitch', 'waveSpeed', 'Wave speed', -10, 10, 1, 0.1),
  P('Glitch', 'pixel', 'Pixelate (px)', 1, 64, 1, 1),
  P('Glitch', 'mirrorX', 'Mirror X', 0, 1, 0, 1),
  P('Glitch', 'mirrorY', 'Mirror Y', 0, 1, 0, 1),

  P('Color', 'rgbSplit', 'RGB split', 0, 0.1, 0, 0.001),
  P('Color', 'rgbAngle', 'RGB split angle', 0, 6.283, 0, 0.01),
  P('Color', 'chanSwap', 'Channel swap', 0, 1, 0),
  P('Color', 'invertAmt', 'Block invert', 0, 1, 0),
  P('Color', 'solarize', 'Solarize', 0, 1, 0),
  P('Color', 'posterize', 'Posterize levels', 2, 32, 32, 1),
  P('Color', 'hue', 'Hue rotate', 0, 6.283, 0),
  P('Color', 'mono', 'Monochrome', 0, 1, 0),

  P('Feedback', 'feedback', 'Feedback / trails', 0, 0.98, 0),
  P('Feedback', 'fbZoom', 'Feedback zoom', 0.9, 1.1, 1, 0.001),
  P('Feedback', 'fbRot', 'Feedback rotate', -0.1, 0.1, 0, 0.001),
  P('Feedback', 'flash', 'Beat flash', 0, 1, 0),

  P('CRT', 'barrel', 'Screen curvature', 0, 0.5, 0),
  P('CRT', 'scanline', 'Scanlines', 0, 1, 0),
  P('CRT', 'scanCount', 'Scanline count', 100, 1080, 480, 1),
  P('CRT', 'mask', 'Phosphor mask', 0, 1, 0),
  P('CRT', 'bloom', 'Bloom / glow', 0, 1, 0),
  P('CRT', 'vignette', 'Vignette', 0, 1, 0),
  P('CRT', 'flicker', 'Flicker', 0, 1, 0),
  P('CRT', 'interlace', 'Interlace jitter', 0, 1, 0),
  P('CRT', 'brightness', 'Brightness', -0.5, 0.5, 0),
  P('CRT', 'contrast', 'Contrast', 0.3, 2.5, 1),
  P('CRT', 'saturation', 'Saturation', 0, 3, 1),
  P('CRT', 'resScale', 'Render resolution', 0.1, 1, 1, 0.01, NU),

  P('VCR', 'tracking', 'Tracking wobble', 0, 1, 0),
  P('VCR', 'trackBand', 'Tracking noise band', 0, 1, 0),
  P('VCR', 'headSwitch', 'Head-switch tear', 0, 1, 0),
  P('VCR', 'chromaBleed', 'Chroma bleed', 0, 1, 0),
  P('VCR', 'lumaSmear', 'Luma smear', 0, 1, 0),
  P('VCR', 'noise', 'Static / snow', 0, 1, 0),
  P('VCR', 'dropout', 'Signal dropouts', 0, 1, 0),
  P('VCR', 'roll', 'Vertical roll', 0, 1, 0),
  P('VCR', 'rollSpeed', 'Roll speed', -3, 3, 0.3, 0.01),
  P('VCR', 'jitter', 'Line jitter', 0, 1, 0),
  P('VCR', 'ghost', 'Ghosting (cable)', 0, 1, 0),

  P('Audio', 'sensitivity', 'Input gain', 0.1, 5, 1, 0.05, NU),
  P('Audio', 'smoothing', 'Release smoothing', 0, 0.99, 0.8, 0.01, NU),
  P('Audio', 'beatThreshold', 'Beat threshold', 1.05, 2.5, 1.4, 0.01, NU),
  P('Audio', 'beatSource', 'Beat source', 0, 3, 0, 1, Object.assign({ options: BEAT_SOURCES }, NU)),
  P('Audio', 'bpm', 'Clock BPM', 40, 220, 120, 1, NU),
];

const AUDIO_SOURCES = ['none', 'bass', 'mid', 'treble', 'level', 'beat', 'note'];

// Built-in looks. Values are merged over defaults. `map` sets audio mappings: id -> [source, amount].
const PRESETS = {
  'Clean': { values: {}, map: {} },
  'Broken VHS': {
    values: { scanline: 0.5, scanCount: 360, tracking: 0.5, trackBand: 0.6, headSwitch: 0.7, chromaBleed: 0.7, lumaSmear: 0.4,
      noise: 0.25, dropout: 0.4, roll: 0.0, jitter: 0.35, ghost: 0.3, vignette: 0.4, barrel: 0.08, saturation: 1.3, resScale: 0.5, bloom: 0.3 },
    map: { tracking: ['bass', 0.4], noise: ['treble', 0.3], rgbSplit: ['beat', 0.02], roll: ['beat', 0.25] },
  },
  'Dead Cable Channel': {
    values: { noise: 0.55, scanline: 0.4, scanCount: 300, mono: 0.5, ghost: 0.6, flicker: 0.4, barrel: 0.15, vignette: 0.7, roll: 0.1,
      rollSpeed: 0.15, trackBand: 0.3, interlace: 0.6, resScale: 0.4, bloom: 0.4, contrast: 1.3 },
    map: { noise: ['level', 0.4], roll: ['beat', 0.5] },
  },
  'Datamosh Collage': {
    values: { collage: 0.6, cells: 6, collageRate: 4, blockAmt: 0.5, blockShift: 0.25, sliceAmt: 0.3, feedback: 0.6, fbZoom: 1.01,
      rgbSplit: 0.01, morphType: 3, autoMode: 2, autoEvery: 4, scanline: 0.2, resScale: 0.7 },
    map: { blockAmt: ['bass', 0.6], sliceAmt: ['treble', 0.5], collage: ['mid', 0.4], morph: ['bass', 0.5], rgbSplit: ['beat', 0.04] },
  },
  'Beat Morph': {
    values: { morphType: 5, autoMode: 2, autoEvery: 2, morphTime: 0.4, rgbSplit: 0.004, scanline: 0.25, bloom: 0.4, flash: 0.3, barrel: 0.06 },
    map: { rgbSplit: ['beat', 0.03], flash: ['beat', 0.5], hue: ['level', 0.8] },
  },
  'Arcade Cabinet': {
    values: { barrel: 0.2, scanline: 0.7, scanCount: 240, mask: 0.6, bloom: 0.5, vignette: 0.6, flicker: 0.1, pixel: 3, posterize: 8,
      saturation: 1.5, contrast: 1.2, resScale: 0.6 },
    map: { flicker: ['beat', 0.3] },
  },
};
