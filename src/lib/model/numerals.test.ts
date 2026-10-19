import { describe, it, expect } from 'vitest';
import { Chord } from 'tonal';
import { NOTE_NAMES, romanNumeral, type KeyInfo } from './key';
import { numeralOf, numeralToChord, parseNumeral, spokenNumeral } from './numerals';

const C: KeyInfo = { tonic: 'C', mode: 'major' };

// Every numeral a Learn answer pad can offer, in both modes.
const POOL = [
	// diatonic major triads + sevenths
	'I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°',
	'Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7',
	// minor-key and borrowed
	'i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII', 'iiø7', 'i7', 'iv7', 'bIIImaj7', 'bVImaj7', 'bVII7',
	// secondary dominants, tritone subs, diminished, augmented, line cliché
	'II7', 'III7', 'VI7', 'I7', 'bII7', 'bII', 'vii°7', '#iv°', 'I+', 'V+7', 'imaj7'
];

describe('parseNumeral', () => {
	it('reads degree, accidental, quality and seventh', () => {
		expect(parseNumeral('bVII7')).toEqual({ semitones: 10, interval: '7m', quality: 'major', seventh: '7' });
		expect(parseNumeral('viiø7')).toEqual({ semitones: 11, interval: '7M', quality: 'halfdim', seventh: '7' });
		expect(parseNumeral('#iv°')).toEqual({ semitones: 6, interval: '4A', quality: 'dim', seventh: '' });
		expect(parseNumeral('ii')?.quality).toBe('minor');
	});

	it('rejects nonsense and contradictions', () => {
		for (const bad of ['', 'X', 'IIV', 'Vii', 'VII°', 'v+', 'viiø', 'vii°maj7', 'bI', 'V9', 'V 7'])
			expect(parseNumeral(bad), bad).toBeNull();
	});
});

describe('numeralToChord', () => {
	it('builds the concert chord in C', () => {
		const cases: [string, string][] = [
			['I', 'C'], ['ii', 'Dm'], ['vii°', 'Bdim'], ['V7', 'G7'], ['Imaj7', 'Cmaj7'],
			['viiø7', 'Bm7b5'], ['vii°7', 'Bdim7'], ['bVII', 'Bb'], ['bVI', 'Ab'], ['iv', 'Fm'],
			['II7', 'D7'], ['bII7', 'Db7'], ['imaj7', 'CmMaj7'], ['I+', 'Caug']
		];
		for (const [numeral, chord] of cases) expect(numeralToChord(numeral, C), numeral).toBe(chord);
	});

	it('spells the root from the degree, then simplifies it like every built chord', () => {
		expect(numeralToChord('bIII', { tonic: 'A', mode: 'minor' })).toBe('C');
		expect(numeralToChord('vii°', { tonic: 'E', mode: 'major' })).toBe('D#dim');
		// Cb simplifies to B, as presets do — a chord symbol, not a melodic note.
		expect(numeralToChord('IV', { tonic: 'Gb', mode: 'major' })).toBe('B');
	});

	it('returns null for a numeral that does not parse', () => {
		expect(numeralToChord('nope', C)).toBeNull();
	});
});

describe('numeralOf', () => {
	it('adds the seventh to romanNumeral', () => {
		expect(numeralOf('G7', C)).toBe('V7');
		expect(numeralOf('Dm7', C)).toBe('ii7');
		expect(numeralOf('Fmaj7', C)).toBe('IVmaj7');
		expect(numeralOf('Bm7b5', C)).toBe('viiø7');
		expect(numeralOf('C#dim7', C)).toBe('bii°7');
		expect(numeralOf('G13', C)).toBe('V7'); // extensions fold into their seventh
		expect(numeralOf('G', C)).toBe('V');
	});

	it('is empty for rests and garbage', () => {
		expect(numeralOf('', C)).toBe('');
		expect(numeralOf('xyz', C)).toBe('');
	});
});

describe('round trip — the answer key can never disagree with the chart', () => {
	const keys: KeyInfo[] = NOTE_NAMES.flatMap((tonic) => [
		{ tonic, mode: 'major' as const },
		{ tonic, mode: 'minor' as const }
	]);

	it('numeralOf(numeralToChord(n)) === n for every pool numeral, in all 12 roots and both modes', () => {
		for (const key of keys)
			for (const numeral of POOL) {
				const chord = numeralToChord(numeral, key);
				expect(chord, `${numeral} in ${key.tonic}`).not.toBeNull();
				expect(Chord.get(chord!).empty, `${chord} parses`).toBe(false);
				expect(numeralOf(chord!, key), `${numeral} in ${key.tonic} ${key.mode}`).toBe(numeral);
			}
	});

	it("matches romanNumeral's triad-level numeral (what Sketch's chart prints)", () => {
		for (const key of keys)
			for (const numeral of POOL) {
				const chord = numeralToChord(numeral, key)!;
				const triad = numeral.replace(/maj7$|7$/, '').replace('ø', '°');
				expect(romanNumeral(chord, key), `${numeral} in ${key.tonic}`).toBe(triad);
			}
	});
});

describe('spokenNumeral', () => {
	it('says the quality the case carries, since case is never spoken', () => {
		const cases: [string, string][] = [
			['I', 'one major'],
			['ii', 'two minor'],
			['V', 'five major'],
			['V7', 'five seven'],
			['Imaj7', 'one major seven'],
			['ii7', 'two minor seven'],
			['vii°', 'seven diminished'],
			['vii°7', 'seven diminished seven'],
			['viiø7', 'seven half-diminished'],
			['bVII', 'flat seven major'],
			['#iv°', 'sharp four diminished'],
			['I+', 'one augmented'],
			['imaj7', 'one minor major seven']
		];
		for (const [numeral, spoken] of cases) expect(spokenNumeral(numeral), numeral).toBe(spoken);
	});

	it('tells ii from II and v from V', () => {
		expect(spokenNumeral('ii')).not.toBe(spokenNumeral('II'));
		expect(spokenNumeral('v')).not.toBe(spokenNumeral('V'));
	});

	it('returns what it cannot parse as written', () => {
		expect(spokenNumeral('')).toBe('');
		expect(spokenNumeral('nope')).toBe('nope');
	});
});
