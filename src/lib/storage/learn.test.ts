import { describe, it, expect } from 'vitest';
import { BOX_DAYS, DAY_MS, recordResult } from '$lib/learn/srs';
import { QUIZ_ITEMS } from '$lib/learn/items';
import { LESSONS } from '$lib/learn/curriculum';
import type { DraftStorage } from './draft';
import {
	emptyLearn,
	extractLearn,
	importLearn,
	isEmptyLearn,
	LEARN_KEY,
	learnForBackup,
	MAX_ITEMS,
	MAX_LESSONS,
	MAX_STEP,
	mergeLearn,
	migrateLearn,
	readLearn,
	writeLearn,
	type LearnProgress
} from './learn';

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

describe('readLearn repairs once', () => {
	it('stores a clamped date, so the clamp does not move with every launch', () => {
		const { storage, data } = fakeStorage();
		const YEAR_3000 = Date.UTC(3000, 0, 1);
		data.set(LEARN_KEY, JSON.stringify({ version: 1, items: { 'loop-pop': { box: 2, due: YEAR_3000, seen: 1, last: YEAR_3000 } } }));
		const first = readLearn(storage, NOW).items['loop-pop'];
		expect(first).toEqual({ box: 2, due: NOW + BOX_DAYS[1] * DAY_MS, seen: 1, last: NOW });
		// A week later the stored, repaired dates are what is read: due has passed.
		const later = readLearn(storage, NOW + 7 * DAY_MS).items['loop-pop'];
		expect(later).toEqual(first);
		expect(JSON.parse(data.get(LEARN_KEY)!).items['loop-pop']).toEqual(first);
	});

	it('leaves canonical progress alone, and survives a storage that refuses the repair', () => {
		const { storage, data } = fakeStorage();
		const progress = emptyLearn();
		progress.items['loop-pop'] = recordResult(undefined, true, NOW);
		writeLearn(storage, progress);
		const before = data.get(LEARN_KEY);
		readLearn(storage, NOW + DAY_MS);
		expect(data.get(LEARN_KEY)).toBe(before);
		const full = fakeStorage({ failSet: true });
		full.data.set(LEARN_KEY, JSON.stringify({ items: { 'loop-pop': { box: 9 } } }));
		expect(readLearn(full.storage, NOW).items['loop-pop'].box).toBe(5);
	});
});

describe('mergeLearn', () => {
	const item = (last: number, box = 2) => ({ box, due: last + BOX_DAYS[box - 1] * DAY_MS, seen: 3, last });
	const progress = (items: LearnProgress['items'], lessons: LearnProgress['lessons'] = {}): LearnProgress => ({
		version: 1,
		items,
		lessons
	});

	it('keeps, per item, the record answered more recently', () => {
		const here = progress({ 'loop-pop': item(NOW - DAY_MS, 3), 'fn-three-chords': item(NOW, 4) });
		const there = progress({ 'loop-pop': item(NOW, 1), 'fn-sevenths': item(NOW - 2 * DAY_MS) });
		const out = mergeLearn(here, there);
		expect(out.items['loop-pop']).toEqual(there.items['loop-pop']); // answered later there
		expect(out.items['fn-three-chords']).toEqual(here.items['fn-three-chords']); // only here
		expect(out.items['fn-sevenths']).toEqual(there.items['fn-sevenths']); // only there
		// A tie keeps the first argument's (what is already on this device).
		const tie = mergeLearn(progress({ 'loop-pop': item(NOW, 5) }), progress({ 'loop-pop': item(NOW, 1) }));
		expect(tie.items['loop-pop'].box).toBe(5);
	});

	it('combines lessons: finished in either is finished, at the furthest step', () => {
		const here = progress({}, { 'loops-axis': { step: 3, done: 0 }, 'home-hear-home': { step: 4, done: NOW - DAY_MS } });
		const there = progress({}, { 'loops-axis': { step: 1, done: NOW }, 'three-five-to-one': { step: 2, done: 0 } });
		const out = mergeLearn(here, there);
		expect(out.lessons).toEqual({
			'loops-axis': { step: 3, done: NOW },
			'home-hear-home': { step: 4, done: NOW - DAY_MS },
			'three-five-to-one': { step: 2, done: 0 }
		});
		// Two finishes: the later date.
		const both = mergeLearn(progress({}, { 'loops-axis': { step: 4, done: 10 } }), progress({}, { 'loops-axis': { step: 4, done: 20 } }));
		expect(both.lessons!['loops-axis'].done).toBe(20);
	});

	it('is symmetric apart from ties, and merging with nothing changes nothing', () => {
		const a = progress({ 'loop-pop': item(NOW - DAY_MS) }, { 'loops-axis': { step: 2, done: 0 } });
		const b = progress({ 'loop-pop': item(NOW) }, { 'loops-axis': { step: 1, done: NOW } });
		expect(mergeLearn(a, b)).toEqual(mergeLearn(b, a));
		expect(mergeLearn(a, emptyLearn())).toEqual(a);
		expect(mergeLearn(emptyLearn(), a)).toEqual(a);
		// Progress saved before lessons existed merges too.
		const old = { version: 1, items: { 'loop-pop': item(NOW) } } as LearnProgress;
		expect(mergeLearn(old, old).lessons).toEqual({});
	});
});

describe('extractLearn', () => {
	it('turns garbage into empty progress, never a throw', () => {
		for (const raw of [undefined, null, 42, 'learn', [], [1, 2], { items: 'x' }, { items: [], lessons: 7 }, () => 1]) {
			expect(extractLearn(raw, NOW)).toEqual(emptyLearn());
		}
	});

	it('goes through the gate: hostile entries are coerced or dropped', () => {
		const raw = JSON.parse(
			'{"version":99,"items":{"__proto__":{"box":3},"loop-pop":{"box":99,"due":1e300,"seen":-1,"last":"x"}},"lessons":{"loops-axis":{"step":1e9,"done":1e300}}}'
		);
		const out = extractLearn(raw, NOW);
		expect(Object.keys(out.items)).toEqual(['loop-pop']);
		expect(out.items['loop-pop']).toEqual({ box: 5, due: NOW + BOX_DAYS[4] * DAY_MS, seen: 0, last: 0 });
		expect(out.lessons).toEqual({ 'loops-axis': { step: MAX_STEP, done: NOW } });
		expect(out.version).toBe(1);
	});
});

describe('backup: learnForBackup and importLearn', () => {
	it('backs up nothing when there is no progress, and the progress when there is', () => {
		const { storage } = fakeStorage();
		expect(learnForBackup(storage, NOW)).toBeNull();
		const progress = emptyLearn();
		progress.items['loop-pop'] = recordResult(undefined, true, NOW);
		writeLearn(storage, progress);
		expect(learnForBackup(storage, NOW)).toEqual(progress);
		expect(learnForBackup(fakeStorage({ failGet: true }).storage, NOW)).toBeNull();
		expect(isEmptyLearn(emptyLearn())).toBe(true);
	});

	it('round-trips: export, clear, import, and the progress is back', () => {
		const device = fakeStorage();
		const progress = emptyLearn();
		progress.items['fn-three-chords'] = recordResult(undefined, true, NOW);
		progress.lessons = { 'home-hear-home': { step: 4, done: NOW } };
		writeLearn(device.storage, progress);
		const backup = JSON.parse(JSON.stringify({ app: 'vamp', learn: learnForBackup(device.storage, NOW) }));
		device.data.clear();
		expect(importLearn(device.storage, backup.learn, NOW)).toEqual({ items: 1, lessons: 1 });
		expect(readLearn(device.storage, NOW)).toEqual(progress);
	});

	it('merges into what is saved, never replacing it', () => {
		const { storage } = fakeStorage();
		const here = emptyLearn();
		here.items['loop-pop'] = { box: 4, due: NOW + 8 * DAY_MS, seen: 9, last: NOW };
		here.items['fn-sevenths'] = { box: 2, due: NOW, seen: 1, last: NOW - 2 * DAY_MS };
		writeLearn(storage, here);
		const backup = {
			items: {
				'loop-pop': { box: 1, due: NOW, seen: 2, last: NOW - 5 * DAY_MS }, // older: loses
				'fn-sevenths': { box: 3, due: NOW + 4 * DAY_MS, seen: 4, last: NOW - DAY_MS }, // newer: wins
				'quality-triads': { box: 1, due: NOW, seen: 1, last: NOW - DAY_MS } // new here
			},
			lessons: { 'loops-axis': { step: 4, done: NOW - DAY_MS } }
		};
		expect(importLearn(storage, backup, NOW)).toEqual({ items: 3, lessons: 1 });
		const out = readLearn(storage, NOW);
		expect(out.items['loop-pop'].box).toBe(4);
		expect(out.items['fn-sevenths'].box).toBe(3);
		expect(out.items['quality-triads'].box).toBe(1);
		expect(out.lessons!['loops-axis'].done).toBe(NOW - DAY_MS);
	});

	it('brings nothing (and writes nothing) for an absent, empty or broken field', () => {
		for (const raw of [undefined, null, {}, { items: {} }, 'garbage', [1]]) {
			const { storage, data } = fakeStorage();
			expect(importLearn(storage, raw, NOW)).toBeNull();
			expect(data.has(LEARN_KEY)).toBe(false);
		}
		// Storage that refuses the write: nothing claimed.
		expect(importLearn(fakeStorage({ failSet: true }).storage, { items: { 'loop-pop': { box: 2 } } }, NOW)).toBeNull();
	});

	it('keeps the merged progress inside the caps', () => {
		const { storage } = fakeStorage();
		const many: Record<string, unknown> = {};
		for (let i = 0; i < MAX_ITEMS; i++) many[`old-${i}`] = { box: 1, due: NOW, seen: 1, last: NOW };
		writeLearn(storage, migrateLearn({ items: many }, NOW));
		const more: Record<string, unknown> = { 'fn-three-chords': { box: 2, due: NOW, seen: 1, last: NOW } };
		for (let i = 0; i < MAX_ITEMS; i++) more[`new-${i}`] = { box: 1, due: NOW, seen: 1, last: NOW };
		importLearn(storage, { items: more }, NOW);
		const out = readLearn(storage, NOW);
		expect(Object.keys(out.items)).toHaveLength(MAX_ITEMS);
		expect(out.items['fn-three-chords']).toBeDefined(); // a real item is kept first
	});
});
