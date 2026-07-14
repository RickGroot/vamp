import { describe, it, expect } from 'vitest';
import { buildCompEvents, type CompSlot } from './comp';
import type { Groove, TimeSignature } from '$lib/model/types';

const TS: TimeSignature = { numerator: 4, denominator: 4 };
const groove = (over: Partial<Groove> = {}): Groove => ({
	pattern: 'block',
	bass: 'none',
	bassInstrument: 'keys',
	metronome: false,
	drums: 'none',
	...over
});

const fullBar = (over: Partial<CompSlot> = {}): CompSlot => ({
	slotIndex: 0,
	startQuarters: 0,
	quarters: 4,
	midi: [60, 64, 67],
	bassMidi: 36,
	bassPcs: [0, 4, 7], // C major triad
	...over
});

describe('buildCompEvents', () => {
	it('block: one held chord per slot', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove());
		expect(ev).toHaveLength(1);
		expect(ev[0]).toMatchObject({ atQuarters: 0, durQuarters: 4, kind: 'chord', slotIndex: 0 });
		expect(ev[0].midi).toEqual([60, 64, 67]);
	});

	it('strum: one hit per beat, only the first drives the highlight', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ pattern: 'strum' }));
		expect(ev).toHaveLength(4);
		expect(ev.map((e) => e.atQuarters)).toEqual([0, 1, 2, 3]);
		expect(ev[0].slotIndex).toBe(0);
		expect(ev.slice(1).every((e) => e.slotIndex === null)).toBe(true);
		expect(ev.every((e) => e.midi.length === 3)).toBe(true);
	});

	it('strum on a half-bar: two hits', () => {
		const ev = buildCompEvents([fullBar({ quarters: 2 })], 2, TS, groove({ pattern: 'strum' }));
		expect(ev).toHaveLength(2);
	});

	it('no event rings past its slot boundary on fractional-beat slots', () => {
		// A 3/4 bar split in two 1.5-beat slots — hit counts round up, so the last
		// hit's duration must be clamped to the boundary instead of spilling over.
		const slots = [
			fullBar({ quarters: 1.5 }),
			fullBar({ slotIndex: 1, startQuarters: 1.5, quarters: 1.5, midi: [65, 69, 72], bassMidi: 41 })
		];
		for (const pattern of ['strum', 'arpeggio'] as const) {
			const ev = buildCompEvents(slots, 3, { numerator: 3, denominator: 4 }, groove({ pattern }));
			for (const e of ev) {
				const slotEnd = e.atQuarters < 1.5 ? 1.5 : 3;
				expect(e.atQuarters + e.durQuarters).toBeLessThanOrEqual(slotEnd + 1e-9);
			}
		}
		for (const bass of ['alt', 'octaves', 'walking'] as const) {
			const ev = buildCompEvents(slots, 3, { numerator: 3, denominator: 4 }, groove({ bass }));
			for (const e of ev.filter((e) => e.kind === 'bass')) {
				const slotEnd = e.atQuarters < 1.5 ? 1.5 : 3;
				expect(e.atQuarters + e.durQuarters).toBeLessThanOrEqual(slotEnd + 1e-9);
			}
		}
	});

	it('arpeggio: eighth-note steps cycling chord tones', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ pattern: 'arpeggio' }));
		expect(ev).toHaveLength(8);
		expect(ev.map((e) => e.midi[0])).toEqual([60, 64, 67, 60, 64, 67, 60, 64]);
		expect(ev.every((e) => e.midi.length === 1)).toBe(true);
	});

	it('root bass: low notes on strong beats', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ bass: 'root' }));
		const bass = ev.filter((e) => e.kind === 'bass');
		expect(bass).toHaveLength(2); // beat 1 and bar midpoint
		expect(bass.map((e) => e.atQuarters)).toEqual([0, 2]);
		expect(bass.every((e) => e.midi[0] === 36)).toBe(true);
	});

	it('alternating bass: root / fifth on every beat', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ bass: 'alt' }));
		const bass = ev.filter((e) => e.kind === 'bass');
		expect(bass.map((e) => e.atQuarters)).toEqual([0, 1, 2, 3]);
		expect(bass.map((e) => e.midi[0])).toEqual([36, 43, 36, 43]); // root, fifth, ...
	});

	it('octave bass: root / upper octave on every beat', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ bass: 'octaves' }));
		const bass = ev.filter((e) => e.kind === 'bass');
		expect(bass.map((e) => e.midi[0])).toEqual([36, 48, 36, 48]);
	});

	it('walking bass: a note per beat, root on 1, chromatic approach on the last beat', () => {
		// Two bars (C → G) so the line leads into a real next root.
		const c = fullBar();
		const g = fullBar({ slotIndex: 1, startQuarters: 4, bassMidi: 43, bassPcs: [7, 11, 2] });
		const ev = buildCompEvents([c, g], 8, TS, groove({ bass: 'walking' }));
		const bass = ev.filter((e) => e.kind === 'bass');
		expect(bass).toHaveLength(8); // 4 beats per bar
		expect(bass.map((e) => e.atQuarters)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(bass[0].midi[0]).toBe(36); // bar 1 starts on the root C
		expect(bass[4].midi[0]).toBe(43); // bar 2 starts on the root G
		// Last beat of bar 1 leads chromatically into G (43): a half step away.
		expect(Math.abs(bass[3].midi[0] - 43)).toBe(1);
	});

	it('metronome: a click per beat, accent on the downbeat', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ metronome: true }));
		const clicks = ev.filter((e) => e.kind === 'click');
		expect(clicks).toHaveLength(4);
		expect(clicks[0].accent).toBe(true);
		expect(clicks.slice(1).every((e) => e.accent === false)).toBe(true);
	});

	it('drums: emits kick / snare / hihat hits within each bar', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ drums: 'rock' }));
		const drums = ev.filter((e) => e.kind === 'drum');
		expect(drums.length).toBeGreaterThan(0);
		const names = new Set(drums.map((d) => d.drum));
		expect(names.has('kick')).toBe(true);
		expect(names.has('snare')).toBe(true);
		expect(names.has('hihat')).toBe(true);
		expect(drums.every((d) => d.atQuarters < 4)).toBe(true);
	});

	it('rest: still emits a highlight event with no notes and no bass', () => {
		const ev = buildCompEvents([fullBar({ midi: [], bassMidi: null })], 4, TS, groove({ bass: 'root' }));
		expect(ev).toHaveLength(1);
		expect(ev[0].midi).toEqual([]);
		expect(ev[0].slotIndex).toBe(0);
	});
});
