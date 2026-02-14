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
    low: 0.005,    // Quiet room - very sensitive, picks up soft playing
    medium: 0.015, // Normal room - balanced, good default
    high: 0.03,    // Noisy environment - requires louder signal
  };

  constructor() {
    this._threshold = NoiseGate.THRESHOLDS.medium;
    this._level = 'medium';
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
    this._threshold = threshold;
  }

  /**
   * Check if the signal RMS is above the noise gate threshold.
   * @param {number} rms - Root mean square of the audio signal
   * @returns {boolean} true if signal is loud enough to pass through
   */
  isAboveThreshold(rms) {
    return rms >= this._threshold;
  }

  /**
   * Get the current threshold value.
   * @returns {number} Current RMS threshold
   */
  getThreshold() {
    return this._threshold;
  }
}
