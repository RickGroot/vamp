import { describe, it, expect } from 'vitest';
import { migrateDrill } from './drillDb';
import { BUILT_IN_DRILLS, GUIDE_TONE_DRILLS } from '$lib/practice/patterns';
import { resolveDrill } from '$lib/practice/resolve';
import { rangeFor } from '$lib/practice/range';
import type { DrillRunOptions } from '$lib/practice/types';

const run = (over: Partial<DrillRunOptions> = {}): DrillRunOptions => ({
	root: 'C',
	keyMode: 'off',
	reps: 1,
	offset: 0,
	range: rangeFor('keys'),
	register: 'middle',
	tempo: 120,
	tempoStep: 0,
	tempoMax: 200,
	restBars: 0,
	chords: [{ symbol: 'Dm7', beats: 4 }],
	...over
});

describe('migrateDrill — shape', () => {
	it('fills a completely empty record with safe defaults', () => {
		const got = migrateDrill({});
		expect(got.schemaVersion).toBe(1);
		expect(got.id).toBeTruthy();
		expect(got.name).toBe('Custom drill');
		expect(got.source).toEqual({ kind: 'scale', scaleType: 'major' });
		expect(got.pattern.cell).toEqual([0]);
		expect(got.pattern.rhythm).toEqual([1]);
		expect(got.direction).toBe('up');
		expect(got.cellsPerKey).toBeGreaterThanOrEqual(1);
	});

	it('survives junk', () => {
		for (const junk of [null, undefined, 0, 'nope', [], true]) {
			expect(() => migrateDrill(junk)).not.toThrow();
			expect(migrateDrill(junk).pattern.cell.length).toBeGreaterThan(0);
		}
	});

	it('never trusts a stored builtIn flag', () => {
		// Otherwise an imported file could pose as part of the shipped library and
		// become undeletable in the UI.
		expect(migrateDrill({ builtIn: true }).builtIn).toBe(false);
	});

	it('keeps a well-formed record intact', () => {
		const source = {
			schemaVersion: 1,
			id: 'mine',
			name: 'My cell',
			description: 'notes',
			createdAt: 1000,
			updatedAt: 2000,
			source: { kind: 'scale', scaleType: 'dorian' },
			pattern: { id: 'x', label: 'X', cell: [0, 2, 4], rhythm: [0.5, 1], step: 2 },
			direction: 'updown',
			cellsPerKey: 6,
			timeSignature: { numerator: 3, denominator: 4 }
		};
		const got = migrateDrill(source);
		expect(got).toMatchObject({
			id: 'mine',
			name: 'My cell',
			createdAt: 1000,
			updatedAt: 2000,
			direction: 'updown',
			cellsPerKey: 6
		});
		expect(got.pattern.cell).toEqual([0, 2, 4]);
		expect(got.timeSignature).toEqual({ numerator: 3, denominator: 4 });
	});
});

// These are the load-bearing ones: the resolver turns rhythm into MIDI tick
// positions, so a zero or negative duration corrupts the schedule rather than
// failing loudly. Same reasoning as migrateProgression's `beats` bound.
describe('migrateDrill — hostile values are made safe', () => {
	const rhythmOf = (rhythm: unknown) => migrateDrill({ pattern: { rhythm } }).pattern.rhythm;

	it('rejects zero, negative and non-finite durations', () => {
		expect(rhythmOf([0, -1, -0.5])).toEqual([1, 1, 1]);
		expect(rhythmOf([NaN, Infinity, -Infinity])).toEqual([1, 1, 1]);
		expect(rhythmOf(['1', null, {}])).toEqual([1, 1, 1]);
	});

	it('caps an absurd duration', () => {
		expect(rhythmOf([1e9])[0]).toBeLessThanOrEqual(64);
	});

	it('clamps cell offsets and the step to a playable span', () => {
		const got = migrateDrill({ pattern: { cell: [0, 1e6, -1e6], step: 1e6 } });
		for (const offset of got.pattern.cell) expect(Math.abs(offset)).toBeLessThanOrEqual(24);
		expect(Math.abs(got.pattern.step)).toBeLessThanOrEqual(24);
	});

	it('caps the cell length and the repetition count', () => {
		const huge = Array.from({ length: 5000 }, (_, i) => i);
		expect(migrateDrill({ pattern: { cell: huge } }).pattern.cell.length).toBeLessThanOrEqual(32);
		expect(migrateDrill({ cellsPerKey: 1e6 }).cellsPerKey).toBeLessThanOrEqual(64);
		expect(migrateDrill({ cellsPerKey: 0 }).cellsPerKey).toBeGreaterThanOrEqual(1);
	});

	it('falls back on an unknown scale type', () => {
		expect(migrateDrill({ source: { kind: 'scale', scaleType: 'not-a-scale' } }).source).toEqual({
			kind: 'scale',
			scaleType: 'major'
		});
	});

	it('falls back on a chord quality that makes no chord', () => {
		expect(migrateDrill({ source: { kind: 'chord', quality: 'zzz!!' } }).source).toEqual({
			kind: 'chord',
			quality: ''
		});
		// A real one is kept.
		expect(migrateDrill({ source: { kind: 'chord', quality: 'm7b5' } }).source).toEqual({
			kind: 'chord',
			quality: 'm7b5'
		});
	});

	it('falls back on an unknown guide line and direction', () => {
		expect(migrateDrill({ source: { kind: 'guide', line: 'sideways' } }).source).toEqual({
			kind: 'guide',
			line: 'guide'
		});
		expect(migrateDrill({ direction: 'diagonally' }).direction).toBe('up');
	});

	it('coerces a nonsense meter, keeping odd but valid ones', () => {
		expect(migrateDrill({ timeSignature: { numerator: 0, denominator: 5 } }).timeSignature).toEqual(
			{ numerator: 1, denominator: 4 }
		);
		expect(migrateDrill({ timeSignature: { numerator: 7, denominator: 8 } }).timeSignature).toEqual(
			{ numerator: 7, denominator: 8 }
		);
	});

	// The point of all of the above: whatever comes in, the resolver must produce
	// a finite, ordered, playable schedule.
	it('always yields a drill that resolves to a sane schedule', () => {
		const nasty = [
			{},
			{ pattern: { cell: [], rhythm: [] } },
			{ pattern: { rhythm: [0, -5] }, cellsPerKey: 0 },
			{ source: { kind: 'chord', quality: '???' } },
			{ source: { kind: 'guide', line: 'nope' } },
			{ pattern: { cell: [1e9], step: -1e9 } },
			{ timeSignature: { numerator: -4, denominator: 0 } }
		];
		for (const raw of nasty) {
			const got = resolveDrill(migrateDrill(raw), run());
			let at = 0;
			for (const note of got.notes) {
				expect(Number.isFinite(note.atQuarters)).toBe(true);
				expect(note.durQuarters).toBeGreaterThan(0);
				expect(note.atQuarters).toBeCloseTo(at, 10);
				at += note.durQuarters;
			}
			expect(Number.isFinite(got.totalQuarters)).toBe(true);
		}
	});
});

describe('migrateDrill — the shipped library round-trips', () => {
	it('survives a save/load cycle unchanged apart from the builtIn flag', () => {
		for (const definition of [...BUILT_IN_DRILLS, ...GUIDE_TONE_DRILLS]) {
			const revived = migrateDrill(JSON.parse(JSON.stringify(definition)));
			expect(revived.source).toEqual(definition.source);
			expect(revived.pattern.cell).toEqual(definition.pattern.cell);
			expect(revived.pattern.rhythm).toEqual(definition.pattern.rhythm);
			expect(revived.direction).toBe(definition.direction);
			expect(revived.cellsPerKey).toBe(definition.cellsPerKey);
			expect(revived.timeSignature).toEqual(definition.timeSignature);
			expect(revived.builtIn).toBe(false);
		}
	});
});
