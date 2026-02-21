/**
 * YIN Pitch Detection Algorithm
 *
 * Implements the YIN algorithm for fundamental frequency estimation.
 * Reference: de Cheveigne, A. & Kawahara, H. (2002) "YIN, a fundamental
 * frequency estimator for speech and music."
 *
 * Pipeline: difference function -> cumulative mean normalized difference ->
 * absolute threshold -> parabolic interpolation -> median filter -> EMA smoothing
 */

export class PitchDetector {
  /**
   * @param {number} sampleRate - Audio sample rate in Hz (e.g. 44100, 48000)
   * @param {number} bufferSize - Analysis buffer size in samples (default 4096)
   */
  constructor(sampleRate, bufferSize = 4096) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.threshold = 0.2;

    // Frequency range: 50Hz (bass low B) to 2000Hz (mandolin upper range)
    this.minFrequency = 50;
    this.maxFrequency = 2000;

    // Lag bounds derived from frequency range
    this.minLag = Math.floor(sampleRate / this.maxFrequency);
    this.maxLag = Math.ceil(sampleRate / this.minFrequency);

    // Pre-allocate working buffers to avoid GC pressure in real-time path
    this._diffBuffer = new Float32Array(this.maxLag + 1);
    this._cmndfBuffer = new Float32Array(this.maxLag + 1);

    // Median filter ring buffer (9 samples)
    this._medianRingSize = 9;
    this._medianRing = new Float32Array(this._medianRingSize);
    this._medianIndex = 0;
    this._medianCount = 0;
    this._sortBuffer = new Float32Array(this._medianRingSize);

    // Adaptive EMA smoothing state
    this._smoothedFrequency = 0;
  }

  /**
   * Set the analysis buffer size. Recalculates internal lag bounds.
   * @param {number} size - New buffer size in samples
   */
  setBufferSize(size) {
    this.bufferSize = size;
    // Ensure maxLag does not exceed half the buffer (YIN requirement)
    this.maxLag = Math.min(
      Math.ceil(this.sampleRate / this.minFrequency),
      Math.floor(size / 2)
    );
    this.minLag = Math.floor(this.sampleRate / this.maxFrequency);

    // Reallocate if needed
    if (this._diffBuffer.length < this.maxLag + 1) {
      this._diffBuffer = new Float32Array(this.maxLag + 1);
      this._cmndfBuffer = new Float32Array(this.maxLag + 1);
    }
  }

  /**
   * Run YIN pitch detection on an audio buffer.
   *
   * @param {Float32Array} audioBuffer - Raw audio samples
   * @returns {{ frequency: number, confidence: number } | null}
   *   frequency in Hz, confidence 0-1 (higher = more confident), or null if
   *   no reliable pitch found.
   */
  detect(audioBuffer) {
    const size = audioBuffer.length;

    // Clamp maxLag to half the available buffer
    const effectiveMaxLag = Math.min(this.maxLag, Math.floor(size / 2));
    if (effectiveMaxLag <= this.minLag) return null;

    // Step 1: Difference function d(tau)
    this._differenceFunction(audioBuffer, size, effectiveMaxLag);

    // Step 2: Cumulative mean normalized difference d'(tau)
    this._cumulativeMeanNormalizedDifference(effectiveMaxLag);

    // Step 3: Absolute threshold - find the first lag below threshold
    const bestLag = this._absoluteThreshold(effectiveMaxLag);
    if (bestLag === -1) return null;

    // Step 4: Parabolic interpolation for sub-sample accuracy
    const refinedLag = this._parabolicInterpolation(bestLag, effectiveMaxLag);

    // Convert lag to frequency
    const rawFrequency = this.sampleRate / refinedLag;

    // Reject out-of-range results
    if (rawFrequency < this.minFrequency || rawFrequency > this.maxFrequency) {
      return null;
    }

    // Confidence: lower CMNDF value at the minimum means higher confidence
    // Map from CMNDF [0, threshold] -> confidence [1, 0]
    const cmndfValue = this._cmndfBuffer[bestLag];
    const confidence = 1 - cmndfValue;

    // Step 5: Octave jump correction
    let correctedFrequency = rawFrequency;
    if (this._smoothedFrequency > 0) {
      const ratio = rawFrequency / this._smoothedFrequency;
      if (ratio > 1.8 && ratio < 2.2) {
        correctedFrequency = rawFrequency / 2;
      }
    }

    // Step 6: Median filtering
    const medianFrequency = this._medianFilter(correctedFrequency);

    // Step 7: Adaptive EMA smoothing
    // Lower frequencies get faster tracking, higher frequencies get more smoothing
    const alpha = Math.max(0.08, Math.min(0.5, 30 / medianFrequency));

    if (this._smoothedFrequency === 0) {
      this._smoothedFrequency = medianFrequency;
    } else {
      this._smoothedFrequency =
        alpha * medianFrequency + (1 - alpha) * this._smoothedFrequency;
    }

    return {
      frequency: this._smoothedFrequency,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }

  /**
   * Step 1: Compute the difference function d(tau).
   * For each lag tau, sum the squared differences between the signal and
   * the signal shifted by tau.
   *
   * d(tau) = sum_{j=0}^{W-1} (x[j] - x[j + tau])^2
   */
  _differenceFunction(buffer, size, maxLag) {
    const diff = this._diffBuffer;
    diff[0] = 0;

    for (let tau = 1; tau <= maxLag; tau++) {
      let sum = 0;
      // Window size is the number of valid comparison samples
      const windowSize = Math.min(size - tau, maxLag);
      for (let j = 0; j < windowSize; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }
  }

  /**
   * Step 2: Cumulative mean normalized difference d'(tau).
   * Normalizes d(tau) by its running cumulative mean so the function is
   * independent of signal amplitude.
   *
   * d'(0) = 1
   * d'(tau) = d(tau) / ((1/tau) * sum_{j=1}^{tau} d(j))
   */
  _cumulativeMeanNormalizedDifference(maxLag) {
    const diff = this._diffBuffer;
    const cmndf = this._cmndfBuffer;
    cmndf[0] = 1;

    let runningSum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = runningSum > 0 ? diff[tau] * tau / runningSum : 1;
    }
  }

  /**
   * Step 3: Absolute threshold.
   * Find the first tau where d'(tau) dips below the threshold, then pick
   * the first local minimum at or after that point.
   *
   * @returns {number} Best lag index, or -1 if none found
   */
  _absoluteThreshold(maxLag) {
    const cmndf = this._cmndfBuffer;

    // Search from minLag upward for the first value below threshold
    for (let tau = this.minLag; tau < maxLag; tau++) {
      if (cmndf[tau] < this.threshold) {
        // Walk forward to find the local minimum in this valley
        while (tau + 1 < maxLag && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        return tau;
      }
    }

    return -1;
  }

  /**
   * Step 4: Parabolic interpolation around the minimum for sub-sample accuracy.
   * Fits a parabola through (tau-1, tau, tau+1) and returns the interpolated
   * minimum position.
   *
   * @param {number} tau - Integer lag at the minimum
   * @param {number} maxLag - Maximum lag searched
   * @returns {number} Refined lag estimate (fractional)
   */
  _parabolicInterpolation(tau, maxLag) {
    if (tau <= this.minLag || tau >= maxLag) return tau;

    const y0 = this._cmndfBuffer[tau - 1];
    const y1 = this._cmndfBuffer[tau];
    const y2 = this._cmndfBuffer[tau + 1];

    const denominator = 2 * (y0 - 2 * y1 + y2);
    if (denominator === 0) return tau;

    const delta = (y0 - y2) / denominator;

    // Clamp delta to prevent wild extrapolation
    return tau + Math.max(-1, Math.min(1, delta));
  }

  /**
   * Median filter using a ring buffer of recent frequency estimates.
   * Removes outlier readings by returning the median of the last N values.
   *
   * @param {number} frequency - Latest raw frequency estimate
   * @returns {number} Median-filtered frequency
   */
  _medianFilter(frequency) {
    this._medianRing[this._medianIndex] = frequency;
    this._medianIndex = (this._medianIndex + 1) % this._medianRingSize;
    this._medianCount = Math.min(this._medianCount + 1, this._medianRingSize);

    // Copy active entries into sort buffer
    const count = this._medianCount;
    for (let i = 0; i < count; i++) {
      this._sortBuffer[i] = this._medianRing[i];
    }

    // In-place insertion sort (fast for small N=9)
    for (let i = 1; i < count; i++) {
      const val = this._sortBuffer[i];
      let j = i - 1;
      while (j >= 0 && this._sortBuffer[j] > val) {
        this._sortBuffer[j + 1] = this._sortBuffer[j];
        j--;
      }
      this._sortBuffer[j + 1] = val;
    }

    const mid = Math.floor(count / 2);
    return count % 2 !== 0
      ? this._sortBuffer[mid]
      : (this._sortBuffer[mid - 1] + this._sortBuffer[mid]) / 2;
  }
}
