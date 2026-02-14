# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pro Tuner is a professional-grade, PWA-enabled, multi-instrument chromatic tuner hosted at tuner.schoensgibl.com. Vanilla JS with ES modules — no build system, no dependencies, no framework. Total bundle < 150KB.

## Development

Serve with any static file server (e.g. `python3 -m http.server 8080`). ES modules require a server — opening `index.html` via `file://` won't work. No build or install steps required.

## Deployment

```bash
git push origin main
ssh jarvis@94.130.37.43 "cd /home/jarvis/apps/pro-tuner && git pull origin main"
```

Nginx serves the directory with `Permissions-Policy: microphone=(self)`.

## Architecture

### File Structure
- `index.html` — HTML skeleton with meta tags, ARIA attributes, all DOM structure
- `css/style.css` — Complete styles with CSS custom properties for dark/light theming
- `js/app.js` — Main entry point, wires all modules together
- `js/audio/` — Audio engine (pitch detection, worklet, noise gate, tone generator)
- `js/tunings/tuning-data.js` — All instrument tunings with frequency calculation helpers
- `js/ui/` — UI components (canvas meter, waveform visualizations, string cards, theme)
- `js/utils/settings.js` — Settings management with localStorage persistence
- `sw.js` — Service worker for PWA offline support
- `manifest.json` — PWA manifest

### Audio Pipeline
1. Microphone via `getUserMedia` (echo cancellation, AGC, noise suppression **disabled**)
2. **AudioWorklet** (`audio-worklet-processor.js`) runs YIN detection in audio thread; falls back to `ScriptProcessor` for older browsers
3. **YIN pitch detection**: difference function → cumulative mean normalized difference → absolute threshold (0.15) → parabolic interpolation. Range 50–2000 Hz.
4. **Adaptive buffer**: 8192 samples for frequencies < 200Hz, 4096 for higher
5. **Median filter** (ring buffer of 9) removes outliers, then **adaptive EMA smoothing** (alpha = 30/freq, clamped 0.08–0.5)
6. **Noise gate** (`noise-gate.js`): RMS-based with low/medium/high presets
7. Results posted to main thread → throttled UI updates at ~60fps

### Tuning System
`tuning-data.js` defines tunings for guitar (11 tunings), bass (3), ukulele (3), violin, viola, banjo, plus chromatic mode. All frequencies calculated from A4=440Hz equal temperament (`440 * 2^((midi-69)/12)`). `recalculateFrequencies(a4)` adjusts all tunings for custom A4 reference (430–450 Hz).

### UI Components
- **MeterDisplay** (`meter.js`): Canvas-based, two modes — needle (spring-physics animation) and strobe (Peterson-style scrolling bands). User-switchable.
- **Visualizations** (`waveform.js`): Collapsible panel with real-time oscilloscope waveform and 3-second rolling pitch history graph.
- **StringDisplay** (`string-display.js`): Renders string cards, handles click (reference tone), double-click/long-press (quick-tune lock).
- **Settings** (`settings.js`): A4 reference, meter style, sensitivity, notation (♯/♭), transposition. Slide-in panel (right on desktop, bottom sheet on mobile).

### Theming
CSS custom properties on `:root` / `[data-theme="light"]`. Key colors: `--accent` (#e8a838 amber), `--in-tune` (#00c853 emerald), `--off-tune` (#ff7043 orange). ThemeManager toggles `data-theme` attribute and persists to localStorage.

### PWA
Service worker with cache-first strategy. Wake Lock API keeps screen on during tuning. Haptic feedback (vibrate) on in-tune confirmation.
