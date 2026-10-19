import { describe, it, expect } from 'vitest';
import { chordFace, spokenChord } from './symbol';

describe('chordFace', () => {
	it('splits root and quality', () => {
		expect(chordFace('Cm7')).toEqual({ root: 'C', quality: 'm7', bass: '' });
		expect(chordFace('D7')).toEqual({ root: 'D', quality: '7', bass: '' });
		expect(chordFace('F')).toEqual({ root: 'F', quality: '', bass: '' });
	});

	it('prints accidentals on the root as real flats and sharps', () => {
		expect(chordFace('Bbmaj7')).toEqual({ root: 'B♭', quality: 'maj7', bass: '' });
		expect(chordFace('F#m7')).toEqual({ root: 'F♯', quality: 'm7', bass: '' });
	});

	it('only treats a b before a degree as a flat inside the quality', () => {
		expect(chordFace('Am7b5')?.quality).toBe('m7♭5');
		expect(chordFace('G7b9#11')?.quality).toBe('7♭9♯11');
		// The letters of dim, sus, add and maj stay letters.
		expect(chordFace('Edim7')?.quality).toBe('dim7');
		expect(chordFace('Gsus4')?.quality).toBe('sus4');
		expect(chordFace('Cadd9')?.quality).toBe('add9');
	});

	it('sets a slash bass apart, but keeps 6/9 as a quality', () => {
		expect(chordFace('Cm7/Eb')).toEqual({ root: 'C', quality: 'm7', bass: 'E♭' });
		expect(chordFace('C/G')).toEqual({ root: 'C', quality: '', bass: 'G' });
		expect(chordFace('C6/9')).toEqual({ root: 'C', quality: '6/9', bass: '' });
	});

	it('returns null for a rest or a symbol that is not a chord', () => {
		expect(chordFace('')).toBeNull();
		expect(chordFace('   ')).toBeNull();
		expect(chordFace('N.C.')).toBeNull();
		expect(chordFace('hello')).toBeNull();
	});

	it('trims surrounding whitespace', () => {
		expect(chordFace('  Gm7 ')).toEqual({ root: 'G', quality: 'm7', bass: '' });
	});
});

describe('spokenChord', () => {
	it('says the chord a musician would say', () => {
		const cases: [string, string][] = [
			['C', 'C major'],
			['Am', 'A minor'],
			['Ebm7', 'E flat minor seven'],
			['G7', 'G seven'],
			['Fmaj7', 'F major seven'],
			['Bm7b5', 'B half-diminished'],
			['C#dim7', 'C sharp diminished seven'],
			['Caug', 'C augmented'],
			['CmMaj7', 'C minor major seven'],
			['C6/9', 'C six nine'],
			['D9', 'D nine'],
			['Gsus4', 'G sus four'],
			['G7sus4', 'G seven sus four'],
			['Cadd9', 'C add nine'],
			['G7b9', 'G seven flat nine'],
			['Fmaj7#11', 'F major seven sharp eleven'],
			['A13', 'A thirteen'],
			['E7alt', 'E seven altered']
		];
		for (const [symbol, spoken] of cases) expect(spokenChord(symbol), symbol).toBe(spoken);
	});

	it('reads a slash bass as "over"', () => {
		expect(spokenChord('Cm7/Eb')).toBe('C minor seven over E flat');
		expect(spokenChord('C/G')).toBe('C major over G');
	});

	it('returns anything that is not a chord as typed', () => {
		expect(spokenChord('')).toBe('');
		expect(spokenChord('N.C.')).toBe('N.C.');
	});

	it('never lets a raw flat or sharp sign through for an ordinary chord', () => {
		for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'])
			for (const q of ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim7', '7b9', '7#9', '13'])
				expect(spokenChord(root + q), root + q).not.toMatch(/[b#♭♯]\b|[#♭♯]/);
	});
});
