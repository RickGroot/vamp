// The saved-progressions library: a reactive mirror of IndexedDB that the UI
// reads from, refreshed after every mutating operation.

import {
	deleteProgression,
	importProgressions,
	listProgressions,
	saveProgression
} from '$lib/storage/db';
import type { Progression } from '$lib/model/types';

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

	async remove(id: string): Promise<void> {
		try {
			await deleteProgression(id);
		} catch {
			this.error = 'Could not delete — storage is unavailable.';
			return;
		}
		await this.refresh();
	}

	/** Import pasted or uploaded JSON; returns the progressions added. Throws on
	 *  bad input (the caller shows the message); storage errors set `error` too. */
	async import(text: string): Promise<Progression[]> {
		const imported = await importProgressions(text);
		await this.refresh();
		return imported;
	}
}

export const library = new LibraryStore();
