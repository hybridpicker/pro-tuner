# Pro Tuner

Professional chromatic instrument tuner — runs in the browser, works offline.

**[tuner.schoensgibl.com](https://tuner.schoensgibl.com)**

---

## Features

- **YIN pitch detection** — accurate to ±0.5 cent across 50–2000 Hz
- **Needle & Strobe meter** — spring-physics needle or Peterson-style scrolling strobe
- **Multi-instrument** — Guitar (11 tunings), Bass, Ukulele, Violin, Viola, Banjo, Chromatic
- **Reference tones** — tap any string card to hear it
- **Quick-tune lock** — double-tap a string to lock the detector to it
- **A4 reference** — adjustable 430–450 Hz
- **Sharp / flat notation**, transposition support
- **PWA** — installable, works fully offline
- **Wake Lock** — screen stays on while tuning
- **Dark / light theme**

## Stack

Vanilla HTML + CSS + JS — no framework, no build step, no dependencies. Total bundle < 150 KB.

| File | Purpose |
|------|---------|
| `index.html` | App shell & all DOM |
| `css/style.css` | Styles, CSS custom properties, dark/light theming |
| `js/app.js` | Main wiring — audio engine → UI |
| `js/audio/` | AudioWorklet YIN detector, noise gate, tone generator |
| `js/tunings/tuning-data.js` | All instrument tunings |
| `js/ui/` | Canvas meter (needle + strobe), string cards, theme |
| `js/utils/settings.js` | Settings with localStorage persistence |
| `sw.js` | Service worker (cache-first PWA) |

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

## Audio Pipeline

1. `getUserMedia` — echo cancellation, AGC and noise suppression **disabled**
2. **AudioWorklet** runs YIN detection in the audio thread (falls back to ScriptProcessor)
3. YIN: difference function → cumulative mean normalized difference → absolute threshold 0.15 → parabolic interpolation
4. Adaptive buffer: 8192 samples below 200 Hz, 4096 above
5. Median filter (ring buffer of 9) + adaptive EMA smoothing
6. RMS noise gate — low / medium / high presets
7. Results throttled to ~60 fps for UI updates

## License

MIT — © Lukas Schönsgibl
