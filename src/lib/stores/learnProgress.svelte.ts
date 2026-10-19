// What you've learned in Learn: one Leitner record per quiz item, persisted in
// `vamp:learn` (storage/learn.ts). The learn store plays; this one remembers.
//
// Read once in the constructor (synchronous localStorage, so the Ear mode knows
// what is due on its first render) and written on every answer. Time is read
// here, at the edge; srs.ts and storage/learn.ts take it as an argument.

import { browser } from '$app/environment';
import { recordResult, type ItemProgress } from '$lib/learn/srs';
import { readLearn, writeLearn, LEARN_VERSION } from '$lib/storage/learn';

/** localStorage, or null where merely touching it throws (some privacy modes). */
function safeStorage(): Storage | null {
	try {
		return browser ? localStorage : null;
	} catch {
		return null;
	}
}

class LearnProgressStore {
	/** Raw: replaced whole on every answer, never mutated in place. */
	items = $state.raw<Record<string, ItemProgress>>({});

	constructor() {
		const storage = safeStorage();
		if (storage) this.items = readLearn(storage).items;
	}

	get(itemId: string): ItemProgress | undefined {
		return Object.prototype.hasOwnProperty.call(this.items, itemId) ? this.items[itemId] : undefined;
	}

	/** Record one answered question. */
	record(itemId: string, correct: boolean, now: number = Date.now()): void {
		this.items = { ...this.items, [itemId]: recordResult(this.get(itemId), correct, now) };
		const storage = safeStorage();
		if (storage) writeLearn(storage, { version: LEARN_VERSION, items: this.items });
	}
}

export const learnProgress = new LearnProgressStore();
