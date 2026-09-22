// Practice drills: the data model.
//
// A drill DEFINITION is abstract and reusable — scale steps, chord-tone indices,
// rhythm in beats, a direction — so one definition serves all twelve keys and
// every register. Concrete pitches are resolved only when a run starts
// (resolve.ts), and never stored.
//
// Kept deliberately separate from the song schema in model/types.ts: a drill
// references no Progression, and Progression/VampBackup are untouched, so every
// existing import, export and share link keeps working.

import type { TimeSignature } from '$lib/model/types';
import type { KeyCycleMode } from '$lib/audio/drills';

export type DrillSchemaVersion = 1;
export const CURRENT_DRILL_SCHEMA_VERSION: DrillSchemaVersion = 1;

/**
 * Which line a guide-tone drill traces through a set of changes.
 * `guide` alternates 3rds and 7ths (the classic line); `roots` is the easy level.
 */
export type GuideLine = 'guide' | 'thirds' | 'sevenths' | 'roots';

/**
 * What supplies the notes.
 * - `scale` — a tonal scale-type id from SCALE_TYPES ('major', 'blues', …)
 * - `chord` — a chord-symbol suffix appended to the root ('maj7', 'm7', '7', '')
 * - `guide` — one note per chord of a SEQUENCE, voice-led. Needs `chords` in the
 *   run options (the editor's progression), so it ignores `pattern` entirely.
 */
export type DrillSource =
	| { kind: 'scale'; scaleType: string }
	| { kind: 'chord'; quality: string }
	| { kind: 'guide'; line: GuideLine };

/** One chord of a sequence a guide-tone drill runs over. */
export interface DrillChord {
	/** Chord symbol in CONCERT pitch, exactly as the song stores it. '' = rest. */
	symbol: string;
	/** Duration in the drill's beat unit, like Slot.beats. */
	beats: number;
}

export type DrillDirection = 'up' | 'down' | 'updown' | 'downup';

/**
 * The reusable rhythmic + intervallic cell, as 0-based offsets into the source's
 * note pool. 1-2-3-5 is `[0, 1, 2, 4]`; thirds are `[0, 2]`; a seventh arpeggio
 * over a chord pool is `[0, 1, 2, 3]`.
 *
 * NOTE these are POOL STEPS, not diatonic degrees: in a 5-note pentatonic, step 4
 * is already the octave. That is the correct behaviour — the same cell means
 * something musically sensible in every scale — but it surprises people.
 */
export interface DrillPattern {
	id: string;
	label: string;
	cell: number[];
	/** Beats per note (beat unit = TS denominator). Cycles if shorter than `cell`. */
	rhythm: number[];
	/** Pool steps the cell advances between repetitions. 1 = the classic sequence. */
	step: number;
}

export interface DrillDefinition {
	schemaVersion: DrillSchemaVersion;
	id: string;
	name: string;
	description: string;
	/** epoch milliseconds (0 for the shipped library, which is never stored) */
	createdAt: number;
	/** epoch milliseconds — also the IndexedDB sort index for saved drills */
	updatedAt: number;
	source: DrillSource;
	pattern: DrillPattern;
	/** Default direction; a run may override it. */
	direction: DrillDirection;
	/** Cell repetitions per key, before the key changes. */
	cellsPerKey: number;
	timeSignature: TimeSignature;
	/** True for the shipped library (not user-created, so not deletable). */
	builtIn?: boolean;
}

/** A playable range in WRITTEN MIDI — what the player reads and fingers. */
export interface WrittenRange {
	min: number;
	max: number;
}

export type Register = 'low' | 'middle' | 'high';

/**
 * Per-run settings. NOT part of the definition — this is what lets one drill
 * serve every key, register and instrument without storing a copy per variant.
 */
export interface DrillRunOptions {
	/** Starting root, CONCERT pitch (the store's convention). */
	root: string;
	keyMode: KeyCycleMode;
	/** Total repetitions (12 with keyMode 'fourths' walks every key). */
	reps: number;
	/** Transposing-instrument offset (view.offset). WRITTEN = CONCERT + offset. */
	offset: number;
	range: WrittenRange;
	register: Register;
	direction?: DrillDirection;
	tempo: number;
	/** BPM added per repetition (0 = off). */
	tempoStep: number;
	tempoMax: number;
	/** Bars of rest between repetitions — brass players need real rest. */
	restBars: number;
	/**
	 * Changes for a `guide` source, CONCERT pitch — normally the editor's current
	 * progression. Ignored by scale and chord drills.
	 */
	chords?: DrillChord[];
	/** Overrides the definition's meter (a song-sourced drill follows the song). */
	timeSignature?: TimeSignature;
	rand?: () => number;
}

export type DrillRole = 'root' | 'third' | 'fifth' | 'seventh' | 'scale' | 'rest';

/**
 * One resolved note, in WRITTEN pitch (see resolve.ts for why).
 *
 * Structurally assignable to `VoicedNote` from notation/vex.ts, so
 * `voicedToVexKey(note)` works directly — `name` decides the letter and
 * accidental, `midi` only fixes the octave. Never respell `name` from `midi`:
 * tonal's midiToNoteName is flats-only.
 */
export interface DrillNote {
	/** WRITTEN midi. null = rest (silent, but the clock and highlight advance). */
	midi: number | null;
	/** Pitch-class spelling, e.g. 'Eb', 'C#'. '' for a rest. */
	name: string;
	/** Offset from the run start, in quarter notes (the comp.ts convention). */
	atQuarters: number;
	durQuarters: number;
	/** Display label: '1', 'b3', '5', '7'. '' for a rest. */
	label: string;
	role: DrillRole;
	/** Which repetition this note belongs to. */
	rep: number;
	/** For a guide-tone drill: the WRITTEN chord symbol this note sits on. */
	chord?: string;
}

/** One repetition: the drill in a single key, at a single tempo. */
export interface DrillPhrase {
	rep: number;
	/** CONCERT root — what sounds, and what the store keeps. */
	concertRoot: string;
	/** WRITTEN root — what the player reads. */
	writtenRoot: string;
	tempo: number;
	startQuarters: number;
	lengthQuarters: number;
}

export interface DrillRun {
	definition: DrillDefinition;
	options: DrillRunOptions;
	notes: DrillNote[];
	phrases: DrillPhrase[];
	totalQuarters: number;
	/** Keys dropped because the pattern could not fit the range, with the reason. */
	skipped: { concertRoot: string; reason: RangeFailure }[];
}

export type RangeFailure = 'span' | 'octave' | 'unresolvable';
