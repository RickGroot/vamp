import { describe, it, expect } from 'vitest';
import { resolveLoopRange, beatsToQuarters, secondsPerBeat, barBeats } from './time';
import { createProgression, createBar } from './factory';
import type { Progression } from './types';

function progWithBars(count: number, loopRange: Progression['loopRange'] = null): Progression {
	const ts = { numerator: 4, denominator: 4 };
	return createProgression({
		bars: Array.from({ length: count }, () => createBar(ts)),
		loopRange
	});
}

describe('resolveLoopRange', () => {
	it('covers the whole progression when no range is set', () => {
		expect(resolveLoopRange(progWithBars(4))).toEqual({ start: 0, end: 3 });
	});

	it('returns the explicit range', () => {
		expect(resolveLoopRange(progWithBars(4, { startBar: 1, endBar: 2 }))).toEqual({ start: 1, end: 2 });
	});

	it('clamps an out-of-bounds range to the bar count', () => {
		expect(resolveLoopRange(progWithBars(3, { startBar: 1, endBar: 9 }))).toEqual({ start: 1, end: 2 });
	});

	it('keeps start <= end', () => {
		const r = resolveLoopRange(progWithBars(4, { startBar: 2, endBar: 0 }));
		expect(r.start).toBeLessThanOrEqual(r.end);
	});
});

describe('time math', () => {
	it('converts beats to quarter notes by the denominator', () => {
		expect(beatsToQuarters(4, { numerator: 4, denominator: 4 })).toBe(4);
		expect(beatsToQuarters(6, { numerator: 6, denominator: 8 })).toBe(3); // eighth-note beats
	});

	it('seconds-per-beat tracks tempo and meter', () => {
		expect(secondsPerBeat(120, { numerator: 4, denominator: 4 })).toBeCloseTo(0.5);
		expect(secondsPerBeat(120, { numerator: 6, denominator: 8 })).toBeCloseTo(0.25);
	});

	it('barBeats is the numerator', () => {
		expect(barBeats({ numerator: 3, denominator: 4 })).toBe(3);
	});
});
