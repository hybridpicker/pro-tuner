/**
 * ToneGenerator - Reference tone playback using Web Audio API.
 * Produces clean sine wave tones with smooth ADSR envelope to avoid clicks.
 */
export class ToneGenerator {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.oscillator = null;
    this.gainNode = null;
    this.volume = 0.3;
    this._playing = false;
    this._releaseTimer = null;
  }

  /**
   * Play a sine wave at the given frequency.
   * If already playing, smoothly transitions to the new frequency.
   * If not playing, creates a new oscillator with a gentle attack envelope.
   */
  async play(frequency) {
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const now = this.audioContext.currentTime;

    // If currently playing, smoothly ramp to the new frequency
    if (this._playing && this.oscillator) {
      // Cancel any pending release fade
      if (this._releaseTimer) {
        clearTimeout(this._releaseTimer);
        this._releaseTimer = null;
      }
      // Smooth frequency transition (~60ms time constant)
      this.oscillator.frequency.setTargetAtTime(frequency, now, 0.06);
      return;
    }

    // Create fresh gain node and oscillator
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.connect(this.audioContext.destination);

    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.setValueAtTime(frequency, now);
    this.oscillator.connect(this.gainNode);
    this.oscillator.start(now);

    // Attack ramp: fade in over ~20ms
    this.gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.02);

    this._playing = true;
  }

  /**
   * Stop the tone with a gentle release to avoid clicks.
   * Fades gain to 0 over ~100ms, then disconnects and cleans up.
   */
  stop() {
    if (!this._playing || !this.gainNode || !this.oscillator) {
      return;
    }

    // Cancel any previously scheduled release
    if (this._releaseTimer) {
      clearTimeout(this._releaseTimer);
      this._releaseTimer = null;
    }

    const now = this.audioContext.currentTime;

    // Cancel any scheduled gain changes, then release over ~100ms
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

    // Hold references for cleanup in the timer callback
    const osc = this.oscillator;
    const gain = this.gainNode;

    this._releaseTimer = setTimeout(() => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
      this._releaseTimer = null;
    }, 120); // slightly longer than the 100ms fade

    this.oscillator = null;
    this.gainNode = null;
    this._playing = false;
  }

  /**
   * Set playback volume (0.0 - 1.0).
   * Applies immediately if a tone is currently playing.
   */
  setVolume(level) {
    this.volume = Math.max(0, Math.min(1, level));

    if (this._playing && this.gainNode) {
      const now = this.audioContext.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.02);
    }
  }

  /**
   * Returns true if a tone is currently playing.
   */
  isPlaying() {
    return this._playing;
  }

  /**
   * Clean up all audio resources.
   */
  destroy() {
    if (this._releaseTimer) {
      clearTimeout(this._releaseTimer);
      this._releaseTimer = null;
    }

    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (_) {
        // Oscillator may already be stopped
      }
      this.oscillator = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    this._playing = false;
  }
}
