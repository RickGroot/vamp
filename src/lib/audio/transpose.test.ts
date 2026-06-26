import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { transposeChordSymbol } from './transpose';
import { isValidChordSymbol } from './chord';

describe('transposeChordSymbol', () => {
	it('transposes the root and keeps the quality', () => {
		expect(transposeChordSymbol('Cmaj7', 2)).toBe('Dmaj7');
		expect(transposeChordSymbol('Dm7', -2)).toBe('Cm7');
		expect(transposeChordSymbol('F#m7b5', 1)).toBe('Gm7b5');
	});

	it('transposes a slash bass too', () => {
		expect(transposeChordSymbol('C/E', 2)).toBe('D/F#');
	});

	it('is a no-op for empty input or zero semitones', () => {
		expect(transposeChordSymbol('', 5)).toBe('');
		expect(transposeChordSymbol('Cmaj7', 0)).toBe('Cmaj7');
	});

	it('produces valid chords across all 12 semitones', () => {
		for (let s = 1; s <= 12; s++) {
			const out = transposeChordSymbol('Am7', s);
			expect(isValidChordSymbol(out)).toBe(true);
		}
	});

	it('round-trips back to the same pitch class', () => {
		const up = transposeChordSymbol('Bbmaj9', 5);
		const back = transposeChordSymbol(up, -5);
		expect(Note.chroma(back.match(/^[A-G][#b]?/)![0])).toBe(Note.chroma('Bb'));
	});
});
