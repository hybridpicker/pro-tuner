/**
 * Canvas-based visualizations: real-time waveform and pitch history graph.
 *
 * Both canvases live inside a collapsible panel and only render when visible.
 * HiDPI is handled by scaling the canvas backing store by devicePixelRatio.
 */

export class Visualizations {
  /**
   * @param {HTMLCanvasElement} waveformCanvas
   * @param {HTMLCanvasElement} pitchHistoryCanvas
   */
  constructor(waveformCanvas, pitchHistoryCanvas) {
    this.waveformCanvas = waveformCanvas;
    this.waveformCtx = waveformCanvas.getContext('2d');
    this.pitchCanvas = pitchHistoryCanvas;
    this.pitchCtx = pitchHistoryCanvas.getContext('2d');

    this.pitchHistory = [];
    this.historyDuration = 3000;
    this.isVisible = false;
    this.animationId = null;

    // Cache resolved CSS colours so we don't read them every frame
    this._colors = null;

    this._resizeBound = this.resize.bind(this);
    window.addEventListener('resize', this._resizeBound);

    this.resize();
  }

  // ------------------------------------------------------------------
  //  Colour helpers
  // ------------------------------------------------------------------

  /** Read CSS custom properties once and cache them. */
  _resolveColors() {
    const style = getComputedStyle(document.documentElement);
    this._colors = {
      accent: style.getPropertyValue('--accent').trim() || '#e8a838',
      inTune: style.getPropertyValue('--in-tune').trim() || '#00c853',
      textDim: style.getPropertyValue('--text-dim').trim() || '#8a8d94',
      surface: style.getPropertyValue('--surface').trim() || '#1e2025',
    };
  }

  /** Invalidate cached colours (call after theme change). */
  refreshColors() {
    this._colors = null;
  }

  _getColors() {
    if (!this._colors) this._resolveColors();
    return this._colors;
  }

  // ------------------------------------------------------------------
  //  Canvas sizing (HiDPI aware)
  // ------------------------------------------------------------------

  resize() {
    this._sizeCanvas(this.waveformCanvas);
    this._sizeCanvas(this.pitchCanvas);
  }

  _sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ------------------------------------------------------------------
  //  Waveform (oscilloscope)
  // ------------------------------------------------------------------

  /**
   * Draw a single frame of the waveform.
   * @param {Float32Array} timeDomainData - audio samples in [-1, 1]
   */
  updateWaveform(timeDomainData) {
    if (!this.isVisible) return;

    const canvas = this.waveformCanvas;
    const ctx = this.waveformCtx;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const colors = this._getColors();

    // Clear
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, w, h);

    // Faint horizontal center line
    ctx.strokeStyle = colors.textDim;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw waveform
    if (!timeDomainData || timeDomainData.length === 0) return;

    const len = timeDomainData.length;
    const step = len / w;
    const midY = h / 2;
    const amp = h / 2 * 0.85; // leave a little padding

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let x = 0; x < w; x++) {
      const idx = Math.floor(x * step);
      const sample = timeDomainData[idx] || 0;
      const y = midY - sample * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  // ------------------------------------------------------------------
  //  Pitch History (rolling line graph)
  // ------------------------------------------------------------------

  /**
   * Record a pitch reading.
   * @param {number} frequency - detected frequency in Hz
   * @param {number} timestamp - performance.now() or Date.now()
   */
  updatePitchHistory(frequency, timestamp) {
    this.pitchHistory.push({ frequency, timestamp });

    // Evict stale entries
    const cutoff = timestamp - this.historyDuration;
    while (this.pitchHistory.length > 0 && this.pitchHistory[0].timestamp < cutoff) {
      this.pitchHistory.shift();
    }

    if (this.isVisible) this._drawPitchHistory();
  }

  _drawPitchHistory() {
    const canvas = this.pitchCanvas;
    const ctx = this.pitchCtx;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const colors = this._getColors();
    const history = this.pitchHistory;

    // Clear
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, w, h);

    if (history.length < 2) return;

    // Determine Y range
    let minF = Infinity;
    let maxF = -Infinity;
    for (let i = 0; i < history.length; i++) {
      const f = history[i].frequency;
      if (f < minF) minF = f;
      if (f > maxF) maxF = f;
    }
    // Pad range so the line doesn't hug edges
    const range = maxF - minF || 10;
    const pad = range * 0.2 + 5;
    minF -= pad;
    maxF += pad;

    // Time window
    const now = history[history.length - 1].timestamp;
    const tStart = now - this.historyDuration;

    // Coordinate mappers
    const toX = (t) => ((t - tStart) / this.historyDuration) * w;
    const toY = (f) => h - ((f - minF) / (maxF - minF)) * h;

    // Faint horizontal reference lines (roughly 4 lines)
    const fStep = (maxF - minF) / 5;
    ctx.strokeStyle = colors.textDim;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 5; i++) {
      const y = toY(minF + i * fStep);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Build point array
    const pts = [];
    for (let i = 0; i < history.length; i++) {
      pts.push({
        x: toX(history[i].timestamp),
        y: toY(history[i].frequency),
      });
    }

    // Smooth curve path using quadratic bezier
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const cpx = (prev.x + cur.x) / 2;
      const cpy = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
    }
    // Final segment to the last point
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);

    // Gradient fill below the line
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, this._withAlpha(colors.accent, 0.2));
    gradient.addColorStop(1, this._withAlpha(colors.accent, 0));

    // Save the line path, then close for fill
    ctx.save();
    ctx.lineTo(last.x, h);
    ctx.lineTo(pts[0].x, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // Re-draw the line on top (without the fill closure segments)
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const cpx = (prev.x + cur.x) / 2;
      const cpy = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
    }
    ctx.lineTo(last.x, last.y);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Small dots at data points
    ctx.fillStyle = colors.accent;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Return a CSS rgba string from a hex colour and alpha.
   * @param {string} hex - e.g. '#e8a838'
   * @param {number} alpha - 0-1
   */
  _withAlpha(hex, alpha) {
    // Handle shorthand and full hex
    let r, g, b;
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ------------------------------------------------------------------
  //  Visibility
  // ------------------------------------------------------------------

  toggle() {
    if (this.isVisible) this.hide();
    else this.show();
  }

  show() {
    this.isVisible = true;
    // Re-resolve colours in case theme changed while hidden
    this._colors = null;
    this.resize();
  }

  hide() {
    this.isVisible = false;
  }

  // ------------------------------------------------------------------
  //  Cleanup
  // ------------------------------------------------------------------

  destroy() {
    this.isVisible = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener('resize', this._resizeBound);
    this.pitchHistory.length = 0;
  }
}
