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
// Phase 1 records results; finishing a lesson (Phase 3) enrols the exercises it
// taught; the Review mode (Phase 4) builds a session from what is due
// (buildSession): due items only, interleaved. Time and randomness are
// injected, never read here.
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

// ---- review sessions ---------------------------------------------------------

/** What a session needs to know about a catalogue item (QuizItem fits). */
export interface SessionItem {
	id: string;
	spec: { kind: string };
}

/** Questions a review session holds at most. */
export const SESSION_SIZE = 10;
/** Times one item may come up in a session, so a short queue still makes a session. */
export const MAX_PER_ITEM = 3;

const own = (record: Record<string, ItemProgress>, id: string): ItemProgress | undefined =>
	Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;

/**
 * When an item is really due. Every answer schedules it at most its box's
 * days after that answer, so a due date further ahead (a backup from a machine
 * whose clock was wrong, a hand edit) is clamped to `last` + the box's days —
 * an anchor that stays put, so the item comes back instead of never. An item
 * never answered is due now at the latest; a `last` in the future (that clock
 * again) can't push it past `now` + the box's days either.
 */
export function effectiveDue(progress: ItemProgress, now: number): number {
	const box = Math.min(BOX_MAX, Math.max(BOX_MIN, Math.round(progress.box) || BOX_MIN));
	const span = BOX_DAYS[box - 1] * DAY_MS;
	const anchored = progress.last > 0 ? progress.last + span : now;
	return Math.min(progress.due, anchored, now + span);
}

/**
 * The scheduled catalogue items, each with its effective due date, soonest
 * first. Ids the catalogue no longer knows are skipped, never deleted: the
 * progress record is left as it is.
 */
export function scheduled<T extends SessionItem>(
	progress: Record<string, ItemProgress>,
	items: readonly T[],
	now: number
): { item: T; due: number }[] {
	return items
		.flatMap((item) => {
			const p = own(progress, item.id);
			return p ? [{ item, due: effectiveDue(p, now) }] : [];
		})
		.sort((a, b) => a.due - b.due);
}

/** The items due now, most overdue first. */
export function dueItems<T extends SessionItem>(progress: Record<string, ItemProgress>, items: readonly T[], now: number): T[] {
	return scheduled(progress, items, now)
		.filter((s) => s.due <= now)
		.map((s) => s.item);
}

/**
 * A review session: the items due now, interleaved, at most `n` questions.
 *
 * - Only due items, most overdue first; when more are due than fit, the most
 *   overdue are taken.
 * - A short queue comes round again (up to MAX_PER_ITEM times each), so three
 *   due items still make a few minutes of practice.
 * - Never the same item twice in a row, and the kind changes whenever it can
 *   (a loop between two chord questions): interleaving beat blocked practice
 *   in the studies behind this (docs/learning-research.md §6). A repeat that
 *   can only follow itself is dropped.
 * - The order within each round comes from `rand`, so a seed always gives the
 *   same session.
 *
 * Nothing due → an empty session.
 */
export function buildSession<T extends SessionItem>(
	progress: Record<string, ItemProgress>,
	items: readonly T[],
	now: number,
	rand: () => number,
	n: number = SESSION_SIZE
): T[] {
	const size = Math.max(0, Math.floor(n));
	const due = dueItems(progress, items, now).slice(0, size);
	if (due.length === 0 || size === 0) return [];

	// Rounds of the due items, each round in its own shuffled order.
	const rounds = Math.min(MAX_PER_ITEM, Math.ceil(size / due.length));
	const slots: { item: T; round: number; order: number }[] = [];
	for (let round = 0; round < rounds; round++) {
		for (const item of due) slots.push({ item, round, order: rand() });
	}
	// Trimming to size keeps the earliest rounds: every due item comes up once
	// before any comes up again.
	slots.sort((a, b) => a.round - b.round || a.order - b.order);
	const pending = slots.slice(0, size);

	// Sequence it. Each step takes from the earliest round that still has an
	// item other than the last one asked, so every due item comes up before any
	// comes back. Within that round it prefers a different kind, and of those
	// the kind with the most questions left in the round (the classic way to
	// keep like from landing next to like); ties keep the shuffled order. Only
	// a repeat that would follow itself is left out.
	const out: T[] = [];
	while (pending.length > 0) {
		const prev = out[out.length - 1];
		const open = pending.filter((s) => !prev || s.item.id !== prev.id);
		if (open.length === 0) break;
		const round = Math.min(...open.map((s) => s.round));
		const inRound = open.filter((s) => s.round === round);
		const changing = inRound.filter((s) => !prev || s.item.spec.kind !== prev.spec.kind);
		const choices = changing.length > 0 ? changing : inRound;
		const left = (kind: string) => pending.filter((s) => s.round === round && s.item.spec.kind === kind).length;
		let pick = choices[0];
		for (const s of choices) if (left(s.item.spec.kind) > left(pick.item.spec.kind)) pick = s;
		pending.splice(pending.indexOf(pick), 1);
		out.push(pick.item);
	}
	return out;
}
