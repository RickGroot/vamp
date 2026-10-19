import { describe, it, expect } from 'vitest';
import {
	BOX_DAYS,
	BOX_MAX,
	buildSession,
	DAY_MS,
	dueItems,
	effectiveDue,
	enrol,
	isDue,
	MAX_PER_ITEM,
	newProgress,
	recordResult,
	scheduled,
	SESSION_SIZE,
	type ItemProgress
} from './srs';
import { QUIZ_ITEMS } from './items';

const T0 = Date.UTC(2026, 9, 19, 12);
const days = (n: number) => T0 + n * DAY_MS;

describe('recordResult', () => {
	it('starts a new item in box 1, due now', () => {
		expect(newProgress(T0)).toEqual({ box: 1, due: T0, seen: 0, last: 0 });
		expect(isDue(newProgress(T0), T0)).toBe(true);
	});

	it('a first right answer moves it to box 2, due in two days', () => {
		const p = recordResult(undefined, true, T0);
		expect(p).toEqual({ box: 2, due: T0 + BOX_DAYS[1] * DAY_MS, seen: 1, last: T0 });
	});

	it('a first wrong answer keeps it in box 1, due tomorrow', () => {
		expect(recordResult(undefined, false, T0)).toEqual({ box: 1, due: days(1), seen: 1, last: T0 });
	});

	it('moves up only when the item was due', () => {
		const p: ItemProgress = { box: 2, due: days(2), seen: 1, last: T0 };
		// Practised again an hour later: right, but not due — the schedule stands.
		const early = recordResult(p, true, T0 + 3600_000);
		expect(early).toMatchObject({ box: 2, due: days(2), seen: 2 });
		// On the day it is due: up a box, rescheduled from now.
		const onTime = recordResult(p, true, days(2));
		expect(onTime).toMatchObject({ box: 3, due: days(2) + BOX_DAYS[2] * DAY_MS });
	});

	it('a wrong answer drops it to box 1 from anywhere, due or not', () => {
		const high: ItemProgress = { box: 5, due: days(10), seen: 20, last: T0 };
		expect(recordResult(high, false, T0)).toMatchObject({ box: 1, due: days(1), seen: 21 });
		expect(recordResult({ ...high, due: T0 }, false, days(1))).toMatchObject({ box: 1, due: days(2) });
	});

	it('never climbs past the top box', () => {
		let p: ItemProgress | undefined;
		let now = T0;
		for (let i = 0; i < 12; i++) {
			p = recordResult(p, true, now);
			now = p.due;
		}
		expect(p!.box).toBe(BOX_MAX);
		expect(p!.due - p!.last).toBe(BOX_DAYS[BOX_MAX - 1] * DAY_MS);
	});
});

describe('enrol', () => {
	const NOW = Date.UTC(2026, 9, 19, 12);

	it('puts new items into box 1, due now, unseen', () => {
		const out = enrol({}, ['fn-three-chords', 'loop-pop'], NOW);
		expect(out).toEqual({ 'fn-three-chords': newProgress(NOW), 'loop-pop': newProgress(NOW) });
		expect(out['loop-pop']).toMatchObject({ box: 1, due: NOW, seen: 0 });
		expect(isDue(out['loop-pop'], NOW)).toBe(true);
	});

	it('never demotes an item that is already scheduled', () => {
		const known: ItemProgress = { box: 4, due: NOW + 8 * DAY_MS, seen: 9, last: NOW - DAY_MS };
		const items = { 'fn-three-chords': known };
		const out = enrol(items, ['fn-three-chords', 'loop-pop'], NOW);
		expect(out['fn-three-chords']).toBe(known);
		expect(out['loop-pop'].box).toBe(1);
		expect(items).toEqual({ 'fn-three-chords': known }); // input untouched
	});

	it('keeps a hostile id a plain key', () => {
		const out = enrol({}, ['__proto__'], NOW);
		expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
		expect(Object.keys(out)).toEqual(['__proto__']);
	});
});

describe('review sessions', () => {
	const NOW = Date.UTC(2026, 9, 19, 12);
	/** Seeded LCG, so a session is reproducible (the repo convention). */
	const lcg = (seed: number) => {
		let x = seed >>> 0;
		return () => {
			x = (x * 1664525 + 1013904223) >>> 0;
			return x / 0x100000000;
		};
	};
	const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
	const p = (box: number, due: number, seen = 1): ItemProgress => ({ box, due, seen, last: NOW - DAY_MS });
	const kindOf = new Map(QUIZ_ITEMS.map((i) => [i.id, i.spec.kind]));
	/** Every catalogue item due, at staggered times in the past (the first most overdue). */
	const allDue = Object.fromEntries(QUIZ_ITEMS.map((item, i) => [item.id, p(1 + (i % 5), NOW - (QUIZ_ITEMS.length - i) * DAY_MS)]));

	const noRepeats = (ids: string[]) => ids.every((id, i) => i === 0 || id !== ids[i - 1]);

	it('is empty when nothing is due, or nothing is scheduled', () => {
		expect(buildSession({}, QUIZ_ITEMS, NOW, lcg(1))).toEqual([]);
		const later = { 'fn-three-chords': p(2, NOW + DAY_MS) };
		expect(buildSession(later, QUIZ_ITEMS, NOW, lcg(1))).toEqual([]);
		expect(buildSession(allDue, QUIZ_ITEMS, NOW, lcg(1), 0)).toEqual([]);
	});

	it('takes only due items, the most overdue first, capped at n', () => {
		const progress = {
			...allDue,
			'loop-pop': p(3, NOW + 2 * DAY_MS) // not due: never in the session
		};
		for (const seed of SEEDS) {
			const session = buildSession(progress, QUIZ_ITEMS, NOW, lcg(seed));
			expect(session.length).toBe(SESSION_SIZE);
			expect(session.map((i) => i.id)).not.toContain('loop-pop');
			// More are due than fit: the ten most overdue, each once.
			const expected = dueItems(progress, QUIZ_ITEMS, NOW).slice(0, SESSION_SIZE).map((i) => i.id);
			expect(new Set(session.map((i) => i.id))).toEqual(new Set(expected));
		}
		expect(buildSession(allDue, QUIZ_ITEMS, NOW, lcg(3), 4)).toHaveLength(4);
	});

	it('never asks the same item twice in a row, and comes round a short queue again', () => {
		const three = {
			'fn-three-chords': p(1, NOW - DAY_MS),
			'fn-four-chords': p(2, NOW - 2 * DAY_MS),
			'loop-pop': p(1, NOW)
		};
		for (const seed of SEEDS) {
			const ids = buildSession(three, QUIZ_ITEMS, NOW, lcg(seed)).map((i) => i.id);
			expect(noRepeats(ids), ids.join(' ')).toBe(true);
			expect(ids.length).toBe(3 * MAX_PER_ITEM);
			for (const id of Object.keys(three)) expect(ids.filter((x) => x === id)).toHaveLength(MAX_PER_ITEM);
			// Every due item once before any comes back.
			expect(new Set(ids.slice(0, 3)).size).toBe(3);
		}
		// One item due: one question, never the same one back to back.
		expect(buildSession({ 'loop-pop': p(1, NOW) }, QUIZ_ITEMS, NOW, lcg(9)).map((i) => i.id)).toEqual(['loop-pop']);
	});

	it('changes the kind whenever it can', () => {
		const mixed = {
			'fn-three-chords': p(1, NOW - DAY_MS),
			'fn-sevenths': p(1, NOW - DAY_MS),
			'loop-pop': p(1, NOW - DAY_MS),
			'loop-jazz': p(1, NOW - DAY_MS),
			'quality-triads': p(1, NOW - DAY_MS),
			'quality-sevenths': p(1, NOW - DAY_MS)
		};
		for (const seed of SEEDS) {
			const ids = buildSession(mixed, QUIZ_ITEMS, NOW, lcg(seed)).map((i) => i.id);
			expect(ids.length).toBe(SESSION_SIZE);
			const kinds = ids.map((id) => kindOf.get(id));
			expect(kinds.every((k, i) => i === 0 || k !== kinds[i - 1]), kinds.join(' ')).toBe(true);
		}
	});

	it('is deterministic per seed, and the seed matters', () => {
		const a = buildSession(allDue, QUIZ_ITEMS, NOW, lcg(42)).map((i) => i.id);
		expect(buildSession(allDue, QUIZ_ITEMS, NOW, lcg(42)).map((i) => i.id)).toEqual(a);
		const orders = new Set(SEEDS.map((seed) => buildSession(allDue, QUIZ_ITEMS, NOW, lcg(seed)).map((i) => i.id).join()));
		expect(orders.size).toBeGreaterThan(1);
	});

	it('clamps a due date from a wrong clock to its last answer, so it comes back', () => {
		const YEAR_3000 = Date.UTC(3000, 0, 1);
		// Answered yesterday in box 1: due today, whatever the stored date says.
		const skewed = { 'fn-three-chords': { box: 1, due: YEAR_3000, seen: 3, last: NOW - DAY_MS } };
		expect(effectiveDue(skewed['fn-three-chords'], NOW)).toBe(NOW);
		expect(buildSession(skewed, QUIZ_ITEMS, NOW, lcg(1)).map((i) => i.id)).toEqual(['fn-three-chords']);
		// Box 3, answered an hour ago: back in four days, not in a thousand years.
		const box3 = { box: 3, due: YEAR_3000, seen: 3, last: NOW - 3_600_000 };
		expect(effectiveDue(box3, NOW)).toBe(box3.last + BOX_DAYS[2] * DAY_MS);
		expect(effectiveDue(box3, NOW + 30 * DAY_MS)).toBe(box3.last + BOX_DAYS[2] * DAY_MS); // the anchor stays put
		// Never answered (enrolled): due now at the latest.
		expect(effectiveDue({ box: 1, due: YEAR_3000, seen: 0, last: 0 }, NOW)).toBe(NOW);
		// A future `last` can't push it past now + the box's days; out-of-range boxes clamp too.
		expect(effectiveDue({ box: 2, due: YEAR_3000, seen: 1, last: YEAR_3000 }, NOW)).toBe(NOW + BOX_DAYS[1] * DAY_MS);
		expect(effectiveDue({ box: 99, due: YEAR_3000, seen: 1, last: YEAR_3000 }, NOW)).toBe(NOW + BOX_DAYS[4] * DAY_MS);
		// An honest schedule is untouched.
		const honest = recordResult(undefined, true, NOW);
		expect(effectiveDue(honest, NOW + DAY_MS)).toBe(honest.due);
	});

	it('skips ids the catalogue no longer knows, and leaves their progress alone', () => {
		const progress = { 'fn-retired-item': p(1, NOW - DAY_MS), 'loop-pop': p(1, NOW - DAY_MS) };
		const before = structuredClone(progress);
		expect(buildSession(progress, QUIZ_ITEMS, NOW, lcg(5)).map((i) => i.id)).toEqual(['loop-pop']);
		expect(scheduled(progress, QUIZ_ITEMS, NOW).map((s) => s.item.id)).toEqual(['loop-pop']);
		expect(progress).toEqual(before);
	});

	it('lists what is scheduled soonest first, with inherited keys ignored', () => {
		const progress = JSON.parse(
			`{"__proto__": {"box": 1, "due": 0, "seen": 1, "last": 0}, "loop-pop": {"box": 2, "due": ${NOW + DAY_MS}, "seen": 1, "last": ${NOW - 3_600_000}}, "fn-three-chords": {"box": 1, "due": ${NOW - DAY_MS}, "seen": 1, "last": 0}}`
		);
		expect(scheduled(progress, QUIZ_ITEMS, NOW).map((s) => s.item.id)).toEqual(['fn-three-chords', 'loop-pop']);
		expect(dueItems(progress, QUIZ_ITEMS, NOW).map((i) => i.id)).toEqual(['fn-three-chords']);
		expect(isDue(progress['fn-three-chords'], NOW)).toBe(true);
	});
});
