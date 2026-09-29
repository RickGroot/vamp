// The working-copy draft: whatever is on the canvas, autosaved, so reopening
// Vamp — a reload, a closed tab, a relaunched PWA — puts you back where you were.
//
// This is not the library. The library (db.ts) holds songs you chose to save;
// the draft is the one you are working on right now, saved or not. It keeps the
// song's `id`, so a draft that started as a saved song still overwrites that
// library entry on Ctrl+S.
//
// localStorage rather than IndexedDB on purpose: it is synchronous, so the draft
// is on the canvas before the first render — no flash of an empty sketch. One
// song is a few KB, far inside the quota.
//
// Pure apart from the storage it is handed (a Storage-shaped object, so tests
// pass a Map-backed fake). Must NOT import stores (the storage layer never does).

import type { Progression } from '$lib/model/types';
import { migrateProgression } from './db';

export const DRAFT_KEY = 'vamp:draft';

/** The slice of the Web Storage API this needs. */
export interface DraftStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * The restored draft, or null if there is none. Routed through
 * `migrateProgression` like every other read — a draft is persisted data, and a
 * stale or hand-edited one with `beats: 0` would otherwise corrupt the schedule.
 */
export function readDraft(storage: DraftStorage): Progression | null {
	let raw: string | null;
	try {
		raw = storage.getItem(DRAFT_KEY);
	} catch {
		return null; // storage blocked (privacy mode) — start clean
	}
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a song');
		return migrateProgression(parsed);
	} catch {
		// A corrupt draft must never stop the app opening. Drop it so the next
		// launch doesn't trip over the same thing.
		try {
			storage.removeItem(DRAFT_KEY);
		} catch {
			/* nothing more to do */
		}
		return null;
	}
}

/** Store the draft. False when storage is unavailable or full — never throws. */
export function writeDraft(storage: DraftStorage, progression: Progression): boolean {
	try {
		storage.setItem(DRAFT_KEY, JSON.stringify(progression));
		return true;
	} catch {
		return false;
	}
}

/** True when a song has no chords at all — nothing anyone would miss. */
export function isBlank(progression: Progression): boolean {
	return progression.bars.every((bar) => bar.slots.every((slot) => !slot.chord.trim()));
}
