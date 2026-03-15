/**
 * RMS-based Noise Gate
 *
 * Filters out background noise by comparing the input signal RMS level
 * against a configurable threshold. Provides three sensitivity presets
 * for different recording environments.
 */

export class NoiseGate {
  /** Threshold presets (RMS values) for different environments */
  static THRESHOLDS = {
    low: 0.002,    // Quiet room - very sensitive, picks up soft playing
    medium: 0.008, // Normal room - balanced, good default
    high: 0.02,    // Noisy environment - requires louder signal
  };

  constructor() {
    this._presetThreshold = NoiseGate.THRESHOLDS.medium;
    this._threshold = NoiseGate.THRESHOLDS.medium;
    this._level = 'medium';
    this._holdUntil = 0; // timestamp for 150ms hold-open after signal drops
  }

  /**
   * Set the noise gate sensitivity level.
   * @param {'low' | 'medium' | 'high'} level - Sensitivity preset name
   */
  setSensitivity(level) {
    const threshold = NoiseGate.THRESHOLDS[level];
    if (threshold === undefined) {
      throw new Error(
        `Unknown sensitivity level "${level}". Use "low", "medium", or "high".`
      );
    }
    this._level = level;
    this._presetThreshold = threshold;
    this._threshold = threshold;
    this._holdUntil = 0;
  }

  /**
   * Override the noise floor threshold (e.g. from auto-calibration).
   * Never goes below the user's preset threshold.
   * @param {number} value - RMS threshold value
   */
  setThreshold(value) {
    this._threshold = Math.max(this._presetThreshold, value);
    this._holdUntil = 0;
  }

  /**
   * Check if the signal RMS is above the noise gate threshold.
   * Holds the gate open for 150ms after the signal drops below threshold
   * to prevent sustain dropout during natural note decay.
   * @param {number} rms - Root mean square of the audio signal
   * @returns {boolean} true if signal is loud enough to pass through
   */
  isAboveThreshold(rms) {
    const now = performance.now();
    if (rms >= this._threshold) {
      this._holdUntil = now + 150;
      return true;
    }
    return now < this._holdUntil;
  }

  /**
   * Get the current threshold value.
   * @returns {number} Current RMS threshold
   */
  getThreshold() {
    return this._threshold;
  }
}
