// Chord parsing: turn a user-typed chord symbol into playable MIDI notes.
//
// `tonal` does the hard parsing (slash / altered / sus / extended chords). It
// returns pitch *classes* (no octave), so the octave assignment below is ours —
// the most likely place for an off-by-octave bug, hence the unit tests.

import { Chord, Midi } from 'tonal';

/** Default octave the chord is voiced from (C4 = middle C). */
export const DEFAULT_BASE_OCTAVE = 4;

export interface ParsedChord {
	/** The trimmed symbol that was parsed. */
	symbol: string;
	/** Nothing to play (either a rest or an unrecognised symbol). */
	empty: boolean;
	/** A real, recognised chord. */
	valid: boolean;
	/** Intentional silence (the symbol was blank), as opposed to a parse failure. */
	isRest: boolean;
	/** Pitch classes from tonal, inversion-ordered (bass first for slash chords). */
	notes: string[];
	/** Slash-chord bass pitch class, or null for root position. */
	bass: string | null;
	/** Playable MIDI note numbers, low→high (a low bass note is prepended for slash chords). */
	midi: number[];
	/** Human-readable name, e.g. "C major seventh". */
	name: string;
}

function rest(symbol = ''): ParsedChord {
	return { symbol, empty: true, valid: false, isRest: symbol === '', notes: [], bass: null, midi: [], name: '' };
}

/**
 * Parse a chord symbol (e.g. "Cmaj7", "F#m7b5", "C/E") into MIDI notes.
 * A blank symbol is a rest; an unrecognised symbol returns `empty: true, isRest: false`.
 */
export function parseChord(symbol: string, baseOctave: number = DEFAULT_BASE_OCTAVE): ParsedChord {
	const trimmed = (symbol ?? '').trim();
	if (trimmed === '') return rest('');

	const c = Chord.get(trimmed);
	if (c.empty || c.notes.length === 0) {
		return { ...rest(trimmed), isRest: false };
	}

	const midi = voiceAscending(c.notes, baseOctave);

	const bass = c.bass || null;
	if (bass) {
		const bassMidi = Midi.toMidi(`${bass}${baseOctave - 1}`);
		if (bassMidi != null) midi.unshift(bassMidi);
	}

	return { symbol: trimmed, empty: false, valid: true, isRest: false, notes: c.notes, bass, midi, name: c.name };
}

/**
 * Assign octaves to a list of pitch classes so the result is strictly ascending,
 * starting at `baseOctave` and bumping up whenever the next note would not be
 * higher than the previous one.
 */
function voiceAscending(pitchClasses: string[], baseOctave: number): number[] {
	const out: number[] = [];
	let octave = baseOctave;
	let prev = -Infinity;

	for (const pc of pitchClasses) {
		let m = Midi.toMidi(`${pc}${octave}`);
		if (m == null) continue;
		if (m <= prev) {
			octave += 1;
			m = Midi.toMidi(`${pc}${octave}`);
			if (m == null) continue;
		}
		prev = m;
		out.push(m);
	}
	return out;
}

/** Quick predicate for live input validation in the UI (blank counts as invalid here). */
export function isValidChordSymbol(symbol: string): boolean {
	const t = (symbol ?? '').trim();
	return t !== '' && !Chord.get(t).empty;
}
