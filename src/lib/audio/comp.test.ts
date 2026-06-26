import { describe, it, expect } from 'vitest';
import { buildCompEvents, type CompSlot } from './comp';
import type { Groove, TimeSignature } from '$lib/model/types';

const TS: TimeSignature = { numerator: 4, denominator: 4 };
const groove = (over: Partial<Groove> = {}): Groove => ({
	pattern: 'block',
	bass: false,
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

	it('arpeggio: eighth-note steps cycling chord tones', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ pattern: 'arpeggio' }));
		expect(ev).toHaveLength(8);
		expect(ev.map((e) => e.midi[0])).toEqual([60, 64, 67, 60, 64, 67, 60, 64]);
		expect(ev.every((e) => e.midi.length === 1)).toBe(true);
	});

	it('bass: adds low notes on strong beats', () => {
		const ev = buildCompEvents([fullBar()], 4, TS, groove({ bass: true }));
		const bass = ev.filter((e) => e.kind === 'bass');
		expect(bass).toHaveLength(2); // beat 1 and bar midpoint
		expect(bass.map((e) => e.atQuarters)).toEqual([0, 2]);
		expect(bass.every((e) => e.midi[0] === 36)).toBe(true);
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
		const ev = buildCompEvents([fullBar({ midi: [], bassMidi: null })], 4, TS, groove({ bass: true }));
		expect(ev).toHaveLength(1);
		expect(ev[0].midi).toEqual([]);
		expect(ev[0].slotIndex).toBe(0);
	});
});
