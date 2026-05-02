/**
 * Pro Tuner — Main Application
 *
 * Wires together all modules: audio engine, tuning data, UI components,
 * settings, and PWA features into a cohesive instrument tuner.
 */

import { PitchDetector } from './audio/pitch-detector.js?v=20260502-2';
import { NoiseGate } from './audio/noise-gate.js?v=20260502-2';
import { ToneGenerator } from './audio/tone-generator.js?v=20260502-2';
import {
  TUNINGS,
  CHROMATIC_MODE,
  getInstruments,
  getTuningsForInstrument,
  recalculateFrequencies,
  findBestStringMatch,
  frequencyToNote,
} from './tunings/tuning-data.js?v=20260502-2';
import { MeterDisplay } from './ui/meter.js?v=20260502-2';
import { StringDisplay } from './ui/string-display.js?v=20260502-2';
import { ThemeManager } from './ui/theme.js?v=20260502-2';
import { Visualizations } from './ui/waveform.js?v=20260502-2';
import { Settings } from './utils/settings.js?v=20260502-2';

const $ = (id) => document.getElementById(id);

const els = {
  powerBtn: $('powerBtn'),
  detectedNote: $('detectedNote'),
  detectedOctave: $('detectedOctave'),
  frequency: $('frequency'),
  cents: $('cents'),
  meterCanvas: $('meterCanvas'),
  inputLevel: $('inputLevel'),
  instrumentSel: $('instrumentSelector'),
  tuningSel: $('tuningSelector'),
  stringDisplay: $('stringDisplay'),
  stringHint: $('stringHint'),
  status: $('status'),
  selectorToggle: $('selectorToggle'),
  selectorPanel: $('selectorPanel'),
  selectorLabel: $('selectorLabel'),
  visualizationToggle: $('visualizationToggle'),
  visualizationPanel: $('visualizationPanel'),
  waveformCanvas: $('waveformCanvas'),
  pitchHistoryCanvas: $('pitchHistoryCanvas'),
  noteDisplay: document.querySelector('.note-display'),
};

const settings = new Settings();
const theme = new ThemeManager();
const meter = new MeterDisplay(els.meterCanvas);
const stringDisplay = new StringDisplay(els.stringDisplay);
const noiseGate = new NoiseGate();
const visualizations = new Visualizations(els.waveformCanvas, els.pitchHistoryCanvas);

let toneGenerator = null;
let pitchDetector = null;

let audioContext = null;
let mediaStream = null;
let workletNode = null;
let scriptProcessor = null;
let analyser = null;
let sourceNode = null;
let isRunning = false;
let wakeLock = null;

let currentInstrument = settings.get('lastInstrument');
let currentTuningId = settings.get('lastTuning');
let currentTuning = null;
let adjustedTunings = null;

let inTuneStartTime = 0;
let inTuneConfirmed = false;
let inTuneState = false;

let _calibrating = false;
let _calibrationSamples = [];

let lastMatchedStringNum = null;
let lastMatchedAt = 0;
let lastDisplayedFrequency = 0;
let waveformFrame = 0;
let waveformBuffer = null;

function init() {
  theme.init();
  settings.initPanel();
  rebuildAdjustedTunings();
  applyInitialRoute();
  renderInstrumentSelector();
  selectInstrument(currentInstrument, false);
  if (currentTuningId) {
    selectTuning(currentTuningId, false);
  }

  settings.onChange('a4Reference', () => {
    rebuildAdjustedTunings();
    reselectCurrentTuning();
    updateNoteDisplay();
  });
  settings.onChange('sensitivity', (val) => noiseGate.setSensitivity(val));
  settings.onChange('notation', () => updateNoteDisplay());
  noiseGate.setSensitivity(settings.get('sensitivity'));
  meter.setMode('needle');

  els.powerBtn.addEventListener('click', toggleTuner);

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      toggleTuner();
    }
  });

  els.selectorToggle.addEventListener('click', () => {
    const expanded = els.selectorToggle.getAttribute('aria-expanded') === 'true';
    setSelectorOpen(!expanded);
  });

  els.visualizationToggle.addEventListener('click', () => {
    const expanded = els.visualizationToggle.getAttribute('aria-expanded') === 'true';
    setVisualizationOpen(!expanded);
  });

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

  window.addEventListener('resize', () => {
    meter.resize();
    if (visualizations.isVisible) {
      visualizations.show();
    }
  });

  window.addEventListener('themechange', () => {
    meter.resize();
    visualizations.refreshColors();
    if (visualizations.isVisible) {
      visualizations.show();
    }
  });

  registerServiceWorker();
  setSelectorOpen(false);
  setVisualizationOpen(false);
  visualizations.show();
  visualizations.hide();
  setStatus('Press power to start', '');
}

function applyInitialRoute() {
  const params = new URLSearchParams(window.location.search);
  const requestedInstrument = params.get('instrument');
  const requestedTuning = params.get('tuning');
  const instruments = new Set(['chromatic', ...getInstruments()]);

  if (requestedInstrument && instruments.has(requestedInstrument)) {
    currentInstrument = requestedInstrument;
    currentTuningId = requestedInstrument === 'chromatic'
      ? 'chromatic'
      : getTuningsForInstrument(requestedInstrument)[0]?.id || currentTuningId;
  }

  if (!requestedTuning) return;

  if (requestedTuning === 'chromatic') {
    currentInstrument = 'chromatic';
    currentTuningId = 'chromatic';
    return;
  }

  const tuning = TUNINGS.find((item) => item.id === requestedTuning);
  if (tuning) {
    currentInstrument = tuning.instrument;
    currentTuningId = tuning.id;
  }
}

function rebuildAdjustedTunings() {
  const a4 = settings.get('a4Reference');
  adjustedTunings = a4 === 440 ? TUNINGS : recalculateFrequencies(a4);
}

function getAdjustedTuning(id) {
  if (id === 'chromatic') return CHROMATIC_MODE;
  return adjustedTunings.find((t) => t.id === id) || adjustedTunings[0];
}

function reselectCurrentTuning() {
  selectTuning(currentTuningId, false);
}

function renderInstrumentSelector() {
  els.instrumentSel.innerHTML = '';
  const instruments = getInstruments();

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

function syncSelectorButtons(container, activeValue) {
  for (const btn of container.children) {
    const isActive = btn.dataset.value === activeValue;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }
}

function selectInstrument(instrument, save = true) {
  currentInstrument = instrument;
  if (save) settings.set('lastInstrument', instrument);

  syncSelectorButtons(els.instrumentSel, instrument);
  renderTuningSelector(instrument);

  if (instrument === 'chromatic') {
    selectTuning('chromatic', save);
  } else {
    const tunings = getTuningsForInstrument(instrument);
    if (tunings.length > 0) {
      const lastTuning = currentTuningId || settings.get('lastTuning');
      const matchesInstrument = tunings.some((t) => t.id === lastTuning);
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
  const instLabel = currentInstrument.charAt(0).toUpperCase() + currentInstrument.slice(1);
  const tuningLabel = currentTuning ? currentTuning.name : '';
  els.selectorLabel.textContent = tuningLabel ? `${instLabel} — ${tuningLabel}` : instLabel;
}

function selectTuning(tuningId, save = true) {
  currentTuningId = tuningId;
  if (save) settings.set('lastTuning', tuningId);

  currentTuning = getAdjustedTuning(tuningId);
  lastMatchedStringNum = null;
  lastMatchedAt = 0;

  syncSelectorButtons(els.tuningSel, tuningId);

  if (currentTuning.strings.length > 0) {
    stringDisplay.render(currentTuning);
    els.stringHint.style.display = '';
    els.stringHint.textContent = 'Tap to hear a tone. Double-click, long-press, or press L to lock a string.';
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

function setSelectorOpen(isOpen) {
  els.selectorToggle.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    els.selectorPanel.removeAttribute('hidden');
  } else {
    els.selectorPanel.setAttribute('hidden', '');
  }
}

function setVisualizationOpen(isOpen) {
  els.visualizationToggle.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    els.visualizationPanel.removeAttribute('hidden');
    visualizations.show();
    startWaveformLoop();
  } else {
    els.visualizationPanel.setAttribute('hidden', '');
    visualizations.hide();
    stopWaveformLoop();
  }
}

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
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });

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
    waveformBuffer = new Float32Array(analyser.fftSize);

    const workletStarted = await tryAudioWorklet();
    if (!workletStarted) {
      startScriptProcessorFallback();
    }

    if (!toneGenerator) {
      toneGenerator = new ToneGenerator(audioContext);
    }

    if (!pitchDetector) {
      pitchDetector = new PitchDetector(audioContext.sampleRate);
    }

    isRunning = true;
    inTuneStartTime = 0;
    inTuneConfirmed = false;
    inTuneState = false;

    els.powerBtn.classList.add('active');
    meter.start();
    requestWakeLock();

    if (visualizations.isVisible) {
      startWaveformLoop();
    }

    await calibrateNoiseFloor();
    setStatus('Listening — play a string', 'listening');
  } catch (err) {
    console.error('Failed to start tuner:', err);
    setStatus('Microphone access denied', 'error');
  }
}

async function tryAudioWorklet() {
  try {
    await audioContext.audioWorklet.addModule('/js/audio/audio-worklet-processor.js?v=20260502-2');
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
  const bufferSize = 8192;
  scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
  analyser.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  const buffer = new Float32Array(bufferSize);
  if (!pitchDetector) {
    pitchDetector = new PitchDetector(audioContext.sampleRate, bufferSize);
  }
  pitchDetector.setBufferSize(bufferSize);

  scriptProcessor.onaudioprocess = () => {
    analyser.getFloatTimeDomainData(buffer);

    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSq += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSq / buffer.length);

    const result = pitchDetector.detect(buffer, rms);

    handlePitchResult({
      type: 'pitch',
      frequency: result ? result.frequency : 0,
      confidence: result ? result.confidence : 0,
      rms,
    });
  };
}

async function calibrateNoiseFloor() {
  _calibrating = true;
  _calibrationSamples = [];
  setStatus('Calibrating…', 'listening');

  await new Promise((resolve) => setTimeout(resolve, 300));

  _calibrating = false;
  if (_calibrationSamples.length > 0) {
    const sorted = _calibrationSamples.slice().sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    noiseGate.setThreshold(p75 * 2.5);
  }
  _calibrationSamples = [];
}

function stopTuner() {
  if (toneGenerator && toneGenerator.isPlaying()) {
    toneGenerator.stop();
  }

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
  inTuneState = false;
  lastDisplayedFrequency = 0;
  waveformBuffer = null;

  els.powerBtn.classList.remove('active');
  meter.stop();
  meter.reset();

  els.detectedNote.textContent = '—';
  els.detectedOctave.textContent = '';
  els.frequency.textContent = '— Hz';
  els.cents.textContent = '— cent';
  els.cents.className = 'note-display__cents';
  els.inputLevel.style.width = '0%';
  els.noteDisplay.classList.remove('in-tune');
  stringDisplay.setActive(-1);
  lastMatchedStringNum = null;
  lastMatchedAt = 0;

  stopWaveformLoop();
  visualizations.pitchHistory.length = 0;
  if (visualizations.isVisible) {
    visualizations.show();
  }

  setStatus('Tuner off', '');
  releaseWakeLock();
}

function startWaveformLoop() {
  if (waveformFrame || !visualizations.isVisible) return;

  const draw = () => {
    waveformFrame = 0;
    if (!visualizations.isVisible) return;

    if (analyser && waveformBuffer) {
      analyser.getFloatTimeDomainData(waveformBuffer);
      visualizations.updateWaveform(waveformBuffer);
    }

    waveformFrame = requestAnimationFrame(draw);
  };

  waveformFrame = requestAnimationFrame(draw);
}

function stopWaveformLoop() {
  if (waveformFrame) {
    cancelAnimationFrame(waveformFrame);
    waveformFrame = 0;
  }
}

let lastDisplayUpdate = 0;

function resolveTuningMatch(frequency) {
  if (!currentTuning || currentTuning.strings.length === 0) return null;

  const lockedIdx = stringDisplay.getLockedIndex();
  if (lockedIdx >= 0 && lockedIdx < currentTuning.strings.length) {
    const lockedString = currentTuning.strings[lockedIdx];
    return {
      string: lockedString,
      cents: 1200 * Math.log2(frequency / lockedString.freq),
      correctedFrequency: frequency,
      octaveShift: 0,
    };
  }

  const isGuitar = currentTuning.instrument === 'guitar';
  const preferredString = performance.now() - lastMatchedAt < 1500 ? lastMatchedStringNum : null;

  const match = findBestStringMatch(frequency, currentTuning, {
    preferredString,
    allowOctaveCorrection: isGuitar,
  });

  if (!match) return null;

  const rawCents = 1200 * Math.log2(frequency / match.string.freq);
  const correctedWinsClearly =
    match.octaveShift !== 0 && Math.abs(match.cents) + 20 < Math.abs(rawCents);
  const closeEnough = Math.abs(match.cents) <= (isGuitar ? 65 : 50);

  return closeEnough || correctedWinsClearly ? match : null;
}

function handlePitchResult(data) {
  if (!isRunning) return;

  const { frequency, rms, confidence } = data;

  const levelDb = rms > 0 ? 20 * Math.log10(rms) + 60 : 0;
  const levelPct = Math.min(100, Math.max(0, levelDb * 2));
  els.inputLevel.style.width = `${levelPct}%`;

  if (_calibrating) {
    if (rms > 0) _calibrationSamples.push(rms);
    return;
  }

  if (!noiseGate.isAboveThreshold(rms) || frequency <= 0) {
    return;
  }

  if (confidence < 0.25) return;

  const now = performance.now();
  if (now - lastDisplayUpdate < 16) return;
  lastDisplayUpdate = now;

  const transposition = settings.get('transposition');
  const rawDisplayFreq = transposition !== 0
    ? frequency * Math.pow(2, transposition / 12)
    : frequency;

  let cents;
  let displayFreq = rawDisplayFreq;
  let noteInfo;
  const useFlats = settings.get('notation') === 'flat';
  const a4 = settings.get('a4Reference');

  if (currentTuning && currentTuning.strings.length > 0) {
    const matchResult = resolveTuningMatch(rawDisplayFreq);

    if (matchResult) {
      displayFreq = matchResult.correctedFrequency;
      noteInfo = frequencyToNote(displayFreq, a4, useFlats);
      cents = matchResult.cents;
      lastMatchedStringNum = matchResult.string.stringNum;
      lastMatchedAt = now;

      const stringIdx = currentTuning.strings.indexOf(matchResult.string);
      stringDisplay.setActive(stringIdx);
    } else {
      noteInfo = frequencyToNote(rawDisplayFreq, a4, useFlats);
      cents = noteInfo.cents;
      stringDisplay.setActive(-1);
      lastMatchedStringNum = null;
      lastMatchedAt = 0;
    }
  } else {
    noteInfo = frequencyToNote(rawDisplayFreq, a4, useFlats);
    cents = noteInfo.cents;
    lastMatchedStringNum = null;
    lastMatchedAt = 0;
  }

  els.detectedNote.textContent = noteInfo.note;
  els.detectedOctave.textContent = noteInfo.octave;
  els.frequency.textContent = `${displayFreq.toFixed(1)} Hz`;
  lastDisplayedFrequency = displayFreq;

  cents = Math.round(cents);
  els.cents.textContent = cents > 0 ? `+${cents} cent` : `${cents} cent`;

  meter.update(cents);

  const absCents = Math.abs(cents);
  if (!inTuneState && absCents < 5) inTuneState = true;
  else if (inTuneState && absCents >= 8) inTuneState = false;

  const isVeryInTune = absCents < 2;
  els.cents.className = 'note-display__cents ' + (inTuneState ? 'in-tune' : 'off-tune');
  els.noteDisplay.classList.toggle('in-tune', inTuneState);

  if (inTuneState) {
    setStatus('In tune', 'active');
  } else if (cents < 0) {
    setStatus('Flat — tighten string', '');
  } else {
    setStatus('Sharp — loosen string', '');
  }

  if (visualizations.isVisible) {
    visualizations.updatePitchHistory(displayFreq, now);
  }

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
  if (!lastDisplayedFrequency) return;
  const useFlats = settings.get('notation') === 'flat';
  const a4 = settings.get('a4Reference');
  const noteInfo = frequencyToNote(lastDisplayedFrequency, a4, useFlats);
  els.detectedNote.textContent = noteInfo.note;
  els.detectedOctave.textContent = noteInfo.octave;
}

function triggerInTuneConfirmation() {
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}

function setStatus(text, state) {
  const bar = document.querySelector('.status-bar');
  els.status.textContent = text;
  bar.className = 'status-bar' + (state ? ` ${state}` : '');
}

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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning) {
    requestWakeLock();
  }
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // SW registration failed — app still works
    });
  }
}

init();
