import { describe, it, expect } from 'vitest';
import { Note } from 'tonal';
import { buildRunPlan, ALL_KEYS } from './sequence';
import { TEMPO_MAX, TEMPO_MIN } from '$lib/model/factory';

/** Seeded LCG, so a "random" key order is reproducible (the repo convention). */
function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

const chroma = (n: string) => Note.chroma(n);

const base = {
	root: 'C',
	keyMode: 'off' as const,
	reps: 4,
	tempo: 120,
	tempoStep: 0,
	tempoMax: 200
};

describe('buildRunPlan', () => {
	it('returns one root and one tempo per repetition', () => {
		const plan = buildRunPlan({ ...base, reps: 5 });
		expect(plan.roots).toHaveLength(5);
		expect(plan.tempos).toHaveLength(5);
	});

	it("holds the key when cycling is off", () => {
		expect(buildRunPlan(base).roots).toEqual(['C', 'C', 'C', 'C']);
	});

	it('walks all twelve keys in fourths', () => {
		const plan = buildRunPlan({ ...base, keyMode: 'fourths', reps: ALL_KEYS });
		const pcs = plan.roots.map(chroma);
		expect(new Set(pcs).size).toBe(12);
		// Each step is up a perfect fourth.
		for (let i = 1; i < pcs.length; i++) {
			expect(((pcs[i]! - pcs[i - 1]! + 12) % 12)).toBe(5);
		}
	});

	it('walks all twelve keys by semitone', () => {
		const plan = buildRunPlan({ ...base, keyMode: 'semitone', reps: ALL_KEYS });
		expect(new Set(plan.roots.map(chroma)).size).toBe(12);
	});

	it('is deterministic under a seeded rand, and never repeats a key back to back', () => {
		const opts = { ...base, keyMode: 'random' as const, reps: 12 };
		const a = buildRunPlan({ ...opts, rand: lcg(42) });
		const b = buildRunPlan({ ...opts, rand: lcg(42) });
		expect(a.roots).toEqual(b.roots);
		for (let i = 1; i < a.roots.length; i++) {
			expect(chroma(a.roots[i])).not.toBe(chroma(a.roots[i - 1]));
		}
	});

	it('keeps the app’s flat-spelled roots', () => {
		const plan = buildRunPlan({ ...base, root: 'C', keyMode: 'semitone', reps: 3 });
		expect(plan.roots).toEqual(['C', 'Db', 'D']);
	});

	it('steps the tempo toward the ceiling and stops there', () => {
		const plan = buildRunPlan({
			...base,
			reps: 7,
			tempo: 132,
			tempoStep: 4,
			tempoMax: 140
		});
		expect(plan.tempos).toEqual([132, 136, 140, 140, 140, 140, 140]);
	});

	it('holds the tempo when stepping is off', () => {
		expect(buildRunPlan({ ...base, tempo: 90 }).tempos).toEqual([90, 90, 90, 90]);
	});

	it('clamps to the canonical tempo bounds from model/factory', () => {
		const tooFast = buildRunPlan({ ...base, tempo: 9999, tempoMax: 9999 });
		expect(tooFast.tempos.every((t) => t <= TEMPO_MAX)).toBe(true);
		const tooSlow = buildRunPlan({ ...base, tempo: 1, tempoMax: 1 });
		expect(tooSlow.tempos.every((t) => t >= TEMPO_MIN)).toBe(true);
	});

	it('always produces at least one repetition', () => {
		expect(buildRunPlan({ ...base, reps: 0 }).roots).toHaveLength(1);
		expect(buildRunPlan({ ...base, reps: -3 }).roots).toHaveLength(1);
	});
});
