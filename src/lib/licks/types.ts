// The lick model: a short line written as degrees of the KEY over its own
// changes written as numerals, so one lick plays in every key.
//
// A lick is not a DrillSource. A drill's cell is pool steps the resolver
// sequences through one scale; a lick is a fixed line with its own changes,
// chromatic notes and rests. Bending one model to hold both would make both
// harder to read (docs/licks-design.md).
//
// The definition is key-free and offset-free, like a drill's: only it would be
// persisted (custom licks come in a later phase). A LickRun is transient.

import type { TimeSignature } from '$lib/model/types';
import type { DrillChord, DrillRun } from '$lib/practice/types';

export type LickMode = 'major' | 'minor';
export type LickFeel = 'straight' | 'swing';
export type LickStyle = 'blues' | 'rock' | 'jazz';

export interface LickChord {
	/** Chart convention, parsed by `parseNumeral`: 'ii7', 'V7', 'bVII7', 'Imaj7'. */
	numeral: string;
	beats: number;
}

export interface LickDefinition {
	schemaVersion: 1;
	/** PERSISTED for built-ins (review progress will be keyed by it): never rename. */
	id: string;
	name: string;
	description: string;
	createdAt: number;
	updatedAt: number;
	/** The key the degrees and numerals read against. */
	mode: LickMode;
	/** The lick's own changes, in order. Their total length is the lick's length. */
	changes: LickChord[];
	/** Degree tokens, one per note or rest (see tokens.ts). */
	notes: string[];
	/** Beats per token; cycles when shorter than `notes`, as in drills. */
	rhythm: number[];
	feel: LickFeel;
	timeSignature: TimeSignature;
	style: LickStyle;
	/** Never trusted from storage. */
	builtIn?: boolean;
}

/**
 * A resolved lick: the run shape `drillPlan` and the runner already read, plus
 * the band's changes. `chords` are CONCERT symbols over the whole run, every
 * repetition unrolled in its own key, rest bars as '' — each repetition starting
 * on a fresh bar, so they pack straight into bars.
 */
export interface LickRun extends Omit<DrillRun, 'definition'> {
	definition: LickDefinition;
	chords: DrillChord[];
}
