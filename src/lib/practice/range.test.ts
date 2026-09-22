import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { fitOctave, foldIntoRange, rangeFor, INSTRUMENT_RANGES } from './range';
import type { WrittenRange } from './types';

const TRUMPET: WrittenRange = { min: Note.midi('F#3')!, max: Note.midi('C6')! }; // 54..84
const chroma = (m: number) => ((m % 12) + 12) % 12;

describe('rangeFor', () => {
	it('resolves every preset to a sane ascending range', () => {
		for (const preset of INSTRUMENT_RANGES) {
			const r = rangeFor(preset.id);
			expect(r.min).toBeLessThan(r.max);
			expect(r.min).toBeGreaterThan(20);
			expect(r.max).toBeLessThan(110);
		}
	});

	it('falls back rather than returning nonsense for an unknown id', () => {
		expect(rangeFor('not-an-instrument')).toEqual(rangeFor(INSTRUMENT_RANGES[0].id));
	});
});

describe('fitOctave', () => {
	// THE invariant: a DrillNote carries a spelling and a midi that must agree, so
	// every adjustment has to be a whole number of octaves. This one assertion
	// covers the entire name/midi desync failure class.
	it('only ever shifts by whole octaves', () => {
		for (const raw of [[60, 62, 64, 67], [40, 44, 47], [90, 92, 95], [54, 84]]) {
			const fitted = fitOctave(raw, TRUMPET, 'middle');
			if (!fitted.fit) continue;
			raw.forEach((m, i) => expect(Math.abs(fitted.midis[i] - m) % 12).toBe(0));
		}
	});

	it('never changes a pitch class (it folds, it does not clamp)', () => {
		// A clamp would turn a Bb near the floor into a C — see nearestMidi.
		const raw = [34, 38, 41]; // well below the trumpet's written floor
		const fitted = fitOctave(raw, TRUMPET, 'middle');
		expect(fitted.fit).toBe(true);
		if (!fitted.fit) return;
		raw.forEach((m, i) => expect(chroma(fitted.midis[i])).toBe(chroma(m)));
	});

	it('lands everything inside the range', () => {
		for (const raw of [[20, 24, 27], [100, 103, 107], [60, 64, 67]]) {
			const fitted = fitOctave(raw, TRUMPET, 'middle');
			expect(fitted.fit).toBe(true);
			if (!fitted.fit) return;
			for (const m of fitted.midis) {
				expect(m).toBeGreaterThanOrEqual(TRUMPET.min);
				expect(m).toBeLessThanOrEqual(TRUMPET.max);
			}
		}
	});

	it('places low / middle / high at non-decreasing centroids', () => {
		const raw = [60, 62, 64, 67];
		const centroid = (ms: number[]) => ms.reduce((a, b) => a + b, 0) / ms.length;
		const got = (['low', 'middle', 'high'] as const).map((reg) => {
			const f = fitOctave(raw, TRUMPET, reg);
			expect(f.fit).toBe(true);
			return f.fit ? centroid(f.midis) : NaN;
		});
		expect(got[0]).toBeLessThanOrEqual(got[1]);
		expect(got[1]).toBeLessThanOrEqual(got[2]);
	});

	it('fails rather than truncating a phrase wider than the range', () => {
		const narrow: WrittenRange = { min: 60, max: 71 }; // one octave
		const threeOctaves = [48, 60, 72, 84];
		const fitted = fitOctave(threeOctaves, narrow, 'middle');
		expect(fitted).toEqual({ fit: false, reason: 'span' });
	});

	it('reports an octave failure when nothing aligns to a 12-semitone window', () => {
		// Width 13, span 12 — fits by width, but only one shift could work and the
		// bounds are chosen so none does.
		const range: WrittenRange = { min: 61, max: 74 };
		const fitted = fitOctave([60, 72], range, 'middle');
		expect(fitted.fit).toBe(false);
		if (fitted.fit) return;
		expect(fitted.reason).toBe('octave');
	});

	it('handles an empty phrase without throwing', () => {
		expect(fitOctave([], TRUMPET, 'middle')).toEqual({ fit: true, shift: 0, midis: [] });
	});
});

describe('foldIntoRange', () => {
	it('folds by octaves and preserves the pitch class', () => {
		for (const m of [20, 34, 59, 88, 100, 120]) {
			const folded = foldIntoRange(m, TRUMPET);
			expect(chroma(folded)).toBe(chroma(m));
			expect(folded).toBeGreaterThanOrEqual(TRUMPET.min);
			expect(folded).toBeLessThanOrEqual(TRUMPET.max);
			expect(Math.abs(folded - m) % 12).toBe(0);
		}
	});

	it('leaves an in-range note untouched', () => {
		expect(foldIntoRange(67, TRUMPET)).toBe(67);
	});
});
