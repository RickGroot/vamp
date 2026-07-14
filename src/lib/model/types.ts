// Core data model for a Vamp progression.
//
// Design notes:
// - A chord is stored as the *literal symbol string* the user typed (e.g. "Cmaj7").
//   It is the source of truth and is re-parsed with `tonal` at play/render time, so
//   there is no parsed cache to go stale across save/load.
// - Durations are expressed in *beats*, so a half-bar is just `beats: 2` and any
//   future subdivision (quarter-bar, triplets, ...) is free without a schema change.

export type SchemaVersion = 1;

export const CURRENT_SCHEMA_VERSION: SchemaVersion = 1;

export type InstrumentId = 'piano' | 'guitar' | 'rhodes' | 'pad';

export type CompPattern = 'block' | 'strum' | 'arpeggio';

export type DrumStyle = 'none' | 'rock' | 'pop' | 'swing' | 'bossa';

/**
 * Bass accompaniment style:
 * - `none`    — no bass
 * - `root`    — root note on strong beats (simple)
 * - `alt`     — alternating root / fifth (boom-chuck)
 * - `walking` — quarter-note line stepping through chord tones into the next root
 * - `octaves` — root jumping octaves on every beat
 */
export type BassMode = 'none' | 'root' | 'alt' | 'walking' | 'octaves';

/**
 * Which sound the bass line uses:
 * - `keys`     — the chord instrument (the original shared-instrument behaviour)
 * - `upright`  — acoustic/double bass (jazz upright)
 * - `electric` — fingered electric bass
 * - `synth`    — synth bass
 */
export type BassInstrumentId = 'keys' | 'upright' | 'electric' | 'synth';

/** How chords are rhythmically realised during playback. */
export interface Groove {
	pattern: CompPattern;
	/** Bass accompaniment style ('none' = no bass). */
	bass: BassMode;
	/** Which sound the bass line plays through. */
	bassInstrument: BassInstrumentId;
	/** Click on each beat (accented downbeat). */
	metronome: boolean;
	/** A real drum-kit pattern (or 'none'). */
	drums: DrumStyle;
}

export interface TimeSignature {
	/** Beats per bar, e.g. 4 (the "3" in 3/4). */
	numerator: number;
	/** Beat unit, e.g. 4 = quarter note, 8 = eighth note (the "4" in 3/4). */
	denominator: number;
}

export interface Slot {
	id: string;
	/**
	 * Chord symbol exactly as entered, e.g. "Cmaj7", "F#m7b5", "C/E".
	 * An empty string represents a rest (silence) for this slot.
	 */
	chord: string;
	/**
	 * Duration in beats (relative to the time signature's beat unit).
	 * A full 4/4 bar = 4; a half-bar = 2. The sum of a bar's slot beats should
	 * equal the bar length, but the renderer/engine tolerate under/overfill.
	 */
	beats: number;
}

export interface Bar {
	id: string;
	/** Ordered left-to-right within the bar. */
	slots: Slot[];
}

export interface Progression {
	schemaVersion: SchemaVersion;
	id: string;
	name: string;
	/** epoch milliseconds */
	createdAt: number;
	/** epoch milliseconds */
	updatedAt: number;
	/** Beats per minute. */
	tempo: number;
	timeSignature: TimeSignature;
	instrument: InstrumentId;
	groove: Groove;
	bars: Bar[];
	/**
	 * Optional sub-range loop by bar index (inclusive). `null` loops the whole
	 * progression. Stored by index so it survives reordering predictably.
	 */
	loopRange: { startBar: number; endBar: number } | null;
}

/** Envelope written to a downloadable `.json` file for backup / transfer. */
export interface VampBackup {
	app: 'vamp';
	schemaVersion: SchemaVersion;
	/** epoch milliseconds */
	exportedAt: number;
	progressions: Progression[];
}
