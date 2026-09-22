// Transpose a chord symbol by a number of semitones, preserving its quality and
// any slash bass, and simplifying the resulting spelling (e.g. E# -> F).
//
// Also the single source of the transposing-instrument offsets. They live in
// this pure module (re-exported by the view store) for the same reason the tempo
// bounds live in model/factory: the store is not importable in the node test
// environment, and the offsets need testing.

import { Interval, Note } from 'tonal';

export interface TransposeOption {
	id: string;
	label: string;
	/** Written pitch = concert + offset semitones. */
	offset: number;
}

export const TRANSPOSE_OPTIONS: TransposeOption[] = [
	{ id: 'concert', label: 'Concert', offset: 0 },
	{ id: 'bb', label: 'B♭ Trumpet', offset: 2 },
	{ id: 'eb', label: 'E♭ Alto sax', offset: 9 },
	{ id: 'f', label: 'F Horn', offset: 7 }
];

const CHORD_RE = /^([A-Ga-g][#b]?)(.*?)(?:\/([A-Ga-g][#b]?))?$/;

export function transposeChordSymbol(symbol: string, semitones: number): string {
	const trimmed = symbol.trim();
	if (trimmed === '' || semitones === 0) return trimmed;

	const match = trimmed.match(CHORD_RE);
	if (!match) return trimmed;
	const [, root, quality, bass] = match;

	const interval = Interval.fromSemitones(semitones);
	const newRoot = Note.simplify(Note.transpose(root, interval));
	if (!newRoot) return trimmed;

	const newBass = bass ? Note.simplify(Note.transpose(bass, interval)) : '';
	return `${newRoot}${quality}${newBass ? `/${newBass}` : ''}`;
}

/** Concert symbol -> the written symbol shown for a transposing instrument. */
export function displayChord(concert: string, offset: number): string {
	return offset === 0 ? concert : transposeChordSymbol(concert, offset);
}

/** Written symbol typed for a transposing instrument -> the stored concert symbol. */
export function concertFromDisplay(written: string, offset: number): string {
	return offset === 0 ? written : transposeChordSymbol(written, -offset);
}
