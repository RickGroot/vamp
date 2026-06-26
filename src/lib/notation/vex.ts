// Helpers to translate the model into VexFlow inputs.

import { Midi } from 'tonal';
import { beatsToQuarters } from '$lib/model/time';
import type { TimeSignature } from '$lib/model/types';

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
