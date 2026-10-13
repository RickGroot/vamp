import { describe, it, expect } from 'vitest';
import { placeLabels } from './labels';

describe('placeLabels', () => {
	it('centres a name on its note when there is room', () => {
		expect(placeLabels([{ x: 200, w: 40, min: 100 }], 600)).toEqual([180]);
	});

	it('never starts a name left of its bar’s note area (the clef at a row start)', () => {
		// A wide name on the first note after the clef: centring would start it at 60,
		// over the clef, which ends where the note area starts (90).
		const [left] = placeLabels([{ x: 100, w: 80, min: 90 }], 600);
		expect(left).toBe(90);
	});

	it('keeps neighbouring names apart', () => {
		const lefts = placeLabels(
			[
				{ x: 100, w: 60, min: 80 },
				{ x: 130, w: 60, min: 80 }
			],
			600,
			6
		);
		expect(lefts[0]).toBe(80);
		expect(lefts[1]).toBeGreaterThanOrEqual(lefts[0] + 60 + 6);
	});

	it('pulls a name in from the right edge', () => {
		const [left] = placeLabels([{ x: 590, w: 40, min: 500 }], 600);
		expect(left + 40).toBeLessThanOrEqual(600);
	});

	it('lets the clef constraint win over the right edge when both cannot hold', () => {
		const [left] = placeLabels([{ x: 300, w: 200, min: 290 }], 400);
		expect(left).toBe(290);
	});

	it('handles an empty row', () => {
		expect(placeLabels([], 600)).toEqual([]);
	});
});
