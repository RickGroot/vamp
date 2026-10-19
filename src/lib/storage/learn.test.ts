import { describe, it, expect } from 'vitest';
import { BOX_DAYS, DAY_MS, recordResult } from '$lib/learn/srs';
import { QUIZ_ITEMS } from '$lib/learn/items';
import { LESSONS } from '$lib/learn/curriculum';
import type { DraftStorage } from './draft';
import { emptyLearn, LEARN_KEY, MAX_ITEMS, MAX_LESSONS, MAX_STEP, migrateLearn, readLearn, writeLearn } from './learn';

const NOW = Date.UTC(2026, 9, 19, 12);

/** An in-memory Storage, optionally rigged to fail the way real browsers do. */
function fakeStorage(opts: { failGet?: boolean; failSet?: boolean; failRemove?: boolean } = {}) {
	const data = new Map<string, string>();
	const storage: DraftStorage = {
		getItem: (k) => {
			if (opts.failGet) throw new DOMException('blocked', 'SecurityError');
			return data.get(k) ?? null;
		},
		setItem: (k, v) => {
			if (opts.failSet) throw new DOMException('full', 'QuotaExceededError');
			data.set(k, v);
		},
		removeItem: (k) => {
			if (opts.failRemove) throw new DOMException('blocked', 'SecurityError');
			data.delete(k);
		}
	};
	return { storage, data };
}

describe('learn progress round trip', () => {
	it('restores what was written', () => {
		const { storage } = fakeStorage();
		const progress = emptyLearn();
		progress.items['fn-three-chords'] = recordResult(undefined, true, NOW);
		progress.items['loop-pop'] = recordResult(undefined, false, NOW);
		expect(writeLearn(storage, progress)).toBe(true);
		expect(readLearn(storage, NOW)).toEqual(progress);
	});

	it('reads nothing as empty', () => {
		expect(readLearn(fakeStorage().storage, NOW)).toEqual(emptyLearn());
	});
});

describe('migrateLearn: hostile input', () => {
	const item = (fields: Record<string, unknown>) => migrateLearn({ items: { 'fn-three-chords': fields } }, NOW);

	it('never lets __proto__ (or any malformed id) become a key', () => {
		const raw = JSON.parse(
			'{"version":1,"items":{"__proto__":{"box":3,"due":0,"seen":1,"last":0},"constructor ":{"box":2},"Bad Id":{"box":2},"fn-three-chords":{"box":2,"due":0,"seen":1,"last":0}}}'
		);
		const out = migrateLearn(raw, NOW);
		expect(Object.keys(out.items)).toEqual(['fn-three-chords']);
		expect(Object.getPrototypeOf(out.items)).toBe(Object.prototype);
		expect(({} as Record<string, unknown>).box).toBeUndefined(); // nothing polluted
	});

	it('clamps boxes into 1–5', () => {
		expect(item({ box: 99 }).items['fn-three-chords'].box).toBe(5);
		expect(item({ box: -4 }).items['fn-three-chords'].box).toBe(1);
		expect(item({ box: 2.6 }).items['fn-three-chords'].box).toBe(3);
		expect(item({ box: 'three' }).items['fn-three-chords'].box).toBe(1);
		expect(item({ box: Number.NaN }).items['fn-three-chords'].box).toBe(1);
	});

	it('repairs dates: NaN is due now, the future is capped by the box', () => {
		const nan = item({ box: 2, due: Number.NaN, last: Number.NaN }).items['fn-three-chords'];
		expect(nan.due).toBe(NOW);
		expect(nan.last).toBe(0);
		const far = item({ box: 2, due: NOW + 10_000 * DAY_MS, last: NOW + DAY_MS }).items['fn-three-chords'];
		expect(far.due).toBe(NOW + BOX_DAYS[1] * DAY_MS);
		expect(far.last).toBe(NOW);
		expect(item({ due: -5 }).items['fn-three-chords'].due).toBe(0);
		expect(item({ due: '2026-10-19' }).items['fn-three-chords'].due).toBe(NOW);
	});

	it('bounds the counter', () => {
		expect(item({ seen: -3 }).items['fn-three-chords'].seen).toBe(0);
		expect(item({ seen: 1e12 }).items['fn-three-chords'].seen).toBe(1_000_000);
		expect(item({ seen: 2.9 }).items['fn-three-chords'].seen).toBe(2);
	});

	it('drops entries that are not records', () => {
		const out = migrateLearn({ items: { 'fn-three-chords': 3, 'loop-pop': null, 'loop-rock': [1, 2] } }, NOW);
		expect(out.items).toEqual({});
	});

	it('survives anything at the top level', () => {
		for (const raw of [null, undefined, 42, 'x', [], { items: [] }, { items: null }, { items: 'x' }]) {
			expect(migrateLearn(raw, NOW)).toEqual(emptyLearn());
		}
	});

	it('caps 10k items, keeping the real ones first', () => {
		const items: Record<string, unknown> = {};
		for (let i = 0; i < 10_000; i++) items[`junk-${i}`] = { box: 1, due: 0, seen: 0, last: 0 };
		items['fn-three-chords'] = { box: 4, due: NOW, seen: 7, last: NOW };
		const out = migrateLearn({ version: 1, items }, NOW);
		expect(Object.keys(out.items)).toHaveLength(MAX_ITEMS);
		expect(out.items['fn-three-chords']).toMatchObject({ box: 4, seen: 7 });
	});

	it('keeps unknown but well-formed ids (a newer version’s items)', () => {
		const out = migrateLearn({ items: { 'fn-from-the-future': { box: 2, due: NOW, seen: 1, last: NOW } } }, NOW);
		expect(out.items['fn-from-the-future']).toMatchObject({ box: 2 });
	});

	it('every shipped item id passes the gate', () => {
		const items = Object.fromEntries(QUIZ_ITEMS.map((i) => [i.id, { box: 1, due: NOW, seen: 0, last: 0 }]));
		expect(Object.keys(migrateLearn({ items }, NOW).items)).toEqual(QUIZ_ITEMS.map((i) => i.id));
	});
});

describe('lesson progress', () => {
	it('round-trips with the items', () => {
		const { storage } = fakeStorage();
		const progress = emptyLearn();
		progress.items['loop-pop'] = recordResult(undefined, true, NOW);
		progress.lessons = { 'home-hear-home': { step: 4, done: NOW }, 'loops-axis': { step: 2, done: 0 } };
		expect(writeLearn(storage, progress)).toBe(true);
		expect(readLearn(storage, NOW)).toEqual(progress);
	});

	it('still loads progress saved before lessons existed', () => {
		const { storage, data } = fakeStorage();
		const old = { version: 1, items: { 'fn-three-chords': { box: 3, due: NOW, seen: 4, last: NOW - DAY_MS } } };
		data.set(LEARN_KEY, JSON.stringify(old));
		const out = readLearn(storage, NOW);
		expect(out.items['fn-three-chords']).toEqual(old.items['fn-three-chords']);
		expect(out.lessons).toEqual({});
		expect(out.version).toBe(1);
	});

	it('reads lessons even when the items are missing or broken', () => {
		for (const items of [undefined, null, [], 'x']) {
			const out = migrateLearn({ items, lessons: { 'loops-axis': { step: 1, done: 0 } } }, NOW);
			expect(out.items).toEqual({});
			expect(out.lessons).toEqual({ 'loops-axis': { step: 1, done: 0 } });
		}
	});

	const lesson = (fields: unknown) => migrateLearn({ lessons: { 'loops-axis': fields } }, NOW).lessons!['loops-axis'];

	it('clamps the step and repairs the finish date', () => {
		expect(lesson({ step: 2.7, done: 0 })).toEqual({ step: 2, done: 0 });
		expect(lesson({ step: -3 }).step).toBe(0);
		expect(lesson({ step: 1e9 }).step).toBe(MAX_STEP);
		expect(lesson({ step: 'two', done: 'today' })).toEqual({ step: 0, done: 0 });
		expect(lesson({ step: Number.NaN, done: Number.NaN })).toEqual({ step: 0, done: 0 });
		expect(lesson({ done: NOW + 365 * DAY_MS }).done).toBe(NOW);
		expect(lesson({ done: -1 }).done).toBe(0);
		expect(lesson({})).toEqual({ step: 0, done: 0 });
	});

	it('drops entries that are not records, and never lets __proto__ in', () => {
		const raw = JSON.parse(
			'{"lessons":{"__proto__":{"step":3,"done":1},"Bad Id":{"step":1},"loops-axis":7,"home-hear-home":{"step":1,"done":0}}}'
		);
		const out = migrateLearn(raw, NOW);
		expect(Object.keys(out.lessons!)).toEqual(['home-hear-home']);
		expect(Object.getPrototypeOf(out.lessons)).toBe(Object.prototype);
		for (const bad of [null, 42, 'x', []]) expect(migrateLearn({ lessons: bad }, NOW).lessons).toEqual({});
	});

	it('caps a flood of lessons, keeping the real ones first', () => {
		const lessons: Record<string, unknown> = {};
		for (let i = 0; i < 10_000; i++) lessons[`junk-${i}`] = { step: 1, done: 0 };
		lessons['loops-axis'] = { step: 3, done: NOW };
		const out = migrateLearn({ version: 1, lessons }, NOW);
		expect(Object.keys(out.lessons!)).toHaveLength(MAX_LESSONS);
		expect(out.lessons!['loops-axis']).toEqual({ step: 3, done: NOW });
	});

	it('every shipped lesson id passes the gate', () => {
		const lessons = Object.fromEntries(LESSONS.map((l) => [l.id, { step: 0, done: 0 }]));
		expect(Object.keys(migrateLearn({ lessons }, NOW).lessons!)).toEqual(LESSONS.map((l) => l.id));
	});
});

describe('readLearn / writeLearn: broken storage', () => {
	it('removes a corrupt entry instead of failing', () => {
		for (const bad of ['{not json', '[]', '42', 'null', '"text"']) {
			const { storage, data } = fakeStorage();
			data.set(LEARN_KEY, bad);
			expect(readLearn(storage, NOW), bad).toEqual(emptyLearn());
			expect(data.has(LEARN_KEY), bad).toBe(false);
		}
	});

	it('never throws from a throwing storage', () => {
		const blocked = fakeStorage({ failGet: true, failSet: true, failRemove: true });
		expect(readLearn(blocked.storage, NOW)).toEqual(emptyLearn());
		expect(writeLearn(blocked.storage, emptyLearn())).toBe(false);
		const corrupt = fakeStorage({ failRemove: true });
		corrupt.data.set(LEARN_KEY, '{oops');
		expect(readLearn(corrupt.storage, NOW)).toEqual(emptyLearn());
	});

	it('reports a full storage as a failed write', () => {
		expect(writeLearn(fakeStorage({ failSet: true }).storage, emptyLearn())).toBe(false);
	});
});
