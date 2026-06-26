// Tempo / time-signature math.
//
// Convention: tempo (BPM) counts *quarter notes* per minute (the usual DAW
// convention). Slot durations in the model are counted in the time signature's
// beat unit (the denominator), so we convert to quarter notes for the audio
// clock, which keeps scheduling correct for non-4/4 signatures.

import type { Bar, Progression, TimeSignature } from './types';

/** Beats in one bar (the time signature numerator). */
export function barBeats(ts: TimeSignature): number {
	return ts.numerator;
}

/** Convert a duration in model beats to quarter notes. */
export function beatsToQuarters(beats: number, ts: TimeSignature): number {
	return (beats * 4) / ts.denominator;
}

/** Seconds for one model beat at a given tempo. */
export function secondsPerBeat(tempo: number, ts: TimeSignature): number {
	return (60 / tempo) * (4 / ts.denominator);
}

/** Total beats across a list of bars. */
export function totalBeats(bars: Bar[]): number {
	let sum = 0;
	for (const bar of bars) for (const slot of bar.slots) sum += slot.beats;
	return sum;
}

/** Sum of a single bar's slot beats. */
export function filledBeats(bar: Bar): number {
	return bar.slots.reduce((s, slot) => s + slot.beats, 0);
}

/**
 * Resolve the loop's bar range as clamped indices. Falls back to the whole
 * progression when no range is set or the progression is empty.
 */
export function resolveLoopRange(progression: Progression): { start: number; end: number } {
	const n = progression.bars.length;
	if (n === 0) return { start: 0, end: 0 };
	const { loopRange } = progression;
	if (!loopRange) return { start: 0, end: n - 1 };
	const start = Math.max(0, Math.min(loopRange.startBar, n - 1));
	const end = Math.max(start, Math.min(loopRange.endBar, n - 1));
	return { start, end };
}

/**
 * Resolve which bars the loop covers. Returns the contiguous slice given by
 * `loopRange`, or all bars when no range is set / the range is invalid.
 */
export function loopBars(progression: Progression): Bar[] {
	const { start, end } = resolveLoopRange(progression);
	return progression.bars.slice(start, end + 1);
}
