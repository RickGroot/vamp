// Helpers to translate the model into VexFlow inputs.

import { Midi, Note } from 'tonal';
import { beatsToQuarters } from '$lib/model/time';
import type { TimeSignature } from '$lib/model/types';

// Notation register: keep every chord tone inside a fixed window around the
// treble staff so the chord stays readable — never deep ledger lines below, and
// never a tall stack (extended chords) that collides with the chord name or
// clips off the top. Tones are stacked in close position; any tone that would
// climb past the ceiling wraps back down into the window. The window spans from
// ~B3 (just below the staff) to ~G5 (just above it).
const WINDOW_LOW = 59; // B3
const WINDOW_HIGH = 79; // G5

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const leastAtLeast = (chroma: number, min: number): number => min + mod12(chroma - min);
function leastAbove(chroma: number, prev: number): number {
	let m = prev + mod12(chroma - prev);
	if (m <= prev) m += 12;
	return m;
}

/**
 * A readable staff voicing for a chord: its tones in close position within a
 * bounded window around the treble staff. The inversion-ordered `notes[0]` (the
 * bass for slash chords) is placed first/lowest; a non-chord slash bass is added
 * to the set. Correct pitch classes, sensible octaves — bounded so the layout is
 * always clean.
 */
export function notationVoicing(notes: string[], bass: string | null): number[] {
	const set = [...notes];
	if (bass && !set.some((n) => mod12(Note.chroma(n) ?? -1) === mod12(Note.chroma(bass) ?? -2))) {
		set.unshift(bass);
	}
	const chromas = set.map((n) => Note.chroma(n)).filter((c): c is number => c !== undefined);
	if (chromas.length === 0) return [];

	const out: number[] = [];
	let prev = WINDOW_LOW - 1;
	for (const c of chromas) {
		let m = leastAbove(c, prev);
		if (m > WINDOW_HIGH) m = leastAtLeast(c, WINDOW_LOW); // wrap tall stacks back into the window
		out.push(m);
		prev = m;
	}
	return out;
}

export interface VexKey {
	/** VexFlow key string, e.g. "c#/4". */
	key: string;
	/** Accidental glyph to render ('#', 'b', …) or null. */
	accidental: string | null;
}

/** MIDI number -> VexFlow key (+ accidental to render). */
export function midiToVexKey(midi: number): VexKey {
	const name = Midi.midiToNoteName(midi); // e.g. "C4", "Db4", "F#3"
	const match = name.match(/^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d+)$/);
	if (!match) return { key: 'c/4', accidental: null };
	const [, letter, acc, octave] = match;
	return { key: `${letter.toLowerCase()}${acc ?? ''}/${octave}`, accidental: acc ?? null };
}

/**
 * Quantise a slot's beat length to the nearest simple VexFlow duration that is
 * not longer than it. Combined with a SOFT voice this renders a readable
 * lead-sheet rhythm without throwing on odd bar fills.
 */
export function beatsToVexDuration(beats: number, ts: TimeSignature): string {
	const quarters = beatsToQuarters(beats, ts);
	if (quarters >= 4) return 'w';
	if (quarters >= 2) return 'h';
	if (quarters >= 1) return 'q';
	return '8';
}
