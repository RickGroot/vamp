// Lightweight key inference + Roman-numeral analysis for the smart helpers.
// Everything is relative to the chord roots' pitch classes, so it's
// transposition-invariant (the function stays "V" whatever the display pitch).

import { Chord, Interval, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';

export interface KeyInfo {
	tonic: string;
	mode: 'major' | 'minor';
}

export interface DiatonicChord {
	roman: string;
	symbol: string;
}

type Quality = 'M' | 'm' | 'dim';

const MAJOR = { offsets: [0, 2, 4, 5, 7, 9, 11], quals: ['M', 'm', 'm', 'M', 'M', 'm', 'dim'] as Quality[] };
const MINOR = { offsets: [0, 2, 3, 5, 7, 8, 10], quals: ['m', 'dim', 'M', 'm', 'm', 'M', 'M'] as Quality[] };

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NUMERALS = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

function category(chord: ReturnType<typeof Chord.get>): Quality {
	if (chord.intervals.includes('5d')) return 'dim';
	return chord.intervals.includes('3m') ? 'm' : 'M';
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Best-guess key for a set of chord symbols (major/minor diatonic scoring). */
export function inferKey(symbols: string[]): KeyInfo {
	const parsed = symbols
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => Chord.get(s))
		.filter((c) => !c.empty && c.tonic);
	if (parsed.length === 0) return { tonic: 'C', mode: 'major' };

	const chords = parsed.map((c) => ({ chroma: Note.chroma(c.tonic!)!, cat: category(c) }));
	const first = chords[0];
	const last = chords[chords.length - 1];

	let best: KeyInfo & { score: number } = { tonic: 'C', mode: 'major', score: -Infinity };
	for (let t = 0; t < 12; t++) {
		for (const [mode, tbl] of [['major', MAJOR], ['minor', MINOR]] as const) {
			let score = 0;
			for (const ch of chords) {
				const idx = tbl.offsets.indexOf(mod12(ch.chroma - t));
				if (idx >= 0) score += tbl.quals[idx] === ch.cat ? 1 : 0.4;
			}
			if (mod12(first.chroma - t) === 0) score += 1.5; // first chord as tonic
			if (mod12(last.chroma - t) === 0) score += 1; // last chord as tonic
			if (score > best.score) best = { tonic: NOTE_NAMES[t], mode, score };
		}
	}
	return { tonic: best.tonic, mode: best.mode };
}

/** Roman-numeral function of a chord within a key (degree + case, ° / +). */
export function romanNumeral(symbol: string, key: KeyInfo): string {
	const chord = Chord.get(symbol);
	if (chord.empty || !chord.tonic) return '';
	const base = NUMERALS[mod12(Note.chroma(chord.tonic)! - Note.chroma(key.tonic)!)];
	const cat = category(chord);
	let roman = cat === 'm' || cat === 'dim' ? base.toLowerCase() : base;
	if (cat === 'dim') roman += '°';
	else if (chord.intervals.includes('5A') && chord.intervals.includes('3M')) roman += '+';
	return roman;
}

/** The diatonic chords of a key, for next-chord suggestions. */
export function diatonicChords(key: KeyInfo): DiatonicChord[] {
	const tbl = key.mode === 'major' ? MAJOR : MINOR;
	const romans = key.mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR;
	return tbl.offsets.map((off, i) => {
		const note = Note.simplify(Note.transpose(key.tonic, Interval.fromSemitones(off)));
		const suffix = tbl.quals[i] === 'm' ? 'm' : tbl.quals[i] === 'dim' ? 'dim' : '';
		const symbol = `${note}${suffix}`;
		return { roman: romans[i], symbol: isValidChordSymbol(symbol) ? symbol : note };
	});
}
