// Fitting a generated phrase into the player's range.
//
// THE INVARIANT: every adjustment here moves MIDI by a whole multiple of 12.
// A DrillNote carries both a spelling and a midi, and they must always agree —
// shifting by anything else desynchronises them and voicedToVexKey silently
// falls back to the flats-only spelling. One assertion in range.test.ts covers
// that entire failure class.
//
// Ranges are in WRITTEN pitch, because a playable range is a property of the
// instrument in the player's hands: a trumpet's low F#3 is a written F#3.

import { Note } from 'tonal';
import type { RangeFailure, Register, WrittenRange } from './types';

/**
 * Written ranges for the pitch modes Vamp offers, plus a couple of common
 * neighbours. Practice approximations tuned for comfortable drilling — not
 * orchestration specs, and deliberately short of the extremes.
 */
export const INSTRUMENT_RANGES: { id: string; label: string; min: string; max: string }[] = [
	{ id: 'trumpet', label: 'Trumpet', min: 'F#3', max: 'C6' },
	{ id: 'alto', label: 'Alto sax', min: 'Bb3', max: 'F6' },
	{ id: 'tenor', label: 'Tenor sax', min: 'Bb3', max: 'F6' },
	{ id: 'horn', label: 'F horn', min: 'C3', max: 'F5' },
	{ id: 'flute', label: 'Flute', min: 'C4', max: 'C7' },
	{ id: 'voice', label: 'Voice (low)', min: 'F2', max: 'F4' },
	{ id: 'keys', label: 'Keyboard', min: 'C2', max: 'C7' }
];

export const DEFAULT_RANGE_ID = 'trumpet';

/** Resolve a preset id to MIDI bounds, falling back to the default. */
export function rangeFor(id: string): WrittenRange {
	const preset = INSTRUMENT_RANGES.find((r) => r.id === id) ?? INSTRUMENT_RANGES[0];
	return { min: Note.midi(preset.min) ?? 54, max: Note.midi(preset.max) ?? 84 };
}

export type FitResult =
	| { fit: true; shift: number; midis: number[] }
	| { fit: false; reason: RangeFailure };

/** Where in the range a register aims: a quarter in, the middle, three quarters in. */
function targetFor(range: WrittenRange, register: Register): number {
	const width = range.max - range.min;
	const at = register === 'low' ? 0.25 : register === 'high' ? 0.75 : 0.5;
	return range.min + width * at;
}

/**
 * Shift a phrase by whole octaves so it sits in range, as near the register
 * target as possible. Returns a failure instead of mangling pitches: a truncated
 * or clamped pattern teaches the wrong shape, so the caller skips that key and
 * tells the player why.
 */
export function fitOctave(
	midis: number[],
	range: WrittenRange,
	register: Register
): FitResult {
	if (midis.length === 0) return { fit: true, shift: 0, midis };
	const lo = Math.min(...midis);
	const hi = Math.max(...midis);
	if (hi - lo > range.max - range.min) return { fit: false, reason: 'span' };

	const target = targetFor(range, register);
	const centroid = midis.reduce((a, b) => a + b, 0) / midis.length;
	let best: { shift: number; distance: number } | null = null;
	for (let shift = -6; shift <= 6; shift++) {
		if (lo + 12 * shift < range.min || hi + 12 * shift > range.max) continue;
		const distance = Math.abs(centroid + 12 * shift - target);
		// Ties go to the smaller shift, so the result is stable and predictable.
		if (!best || distance < best.distance || (distance === best.distance && Math.abs(shift) < Math.abs(best.shift)))
			best = { shift, distance };
	}
	// Fits by width, but no 12-aligned window lands inside — reachable whenever
	// (range width - phrase span) < 12.
	if (!best) return { fit: false, reason: 'octave' };
	return { fit: true, shift: best.shift, midis: midis.map((m) => m + 12 * best.shift) };
}

/**
 * Fold a single note into the range by octaves — `nearestMidi`'s rule
 * (audio/voicing.ts) with the bounds parameterised rather than hardcoded 36–88.
 * Never clamps: a clamp changes the pitch class (that module's comment explains
 * why) and here it would also break the name/midi pairing.
 */
export function foldIntoRange(midi: number, range: WrittenRange): number {
	let m = midi;
	while (m < range.min) m += 12;
	while (m > range.max) m -= 12;
	return m;
}
