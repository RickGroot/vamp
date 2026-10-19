import { describe, it, expect } from 'vitest';
import { gradeAnswer, sameNumeral } from './grade';
import type { FunctionQuestion, LoopQuestion, QualityQuestion } from './quiz';

const fn: FunctionQuestion = {
	kind: 'function',
	itemId: 'fn-three-chords',
	key: { tonic: 'C', mode: 'major' },
	chords: ['F', 'G', 'C'],
	answer: ['IV', 'V', 'I'],
	options: ['I', 'IV', 'V']
};

describe('sameNumeral', () => {
	it('matches the same chord, and only the same chord', () => {
		expect(sameNumeral('V7', 'V7')).toBe(true);
		expect(sameNumeral('bVII', 'bVII')).toBe(true);
		expect(sameNumeral('V', 'V7')).toBe(false);
		expect(sameNumeral('ii', 'II')).toBe(false); // case is the quality
		expect(sameNumeral('bVII', 'VII')).toBe(false);
		expect(sameNumeral('#IV', 'bV')).toBe(true); // same chord, other spelling
		expect(sameNumeral('', '')).toBe(true);
		expect(sameNumeral('nonsense', 'V')).toBe(false);
	});
});

describe('gradeAnswer', () => {
	it('marks each position of a function answer', () => {
		expect(gradeAnswer(fn, ['IV', 'V', 'I'])).toEqual({ correct: true, marks: [true, true, true] });
		expect(gradeAnswer(fn, ['IV', 'I', 'V'])).toEqual({ correct: false, marks: [true, false, false] });
	});

	it('never passes a short or long answer', () => {
		expect(gradeAnswer(fn, ['IV', 'V'])).toEqual({ correct: false, marks: [true, true, false] });
		expect(gradeAnswer(fn, ['IV', 'V', 'I', 'I']).correct).toBe(false);
		expect(gradeAnswer(fn, []).correct).toBe(false);
	});

	it('marks a single choice', () => {
		const loop: LoopQuestion = {
			kind: 'loop',
			itemId: 'loop-pop',
			key: { tonic: 'C', mode: 'major' },
			chords: ['C', 'G', 'Am', 'F'],
			answer: 'axis',
			options: ['axis', 'doowop', 'hopscotch', 'royal-road']
		};
		expect(gradeAnswer(loop, ['axis'])).toEqual({ correct: true, marks: [true] });
		expect(gradeAnswer(loop, ['doowop'])).toEqual({ correct: false, marks: [false] });
		const quality: QualityQuestion = {
			kind: 'quality',
			itemId: 'quality-triads',
			key: null,
			chords: ['Caug'],
			answer: 'aug',
			options: ['major', 'minor', 'dim', 'aug']
		};
		expect(gradeAnswer(quality, ['aug']).correct).toBe(true);
		expect(gradeAnswer(quality, ['aug', 'aug']).correct).toBe(false);
	});
});
