import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { guideToneLine } from './guideTones';
import type { DrillChord } from './types';

const TS = { numerator: 4, denominator: 4 };
const chroma = (m: number) => ((m % 12) + 12) % 12;

/** A ii-V-I in C, one chord per bar. */
const iiVI: DrillChord[] = [
	{ symbol: 'Dm7', beats: 4 },
	{ symbol: 'G7', beats: 4 },
	{ symbol: 'Cmaj7', beats: 4 }
];

const line = (chords: DrillChord[], over: Partial<Parameters<typeof guideToneLine>[0]> = {}) =>
	guideToneLine({
		chords,
		line: 'guide',
		timeSignature: TS,
		target: 65, // F4 — mid-range seed
		startQuarters: 0,
		rep: 0,
		...over
	});

describe('guideToneLine — the textbook lines', () => {
	// Nearest-note motion alone must produce the classic 3-7-3: the F is a common
	// tone (the 3rd of Dm7 IS the 7th of G7), and G7's 7th falls a semitone to
	// the 3rd of Cmaj7. No special-casing.
	it('traces 3-7-3 through a ii-V-I', () => {
		const got = line(iiVI);
		expect(got.map((n) => n.role)).toEqual(['third', 'seventh', 'third']);
		expect(got.map((n) => n.name)).toEqual(['F', 'F', 'E']);
		// A guide-tone line never leaps.
		for (let i = 1; i < got.length; i++) {
			expect(Math.abs(got[i].midi! - got[i - 1].midi!)).toBeLessThanOrEqual(2);
		}
	});

	it('traces 7-3-7 when seeded lower', () => {
		// Seeded near C4, the line starts on the 7th instead and gives the other
		// classic shape: the 7th of ii falls to the 3rd of V, which is the leading
		// tone that becomes the 7th of I.
		const got = line(iiVI, { target: 60 });
		expect(got.map((n) => n.role)).toEqual(['seventh', 'third', 'seventh']);
		expect(got.map((n) => n.name)).toEqual(['C', 'B', 'B']);
	});

	it('picks genuinely the 3rd or 7th of each chord', () => {
		for (const note of line(iiVI)) {
			const chordNotes = Chord.get(note.chord!).notes;
			const index = note.role === 'third' ? 1 : 3;
			expect(chroma(note.midi!)).toBe(Note.chroma(chordNotes[index]));
		}
	});

	it('steps by small intervals across a longer sequence', () => {
		const changes: DrillChord[] = [
			'Cmaj7',
			'A7',
			'Dm7',
			'G7',
			'Em7',
			'A7',
			'Dm7',
			'G7',
			'Cmaj7'
		].map((symbol) => ({ symbol, beats: 4 }));
		const got = line(changes).filter((n) => n.midi !== null);
		for (let i = 1; i < got.length; i++) {
			expect(Math.abs(got[i].midi! - got[i - 1].midi!)).toBeLessThanOrEqual(4);
		}
	});
});

describe('guideToneLine — the other lines', () => {
	it('thirds only', () => {
		const got = line(iiVI, { line: 'thirds' });
		expect(got.every((n) => n.role === 'third')).toBe(true);
		expect(got.map((n) => n.name)).toEqual(['F', 'B', 'E']);
	});

	it('sevenths only', () => {
		const got = line(iiVI, { line: 'sevenths' });
		expect(got.every((n) => n.role === 'seventh')).toBe(true);
		expect(got.map((n) => n.name)).toEqual(['C', 'F', 'B']);
	});

	it('roots only — the easy level', () => {
		const got = line(iiVI, { line: 'roots' });
		expect(got.every((n) => n.role === 'root')).toBe(true);
		expect(got.map((n) => n.name)).toEqual(['D', 'G', 'C']);
	});
});

describe('guideToneLine — real charts are messy', () => {
	it('emits a rest for a blank slot and keeps the line going across it', () => {
		const withRest: DrillChord[] = [
			{ symbol: 'Dm7', beats: 4 },
			{ symbol: '', beats: 4 },
			{ symbol: 'Cmaj7', beats: 4 }
		];
		const got = withRest.length ? line(withRest) : [];
		expect(got[1].midi).toBeNull();
		expect(got[1].role).toBe('rest');
		// The rest must NOT reset the voice leading — the note after it still
		// steps from where the line actually was.
		expect(Math.abs(got[2].midi! - got[0].midi!)).toBeLessThanOrEqual(2);
	});

	it('falls back to the 5th on a triad instead of emitting nothing', () => {
		const triads: DrillChord[] = [
			{ symbol: 'C', beats: 4 },
			{ symbol: 'F', beats: 4 },
			{ symbol: 'G', beats: 4 }
		];
		const got = triads.map((c) => line([c])[0]);
		expect(got.every((n) => n.midi !== null)).toBe(true);
		expect(got.every((n) => n.name !== '')).toBe(true);
	});

	it('rests on a chord tonal cannot read, rather than throwing', () => {
		const got = line([{ symbol: 'Hqq#9zz', beats: 4 }]);
		expect(got).toHaveLength(1);
		expect(got[0].midi).toBeNull();
		expect(got[0].role).toBe('rest');
	});

	it('lays the line out against the chord durations', () => {
		const mixed: DrillChord[] = [
			{ symbol: 'Dm7', beats: 2 },
			{ symbol: 'G7', beats: 2 },
			{ symbol: 'Cmaj7', beats: 4 }
		];
		const got = line(mixed);
		expect(got.map((n) => n.atQuarters)).toEqual([0, 2, 4]);
		expect(got.map((n) => n.durQuarters)).toEqual([2, 2, 4]);
	});

	it('scales durations to a non-4/4 meter', () => {
		const got = line([{ symbol: 'Dm7', beats: 6 }], {
			timeSignature: { numerator: 6, denominator: 8 }
		});
		expect(got[0].durQuarters).toBe(3);
	});

	it('returns nothing for no changes', () => {
		expect(line([])).toEqual([]);
	});
});

// The regression: a real-length tune. Nearest-note voice leading is path-
// dependent — it need not come back to its starting pitch after one pass of a
// form. This 16-bar form starts each chorus LOWER (65, 60, 48, 36 unbounded), so
// over 64 changes the line spans 46 semitones: past a trumpet's whole range, which
// got the phrase rejected in EVERY key and left the drill empty. (An 8-bar form
// happens to return home each time and never drifts — the bug is form-dependent,
// which is why it only showed up on a real tune.)
describe('guideToneLine — long tunes stay playable', () => {
	const form = [
		'Dm7', 'G7', 'Cmaj7', 'Am7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7',
		'Gm7', 'C7', 'Fmaj7', 'Fm7', 'Em7', 'A7', 'Dm7', 'G7'
	];
	const standard: DrillChord[] = Array.from({ length: 64 }, (_, i) => ({
		symbol: form[i % form.length],
		beats: 2
	}));
	const TRUMPET = { min: 54, max: 84 }; // written F#3..C6

	it('drifts out of range without a range to fold into (the bug, documented)', () => {
		const got = line(standard).map((n) => n.midi!);
		expect(Math.max(...got) - Math.min(...got)).toBeGreaterThan(TRUMPET.max - TRUMPET.min);
	});

	it('stays inside the range when given one', () => {
		for (const n of line(standard, { range: TRUMPET })) {
			expect(n.midi).toBeGreaterThanOrEqual(TRUMPET.min);
			expect(n.midi).toBeLessThanOrEqual(TRUMPET.max);
		}
	});

	it('only ever folds by whole octaves, so spelling and pitch stay in step', () => {
		const free = line(standard);
		const folded = line(standard, { range: TRUMPET });
		// Same line, note for note — just moved by octaves where it ran out of room.
		folded.forEach((n, i) => {
			expect(Math.abs(n.midi! - free[i].midi!) % 12).toBe(0);
			expect(n.name).toBe(free[i].name);
		});
	});

	it('still voice-leads by step everywhere except the fold points', () => {
		const got = line(standard, { range: TRUMPET }).map((n) => n.midi!);
		const leaps = got.slice(1).map((m, i) => Math.abs(m - got[i]));
		// Every move is either a small step, or an octave fold minus a small step.
		expect(leaps.every((d) => d <= 4 || (d >= 8 && d <= 12))).toBe(true);
		// And folds are rare — the line mostly flows.
		expect(leaps.filter((d) => d > 4).length).toBeLessThan(got.length / 8);
	});
});
