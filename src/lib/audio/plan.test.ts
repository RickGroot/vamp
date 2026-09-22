import { describe, it, expect } from 'vitest';
import { countInFor } from './plan';

describe('countInFor', () => {
	it('gives one click per beat of the bar', () => {
		expect(countInFor({ numerator: 4, denominator: 4 })).toEqual({
			beats: 4,
			quartersPerBeat: 1
		});
		expect(countInFor({ numerator: 3, denominator: 4 })).toEqual({
			beats: 3,
			quartersPerBeat: 1
		});
	});

	it('scales the click spacing to the beat unit', () => {
		// 6/8: six eighth-note clicks, half a quarter note apart.
		expect(countInFor({ numerator: 6, denominator: 8 })).toEqual({
			beats: 6,
			quartersPerBeat: 0.5
		});
		// 2/2: two half-note clicks, two quarter notes apart.
		expect(countInFor({ numerator: 2, denominator: 2 })).toEqual({
			beats: 2,
			quartersPerBeat: 2
		});
	});

	it('handles odd meters', () => {
		expect(countInFor({ numerator: 7, denominator: 8 })).toEqual({
			beats: 7,
			quartersPerBeat: 0.5
		});
		expect(countInFor({ numerator: 5, denominator: 4 })).toEqual({
			beats: 5,
			quartersPerBeat: 1
		});
	});

	it('spans exactly one bar in quarter notes', () => {
		for (const ts of [
			{ numerator: 4, denominator: 4 },
			{ numerator: 3, denominator: 4 },
			{ numerator: 6, denominator: 8 },
			{ numerator: 7, denominator: 8 },
			{ numerator: 2, denominator: 2 }
		]) {
			const { beats, quartersPerBeat } = countInFor(ts);
			// The pre-roll must be one bar long, or the loop starts off the grid.
			expect(beats * quartersPerBeat).toBeCloseTo((ts.numerator * 4) / ts.denominator, 10);
		}
	});
});
