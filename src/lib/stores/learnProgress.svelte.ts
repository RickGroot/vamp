// What you've learned in Learn: one Leitner record per quiz item, and where you
// are in each lesson, persisted in `vamp:learn` (storage/learn.ts). The learn
// store plays; this one remembers.
//
// Read once in the constructor (synchronous localStorage, so the Ear mode knows
// what is due on its first render) and written on every change. Time is read
// here, at the edge; srs.ts and storage/learn.ts take it as an argument.

import { browser } from '$app/environment';
import type { LessonProgress } from '$lib/learn/curriculum';
import { enrol, recordResult, type ItemProgress } from '$lib/learn/srs';
import { readLearn, writeLearn, LEARN_VERSION, MAX_STEP } from '$lib/storage/learn';

/** localStorage, or null where merely touching it throws (some privacy modes). */
function safeStorage(): Storage | null {
	try {
		return browser ? localStorage : null;
	} catch {
		return null;
	}
}

const own = <T>(record: Record<string, T>, id: string): T | undefined =>
	Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;

class LearnProgressStore {
	/** Raw: replaced whole on every answer, never mutated in place. */
	items = $state.raw<Record<string, ItemProgress>>({});
	/** Raw, like items: by lesson id. */
	lessons = $state.raw<Record<string, LessonProgress>>({});

	constructor() {
		this.reload();
	}

	/** Re-read what is stored: after an import merged a backup's progress into it. */
	reload(): void {
		const storage = safeStorage();
		if (!storage) return;
		const stored = readLearn(storage);
		this.items = stored.items;
		this.lessons = stored.lessons ?? {};
	}

	get(itemId: string): ItemProgress | undefined {
		return own(this.items, itemId);
	}

	lesson(lessonId: string): LessonProgress | undefined {
		return own(this.lessons, lessonId);
	}

	/** Record one answered question. */
	record(itemId: string, correct: boolean, now: number = Date.now()): void {
		this.items = { ...this.items, [itemId]: recordResult(this.get(itemId), correct, now) };
		this.save();
	}

	/** Put items into review (box 1, due now); ones already scheduled keep their place. */
	enrol(itemIds: readonly string[], now: number = Date.now()): void {
		this.items = enrol(this.items, itemIds, now);
		this.save();
	}

	/**
	 * Remember the step you're on in a lesson, so the map can say so and the
	 * lesson reopens there. Finishing it is kept.
	 */
	visitLesson(lessonId: string, step: number): void {
		const prev = this.lesson(lessonId);
		const at = Math.min(MAX_STEP, Math.max(0, Math.floor(step)));
		if (prev?.step === at) return;
		this.lessons = { ...this.lessons, [lessonId]: { step: at, done: prev?.done ?? 0 } };
		this.save();
	}

	/** Finish a lesson: it is done, and the exercises it taught go into review. */
	completeLesson(lessonId: string, itemIds: readonly string[], now: number = Date.now()): void {
		const prev = this.lesson(lessonId);
		this.lessons = { ...this.lessons, [lessonId]: { step: prev?.step ?? 0, done: now } };
		this.enrol(itemIds, now); // saves both
	}

	private save(): void {
		const storage = safeStorage();
		if (storage) writeLearn(storage, { version: LEARN_VERSION, items: this.items, lessons: this.lessons });
	}
}

export const learnProgress = new LearnProgressStore();
