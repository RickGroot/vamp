// The music signal the nature art reads. Everything the art draws is a function
// of this — tempo, beat, the loop's position, the chord sounding — and nothing
// else: no free-running clock, so the art can't drift out of time with the band,
// and when the music stops the art has nothing to animate and holds still.
//
// Pure: no `tone`, no stores. The engine produces a MusicClock from its
// transport; the layout adds the chord from the progression store.

import type { ChordFamily } from '$lib/model/chords';

export interface MusicClock {
	/** The transport is running (something is audible or counting in). */
	playing: boolean;
	/** Position inside the loop, in quarter notes. Negative during a count-in. */
	quarters: number;
	/** Loop length in quarter notes (0 when stopped). */
	loopQuarters: number;
	quartersPerBar: number;
	/** Live tempo (quarter notes per minute). */
	bpm: number;
	/** Completed passes of the loop since the transport last started. */
	loops: number;
}

export const IDLE_CLOCK: MusicClock = {
	playing: false,
	quarters: 0,
	loopQuarters: 0,
	quartersPerBar: 4,
	bpm: 100,
	loops: 0
};

/**
 * How hard a chord pulls toward resolution, 0..1 — the wind's strength, the
 * height of the weather. Dominant and diminished want to move; a tonic major is
 * at rest. A felt ordering, not a theory claim.
 */
export const TENSION: Record<ChordFamily, number> = {
	major: 0.2,
	minor: 0.45,
	suspended: 0.5,
	other: 0.3,
	augmented: 0.8,
	dominant: 0.95,
	diminished: 1
};

/** Position in beats (of the meter's beat unit). Never negative. */
export function beatPosition(clock: MusicClock, quartersPerBeat: number): number {
	if (!clock.playing || quartersPerBeat <= 0) return 0;
	return Math.max(0, clock.quarters) / quartersPerBeat;
}

/** 0 at each beat's attack, rising to 1 just before the next. */
export function beatPhase(clock: MusicClock, quartersPerBeat: number): number {
	const pos = beatPosition(clock, quartersPerBeat);
	return pos - Math.floor(pos);
}

/** How far through the loop, 0..1 (0 when stopped or counting in). */
export function loopFraction(clock: MusicClock): number {
	if (!clock.playing || clock.loopQuarters <= 0 || clock.quarters < 0) return 0;
	const f = clock.quarters / clock.loopQuarters;
	return f - Math.floor(f);
}

/**
 * A punchy envelope that peaks on the beat and decays before the next — for a
 * breath on the downbeat. `sharp` > 1 tightens it.
 */
export function beatPulse(phase: number, sharp = 3): number {
	const p = Math.min(1, Math.max(0, phase));
	return Math.pow(1 - p, sharp);
}
