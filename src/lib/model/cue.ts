// "Now → next" for the music stand: the chord sounding and the next CHANGE.
//
// Next is the next different chord, not the next slot — "C | C | G" on bar 1
// should say G, because that's the thing you need to see coming. Wraps round
// the loop, since the loop is what repeats. Pure; keyed on the same global slot
// index as the engine highlight (flattenSlots).

import type { FlatSlot } from './slots';

export interface ChordCue {
	/** Concert-pitch symbol ('' = a rest). */
	chord: string;
	barIndex: number;
	globalIndex: number;
}

export interface StandCue {
	now: ChordCue | null;
	next: ChordCue | null;
	/** Bars from now's bar to next's (0 = later in the same bar). */
	barsAway: number;
}

const cueOf = (f: FlatSlot): ChordCue => ({
	chord: f.slot.chord.trim(),
	barIndex: f.barIndex,
	globalIndex: f.globalIndex
});

/**
 * What's sounding and what's coming, within the loop range. Stopped (or the
 * highlight isn't in the loop) → "now" is the loop's first slot, so the stand
 * shows where you'll start.
 */
export function standCue(flat: FlatSlot[], range: { start: number; end: number }, active: number | null): StandCue {
	const loop = flat.filter((f) => f.barIndex >= range.start && f.barIndex <= range.end);
	if (loop.length === 0) return { now: null, next: null, barsAway: 0 };
	const at = active === null ? -1 : loop.findIndex((f) => f.globalIndex === active);
	const i = at >= 0 ? at : 0;
	const now = cueOf(loop[i]);
	const bars = range.end - range.start + 1;
	for (let step = 1; step < loop.length; step++) {
		const cand = cueOf(loop[(i + step) % loop.length]);
		if (cand.chord !== '' && cand.chord !== now.chord) {
			const barsAway = (((cand.barIndex - now.barIndex) % bars) + bars) % bars;
			return { now, next: cand, barsAway };
		}
	}
	return { now, next: null, barsAway: 0 };
}
