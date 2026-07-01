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

	async refresh(): Promise<void> {
		this.items = await listProgressions();
		this.loaded = true;
	}

	async save(progression: Progression): Promise<void> {
		await saveProgression(progression);
		await this.refresh();
	}

	async remove(id: string): Promise<void> {
		await deleteProgression(id);
		await this.refresh();
	}

	/** Import pasted or uploaded JSON; returns the progressions added. */
	async import(text: string): Promise<Progression[]> {
		const imported = await importProgressions(text);
		await this.refresh();
		return imported;
	}
}

export const library = new LibraryStore();
