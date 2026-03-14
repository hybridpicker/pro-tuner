/**
 * Pro Tuner — Main Application
 *
 * Wires together all modules: audio engine, tuning data, UI components,
 * settings, and PWA features into a cohesive instrument tuner.
 */

import { PitchDetector } from './audio/pitch-detector.js';
import { NoiseGate } from './audio/noise-gate.js';
import { ToneGenerator } from './audio/tone-generator.js';
import {
  TUNINGS,
  CHROMATIC_MODE,
  getInstruments,
  getTuningsForInstrument,
  getTuningById,
  recalculateFrequencies,
  findClosestString,
  frequencyToNote,
} from './tunings/tuning-data.js';
import { MeterDisplay } from './ui/meter.js';
import { StringDisplay } from './ui/string-display.js';
import { ThemeManager } from './ui/theme.js';
import { Settings } from './utils/settings.js';

// ──────────────────────────────────────────────────────────────
//  DOM references
// ──────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  powerBtn:         $('powerBtn'),
  detectedNote:     $('detectedNote'),
  detectedOctave:   $('detectedOctave'),
  frequency:        $('frequency'),
  cents:            $('cents'),
  meterCanvas:      $('meterCanvas'),
  inputLevel:       $('inputLevel'),
  instrumentSel:    $('instrumentSelector'),
  tuningSel:        $('tuningSelector'),
  stringDisplay:    $('stringDisplay'),
  stringHint:       $('stringHint'),
  status:           $('status'),
  selectorToggle:   $('selectorToggle'),
  selectorPanel:    $('selectorPanel'),
  selectorLabel:    $('selectorLabel'),
};

// ──────────────────────────────────────────────────────────────
//  Module instances
// ──────────────────────────────────────────────────────────────

const settings     = new Settings();
const theme        = new ThemeManager();
const meter        = new MeterDisplay(els.meterCanvas);
const stringDisplay = new StringDisplay(els.stringDisplay);
const noiseGate    = new NoiseGate();

let toneGenerator  = null; // Created lazily when AudioContext exists
let pitchDetector  = null; // Created when tuner starts

// ──────────────────────────────────────────────────────────────
//  State
// ──────────────────────────────────────────────────────────────

let audioContext    = null;
let mediaStream     = null;
let workletNode     = null;
let scriptProcessor = null;
let analyser        = null;
let sourceNode      = null;
let isRunning       = false;
let wakeLock        = null;

let currentInstrument = settings.get('lastInstrument');
let currentTuningId   = settings.get('lastTuning');
let currentTuning     = null;  // Resolved tuning object (with adjusted freqs)
let adjustedTunings   = null;  // All tunings recalculated for current A4

// In-tune confirmation state
let inTuneStartTime   = 0;
let inTuneConfirmed   = false;

// ──────────────────────────────────────────────────────────────
//  Initialization
// ──────────────────────────────────────────────────────────────

function init() {
  theme.init();
  settings.initPanel();
  rebuildAdjustedTunings();
  renderInstrumentSelector();
  selectInstrument(currentInstrument, false);
  selectTuning(currentTuningId, false);

  // Settings listeners
  settings.onChange('a4Reference', () => {
    rebuildAdjustedTunings();
    reselectCurrentTuning();
  });
  settings.onChange('meterStyle', (val) => meter.setMode(val));
  settings.onChange('sensitivity', (val) => noiseGate.setSensitivity(val));
  settings.onChange('notation', () => updateNoteDisplay());

  // Apply stored settings
  meter.setMode(settings.get('meterStyle'));
  noiseGate.setSensitivity(settings.get('sensitivity'));

  // Power button
  els.powerBtn.addEventListener('click', toggleTuner);

  // Keyboard shortcut: Space toggles tuner (when not focused on input)
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      toggleTuner();
    }
  });

  // Selector collapse toggle
  els.selectorToggle.addEventListener('click', () => {
    const expanded = els.selectorToggle.getAttribute('aria-expanded') === 'true';
    els.selectorToggle.setAttribute('aria-expanded', String(!expanded));
    if (expanded) {
      els.selectorPanel.setAttribute('hidden', '');
    } else {
      els.selectorPanel.removeAttribute('hidden');
    }
  });

  // String card click → play reference tone
  stringDisplay.onClick((str) => {
    if (!audioContext) {
      audioContext = createAudioContext();
    }
    if (!toneGenerator) {
      toneGenerator = new ToneGenerator(audioContext);
    }
    if (toneGenerator.isPlaying()) {
      toneGenerator.stop();
    } else {
      toneGenerator.play(str.freq);
    }
  });

  // Window resize
  window.addEventListener('resize', () => {
    meter.resize();
  });

  // Register service worker
  registerServiceWorker();

  setStatus('Press power to start', '');
}

// ──────────────────────────────────────────────────────────────
//  Tuning data helpers
// ──────────────────────────────────────────────────────────────

function rebuildAdjustedTunings() {
  const a4 = settings.get('a4Reference');
  if (a4 === 440) {
    adjustedTunings = TUNINGS;
  } else {
    adjustedTunings = recalculateFrequencies(a4);
  }
}

function getAdjustedTuning(id) {
  if (id === 'chromatic') return CHROMATIC_MODE;
  return adjustedTunings.find(t => t.id === id) || adjustedTunings[0];
}

function reselectCurrentTuning() {
  selectTuning(currentTuningId, false);
}

// ──────────────────────────────────────────────────────────────
//  Instrument & Tuning selectors
// ──────────────────────────────────────────────────────────────

function renderInstrumentSelector() {
  els.instrumentSel.innerHTML = '';
  const instruments = getInstruments();

  // Add Chromatic as first option
  const chromBtn = createSelectorButton('Chromatic', 'chromatic', currentInstrument === 'chromatic');
  chromBtn.addEventListener('click', () => selectInstrument('chromatic'));
  els.instrumentSel.appendChild(chromBtn);

  for (const inst of instruments) {
    const label = inst.charAt(0).toUpperCase() + inst.slice(1);
    const btn = createSelectorButton(label, inst, inst === currentInstrument);
    btn.addEventListener('click', () => selectInstrument(inst));
    els.instrumentSel.appendChild(btn);
  }
}

function selectInstrument(instrument, save = true) {
  currentInstrument = instrument;
  if (save) settings.set('lastInstrument', instrument);

  // Update active state on instrument buttons
  for (const btn of els.instrumentSel.children) {
    btn.classList.toggle('active', btn.dataset.value === instrument);
  }

  // Render tuning selector
  renderTuningSelector(instrument);

  // Auto-select first tuning for this instrument
  if (instrument === 'chromatic') {
    selectTuning('chromatic', save);
  } else {
    const tunings = getTuningsForInstrument(instrument);
    if (tunings.length > 0) {
      // Try to restore last tuning if it matches this instrument
      const lastTuning = settings.get('lastTuning');
      const matchesInstrument = tunings.some(t => t.id === lastTuning);
      selectTuning(matchesInstrument ? lastTuning : tunings[0].id, save);
    }
  }
}

function renderTuningSelector(instrument) {
  els.tuningSel.innerHTML = '';
  if (instrument === 'chromatic') return;

  const tunings = getTuningsForInstrument(instrument);
  for (const tuning of tunings) {
    const btn = createSelectorButton(tuning.name, tuning.id, tuning.id === currentTuningId);
    btn.addEventListener('click', () => selectTuning(tuning.id));
    els.tuningSel.appendChild(btn);
  }
}

function updateSelectorLabel() {
  if (!els.selectorLabel) return;
  const instLabel = currentInstrument.charAt(0).toUpperCase() + currentInstrument.slice(1);
  const tuningLabel = currentTuning ? currentTuning.name : '';
  els.selectorLabel.textContent = tuningLabel ? `${instLabel} — ${tuningLabel}` : instLabel;
}

function selectTuning(tuningId, save = true) {
  currentTuningId = tuningId;
  if (save) settings.set('lastTuning', tuningId);

  currentTuning = getAdjustedTuning(tuningId);

  // Update active state on tuning buttons
  for (const btn of els.tuningSel.children) {
    btn.classList.toggle('active', btn.dataset.value === tuningId);
  }

  // Render string cards (or hide for chromatic)
  if (currentTuning.strings.length > 0) {
    stringDisplay.render(currentTuning);
    els.stringHint.style.display = '';
  } else {
    stringDisplay.reset();
    els.stringHint.style.display = 'none';
  }

  updateSelectorLabel();
}

function createSelectorButton(label, value, isActive) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.dataset.value = value;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', String(isActive));
  if (isActive) btn.classList.add('active');
  return btn;
}

// ──────────────────────────────────────────────────────────────
//  Audio Engine
// ──────────────────────────────────────────────────────────────

function createAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

async function toggleTuner() {
  if (isRunning) {
    stopTuner();
  } else {
    await startTuner();
  }
}

async function startTuner() {
  try {
    // Request microphone
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });

    // Create/resume AudioContext
    if (!audioContext) {
      audioContext = createAudioContext();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect(analyser);

    // Try AudioWorklet, fall back to ScriptProcessor
    const workletStarted = await tryAudioWorklet();
    if (!workletStarted) {
      startScriptProcessorFallback();
    }

    // Create tone generator if needed
    if (!toneGenerator) {
      toneGenerator = new ToneGenerator(audioContext);
    }

    // Create pitch detector for fallback path
    if (!pitchDetector) {
      pitchDetector = new PitchDetector(audioContext.sampleRate);
    }

    isRunning = true;
    inTuneStartTime = 0;
    inTuneConfirmed = false;

    els.powerBtn.classList.add('active');
    meter.start();
    setStatus('Listening — play a string', 'listening');

    // Request wake lock
    requestWakeLock();

  } catch (err) {
    console.error('Failed to start tuner:', err);
    setStatus('Microphone access denied', 'error');
  }
}

async function tryAudioWorklet() {
  try {
    await audioContext.audioWorklet.addModule('/js/audio/audio-worklet-processor.js');
    workletNode = new AudioWorkletNode(audioContext, 'pitch-processor');
    sourceNode.connect(workletNode);
    workletNode.connect(audioContext.destination);

    workletNode.port.onmessage = (event) => {
      handlePitchResult(event.data);
    };

    return true;
  } catch (err) {
    console.warn('AudioWorklet not available, using ScriptProcessor fallback:', err);
    return false;
  }
}

function startScriptProcessorFallback() {
  const bufferSize = 4096;
  scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
  analyser.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  const buffer = new Float32Array(bufferSize);

  scriptProcessor.onaudioprocess = () => {
    analyser.getFloatTimeDomainData(buffer);

    // Calculate RMS
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSq += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSq / buffer.length);

    // Run pitch detection
    const result = pitchDetector.detect(buffer);

    handlePitchResult({
      type: 'pitch',
      frequency: result ? result.frequency : 0,
      confidence: result ? result.confidence : 0,
      rms,
    });
  };
}

function stopTuner() {
  // Stop reference tone
  if (toneGenerator && toneGenerator.isPlaying()) {
    toneGenerator.stop();
  }

  // Disconnect audio nodes
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }

  isRunning = false;
  inTuneStartTime = 0;
  inTuneConfirmed = false;

  els.powerBtn.classList.remove('active');
  meter.stop();
  meter.reset();

  // Reset display
  els.detectedNote.textContent = '—';
  els.detectedOctave.textContent = '';
  els.frequency.textContent = '— Hz';
  els.cents.textContent = '— cent';
  els.cents.className = 'note-display__cents';
  els.inputLevel.style.width = '0%';
  document.querySelector('.note-display').classList.remove('in-tune');
  stringDisplay.setActive(-1);

  setStatus('Tuner off', '');
  releaseWakeLock();
}

// ──────────────────────────────────────────────────────────────
//  Pitch result handling
// ──────────────────────────────────────────────────────────────

let lastDisplayUpdate = 0;

function handlePitchResult(data) {
  if (!isRunning) return;

  const { frequency, rms } = data;

  // Update input level meter
  const levelDb = rms > 0 ? 20 * Math.log10(rms) + 60 : 0;
  const levelPct = Math.min(100, Math.max(0, levelDb * 2));
  els.inputLevel.style.width = `${levelPct}%`;

  // Noise gate check
  if (!noiseGate.isAboveThreshold(rms) || frequency <= 0) {
    return;
  }

  // Throttle display updates to ~60fps
  const now = performance.now();
  if (now - lastDisplayUpdate < 16) return;
  lastDisplayUpdate = now;

  // Apply transposition
  const transposition = settings.get('transposition');
  const displayFreq = transposition !== 0
    ? frequency * Math.pow(2, transposition / 12)
    : frequency;

  // Chromatic mode or string mode
  const useFlats = settings.get('notation') === 'flat';
  const a4 = settings.get('a4Reference');
  const noteInfo = frequencyToNote(displayFreq, a4, useFlats);

  // Update note display
  els.detectedNote.textContent = noteInfo.note;
  els.detectedOctave.textContent = noteInfo.octave;
  els.frequency.textContent = `${displayFreq.toFixed(1)} Hz`;

  let cents;

  if (currentTuning && currentTuning.strings.length > 0) {
    // String mode: find closest string
    const lockedIdx = stringDisplay.getLockedIndex();
    let matchResult;

    if (lockedIdx >= 0 && lockedIdx < currentTuning.strings.length) {
      // Quick-tune: locked to specific string
      const lockedString = currentTuning.strings[lockedIdx];
      cents = 1200 * Math.log2(displayFreq / lockedString.freq);
      matchResult = { string: lockedString, cents };
    } else {
      matchResult = findClosestString(displayFreq, currentTuning);
      cents = matchResult ? matchResult.cents : noteInfo.cents;
    }

    if (matchResult) {
      // Highlight the closest string card
      const stringIdx = currentTuning.strings.indexOf(matchResult.string);
      stringDisplay.setActive(stringIdx);
    }
  } else {
    // Chromatic mode
    cents = noteInfo.cents;
  }

  cents = Math.round(cents);

  // Update cents display
  const centsText = cents > 0 ? `+${cents} cent` : `${cents} cent`;
  els.cents.textContent = centsText;

  // Update meter
  meter.update(cents);

  // In-tune detection
  const isInTune = Math.abs(cents) < 5;
  const isVeryInTune = Math.abs(cents) < 2;

  els.cents.className = 'note-display__cents ' + (isInTune ? 'in-tune' : 'off-tune');

  const noteDisplayEl = document.querySelector('.note-display');
  noteDisplayEl.classList.toggle('in-tune', isInTune);

  // Status text
  if (isInTune) {
    setStatus('In tune', 'active');
  } else if (cents < 0) {
    setStatus('Flat — tighten string', '');
  } else {
    setStatus('Sharp — loosen string', '');
  }

  // In-tune confirmation (held ±2 cents for 1 second)
  if (isVeryInTune) {
    if (inTuneStartTime === 0) {
      inTuneStartTime = now;
    } else if (!inTuneConfirmed && now - inTuneStartTime >= 1000) {
      inTuneConfirmed = true;
      triggerInTuneConfirmation();
    }
  } else {
    inTuneStartTime = 0;
    inTuneConfirmed = false;
  }

}

function updateNoteDisplay() {
  // Called when notation preference changes — the next pitch update will use it
}

// ──────────────────────────────────────────────────────────────
//  In-tune confirmation
// ──────────────────────────────────────────────────────────────

function triggerInTuneConfirmation() {
  // Haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}

// ──────────────────────────────────────────────────────────────
//  Status bar
// ──────────────────────────────────────────────────────────────

function setStatus(text, state) {
  const bar = document.querySelector('.status-bar');
  els.status.textContent = text;
  bar.className = 'status-bar' + (state ? ` ${state}` : '');
}

// ──────────────────────────────────────────────────────────────
//  Wake Lock
// ──────────────────────────────────────────────────────────────

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    // Wake lock denied or not available
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

// Re-acquire wake lock on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning) {
    requestWakeLock();
  }
});

// ──────────────────────────────────────────────────────────────
//  Service Worker
// ──────────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app still works
    });
  }
}

// ──────────────────────────────────────────────────────────────
//  Start
// ──────────────────────────────────────────────────────────────

init();
