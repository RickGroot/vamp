// Built-in example songs to load with one click.
//
// IMPORTANT: these are all PUBLIC-DOMAIN works (traditional / classical / pre-1929),
// with simplified, commonly-played chord changes meant as starting sketches — they are
// not definitive transcriptions and versions vary. Copyrighted songs are intentionally
// excluded; users can `Import` their own JSON for those.

import { barBeats } from './time';
import { createProgression, createSlot, newId } from './factory';
import type { Progression, TimeSignature } from './types';

const T = (numerator: number, denominator: number): TimeSignature => ({ numerator, denominator });

export interface Example {
	id: string;
	title: string;
	/** Public-domain provenance, shown in the menu. */
	origin: string;
	tempo: number;
	timeSignature: TimeSignature;
	/** One entry per bar: a chord (full bar) or several chords (split bar). */
	bars: (string | string[])[];
}

export const EXAMPLES: Example[] = [
	{
		id: 'pachelbel',
		title: "Pachelbel's Canon",
		origin: 'Pachelbel, c.1680',
		tempo: 64,
		timeSignature: T(4, 4),
		bars: ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']
	},
	{
		id: 'ode-to-joy',
		title: 'Ode to Joy',
		origin: 'Beethoven, 1824',
		tempo: 100,
		timeSignature: T(4, 4),
		bars: ['C', 'G', 'C', 'G', 'C', 'G7', 'C', 'C']
	},
	{
		id: 'greensleeves',
		title: 'Greensleeves',
		origin: 'Trad., 16th c.',
		tempo: 90,
		timeSignature: T(3, 4),
		bars: ['Am', 'C', 'G', 'Am', 'F', 'C', 'E', 'E', 'Am', 'C', 'G', 'Am', 'F', 'E', 'Am', 'Am']
	},
	{
		id: 'rising-sun',
		title: 'House of the Rising Sun',
		origin: 'Trad. folk',
		tempo: 76,
		timeSignature: T(6, 8),
		bars: ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E']
	},
	{
		id: 'amazing-grace',
		title: 'Amazing Grace',
		origin: 'Trad. / Newton, 1779',
		tempo: 80,
		timeSignature: T(3, 4),
		bars: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G']
	},
	{
		id: 'saints',
		title: 'When the Saints Go Marching In',
		origin: 'Trad. spiritual',
		tempo: 100,
		timeSignature: T(4, 4),
		bars: ['C', 'C', 'C', 'C', 'C', 'C7', 'F', 'F', 'C', 'G7', 'C', 'C']
	},
	{
		id: 'auld-lang-syne',
		title: 'Auld Lang Syne',
		origin: 'Trad. (Burns, 1788)',
		tempo: 92,
		timeSignature: T(4, 4),
		bars: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G']
	},
	{
		id: 'swing-low',
		title: 'Swing Low, Sweet Chariot',
		origin: 'Trad. spiritual',
		tempo: 80,
		timeSignature: T(4, 4),
		bars: ['G', 'C', 'G', 'D', 'G', 'C', ['G', 'D'], 'G']
	},
	{
		id: 'drunken-sailor',
		title: 'Drunken Sailor',
		origin: 'Trad. sea shanty',
		tempo: 130,
		timeSignature: T(4, 4),
		bars: ['Dm', 'C', 'Dm', 'C', 'Dm', 'C', ['Dm', 'C'], 'Dm']
	},
	{
		id: 'hava-nagila',
		title: 'Hava Nagila',
		origin: 'Trad. (Hora)',
		tempo: 120,
		timeSignature: T(4, 4),
		bars: ['Dm', 'Dm', 'Gm', 'Dm', 'A7', 'Dm', 'A7', 'Dm']
	},
	{
		id: 'oh-susanna',
		title: 'Oh! Susanna',
		origin: 'S. Foster, 1848',
		tempo: 110,
		timeSignature: T(4, 4),
		bars: ['G', 'G', 'C', 'G', 'G', 'D7', 'G', 'G']
	},
	{
		id: 'wayfaring',
		title: 'Wayfaring Stranger',
		origin: 'Trad. folk',
		tempo: 72,
		timeSignature: T(4, 4),
		bars: ['Am', 'Am', 'Dm', 'Am', 'Am', 'E', 'Am', 'Am']
	},
	{
		id: 'st-james',
		title: 'St. James Infirmary',
		origin: 'Trad. blues',
		tempo: 90,
		timeSignature: T(4, 4),
		bars: ['Am', 'Am', 'Dm', 'E7', 'Am', 'E7', 'Am', 'Am']
	},
	{
		id: 'korobeiniki',
		title: 'Korobeiniki',
		origin: 'Trad. Russian',
		tempo: 140,
		timeSignature: T(4, 4),
		bars: ['Em', 'Em', 'Bm', 'Bm', 'Em', 'Am', ['Em', 'B7'], 'Em']
	},
	{
		id: 'jingle-bells',
		title: 'Jingle Bells',
		origin: 'Pierpont, 1857',
		tempo: 120,
		timeSignature: T(4, 4),
		bars: ['G', 'G', 'G', 'G', 'C', 'C', 'G', 'G', 'D', 'D', 'G', 'G']
	},
	{
		id: 'silent-night',
		title: 'Silent Night',
		origin: 'Gruber, 1818',
		tempo: 72,
		timeSignature: T(3, 4),
		bars: ['C', 'C', 'G7', 'C', 'C', 'C', 'G7', 'C', 'F', 'C', 'F', 'C', 'C', 'G7', 'C', 'C']
	},
	{
		id: 'joy-to-the-world',
		title: 'Joy to the World',
		origin: 'Handel / Watts, 1719',
		tempo: 110,
		timeSignature: T(4, 4),
		bars: ['C', 'C', 'G', 'C', 'F', ['C', 'G'], 'C', 'C']
	},
	{
		id: 'blues-in-a',
		title: '12-Bar Blues in A',
		origin: 'Trad. blues form',
		tempo: 100,
		timeSignature: T(4, 4),
		bars: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7']
	}
];

/** Build a fresh Progression from an example. */
export function buildExample(example: Example): Progression {
	const ts = example.timeSignature;
	const bars = example.bars.map((entry) => {
		const chords = Array.isArray(entry) ? entry : [entry];
		const each = barBeats(ts) / chords.length;
		return { id: newId(), slots: chords.map((chord) => createSlot(chord, each)) };
	});
	return createProgression({
		name: example.title,
		tempo: example.tempo,
		timeSignature: ts,
		bars
	});
}
