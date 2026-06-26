// Common chord-progression presets, defined as scale degrees (semitones from the
// tonic) + a chord quality so they can be built in any key. Roots are concert pitch.

import { Interval, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';

export interface PresetChord {
	/** Semitones above the tonic. */
	semitones: number;
	/** Chord quality suffix appended to the root note, e.g. 'm7', '7', 'maj7'. */
	quality: string;
}

export interface Preset {
	id: string;
	name: string;
	/** Human-readable degree pattern, for display. */
	pattern: string;
	chords: PresetChord[];
}

/** Concert-pitch root choices offered when applying a preset. */
export const PRESET_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const c = (semitones: number, quality = ''): PresetChord => ({ semitones, quality });

export const PRESETS: Preset[] = [
	{ id: 'pop', name: 'Pop', pattern: 'I–V–vi–IV', chords: [c(0), c(7), c(9, 'm'), c(5)] },
	{ id: 'doowop', name: '50s / Doo-wop', pattern: 'I–vi–IV–V', chords: [c(0), c(9, 'm'), c(5), c(7)] },
	{ id: 'vi-iv-i-v', name: 'Pop (minor start)', pattern: 'vi–IV–I–V', chords: [c(9, 'm'), c(5), c(0), c(7)] },
	{ id: 'i-iv-v', name: 'Three-chord', pattern: 'I–IV–V', chords: [c(0), c(5), c(7)] },
	{
		id: 'jazz-251',
		name: 'Jazz ii–V–I',
		pattern: 'iim7–V7–Imaj7',
		chords: [c(2, 'm7'), c(7, '7'), c(0, 'maj7')]
	},
	{
		id: 'minor-251',
		name: 'Minor ii–V–i',
		pattern: 'iiø–V7–im7',
		chords: [c(2, 'm7b5'), c(7, '7'), c(0, 'm7')]
	},
	{
		id: 'canon',
		name: 'Canon',
		pattern: 'I–V–vi–iii–IV–I–IV–V',
		chords: [c(0), c(7), c(9, 'm'), c(4, 'm'), c(5), c(0), c(5), c(7)]
	},
	{
		id: 'andalusian',
		name: 'Andalusian (minor)',
		pattern: 'i–♭VII–♭VI–V',
		chords: [c(0, 'm'), c(10), c(8), c(7)]
	},
	{
		id: 'blues12',
		name: '12-bar blues',
		pattern: 'I7 · IV7 · V7',
		chords: [
			c(0, '7'), c(0, '7'), c(0, '7'), c(0, '7'),
			c(5, '7'), c(5, '7'), c(0, '7'), c(0, '7'),
			c(7, '7'), c(5, '7'), c(0, '7'), c(7, '7')
		]
	}
];

/** Build the concert-pitch chord symbols for a preset in a given root. */
export function buildPresetChords(root: string, preset: Preset): string[] {
	return preset.chords.map(({ semitones, quality }) => {
		const note = Note.simplify(Note.transpose(root, Interval.fromSemitones(semitones)));
		const symbol = `${note}${quality}`;
		return isValidChordSymbol(symbol) ? symbol : note;
	});
}
