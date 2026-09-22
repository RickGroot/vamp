// The saved-drills library: a reactive mirror of IndexedDB, refreshed after
// every mutating operation. Same shape and same fire-and-forget error handling
// as stores/library.svelte.ts — a storage failure lands in `error` rather than
// becoming an unhandled rejection.

import { deleteDrill, listDrills, saveDrill } from '$lib/storage/drillDb';
import type { DrillDefinition } from '$lib/practice/types';

class DrillLibraryStore {
	items = $state<DrillDefinition[]>([]);
	loaded = $state(false);
	/** Last storage failure, for the UI (IndexedDB can be unavailable). */
	error = $state<string | null>(null);

	async refresh(): Promise<void> {
		try {
			this.items = await listDrills();
			this.error = null;
		} catch {
			this.error = 'Saved drills are unavailable (storage error).';
		} finally {
			this.loaded = true;
		}
	}

	/** Returns the stored drill (with its timestamps), or null on failure. */
	async save(drill: DrillDefinition): Promise<DrillDefinition | null> {
		let stored: DrillDefinition;
		try {
			stored = await saveDrill(drill);
		} catch {
			this.error = 'Could not save — storage is unavailable.';
			return null;
		}
		await this.refresh();
		return stored;
	}

	async remove(id: string): Promise<void> {
		try {
			await deleteDrill(id);
		} catch {
			this.error = 'Could not delete — storage is unavailable.';
			return;
		}
		await this.refresh();
	}

	byId(id: string): DrillDefinition | undefined {
		return this.items.find((d) => d.id === id);
	}
}

export const drillLibrary = new DrillLibraryStore();
