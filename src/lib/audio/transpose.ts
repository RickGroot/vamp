// Transpose a chord symbol by a number of semitones, preserving its quality and
// any slash bass, and simplifying the resulting spelling (e.g. E# -> F).

import { Interval, Note } from 'tonal';

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
