// Flatten a progression's bars into a single ordered list of slots with stable
// global indices. Both the playback engine (active-slot highlight) and the UI
// rely on the same global index, so this is the one source of that mapping.

import type { Bar, Slot } from './types';

export interface FlatSlot {
	slot: Slot;
	barIndex: number;
	indexInBar: number;
	/** Position across the whole progression, 0-based. */
	globalIndex: number;
}

export function flattenSlots(bars: Bar[]): FlatSlot[] {
	const out: FlatSlot[] = [];
	let globalIndex = 0;
	bars.forEach((bar, barIndex) => {
		bar.slots.forEach((slot, indexInBar) => {
			out.push({ slot, barIndex, indexInBar, globalIndex: globalIndex++ });
		});
	});
	return out;
}
