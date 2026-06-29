import { describe, it, expect } from 'vitest';
import { SCALE_TYPES, getScaleInfo, scalesForChord, scaleStaffKeys } from './scales';

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

describe('scaleStaffKeys', () => {
	it('C major ascends c/4 … b/4, octave root c/5', () => {
		const keys = scaleStaffKeys(getScaleInfo('C', 'major').notes);
		expect(keys.map((k) => k.key)).toEqual([
			'c/4', 'd/4', 'e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5'
		]);
		expect(keys.every((k) => k.accidental === null)).toBe(true);
	});

	it('preserves spelling + climbs octave (E major)', () => {
		const keys = scaleStaffKeys(getScaleInfo('E', 'major').notes);
		expect(keys.map((k) => k.key)).toEqual([
			'e/4', 'f#/4', 'g#/4', 'a/4', 'b/4', 'c#/5', 'd#/5', 'e/5'
		]);
		expect(keys[1].accidental).toBe('#');
	});

	it('uses flats where the scale is spelled flat (Eb major)', () => {
		const keys = scaleStaffKeys(getScaleInfo('Eb', 'major').notes);
		expect(keys[0].key).toBe('eb/4');
		expect(keys.some((k) => k.accidental === 'b')).toBe(true);
	});
});
