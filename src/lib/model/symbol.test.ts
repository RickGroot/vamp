import { describe, it, expect } from 'vitest';
import { chordFace } from './symbol';

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
