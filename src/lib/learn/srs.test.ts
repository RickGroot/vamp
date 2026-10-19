import { describe, it, expect } from 'vitest';
import { BOX_DAYS, BOX_MAX, DAY_MS, enrol, isDue, newProgress, recordResult, type ItemProgress } from './srs';

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
