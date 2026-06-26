import { describe, it, expect } from 'vitest';
import { registerTap, bpmFromTaps, TAP_RESET_MS, MAX_TAPS } from './tapTempo';

describe('bpmFromTaps', () => {
	it('returns null with fewer than two taps', () => {
		expect(bpmFromTaps([])).toBeNull();
		expect(bpmFromTaps([1000])).toBeNull();
	});

	it('computes 120 BPM from 500ms intervals', () => {
		expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
	});

	it('computes 60 BPM from 1s intervals', () => {
		expect(bpmFromTaps([0, 1000, 2000])).toBe(60);
	});

	it('averages uneven intervals', () => {
		// intervals 480 and 520 -> avg 500 -> 120
		expect(bpmFromTaps([0, 480, 1000])).toBe(120);
	});
});

describe('registerTap', () => {
	it('appends taps within the window', () => {
		let taps: number[] = [];
		taps = registerTap(taps, 0);
		taps = registerTap(taps, 500);
		taps = registerTap(taps, 1000);
		expect(taps).toEqual([0, 500, 1000]);
	});

	it('resets the window after a long gap', () => {
		let taps = [0, 500, 1000];
		taps = registerTap(taps, 1000 + TAP_RESET_MS + 1);
		expect(taps).toEqual([1000 + TAP_RESET_MS + 1]);
	});

	it('caps the window to MAX_TAPS', () => {
		let taps: number[] = [];
		for (let i = 0; i < MAX_TAPS + 4; i++) taps = registerTap(taps, i * 500);
		expect(taps.length).toBe(MAX_TAPS);
	});
});
