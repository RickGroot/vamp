import { describe, it, expect } from 'vitest';
import { SCALE_TYPES, getScaleInfo, scalesForChord } from './scales';

describe('getScaleInfo', () => {
	it('C major', () => {
		const s = getScaleInfo('C', 'major');
		expect(s.notes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
		expect(s.pcs).toEqual([0, 2, 4, 5, 7, 9, 11]);
		expect(s.rootPc).toBe(0);
	});

	it('every curated scale type resolves to notes', () => {
		for (const t of SCALE_TYPES) {
			const s = getScaleInfo('C', t.id);
			expect(s.empty, `${t.id} should not be empty`).toBe(false);
			expect(s.notes.length).toBeGreaterThanOrEqual(5);
		}
	});

	it('respects the root spelling', () => {
		expect(getScaleInfo('Eb', 'major').notes[0]).toBe('Eb');
	});
});

describe('scalesForChord', () => {
	it('major chord → major-family scales rooted on the chord', () => {
		const r = scalesForChord('Cmaj7');
		expect(r?.root).toBe('C');
		expect(r?.types).toContain('major');
		expect(r?.types).toContain('lydian');
	});

	it('minor chord → dorian/minor', () => {
		const r = scalesForChord('Am7');
		expect(r?.root).toBe('A');
		expect(r?.types).toContain('dorian');
	});

	it('dominant → mixolydian/blues', () => {
		const r = scalesForChord('G7');
		expect(r?.types).toContain('mixolydian');
		expect(r?.types).toContain('blues');
	});

	it('half-diminished → locrian', () => {
		const r = scalesForChord('Bm7b5');
		expect(r?.root).toBe('B');
		expect(r?.types).toContain('locrian');
	});

	it('returns null for an empty/invalid symbol', () => {
		expect(scalesForChord('')).toBeNull();
		expect(scalesForChord('xyz')).toBeNull();
	});
});
