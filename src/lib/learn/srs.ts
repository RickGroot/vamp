// Spaced review: a light Leitner schedule per quiz item. Spacing is well
// established outside music and unproven inside it (docs/learning-research.md
// §6), so this is a reasonable bet kept deliberately simple.
//
// - Five boxes. A new item starts in box 1, due now.
// - A right answer moves it up one box, but ONLY when it was due: practising
//   early is fine, it just doesn't count as spacing.
// - A wrong answer drops it to box 1, whatever box it was in.
// - Box n comes back after BOX_DAYS[n - 1] days.
//
// Phase 1 records results only; building a review session from what is due
// comes with the Review mode (Phase 4). Finishing a lesson (Phase 3) enrols the
// exercises it taught. Time is injected, never read here.
//
// Pure.

export const BOX_MIN = 1;
export const BOX_MAX = 5;
/** Days until an item in box 1…5 is due again. */
export const BOX_DAYS = [1, 2, 4, 8, 16] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ItemProgress {
	/** Leitner box, 1–5. */
	box: number;
	/** When it is next due (epoch ms). */
	due: number;
	/** Questions answered for this item. */
	seen: number;
	/** When it was last answered (epoch ms), 0 for never. */
	last: number;
}

export function newProgress(now: number): ItemProgress {
	return { box: BOX_MIN, due: now, seen: 0, last: 0 };
}

export function isDue(progress: ItemProgress, now: number): boolean {
	return now >= progress.due;
}

/** The progress after one answer. `prev` undefined = the item's first answer. */
export function recordResult(prev: ItemProgress | undefined, correct: boolean, now: number): ItemProgress {
	const p = prev ?? newProgress(now);
	const due = isDue(p, now);
	let box = p.box;
	if (!correct) box = BOX_MIN;
	else if (due) box = Math.min(BOX_MAX, box + 1);
	// An early right answer leaves the schedule alone; anything else reschedules.
	const next = correct && !due ? p.due : now + BOX_DAYS[box - 1] * DAY_MS;
	return { box, due: next, seen: p.seen + 1, last: now };
}

/**
 * Put items into the schedule, in box 1 and due now: what finishing a lesson
 * does with the exercises it taught. An item that is already scheduled keeps
 * its place — a lesson must never send what you know back to box 1.
 */
export function enrol(
	items: Record<string, ItemProgress>,
	itemIds: readonly string[],
	now: number
): Record<string, ItemProgress> {
	const out = { ...items };
	for (const id of itemIds) {
		if (Object.prototype.hasOwnProperty.call(out, id)) continue;
		// defineProperty, not assignment: an id of '__proto__' must stay a plain key.
		Object.defineProperty(out, id, { value: newProgress(now), enumerable: true, writable: true, configurable: true });
	}
	return out;
}
