/**
 * AudioWorklet Processor for real-time pitch detection.
 *
 * Runs on the audio rendering thread to avoid main-thread blocking.
 * Accumulates incoming audio samples into an analysis buffer, runs
 * YIN pitch detection when the buffer is full, and posts results
 * back to the main thread via MessagePort.
 *
 * Message format posted to main thread:
 *   { type: 'pitch', frequency: number, confidence: number, rms: number }
 */

// --- Inline YIN implementation for the worklet scope ---
// AudioWorklet processors cannot import ES modules, so the YIN algorithm
// is implemented directly within this file.

/**
 * Compute the difference function d(tau).
 * @param {Float32Array} buffer - Audio samples
 * @param {Float32Array} diff - Pre-allocated output buffer
 * @param {number} maxLag - Maximum lag to compute
 */
function differenceFunction(buffer, diff, maxLag) {
  const size = buffer.length;
  diff[0] = 0;

  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    const windowSize = Math.min(size - tau, maxLag);
    for (let j = 0; j < windowSize; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
}

/**
 * Compute cumulative mean normalized difference d'(tau).
 * @param {Float32Array} diff - Difference function values
 * @param {Float32Array} cmndf - Pre-allocated output buffer
 * @param {number} maxLag - Maximum lag
 */
function cumulativeMeanNormalizedDifference(diff, cmndf, maxLag) {
  cmndf[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= maxLag; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = runningSum > 0 ? diff[tau] * tau / runningSum : 1;
  }
}

/**
 * Find the first lag below threshold, then walk to the local minimum.
 * @param {Float32Array} cmndf - Normalized difference values
 * @param {number} minLag - Minimum lag (from max frequency)
 * @param {number} maxLag - Maximum lag (from min frequency)
 * @param {number} threshold - Absolute threshold
 * @returns {number} Best lag index, or -1 if not found
 */
function absoluteThreshold(cmndf, minLag, maxLag, threshold) {
  for (let tau = minLag; tau < maxLag; tau++) {
    if (cmndf[tau] < threshold) {
      // Walk forward to find the local minimum
      while (tau + 1 < maxLag && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      return tau;
    }
  }
  return -1;
}

/**
 * Parabolic interpolation for sub-sample accuracy.
 * @param {Float32Array} cmndf - Normalized difference values
 * @param {number} tau - Integer lag at minimum
 * @param {number} minLag - Minimum valid lag
 * @param {number} maxLag - Maximum valid lag
 * @returns {number} Refined fractional lag
 */
function parabolicInterpolation(cmndf, tau, minLag, maxLag) {
  if (tau <= minLag || tau >= maxLag) return tau;

  const y0 = cmndf[tau - 1];
  const y1 = cmndf[tau];
  const y2 = cmndf[tau + 1];

  const denominator = 2 * (y0 - 2 * y1 + y2);
  if (denominator === 0) return tau;

  const delta = (y0 - y2) / denominator;
  return tau + Math.max(-1, Math.min(1, delta));
}

// --- Processor ---

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Detection parameters
    this.threshold = 0.15;
    this.minFrequency = 50;
    this.maxFrequency = 2000;

    // Adaptive buffer: start with large buffer for low frequency detection
    this.analysisBufferSize = 8192;
    this.analysisBuffer = new Float32Array(this.analysisBufferSize);
    this.writeIndex = 0;

    // Pre-allocated YIN working buffers (sized for max possible lag)
    const maxPossibleLag = Math.ceil(sampleRate / this.minFrequency) + 1;
    this._diffBuffer = new Float32Array(maxPossibleLag);
    this._cmndfBuffer = new Float32Array(maxPossibleLag);

    // Lag bounds
    this.minLag = Math.floor(sampleRate / this.maxFrequency);
    this.maxLag = Math.ceil(sampleRate / this.minFrequency);

    // Track last detected frequency for adaptive buffer switching
    this._lastFrequency = 0;

    // Listen for configuration messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'config') {
        if (event.data.threshold !== undefined) {
          this.threshold = event.data.threshold;
        }
      }
    };
  }

  /**
   * Adjust analysis buffer size based on detected frequency.
   * Low frequencies need larger buffers for at least 2 full cycles.
   * @param {number} frequency - Last detected frequency
   */
  _adaptBufferSize(frequency) {
    // Use 8192 for frequencies below 200Hz, 4096 for higher
    const newSize = frequency > 0 && frequency >= 200 ? 4096 : 8192;

    if (newSize !== this.analysisBufferSize) {
      this.analysisBufferSize = newSize;
      this.analysisBuffer = new Float32Array(newSize);
      this.writeIndex = 0;
    }
  }

  /**
   * AudioWorkletProcessor.process() - called for each render quantum (128 samples).
   * Accumulates samples, runs detection when buffer is full.
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Accumulate samples into analysis buffer
    for (let i = 0; i < channelData.length; i++) {
      this.analysisBuffer[this.writeIndex++] = channelData[i];
    }

    // Calculate RMS for the current quantum (for input level meter)
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }

    // When the analysis buffer is full, run pitch detection
    if (this.writeIndex >= this.analysisBufferSize) {
      // Compute RMS over the full analysis buffer
      let fullSumSquares = 0;
      for (let i = 0; i < this.analysisBufferSize; i++) {
        fullSumSquares += this.analysisBuffer[i] * this.analysisBuffer[i];
      }
      const rms = Math.sqrt(fullSumSquares / this.analysisBufferSize);

      // Run YIN detection
      const result = this._detectPitch();

      if (result) {
        this._lastFrequency = result.frequency;

        this.port.postMessage({
          type: 'pitch',
          frequency: result.frequency,
          confidence: result.confidence,
          rms: rms,
        });
      } else {
        // No pitch detected - still send RMS for level meter
        this.port.postMessage({
          type: 'pitch',
          frequency: 0,
          confidence: 0,
          rms: rms,
        });
      }

      // Adapt buffer size for next analysis cycle
      this._adaptBufferSize(this._lastFrequency);

      // Reset write position
      this.writeIndex = 0;
    }

    // Keep processor alive
    return true;
  }

  /**
   * Run YIN pitch detection on the current analysis buffer.
   * @returns {{ frequency: number, confidence: number } | null}
   */
  _detectPitch() {
    const buffer = this.analysisBuffer;
    const size = this.analysisBufferSize;

    // Clamp max lag to half the buffer
    const effectiveMaxLag = Math.min(this.maxLag, Math.floor(size / 2));
    if (effectiveMaxLag <= this.minLag) return null;

    // Step 1: Difference function
    differenceFunction(buffer, this._diffBuffer, effectiveMaxLag);

    // Step 2: Cumulative mean normalized difference
    cumulativeMeanNormalizedDifference(
      this._diffBuffer,
      this._cmndfBuffer,
      effectiveMaxLag
    );

    // Step 3: Absolute threshold
    const bestLag = absoluteThreshold(
      this._cmndfBuffer,
      this.minLag,
      effectiveMaxLag,
      this.threshold
    );
    if (bestLag === -1) return null;

    // Step 4: Parabolic interpolation
    const refinedLag = parabolicInterpolation(
      this._cmndfBuffer,
      bestLag,
      this.minLag,
      effectiveMaxLag
    );

    // Convert to frequency
    const frequency = sampleRate / refinedLag;

    // Reject out-of-range
    if (frequency < this.minFrequency || frequency > this.maxFrequency) {
      return null;
    }

    // Confidence from CMNDF value (lower = more confident)
    const confidence = Math.max(0, Math.min(1, 1 - this._cmndfBuffer[bestLag]));

    return { frequency, confidence };
  }
}

registerProcessor('pitch-processor', PitchProcessor);
