// tuning-data.js — All instrument tunings and helpers for Pro Tuner
// Frequencies are A4=440Hz equal temperament: freq = 440 * 2^((midi - 69) / 12)

// ---------------------------------------------------------------------------
// Note name tables
// ---------------------------------------------------------------------------

export const NOTE_NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NOTE_NAMES_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// ---------------------------------------------------------------------------
// MIDI helper — convert note name + octave to MIDI number
// ---------------------------------------------------------------------------

const SEMITONE_MAP = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11,
};

function midiNumber(note, octave) {
  return (octave + 1) * 12 + SEMITONE_MAP[note];
}

function midiToFreq(midi) {
  return +(440 * Math.pow(2, (midi - 69) / 12)).toFixed(2);
}

// Build a string entry: { name, note, octave, freq, stringNum }
function s(note, octave, stringNum) {
  const displayNote = note.replace('#', '♯').replace('b', '♭');
  return {
    name: `${displayNote}${octave}`,
    note: displayNote,
    octave,
    freq: midiToFreq(midiNumber(note, octave)),
    stringNum,
  };
}

// ---------------------------------------------------------------------------
// Tuning definitions
// ---------------------------------------------------------------------------

export const TUNINGS = [

  // ---- Guitar 6-string ----
  {
    id: 'guitar-standard',
    instrument: 'guitar',
    name: 'Standard',
    strings: [
      s('E', 2, 6),
      s('A', 2, 5),
      s('D', 3, 4),
      s('G', 3, 3),
      s('B', 3, 2),
      s('E', 4, 1),
    ],
  },
  {
    id: 'guitar-drop-d',
    instrument: 'guitar',
    name: 'Drop D',
    strings: [
      s('D', 2, 6),
      s('A', 2, 5),
      s('D', 3, 4),
      s('G', 3, 3),
      s('B', 3, 2),
      s('E', 4, 1),
    ],
  },
  {
    id: 'guitar-drop-c',
    instrument: 'guitar',
    name: 'Drop C',
    strings: [
      s('C', 2, 6),
      s('G', 2, 5),
      s('C', 3, 4),
      s('F', 3, 3),
      s('A', 3, 2),
      s('D', 4, 1),
    ],
  },
  {
    id: 'guitar-drop-b',
    instrument: 'guitar',
    name: 'Drop B',
    strings: [
      s('B', 1, 6),
      s('F#', 2, 5),
      s('B', 2, 4),
      s('E', 3, 3),
      s('G#', 3, 2),
      s('C#', 4, 1),
    ],
  },
  {
    id: 'guitar-open-g',
    instrument: 'guitar',
    name: 'Open G',
    strings: [
      s('D', 2, 6),
      s('G', 2, 5),
      s('D', 3, 4),
      s('G', 3, 3),
      s('B', 3, 2),
      s('D', 4, 1),
    ],
  },
  {
    id: 'guitar-open-d',
    instrument: 'guitar',
    name: 'Open D',
    strings: [
      s('D', 2, 6),
      s('A', 2, 5),
      s('D', 3, 4),
      s('F#', 3, 3),
      s('A', 3, 2),
      s('D', 4, 1),
    ],
  },
  {
    id: 'guitar-open-e',
    instrument: 'guitar',
    name: 'Open E',
    strings: [
      s('E', 2, 6),
      s('B', 2, 5),
      s('E', 3, 4),
      s('G#', 3, 3),
      s('B', 3, 2),
      s('E', 4, 1),
    ],
  },
  {
    id: 'guitar-open-a',
    instrument: 'guitar',
    name: 'Open A',
    strings: [
      s('E', 2, 6),
      s('A', 2, 5),
      s('E', 3, 4),
      s('A', 3, 3),
      s('C#', 4, 2),
      s('E', 4, 1),
    ],
  },
  {
    id: 'guitar-dadgad',
    instrument: 'guitar',
    name: 'DADGAD',
    strings: [
      s('D', 2, 6),
      s('A', 2, 5),
      s('D', 3, 4),
      s('G', 3, 3),
      s('A', 3, 2),
      s('D', 4, 1),
    ],
  },
  {
    id: 'guitar-half-step-down',
    instrument: 'guitar',
    name: 'Half Step Down (E♭)',
    strings: [
      s('Eb', 2, 6),
      s('Ab', 2, 5),
      s('Db', 3, 4),
      s('Gb', 3, 3),
      s('Bb', 3, 2),
      s('Eb', 4, 1),
    ],
  },
  {
    id: 'guitar-full-step-down',
    instrument: 'guitar',
    name: 'Full Step Down (D)',
    strings: [
      s('D', 2, 6),
      s('G', 2, 5),
      s('C', 3, 4),
      s('F', 3, 3),
      s('A', 3, 2),
      s('D', 4, 1),
    ],
  },

  // ---- Bass Guitar ----
  {
    id: 'bass-standard',
    instrument: 'bass',
    name: 'Standard (4-string)',
    strings: [
      s('E', 1, 4),
      s('A', 1, 3),
      s('D', 2, 2),
      s('G', 2, 1),
    ],
  },
  {
    id: 'bass-5-string',
    instrument: 'bass',
    name: 'Standard (5-string)',
    strings: [
      s('B', 0, 5),
      s('E', 1, 4),
      s('A', 1, 3),
      s('D', 2, 2),
      s('G', 2, 1),
    ],
  },
  {
    id: 'bass-drop-d',
    instrument: 'bass',
    name: 'Drop D',
    strings: [
      s('D', 1, 4),
      s('A', 1, 3),
      s('D', 2, 2),
      s('G', 2, 1),
    ],
  },

  // ---- Ukulele ----
  {
    id: 'ukulele-standard',
    instrument: 'ukulele',
    name: 'Standard (GCEA)',
    strings: [
      s('G', 4, 4),
      s('C', 4, 3),
      s('E', 4, 2),
      s('A', 4, 1),
    ],
  },
  {
    id: 'ukulele-low-g',
    instrument: 'ukulele',
    name: 'Low G',
    strings: [
      s('G', 3, 4),
      s('C', 4, 3),
      s('E', 4, 2),
      s('A', 4, 1),
    ],
  },
  {
    id: 'ukulele-baritone',
    instrument: 'ukulele',
    name: 'Baritone (DGBE)',
    strings: [
      s('D', 3, 4),
      s('G', 3, 3),
      s('B', 3, 2),
      s('E', 4, 1),
    ],
  },

  // ---- Violin ----
  {
    id: 'violin-standard',
    instrument: 'violin',
    name: 'Standard',
    strings: [
      s('G', 3, 4),
      s('D', 4, 3),
      s('A', 4, 2),
      s('E', 5, 1),
    ],
  },

  // ---- Viola ----
  {
    id: 'viola-standard',
    instrument: 'viola',
    name: 'Standard',
    strings: [
      s('C', 3, 4),
      s('G', 3, 3),
      s('D', 4, 2),
      s('A', 4, 1),
    ],
  },

  // ---- Banjo ----
  {
    id: 'banjo-open-g',
    instrument: 'banjo',
    name: 'Open G',
    strings: [
      s('G', 4, 5),
      s('D', 3, 4),
      s('G', 3, 3),
      s('B', 3, 2),
      s('D', 4, 1),
    ],
  },
];

// ---------------------------------------------------------------------------
// Chromatic mode (no specific strings — used for free-pitch detection)
// ---------------------------------------------------------------------------

export const CHROMATIC_MODE = {
  id: 'chromatic',
  instrument: 'any',
  name: 'Chromatic',
  strings: [],
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Get the list of all distinct instrument names. */
export function getInstruments() {
  const set = new Set(TUNINGS.map(t => t.instrument));
  return [...set];
}

/** Get every tuning entry for a given instrument. */
export function getTuningsForInstrument(instrument) {
  return TUNINGS.filter(t => t.instrument === instrument);
}

/** Look up a single tuning by its unique id. */
export function getTuningById(id) {
  if (id === 'chromatic') return CHROMATIC_MODE;
  return TUNINGS.find(t => t.id === id) || null;
}

/**
 * Return a deep copy of all tunings with frequencies recalculated
 * for a different A4 reference pitch.
 *
 * Formula: newFreq = originalFreq * (a4Reference / 440)
 */
export function recalculateFrequencies(a4Reference) {
  const ratio = a4Reference / 440;
  return TUNINGS.map(tuning => ({
    ...tuning,
    strings: tuning.strings.map(str => ({
      ...str,
      freq: +(str.freq * ratio).toFixed(2),
    })),
  }));
}

/**
 * Find the closest string in a tuning to a given frequency.
 * Returns { string, cents } where cents is the deviation.
 */
export function findClosestString(frequency, tuning) {
  if (!tuning.strings.length) return null;

  let closest = null;
  let minAbsCents = Infinity;

  for (const str of tuning.strings) {
    const cents = 1200 * Math.log2(frequency / str.freq);
    if (Math.abs(cents) < minAbsCents) {
      minAbsCents = Math.abs(cents);
      closest = { string: str, cents };
    }
  }

  return closest;
}

/**
 * Convert an arbitrary frequency to the nearest chromatic note.
 * Returns { note, octave, cents, frequency }.
 */
export function frequencyToNote(frequency, a4 = 440, useFlats = false) {
  const noteNames = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const semitonesFromA4 = 12 * Math.log2(frequency / a4);
  const roundedSemitones = Math.round(semitonesFromA4);
  const cents = +((semitonesFromA4 - roundedSemitones) * 100).toFixed(1);

  // MIDI note 69 = A4
  const midi = 69 + roundedSemitones;
  const note = noteNames[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;

  return { note, octave, cents, frequency };
}
