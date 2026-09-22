import { describe, it, expect } from 'vitest';
import { buildScheduledEvents, progressionPlan } from './schedule';
import { countInFor } from './plan';
import { createBar, createProgression, createSlot } from '$lib/model/factory';
import type { BassInstrumentId, BassMode, DrumStyle, Progression } from '$lib/model/types';

const song = (over: Partial<Progression> = {}): Progression =>
	createProgression({
		tempo: 132,
		bars: [
			createBar(undefined, [createSlot('Cmaj7', 4)]),
			createBar(undefined, [createSlot('Dm7', 2), createSlot('G7', 2)])
		],
		...over
	});

describe('progressionPlan', () => {
	it('declares itself as a progression so stores can tell it from a drill', () => {
		expect(progressionPlan(song()).source).toBe('progression');
	});

	it('carries the progression tempo', () => {
		expect(progressionPlan(song({ tempo: 88 })).tempo).toBe(88);
	});

	describe('quartersPerBar (drives the trade-fours windows)', () => {
		const cases: [number, number, number][] = [
			[4, 4, 4],
			[3, 4, 3],
			[6, 8, 3],
			[5, 4, 5],
			[2, 2, 4],
			[7, 8, 3.5]
		];
		for (const [numerator, denominator, expected] of cases) {
			it(`${numerator}/${denominator} → ${expected}`, () => {
				const p = song({ timeSignature: { numerator, denominator } });
				expect(progressionPlan(p).quartersPerBar).toBe(expected);
			});
		}
	});

	// The highest-value table here: this is the one place where a typo produces
	// *wrong audio* (bass through the piano, or a sample set loaded for nothing)
	// rather than a crash.
	describe('voices', () => {
		it('always loads the chord instrument', () => {
			expect(progressionPlan(song({ instrument: 'rhodes' })).voices.chords).toBe('rhodes');
			expect(progressionPlan(song({ instrument: 'guitar' })).voices.chords).toBe('guitar');
		});

		const bassCases: [BassMode, BassInstrumentId, string | null][] = [
			// No bass line at all → no dedicated voice, whatever the instrument says.
			['none', 'upright', null],
			['none', 'keys', null],
			// 'keys' deliberately routes the bass through the chord instrument.
			['root', 'keys', null],
			['walking', 'keys', null],
			// A real bass mode with a real bass voice → load it.
			['root', 'upright', 'upright'],
			['alt', 'electric', 'electric'],
			['walking', 'synth', 'synth'],
			['octaves', 'upright', 'upright']
		];
		for (const [bass, bassInstrument, expected] of bassCases) {
			it(`bass '${bass}' + '${bassInstrument}' → ${expected ?? 'null'}`, () => {
				const p = song({
					groove: {
						pattern: 'block',
						bass,
						bassInstrument,
						metronome: false,
						drums: 'none'
					}
				});
				expect(progressionPlan(p).voices.bass).toBe(expected);
			});
		}

		const drumCases: [DrumStyle, boolean][] = [
			['none', false],
			['rock', true],
			['pop', true],
			['swing', true],
			['bossa', true]
		];
		for (const [drums, expected] of drumCases) {
			it(`drums '${drums}' → ${expected}`, () => {
				const p = song({
					groove: {
						pattern: 'block',
						bass: 'none',
						bassInstrument: 'keys',
						metronome: false,
						drums
					}
				});
				expect(progressionPlan(p).voices.drums).toBe(expected);
			});
		}
	});

	describe('countIn', () => {
		it('is null unless asked for', () => {
			expect(progressionPlan(song()).countIn).toBeNull();
			expect(progressionPlan(song(), { countIn: false }).countIn).toBeNull();
		});

		it('is one bar of the progression meter when asked for', () => {
			const ts = { numerator: 6, denominator: 8 };
			const p = song({ timeSignature: ts });
			expect(progressionPlan(p, { countIn: true }).countIn).toEqual(countInFor(ts));
		});
	});

	describe('events', () => {
		it('matches buildScheduledEvents for the same clickFeel', () => {
			const p = song({
				groove: {
					pattern: 'block',
					bass: 'root',
					bassInstrument: 'upright',
					metronome: true,
					drums: 'rock'
				}
			});
			const direct = buildScheduledEvents(p, { clickFeel: 'backbeat' });
			const plan = progressionPlan(p, { clickFeel: 'backbeat' });
			expect(plan.events).toEqual(direct.events);
			expect(plan.totalQuarters).toBe(direct.totalQuarters);
		});

		it('honours loopRange (playback covers the loop, not the whole song)', () => {
			const p = song({ loopRange: { startBar: 1, endBar: 1 } });
			// Bar 1 alone is 4 quarters; the whole song is 8.
			expect(progressionPlan(p).totalQuarters).toBe(4);
			expect(buildScheduledEvents(p, { whole: true }).totalQuarters).toBe(8);
		});

		// The two highlight channels must stay disjoint: `slotIndex` is the
		// flattenSlots global index the progression UI keys on, `cueIndex` belongs
		// to generated plans only. A progression must never emit the latter.
		it('never emits lead events or cue indices', () => {
			const p = song({
				groove: {
					pattern: 'arpeggio',
					bass: 'walking',
					bassInstrument: 'upright',
					metronome: true,
					drums: 'swing'
				}
			});
			const { events } = progressionPlan(p, { clickFeel: 'all' });
			expect(events.length).toBeGreaterThan(0);
			expect(events.every((e) => e.kind !== 'lead')).toBe(true);
			expect(events.every((e) => e.cueIndex === undefined)).toBe(true);
		});
	});
});
