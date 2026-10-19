// Roman numerals as an answer vocabulary for Learn: parse one, build its chord
// in a key, and name a chord's numeral with its seventh.
//
// One convention everywhere, the one `romanNumeral` (key.ts) already prints:
// chromatic degrees from NUMERALS (flats, except #IV), case for the third,
// ° / + for diminished / augmented. That is what the Sketch chart shows, so an
// answer button and the chart never disagree. Sevenths are added on top:
// 'V7', 'Imaj7', 'ii7', 'viiø7', 'vii°7'. Accidentals stay ASCII (b / #) here;
// the UI draws them (Numeral.svelte).
//
// Pure: tonal + model siblings only.

import { Chord, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { romanNumeral, type KeyInfo } from './key';

export type NumeralQuality = 'major' | 'minor' | 'dim' | 'halfdim' | 'aug';
export type NumeralSeventh = '' | '7' | 'maj7';

export interface ParsedNumeral {
	/** Semitones above the tonic (0–11). */
	semitones: number;
	/** Interval name above the tonic, so the root is SPELLED from the degree. */
	interval: string;
	quality: NumeralQuality;
	seventh: NumeralSeventh;
}

const UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Major-scale semitones per degree. */
const DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11];
/** Degrees whose natural interval is perfect (1, 4, 5); the rest are major. */
const PERFECT = new Set([0, 3, 4]);

const NUMERAL_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|\+)?(maj7|7)?$/;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Parse 'bVII', 'ii7', 'viiø7', 'V+', … — null for anything else. */
export function parseNumeral(text: string): ParsedNumeral | null {
	const m = NUMERAL_RE.exec(text.trim());
	if (!m) return null;
	const [, accidental, roman, mark, seventhRaw] = m;
	const upper = roman === roman.toUpperCase();
	const degree = UPPER.indexOf(roman.toUpperCase());

	let quality: NumeralQuality;
	if (mark === '°') quality = 'dim';
	else if (mark === 'ø') quality = 'halfdim';
	else if (mark === '+') quality = 'aug';
	else quality = upper ? 'major' : 'minor';
	// Case must agree with the mark: ° and ø are minor-third chords, + major.
	if ((quality === 'dim' || quality === 'halfdim') && upper) return null;
	if (quality === 'aug' && !upper) return null;

	const seventh = (seventhRaw ?? '') as NumeralSeventh;
	// ø is a seventh chord by definition; vii°maj7 is not a thing.
	if (quality === 'halfdim' && seventh !== '7') return null;
	if (quality === 'dim' && seventh === 'maj7') return null;

	const perfect = PERFECT.has(degree);
	let interval: string;
	if (accidental === 'b') interval = `${degree + 1}${perfect ? 'd' : 'm'}`;
	else if (accidental === '#') interval = `${degree + 1}A`;
	else interval = `${degree + 1}${perfect ? 'P' : 'M'}`;
	if (interval === '1d') return null;

	const shift = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;
	return { semitones: mod12(DEGREE_SEMIS[degree] + shift), interval, quality, seventh };
}

function suffixFor(quality: NumeralQuality, seventh: NumeralSeventh): string {
	switch (quality) {
		case 'major':
			return seventh;
		case 'minor':
			return seventh === '7' ? 'm7' : seventh === 'maj7' ? 'mMaj7' : 'm';
		case 'dim':
			return seventh === '7' ? 'dim7' : 'dim';
		case 'halfdim':
			return 'm7b5';
		case 'aug':
			return seventh === '7' ? '7#5' : seventh === 'maj7' ? 'maj7#5' : 'aug';
	}
}

/**
 * The concert chord symbol for a numeral in a key ('V7' in C → 'G7'). The root
 * is spelled from the degree, then simplified like every built root and chord
 * symbol (presets.ts) — never for melodic note names. Null when the numeral
 * doesn't parse.
 */
export function numeralToChord(numeral: string, key: KeyInfo): string | null {
	const parsed = parseNumeral(numeral);
	if (!parsed) return null;
	const root = Note.simplify(Note.transpose(key.tonic, parsed.interval));
	if (!root) return null;
	const symbol = `${root}${suffixFor(parsed.quality, parsed.seventh)}`;
	return isValidChordSymbol(symbol) ? symbol : root;
}

/**
 * A chord's numeral in a key, with its seventh: romanNumeral's degree, case and
 * ° / +, then 7 / maj7 — and ø7 / °7 for the two diminished sevenths. Extensions
 * fold into their seventh (G9 → 'V7'); '' for rests and unparseable symbols.
 */
export function numeralOf(symbol: string, key: KeyInfo): string {
	const base = romanNumeral(symbol, key);
	if (!base) return '';
	const intervals = Chord.get(symbol).intervals;
	const has = (iv: string) => intervals.includes(iv);
	if (base.endsWith('°')) {
		if (has('7m')) return `${base.slice(0, -1)}ø7`;
		if (has('7d')) return `${base}7`;
		return base;
	}
	if (has('7M')) return `${base}maj7`;
	if (has('7m')) return `${base}7`;
	return base;
}

const DEGREE_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const QUALITY_WORDS: Record<NumeralQuality, string> = {
	major: 'major',
	minor: 'minor',
	dim: 'diminished',
	halfdim: 'half-diminished',
	aug: 'augmented'
};

/**
 * What a screen reader should say for a numeral. Case carries the chord's
 * quality and is never spoken, so it is said: 'ii' → 'two minor', 'bVII7' →
 * 'flat seven, seven', 'V7' → 'five seven', 'viiø7' → 'seven half-diminished'.
 * Anything that doesn't parse is returned as written.
 */
export function spokenNumeral(numeral: string): string {
	const parsed = parseNumeral(numeral);
	if (!parsed) return numeral;
	const m = NUMERAL_RE.exec(numeral.trim())!;
	const degree = DEGREE_WORDS[UPPER.indexOf(m[2].toUpperCase())];
	const accidental = m[1] === 'b' ? 'flat ' : m[1] === '#' ? 'sharp ' : '';
	const { quality, seventh } = parsed;
	let tail: string;
	if (quality === 'halfdim') tail = 'half-diminished';
	else if (quality === 'major' && seventh === '7') tail = 'seven'; // the dominant: "five seven"
	else if (quality === 'major' && seventh === 'maj7') tail = 'major seven';
	else tail = [QUALITY_WORDS[quality], seventh === '7' ? 'seven' : seventh === 'maj7' ? 'major seven' : '']
		.filter(Boolean)
		.join(' ');
	return `${accidental}${degree} ${tail}`;
}
