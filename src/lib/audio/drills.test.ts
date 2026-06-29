import { describe, it, expect } from 'vitest';
import { clickAtBeat, nextStepTempo, keyCycleInterval } from './drills';

describe('clickAtBeat', () => {
	it('all: clicks every beat', () => {
		expect([0, 1, 2, 3].map((b) => clickAtBeat(b, 'all'))).toEqual([true, true, true, true]);
	});
	it('backbeat: clicks 2 & 4 (0-based 1,3)', () => {
		expect([0, 1, 2, 3].map((b) => clickAtBeat(b, 'backbeat'))).toEqual([
			false,
			true,
			false,
			true
		]);
	});
	it('downbeat: clicks only beat 1', () => {
		expect([0, 1, 2, 3].map((b) => clickAtBeat(b, 'downbeat'))).toEqual([
			true,
			false,
			false,
			false
		]);
	});
});

describe('nextStepTempo', () => {
	it('adds the step', () => {
		expect(nextStepTempo(120, 5, 300)).toBe(125);
	});
	it('caps at max', () => {
		expect(nextStepTempo(298, 5, 300)).toBe(300);
		expect(nextStepTempo(300, 5, 300)).toBe(300);
	});
	it('rounds', () => {
		expect(nextStepTempo(120.4, 2.2, 300)).toBe(123);
	});
});

describe('keyCycleInterval', () => {
	it('fourths = +5, semitone = +1, off = 0', () => {
		expect(keyCycleInterval('fourths')).toBe(5);
		expect(keyCycleInterval('semitone')).toBe(1);
		expect(keyCycleInterval('off')).toBe(0);
	});
	it('random is a non-zero interval within an octave', () => {
		for (const r of [0, 0.5, 0.999]) {
			const n = keyCycleInterval('random', () => r);
			expect(n).toBeGreaterThanOrEqual(1);
			expect(n).toBeLessThanOrEqual(11);
		}
	});
});
