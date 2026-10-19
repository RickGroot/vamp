// Learn progress: one Leitner record per quiz item, and where you are in each
// lesson, kept in localStorage under `vamp:learn`. Small (a few dozen items), read synchronously at start-up, so
// the Ear mode can say what is due on its first render — the draft.ts pattern.
//
// `migrateLearn` is THE coercion gate for it, the twin of migrateProgression
// and migrateDrill: every read goes through it, and it trusts nothing — ids
// are checked against a strict pattern (so `__proto__` and friends never become
// keys), boxes are clamped to 1–5, dates must be finite and inside the
// schedule, counters are bounded, and the number of items is capped. Lesson
// progress (`lessons`, Phase 3) is optional: progress saved before lessons
// existed has none and still loads, so LEARN_VERSION stays 1.
//
// Phase 4 puts it in the backup: `learnForBackup` reads it for exportBackup,
// `importLearn` MERGES a backup's into it (mergeLearn: the later answer wins
// per item, finished lessons are combined), never replacing what is here.
//
// Pure apart from the storage it is handed (a DraftStorage, so tests pass a
// Map-backed fake). Never throws. Must NOT import stores.

import { LESSONS, type LessonProgress } from '$lib/learn/curriculum';
import { QUIZ_ITEMS } from '$lib/learn/items';
import { BOX_DAYS, BOX_MAX, BOX_MIN, DAY_MS, type ItemProgress } from '$lib/learn/srs';
import type { DraftStorage } from './draft';

export const LEARN_KEY = 'vamp:learn';
export const LEARN_VERSION = 1;
/** Far more than the catalogue will ever hold; a cap, not a budget. */
export const MAX_ITEMS = 256;
export const MAX_LESSONS = 256;
/** More steps than any lesson will have: a bound, not a budget. */
export const MAX_STEP = 63;
const MAX_SEEN = 1_000_000;
/** Lowercase words joined by dashes: what QUIZ_ITEMS ids look like. */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface LearnProgress {
	version: typeof LEARN_VERSION;
	items: Record<string, ItemProgress>;
	/** By lesson id. Optional: absent in progress saved before lessons existed. */
	lessons?: Record<string, LessonProgress>;
}

export function emptyLearn(): LearnProgress {
	return { version: LEARN_VERSION, items: {}, lessons: {} };
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

function coerceItem(raw: unknown, now: number): ItemProgress | null {
	if (!isRecord(raw)) return null;
	const boxRaw = finite(raw.box);
	const box = boxRaw === null ? BOX_MIN : Math.min(BOX_MAX, Math.max(BOX_MIN, Math.round(boxRaw)));
	// Due can't be later than its box allows from now: a date years ahead (a
	// clock that was wrong, a hand edit) would otherwise hide the item forever.
	const dueRaw = finite(raw.due);
	const latest = now + BOX_DAYS[box - 1] * DAY_MS;
	const due = dueRaw === null ? now : Math.min(Math.max(0, dueRaw), latest);
	const seenRaw = finite(raw.seen);
	const seen = seenRaw === null ? 0 : Math.min(MAX_SEEN, Math.max(0, Math.floor(seenRaw)));
	const lastRaw = finite(raw.last);
	const last = lastRaw === null ? 0 : Math.min(Math.max(0, lastRaw), now);
	return { box, due, seen, last };
}

function coerceLesson(raw: unknown, now: number): LessonProgress | null {
	if (!isRecord(raw)) return null;
	const stepRaw = finite(raw.step);
	const step = stepRaw === null ? 0 : Math.min(MAX_STEP, Math.max(0, Math.floor(stepRaw)));
	// Finished in the future (a wrong clock, a hand edit) reads as finished now.
	const doneRaw = finite(raw.done);
	const done = doneRaw === null ? 0 : Math.min(Math.max(0, doneRaw), now);
	return { step, done };
}

/**
 * Coerce one id → record map. Known ids are read first, so a flood of unknown
 * ids can't push real progress past the cap; unknown but well-formed ids are
 * kept (a newer version's items survive a trip through an older one).
 */
function coerceRecords<T>(
	src: Record<string, unknown>,
	knownIds: string[],
	cap: number,
	coerce: (raw: unknown) => T | null
): Record<string, T> {
	const out: Record<string, T> = {};
	const own = (id: string) => Object.prototype.hasOwnProperty.call(src, id);
	const known = knownIds.filter(own);
	const knownSet = new Set(known);
	const others = Object.keys(src).filter((id) => !knownSet.has(id) && ID_RE.test(id));
	let count = 0;
	for (const id of [...known, ...others]) {
		if (count >= cap) break;
		const value = coerce(src[id]);
		if (!value) continue;
		out[id] = value;
		count++;
	}
	return out;
}

/** Coerce anything into valid progress. Items and lessons are read independently. */
export function migrateLearn(raw: unknown, now: number = Date.now()): LearnProgress {
	const out = emptyLearn();
	if (!isRecord(raw)) return out;
	if (isRecord(raw.items)) {
		const ids = QUIZ_ITEMS.map((item) => item.id);
		out.items = coerceRecords(raw.items, ids, MAX_ITEMS, (v) => coerceItem(v, now));
	}
	if (isRecord(raw.lessons)) {
		const ids = LESSONS.map((lesson) => lesson.id);
		out.lessons = coerceRecords(raw.lessons, ids, MAX_LESSONS, (v) => coerceLesson(v, now));
	}
	return out;
}

/**
 * The stored progress, or empty. A corrupt entry is removed, never fatal, and
 * a repaired one (a date clamped from a wrong clock) is stored repaired, so the
 * clamp is made once and sticks instead of moving with every launch.
 */
export function readLearn(storage: DraftStorage, now: number = Date.now()): LearnProgress {
	let raw: string | null;
	try {
		raw = storage.getItem(LEARN_KEY);
	} catch {
		return emptyLearn(); // storage blocked (privacy mode)
	}
	if (!raw) return emptyLearn();
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) throw new Error('not progress');
		const progress = migrateLearn(parsed, now);
		const repaired = JSON.stringify(progress);
		if (repaired !== raw) {
			try {
				storage.setItem(LEARN_KEY, repaired);
			} catch {
				/* full or blocked: the repair is made again next time */
			}
		}
		return progress;
	} catch {
		try {
			storage.removeItem(LEARN_KEY);
		} catch {
			/* nothing more to do */
		}
		return emptyLearn();
	}
}

/** Store the progress. False when storage is unavailable or full — never throws. */
export function writeLearn(storage: DraftStorage, progress: LearnProgress): boolean {
	try {
		storage.setItem(LEARN_KEY, JSON.stringify(progress));
		return true;
	} catch {
		return false;
	}
}

// ---- backup ------------------------------------------------------------------

/** No item and no lesson: nothing to back up, nothing an import brought. */
export function isEmptyLearn(progress: LearnProgress): boolean {
	return Object.keys(progress.items).length === 0 && Object.keys(progress.lessons ?? {}).length === 0;
}

/**
 * Two devices' progress as one. Both must already be migrated (migrateLearn);
 * ids that don't look like ids are left out either way.
 * - An item: the record answered more recently (`last`) wins; a tie keeps a's.
 * - A lesson: finished if either finished it (the later date), at the furthest
 *   step either reached.
 */
export function mergeLearn(a: LearnProgress, b: LearnProgress): LearnProgress {
	const out = emptyLearn();
	const ids = (x: Record<string, unknown>) => Object.keys(x).filter((id) => ID_RE.test(id));
	for (const id of new Set([...ids(a.items), ...ids(b.items)])) {
		const x = Object.prototype.hasOwnProperty.call(a.items, id) ? a.items[id] : undefined;
		const y = Object.prototype.hasOwnProperty.call(b.items, id) ? b.items[id] : undefined;
		out.items[id] = !x ? y! : !y ? x : y.last > x.last ? y : x;
	}
	const la = a.lessons ?? {};
	const lb = b.lessons ?? {};
	for (const id of new Set([...ids(la), ...ids(lb)])) {
		const x = Object.prototype.hasOwnProperty.call(la, id) ? la[id] : undefined;
		const y = Object.prototype.hasOwnProperty.call(lb, id) ? lb[id] : undefined;
		out.lessons![id] =
			x && y ? { step: Math.max(x.step, y.step), done: Math.max(x.done, y.done) } : (x ?? y)!;
	}
	return out;
}

/** A backup's `learn` field, whatever it holds, as valid progress (empty for garbage). */
export function extractLearn(raw: unknown, now: number = Date.now()): LearnProgress {
	return migrateLearn(raw, now);
}

/** What a backup carries: the stored progress, or null when there is none (the key is then omitted). */
export function learnForBackup(storage: DraftStorage, now: number = Date.now()): LearnProgress | null {
	const progress = readLearn(storage, now);
	return isEmptyLearn(progress) ? null : progress;
}

/** What an import brought: how many exercises and lessons the backup held. */
export interface LearnImport {
	items: number;
	lessons: number;
}

/**
 * Merge a backup's `learn` field into the stored progress — never replacing
 * it. Null when the backup brought nothing usable (absent, empty, garbage) or
 * the merged progress could not be stored; nothing is written then.
 */
export function importLearn(storage: DraftStorage, raw: unknown, now: number = Date.now()): LearnImport | null {
	const incoming = extractLearn(raw, now);
	if (isEmptyLearn(incoming)) return null;
	// Through the gate again: a merge of two capped sets can exceed the cap.
	const merged = migrateLearn(mergeLearn(readLearn(storage, now), incoming), now);
	if (!writeLearn(storage, merged)) return null;
	return { items: Object.keys(incoming.items).length, lessons: Object.keys(incoming.lessons ?? {}).length };
}
