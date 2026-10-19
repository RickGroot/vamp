// The saved-progressions library: a reactive mirror of IndexedDB that the UI
// reads from, refreshed after every mutating operation.

import {
	deleteProgression,
	importProgressions,
	listProgressions,
	saveProgression
} from '$lib/storage/db';
import type { Progression } from '$lib/model/types';
import type { ImportSummary } from '$lib/storage/importSummary';
import { browser } from '$app/environment';
import { learnProgress } from './learnProgress.svelte';

/** localStorage, or null where merely touching it throws (some privacy modes). */
function safeStorage(): Storage | null {
	try {
		return browser ? localStorage : null;
	} catch {
		return null;
	}
}

class LibraryStore {
	items = $state<Progression[]>([]);
	loaded = $state(false);
	/** Last storage failure, for the UI — IndexedDB can be unavailable (private
	 *  browsing, quota) and callers fire-and-forget, so rejections must not vanish. */
	error = $state<string | null>(null);

	async refresh(): Promise<void> {
		try {
			this.items = await listProgressions();
			this.error = null;
		} catch {
			this.error = 'Saved songs are unavailable (storage error).';
		} finally {
			this.loaded = true;
		}
	}

	async save(progression: Progression): Promise<void> {
		try {
			await saveProgression(progression);
		} catch {
			this.error = 'Could not save — storage is unavailable.';
			return;
		}
		await this.refresh();
	}

	/** Delete by id. Resolves to the removed record (for an undo), or null when
	 *  nothing was removed. */
	async remove(id: string): Promise<Progression | null> {
		const record = this.items.find((p) => p.id === id);
		try {
			await deleteProgression(id);
		} catch {
			this.error = 'Could not delete — storage is unavailable.';
			return null;
		}
		await this.refresh();
		return record ? ($state.snapshot(record) as Progression) : null;
	}

	/** Put a just-deleted record back unchanged (same id, same timestamps). */
	async restore(record: Progression): Promise<void> {
		try {
			await saveProgression(record, { restore: true });
		} catch {
			this.error = 'Could not restore — storage is unavailable.';
			return;
		}
		await this.refresh();
	}

	/** Import pasted or uploaded JSON; returns what came in (importMessage words
	 *  it). Throws on bad input (the caller shows the message); storage errors
	 *  set `error` too. A backup's Learn progress is merged into `vamp:learn`, and
	 *  the progress store re-reads it so its next write can't undo the merge. */
	async import(text: string): Promise<ImportSummary> {
		const summary = await importProgressions(text, safeStorage());
		if (summary.learn) learnProgress.reload();
		await this.refresh();
		return summary;
	}
}

export const library = new LibraryStore();
