# Glitch Studio

Audio-reactive image glitch / retro-video emulator. Runs in the browser (WebGL), no build step:
open `index.html` in Chrome or Edge (Web MIDI requires Chromium).

## Features
- **Images**: add many images (button or drag-and-drop). Four are blended live (A-D).
- **Morph**: 6 styles (crossfade, slice wipe, pixel dissolve, displacement, block shuffle, luma wipe); manual, timed, or every-N-beats auto advance.
- **Collage**: grid cells randomly pulled from all loaded images, windowed or tiled.
- **Glitch**: block displacement, slice tearing, pixel smear, wave warp, pixelate, mirror, RGB split, channel swap, block invert, solarize, posterize, hue rotate, feedback trails.
- **CRT**: curvature, scanlines, phosphor mask, bloom, vignette, flicker, interlace, low render resolution.
- **VCR / cable**: tracking wobble and noise band, head-switch tear, chroma bleed, luma smear, static, dropouts, vertical roll, line jitter, ghosting.
- **Every slider** has an audio-source selector (bass / mid / treble / level / beat / note) with an amount, plus a **MIDI learn** button. Double-click a slider to reset it.
- Presets (built-in, or save your own to localStorage), randomize, PNG snapshot, WebM recording.

## Live setup
**Mixer / audio interface**: click *Find inputs* and choose the interface input. Echo cancellation, noise suppression and AGC are disabled so the signal stays clean. Tune levels with *Input gain* in the Audio group.
To take audio straight from a DAW instead, route it to a loopback device (BlackHole/Loopback on macOS, VB-Cable on Windows, JACK/PipeWire on Linux) and select that.

**MIDI from a DAW**: expose a virtual port (macOS IAC Driver, Windows loopMIDI), send from the DAW, click *Find MIDI* and pick the port.
- Beat source (Audio group): *MIDI clock* (DAW clock, 24 ppqn; beats lock to the DAW tempo and Start resets the count), *MIDI note* (every note-on is a beat), *Audio* (bass onset detection) or *Clock (BPM)* (internal clock; tap tempo available).
- `note` is a mappable source: note velocity with decay.
- CC knobs/automation: click **MIDI** next to a slider, then move a CC. Mappings are saved with presets.

No source handy? Use *Demo beat* or load an audio file to rehearse.

## Keys
`H` hide panel, `F` fullscreen, `Space` start morph, `R` randomize.
