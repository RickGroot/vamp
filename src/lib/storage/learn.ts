// Learn progress: one Leitner record per quiz item, kept in localStorage under
// `vamp:learn`. Small (a few dozen items), read synchronously at start-up, so
// the Ear mode can say what is due on its first render — the draft.ts pattern.
//
// `migrateLearn` is THE coercion gate for it, the twin of migrateProgression
// and migrateDrill: every read goes through it, and it trusts nothing — ids
// are checked against a strict pattern (so `__proto__` and friends never become
// keys), boxes are clamped to 1–5, dates must be finite and inside the
// schedule, counters are bounded, and the number of items is capped.
//
// Pure apart from the storage it is handed (a DraftStorage, so tests pass a
// Map-backed fake). Never throws. Must NOT import stores.

import { QUIZ_ITEMS } from '$lib/learn/items';
import { BOX_DAYS, BOX_MAX, BOX_MIN, DAY_MS, type ItemProgress } from '$lib/learn/srs';
import type { DraftStorage } from './draft';

export const LEARN_KEY = 'vamp:learn';
export const LEARN_VERSION = 1;
/** Far more than the catalogue will ever hold; a cap, not a budget. */
export const MAX_ITEMS = 256;
const MAX_SEEN = 1_000_000;
/** Lowercase words joined by dashes: what QUIZ_ITEMS ids look like. */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface LearnProgress {
	version: typeof LEARN_VERSION;
	items: Record<string, ItemProgress>;
}

export function emptyLearn(): LearnProgress {
	return { version: LEARN_VERSION, items: {} };
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

/**
 * Coerce anything into valid progress. Known items are read first, so a flood
 * of unknown ids can't push real progress past the cap; unknown but well-formed
 * ids are kept (a newer version's items survive a trip through an older one).
 */
export function migrateLearn(raw: unknown, now: number = Date.now()): LearnProgress {
	const out = emptyLearn();
	if (!isRecord(raw) || !isRecord(raw.items)) return out;
	const src = raw.items;
	const own = (id: string) => Object.prototype.hasOwnProperty.call(src, id);
	const known = QUIZ_ITEMS.map((item) => item.id).filter(own);
	const knownSet = new Set(known);
	const others = Object.keys(src).filter((id) => !knownSet.has(id) && ID_RE.test(id));
	let count = 0;
	for (const id of [...known, ...others]) {
		if (count >= MAX_ITEMS) break;
		const item = coerceItem(src[id], now);
		if (!item) continue;
		out.items[id] = item;
		count++;
	}
	return out;
}

/** The stored progress, or empty. A corrupt entry is removed, never fatal. */
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
		return migrateLearn(parsed, now);
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
