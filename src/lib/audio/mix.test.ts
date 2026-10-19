import { describe, it, expect } from 'vitest';
import { computeMixLevels, defaultMix, isComping, planMix, type LiveMix, type MixState } from './mix';

const mix = (over: Partial<Record<keyof MixState, Partial<MixState['chords']>>> = {}): MixState => {
	const base = defaultMix();
	for (const lane of ['chords', 'bass', 'drums'] as const) {
		Object.assign(base[lane], over[lane] ?? {});
	}
	return base;
};

describe('computeMixLevels', () => {
	it('full volume by default', () => {
		expect(computeMixLevels(defaultMix())).toEqual({ chords: 1, bass: 1, drums: 1 });
	});

	it('mute silences only that lane', () => {
		expect(computeMixLevels(mix({ bass: { mute: true } }))).toEqual({
			chords: 1,
			bass: 0,
			drums: 1
		});
	});

	it('volume scales the lane', () => {
		expect(computeMixLevels(mix({ chords: { volume: 0.5 } })).chords).toBe(0.5);
	});

	it('solo silences every non-soloed lane (and ignores their mute state)', () => {
		const levels = computeMixLevels(mix({ drums: { solo: true }, chords: { mute: true } }));
		expect(levels).toEqual({ chords: 0, bass: 0, drums: 1 });
	});

	it('a soloed lane stays audible even if also muted', () => {
		const levels = computeMixLevels(mix({ bass: { solo: true, mute: true } }));
		expect(levels.bass).toBe(1);
		expect(levels.chords).toBe(0);
	});

	it('clamps the fader to 0..1', () => {
		const levels = computeMixLevels(mix({ chords: { volume: 2 }, bass: { volume: -1 } }));
		expect(levels.chords).toBe(1);
		expect(levels.bass).toBe(0);
	});
});

describe('isComping (trade fours)', () => {
	it('always comps when trading is off', () => {
		for (const q of [0, 4, 8, 100]) expect(isComping(q, 4, 0)).toBe(true);
	});

	it('alternates blocks of tradeBars bars: band, you, band, …', () => {
		// 4/4 -> 4 quarters per bar, trade every 2 bars.
		// bars 0-1 = band (comp), bars 2-3 = you (space), bars 4-5 = band, …
		expect(isComping(0, 4, 2)).toBe(true); // bar 0
		expect(isComping(4, 4, 2)).toBe(true); // bar 1
		expect(isComping(8, 4, 2)).toBe(false); // bar 2
		expect(isComping(12, 4, 2)).toBe(false); // bar 3
		expect(isComping(16, 4, 2)).toBe(true); // bar 4
	});

	it('trade fours: 4 bars on, 4 bars open', () => {
		expect(isComping(0, 4, 4)).toBe(true); // bar 0
		expect(isComping(15.9, 4, 4)).toBe(true); // bar 3
		expect(isComping(16, 4, 4)).toBe(false); // bar 4
		expect(isComping(28, 4, 4)).toBe(false); // bar 7
		expect(isComping(32, 4, 4)).toBe(true); // bar 8
	});

	it('guards against a zero-length bar', () => {
		expect(isComping(4, 0, 4)).toBe(true);
	});
});

describe('planMix', () => {
	// A Band panel left in a state that would wreck a quiz: chords muted by a
	// bass solo, trade-fours on, the drill lead silenced for "play it yourself".
	const live: LiveMix = {
		levels: computeMixLevels(mix({ bass: { solo: true } })),
		tradeBars: 2,
		leadGain: 0
	};

	it('a live plan plays with the Band panel as it is', () => {
		expect(planMix('live', live)).toBe(live);
		expect(planMix(undefined, live)).toBe(live);
	});

	it('a full plan ignores it: every lane at full, no trading, lead audible', () => {
		expect(planMix('full', live)).toEqual({
			levels: { chords: 1, bass: 1, drums: 1 },
			tradeBars: 0,
			leadGain: 1
		});
	});

	it('never writes back into the live state', () => {
		planMix('full', live);
		expect(live).toEqual({ levels: { chords: 0, bass: 1, drums: 0 }, tradeBars: 2, leadGain: 0 });
	});
});
