import { describe, it, expect } from 'vitest';
import { beamGroupQuarters, beamGroups, toMeasures, type TimedNote } from './measures';

/** A run of equal notes from `start`, e.g. eighths in 4/4. */
const line = (count: number, dur: number, start = 0, midi: number | null = 60): TimedNote[] =>
	Array.from({ length: count }, (_, i) => ({ atQuarters: start + i * dur, durQuarters: dur, midi }));

describe('toMeasures', () => {
	it('puts eight eighths in each 4/4 bar', () => {
		const m = toMeasures(line(16, 0.5), 4);
		expect(m).toHaveLength(2);
		expect(m.every((x) => x.pieces.length === 8 && x.complete)).toBe(true);
	});

	it('follows the meter: 3/4 bars hold three quarters', () => {
		const m = toMeasures(line(6, 1), 3);
		expect(m.map((x) => x.pieces.length)).toEqual([3, 3]);
	});

	it('leaves a partial last measure open when the line stops mid-bar', () => {
		const m = toMeasures(line(5, 1), 4);
		expect(m.map((x) => [x.pieces.length, x.complete])).toEqual([
			[4, true],
			[1, false]
		]);
	});

	it('counts bars from the start of the run, so a key starting mid-bar opens with a short measure', () => {
		const m = toMeasures(line(6, 1, 2), 4);
		expect(m.map((x) => x.pieces.length)).toEqual([2, 4]);
	});

	it('splits a note across a barline and ties it', () => {
		const m = toMeasures([{ atQuarters: 3, durQuarters: 2, midi: 67 }], 4);
		expect(m[0].pieces).toEqual([{ note: 0, atQuarters: 3, durQuarters: 1, first: true, tieToNext: true }]);
		expect(m[1].pieces).toEqual([{ note: 0, atQuarters: 4, durQuarters: 1, first: false, tieToNext: false }]);
	});

	it('splits a rest across a barline without a tie', () => {
		const m = toMeasures([{ atQuarters: 2, durQuarters: 4, midi: null }], 4);
		expect(m.flatMap((x) => x.pieces).map((p) => [p.durQuarters, p.tieToNext])).toEqual([
			[2, false],
			[2, false]
		]);
	});

	it('loses no time: the pieces add back up to every note', () => {
		const notes: TimedNote[] = [
			{ atQuarters: 0.5, durQuarters: 1.5, midi: 60 },
			{ atQuarters: 2, durQuarters: 3, midi: 62 },
			{ atQuarters: 5, durQuarters: 4, midi: null }
		];
		const pieces = toMeasures(notes, 4).flatMap((x) => x.pieces);
		notes.forEach((n, i) => {
			const total = pieces.filter((p) => p.note === i).reduce((s, p) => s + p.durQuarters, 0);
			expect(total).toBeCloseTo(n.durQuarters);
		});
	});

	it('is safe on an empty line', () => {
		expect(toMeasures([], 4)).toEqual([]);
	});
});

describe('beams', () => {
	const pieces = (notes: TimedNote[], bar = 4) => toMeasures(notes, bar).flatMap((m) => m.pieces);
	const restOf = (notes: TimedNote[]) => (p: { note: number }) => notes[p.note].midi === null;

	it('groups by half a bar in 4/4, a beat in 3/4 and a dotted quarter in 6/8', () => {
		expect(beamGroupQuarters({ numerator: 4, denominator: 4 })).toBe(2);
		expect(beamGroupQuarters({ numerator: 3, denominator: 4 })).toBe(1);
		expect(beamGroupQuarters({ numerator: 6, denominator: 8 })).toBe(1.5);
		expect(beamGroupQuarters({ numerator: 2, denominator: 2 })).toBe(2);
	});

	it('beams a bar of eighths in 4/4 as two groups of four', () => {
		const notes = line(8, 0.5);
		expect(beamGroups(pieces(notes), restOf(notes), 4, 2)).toEqual([
			[0, 1, 2, 3],
			[4, 5, 6, 7]
		]);
	});

	it('never beams across a barline', () => {
		// Starting half a beat before the bar: the last eighth of bar 1 stands alone.
		const notes = line(3, 0.5, 3.5);
		expect(beamGroups(pieces(notes), restOf(notes), 4, 2)).toEqual([[1, 2]]);
	});

	it('breaks at a rest and leaves quarters unbeamed', () => {
		const notes: TimedNote[] = [
			{ atQuarters: 0, durQuarters: 0.5, midi: 60 },
			{ atQuarters: 0.5, durQuarters: 0.5, midi: null },
			{ atQuarters: 1, durQuarters: 0.5, midi: 62 },
			{ atQuarters: 1.5, durQuarters: 0.5, midi: 64 },
			{ atQuarters: 2, durQuarters: 1, midi: 65 }
		];
		expect(beamGroups(pieces(notes), restOf(notes), 4, 2)).toEqual([[2, 3]]);
	});
});
