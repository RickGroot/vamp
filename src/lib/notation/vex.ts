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

export interface VoicedNote {
	midi: number;
	/** The chord's own spelling of this tone (e.g. "A#", "Gb"), '' if unknown. */
	name: string;
}

/**
 * A readable staff voicing for a chord: its tones in close position within a
 * bounded window around the treble staff. The inversion-ordered `notes[0]` (the
 * bass for slash chords) is placed first/lowest; a non-chord slash bass is added
 * to the set. Each voiced note keeps the chord symbol's spelling — the staff
 * must show F# chords with sharps and Bb chords with flats, not one fixed
 * enharmonic (MIDI numbers alone can't say which).
 */
export function notationVoicing(notes: string[], bass: string | null): VoicedNote[] {
	const set = [...notes];
	if (bass && !set.some((n) => mod12(Note.chroma(n) ?? -1) === mod12(Note.chroma(bass) ?? -2))) {
		set.unshift(bass);
	}
	const tones = set
		.map((name) => ({ name, chroma: Note.chroma(name) }))
		.filter((t): t is { name: string; chroma: number } => t.chroma !== undefined);
	if (tones.length === 0) return [];

	const out: VoicedNote[] = [];
	let prev = WINDOW_LOW - 1;
	for (const t of tones) {
		let m = leastAbove(t.chroma, prev);
		if (m > WINDOW_HIGH) m = leastAtLeast(t.chroma, WINDOW_LOW); // wrap tall stacks back into the window
		out.push({ midi: m, name: t.name });
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

/** MIDI number -> VexFlow key (+ accidental), tonal's default (flat) spelling. */
export function midiToVexKey(midi: number): VexKey {
	const name = Midi.midiToNoteName(midi); // e.g. "C4", "Db4"
	const match = name.match(/^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d+)$/);
	if (!match) return { key: 'c/4', accidental: null };
	const [, letter, acc, octave] = match;
	return { key: `${letter.toLowerCase()}${acc ?? ''}/${octave}`, accidental: acc ?? null };
}

/**
 * Voiced note -> VexFlow key, preserving the chord's spelling. The octave is
 * solved from the MIDI number per LETTER, not chroma (Cb4 sounds as midi 59 =
 * "B3", but must sit on the C line of octave 4). Falls back to the flat
 * spelling if the name doesn't round-trip.
 */
export function voicedToVexKey(v: VoicedNote): VexKey {
	const match = v.name.match(/^([A-Ga-g])(#{1,2}|b{1,2})?$/);
	if (!match) return midiToVexKey(v.midi);
	const [, letter, acc] = match;
	const base = Math.floor(v.midi / 12) - 1;
	for (const octave of [base - 1, base, base + 1]) {
		if (Note.midi(`${v.name}${octave}`) === v.midi) {
			return { key: `${letter.toLowerCase()}${acc ?? ''}/${octave}`, accidental: acc ?? null };
		}
	}
	return midiToVexKey(v.midi);
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
