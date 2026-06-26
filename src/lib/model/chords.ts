// Chord suggestions + quality classification for the chord picker.
//
// Suggestions are roots × common qualities, validated once with tonal and cached.
// `classifyChord` buckets a symbol into a colour-coded quality family used by the UI.

import { Chord } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { transposeChordSymbol } from '$lib/audio/transpose';

export type ChordFamily =
	| 'major'
	| 'minor'
	| 'dominant'
	| 'diminished'
	| 'augmented'
	| 'suspended'
	| 'other';

const ROOTS = [
	'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'
];

// Ordered roughly by how common they are, so the unfiltered list leads with basics.
const QUALITIES = [
	'', 'm', '7', 'maj7', 'm7', '6', 'm6', 'sus2', 'sus4', '9', 'm9', 'maj9',
	'add9', '7sus4', 'm7b5', 'dim', 'dim7', 'aug', '7b9', '7#9', '13'
];

let cache: string[] | null = null;

/** All validated suggestion symbols (roots × qualities), cached. */
export function allChordSuggestions(): string[] {
	if (cache) return cache;
	const out: string[] = [];
	for (const quality of QUALITIES) {
		for (const root of ROOTS) {
			const symbol = root + quality;
			if (isValidChordSymbol(symbol)) out.push(symbol);
		}
	}
	cache = out;
	return out;
}

/** Filter suggestions by typed text: prefix matches first, then substring matches. */
export function filterChords(query: string, limit = 40): string[] {
	const all = allChordSuggestions();
	const q = query.trim().toLowerCase();
	if (q === '') return all.slice(0, limit);

	const starts: string[] = [];
	const contains: string[] = [];
	for (const symbol of all) {
		const lower = symbol.toLowerCase();
		if (lower.startsWith(q)) starts.push(symbol);
		else if (lower.includes(q)) contains.push(symbol);
	}
	return [...starts, ...contains].slice(0, limit);
}

export interface ChordSuggestion {
	/** Written symbol shown to the user (concert when offset is 0). */
	display: string;
	/** Concert symbol to store. */
	concert: string;
}

const displayCache = new Map<number, ChordSuggestion[]>();

function displayList(offset: number): ChordSuggestion[] {
	let list = displayCache.get(offset);
	if (!list) {
		list = allChordSuggestions().map((concert) => ({
			concert,
			display: offset === 0 ? concert : transposeChordSymbol(concert, offset)
		}));
		displayCache.set(offset, list);
	}
	return list;
}

/**
 * Filter suggestions in *display* (written) space for a transposing instrument,
 * returning both the shown symbol and the concert symbol to store.
 */
export function filterChordsDisplay(query: string, offset: number, limit = 40): ChordSuggestion[] {
	const list = displayList(offset);
	const q = query.trim().toLowerCase();
	if (q === '') return list.slice(0, limit);

	const starts: ChordSuggestion[] = [];
	const contains: ChordSuggestion[] = [];
	for (const item of list) {
		const lower = item.display.toLowerCase();
		if (lower.startsWith(q)) starts.push(item);
		else if (lower.includes(q)) contains.push(item);
	}
	return [...starts, ...contains].slice(0, limit);
}

/** Bucket a chord symbol into a colour-coded quality family. */
export function classifyChord(symbol: string): ChordFamily {
	const chord = Chord.get(symbol);
	if (chord.empty) return 'other';

	const intervals = chord.intervals;
	const has = (interval: string) => intervals.includes(interval);

	// Diminished / half-diminished: flat fifth (covers dim, dim7, m7b5).
	if (has('5d') || /dim|m7b5|°/i.test(symbol)) return 'diminished';

	const hasMajorThird = has('3M');
	const hasMinorThird = has('3m');
	if (!hasMajorThird && !hasMinorThird) return 'suspended'; // sus2 / sus4

	if (hasMinorThird) return 'minor';
	if (has('5A')) return 'augmented';
	if (has('7m')) return 'dominant';
	return 'major';
}
