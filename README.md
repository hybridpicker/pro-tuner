# Pro Tuner

A professional chromatic tuner for musicians who just want to tune — no ads, no paywalls, no distractions.

Built by a working musician for his students. Every guitarist, bassist, or string player deserves a reliable tuner that gets out of the way and does its job. That's it.

**[tuner.schoensgibl.com](https://tuner.schoensgibl.com)**

<img height="600" alt="Pro Tuner showing guitar standard tuning in dark mode with needle meter and string cards" src="https://github.com/user-attachments/assets/35e11796-3d7b-41be-8521-70b5f8a7e52c" />

*Dark mode — guitar standard tuning, needle meter*

---

## Features

- **Free & ad-free** — always, no account required
- **Works offline** — install as a PWA, tune without internet
- **Multi-instrument** — Guitar (11 tunings), Bass, Ukulele, Violin, Viola, Banjo, Chromatic
- **±0.5 cent accuracy** — YIN pitch detection across 50–2000 Hz
- **Needle meter** — spring-physics animated needle with LED indicators
- **Reference tones** — tap any string card to hear it
- **Quick-tune lock** — double-tap a string to lock the detector to it
- **A4 reference** — adjustable 430–450 Hz
- **Sharp / flat notation**, transposition support
- **Dark mode by default**, light mode toggle
- **Wake Lock** — screen stays on while you tune

---

<details>
<summary>Technical details (audio pipeline, architecture)</summary>

## Stack

Vanilla HTML + CSS + JS — no framework, no build step, no dependencies. Total bundle < 150 KB.

| File | Purpose |
|------|---------|
| `index.html` | App shell & all DOM |
| `css/style.css` | Styles, CSS custom properties, dark/light theming |
| `js/app.js` | Main wiring — audio engine → UI |
| `js/audio/audio-worklet-processor.js` | AudioWorklet YIN detector (audio thread) |
| `js/audio/pitch-detector.js` | YIN fallback for older browsers |
| `js/audio/noise-gate.js` | RMS noise gate — low/medium/high presets, 150ms hold-open, auto-calibration |
| `js/audio/tone-generator.js` | Reference tone playback |
| `js/tunings/tuning-data.js` | All instrument tunings, A4 recalculation |
| `js/ui/meter.js` | Canvas needle meter with spring physics |
| `js/ui/string-display.js` | String cards, click/double-click/long-press |
| `js/ui/theme.js` | Dark/light theme manager |
| `js/utils/settings.js` | Settings panel, localStorage persistence |
| `sw.js` | Service worker (cache-first PWA) |

## Audio Pipeline

1. `getUserMedia` — echo cancellation, AGC and noise suppression **disabled**
2. **AudioWorklet** runs YIN detection on the audio thread (falls back to ScriptProcessor)
3. YIN steps: difference function → cumulative mean normalized difference → absolute threshold (0.11) → parabolic interpolation
4. **Sub-octave validation** — after finding the first CMNDF valley, checks lag×2 for a fundamental an octave below; prefers it when CMNDF < threshold×2.5 (fixes harmonic confusion on low strings like E2/A2)
5. Adaptive buffer: 8192 samples below 200 Hz (low strings), 4096 above
6. DC offset removal before each analysis window
7. **Onset detection** — RMS jump >3× resets median filter and EMA for instant response to new notes
8. Median filter (ring buffer of 5 in worklet, 9 in fallback) removes outliers
9. **Proximity-aware EMA smoothing** — doubles alpha within 10¢ for faster lock-in; snaps immediately at >100¢ (note change); confidence-weighted base alpha
10. Harmonic correction: ×2/÷2 octave jumps corrected against smoothed reference frequency
11. Confidence filter: frames below 0.25 confidence discarded
12. Noise gate with 150ms hold-open (sustain dropout prevention) and auto noise floor calibration on start (p75 × 2.5); presets: low 0.001 / medium 0.004 / high 0.015
13. In-tune LED hysteresis: enters at < 5¢, exits at ≥ 8¢
14. Results throttled to ~60 fps for UI updates

## Local Development

```bash
cd pro-tuner
python3 -m http.server 8080
# open http://localhost:8080
```

Microphone access requires HTTPS or localhost — `file://` won't work.

## Deployment

```bash
git push origin main
ssh jarvis@94.130.37.43 "cd /home/jarvis/apps/pro-tuner && git pull origin main"
```

Nginx serves the directory directly with `Permissions-Policy: microphone=(self)`.

</details>

---

## License

MIT — made with care by [Lukas Schönsgibl](https://schoensgibl.com), music school director, instrumental pedagogue, and guitarist.
