/**
 * Canvas-based tuning meter with Needle and Strobe modes.
 *
 * Needle mode: semicircular gauge with spring-physics animated needle.
 * Strobe mode: horizontal band pattern whose scroll direction and speed
 * indicate sharp/flat and magnitude of pitch deviation.
 */

export class MeterDisplay {
  /**
   * @param {HTMLCanvasElement} canvas - The #meterCanvas element
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'needle';
    this.currentCents = 0;
    this.targetCents = 0;
    this.animationId = null;

    // Spring physics for needle
    this.velocity = 0;
    this.damping = 0.7;
    this.stiffness = 0.15;

    // Strobe state
    this.strobePhase = 0;
    this._lastFrameTime = 0;

    // Cached CSS colors (refreshed on resize / start)
    this._colors = {};
    this._readColors();

    this.resize();
  }

  /** Read CSS custom properties from the document root. */
  _readColors() {
    const s = getComputedStyle(document.documentElement);
    this._colors = {
      accent: s.getPropertyValue('--accent').trim() || '#e8a838',
      inTune: s.getPropertyValue('--in-tune').trim() || '#00c853',
      offTune: s.getPropertyValue('--off-tune').trim() || '#ff7043',
      text: s.getPropertyValue('--text').trim() || '#e8e6e1',
      textDim: s.getPropertyValue('--text-dim').trim() || '#8a8d94',
      textMuted: s.getPropertyValue('--text-muted').trim() || '#5a5d64',
      surface: s.getPropertyValue('--surface').trim() || '#1e2025',
    };
  }

  // ── Public API ──────────────────────────────────────────────

  /** Update the target cents deviation (-50 to +50). */
  update(cents) {
    this.targetCents = Math.max(-50, Math.min(50, cents));
  }

  /** Switch between 'needle' and 'strobe' modes. */
  setMode(mode) {
    if (mode !== 'needle' && mode !== 'strobe') return;
    this.mode = mode;
    this.reset();
  }

  /** Handle canvas resize (call on window resize). */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._readColors();
  }

  /** Start the animation loop. */
  start() {
    if (this.animationId) return;
    this._readColors();
    this._lastFrameTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animationId = requestAnimationFrame(this._loop);
  }

  /** Stop the animation loop. */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Reset needle / strobe to center / zero. */
  reset() {
    this.currentCents = 0;
    this.targetCents = 0;
    this.velocity = 0;
    this.strobePhase = 0;
  }

  /** Clean up resources. */
  destroy() {
    this.stop();
  }

  // ── Animation Loop ──────────────────────────────────────────

  _loop(timestamp) {
    const dt = Math.min((timestamp - this._lastFrameTime) / 16.667, 3); // normalise to ~60fps steps, cap at 3
    this._lastFrameTime = timestamp;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, w, h);

    if (this.mode === 'needle') {
      this._updateNeedlePhysics(dt);
      this._drawNeedle(w, h);
    } else {
      this._updateStrobePhysics(dt);
      this._drawStrobe(w, h);
    }

    this.animationId = requestAnimationFrame(this._loop);
  }

  // ── Needle ──────────────────────────────────────────────────

  _updateNeedlePhysics(dt) {
    const acceleration =
      this.stiffness * (this.targetCents - this.currentCents) -
      this.damping * this.velocity;
    this.velocity += acceleration * dt;
    this.currentCents += this.velocity * dt;
  }

  _drawNeedle(w, h) {
    const ctx = this.ctx;
    const c = this._colors;
    const cx = w / 2;
    const cy = h - 10; // pivot near bottom
    const radius = Math.min(w * 0.44, h - 24);
    const innerRadius = radius * 0.15;

    // Angle mapping: -50 cents → -π/2 (left), +50 cents → 0 (right)
    // We use a sweep from π (left) to 0 (right) — i.e. top semicircle
    const angleStart = Math.PI;       // -50 cents (left)
    const angleEnd = 0;               // +50 cents (right)
    const centsToAngle = (cents) =>
      angleStart + ((cents + 50) / 100) * (angleEnd - angleStart);

    // ── Background arc gradient (off-tune → in-tune → off-tune) ──
    const segments = 60;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const a0 = angleStart + t0 * (angleEnd - angleStart);
      const a1 = angleStart + t1 * (angleEnd - angleStart);

      // Distance from center (0..1 where 0 = center, 1 = edge)
      const distFromCenter = Math.abs(t0 - 0.5) * 2;
      const alpha = 0.08 + distFromCenter * 0.12;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, -a0, -a1, true);
      ctx.arc(cx, cy, radius * 0.78, -a1, -a0, false);
      ctx.closePath();
      ctx.fillStyle =
        distFromCenter < 0.2
          ? this._withAlpha(c.inTune, alpha)
          : this._withAlpha(c.offTune, alpha);
      ctx.fill();
    }

    // ── Tick marks ──
    for (let cents = -50; cents <= 50; cents += 5) {
      const angle = centsToAngle(cents);
      const isMajor = cents % 10 === 0;
      const isCenter = cents === 0;
      const tickOuter = radius + 2;
      const tickInner = isMajor ? radius * 0.78 : radius * 0.85;

      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);

      ctx.beginPath();
      ctx.moveTo(cx + cos * tickInner, cy + sin * tickInner);
      ctx.lineTo(cx + cos * tickOuter, cy + sin * tickOuter);
      ctx.lineWidth = isCenter ? 2.5 : isMajor ? 1.5 : 0.8;
      ctx.strokeStyle = isCenter
        ? c.inTune
        : isMajor
          ? c.textDim
          : c.textMuted;
      ctx.stroke();
    }

    // ── Labels at -50, -25, 0, +25, +50 ──
    ctx.font = `600 ${Math.max(9, w * 0.024)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const labels = [-50, -25, 0, 25, 50];
    for (const lbl of labels) {
      const angle = centsToAngle(lbl);
      const r = radius * 0.66;
      const x = cx + Math.cos(-angle) * r;
      const y = cy + Math.sin(-angle) * r;
      ctx.fillStyle = lbl === 0 ? c.inTune : c.textDim;
      ctx.fillText(lbl === 0 ? '0' : (lbl > 0 ? '+' : '') + lbl, x, y);
    }

    // ── Needle ──
    const needleAngle = centsToAngle(this.currentCents);
    const isInTune = Math.abs(this.currentCents) < 5;
    const needleColor = isInTune ? c.inTune : c.accent;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-needleAngle);

    // Glow
    ctx.shadowColor = needleColor;
    ctx.shadowBlur = isInTune ? 14 : 8;

    // Needle body (tapered line)
    ctx.beginPath();
    ctx.moveTo(innerRadius, -1.5);
    ctx.lineTo(radius * 0.92, -0.5);
    ctx.lineTo(radius * 0.92, 0.5);
    ctx.lineTo(innerRadius, 1.5);
    ctx.closePath();
    ctx.fillStyle = needleColor;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Pivot cap ──
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = c.textMuted;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = needleColor;
    ctx.fill();

    // ── LED indicator dots ──
    this._drawLEDs(ctx, cx, cy, w, c);
  }

  _drawLEDs(ctx, cx, cy, w, c) {
    const dotCount = 5;
    const spacing = Math.min(w * 0.06, 28);
    const dotRadius = Math.max(3, w * 0.008);
    const y = cy + 6;
    const absCents = Math.abs(this.currentCents);

    for (let i = 0; i < dotCount; i++) {
      const x = cx + (i - 2) * spacing;
      const isCenter = i === 2;

      let color, glowAlpha;
      if (isCenter && absCents < 5) {
        color = c.inTune;
        glowAlpha = 0.6;
      } else if (!isCenter && absCents >= 5) {
        // Light outer dots proportional to deviation
        const distFromCenter = Math.abs(i - 2);
        const threshold = distFromCenter * 12;
        if (absCents >= threshold) {
          color = c.offTune;
          glowAlpha = 0.4;
        } else {
          color = c.textMuted;
          glowAlpha = 0;
        }
      } else {
        color = c.textMuted;
        glowAlpha = 0;
      }

      if (glowAlpha > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
      }

      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Strobe ──────────────────────────────────────────────────

  _updateStrobePhysics(dt) {
    // Approach target with light smoothing so strobe reacts faster than needle
    this.currentCents += (this.targetCents - this.currentCents) * 0.3 * dt;

    // Stop when very close to in-tune
    if (Math.abs(this.currentCents) < 1.5) return;

    // Accumulate raw pixel offset — wrapped per-band in draw
    // ~1.5 px/cent/frame at 60fps gives clearly visible motion without blur
    this.strobePhase += this.currentCents * 0.05 * dt;

    // Prevent float overflow on long sessions
    if (this.strobePhase > 100000) this.strobePhase -= 100000;
    if (this.strobePhase < -100000) this.strobePhase += 100000;
  }

  _drawStrobe(w, h) {
    const ctx = this.ctx;
    const c = this._colors;
    const bandCount = 10;
    const bandWidth = w / bandCount;
    const absCents = Math.abs(this.currentCents);

    // Color blend: accent → inTune as we approach zero
    const blendT = Math.max(0, Math.min(1, 1 - absCents / 15));
    const bandColor = this._lerpColor(c.accent, c.inTune, blendT);
    const darkColor = c.surface;

    // Wrap offset within one band period for seamless looping
    const offset = ((this.strobePhase % bandWidth) + bandWidth) % bandWidth;

    ctx.save();

    // Draw bands with gradient edges for a smooth strobe look
    for (let i = -2; i < bandCount + 2; i++) {
      const x = i * bandWidth + offset;

      // Bright band
      const grad = ctx.createLinearGradient(x, 0, x + bandWidth, 0);
      grad.addColorStop(0, darkColor);
      grad.addColorStop(0.2, bandColor);
      grad.addColorStop(0.5, bandColor);
      grad.addColorStop(0.8, bandColor);
      grad.addColorStop(1, darkColor);

      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, bandWidth, h);
    }

    // Dim overlay at edges for vignette
    const edgeGrad = ctx.createLinearGradient(0, 0, w, 0);
    edgeGrad.addColorStop(0, this._withAlpha(c.surface, 0.7));
    edgeGrad.addColorStop(0.12, 'transparent');
    edgeGrad.addColorStop(0.88, 'transparent');
    edgeGrad.addColorStop(1, this._withAlpha(c.surface, 0.7));
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, w, h);

    // Center line indicator
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this._withAlpha(c.inTune, 0.5);
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction / status label
    ctx.font = `500 ${Math.max(10, w * 0.026)}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = this._withAlpha(c.textDim, 0.7);
    if (absCents < 2) {
      ctx.fillStyle = this._withAlpha(c.inTune, 0.8);
      ctx.fillText('IN TUNE', w / 2, 6);
    } else {
      const label = this.currentCents > 0 ? 'SHARP >' : '< FLAT';
      ctx.fillText(label, w / 2, 6);
    }

    ctx.restore();
  }

  // ── Color Helpers ───────────────────────────────────────────

  /** Return a CSS color string with overridden alpha. */
  _withAlpha(cssColor, alpha) {
    const rgb = this._parseColor(cssColor);
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  /** Linearly interpolate between two CSS color strings. */
  _lerpColor(a, b, t) {
    const ca = this._parseColor(a);
    const cb = this._parseColor(b);
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  /** Parse a hex or rgb() color into [r, g, b]. */
  _parseColor(color) {
    if (color.startsWith('#')) {
      const hex = color.length === 4
        ? color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
        : color.slice(1);
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    const m = color.match(/(\d+)/g);
    if (m) return [+m[0], +m[1], +m[2]];
    return [200, 200, 200]; // fallback grey
  }
}
