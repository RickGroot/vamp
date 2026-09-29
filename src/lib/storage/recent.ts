// Recent sketches: the last few songs that were on your canvas, saved or not,
// so a blank canvas can offer them back ("pick up where you left off").
//
// A song is remembered at the moment it would otherwise be lost — when
// something replaces it on the canvas (New, an example, an import, a shared
// link). The draft covers reloads; this covers "I pressed New and wish I
// hadn't", across sessions, without you having to save first.
//
// Newest first, one entry per song id (a song you reopen and replace again
// moves back to the top), capped at RECENT_LIMIT. Blank songs are never kept.
// Pure apart from the storage it is handed; must NOT import stores.

import type { Progression } from '$lib/model/types';
import { migrateProgression } from './db';
import { isBlank, type DraftStorage } from './draft';

export const RECENT_KEY = 'vamp:recent';
export const RECENT_LIMIT = 5;

export interface RecentSketch {
	song: Progression;
	/** When it left the canvas (ms since epoch). */
	at: number;
}

/** The remembered sketches, newest first. Corrupt entries are dropped, never thrown. */
export function readRecent(storage: DraftStorage): RecentSketch[] {
	let raw: string | null;
	try {
		raw = storage.getItem(RECENT_KEY);
	} catch {
		return [];
	}
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		try {
			storage.removeItem(RECENT_KEY);
		} catch {
			/* nothing more to do */
		}
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const out: RecentSketch[] = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object' || !('song' in entry)) continue;
		const song = (entry as { song: unknown }).song;
		if (!song || typeof song !== 'object' || Array.isArray(song)) continue;
		// Every read of a persisted song goes through the one coercion gate.
		const safe = migrateProgression(song);
		if (isBlank(safe)) continue;
		const at = Number((entry as { at?: unknown }).at);
		out.push({ song: safe, at: Number.isFinite(at) ? at : 0 });
		if (out.length === RECENT_LIMIT) break;
	}
	return out;
}

/**
 * Remember a song that's leaving the canvas. Blank songs are ignored. Returns
 * the new list. Never throws; a full or blocked storage simply isn't written.
 */
export function rememberSketch(storage: DraftStorage, song: Progression, at = Date.now()): RecentSketch[] {
	const current = readRecent(storage);
	if (isBlank(song)) return current;
	const next = [{ song, at }, ...current.filter((r) => r.song.id !== song.id)].slice(0, RECENT_LIMIT);
	try {
		storage.setItem(RECENT_KEY, JSON.stringify(next));
	} catch {
		return current;
	}
	return next;
}

/** Forget one sketch (you dismissed it from the start screen). */
export function forgetSketch(storage: DraftStorage, id: string): RecentSketch[] {
	const next = readRecent(storage).filter((r) => r.song.id !== id);
	try {
		storage.setItem(RECENT_KEY, JSON.stringify(next));
	} catch {
		/* keep what we have */
	}
	return next;
}

/** The first few chord changes, for a one-line preview ("Dm7 · G7 · Cmaj7 …"). */
export function chordPreview(song: Progression, max = 4): string {
	const changes: string[] = [];
	for (const bar of song.bars) {
		for (const slot of bar.slots) {
			const chord = slot.chord.trim();
			if (chord && chord !== changes[changes.length - 1]) changes.push(chord);
			if (changes.length > max) return changes.slice(0, max).join(' · ') + ' …';
		}
	}
	return changes.join(' · ');
}
